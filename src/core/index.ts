/**
 * Core module exports
 * Re-exports all core functionality for easy importing
 */

// Types
export * from "./types.js";

// Scanner
export {
    scanDirectory,
    groupFilesByDirectory,
    readFileContent,
    type FileInfo,
    type ScanOptions,
} from "./scanner.js";

// Parser
export {
    parseFile,
    getExportNames,
    getImportSources,
    type ParsedFile,
    type ImportInfo,
    type ExportInfo,
} from "./parser.js";

// Upper Level API (main entry point)
export {
    UpperLevelAPI,
    buildUpperLevelGraph,
    createUpperLevelAPI,
} from "./api.js";

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
} from "./analyzer.js";

// Gemini API client
export {
    GeminiClient,
    createGeminiClient,
    type GeminiConfig,
    type Message,
    OpenRouterClient,
    createOpenRouterClient,
} from "./gemini.js";
