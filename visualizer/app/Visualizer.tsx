"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    MarkerType,
    Handle,
    Position,
    Controls,
    Background,
    Node,
    Edge,
    NodeProps,
    addEdge,
    Connection
} from 'reactflow';
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCollide,
    forceRadial
} from 'd3-force';
import 'reactflow/dist/style.css';

// --- TYPES ---
interface SymbolData {
    name: string;
    kind: string;
    location?: { start: { line: number } };
}

interface CapsuleFile {
    relativePath: string;
    name: string;
    lang: string;
    exports: { name: string; kind: string }[];
    imports: { pathOrModule: string; isLocal: boolean }[];
    topSymbols?: SymbolData[];
    summaryContext?: {
        usedBy: string[];
        dependsOn: string[];
        fileDocstring?: string;
        firstNLines?: string;
        functionSignatures?: { name: string; signature: string }[];
    };
    summary?: string;
    oneLiner?: string;
}

interface CapsulesData {
    stats: {
        totalFiles: number;
        totalDirectories: number;
        totalEdges: number;
        externalDependencies?: string[];
    };
    files: Record<string, CapsuleFile>;
}

interface FileNodeData {
    label: string;
    lang: string;
    summary?: string;
    oneLiner?: string;
    exports: string[];
    imports: string[];
    topSymbols?: SymbolData[];
    previewCode?: string;
    isDirectory?: boolean;
    isRoot?: boolean;
    fileCount?: number;
    depth?: number;
    isDimmed?: boolean;
    isHighlight?: boolean;
    trafficScore?: number;
    usedBy?: string[];
    dependsOn?: string[];
    onTraceImpact?: () => void;
    colorMode?: 'type' | 'heatmap';
    isSearching?: boolean;
    isGlobalConnecting?: boolean;
}

interface StickyNodeData {
    content: string;
    color: string;
    onChange: (text: string) => void;
    onDelete: () => void;
    isConnecting: boolean;
    onToggleConnect: () => void;
}

type FileNode = Node<FileNodeData>;
type StickyNode = Node<StickyNodeData>;

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

