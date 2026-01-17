/**
 * Core module exports
 * Re-exports all core functionality for easy importing
 */

// Scanner
export {
    scanDirectory,
    groupFilesByDirectory,
    readFileContent,
    type FileInfo,
    type FileType,
    type ScanOptions,
} from "./scanner";

// Parser
export {
    parseFile,
    getExportNames,
    getImportSources,
    type ParsedFile,
    type ImportInfo,
    type ExportInfo,
} from "./parser";

// Analyzer
export {
    buildComponentGraph,
    getDependents,
    getDependencies,
    getExternalDependencies,
    findEntryPoints,
    calculateImportance,
    getGraphStats,
    type FileNode,
    type DependencyEdge,
    type ComponentGraph,
} from "./analyzer";

// Generator
export {
    generateWiki,
    generateMermaidDiagram,
    wikiToFile,
    type WikiOptions,
    type GeneratedWiki,
} from "./generator";

// OpenRouter
export {
    OpenRouterClient,
    createOpenRouterClient,
    createMockClient,
    type OpenRouterConfig,
    type Message,
} from "./openrouter";
