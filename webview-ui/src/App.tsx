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
  NodeProps
} from 'reactflow';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceRadial
} from 'd3-force';
import 'reactflow/dist/style.css';
import Sidebar, { langColors, type SearchResult } from './Sidebar';

// VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// --- TYPES ---
interface CodeBlockSummary {
  name: string;
  type: "function" | "class" | "block";
  startLine: number;
  endLine: number;
  summary: string;
}

// --- RISK ANALYSIS TYPES ---
interface Risk {
  type: 'security' | 'performance' | 'error_handling' | 'concurrency' | 'type_safety' | 'api_misuse';
  description: string;
  severity: 'low' | 'medium' | 'high';
  lineNumbers?: number[];
}

interface BestPractice {
  practice: string;
  suggestion: string;
  reference?: string;
}

interface RiskAnalysis {
  functionName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  risks: Risk[];
  bestPractices: BestPractice[];
  summary: string;
}

interface SymbolData {
  name: string;
  kind: string;
  location?: { start: { line: number } };
  exported?: boolean;
}
interface FunctionCallEdge {
  source: string;
  target: string;
  type: string;
}

interface CapsuleFile {
  relativePath: string;
  name: string;
  lang: string;
  exports: { name: string; kind: string }[];
  imports: { pathOrModule: string; isLocal: boolean }[];
  topSymbols?: SymbolData[];
  // Renamed from summaryContext to metadata to match backend
  metadata?: {
    usedBy: string[];
    dependsOn: string[];
    fileDocstring?: string;
    firstNLines?: string;
    functionSignatures?: { name: string; signature: string; exported: boolean }[];
  };
  summary?: string;
  upperLevelSummary?: string;
  lowerLevelSummary?: string;
  structure?: CodeBlockSummary[];
  edges?: FunctionCallEdge[];
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
  depth?: number;
  // Full capsule access for diagram
  fullCapsule?: CapsuleFile;
}

type FileNode = Node<FileNodeData>;

// Use langColors from Sidebar.tsx (removed local duplicate)


// --- CODE BLOCK CARD COLORS ---
const blockTypeColors: Record<string, { bg: string; border: string; icon: string }> = {
  'function': { bg: '#1a3d1a', border: '#48bb78', icon: '🔧' },
  'class': { bg: '#1a365d', border: '#4299e1', icon: '📦' },
  'block': { bg: '#3d3d00', border: '#f7df1e', icon: '📄' },
};

// --- RISK LEVEL COLORS ---
const riskLevelColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  'low': { bg: '#1a3d1a', border: '#48bb78', text: '#48bb78', icon: '✅' },
  'medium': { bg: '#3d3d1a', border: '#ecc94b', text: '#ecc94b', icon: '⚠️' },
  'high': { bg: '#3d1a1a', border: '#f56565', text: '#f56565', icon: '🔴' },
  'critical': { bg: '#4a1a1a', border: '#e53e3e', text: '#e53e3e', icon: '🚨' },
};

const riskTypeIcons: Record<string, string> = {
  'security': '🔒',
  'performance': '⚡',
  'error_handling': '⚠️',
  'concurrency': '🔄',
  'type_safety': '📝',
  'api_misuse': '🔧',
};

