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
  ReactFlowInstance
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
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './components/ui/card';
import { ScrollArea } from './components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { cn } from './lib/utils';

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
    projectOverview?: string;
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
  aggregateRisk?: 'low' | 'medium' | 'high' | 'critical';
}

type FileNode = Node<FileNodeData>;

// --- STICKY NOTE DATA ---
interface StickyNodeData {
  text: string;
  color: string;
  isSticky: true;
}

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
    <Card
      className={cn(
        "group cursor-pointer border-2 transition-all hover:-translate-y-0.5 hover:shadow-lg",
        "bg-gradient-to-br"
      )}
      style={{
        background: colors.bg,
        borderColor: riskColors ? riskColors.border : colors.border,
      }}
    >
      <CardContent className="space-y-3 p-4" onClick={onClick}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{colors.icon}</span>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{block.name}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {block.type}
              </Badge>
              {riskAnalysis && (
                <Badge
                  className="text-[14px] uppercase"
                  style={{
                    background: riskColors?.bg,
                    borderColor: riskColors?.border,
                    color: riskColors?.text,
                  }}
                >
                  {riskColors?.icon} {riskAnalysis.riskLevel}
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Lines {block.startLine} - {block.endLine}
            </div>
            <div className="text-md text-foreground/80">{block.summary}</div>
          </div>
        </div>
      </CardContent>

      {riskAnalysis && riskAnalysis.risks.length > 0 && (
        <CardFooter className="flex flex-col gap-3 border-t border-border/60 px-4 pb-4 pt-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setShowRiskDetails(!showRiskDetails);
            }}
          >
            <span>{showRiskDetails ? '▼' : '▶'}</span>
            <span className="ml-2">
              {riskAnalysis.risks.length} Risk{riskAnalysis.risks.length > 1 ? 's' : ''} Found
            </span>
            {riskAnalysis.bestPractices.length > 0 && (
              <span className="ml-auto text-emerald-300">
                💡 {riskAnalysis.bestPractices.length} suggestion{riskAnalysis.bestPractices.length > 1 ? 's' : ''}
              </span>
            )}
          </Button>

          {showRiskDetails && (
            <div className="space-y-3">
              {riskAnalysis.risks.map((risk, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-background/40 p-3"
                  style={{ borderLeft: `3px solid ${riskLevelColors[risk.severity]?.border || '#888'}` }}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold capitalize">
                    <span>{riskTypeIcons[risk.type] || '⚠️'}</span>
                    <span>{risk.type.replace('_', ' ')}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase"
                      style={{
                        background: riskLevelColors[risk.severity]?.bg,
                        color: riskLevelColors[risk.severity]?.text,
                      }}
                    >
                      {risk.severity}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{risk.description}</div>
                </div>
              ))}

              {riskAnalysis.bestPractices.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-emerald-300">💡 Suggestions</div>
                  {riskAnalysis.bestPractices.map((bp, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3"
                    >
                      <div className="text-xs font-semibold text-emerald-200">{bp.practice}</div>
                      <div className="text-xs text-emerald-100/80">{bp.suggestion}</div>
                      {bp.reference && (
                        <div className="text-[10px] text-emerald-100/60">📚 {bp.reference}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground italic">
                {riskAnalysis.summary}
              </div>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
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

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <Card
        onClick={(e) => e.stopPropagation()}
        className="h-[85vh] w-[90vw] max-w-6xl overflow-hidden border-2 bg-background/95"
        style={{ borderColor: colors.border }}
      >
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border/60">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{colors.icon}</span>
            <div>
              <CardTitle className="text-2xl">{data.label}</CardTitle>
              <CardDescription className="font-mono text-xs">{data.relativePath}</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ×
          </Button>
        </CardHeader>

        <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as 'summary' | 'diagram')} className="flex h-full flex-col">
          <TabsList className="mx-6 mt-4 grid w-[260px] grid-cols-2">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="diagram">Diagram</TabsTrigger>
          </TabsList>

          <div className="flex-1 px-6 pb-6">
            <TabsContent value="summary" className="h-full">
              <ScrollArea className="h-[68vh] pr-6">
                <div className="mx-auto max-w-3xl space-y-6 text-lg leading-relaxed text-muted-foreground">
                  <div className="text-base text-foreground/90">
                    {data.summary || "No summary available."}
                  </div>
                  {data.fullCapsule?.upperLevelSummary && data.summary !== data.fullCapsule.upperLevelSummary && (
                    <Card className="border-border/70 bg-muted/50">
                      <CardContent className="p-4 italic">{data.fullCapsule.upperLevelSummary}</CardContent>
                    </Card>
                  )}

                  {!data.isDirectory && !data.isRoot && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="border-border/70 bg-card/90">
                        <CardHeader className="pb-2">
                          <CardDescription>Language</CardDescription>
                          <CardTitle className="text-xl" style={{ color: colors.border }}>
                            {data.lang}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="border-border/70 bg-card/90">
                        <CardHeader className="pb-2">
                          <CardDescription>Dependencies</CardDescription>
                          <CardTitle className="text-xl">
                            {data.imports.length}
                            <span className="ml-1 text-sm text-muted-foreground">modules</span>
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  )}

                  {data.relativePath && !data.isDirectory && !data.isRoot && (
                    <Button
                      className="w-full"
                      onClick={() => vscode.postMessage({ type: 'openFile', relativePath: data.relativePath })}
                    >
                      Open in Editor →
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="diagram" className="h-full">
              <div className="flex h-[68vh] gap-4">
                {!data.isDirectory && !data.isRoot ? (
                  <>
                    <Card className="flex w-[220px] flex-col border-border/70 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">Imports</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <ScrollArea className="h-full pr-2">
                          <div className="space-y-2 text-xs">
                            {data.fullCapsule?.imports.map((imp, i) => (
                              <div
                                key={i}
                                className="rounded-md border border-border/70 bg-background/40 px-2 py-2 font-mono"
                              >
                                {imp.pathOrModule}
                              </div>
                            ))}
                            {(!data.fullCapsule?.imports || data.fullCapsule.imports.length === 0) && (
                              <div className="text-center text-xs italic text-muted-foreground">No imports</div>
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <div className="flex items-center text-muted-foreground">→</div>

                    <Card className="flex flex-1 flex-col border-border/70 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">
                          Code Structure ({data.fullCapsule?.structure?.length || 0} blocks)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        {data.fullCapsule?.structure && data.fullCapsule.structure.length > 0 ? (
                          <ScrollArea className="h-full pr-4">
                            <div className="space-y-3">
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
                          </ScrollArea>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                            <div className="text-5xl">🔮</div>
                            <div className="text-base font-semibold text-foreground">Analyze Code Structure</div>
                            <div className="max-w-sm text-xs text-muted-foreground">
                              Generate a deep analysis to see block-level summaries of functions, classes, and code blocks.
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => vscode.postMessage({ type: 'analyzeFile', relativePath: data.relativePath })}
                            >
                              ✨ Generate Deep Analysis
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="flex items-center text-muted-foreground">→</div>

                    <Card className="flex w-[220px] flex-col border-border/70 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">Exports</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <ScrollArea className="h-full pr-2">
                          <div className="space-y-2 text-xs">
                            {data.fullCapsule?.exports.map((exp, i) => (
                              <div
                                key={i}
                                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 font-mono"
                              >
                                {exp.name}
                              </div>
                            ))}
                            {(!data.fullCapsule?.exports || data.fullCapsule.exports.length === 0) && (
                              <div className="text-center text-xs italic text-muted-foreground">No exports</div>
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm italic text-muted-foreground">
                    Directory or Root view details not fully supported yet.
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>
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
  const risk = data.aggregateRisk;
  const riskColor = risk ? riskLevelColors[risk] : null;

  return (
    <div
      className={cn(
        "flex w-80 cursor-pointer flex-col gap-4 rounded-2xl border-2 p-5 text-foreground transition",
        "shadow-lg backdrop-blur-sm",
        isOnPath && "scale-[1.05]"
      )}
      style={{
        background: colors.bg,
        borderColor: isOnPath
          ? "#48bb78"
          : riskColor && (risk === "high" || risk === "critical")
            ? riskColor.border
            : colors.border,
        boxShadow: isOnPath
          ? "0 0 30px rgba(72, 187, 120, 0.6), 0 8px 25px rgba(0,0,0,0.6)"
          : riskColor && (risk === "high" || risk === "critical")
            ? `0 0 20px ${riskColor.bg}, 0 8px 25px rgba(0,0,0,0.6)`
            : "0 8px 25px rgba(0,0,0,0.6)",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ top: '50%', left: '50%', opacity: 0 }} />

      {/* BODY: Summary (hidden for root) */}
      {!data.isRoot && (
        <div className={cn(
          "leading-relaxed text-foreground/90",
          (!data.relativePath || data.relativePath.split('/').length <= 1) && "text-lg",
          (data.relativePath && data.relativePath.split('/').length === 2) && "text-base",
          (data.relativePath && data.relativePath.split('/').length >= 3) && "text-sm",
        )}>
          {data.summary || "No summary available."}
        </div>
      )}

      {/* FOOTER: Icon + Label */}
      <div className="flex items-center gap-3 border-t border-white/10 pt-3">
        <div className="text-base">{colors.icon}</div>
        <div className="flex-1 overflow-hidden">
          <div className="truncate text-xs font-semibold">{data.label}</div>
          {(data.isDirectory || data.isRoot) && (
            <div className="text-[11px] text-foreground/70">{data.fileCount} items</div>
          )}
        </div>
        {risk && (
          <Badge
            className="text-[10px] uppercase"
            style={{
              background: riskColor?.bg,
              borderColor: riskColor?.border,
              color: riskColor?.text,
            }}
          >
            {riskColor?.icon} {risk}
          </Badge>
        )}
      </div>
    </div>
  );
};

// --- STICKY NOTE NODE ---
const StickyNode: React.FC<NodeProps<StickyNodeData>> = ({ data }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.text);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="flex min-h-[120px] w-56 cursor-grab flex-col gap-2 rounded-xl border-2 p-3 shadow-lg"
      style={{
        background: data.color || '#fefcbf',
        borderColor: '#d69e2e',
        color: '#333',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div className="text-xs font-bold uppercase tracking-wide text-black/60">
        📝 Note
      </div>
      {isEditing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          className="min-h-[70px] flex-1 resize-none bg-transparent text-lg outline-none"
        />
      ) : (
        <div className="flex-1 text-lg leading-snug">
          {text || 'Double-click to edit...'}
        </div>
      )}
    </div>
  );
};

// --- DATA PREPARATION ---
// --- DATA PREPARATION ---
const prepareGraphData = (data: CapsulesData) => {
  const nodes: FileNode[] = [];
  const edges: Edge[] = [];
  const rootId = 'root';
  const createdDirs = new Set<string>();

  // Add Root Node
  nodes.push({
    id: rootId,
    type: 'capsule',
    data: { label: 'Project Root', lang: 'root', isRoot: true, fileCount: Object.keys(data.files).length, exports: [], imports: [] },
    position: { x: 0, y: 0 }
  });

  // Helper to ensure directory node exists and is linked
  // Returns the ID of the directory node
  const ensureDirectory = (dirPath: string): string => {
    if (!dirPath || dirPath === '.' || dirPath === '') return rootId;

    // Normalize path just in case, though usually relativePath is clean
    const dirId = `dir:${dirPath}`;
    if (createdDirs.has(dirId)) return dirId;

    const parts = dirPath.split('/');
    const dirName = parts[parts.length - 1];

    // Recursively ensure parent exists
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const parentId = ensureDirectory(parentPath);

    const dirCapsule = data.directories && data.directories[dirPath];

    nodes.push({
      id: dirId,
      type: 'capsule',
      data: {
        label: dirName + '/',
        lang: 'directory',
        isDirectory: true,
        fileCount: 0, // Will update when adding files
        exports: [],
        imports: [],
        summary: dirCapsule?.upperLevelSummary || `Folder: ${dirName}`,
        relativePath: dirPath
      },
      position: { x: 0, y: 0 }
    });

    edges.push({
      id: `${parentId}->${dirId}`,
      source: parentId,
      target: dirId,
      type: 'straight',
      style: { stroke: '#48bb78', strokeWidth: 10, opacity: 0.8 },
    });

    createdDirs.add(dirId);
    return dirId;
  };

  Object.values(data.files).forEach(file => {
    // 1. Ensure directory hierarchy exists
    const parts = file.relativePath.split('/');
    const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const parentId = ensureDirectory(dirPath);

    // 2. Add File Node
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

    // 3. Link to Parent Directory
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

    // 4. Update file counts for ancestors
    let currentDir = dirPath;
    while (currentDir) {
      const dId = `dir:${currentDir}`;
      const dNode = nodes.find(n => n.id === dId);
      if (dNode && dNode.data) {
        dNode.data.fileCount = (dNode.data.fileCount || 0) + 1;
      }
      const p = currentDir.split('/');
      if (p.length <= 1) break;
      p.pop();
      currentDir = p.join('/');
    }
  });

  // Add Dependency Edges
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
    .force('charge', forceManyBody().strength(-2000))
    .force('collide', forceCollide().radius(200).strength(0.8))
    .force('radial', forceRadial((d: any) => {
      if (d.data.isRoot) return 0;
      if (inDegree[d.id] && inDegree[d.id] > 2) return 250;

      const depth = d.data.relativePath ? d.data.relativePath.split('/').length : 1;

      if (d.data.isDirectory) {
        return 250 + (depth * 120);
      }
      return 300 + (depth * 120);
    }, 0, 0).strength(0.8))
    .force('link', forceLink(simulationEdges as any)
      .id((d: any) => d.id)
      .distance((d: any) => d.data?.isDependency ? 100 : 150)
      .strength((d: any) => d.data?.isDependency ? 0.8 : 0.4)
    )
    .force('sector', (alpha) => {
      simulationNodes.forEach((d: any) => {
        if (d.data.isRoot) return;
        if (inDegree[d.id] && inDegree[d.id] > 2) return;

        let dir = '.';
        if (d.data.isDirectory) {
          const rawPath = d.id.replace('dir:', '');
          const parts = rawPath.split('/');
          dir = parts.length > 0 ? parts[0] : '.';
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
  const [stickyCounter, setStickyCounter] = useState(1);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const nodeTypes = useMemo(() => ({ capsule: CapsuleNode, sticky: StickyNode }), []);

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

        // Check if this is an initial load or just an update
        const isUpdate = capsules !== null &&
          Object.keys(data.files).length === Object.keys(capsules.files).length;

        setCapsules(data);

        // Only re-layout if this is the initial load
        if (!isUpdate) {
          const { nodes: rawNodes, edges: rawEdges } = prepareGraphData(data);
          const { nodes: layoutedNodes, edges: layoutedEdges } = applyForceLayout(rawNodes, rawEdges);
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        }
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

        // Update node aggregate risk
        setNodes(currNodes => currNodes.map(node => {
          if (node.data.relativePath === relativePath) {
            // Calculate max risk
            const currentRisk = (node.data.aggregateRisk as string) || 'low';
            const newRisk = analysis.riskLevel;

            const levels = ['low', 'medium', 'high', 'critical'];
            const currentIdx = levels.indexOf(currentRisk);
            const newIdx = levels.indexOf(newRisk);

            const finalRisk = newIdx > currentIdx ? newRisk : currentRisk;

            return {
              ...node,
              data: {
                ...node.data,
                aggregateRisk: finalRisk as any
              }
            };
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

  // Listen for sync messages (Editor -> Graph)
  useEffect(() => {
    if (!reactFlowInstance) return;

    const handleSyncMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'highlightFile') {
        const { relativePath } = message.data;
        const currentNodes = reactFlowInstance.getNodes();
        // ID might be checking both file ID and directory ID structure? 
        // File ID IS relativePath.
        const targetNode = currentNodes.find(n => n.id === relativePath || n.data.relativePath === relativePath);

        if (targetNode) {
          // Highlight node
          setNodes(nds => nds.map(n => ({
            ...n,
            data: {
              ...n.data,
              isHighlight: n.id === targetNode.id
            }
          })));

          // Zoom to node
          reactFlowInstance.fitView({
            nodes: [{ id: targetNode.id }],
            padding: 0.2, // Keep some spacing
            duration: 800,
            maxZoom: 3
          });
        }
      }
    };

    window.addEventListener('message', handleSyncMessage);
    return () => window.removeEventListener('message', handleSyncMessage);
  }, [reactFlowInstance, setNodes]);

  const handleRefresh = () => {
    vscode.postMessage({ type: 'refresh' });
  };

  const handleSettings = () => {
    vscode.postMessage({ type: 'setApiKey' });
  };

  const handleNodeClick = (_event: React.MouseEvent, node: FileNode) => {
    // Don't open overlay for sticky notes
    if (node.type === 'sticky' || (node.data as any).isSticky) {
      return;
    }
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
    // Find the node and set it as selected to open the popup
    const targetNode = nodes.find(n => n.id === nodeId);
    if (targetNode) {
      setSelectedNodeData(targetNode.data as FileNodeData);
    }

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
    const newId = `sticky-${stickyCounter}`;
    setStickyCounter(prev => prev + 1);

    // Position near the center of the current view
    const newNode: Node<StickyNodeData> = {
      id: newId,
      type: 'sticky',
      data: {
        text: '',
        color: '#fefcbf',
        isSticky: true
      },
      position: { x: Math.random() * 400 - 200, y: Math.random() * 400 - 200 },
      draggable: true
    };

    setNodes((nds) => [...nds, newNode as any]);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-foreground">
        <Card className="w-[360px] border-border/70 bg-card/90 text-center">
          <CardContent className="space-y-3 p-6">
            <div className="text-4xl">🔍</div>
            <div className="text-sm text-muted-foreground">Scanning workspace...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center px-6 text-foreground">
        <Card className="w-full max-w-md border-red-500/50 bg-card/90 text-center">
          <CardContent className="space-y-4 p-6">
            <div className="text-4xl">⚠️</div>
            <div className="text-sm text-red-300">{error}</div>
            <Button variant="outline" onClick={handleRefresh}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
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
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <div className="relative flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            minZoom={0.05}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1a1a1a" gap={50} />
            <Controls />
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
