/**
 * Core module exports
 * Re-exports all core functionality for easy importing
 */

// Types
export * from "./types";

// Scanner
export {
    scanDirectory,
    groupFilesByDirectory,
    readFileContent,
    type FileInfo,
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

// Upper Level API (main entry point)
export {
    UpperLevelAPI,
    buildUpperLevelGraph,
    createUpperLevelAPI,
} from "./api";

// Analyzer (legacy, kept for backward compatibility)
export {
    buildComponentGraph,
    getDependents,
    getDependencies,
    getExternalDependencies,
    findEntryPoints,
    calculateImportance,
    getGraphStats,
    type FileNode as LegacyFileNode,
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