// --- CODE BLOCK CARD COMPONENT ---
const CodeBlockCard: React.FC<{
  block: CodeBlockSummary;
  riskAnalysis?: RiskAnalysis;
  onClick: () => void;
}> = ({ block, riskAnalysis, onClick }) => {
  const [showRiskDetails, setShowRiskDetails] = useState(false);
  const colors = blockTypeColors[block.type] || blockTypeColors.block;
  const riskColors = riskAnalysis ? riskLevelColors[riskAnalysis.riskLevel] : null;

  return (
    <div
      style={{
        padding: '16px 20px',
        borderRadius: '12px',
        background: colors.bg,
        color: '#fff',
        border: riskColors ? `2px solid ${riskColors.border}` : `2px solid ${colors.border}`,
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        marginBottom: '12px',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 20px rgba(0,0,0,0.4)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div onClick={onClick} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>{colors.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '700', fontSize: '16px' }}>{block.name}</span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '4px',
              textTransform: 'uppercase'
            }}>
              {block.type}
            </span>
            {/* Risk Level Badge */}
            {riskAnalysis && (
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                background: riskColors?.bg,
                border: `1px solid ${riskColors?.border}`,
                borderRadius: '12px',
                color: riskColors?.text,
                fontWeight: '600',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {riskColors?.icon} {riskAnalysis.riskLevel}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontFamily: 'monospace' }}>
            Lines {block.startLine} - {block.endLine}
          </div>
          <div style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.5' }}>
            {block.summary}
          </div>
        </div>
      </div>

      {/* Risk Analysis Section */}
      {riskAnalysis && riskAnalysis.risks.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowRiskDetails(!showRiskDetails); }}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: riskColors?.text || '#888',
              padding: '8px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%'
            }}
          >
            <span>{showRiskDetails ? '▼' : '▶'}</span>
            <span>{riskAnalysis.risks.length} Risk{riskAnalysis.risks.length > 1 ? 's' : ''} Found</span>
            {riskAnalysis.bestPractices.length > 0 && (
              <span style={{ marginLeft: 'auto', color: '#48bb78' }}>
                💡 {riskAnalysis.bestPractices.length} suggestion{riskAnalysis.bestPractices.length > 1 ? 's' : ''}
              </span>
            )}
          </button>

          {showRiskDetails && (
            <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s' }}>
              {/* Risks */}
              {riskAnalysis.risks.map((risk, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  borderLeft: `3px solid ${riskLevelColors[risk.severity]?.border || '#888'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span>{riskTypeIcons[risk.type] || '⚠️'}</span>
                    <span style={{ fontWeight: '600', fontSize: '12px', textTransform: 'capitalize' }}>
                      {risk.type.replace('_', ' ')}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      background: riskLevelColors[risk.severity]?.bg,
                      color: riskLevelColors[risk.severity]?.text,
                      borderRadius: '4px',
                      textTransform: 'uppercase'
                    }}>
                      {risk.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#bbb', lineHeight: '1.4' }}>
                    {risk.description}
                  </div>
                </div>
              ))}

              {/* Best Practices */}
              {riskAnalysis.bestPractices.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#48bb78', fontWeight: '600', marginBottom: '8px' }}>
                    💡 Suggestions
                  </div>
                  {riskAnalysis.bestPractices.map((bp, i) => (
                    <div key={i} style={{
                      padding: '10px 12px',
                      background: 'rgba(72, 187, 120, 0.1)',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #48bb78'
                    }}>
                      <div style={{ fontWeight: '600', fontSize: '12px', color: '#48bb78', marginBottom: '4px' }}>
                        {bp.practice}
                      </div>
                      <div style={{ fontSize: '12px', color: '#bbb', lineHeight: '1.4' }}>
                        {bp.suggestion}
                      </div>
                      {bp.reference && (
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                          📚 {bp.reference}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div style={{
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#999',
                fontStyle: 'italic'
              }}>
                {riskAnalysis.summary}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- NODE DETAILS OVERLAY COMPONENT ---
const NodeDetailsOverlay: React.FC<{
  data: FileNodeData;
  onClose: () => void;
  riskAnalyses: Map<string, Map<string, RiskAnalysis>>;
}> = ({ data, onClose, riskAnalyses }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'diagram'>('summary');
  const colors = langColors[data.lang] || langColors.other;

  const handleScroll = (e: React.WheelEvent) => {
    e.stopPropagation();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 0.2s'
    }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: '1200px',
          height: '85vh',
          background: '#0a0a0a',
          borderRadius: '24px',
          border: `2px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 50px 100px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: 'scaleIn 0.2s'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '24px',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '42px' }}>{colors.icon}</span>
            <div>
              <span style={{ fontWeight: '800', fontSize: '32px', display: 'block', lineHeight: 1 }}>{data.label}</span>
              <span style={{ fontSize: '14px', color: '#888', fontFamily: 'monospace', marginTop: '4px', display: 'block' }}>{data.relativePath}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '32px', padding: '0 10px' }}
          >
            ×
          </button>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
          {[
            { id: 'summary', label: 'Summary' },
            { id: 'diagram', label: 'Diagram' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'summary' | 'diagram')}
              style={{
                flex: 1,
                padding: '20px',
                background: activeTab === tab.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: 'none',
                color: activeTab === tab.id ? '#fff' : '#888',
                borderBottom: activeTab === tab.id ? `4px solid ${colors.border}` : '4px solid transparent',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '700',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div
          className="nowheel"
          onWheel={handleScroll}
          style={{ padding: '32px', overflowY: 'auto', background: '#0a0a0a', flex: 1 }}
        >
          {activeTab === 'summary' && (
            <div style={{ animation: 'fadeIn 0.2s', maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ fontSize: '20px', lineHeight: '1.7', color: '#ddd', marginBottom: '32px' }}>
                {data.summary || "No summary available."}
                {data.fullCapsule?.upperLevelSummary && data.summary !== data.fullCapsule.upperLevelSummary && (
                  <div style={{ marginTop: '24px', padding: '16px', background: '#151515', borderRadius: '8px', fontStyle: 'italic', color: '#aaa', borderLeft: '4px solid #333' }}>
                    {data.fullCapsule.upperLevelSummary}
                  </div>
                )}
              </div>
              {!data.isDirectory && !data.isRoot && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                  <div style={{ padding: '20px', background: '#151515', borderRadius: '16px', border: '1px solid #222' }}>
                    <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Language</div>
                    <div style={{ fontSize: '24px', color: colors.border, fontWeight: 'bold' }}>{data.lang}</div>
                  </div>
                  <div style={{ padding: '20px', background: '#151515', borderRadius: '16px', border: '1px solid #222' }}>
                    <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Dependencies</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{data.imports.length} <span style={{ fontSize: '16px', color: '#666', fontWeight: 'normal' }}>modules</span></div>
                  </div>
                </div>
              )}
              {data.relativePath && !data.isDirectory && !data.isRoot && (
                <button
                  onClick={() => {
                    vscode.postMessage({ type: 'openFile', relativePath: data.relativePath });
                  }}
                  style={{
                    width: '100%',
                    padding: '18px',
                    background: '#007acc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0062a3'}
                  onMouseLeave={e => e.currentTarget.style.background = '#007acc'}
                >
                  <span>Open in Editor</span>
                  <span>→</span>
                </button>
              )}
            </div>
          )}

          {activeTab === 'diagram' && (
            <div style={{ animation: 'fadeIn 0.2s', height: '100%', display: 'flex', gap: '24px', alignItems: 'stretch' }}>
              {!data.isDirectory && !data.isRoot ? (
                <>
                  {/* IMPORTS */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
                    <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Imports</div>
                    <div style={{ flex: 1, background: '#111', borderRadius: '16px', padding: '16px', overflowY: 'auto', border: '1px solid #222' }}>
                      {data.fullCapsule?.imports.map((imp, i) => (
                        <div key={i} style={{ padding: '12px', background: '#1a1a1a', marginBottom: '8px', borderRadius: '8px', fontSize: '14px', borderLeft: '3px solid #666', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {imp.pathOrModule}
                        </div>
                      ))}
                      {(!data.fullCapsule?.imports || data.fullCapsule.imports.length === 0) && (
                        <div style={{ color: '#444', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>No imports</div>
                      )}
                    </div>
                  </div>

                  {/* ARROW */}
                  <div style={{ display: 'flex', alignItems: 'center', color: '#333', fontSize: '24px' }}>→</div>

                  {/* CODE BLOCKS */}
                  <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
                    <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Code Structure ({data.fullCapsule?.structure?.length || 0} blocks)
                    </div>
                    {data.fullCapsule?.structure && data.fullCapsule.structure.length > 0 ? (
                      <div style={{ flex: 1, background: '#111', borderRadius: '16px', padding: '16px', overflowY: 'auto', border: '1px solid #222' }}>
                        {data.fullCapsule.structure.map((block, i) => {
                          const fileRisks = data.relativePath ? riskAnalyses.get(data.relativePath) : undefined;
                          const blockRisk = fileRisks?.get(block.name);
                          return (
                            <CodeBlockCard
                              key={i}
                              block={block}
                              riskAnalysis={blockRisk}
                              onClick={() => {
                                vscode.postMessage({
                                  type: 'openFile',
                                  relativePath: data.relativePath,
                                  startLine: block.startLine,
                                  endLine: block.endLine
                                });
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#151515', borderRadius: '16px', border: `1px solid ${colors.border}`, padding: '40px' }}>
                        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔮</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#eee' }}>Analyze Code Structure</div>
                        <div style={{ color: '#888', textAlign: 'center', marginBottom: '32px', maxWidth: '300px' }}>
                          Generate a deep analysis to see block-level summaries of functions, classes, and code blocks.
                        </div>

                        <button
                          onClick={() => {
                            vscode.postMessage({ type: 'analyzeFile', relativePath: data.relativePath });
                          }}
                          style={{
                            padding: '16px 32px',
                            background: 'transparent',
                            border: `2px dashed ${colors.border}`,
                            color: colors.border,
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>✨</span>
                          Generate Deep Analysis
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ARROW */}
                  <div style={{ display: 'flex', alignItems: 'center', color: '#333', fontSize: '24px' }}>→</div>

                  {/* EXPORTS */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
                    <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Exports</div>
                    <div style={{ flex: 1, background: '#111', borderRadius: '16px', padding: '16px', overflowY: 'auto', border: '1px solid #222' }}>
                      {data.fullCapsule?.exports.map((exp, i) => (
                        <div key={i} style={{ padding: '12px', background: '#1a3d1a', marginBottom: '8px', borderRadius: '8px', fontSize: '14px', borderLeft: '3px solid #48bb78', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {exp.name}
                        </div>
                      ))}
                      {(!data.fullCapsule?.exports || data.fullCapsule.exports.length === 0) && (
                        <div style={{ color: '#444', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>No exports</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: '#666', fontStyle: 'italic', fontSize: '16px', textAlign: 'center', width: '100%', marginTop: '40px' }}>
                  Directory or Root view details not fully supported yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

// --- SIMPLIFIED CAPSULE NODE ---
const CapsuleNode: React.FC<NodeProps<FileNodeData>> = ({ data }) => {
  const getColors = () => {
    if (data.isRoot) return langColors.root;
    if (data.isDirectory) return langColors.directory;
    return langColors[data.lang] || langColors.other;
  };
  const colors = getColors();

  // Check if this node is on a highlighted path
  const isOnPath = (data as any).isOnPath;

  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '24px',
        background: colors.bg,
        color: '#fff',
        border: isOnPath ? `4px solid #48bb78` : `3px solid ${colors.border}`,
        boxShadow: isOnPath
          ? '0 0 30px rgba(72, 187, 120, 0.6), 0 8px 25px rgba(0,0,0,0.6)'
          : '0 8px 25px rgba(0,0,0,0.6)',
        width: 320,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s, border 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        transform: isOnPath ? 'scale(1.05)' : 'scale(1)'
      }}
      className="capsule-node-hover"
    >
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />

      {/* BODY: Summary (hidden for root) */}
      {!data.isRoot && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '24px', lineHeight: '1.5', color: '#fff', fontWeight: '500' }}>
            {data.summary || "No summary available."}
          </div>
        </div>
      )}

      {/* FOOTER: Icon + Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
        <div style={{ fontSize: '16px' }}>{colors.icon}</div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.label}</div>
          {(data.isDirectory || data.isRoot) && (
            <div style={{ fontSize: '12px', opacity: 0.7 }}>{data.fileCount} items</div>
          )}
        </div>
      </div>
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
      });
    }

    files.forEach(file => {
      const fileId = file.relativePath;

      const importCount = file.imports.length || 0;
      const usedByCount = file.metadata?.usedBy?.length || 0;
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
          summary: file.lowerLevelSummary || file.upperLevelSummary || file.metadata?.fileDocstring,
          exports: file.exports.map(e => e.name),
          imports: file.imports.map(i => i.pathOrModule),
          topSymbols: file.topSymbols,
          previewCode: file.metadata?.firstNLines,
          fullCapsule: file,
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
    if (file.metadata?.usedBy) {
      file.metadata.usedBy.forEach(usedByPath => {
        if (nodes.find(n => n.id === usedByPath)) {
          const traffic = (file.metadata?.usedBy?.length || 1);
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
  const [selectedNodeData, setSelectedNodeData] = useState<FileNodeData | null>(null);
  const [showStructure, setShowStructure] = useState(true);
  const [fileTypes, setFileTypes] = useState<Record<string, boolean>>({
    'react-typescript': true, 'typescript': true, 'javascript': true, 'css': true,
    'json': true, 'markdown': true, 'directory': true, 'sticky': true
  });
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  // Risk analysis cache: Map<relativePath, Map<functionName, RiskAnalysis>>
  const [riskAnalyses, setRiskAnalyses] = useState<Map<string, Map<string, RiskAnalysis>>>(new Map());

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

        // Update nodes state (No capsules state anymore)

        // Update nodes state
        setNodes((prev: FileNode[]) => prev.map((node: FileNode) => {
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
      if (message.type === 'updateFileStructure') {
        const { relativePath, structure, lowerLevelSummary } = message.data;

        // Update nodes to reflect change immediately (No capsules state anymore)

        // Update nodes to reflect change immediately
        setNodes((nds: FileNode[]) => nds.map((node: FileNode) => {
          if (node.data.relativePath === relativePath) {
            return {
              ...node,
              data: {
                ...node.data,
                structure,
                lowerLevelSummary,
                fullCapsule: node.data.fullCapsule ? {
                  ...node.data.fullCapsule,
                  structure,
                  lowerLevelSummary,
                  edges: message.data.edges
                } : undefined
              }
            };
          }
          return node;
        }));

        // IMPORTANT: Update selectedNodeData separately using functional update 
        // to avoid stale closure issues
        setSelectedNodeData(prev => {
          if (prev && prev.relativePath === relativePath) {
            const updatedCapsule = prev.fullCapsule ? {
              ...prev.fullCapsule,
              structure,
              lowerLevelSummary,
              edges: message.data.edges
            } : {
              relativePath,
              name: prev.label,
              lang: prev.lang,
              exports: [],
              imports: [],
              structure,
              lowerLevelSummary,
              edges: message.data.edges
            } as any;

            return {
              ...prev,
              fullCapsule: updatedCapsule
            };
          }
          return prev;
        });
      }
      if (message.type === 'updateDirectorySummary') {
        const { relativePath, summary } = message.data;

        // Update capsules state (No capsules state anymore, we'll just update nodes)

        // Update nodes state
        setNodes((nds: FileNode[]) => nds.map((node: FileNode) => {
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

      // Handle risk analysis updates
      if (message.type === 'updateFunctionRisk') {
        const { relativePath, functionName, analysis } = message.data as {
          relativePath: string;
          functionName: string;
          analysis: RiskAnalysis;
        };

        setRiskAnalyses(prev => {
          const newMap = new Map(prev);
          if (!newMap.has(relativePath)) {
            newMap.set(relativePath, new Map());
          }
          newMap.get(relativePath)!.set(functionName, analysis);
          return newMap;
        });

        console.log(`[Webview] Received risk analysis for ${relativePath}:${functionName} - ${analysis.riskLevel}`);
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
    setSelectedNodeData(node.data);
  };

  const handleSearch = (term: string) => {
    const lowerTerm = term.toLowerCase();
    const results: SearchResult[] = [];
    setNodes((nds: FileNode[]) => nds.map((node: FileNode) => {
      const data = node.data as FileNodeData;
      if (!lowerTerm) return { ...node, data: { ...data, isDimmed: false, isHighlight: false } };
      const isMatch = (data.label?.toLowerCase().includes(lowerTerm)) ||
        (data.summary?.toLowerCase().includes(lowerTerm)) ||
        (data.relativePath?.toLowerCase().includes(lowerTerm));
      if (isMatch && !data.isDirectory && !data.isRoot) {
        results.push({ id: node.id, label: data.label, lang: data.lang, matchType: 'match' });
      }
      return { ...node, data: { ...data, isDimmed: !isMatch, isHighlight: !!isMatch } };
    }));
    setSearchResults(results);
  };

  const handleClickResult = (nodeId: string) => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data as FileNodeData, isHighlight: n.id === nodeId }
    })));
  };

  // Calculate path from root to a file and highlight all nodes/edges on that path
  const handleHoverResult = (nodeId: string | null) => {
    if (!nodeId) {
      // Clear all path highlights
      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data as FileNodeData, isOnPath: false }
      })));
      setEdges(eds => eds.map(e => ({
        ...e,
        style: {
          ...e.style,
          stroke: e.data?.isDependency ? '#63b3ed' : '#888',
          opacity: e.data?.isDependency ? 1 : (e.style?.opacity || 0.5)
        }
      })));
      return;
    }

    // Calculate path: root -> directory (if any) -> file
    const pathNodeIds = new Set<string>();
    const pathEdgeIds = new Set<string>();

    pathNodeIds.add(nodeId); // The file itself
    pathNodeIds.add('root'); // Always include root

    // Find the parts of the path
    const parts = nodeId.split('/');
    if (parts.length > 1) {
      // File is in a directory
      const dirId = `dir-${parts[0]}`;
      pathNodeIds.add(dirId);
      pathEdgeIds.add(`root->${dirId}`);
      pathEdgeIds.add(`${dirId}->${nodeId}`);
    } else {
      // File is in root
      pathEdgeIds.add(`root->${nodeId}`);
    }

    // Highlight nodes on path
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data as FileNodeData, isOnPath: pathNodeIds.has(n.id) }
    })));

    // Highlight edges on path
    setEdges(eds => eds.map(e => {
      const isOnPath = pathEdgeIds.has(e.id);
      return {
        ...e,
        style: {
          ...e.style,
          stroke: isOnPath ? '#48bb78' : (e.data?.isDependency ? '#63b3ed' : '#888'),
          opacity: isOnPath ? 1 : 0.2,
          strokeWidth: isOnPath ? 16 : (e.style?.strokeWidth || 6)
        },
        animated: isOnPath || e.data?.isDependency
      };
    }));
  };

  const toggleFileType = (type: string) => {
    setFileTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleAddSticky = () => {
    // Placeholder for sticky note creation
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
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: '#ff6b6b',
        fontSize: '18px',
        padding: '32px',
        textAlign: 'center'
      }}>
        <div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          {error}
          <br />
          <button onClick={handleRefresh} style={{ marginTop: '20px', padding: '10px 20px', background: '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0a0a0a', overflow: 'hidden' }}>
      <Sidebar
        capsules={capsules}
        onSearch={handleSearch}
        showStructure={showStructure}
        onToggleStructure={setShowStructure}
        fileTypes={fileTypes}
        toggleFileType={toggleFileType}
        searchResults={searchResults}
        onClickResult={handleClickResult}
        onHoverResult={handleHoverResult}
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
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            minZoom={0.05}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1a1a1a" gap={50} />
            <Controls style={{ background: '#1a1a1a' }} />
          </ReactFlow>
        </ReactFlowProvider>
        {selectedNodeData && (
          <NodeDetailsOverlay
            data={selectedNodeData}
            onClose={() => setSelectedNodeData(null)}
            riskAnalyses={riskAnalyses}
          />
        )}
      </div>
    </div>
  );
}
