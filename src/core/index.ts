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

// Risk Analysis Agent
export {
    RiskAnalysisAgent,
    createRiskAnalysisAgent,
    type RiskAnalysis,
    type Risk,
    type BestPractice,
    type RiskType,
    type RiskSeverity,
    type RiskLevel,
    type RiskAnalysisConfig,
} from "./risk-agent.js";

// RLHF Feedback Loop
export { FeedbackManager } from "./feedback-manager.js";
export * from "./prompts.js";