// --- COMPONENT: STICKY NOTE ---
const StickyNoteNode: React.FC<NodeProps<StickyNodeData>> = ({ data }) => {
    return (
        <div style={{
            background: data.color || '#fefcbf',
            borderRadius: '8px',
            width: '240px',
            boxShadow: data.isConnecting
                ? '0 0 0 4px #4299e1, 0 10px 20px rgba(0,0,0,0.2)'
                : '0 4px 6px rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />

            <div
                style={{
                    height: '32px',
                    background: 'rgba(0,0,0,0.05)',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0 8px',
                    alignItems: 'center',
                    borderTopLeftRadius: '8px',
                    borderTopRightRadius: '8px',
                    cursor: 'grab'
                }}
            >
                <button
                    className="nodrag"
                    onClick={(e) => { e.stopPropagation(); data.onToggleConnect(); }}
                    style={{
                        background: data.isConnecting ? '#4299e1' : 'rgba(0,0,0,0.1)',
                        color: data.isConnecting ? '#fff' : '#555',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    {data.isConnecting ? 'Done' : '🔗 Connect'}
                </button>

                <button
                    className="nodrag"
                    onClick={data.onDelete}
                    style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                >
                    ✕
                </button>
            </div>

            <textarea
                className="nodrag"
                value={data.content}
                onChange={(e) => data.onChange(e.target.value)}
                placeholder="Type here..."
                style={{
                    background: 'transparent',
                    border: 'none',
                    width: '100%',
                    minHeight: '140px',
                    padding: '16px',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: '#333',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit'
                }}
            />
        </div>
    );
};

// --- HEATMAP COLORS ---
const getHeatmapColor = (score: number = 0) => {
    const intensity = Math.min(score, 10) / 10;
    if (intensity < 0.3) return { bg: '#00264d', border: '#3182ce', icon: '❄️' };
    if (intensity < 0.7) return { bg: '#2d1f3d', border: '#805ad5', icon: '🔮' };
    return { bg: '#4d0026', border: '#d53f8c', icon: '🔥' };
};

// --- COMPONENT: CAPSULE FILE NODE ---
const CapsuleNode: React.FC<NodeProps<FileNodeData>> = ({ data }) => {
    const [expanded, setExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'summary' | 'structure' | 'code'>('summary');

    const displayLabel = (data.oneLiner && data.oneLiner.length < 50) ? data.oneLiner : data.label;

    const colors = useMemo(() => {
        if (data.isRoot) return langColors.root;
        if (data.isDirectory) return langColors.directory;
        if (data.colorMode === 'heatmap') return getHeatmapColor(data.trafficScore);
        return langColors[data.lang] || langColors.other;
    }, [data.isRoot, data.isDirectory, data.lang, data.colorMode, data.trafficScore]);

    const toggleExpand = (e: React.MouseEvent) => {
        if (data.isGlobalConnecting) return;
        e.stopPropagation();
        setExpanded(!expanded);
    };

    const handleScroll = (e: React.WheelEvent) => {
        e.stopPropagation();
    };

    const opacity = data.isDimmed ? 0.1 : 1;
    const borderStyle = data.isHighlight
        ? '3px solid #f6e05e'
        : `3px solid ${expanded ? '#fff' : colors.border}`;

    const boxShadow = data.isHighlight
        ? '0 0 30px rgba(246, 224, 94, 0.6)'
        : (expanded ? '0 40px 80px rgba(0,0,0,0.9)' : '0 8px 25px rgba(0,0,0,0.6)');

    return (
        <div
            onClick={toggleExpand}
            style={{
                opacity,
                padding: expanded ? '0' : '20px 24px',
                borderRadius: '24px',
                background: colors.bg,
                color: '#fff',
                border: borderStyle,
                boxShadow: boxShadow,
                width: 'fit-content',
                minWidth: expanded ? 600 : (data.isRoot ? 340 : 300),
                maxWidth: '800px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                cursor: data.isGlobalConnecting ? 'crosshair' : (expanded ? 'default' : 'pointer'),
                position: 'relative',
                zIndex: expanded ? 100000 : (data.isHighlight ? 5000 : 1000),
                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
        >
            <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />

            {!expanded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '42px', flexShrink: 0 }}>{colors.icon}</div>
                    <div>
                        <div style={{ fontWeight: '800', fontSize: '24px', lineHeight: '1.2', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                            {displayLabel}
                        </div>
                        {(data.isDirectory || data.isRoot) && (
                            <div style={{ fontSize: '16px', opacity: 0.7, fontWeight: '500' }}>{data.fileCount} items</div>
                        )}
                        {data.isHighlight && data.isSearching && (
                            <div style={{ color: '#f6e05e', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>MATCH FOUND</div>
                        )}
                    </div>
                </div>
            )}

            {expanded && (
                <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '24px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'grab' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ fontSize: '32px' }}>{colors.icon}</span>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '24px', wordBreak: 'break-word' }}>{data.label}</div>
                                {!data.isDirectory && !data.isRoot && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); data.onTraceImpact?.(); }}
                                        className="nodrag"
                                        style={{ marginTop: '8px', background: '#805ad5', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        ⚡ Trace Impact
                                    </button>
                                )}
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} className="nodrag" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '32px' }}>×</button>
                    </div>

                    <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)', cursor: 'grab' }}>
                        {['summary', 'structure', 'code'].map(tab => (
                            <button
                                key={tab}
                                onClick={(e) => { e.stopPropagation(); setActiveTab(tab as any); }}
                                className="nodrag"
                                style={{ flex: 1, padding: '16px', background: activeTab === tab ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: activeTab === tab ? '#fff' : '#888', borderBottom: activeTab === tab ? `4px solid ${colors.border}` : '4px solid transparent', cursor: 'pointer', fontSize: '16px', fontWeight: '700', textTransform: 'capitalize' }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="nodrag nowheel" onWheel={handleScroll} style={{ padding: '24px', maxHeight: '500px', overflowY: 'auto', background: '#0a0a0a', cursor: 'text' }}>
                        {activeTab === 'summary' && (
                            <div style={{ animation: 'fadeIn 0.2s' }}>
                                <div style={{ fontSize: '18px', lineHeight: '1.6', color: '#ddd', marginBottom: '24px' }}>
                                    {data.summary || "No summary available."}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '13px', color: '#666', textTransform: 'uppercase', marginBottom: '6px' }}>Type</div>
                                        <div style={{ fontSize: '16px', color: colors.border, fontWeight: 'bold' }}>{data.lang}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '13px', color: '#666', textTransform: 'uppercase', marginBottom: '6px' }}>Complexity</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{data.trafficScore || 0}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'structure' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {data.topSymbols?.map((sym, i) => (
                                    <div key={i} style={{ padding: '12px', background: '#1a1a1a', borderRadius: '8px', borderLeft: `5px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '16px', fontWeight: '600' }}>{sym.name}</span>
                                        <span style={{ fontSize: '12px', color: '#888' }}>{sym.kind}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeTab === 'code' && (
                            <pre style={{ margin: 0, padding: '20px', background: '#111', borderRadius: '12px', fontSize: '14px', fontFamily: 'monospace', color: '#ccc', overflowX: 'auto' }}>
                                {data.previewCode || "No preview"}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- DATA PREPARATION ---
const prepareGraphData = (data: CapsulesData) => {
    const nodes: FileNode[] = [];
    const edges: Edge[] = [];
    const filesByDir: Record<string, CapsuleFile[]> = { '.': [] };

    Object.values(data.files).forEach(file => {
        const parts = file.relativePath.split('/');
        if (parts.length === 1) {
            filesByDir['.'].push(file);
        } else {
            const dir = parts[0];
            if (!filesByDir[dir]) filesByDir[dir] = [];
            filesByDir[dir].push(file);
        }
    });

    const rootId = 'root';
    nodes.push({
        id: rootId,
        type: 'capsule',
        data: { label: 'Project Root', lang: 'root', isRoot: true, fileCount: Object.keys(data.files).length, exports: [], imports: [] },
        position: { x: 0, y: 0 }
    });

    Object.keys(filesByDir).forEach(dir => {
        const files = filesByDir[dir];
        const dirId = dir === '.' ? 'root-files' : `dir-${dir}`;

        if (dir !== '.') {
            nodes.push({
                id: dirId,
                type: 'capsule',
                data: { label: dir + '/', lang: 'directory', isDirectory: true, fileCount: files.length, exports: [], imports: [] },
                position: { x: 0, y: 0 }
            });

            edges.push({
                id: `${rootId}->${dirId}`,
                source: rootId,
                target: dirId,
                type: 'straight',
                style: { stroke: '#48bb78', strokeWidth: 12, opacity: 0.8 },
                data: { isStructural: true }
            });
        }

        files.forEach(file => {
            const fileId = file.relativePath;
            const trafficScore = (file.imports.length || 0) + (file.summaryContext?.usedBy?.length || 0);

            const structuralWidth = Math.min(Math.max(6, trafficScore * 2.0), 20);
            const structuralOpacity = Math.min(Math.max(0.2, trafficScore * 0.15), 1.0);

            nodes.push({
                id: fileId,
                type: 'capsule',
                data: {
                    label: file.name,
                    lang: file.lang,
                    oneLiner: file.oneLiner,
                    summary: file.summary || file.summaryContext?.fileDocstring,
                    exports: file.exports.map(e => e.name),
                    imports: file.imports.map(i => i.pathOrModule),
                    topSymbols: file.topSymbols,
                    previewCode: file.summaryContext?.firstNLines,
                    trafficScore,
                    usedBy: file.summaryContext?.usedBy || [],
                    dependsOn: file.imports.map(i => i.pathOrModule)
                },
                position: { x: 0, y: 0 }
            });

            const parentId = dir === '.' ? rootId : dirId;

            edges.push({
                id: `${parentId}->${fileId}`,
                source: parentId,
                target: fileId,
                type: 'straight',
                style: {
                    stroke: '#888',
                    strokeWidth: structuralWidth,
                    opacity: structuralOpacity
                },
                data: { isStructural: true }
            });
        });
    });

    Object.entries(data.files).forEach(([path, file]) => {
        if (file.summaryContext?.usedBy) {
            file.summaryContext.usedBy.forEach(usedByPath => {
                if (nodes.find(n => n.id === usedByPath)) {
                    const traffic = (file.summaryContext?.usedBy?.length || 1);
                    const depWidth = Math.min(Math.max(6, traffic * 3), 18);

                    edges.push({
                        id: `dep-${usedByPath}->${path}`,
                        source: usedByPath,
                        target: path,
                        type: 'straight',
                        animated: true,
                        style: {
                            stroke: '#63b3ed',
                            strokeWidth: depWidth,
                            opacity: 1,
                            strokeDasharray: '10 10'
                        },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#63b3ed' },
                        data: { isDependency: true }
                    });
                }
            });
        }
    });

    return { nodes, edges };
};

// --- FORCE LAYOUT ENGINE (FIXED: Safety Filter) ---
const applyForceLayout = (nodes: any[], edges: Edge[]) => {
    const simulationNodes = nodes.map(node => ({ ...node, x: 0, y: 0 }));

    // SAFETY CHECK: Only include edges where both source and target exist in nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    const filesPerDir: Record<string, number> = {};
    const inDegree: Record<string, number> = {};
    validEdges.forEach(e => {
        if (e.data?.isDependency) inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    });
    simulationNodes.forEach(node => {
        if (node.type === 'capsule' && !node.data.isRoot && !node.data.isDirectory) {
            const parts = node.id.split('/');
            const dir = parts.length > 1 ? parts[0] : '.';
            filesPerDir[dir] = (filesPerDir[dir] || 0) + 1;
        }
    });
    const totalTrackedFiles = Object.values(filesPerDir).reduce((a, b) => a + b, 0);
    const dirAngles: Record<string, { mid: number }> = {};
    let currentAngle = 0;
    Object.entries(filesPerDir).forEach(([dir, count]) => {
        const sliceSize = (count / Math.max(1, totalTrackedFiles)) * (2 * Math.PI);
        dirAngles[dir] = { mid: currentAngle + (sliceSize / 2) };
        currentAngle += sliceSize;
    });

    const simulation = forceSimulation(simulationNodes as any)
        .force('charge', forceManyBody().strength(-5000))
        .force('collide', forceCollide().radius(250).strength(0.8))
        .force('radial', forceRadial((d: any) => {
            if (d.type !== 'capsule') return 0;
            if (d.data.isRoot) return 0;
            if (inDegree[d.id] && inDegree[d.id] > 2) return 350;
            if (d.data.isDirectory) return 500;
            return 950;
        }, 0, 0).strength(0.7))
        .force('link', forceLink(validEdges.map(e => ({ ...e, source: e.source, target: e.target })) as any)
            .id((d: any) => d.id)
            .distance((d: any) => d.data?.isDependency ? 100 : 350)
            .strength((d: any) => d.data?.isDependency ? 0.8 : 0.1)
        )
        .force('sector', (alpha) => {
            simulationNodes.forEach((d: any) => {
                if (d.type !== 'capsule' || d.data.isRoot) return;
                let dir = '.';
                if (d.data.isDirectory) {
                    dir = d.data.label.replace('/', '');
                    if (d.id === 'root-files') dir = '.';
                } else {
                    const parts = d.id.split('/');
                    dir = parts.length > 1 ? parts[0] : '.';
                }
                const angles = dirAngles[dir];
                if (angles) {
                    const radius = Math.sqrt(d.x * d.x + d.y * d.y) || 100;
                    d.vx += (Math.cos(angles.mid) * radius - d.x) * 0.15 * alpha;
                    d.vy += (Math.sin(angles.mid) * radius - d.y) * 0.15 * alpha;
                }
            });
        })
        .stop();

    simulation.tick(600);

    // Return mapped nodes, BUT include ALL edges (even if physics skipped them) so ReactFlow renders them
    return {
        nodes: simulationNodes.map((node: any) => ({ ...node, position: { x: node.x, y: node.y } })),
        edges: edges
    };
};

// --- LAYOUT CONTAINER ---
const LayoutContainer = ({ children }: { children: React.ReactNode }) => (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', background: '#0a0a0a', overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
        {children}
    </div>
);

// --- SIDEBAR ---
const Sidebar = ({
    capsules,
    onSearch,
    onToggleStructure,
    showStructure,
    fileTypes,
    toggleFileType,
    colorMode,
    setColorMode,
    isImpactMode,
    onClearImpact,
    onAddSticky,
    onExport
}: any) => {
    const [searchTerm, setSearchTerm] = useState('');

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        onSearch(val);
    };

    return (
        <div style={{
            width: '33vw', maxWidth: '450px', minWidth: '300px', height: '100vh',
            background: '#111', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column',
            zIndex: 20, flexShrink: 0
        }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
                    🚀 Nexhacks Graph
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    {capsules?.stats.totalFiles || 0} Files • {capsules?.stats.totalEdges || 0} Connections
                </div>
            </div>

            <div style={{ margin: '16px', padding: '12px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #333', fontSize: '12px', lineHeight: '1.5', color: '#aaa', maxHeight: '120px', overflowY: 'auto', flexShrink: 0 }}>
                <div style={{ fontWeight: 'bold', color: '#888', marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px' }}>
                    ✨ AI Architecture Summary
                </div>
                This codebase follows a standard Next.js 14 pattern with App Router. Logic is decentralized...
            </div>

            {isImpactMode && (
                <div style={{ margin: '0 16px 16px 16px', padding: '12px', background: 'rgba(107, 70, 193, 0.2)', border: '1px solid #6b46c1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ color: '#d6bcfa', fontSize: '13px', fontWeight: 'bold' }}>⚡ Impact Analysis Active</div>
                    <button onClick={onClearImpact} style={{ background: '#6b46c1', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Exit</button>
                </div>
            )}

            <div style={{ padding: '0 16px', flexShrink: 0, marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Tools</div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <button onClick={onAddSticky} style={{ flex: 1, padding: '10px', background: '#fefcbf', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        + Sticky Note
                    </button>
                    <button onClick={onExport} style={{ flex: 1, padding: '10px', background: '#2d3748', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        Export Canvas
                    </button>
                </div>

                <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>View Controls</div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', background: '#222', padding: '8px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#ccc' }}>Show Folder Structure</span>
                    <input type="checkbox" checked={showStructure} onChange={(e) => onToggleStructure(e.target.checked)} style={{ cursor: 'pointer' }} />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button onClick={() => setColorMode('type')} style={{ flex: 1, padding: '8px', background: colorMode === 'type' ? '#2b6cb0' : '#222', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        File Type
                    </button>
                    <button onClick={() => setColorMode('heatmap')} style={{ flex: 1, padding: '8px', background: colorMode === 'heatmap' ? '#805ad5' : '#222', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        Heatmap
                    </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.keys(fileTypes).map(type => (
                        <button key={type} onClick={() => toggleFileType(type)} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '12px', border: '1px solid #333', background: fileTypes[type] ? langColors[type]?.bg || '#333' : 'transparent', color: fileTypes[type] ? '#fff' : '#555', cursor: 'pointer', opacity: fileTypes[type] ? 1 : 0.5 }}>
                            {type === 'sticky' ? 'Sticky Note' : type}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '0 16px 16px 16px', flexShrink: 0 }}>
                <input type="text" placeholder="Search files..." value={searchTerm} onChange={handleSearch} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', background: '#222', border: '1px solid #333', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: '0 16px', overflowY: 'auto' }}>
                {searchTerm && <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase' }}>Filtering Nodes...</div>}
            </div>

            {capsules?.stats.externalDependencies && (
                <div style={{ padding: '16px', borderTop: '1px solid #222', background: '#0e0e0e', flexShrink: 0 }}>
                    <div style={{ fontSize: '10px', color: '#555', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Dependencies</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {capsules.stats.externalDependencies.map((dep: string) => (
                            <span key={dep} style={{ fontSize: '10px', background: '#222', padding: '3px 8px', borderRadius: '4px', color: '#aaa', border: '1px solid #333' }}>{dep}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function Visualizer() {
    const [capsules, setCapsules] = useState<CapsulesData | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const nodeTypes = useMemo(() => ({
        capsule: CapsuleNode,
        sticky: StickyNoteNode
    }), []);

    const [rfInstance, setRfInstance] = useState<any>(null);
    const [showStructure, setShowStructure] = useState(true);
    const [colorMode, setColorMode] = useState<'type' | 'heatmap'>('type');
    const [fileTypes, setFileTypes] = useState<Record<string, boolean>>({});
    const [impactMode, setImpactMode] = useState<{ nodeId: string } | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);

    const graphStructureRef = useRef<{ edges: Edge[], nodes: FileNode[] }>({ edges: [], nodes: [] });

    // --- LOAD (No Persistence) ---
    useEffect(() => {
        fetch('/capsules.json')
            .then(res => res.json())
            .then((data: CapsulesData) => {
                setCapsules(data);
                const types: Record<string, boolean> = {};
                types['directory'] = true;
                types['sticky'] = true;
                Object.values(data.files).forEach(f => { types[f.lang] = true; });
                setFileTypes(types);

                const { nodes: rawNodes, edges: rawEdges } = prepareGraphData(data);

                graphStructureRef.current = { edges: rawEdges, nodes: rawNodes };

                const { nodes: layoutedNodes, edges: layoutedEdges } = applyForceLayout(rawNodes, rawEdges);

                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
            })
            .catch(console.error);
    }, [setNodes, setEdges]);

    // --- ACTIONS ---
    const handleAddSticky = () => {
        const id = `sticky-${Date.now()}`;
        const newSticky: StickyNode = {
            id,
            type: 'sticky',
            position: { x: 0, y: 0 },
            data: {
                content: '',
                color: '#fefcbf',
                isConnecting: false,
                onToggleConnect: () => {
                    setConnectingNodeId(prev => prev === id ? null : id);
                },
                onChange: (text) => {
                    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, content: text } } : n));
                },
                onDelete: () => {
                    setNodes(nds => nds.filter(n => n.id !== id));
                }
            }
        };
        setNodes(nds => [newSticky, ...nds]);
    };

    const handleExport = () => {
        alert("Export functionality placeholder.");
    };

    // --- LINKING LOGIC ---
    const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (!connectingNodeId) return;

        if (connectingNodeId === node.id) return;

        const edgeId = `link-${connectingNodeId}-${node.id}`;
        const reverseEdgeId = `link-${node.id}-${connectingNodeId}`;
        const exists = edges.some(e => e.id === edgeId || e.id === reverseEdgeId);

        if (exists) {
            setEdges(eds => eds.filter(e => e.id !== edgeId && e.id !== reverseEdgeId));
        } else {
            const newEdge: Edge = {
                id: edgeId,
                source: connectingNodeId,
                target: node.id,
                type: 'straight',
                animated: true,
                style: { stroke: '#f6e05e', strokeWidth: 2, strokeDasharray: '5 5' }
            };
            setEdges(eds => addEdge(newEdge, eds));
        }
    }, [connectingNodeId, edges, setEdges]);

    // --- EFFECT: UI UPDATES (Filter/Highlight) ---
    useEffect(() => {
        const allEdges = graphStructureRef.current.edges;

        setNodes(nds => nds.map(node => {
            // 1. Connection Mode Logic
            if (node.type === 'sticky') {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        isConnecting: node.id === connectingNodeId,
                        onToggleConnect: () => setConnectingNodeId(prev => prev === node.id ? null : node.id)
                    },
                    hidden: fileTypes['sticky'] === false
                };
            }

            // 2. Filter Logic
            const data = node.data as FileNodeData;
            const typeKey = data.isDirectory ? 'directory' : data.lang;
            if (!data.isRoot && typeKey && !fileTypes[typeKey]) {
                return { ...node, hidden: true };
            }

            // 3. Impact & Search Logic
            let isDimmed = false;
            let isHighlight = false;

            if (impactMode) {
                if (node.id === impactMode.nodeId) {
                    isHighlight = true;
                } else {
                    const isConnected = allEdges.some(e =>
                        (e.source === impactMode.nodeId && e.target === node.id) ||
                        (e.target === impactMode.nodeId && e.source === node.id)
                    );
                    if (!isConnected) isDimmed = true;
                }
            }

            return {
                ...node,
                hidden: false,
                data: {
                    ...data,
                    colorMode,
                    isDimmed: isSearching ? data.isDimmed : isDimmed,
                    isHighlight: isSearching ? data.isHighlight : (data.isHighlight || isHighlight),
                    isSearching,
                    isGlobalConnecting: !!connectingNodeId,
                    onTraceImpact: () => setImpactMode({ nodeId: node.id })
                }
            };
        }));

        setEdges(eds => eds.map(edge => ({
            ...edge,
            hidden: edge.data?.isStructural && !showStructure
        })));

    }, [showStructure, fileTypes, impactMode, isSearching, colorMode, connectingNodeId, setNodes, setEdges]);

    const toggleFileType = (type: string) => setFileTypes(prev => ({ ...prev, [type]: !prev[type] }));
    const handleSearch = useCallback((term: string) => {
        const lowerTerm = term.toLowerCase();
        setIsSearching(!!lowerTerm);

        setNodes((nds) => nds.map((node) => {
            if (node.type === 'sticky') return node;
            const data = node.data as FileNodeData;
            if (!lowerTerm) return { ...node, data: { ...data, isDimmed: false, isHighlight: false } };

            const matchLabel = data.label.toLowerCase().includes(lowerTerm);
            const matchSummary = data.summary?.toLowerCase().includes(lowerTerm);
            const isMatch = matchLabel || matchSummary;

            return { ...node, data: { ...data, isDimmed: !isMatch, isHighlight: !!isMatch } };
        }));
    }, [setNodes]);

    return (
        <LayoutContainer>
            <Sidebar
                capsules={capsules}
                onSearch={handleSearch}
                showStructure={showStructure}
                onToggleStructure={setShowStructure}
                fileTypes={fileTypes}
                toggleFileType={toggleFileType}
                colorMode={colorMode}
                setColorMode={setColorMode}
                isImpactMode={!!impactMode}
                onClearImpact={() => setImpactMode(null)}
                onAddSticky={handleAddSticky}
                onExport={handleExport}
            />
            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlowProvider>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={handleNodeClick} // Handles Linking
                        onInit={setRfInstance}
                        nodeTypes={nodeTypes}
                        fitView
                        minZoom={0.05}
                    >
                        <Background color="#1a1a1a" gap={50} />
                        <Controls style={{ background: '#1a1a1a' }} />
                    </ReactFlow>
                </ReactFlowProvider>
            </div>
        </LayoutContainer>
    );
}
