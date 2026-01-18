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
import { stratify, tree } from 'd3-hierarchy';
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
  upperLevelSummaryVersion?: string;
  lowerLevelSummary?: string;
  lowerLevelSummaryVersion?: string;
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
  upperLevelSummaryVersion?: string;
  lowerLevelSummaryVersion?: string;
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
const blockTypeColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  'function': { bg: 'hsl(var(--block-function-bg))', border: 'hsl(var(--block-function-border))', text: 'hsl(var(--block-function-text))', icon: '🔧' },
  'class': { bg: 'hsl(var(--block-class-bg))', border: 'hsl(var(--block-class-border))', text: 'hsl(var(--block-class-text))', icon: '📦' },
  'block': { bg: 'hsl(var(--block-generic-bg))', border: 'hsl(var(--block-generic-border))', text: 'hsl(var(--block-generic-text))', icon: '📄' },
};

// --- RISK LEVEL COLORS ---
const riskLevelColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  'low': { bg: 'hsl(var(--risk-low-bg))', border: 'hsl(var(--risk-low-border))', text: 'hsl(var(--risk-low-text))', icon: '✅' },
  'medium': { bg: 'hsl(var(--risk-medium-bg))', border: 'hsl(var(--risk-medium-border))', text: 'hsl(var(--risk-medium-text))', icon: '⚠️' },
  'high': { bg: 'hsl(var(--risk-high-bg))', border: 'hsl(var(--risk-high-border))', text: 'hsl(var(--risk-high-text))', icon: '🔴' },
  'critical': { bg: 'hsl(var(--risk-critical-bg))', border: 'hsl(var(--risk-critical-border))', text: 'hsl(var(--risk-critical-text))', icon: '🚨' },
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
      <CardContent className="space-y-3 p-4" onClick={onClick} style={{ color: colors.text }}>
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
                  <div className="text-[11px] font-semibold text-foreground">💡 Suggestions</div>
                  {riskAnalysis.bestPractices.map((bp, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border/70 bg-muted/60 p-3 text-foreground"
                    >
                      <div className="text-xs font-semibold">{bp.practice}</div>
                      <div className="text-xs text-muted-foreground">{bp.suggestion}</div>
                      {bp.reference && (
                        <div className="text-[10px] text-muted-foreground">📚 {bp.reference}</div>
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
// --- FEEDBACK WIDGET ---
const FeedbackWidget: React.FC<{
  category: "capsuleSummary" | "deepAnalysis";
  versionId?: string;
  onFeedback: (rating: 1 | -1, reason?: string) => void;
}> = ({ category, versionId, onFeedback }) => {
  const [showReasons, setShowReasons] = useState(false);

  if (!versionId) return null;

  const reasons = [
    { id: 'verbosity', label: 'Too Verbose/Long' },
    { id: 'accuracy', label: 'Inaccurate' },
    { id: 'clarity', label: 'Unclear' },
    { id: 'completeness', label: 'Missing Info' }
  ];

  return (
    <div style={{
      marginTop: '24px',
      padding: '16px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '14px', color: '#888' }}>
          Was this {category === 'capsuleSummary' ? 'summary' : 'analysis'} helpful?
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onFeedback(1)}
            style={{
              background: 'rgba(72, 187, 120, 0.1)',
              border: '1px solid #48bb78',
              color: '#48bb78',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
            title="Helpful"
          >
            👍
          </button>
          <button
            onClick={() => setShowReasons(!showReasons)}
            style={{
              background: 'rgba(245, 101, 101, 0.1)',
              border: '1px solid #f56565',
              color: '#f56565',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
            title="Not Helpful"
          >
            👎
          </button>
        </div>
      </div>

      {showReasons && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', animation: 'fadeIn 0.2s' }}>
          {reasons.map(reason => (
            <button
              key={reason.id}
              onClick={() => {
                onFeedback(-1, reason.id);
                setShowReasons(false);
              }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#ccc',
                padding: '6px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: '10px', color: '#555', fontFamily: 'monospace' }}>
        Model Config: {versionId}
      </div>
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
                  <FeedbackWidget
                    category={data.fullCapsule?.lowerLevelSummary === data.summary ? "deepAnalysis" : "capsuleSummary"}
                    versionId={data.fullCapsule?.lowerLevelSummary === data.summary
                      ? data.lowerLevelSummaryVersion || data.fullCapsule?.lowerLevelSummaryVersion
                      : data.upperLevelSummaryVersion || data.fullCapsule?.upperLevelSummaryVersion}
                    onFeedback={(rating, reason) => {
                      vscode.postMessage({
                        type: 'submitFeedback',
                        category: data.fullCapsule?.lowerLevelSummary === data.summary ? "deepAnalysis" : "capsuleSummary",
                        versionId: data.fullCapsule?.lowerLevelSummary === data.summary
                          ? data.lowerLevelSummaryVersion || data.fullCapsule?.lowerLevelSummaryVersion
                          : data.upperLevelSummaryVersion || data.fullCapsule?.upperLevelSummaryVersion,
                        rating,
                        reason
                      });
                    }}
                  />
                  {data.fullCapsule?.upperLevelSummary && data.summary !== data.fullCapsule.upperLevelSummary && (
                    <Card className="border-border/70 bg-muted/50">
                      <CardContent className="p-4 italic">
                        {data.fullCapsule.upperLevelSummary}
                        <FeedbackWidget
                          category="capsuleSummary"
                          versionId={data.fullCapsule.upperLevelSummaryVersion}
                          onFeedback={(rating, reason) => {
                            vscode.postMessage({
                              type: 'submitFeedback',
                              category: 'capsuleSummary',
                              versionId: data.fullCapsule?.upperLevelSummaryVersion,
                              rating,
                              reason
                            });
                          }}
                        />
                      </CardContent>
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
              <div className="flex h-[68vh] w-full gap-4">
                {!data.isDirectory && !data.isRoot ? (
                  <>
                    <Card className="flex w-[220px] min-h-0 flex-col border-border/70 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">Imports</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0">
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

                    <Card className="flex min-h-0 flex-1 flex-col border-border/70 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">
                          Code Structure ({data.fullCapsule?.structure?.length || 0} blocks)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0">
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

                    <Card className="flex w-[220px] min-h-0 flex-col border-border/70 bg-card/90">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase text-muted-foreground">Exports</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0">
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
      <div className={cn("flex items-center gap-3 pt-3", !data.isRoot && "border-t border-white/10")}>
        <div className="text-base">{colors.icon}</div>
        <div className="flex-1 overflow-hidden">
          <div className={cn("truncate font-semibold", data.isRoot ? "text-lg" : "text-xs")}>{data.label}</div>
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
        summary: file.upperLevelSummary || file.metadata?.fileDocstring || file.lowerLevelSummary,
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

// --- TREE LAYOUT ENGINE ---
const applyTreeLayout = (nodes: FileNode[], edges: Edge[]) => {
  if (nodes.length === 0) return { nodes, edges };

  // 1. Identify Parent-Child relationships from Structural Edges
  // We filter out dependency edges
  const hierarchyEdges = edges.filter(e => !e.data?.isDependency);

  const parentMap = new Map<string, string>();
  hierarchyEdges.forEach(e => {
    parentMap.set(e.target, e.source);
  });

  // 2. Prepare data for stratify
  // We need to ensure every node matches { id, parentId }
  // Root has no parent.
  const hierarchyData = nodes.map(n => ({
    id: n.id,
    parentId: n.id === 'root' ? undefined : (parentMap.get(n.id) || 'root'), // Fallback to root if orphaned?
    data: n
  }));

  // Clean up: Ensure parentIds exist in nodes
  const validIds = new Set(nodes.map(n => n.id));
  const cleanData = hierarchyData.map(d => {
    if (d.parentId && !validIds.has(d.parentId)) {
      return { ...d, parentId: undefined }; // Treat as root? Or 'root' if exists?
    }
    return d;
  });

  try {
    const root = stratify<any>()
      .id((d: any) => d.id)
      .parentId((d: any) => d.parentId)
      (cleanData);

    const treeLayout = tree()
      .nodeSize([420, 220])
      .separation((a, b) => (a.parent === b.parent ? 1.6 : 2.2));

    treeLayout(root);

    const descendants = root.descendants() as any[];
    const minX = Math.min(...descendants.map((d) => d.x));
    const maxX = Math.max(...descendants.map((d) => d.x));
    const xOffset = (minX + maxX) / 2;

    const newNodes = nodes.map(n => {
      // Find matching hierarchy node
      // d3 tree assigns coordinates x, y
      const hNode = descendants.find((d: any) => d.id === n.id) as any;
      if (hNode) {
        return {
          ...n,
          position: { x: hNode.x - xOffset, y: hNode.y }
        };
      }
      return n;
    });

    return { nodes: newNodes, edges };

  } catch (err) {
    console.error("Tree layout failed:", err);
    return { nodes, edges };
  }
};

// --- MAIN COMPONENT ---
export default function App() {
  const [capsules, setCapsules] = useState<CapsulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Refactored to store ID only, so data is always fresh from nodes state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'force' | 'tree'>('force');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const forcePositionsRef = React.useRef<Record<string, { x: number, y: number }>>({});

  // Apply Theme Effect
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleLayout = () => {
    if (layoutMode === 'force') {
      const currentNodes = reactFlowInstance?.getNodes() || nodes;
      const positions: Record<string, { x: number, y: number }> = {};
      currentNodes.forEach(n => {
        if (n.type === 'capsule') {
          positions[n.id] = n.position;
        }
      });
      forcePositionsRef.current = positions;
      setLayoutMode('tree');
    } else {
      setLayoutMode('force');
    }
  };

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find(n => n.id === selectedNodeId);
    return node ? (node.data as FileNodeData) : null;
  }, [nodes, selectedNodeId]);

  const [showStructure, setShowStructure] = useState(true);
  const [fileTypes, setFileTypes] = useState<Record<string, boolean>>({
    typescript: true,
    javascript: true,
    python: false, // Default off to reduce noise if needed
    other: true
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
        const { relativePath, summary, version } = message.data;

        // Update nodes state
        setNodes((prev: FileNode[]) => prev.map((node: FileNode) => {
          if (node.data.relativePath === relativePath) {
            return {
              ...node,
              data: {
                ...node.data,
                summary,
                upperLevelSummaryVersion: version,
                fullCapsule: node.data.fullCapsule ? {
                  ...node.data.fullCapsule,
                  upperLevelSummary: summary,
                  upperLevelSummaryVersion: version
                } : undefined
              }
            };
          }
          return node;
        }));
      }
      if (message.type === 'updateFileStructure') {
        const { relativePath, structure, lowerLevelSummary, version } = message.data;
        console.log(`[Webview] 📨 Received updateFileStructure for ${relativePath}`, { structureLength: structure?.length });

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
                lowerLevelSummaryVersion: version,
                fullCapsule: node.data.fullCapsule ? {
                  ...node.data.fullCapsule,
                  structure,
                  lowerLevelSummary,
                  lowerLevelSummaryVersion: version,
                  edges: message.data.edges
                } : undefined
              }
            };
          }
          return node;
        }));

        // selectedNodeData is derived from nodes, so no need to update it manually
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

  // Layout Effect
  useEffect(() => {
    if (nodes.length === 0) return;

    if (layoutMode === 'tree') {
      const { nodes: newNodes } = applyTreeLayout(nodes, edges);
      setNodes(nds => nds.map(n => {
        const match = newNodes.find(mn => mn.id === n.id);
        return match ? { ...n, position: match.position } : n;
      }));
      setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 100);
    } else {
      // Restore cached positions if available
      const cached = forcePositionsRef.current;
      const hasCache = Object.keys(cached).length > 0;

      if (hasCache) {
        setNodes(nds => nds.map(n => {
          const pos = cached[n.id];
          return pos ? { ...n, position: pos } : n;
        }));
        // Optional: fit view if we want, or keep current viewport
        // setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 100);
      } else {
        const { nodes: newNodes } = applyForceLayout(nodes, edges);
        setNodes(nds => nds.map(n => {
          const match = newNodes.find(mn => mn.id === n.id);
          return match ? { ...n, position: match.position } : n;
        }));
        setTimeout(() => reactFlowInstance?.fitView({ duration: 800 }), 100);
      }
    }
  }, [layoutMode]);

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
    setSelectedNodeId(node.id);

    // Auto-zoom
    reactFlowInstance?.fitView({
      nodes: [{ id: node.id }],
      padding: 0.2,
      duration: 800,
      maxZoom: 3
    });
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
    setSelectedNodeId(nodeId);

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
        {/* VIEW TOGGLES */}
        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/80 backdrop-blur shadow-lg border-border/50"
            onClick={toggleLayout}
          >
            {layoutMode === 'force' ? 'Switch to Tree' : 'Switch to Concentric'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="bg-background/80 backdrop-blur shadow-lg border-border/50"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </Button>
        </div>
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
            <Background color="hsl(var(--border))" gap={50} />
            <Controls />
          </ReactFlow>
        </ReactFlowProvider>
        {selectedNodeData && (
          <NodeDetailsOverlay
            data={selectedNodeData}
            onClose={() => setSelectedNodeId(null)}
            riskAnalyses={riskAnalyses}
          />
        )}
      </div>
    </div>
  );
}
