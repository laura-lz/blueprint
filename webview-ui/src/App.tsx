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
  Node,
  Edge,
  NodeProps,
  Panel
} from 'reactflow';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceRadial
} from 'd3-force';
import 'reactflow/dist/style.css';

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

interface CodeBlock {
  name: string;
  type: 'function' | 'class' | 'block';
  startLine: number;
  endLine: number;
  summary: string;
  calls?: string[];
  calledBy?: string[];
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
  upperLevelSummary?: string;
  lowerLevelSummary?: string;
  structure?: CodeBlock[];
  isAnalyzing?: boolean;
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
  lowerLevelSummary?: string;
  exports: string[];
  imports: string[];
  topSymbols?: SymbolData[];
  previewCode?: string;
  isDirectory?: boolean;
  isRoot?: boolean;
  fileCount?: number;
  depth?: number;
  structure?: CodeBlock[];
  isAnalyzing?: boolean;
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
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'structure' | 'code'>('summary');

  const getColors = () => {
    if (data.isRoot) return langColors.root;
    if (data.isDirectory) return langColors.directory;
    return langColors[data.lang] || langColors.other;
  };

  const colors = getColors();

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wasExpanded = expanded;
    setExpanded(!expanded);

    // Auto-trigger deep analysis when expanding a file node that doesn't have structure yet
    if (!wasExpanded && !data.isDirectory && !data.isRoot && data.relativePath && !data.structure && !data.isAnalyzing) {
      vscode.postMessage({ type: 'requestDeepAnalysis', relativePath: data.relativePath });
    }
  };

  const handleScroll = (e: React.WheelEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      {/* Modal backdrop when expanded */}
      {expanded && (
        <div
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 99998
          }}
        />
      )}
      <div
        onClick={toggleExpand}
        style={{
          padding: expanded ? '0' : '20px 24px',
          borderRadius: '24px',
          background: colors.bg,
          color: '#fff',
          border: `3px solid ${expanded ? '#fff' : colors.border}`,
          boxShadow: expanded ? '0 40px 80px rgba(0,0,0,0.9)' : '0 8px 25px rgba(0,0,0,0.6)',
          width: expanded ? '80vw' : (data.isRoot ? 340 : 300),
          maxWidth: expanded ? '900px' : undefined,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          cursor: expanded ? 'default' : 'pointer',
          position: expanded ? 'fixed' : 'relative',
          top: expanded ? '50%' : undefined,
          left: expanded ? '50%' : undefined,
          transform: expanded ? 'translate(-50%, -50%)' : undefined,
          zIndex: expanded ? 99999 : 1000,
          transition: 'width 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s'
        }}
      >
        <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />

        {!expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            {/* Main Body: Upper Level Summary */}
            <div style={{ paddingBottom: '12px' }}>
              {data.summary ? (
                <div style={{ fontSize: '18px', lineHeight: '1.4', color: '#fff', fontWeight: '500', letterSpacing: '0.2px' }}>
                  {data.summary}
                </div>
              ) : (
                <div style={{ fontSize: '18px', color: '#888', fontStyle: 'italic' }}>
                  No summary available.
                </div>
              )}
            </div>

            {/* Footer: Icon & Filename */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: 0.6,
              marginTop: 'auto',
              transform: 'scale(0.9)',
              transformOrigin: 'left bottom'
            }}>
              <div style={{ fontSize: '18px' }}>{colors.icon}</div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{data.label}</div>
                {(data.isDirectory || data.isRoot) && (
                  <div style={{ fontSize: '10px' }}>{data.fileCount} items</div>
                )}
              </div>
            </div>
          </div>
        )}

        {expanded && (
          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* HEADER: DRAGGABLE (No 'nodrag' class) */}
            <div
              style={{ padding: '24px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'grab' }}
            >
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

            {/* TABS: DRAGGABLE */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)', cursor: 'grab' }}>
              {[
                { id: 'summary', label: 'Summary' },
                { id: 'structure', label: 'Structure' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id as 'summary' | 'structure' | 'code'); }}
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

            {/* Loading overlay for deep analysis */}
            {data.isAnalyzing && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                borderRadius: '24px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>🔬</div>
                <div style={{ fontSize: '18px', color: '#fff', fontWeight: '600' }}>Analyzing code structure...</div>
                <div style={{ fontSize: '14px', color: '#888', marginTop: '8px' }}>This may take a moment</div>
              </div>
            )}

            {/* CONTENT: NOT DRAGGABLE (Allows Text Selection) */}
            <div
              className="nodrag nowheel"
              onWheel={handleScroll}
              style={{ padding: '24px', maxHeight: '500px', overflowY: 'auto', background: '#0a0a0a', cursor: 'text' }}
            >
              {activeTab === 'summary' && (
                <div style={{ animation: 'fadeIn 0.2s' }}>
                  {data.relativePath && (
                    <div style={{ fontSize: '14px', color: '#888', marginBottom: '16px', fontFamily: 'monospace', background: '#111', padding: '8px 12px', borderRadius: '8px', wordBreak: 'break-all' }}>
                      📂 {data.relativePath}
                    </div>
                  )}
                  {/* Show lower-level summary (bullet points) if available */}
                  {data.lowerLevelSummary ? (
                    <div style={{ fontSize: '15px', lineHeight: '1.8', color: '#ddd', marginBottom: '24px', whiteSpace: 'pre-wrap' }}>
                      {data.lowerLevelSummary}
                    </div>
                  ) : data.isAnalyzing ? (
                    <div style={{ fontSize: '15px', color: '#888', marginBottom: '24px', fontStyle: 'italic' }}>
                      Generating detailed analysis...
                    </div>
                  ) : (
                    <div style={{ fontSize: '15px', color: '#888', marginBottom: '24px', fontStyle: 'italic' }}>
                      Click to load detailed analysis
                    </div>
                  )}
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
                  {data.isAnalyzing && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#aaa' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔬</div>
                      Analyzing code structure...
                    </div>
                  )}
                  {!data.isAnalyzing && data.structure && data.structure.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {data.structure.map((block, i) => (
                        <div key={i} style={{ padding: '14px', background: '#1a1a1a', borderRadius: '10px', borderLeft: `5px solid ${colors.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '16px', fontWeight: '700' }}>{block.name}</span>
                            <span style={{ fontSize: '11px', color: '#888', background: '#111', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{block.type}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px', lineHeight: '1.5' }}>{block.summary}</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>Lines {block.startLine}-{block.endLine}</div>
                          {block.calls && block.calls.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '12px' }}>
                              <span style={{ color: '#63b3ed' }}>→ Calls:</span>{' '}
                              <span style={{ color: '#888' }}>{block.calls.join(', ')}</span>
                            </div>
                          )}
                          {block.calledBy && block.calledBy.length > 0 && (
                            <div style={{ marginTop: '4px', fontSize: '12px' }}>
                              <span style={{ color: '#68d391' }}>← Called by:</span>{' '}
                              <span style={{ color: '#888' }}>{block.calledBy.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !data.isAnalyzing && data.topSymbols && data.topSymbols.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {data.topSymbols.map((sym, i) => (
                        <div key={i} style={{ padding: '12px', background: '#1a1a1a', borderRadius: '8px', borderLeft: `5px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '16px', fontWeight: '600' }}>{sym.name}</span>
                          <span style={{ fontSize: '12px', color: '#888', background: '#111', padding: '4px 8px', borderRadius: '6px' }}>{sym.kind}</span>
                        </div>
                      ))}
                      {!data.isDirectory && !data.isRoot && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            vscode.postMessage({ type: 'requestDeepAnalysis', relativePath: data.relativePath });
                          }}
                          className="nodrag"
                          style={{ marginTop: '12px', padding: '10px', background: '#2d2d2d', color: '#ccc', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                        >
                          🔬 Analyze Structure
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#666', fontStyle: 'italic', fontSize: '16px' }}>
                      {data.isDirectory ? "Folder structure view not implemented yet." : (
                        <div style={{ textAlign: 'center' }}>
                          <div>No detailed structure yet.</div>
                          {!data.isRoot && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                vscode.postMessage({ type: 'requestDeepAnalysis', relativePath: data.relativePath });
                              }}
                              className="nodrag"
                              style={{ marginTop: '16px', padding: '12px 20px', background: '#007acc', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
                            >
                              🔬 Analyze Structure
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </>
  );
};

// --- DATA PREPARATION ---
const prepareGraphData = (data: CapsulesData) => {
  const nodes: FileNode[] = [];
  const edges: Edge[] = [];
  const allDirs = new Set<string>();
  const filesByFullDir: Record<string, CapsuleFile[]> = {};

  // Group files by their full directory path
  Object.values(data.files).forEach(file => {
    const parts = file.relativePath.split('/');
    if (parts.length === 1) {
      if (!filesByFullDir['.']) filesByFullDir['.'] = [];
      filesByFullDir['.'].push(file);
    } else {
      const dirPath = parts.slice(0, -1).join('/');
      if (!filesByFullDir[dirPath]) filesByFullDir[dirPath] = [];
      filesByFullDir[dirPath].push(file);

      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        allDirs.add(currentPath);
      }
    }
  });

  const rootId = 'root';
  nodes.push({
    id: rootId,
    type: 'capsule',
    data: { label: 'Project Root', lang: 'root', isRoot: true, fileCount: Object.keys(data.files).length, exports: [], imports: [] },
    position: { x: 0, y: 0 }
  });

  // Create directory nodes (sorted so parents come before children)
  const sortedDirs = Array.from(allDirs).sort();
  sortedDirs.forEach(dirPath => {
    const dirId = `dir-${dirPath}`;
    const parts = dirPath.split('/');
    const dirName = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
    const parentId = parentPath ? `dir-${parentPath}` : rootId;

    const filesInDir = filesByFullDir[dirPath] || [];
    const dirCapsule = data.directories && data.directories[dirPath];

    nodes.push({
      id: dirId,
      type: 'capsule',
      data: {
        label: dirName + '/',
        lang: 'directory',
        isDirectory: true,
        fileCount: filesInDir.length,
        exports: [],
        imports: [],
        summary: dirCapsule?.upperLevelSummary || `Contains ${filesInDir.length} files`,
        relativePath: dirPath
      },
      position: { x: 0, y: 0 }
    });

    edges.push({
      id: `${parentId}->${dirId}`,
      source: parentId,
      target: dirId,
      type: 'straight',
      style: { stroke: '#48bb78', strokeWidth: 12, opacity: 0.8 },
    });
  });

  // Add files to their respective directories
  Object.entries(filesByFullDir).forEach(([dirPath, files]) => {
    const parentId = dirPath === '.' ? rootId : `dir-${dirPath}`;

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
          summary: file.upperLevelSummary || file.summaryContext?.fileDocstring,
          lowerLevelSummary: file.lowerLevelSummary,
          exports: file.exports.map(e => e.name),
          imports: file.imports.map(i => i.pathOrModule),
          topSymbols: file.topSymbols,
          previewCode: file.summaryContext?.firstNLines,
          structure: file.structure,
          isAnalyzing: file.isAnalyzing
        },
        position: { x: 0, y: 0 }
      });

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

  // Add dependency edges
  Object.entries(data.files).forEach(([filePath, file]) => {
    if (file.summaryContext?.usedBy) {
      file.summaryContext.usedBy.forEach((usedByPath: string) => {
        if (nodes.find(n => n.id === usedByPath)) {
          const traffic = (file.summaryContext?.usedBy?.length || 1);
          const depWidth = Math.min(Math.max(6, traffic * 3), 18);

          edges.push({
            id: `dep-${usedByPath}->${filePath}`,
            source: usedByPath,
            target: filePath,
            type: 'straight',
            animated: true,
            style: {
              stroke: '#63b3ed',
              strokeWidth: depWidth,
              opacity: 1,
              strokeDasharray: '5 5'
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
  const simulationEdges = edges.map(edge => ({ ...edge, source: edge.source, target: edge.target }));

  const filesPerDir: Record<string, number> = {};
  const inDegree: Record<string, number> = {};

  edges.forEach(e => {
    if (e.data?.isDependency) {
      inDegree[e.target] = (inDegree[e.target] || 0) + 1;
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
    .force('charge', forceManyBody().strength(-3000))
    .force('collide', forceCollide().radius(180).strength(0.8))
    .force('radial', forceRadial((d: any) => {
      if (d.data.isRoot) return 0;
      if (inDegree[d.id] && inDegree[d.id] > 2) return 300;
      if (d.data.isDirectory) return 550;
      return 850;
    }, 0, 0).strength(1.0))
    .force('link', forceLink(simulationEdges as any)
      .id((d: any) => d.id)
      .distance((d: any) => d.data?.isDependency ? 100 : 300)
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
        const { nodes: rawNodes, edges: rawEdges } = prepareGraphData(data);
        const { nodes: layoutedNodes, edges: layoutedEdges } = applyForceLayout(rawNodes, rawEdges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setLoading(false);
      }

      if (message.type === 'updateFileSummary') {
        const { relativePath, summary } = message.data;

        // Update capsules state
        setCapsules(prev => {
          if (!prev) return prev;
          const updatedFiles = { ...prev.files };
          if (updatedFiles[relativePath]) {
            updatedFiles[relativePath] = {
              ...updatedFiles[relativePath],
              summary
            };
          }
          return { ...prev, files: updatedFiles };
        });

        // Update nodes state
        setNodes(prev => prev.map(node => {
          if (node.data.relativePath === relativePath) {
            return {
              ...node,
              data: {
                ...node.data,
                summary
              }
            };
          }
          return node;
        }));
      }

      // Handle deep analysis loading
      if (message.type === 'deepAnalysisLoading') {
        const { relativePath } = message.data;
        setNodes(prev => prev.map(node => {
          if (node.data.relativePath === relativePath) {
            return { ...node, data: { ...node.data, isAnalyzing: true } };
          }
          return node;
        }));
      }

      // Handle deep analysis result
      if (message.type === 'updateDeepAnalysis') {
        const { relativePath, lowerLevelSummary, structure } = message.data;

        setCapsules(prev => {
          if (!prev) return prev;
          const updatedFiles = { ...prev.files };
          if (updatedFiles[relativePath]) {
            updatedFiles[relativePath] = {
              ...updatedFiles[relativePath],
              lowerLevelSummary,
              structure,
              isAnalyzing: false
            };
          }
          return { ...prev, files: updatedFiles };
        });

        setNodes(prev => prev.map(node => {
          if (node.data.relativePath === relativePath) {
            return {
              ...node,
              data: {
                ...node.data,
                summary: node.data.summary, // Keep existing upper-level summary
                lowerLevelSummary,          // Store lower-level summary separately
                structure,
                isAnalyzing: false
              }
            };
          }
          return node;
        }));
      }

      // Handle directory summary update
      if (message.type === 'updateDirectorySummary') {
        const { relativePath, summary } = message.data;

        // Update capsules state (directories)
        setCapsules(prev => {
          if (!prev) return prev;
          const updatedDirs = { ...prev.directories };
          if (!updatedDirs[relativePath]) {
            // Create if missing (edge case)
            updatedDirs[relativePath] = {
              path: relativePath,
              relativePath,
              name: relativePath.split('/').pop() || relativePath,
              files: [],
              subdirectories: []
            };
          }
          updatedDirs[relativePath] = {
            ...updatedDirs[relativePath],
            upperLevelSummary: summary
          };
          return { ...prev, directories: updatedDirs };
        });

        // Update nodes state
        setNodes(prev => prev.map(node => {
          if (node.data.isDirectory && node.data.relativePath === relativePath) {
            return {
              ...node,
              data: {
                ...node.data,
                summary
              }
            };
          }
          return node;
        }));
      }

      // Handle deep analysis error
      if (message.type === 'deepAnalysisError') {
        const { relativePath, error } = message.data;
        console.error('Deep analysis error:', error);
        setNodes(prev => prev.map(node => {
          if (node.data.relativePath === relativePath) {
            return { ...node, data: { ...node.data, isAnalyzing: false } };
          }
          return node;
        }));
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

  const handleNodeClick = (_event: React.MouseEvent, node: FileNode) => {
    // Only open files, not directories or root
    if (node.data.relativePath && !node.data.isDirectory && !node.data.isRoot) {
      vscode.postMessage({ type: 'openFile', relativePath: node.data.relativePath });
    }
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
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ minZoom: 1.7, maxZoom: 4 }}
          minZoom={0.1}
          maxZoom={4}
        >
          <Background color="#1a1a1a" gap={50} />
          <Controls style={{ background: '#1a1a1a' }} />
          <Panel position="top-left" style={{ background: 'rgba(0,0,0,0.6)', padding: '16px', borderRadius: '8px', color: '#fff', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '280px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px', letterSpacing: '1px', color: '#888', textTransform: 'uppercase' }}>blueprint</div>
            <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{capsules?.stats.totalFiles}</span> Files • <span style={{ color: '#fff', fontWeight: 'bold' }}>{capsules?.stats.totalDirectories}</span> Folders
            </div>
            {capsules?.stats.externalDependencies && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', marginTop: '8px' }}>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>TECH STACK</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {capsules.stats.externalDependencies.slice(0, 8).map(dep => (
                    <span key={dep} style={{ fontSize: '11px', background: '#222', padding: '3px 6px', borderRadius: '4px', color: '#bbb' }}>
                      {dep}
                    </span>
                  ))}
                  {capsules.stats.externalDependencies.length > 8 && (
                    <span style={{ fontSize: '10px', color: '#666', padding: '3px 6px' }}>+{capsules.stats.externalDependencies.length - 8}</span>
                  )}
                </div>
              </div>
            )}
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
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
