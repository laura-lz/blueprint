/**
 * Core type definitions for the layered graph architecture
 * Upper Level: File-level graph with queryable API
 */

// ============================================================
// LOCATION & SYMBOL TYPES
// ============================================================

export interface Location {
    line: number;
    column: number;
}

export interface LocationRange {
    start: Location;
    end: Location;
}

export type SymbolKind = "function" | "class" | "type" | "const" | "variable" | "interface";

export type Language =
    | "typescript" | "javascript" | "react-typescript" | "react-javascript"
    | "python" | "go" | "rust" | "java" | "kotlin"
    | "c" | "cpp" | "csharp" | "ruby" | "php" | "swift" | "shell"
    | "css" | "scss" | "html" | "vue" | "json" | "yaml" | "markdown" | "other";

// ============================================================
// FILE CAPSULE (Upper Level Data Contract)
// ============================================================

/**
 * FileCapsule - the core data contract for upper-level graph
 * Contains metadata about a file without full content
 */
export interface FileCapsule {
    /** Absolute file path */
    path: string;

    /** Path relative to project root */
    relativePath: string;

    /** File name with extension */
    name: string;

    /** Detected language */
    lang: Language;

    /** Import statements */
    imports: ImportEntry[];

    /** Export statements */
    exports: ExportEntry[];

    /** Top-level symbols (functions, classes, etc.) */
    topSymbols: TopSymbol[];

    /** Optional metrics */
    metrics?: FileMetrics;

    /** Summary context for LLM-based summaries */
    metadata?: Metadata;

    /** Generated 2-line summary (upper level) */
    upperLevelSummary?: string;

    /** Deep analysis summary (lower level, added via CLI --file or --deep-all) */
    lowerLevelSummary?: string;

    /** Code structure analysis (lower level, added via CLI --file or --deep-all) */
    structure?: CodeBlockSummary[];

    /** Function call edges (lower level, derived from deep analysis) */
    edges?: FunctionCallEdge[];
}

export interface FunctionCallEdge {
    source: string;
    target: string;
    type: "call" | "uses" | "shares_state" | "data_flow" | "contains";
}

export interface CodeBlockSummary {
    name: string;
    type: "function" | "class" | "block";
    startLine: number;
    endLine: number;
    summary: string;
    /** Names of functions/methods this block calls */
    calls?: string[];
    /** Names of functions that call this block */
    calledBy?: string[];
}

/**
 * Context for generating file summaries with limited content
 */
export interface Metadata {
    /** File-level docstring (first comment block) */
    fileDocstring?: string;

    /** Function signatures without bodies */
    functionSignatures: FunctionSignatureInfo[];

    /** First N lines of the file */
    firstNLines: string;

    /** Files that import this one (dependents) */
    usedBy: string[];

    /** Local files this one imports (dependencies) */
    dependsOn: string[];
}

/**
 * Directory Capsule
 */
export interface DirectoryCapsule {
    /** Absolute path */
    path: string;

    /** Path relative to project root */
    relativePath: string;

    /** Directory name */
    name: string;

    /** Files in this directory (paths) */
    files: string[];

    /** Subdirectories (paths) */
    subdirectories: string[];

    /** AI-generated summary */
    upperLevelSummary?: string;

    /** Summary context/metadata */
    metadata?: {
        fileCount: number;
        subdirCount: number;
    };
}

export interface FunctionSignatureInfo {
    /** Function name */
    name: string;

    /** Signature string, e.g. "function add(a: number, b: number): number" */
    signature: string;

    /** JSDoc comment if present */
    jsdoc?: string;

    /** Whether exported */
    exported: boolean;
}

export interface ImportEntry {
    /** Module path or package name */
    pathOrModule: string;

    /** Imported symbol names (empty for default/namespace imports) */
    symbols: string[];

    /** Whether this is a default import */
    isDefault: boolean;

    /** Whether this is resolved to a local file */
    isLocal: boolean;
}

export interface ExportEntry {
    /** Exported symbol name */
    name: string;

    /** Kind of export */
    kind: SymbolKind | "default";

    /** Whether this is the default export */
    isDefault: boolean;
}

export interface TopSymbol {
    /** Symbol name */
    name: string;

    /** Symbol kind */
    kind: SymbolKind;

    /** Location in file */
    location: LocationRange;

    /** Whether this symbol is exported */
    exported: boolean;

    /** Optional signature (for functions) */
    signature?: string;
}

export interface FileMetrics {
    /** Lines of code */
    loc?: number;

    /** Git churn (changes over time) */
    churn?: number;

    /** Risk score (0-1) */
    risk?: number;

    /** Cyclomatic complexity estimate */
    complexity?: number;
}

// ============================================================
// GRAPH TYPES
// ============================================================

export interface FileNode {
    /** Absolute path (used as ID) */
    id: string;

    /** The file capsule */
    capsule: FileCapsule;
}

export interface FileEdge {
    /** Source file path */
    from: string;

    /** Target file path or module name */
    to: string;

    /** Edge type */
    type: "imports" | "exports-to";

    /** Symbols involved in this edge */
    symbols?: string[];
}

export interface UpperLevelGraph {
    /** All file nodes */
    nodes: Map<string, FileNode>;

    /** All file-to-file edges */
    edges: FileEdge[];

    /** Files grouped by directory */
    directories: Map<string, string[]>;

    /** Project root path */
    rootPath: string;
}

// ============================================================
// API TYPES
// ============================================================

export interface NeighborhoodOptions {
    /** How many hops to traverse */
    radius?: number;

    /** Maximum files to return */
    cap?: number;

    /** Include dependents (files that import this one) */
    includeDependents?: boolean;

    /** Include dependencies (files this one imports) */
    includeDependencies?: boolean;
}

export interface SymbolSearchResult {
    /** File containing the symbol */
    filePath: string;

    /** Symbol name */
    symbolName: string;

    /** Symbol kind */
    kind: SymbolKind;

    /** Whether it's exported */
    exported: boolean;
}

/**
 * Upper Level API - queryable interface for the file graph
 */
export interface IUpperLevelAPI {
    /**
     * Get the capsule for a specific file
     */
    getFileCapsule(filePath: string): FileCapsule | undefined;

    /**
     * Get files in the dependency neighborhood
     */
    getDependencyNeighborhood(filePath: string, options?: NeighborhoodOptions): string[];

    /**
     * Search for symbols across the indexed files
     */
    searchSymbolIndex(query: string): SymbolSearchResult[];

    /**
     * Get all files in the graph
     */
    getAllFiles(): string[];

    /**
     * Get statistics about the graph
     */
    getStats(): GraphStats;
}

export interface GraphStats {
    totalFiles: number;
    totalDirectories: number;
    totalEdges: number;
    externalDependencies: string[];
    entryPoints: string[];
    projectOverview?: string;
}
