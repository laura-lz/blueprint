"use client";

import React, { useState, useEffect, useMemo } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    MarkerType,
    Handle,
    Position,
    Controls,
    Background,
    MiniMap,
    Node,
    Edge,
    NodeProps,
    Panel
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

// --- TYPES ---
interface CapsuleFile {
    relativePath: string;
    name: string;
    lang: string;
    exports: { name: string; kind: string }[];
    imports: { pathOrModule: string; isLocal: boolean }[];
    summaryContext?: {
        usedBy: string[];
        dependsOn: string[];
        fileDocstring?: string;
        functionSignatures?: { name: string; signature: string }[];
    };
    summary?: string;
}

interface CapsulesData {
    stats: {
        totalFiles: number;
        totalDirectories: number;
        totalEdges: number;
    };
    files: Record<string, CapsuleFile>;
    directories?: Record<string, { summary?: string }>;
}

interface FileNodeData {
    label: string;
    lang: string;
    summary?: string;
    exports: string[];
    isDirectory?: boolean;
    isRoot?: boolean;
    fileCount?: number;
    depth?: number;
}

type FileNode = Node<FileNodeData>;

// --- LANG COLORS ---
const langColors: Record<string, { bg: string; border: string; icon: string }> = {
    'react-typescript': { bg: '#1a365d', border: '#4299e1', icon: '⚛️' },
    'typescript': { bg: '#1e3a5f', border: '#3178c6', icon: '📘' },
    'javascript': { bg: '#3d3d00', border: '#f7df1e', icon: '📒' },
    'css': { bg: '#1a1a4e', border: '#264de4', icon: '🎨' },
    'json': { bg: '#1a1a1a', border: '#555', icon: '📄' },
    'markdown': { bg: '#1a2a1a', border: '#083fa1', icon: '📝' },
    'directory': { bg: '#2d1f3d', border: '#9f7aea', icon: '📁' },
    'root': { bg: '#1a3d1a', border: '#48bb78', icon: '🏠' },
    'other': { bg: '#1a1a1a', border: '#555', icon: '📄' },
};

// --- CUSTOM NODE COMPONENT ---
const CapsuleNode: React.FC<NodeProps<FileNodeData>> = ({ data }) => {
    const getColors = () => {
        if (data.isRoot) return langColors.root;
        if (data.isDirectory) return langColors.directory;
        return langColors[data.lang] || langColors.other;
    };

    const colors = getColors();
    const nodeWidth = data.isRoot ? 200 : data.isDirectory ? 180 : 200;

    return (
        <div style={{
            padding: data.isRoot ? '14px 18px' : '10px 14px',
            borderRadius: data.isDirectory || data.isRoot ? '12px' : '8px',
            background: colors.bg,
            color: '#fff',
            border: `2px solid ${colors.border}`,
            boxShadow: data.isRoot
                ? '0 8px 24px rgba(72, 187, 120, 0.3)'
                : '0 4px 12px rgba(0,0,0,0.4)',
            width: nodeWidth,
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px'
        }}>
            <Handle type="target" position={Position.Top} style={{ background: colors.border }} />

            <div style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: data.isRoot ? '14px' : '12px'
            }}>
                <span>{colors.icon}</span>
                <span style={{ wordBreak: 'break-word' }}>{data.label}</span>
            </div>

            {(data.isDirectory || data.isRoot) && data.fileCount !== undefined && (
                <div style={{ fontSize: '10px', opacity: 0.7 }}>
                    {data.fileCount} file{data.fileCount !== 1 ? 's' : ''}
                </div>
            )}

            {!data.isDirectory && !data.isRoot && data.lang && (
                <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '4px' }}>
                    {data.lang}
                </div>
            )}

            {data.summary && (
                <div style={{
                    fontSize: '10px',
                    opacity: 0.85,
                    marginTop: '6px',
                    padding: '6px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '4px',
                    lineHeight: '1.4',
                    maxHeight: '60px',
                    overflow: 'hidden'
                }}>
                    {data.summary.slice(0, 120)}{data.summary.length > 120 ? '...' : ''}
                </div>
            )}

            {data.exports && data.exports.length > 0 && (
                <div style={{ fontSize: '9px', marginTop: '6px', opacity: 0.6 }}>
                    ↗ {data.exports.slice(0, 2).join(', ')}{data.exports.length > 2 ? ` +${data.exports.length - 2}` : ''}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
        </div>
    );
};

