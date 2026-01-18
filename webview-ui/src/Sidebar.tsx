import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Input } from './components/ui/input';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
//import { Switch } from './components/ui/switch';
import { cn } from './lib/utils';

// --- TYPES ---
export interface SearchResult {
    id: string;
    label: string;
    lang: string;
    matchType: string; // 'name' | 'summary' | 'symbol' | 'path'
}

export interface CapsulesData {
    stats: {
        totalFiles: number;
        totalDirectories: number;
        totalEdges: number;
        externalDependencies?: string[];
        projectOverview?: string;
    };
    files: Record<string, unknown>;
    directories: Record<string, unknown>;
}

export interface SidebarProps {
    capsules: CapsulesData | null;
    onSearch: (term: string) => void;
    onToggleStructure: (show: boolean) => void;
    showStructure: boolean;
    fileTypes: Record<string, boolean>;
    toggleFileType: (type: string) => void;
    searchResults: SearchResult[];
    onClickResult: (id: string) => void;
    onHoverResult: (id: string | null) => void;
    onAddSticky: () => void;
    onRefresh: () => void;
    onSettings: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

// --- LANG COLORS ---
export const langColors: Record<string, { bg: string; border: string; icon: string }> = {
    'react-typescript': { bg: 'var(--lang-react-ts-bg)', border: 'var(--lang-react-ts-border)', icon: '⚛️' },
    'typescript': { bg: 'var(--lang-ts-bg)', border: 'var(--lang-ts-border)', icon: '📘' },
    'javascript': { bg: 'var(--lang-js-bg)', border: 'var(--lang-js-border)', icon: '📒' },
    'css': { bg: 'var(--lang-css-bg)', border: 'var(--lang-css-border)', icon: '🎨' },
    'json': { bg: 'var(--lang-json-bg)', border: 'var(--lang-json-border)', icon: '📄' },
    'markdown': { bg: 'var(--lang-md-bg)', border: 'var(--lang-md-border)', icon: '📝' },
    'directory': { bg: 'var(--lang-dir-bg)', border: 'var(--lang-dir-border)', icon: '📁' },
    'root': { bg: 'var(--lang-root-bg)', border: 'var(--lang-root-border)', icon: '🏠' },
    'other': { bg: 'var(--lang-other-bg)', border: 'var(--lang-other-border)', icon: '📄' },
};

// --- SIDEBAR COMPONENT ---
export const Sidebar: React.FC<SidebarProps> = ({
    capsules,
    onSearch,
    //onToggleStructure,
    //showStructure,
    fileTypes,
    toggleFileType,
    searchResults,
    onClickResult,
    onHoverResult,
    onAddSticky,
    onRefresh,
    onSettings,
    isCollapsed,
    onToggleCollapse
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

    // Debug logging
    React.useEffect(() => {
        if (capsules?.stats) {
            console.log('[Sidebar] Stats received:', capsules.stats);
            console.log('[Sidebar] Has projectOverview:', !!capsules.stats.projectOverview);
        }
    }, [capsules]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        onSearch(val);
    };

    return (
        <div
            className={cn(
                "relative flex h-screen flex-col border-r border-border bg-background/80 backdrop-blur-xl",
                "transition-[width] duration-300 ease-out",
                isCollapsed ? "w-14" : "w-80"
            )}
        >
            <div
                className={cn(
                    "absolute left-0 top-0 z-20 flex h-full w-14 flex-col items-center gap-3 pt-4",
                    isCollapsed ? "opacity-100" : "pointer-events-none opacity-0"
                )}
            >
                <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Expand Sidebar">
                    ➔
                </Button>
                <div className="mt-10 rotate-[-90deg] text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Blueprint
                </div>
            </div>

            <div
                className={cn(
                    "relative z-10 flex h-full flex-col transition-all duration-200",
                    isCollapsed ? "pointer-events-none opacity-0 -translate-x-4" : "opacity-100"
                )}
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div>
                        <div className="text-lg font-semibold text-primary">blueprint</div>
                        <div className="text-xs text-muted-foreground">
                            {capsules?.stats.totalFiles || 0} Files • {capsules?.stats.totalEdges || 0} Connections
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Collapse Sidebar">
                        ←
                    </Button>
                </div>

                <ScrollArea className="flex-1">
                    <div className="space-y-4 px-5 py-4">
                        <Card className="border-border/70 bg-card/90 shadow-glow">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm">Search</CardTitle>
                                <CardDescription>Find files or summaries</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Input
                                    type="text"
                                    placeholder="Search files..."
                                    value={searchTerm}
                                    onChange={handleSearch}
                                />
                            </CardContent>
                        </Card>

                        <Card className="border-border/70 bg-card/90">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm">Tools</CardTitle>
                                <CardDescription>Quick actions</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2">
                                    <Button className="flex-1" variant="secondary" onClick={onAddSticky}>
                                        + Note
                                    </Button>
                                    <Button className="flex-1" onClick={onRefresh}>
                                        Refresh
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.keys(fileTypes).map(type => (
                                        <Badge
                                            key={type}
                                            variant={fileTypes[type] ? "default" : "outline"}
                                            className={cn(
                                                "cursor-pointer capitalize",
                                                fileTypes[type]
                                                    ? "bg-transparent text-foreground border-primary/40"
                                                    : "text-muted-foreground"
                                            )}
                                            style={{
                                                borderColor: fileTypes[type] ? langColors[type]?.border : undefined,
                                                color: fileTypes[type] ? langColors[type]?.border : undefined,
                                            }}
                                            onClick={() => toggleFileType(type)}
                                        >
                                            {type === 'sticky' ? 'Notes' : type}
                                        </Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {searchTerm && (
                            <Card className="border-border/70 bg-card/90">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Results</CardTitle>
                                    <CardDescription>
                                        {searchResults.length ? `${searchResults.length} matches` : "No matches found"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {searchResults.slice(0, 15).map(result => (
                                        <button
                                            key={result.id}
                                            onClick={() => onClickResult(result.id)}
                                            onMouseEnter={() => onHoverResult(result.id)}
                                            onMouseLeave={() => onHoverResult(null)}
                                            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left text-xs text-foreground transition hover:bg-muted"
                                        >
                                            <span className="text-sm">{langColors[result.lang]?.icon || '📄'}</span>
                                            <span className="flex-1 truncate">{result.label}</span>
                                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                                {result.matchType}
                                            </Badge>
                                        </button>
                                    ))}
                                    {searchResults.length > 15 && (
                                        <div className="text-center text-[11px] text-muted-foreground">
                                            +{searchResults.length - 15} more results
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {capsules?.stats.projectOverview && (
                            <Card className="border-border/70 bg-card/90">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Project Summary</CardTitle>
                                    <CardDescription>Generated overview</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2 text-xs text-muted-foreground">
                                    <div
                                        className={cn(
                                            "relative transition-all",
                                            isSummaryExpanded ? "max-h-none" : "max-h-24 overflow-hidden"
                                        )}
                                    >
                                        <Markdown
                                            components={{
                                                p: (props) => <p className="mb-2 leading-relaxed" {...props} />,
                                                strong: (props) => <strong className="text-foreground" {...props} />,
                                                ul: (props) => <ul className="mb-2 list-disc pl-4" {...props} />,
                                                ol: (props) => <ol className="mb-2 list-decimal pl-4" {...props} />,
                                                li: (props) => <li className="mb-1" {...props} />,
                                                h1: (props) => <h1 className="mb-2 text-sm font-semibold text-foreground" {...props} />,
                                                h2: (props) => <h2 className="mb-2 text-sm font-semibold text-foreground" {...props} />,
                                                h3: (props) => <h3 className="mb-1 text-xs font-semibold text-foreground" {...props} />,
                                            }}
                                        >
                                            {capsules.stats.projectOverview}
                                        </Markdown>
                                        {!isSummaryExpanded && (
                                            <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-full bg-gradient-to-b from-transparent to-background" />
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                                    >
                                        {isSummaryExpanded ? "Hide Summary" : "Expand Summary"}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {capsules?.stats.externalDependencies && capsules.stats.externalDependencies.length > 0 && (
                            <Card className="border-border/70 bg-card/90">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Dependencies</CardTitle>
                                    <CardDescription>External modules</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-2">
                                    {capsules.stats.externalDependencies.map(dep => (
                                        <Badge key={dep} variant="secondary">
                                            {dep}
                                        </Badge>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                    </div>
                </ScrollArea>

                <Separator />
                <div className="px-5 py-4">
                    <Button variant="outline" className="w-full" onClick={onSettings}>
                        Settings
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
