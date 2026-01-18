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
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';

// VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

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
}

interface FileNodeData {
  label: string;
  lang: string;
  summary?: string;
  exports: string[];
  isDirectory?: boolean;
  isRoot?: boolean;
  fileCount?: number;
}

type FileNode = Node<FileNodeData>;

// --- LANG COLORS ---
const langColors: Record<string, { bg: string; border: string; icon: string }> = {
  // JavaScript/TypeScript
  'react-typescript': { bg: '#1a365d', border: '#4299e1', icon: '⚛️' },
  'typescript': { bg: '#1e3a5f', border: '#3178c6', icon: '📘' },
  'javascript': { bg: '#3d3d00', border: '#f7df1e', icon: '📒' },
  'react-javascript': { bg: '#3d3d00', border: '#f7df1e', icon: '⚛️' },

  // Python
  'python': { bg: '#1a3d4d', border: '#3776ab', icon: '🐍' },

  // Go
  'go': { bg: '#1a3d3d', border: '#00add8', icon: '🔷' },

  // Rust
  'rust': { bg: '#3d1a1a', border: '#ce422b', icon: '🦀' },

  // Java/Kotlin
  'java': { bg: '#3d2a1a', border: '#ed8b00', icon: '☕' },
  'kotlin': { bg: '#2d1a3d', border: '#7f52ff', icon: '🟣' },

  // C/C++/C#
  'c': { bg: '#1a2a3d', border: '#a8b9cc', icon: '🔵' },
  'cpp': { bg: '#1a2a3d', border: '#00599c', icon: '🔷' },
  'csharp': { bg: '#2d1a3d', border: '#512bd4', icon: '🟪' },

  // Ruby/PHP
  'ruby': { bg: '#3d1a1a', border: '#cc342d', icon: '💎' },
  'php': { bg: '#2a2a3d', border: '#777bb4', icon: '🐘' },

  // Swift
  'swift': { bg: '#3d2a1a', border: '#f05138', icon: '🦅' },

  // Shell
  'shell': { bg: '#1a1a1a', border: '#4eaa25', icon: '💻' },

  // Web
  'css': { bg: '#1a1a4e', border: '#264de4', icon: '🎨' },
  'scss': { bg: '#2d1a3d', border: '#cf649a', icon: '🎨' },
  'html': { bg: '#3d2a1a', border: '#e34c26', icon: '🌐' },
  'vue': { bg: '#1a3d2a', border: '#42b883', icon: '💚' },

  // Config/Data
  'json': { bg: '#1a1a1a', border: '#555', icon: '📄' },
  'yaml': { bg: '#1a1a1a', border: '#cb171e', icon: '⚙️' },
  'markdown': { bg: '#1a2a1a', border: '#083fa1', icon: '📝' },

  // Special
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

  // Group files by directory
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

  // Create root node
  const rootId = 'root';
  nodes.push({
    id: rootId,
    type: 'capsule',
    data: {
      label: 'Project Root',
      lang: 'root',
      isRoot: true,
      fileCount: Object.keys(data.files).length,
      exports: [],
    },
    position: { x: 0, y: 0 }
  });

  // Process each directory
  const dirNames = Object.keys(filesByDir).sort((a, b) => {
    if (a === '.') return -1;
    if (b === '.') return 1;
    return a.localeCompare(b);
  });

  dirNames.forEach(dir => {
    const files = filesByDir[dir];
    const dirId = dir === '.' ? 'root-files' : `dir-${dir}`;

    // Create directory node (except for root files which connect directly)
    if (dir !== '.') {
      nodes.push({
        id: dirId,
        type: 'capsule',
        data: {
          label: dir + '/',
          lang: 'directory',
          isDirectory: true,
          fileCount: files.length,
          exports: [],
        },
        position: { x: 0, y: 0 }
      });

      // Edge from root to directory
      edges.push({
        id: `${rootId}->${dirId}`,
        source: rootId,
        target: dirId,
        type: 'smoothstep',
        style: { stroke: '#48bb78', strokeWidth: 2 },
      });
    }

    // Create file nodes
    files.forEach(file => {
      const fileId = file.relativePath;

      nodes.push({
        id: fileId,
        type: 'capsule',
        data: {
          label: file.name,
          lang: file.lang,
          summary: file.summary || file.summaryContext?.fileDocstring?.slice(0, 100),
          exports: file.exports.map(e => e.name),
        },
        position: { x: 0, y: 0 }
      });

      // Edge from directory/root to file
      const parentId = dir === '.' ? rootId : dirId;
      edges.push({
        id: `${parentId}->${fileId}`,
        source: parentId,
        target: fileId,
        type: 'smoothstep',
        style: { stroke: '#555', strokeWidth: 1 },
      });
    });
  });

  // Create dependency edges (from usedBy)
  Object.entries(data.files).forEach(([, file]) => {
    if (file.summaryContext?.usedBy) {
      file.summaryContext.usedBy.forEach(usedByPath => {
        // Only add if both nodes exist
        if (nodes.find(n => n.id === usedByPath)) {
          edges.push({
            id: `dep-${usedByPath}->${file.relativePath}`,
            source: usedByPath,
            target: file.relativePath,
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
export default function App() {
  const [capsules, setCapsules] = useState<CapsulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const nodeTypes = useMemo(() => ({ capsule: CapsuleNode }), []);

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
        const { nodes: rawNodes, edges: rawEdges } = createHierarchicalLayout(data);
        const { nodes: layoutedNodes, edges: layoutedEdges } = applyDagreLayout(rawNodes, rawEdges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // Request capsules data from extension
    vscode.postMessage({ type: 'requestCapsules' });

    return () => window.removeEventListener('message', handleMessage);
  }, [setNodes, setEdges]);

  const handleRefresh = () => {
    vscode.postMessage({ type: 'refresh' });
  };

  const handleSettings = () => {
    vscode.postMessage({ type: 'setApiKey' });
  };

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
          Scanning workspace...
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
        <div style={{ fontSize: '20px' }}>Error</div>
        <div style={{ color: '#888' }}>{error}</div>
        <button
          onClick={handleRefresh}
          style={{
            marginTop: '16px',
            padding: '10px 20px',
            background: '#007acc',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Retry
        </button>
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
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={handleRefresh}
                style={{
                  padding: '6px 12px',
                  background: '#333',
                  color: '#ccc',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                🔄 Refresh
              </button>
              <button
                onClick={handleSettings}
                style={{
                  padding: '6px 12px',
                  background: '#333',
                  color: '#ccc',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                ⚙️ Settings
              </button>
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
