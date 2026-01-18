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
  addEdge
} from 'reactflow';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceRadial
} from 'd3-force';
import 'reactflow/dist/style.css';
import { Sidebar, langColors, SearchResult } from './Sidebar';

// VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

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
  metadata?: {
    usedBy?: string[];
    dependsOn?: string[];
    fileDocstring?: string;
    firstNLines?: string;
    functionSignatures?: { name: string; signature: string }[];
  };
  summaryContext?: {
    usedBy: string[];
    dependsOn: string[];
    fileDocstring?: string;
    firstNLines?: string;
    functionSignatures?: { name: string; signature: string }[];
  };
  summary?: string;
  upperLevelSummary?: string;
  lowerLevelSummary?: string;
}

interface DirectoryCapsule {
  path: string;
  relativePath: string;
  name: string;
  files: string[];
  subdirectories: string[];
  upperLevelSummary?: string;
}

interface CapsulesData {
  stats: {
    totalFiles: number;
    totalDirectories: number;
    totalEdges: number;
    externalDependencies?: string[];
  };
  files: Record<string, CapsuleFile>;
  directories: Record<string, DirectoryCapsule>;
}

interface FileNodeData {
  label: string;
  lang: string;
  relativePath?: string;
  summary?: string;
  exports: string[];
  imports: string[];
  topSymbols?: SymbolData[];
  previewCode?: string;
  isDirectory?: boolean;
  isRoot?: boolean;
  fileCount?: number;
  trafficScore?: number;
  // New: For highlighting/dimming
  isDimmed?: boolean;
  isHighlight?: boolean;
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
// --- STICKY NOTE NODE ---
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

      <div style={{
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
      }}>
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

// --- CAPSULE NODE ---
const CapsuleNode: React.FC<NodeProps<FileNodeData>> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'structure'>('summary');

  const colors = useMemo(() => {
    if (data.isRoot) return langColors.root;
    if (data.isDirectory) return langColors.directory;
    return langColors[data.lang] || langColors.other;
  }, [data.isRoot, data.isDirectory, data.lang]);