// --- HIERARCHICAL LAYOUT ---
const createHierarchicalLayout = (data: CapsulesData) => {
    const nodes: FileNode[] = [];
    const edges: Edge[] = [];

    // Helper to track created directories to avoid duplicates
    const createdDirs = new Set<string>();

    // Create root node
    const rootId = 'root';
    const rootSummary = data.directories ? data.directories['.']?.summary : undefined;

    nodes.push({
        id: rootId,
        type: 'capsule',
        data: {
            label: 'Project Root',
            lang: 'root',
            isRoot: true,
            fileCount: Object.keys(data.files).length,
            exports: [],
            summary: rootSummary,
        },
        position: { x: 0, y: 0 }
    });

    Object.values(data.files).forEach(file => {
        const parts = file.relativePath.split('/');
        const fileName = parts.pop()!;
        const fileId = file.relativePath;

        // 1. Create directory path nodes
        let currentPath = '';
        let parentId = rootId;

        parts.forEach((part, index) => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const dirId = `dir-${currentPath}`;

            if (!createdDirs.has(currentPath)) {
                // Lookup summary if we have it (either from exact match or from stored directories)
                const dirCapsule = data.directories ? data.directories[currentPath] : undefined;

                nodes.push({
                    id: dirId,
                    type: 'capsule',
                    data: {
                        label: part + '/',
                        lang: 'directory',
                        isDirectory: true,
                        // We can't easily calculate recursive file count here without more logic, 
                        // effectively simplified to "files in this specific structure"
                        fileCount: 0,
                        exports: [],
                        summary: dirCapsule?.summary,
                        depth: index + 1
                    },
                    position: { x: 0, y: 0 }
                });

                edges.push({
                    id: `${parentId}->${dirId}`,
                    source: parentId,
                    target: dirId,
                    type: 'smoothstep',
                    style: { stroke: '#48bb78', strokeWidth: 2 },
                });

                createdDirs.add(currentPath);
            }

            parentId = dirId;
        });

        // 2. Create file node
        nodes.push({
            id: fileId,
            type: 'capsule',
            data: {
                label: file.name,
                lang: file.lang,
                summary: file.summary || file.summaryContext?.fileDocstring?.slice(0, 100),
                exports: file.exports.map(e => e.name),
                depth: parts.length + 1
            },
            position: { x: 0, y: 0 }
        });

        // 3. Connect file to its immediate parent
        edges.push({
            id: `${parentId}->${fileId}`,
            source: parentId,
            target: fileId,
            type: 'smoothstep',
            style: { stroke: '#555', strokeWidth: 1 },
        });
    });

    // Create dependency edges (from usedBy)
    Object.entries(data.files).forEach(([path, file]) => {
        if (file.summaryContext?.usedBy) {
            file.summaryContext.usedBy.forEach(usedByPath => {
                // Only add if both nodes exist
                if (nodes.find(n => n.id === usedByPath)) {
                    edges.push({
                        id: `dep-${usedByPath}->${path}`,
                        source: usedByPath,
                        target: path,
                        type: 'smoothstep',
                        animated: true,
                        style: { stroke: '#4299e1', strokeWidth: 1.5 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#4299e1', width: 12, height: 12 },
                    });
                }
            });
        }
    });

    return { nodes, edges };
};

// --- APPLY DAGRE LAYOUT ---
const applyDagreLayout = (nodes: FileNode[], edges: Edge[]) => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'TB',
        ranksep: 80,
        nodesep: 40,
        marginx: 50,
        marginy: 50
    });
    g.setDefaultEdgeLabel(() => ({}));

    nodes.forEach(node => {
        const width = node.data.isRoot ? 200 : node.data.isDirectory ? 180 : 200;
        const height = node.data.summary ? 130 : 80;
        g.setNode(node.id, { width, height });
    });

    // Only use structural edges for layout (not dependency edges)
    edges
        .filter(e => !e.id.startsWith('dep-'))
        .forEach(edge => g.setEdge(edge.source, edge.target));

    dagre.layout(g);

    const layoutedNodes = nodes.map(node => {
        const n = g.node(node.id);
        const width = node.data.isRoot ? 200 : node.data.isDirectory ? 180 : 200;
        return {
            ...node,
            position: {
                x: n.x - width / 2,
                y: n.y - 40
            }
        };
    });

    return { nodes: layoutedNodes, edges };
};

// --- MAIN COMPONENT ---
export default function Visualizer() {
    const [capsules, setCapsules] = useState<CapsulesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const nodeTypes = useMemo(() => ({ capsule: CapsuleNode }), []);

    // Load capsules.json on mount
    useEffect(() => {
        fetch('/capsules.json')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load capsules.json');
                return res.json() as Promise<CapsulesData>;
            })
            .then((data) => {
                setCapsules(data);
                const { nodes: rawNodes, edges: rawEdges } = createHierarchicalLayout(data);
                const { nodes: layoutedNodes, edges: layoutedEdges } = applyDagreLayout(rawNodes, rawEdges);
                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [setNodes, setEdges]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '18px'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                    Loading codebase visualization...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: '#0a0a0a',
                color: '#ff6b6b',
                gap: '16px'
            }}>
                <div style={{ fontSize: '48px' }}>⚠️</div>
                <div style={{ fontSize: '20px' }}>Error Loading Visualization</div>
                <div style={{ color: '#888' }}>{error}</div>
                <div style={{ color: '#666', fontSize: '14px', marginTop: '20px' }}>
                    Make sure <code style={{ background: '#222', padding: '2px 6px', borderRadius: '4px' }}>capsules.json</code> is in the <code style={{ background: '#222', padding: '2px 6px', borderRadius: '4px' }}>public/</code> directory
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    minZoom={0.1}
                    maxZoom={2}
                >
                    <Background color="#1a1a1a" gap={20} />
                    <Controls style={{ background: '#1a1a1a', borderRadius: '8px' }} />
                    <MiniMap
                        nodeColor={(node) => {
                            const data = node.data as FileNodeData;
                            if (data.isRoot) return langColors.root.border;
                            if (data.isDirectory) return langColors.directory.border;
                            return (langColors[data.lang] || langColors.other).border;
                        }}
                        maskColor="rgba(0, 0, 0, 0.85)"
                        style={{ background: '#1a1a1a', borderRadius: '8px' }}
                    />

                    {/* Title Panel */}
                    <Panel position="top-left" style={{
                        background: 'rgba(0,0,0,0.8)',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        color: '#fff',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                            📊 Codebase Visualization
                        </div>
                        <div style={{ fontSize: '12px', color: '#aaa' }}>
                            {capsules?.stats.totalFiles} files • {capsules?.stats.totalDirectories} directories • {capsules?.stats.totalEdges} dependencies
                        </div>
                    </Panel>

                    {/* Legend Panel */}
                    <Panel position="top-right" style={{
                        background: 'rgba(0,0,0,0.8)',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        color: '#aaa',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#fff' }}>Legend</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div><span style={{ color: langColors.root.border }}>●</span> Project Root</div>
                            <div><span style={{ color: langColors.directory.border }}>●</span> Directory</div>
                            <div><span style={{ color: langColors['react-typescript'].border }}>●</span> React Component</div>
                            <div><span style={{ color: langColors.typescript.border }}>●</span> TypeScript</div>
                            <div><span style={{ color: langColors.css.border }}>●</span> CSS</div>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                                <div style={{ color: '#4299e1' }}>→ Import dependency</div>
                            </div>
                        </div>
                    </Panel>
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}