  const toggleExpand = (e: React.MouseEvent) => {
    if (data.isGlobalConnecting) return;
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleScroll = (e: React.WheelEvent) => {
    e.stopPropagation();
  };

  const opacity = data.isDimmed ? 0.15 : 1;
  const borderStyle = data.isHighlight
    ? '3px solid #f6e05e'
    : `3px solid ${expanded ? '#fff' : colors.border}`;

  const boxShadow = data.isHighlight
    ? '0 0 30px rgba(246, 224, 94, 0.6)'
    : (expanded ? '0 40px 80px rgba(0,0,0,0.9)' : '0 8px 25px rgba(0,0,0,0.6)');

  // Dynamic width based on label length
  const labelLength = data.label.length;
  const baseWidth = data.isRoot ? 340 : data.isDirectory ? 300 : 280;
  const dynamicWidth = Math.max(baseWidth, Math.min(labelLength * 14 + 100, 500));

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
        width: expanded ? 600 : dynamicWidth,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        cursor: data.isGlobalConnecting ? 'crosshair' : (expanded ? 'default' : 'pointer'),
        position: 'relative',
        zIndex: expanded ? 100000 : (data.isHighlight ? 5000 : 1000),
        transition: 'opacity 0.2s, width 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s'
      }}
    >
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />

      {!expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '42px' }}>{colors.icon}</div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '24px', lineHeight: '1.1', marginBottom: '4px' }}>{data.label}</div>
            {(data.isDirectory || data.isRoot) && (
              <div style={{ fontSize: '16px', opacity: 0.7, fontWeight: '500' }}>{data.fileCount} items</div>
            )}
            {data.isHighlight && (
              <div style={{ color: '#f6e05e', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>MATCH</div>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'grab' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '32px' }}>{colors.icon}</span>
              <span style={{ fontWeight: 'bold', fontSize: '24px' }}>{data.label}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="nodrag"
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '32px' }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)', cursor: 'grab' }}>
            {[{ id: 'summary', label: 'Summary' }, { id: 'structure', label: 'Structure' }].map(tab => (
              <button
                key={tab.id}
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id as 'summary' | 'structure'); }}
                className="nodrag"
                style={{
                  flex: 1,
                  padding: '16px',
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: 'none',
                  color: activeTab === tab.id ? '#fff' : '#888',
                  borderBottom: activeTab === tab.id ? `4px solid ${colors.border}` : '4px solid transparent',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '700'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="nodrag nowheel" onWheel={handleScroll} style={{ padding: '24px', maxHeight: '500px', overflowY: 'auto', background: '#0a0a0a', cursor: 'text' }}>
            {activeTab === 'summary' && (
              <div style={{ animation: 'fadeIn 0.2s' }}>
                {data.relativePath && (
                  <div style={{ fontSize: '14px', color: '#888', marginBottom: '16px', fontFamily: 'monospace', background: '#111', padding: '8px 12px', borderRadius: '8px', wordBreak: 'break-all' }}>
                    📂 {data.relativePath}
                  </div>
                )}
                <div style={{ fontSize: '18px', lineHeight: '1.6', color: '#ddd', marginBottom: '24px' }}>
                  {data.summary || "No summary available."}
                </div>
                {!data.isDirectory && !data.isRoot && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '12px' }}>
                      <div style={{ fontSize: '13px', color: '#666', textTransform: 'uppercase', marginBottom: '6px' }}>Type</div>
                      <div style={{ fontSize: '16px', color: colors.border, fontWeight: 'bold' }}>{data.lang}</div>
                    </div>
                    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '12px' }}>
                      <div style={{ fontSize: '13px', color: '#666', textTransform: 'uppercase', marginBottom: '6px' }}>Imports</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{data.imports.length} modules</div>
                    </div>
                  </div>
                )}
                {data.relativePath && !data.isDirectory && !data.isRoot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      vscode.postMessage({ type: 'openFile', relativePath: data.relativePath });
                    }}
                    className="nodrag"
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      padding: '12px',
                      background: '#007acc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    Open in Editor
                  </button>
                )}
              </div>
            )}
            {activeTab === 'structure' && (
              <div style={{ animation: 'fadeIn 0.2s' }}>
                {data.topSymbols && data.topSymbols.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {data.topSymbols.map((sym, i) => (
                      <div key={i} style={{ padding: '12px', background: '#1a1a1a', borderRadius: '8px', borderLeft: `5px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '16px', fontWeight: '600' }}>{sym.name}</span>
                        <span style={{ fontSize: '12px', color: '#888', background: '#111', padding: '4px 8px', borderRadius: '6px' }}>{sym.kind}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#666', fontStyle: 'italic', fontSize: '16px' }}>
                    {data.isDirectory ? "Folder structure view not implemented yet." : "No symbols detected."}
                  </div>
                )}
              </div>
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
    // Handle both / and \\ path separators
    const normalizedPath = file.relativePath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
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
      const dirCapsule = data.directories && data.directories[dir];
      nodes.push({
        id: dirId,
        type: 'capsule',
        data: {
          label: dir + '/',
          lang: 'directory',
          isDirectory: true,
          fileCount: files.length,
          exports: [],
          imports: [],
          summary: dirCapsule?.upperLevelSummary || "Folder containing " + files.length + " files.",
          relativePath: dir
        },
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
      const importCount = file.imports.length || 0;
      const usedByCount = file.summaryContext?.usedBy?.length || 0;
      const trafficScore = importCount + usedByCount;

      const structuralWidth = Math.min(Math.max(6, trafficScore * 2.0), 20);
      const structuralOpacity = Math.min(Math.max(0.2, trafficScore * 0.15), 1.0);

      nodes.push({
        id: fileId,
        type: 'capsule',
        data: {
          label: file.name,
          lang: file.lang,
          relativePath: file.relativePath,
          summary: file.lowerLevelSummary || file.upperLevelSummary || file.summaryContext?.fileDocstring,
          exports: file.exports.map(e => e.name),
          imports: file.imports.map(i => i.pathOrModule),
          topSymbols: file.topSymbols,
          previewCode: file.summaryContext?.firstNLines,
          trafficScore
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

  // Create dependency edges from usedBy relationships (in metadata)
  Object.entries(data.files).forEach(([path, file]) => {
    // usedBy is in metadata, not summaryContext
    const usedByList = file.metadata?.usedBy || file.summaryContext?.usedBy || [];
    if (usedByList.length > 0) {
      usedByList.forEach((usedByPath: string) => {
        // Normalize the usedBy path to match node IDs
        const normalizedUsedBy = usedByPath.replace(/\\/g, '/');
        const normalizedPath = path.replace(/\\/g, '/');

        // Find if the source node exists (the file that imports this one)
        if (nodes.find(n => n.id.replace(/\\/g, '/') === normalizedUsedBy)) {
          const traffic = usedByList.length;
          const depWidth = Math.min(Math.max(4, traffic * 2), 12);

          edges.push({
            id: `dep-${normalizedUsedBy}->${normalizedPath}`,
            source: usedByPath, // Use original path as source
            target: path,       // Use original path as target
            type: 'straight',
            animated: true,
            style: {
              stroke: '#63b3ed',
              strokeWidth: depWidth,
              opacity: 1,
              strokeDasharray: '8 4'
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

// --- FORCE LAYOUT ENGINE ---
const applyForceLayout = (nodes: FileNode[], edges: Edge[]) => {
  const simulationNodes = nodes.map(node => ({ ...node, x: 0, y: 0 }));

  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIds.has(e.source as string) && nodeIds.has(e.target as string));
  const simulationEdges = validEdges.map(edge => ({ ...edge, source: edge.source, target: edge.target }));

  const filesPerDir: Record<string, number> = {};
  const inDegree: Record<string, number> = {};

  validEdges.forEach(e => {
    if (e.data?.isDependency) {
      inDegree[e.target as string] = (inDegree[e.target as string] || 0) + 1;
    }
  });

  simulationNodes.forEach(node => {
    if (!node.data.isRoot && !node.data.isDirectory) {
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
      if (d.data.isRoot) return 0;
      if (inDegree[d.id] && inDegree[d.id] > 2) return 350;
      if (d.data.isDirectory) return 500;
      return 950;
    }, 0, 0).strength(0.7))
    .force('link', forceLink(simulationEdges as any)
      .id((d: any) => d.id)
      .distance((d: any) => d.data?.isDependency ? 100 : 350)
      .strength((d: any) => d.data?.isDependency ? 0.8 : 0.1)
    )
    .force('sector', (alpha) => {
      simulationNodes.forEach((d: any) => {
        if (d.data.isRoot) return;
        if (inDegree[d.id] && inDegree[d.id] > 2) return;

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
          const targetX = Math.cos(angles.mid) * radius;
          const targetY = Math.sin(angles.mid) * radius;
          d.vx += (targetX - d.x) * 0.15 * alpha;
          d.vy += (targetY - d.y) * 0.15 * alpha;
        }
      });
    })
    .stop();

  simulation.tick(600);

  return {
    nodes: simulationNodes.map((node: any) => ({ ...node, position: { x: node.x, y: node.y } })),
    edges
  };
};

// --- MAIN COMPONENT ---
export default function App() {
  const [capsules, setCapsules] = useState<CapsulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({
    capsule: CapsuleNode,
    sticky: StickyNoteNode
  }), []);

  const [showStructure, setShowStructure] = useState(true);
  const [fileTypes, setFileTypes] = useState<Record<string, boolean>>({});
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const graphStructureRef = useRef<{ edges: Edge[], nodes: FileNode[] }>({ edges: [], nodes: [] });

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'loading') {
        setLoading(true);
        setError(null);
      }

      if (message.type === 'error') {
        setError(message.message);
        setLoading(false);
      }

      if (message.type === 'setCapsules') {
        const data: CapsulesData = message.data;
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
        setLoading(false);
      }

      if (message.type === 'updateFileSummary') {
        const { relativePath, summary } = message.data;

        setCapsules(prev => {
          if (!prev) return prev;
          const updatedFiles = { ...prev.files };
          if (updatedFiles[relativePath]) {
            updatedFiles[relativePath] = { ...updatedFiles[relativePath], summary };
          }
          return { ...prev, files: updatedFiles };
        });

        setNodes(prev => prev.map(node => {
          if (node.data.relativePath === relativePath) {
            return { ...node, data: { ...node.data, summary } };
          }
          return node;
        }));
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'requestCapsules' });

    return () => window.removeEventListener('message', handleMessage);
  }, [setNodes, setEdges]);

  const handleRefresh = () => {
    vscode.postMessage({ type: 'refresh' });
  };

  const handleSettings = () => {
    vscode.postMessage({ type: 'setApiKey' });
  };

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
          setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
        }
      }
    };
    setNodes(nds => [newSticky, ...nds]);
  };

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (connectingNodeId && connectingNodeId !== node.id) {
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
    }
  }, [connectingNodeId, edges, setEdges]);

  const handleSearch = useCallback((term: string) => {
    const lowerTerm = term.toLowerCase();
    const results: SearchResult[] = [];

    setNodes((nds) => nds.map((node) => {
      if (node.type === 'sticky') return node;
      const data = node.data as FileNodeData;
      if (!lowerTerm) return { ...node, data: { ...data, isDimmed: false, isHighlight: false } };

      // Match on label
      const matchLabel = data.label.toLowerCase().includes(lowerTerm);
      // Match on summary
      const matchSummary = data.summary?.toLowerCase().includes(lowerTerm);
      // Match on topSymbols (function/class names)
      const matchSymbol = data.topSymbols?.some(sym =>
        sym.name.toLowerCase().includes(lowerTerm)
      );
      // Match on path
      const matchPath = data.relativePath?.toLowerCase().includes(lowerTerm);

      const isMatch = matchLabel || matchSummary || matchSymbol || matchPath;

      // Build results list
      if (isMatch && !data.isDirectory && !data.isRoot) {
        let matchType = 'name';
        if (matchSymbol && !matchLabel) matchType = 'symbol';
        else if (matchSummary && !matchLabel && !matchSymbol) matchType = 'summary';
        else if (matchPath && !matchLabel) matchType = 'path';

        results.push({
          id: node.id,
          label: data.label,
          lang: data.lang,
          matchType
        });
      }

      return { ...node, data: { ...data, isDimmed: !isMatch, isHighlight: !!isMatch } };
    }));

    setSearchResults(results);
  }, [setNodes]);

  const handleClickResult = useCallback((nodeId: string) => {
    // Find the node and center view on it
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      // Clear other highlights, highlight this one
      setNodes(nds => nds.map(n => ({
        ...n,
        data: {
          ...(n.data as FileNodeData),
          isHighlight: n.id === nodeId,
          isDimmed: n.id !== nodeId && (n.data as FileNodeData).isDimmed
        }
      })));
    }
  }, [nodes, setNodes]);

  const toggleFileType = (type: string) => setFileTypes(prev => ({ ...prev, [type]: !prev[type] }));

  // Apply filters and color mode
  useEffect(() => {
    setNodes(nds => nds.map(node => {
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

      const data = node.data as FileNodeData;
      const typeKey = data.isDirectory ? 'directory' : data.lang;
      if (!data.isRoot && typeKey && !fileTypes[typeKey]) {
        return { ...node, hidden: true };
      }

      return {
        ...node,
        hidden: false,
        data: {
          ...data,
          isGlobalConnecting: !!connectingNodeId
        }
      };
    }));

    setEdges(eds => eds.map(edge => ({
      ...edge,
      hidden: edge.data?.isStructural && !showStructure
    })));
  }, [showStructure, fileTypes, connectingNodeId, setNodes, setEdges]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0a', color: '#fff', fontSize: '18px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          Scanning workspace...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0a', color: '#ff6b6b', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <div style={{ fontSize: '20px' }}>Error</div>
        <div style={{ color: '#888' }}>{error}</div>
        <button onClick={handleRefresh} style={{ marginTop: '16px', padding: '10px 20px', background: '#007acc', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <Sidebar
        capsules={capsules}
        onSearch={handleSearch}
        showStructure={showStructure}
        onToggleStructure={setShowStructure}
        fileTypes={fileTypes}
        toggleFileType={toggleFileType}
        searchResults={searchResults}
        onClickResult={handleClickResult}
        onAddSticky={handleAddSticky}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.05}
          >
            <Background color="#1a1a1a" gap={50} />
            <Controls style={{ background: '#1a1a1a' }} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
