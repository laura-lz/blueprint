/**
 * Component relationship analyzer
 * Builds dependency graphs and identifies component hierarchies
 */

import type { FileInfo } from "./scanner";
import type { ParsedFile } from "./parser";
import * as path from "path";

export interface FileNode {
    file: FileInfo;
    parsed: ParsedFile;
    summary?: string;
}

export interface DependencyEdge {
    from: string; // File path
    to: string; // Import source (file path or package)
    type: "local" | "external" | "builtin";
}

export interface ComponentGraph {
    nodes: Map<string, FileNode>;
    edges: DependencyEdge[];
    directories: Map<string, string[]>; // dir -> file paths
}

/**
 * Classifies an import source
 */
function classifyImport(source: string): "local" | "external" | "builtin" {
    if (source.startsWith(".") || source.startsWith("/") || source.startsWith("@/")) {
        return "local";
    }

    const builtins = [
        "fs", "path", "http", "https", "url", "util", "os",
        "crypto", "stream", "events", "buffer", "child_process"
    ];

    if (builtins.includes(source) || source.startsWith("node:")) {
        return "builtin";
    }

    return "external";
}

/**
 * Resolves a local import to an absolute path
 */
function resolveLocalImport(
    importSource: string,
    fromFile: string,
    allFiles: Map<string, FileInfo>
): string | null {
    // Handle @ alias (common in Next.js)
    let targetPath: string;

    if (importSource.startsWith("@/")) {
        // Find the project root (look for package.json directory)
        const parts = fromFile.split("/");
        let rootIndex = parts.length - 1;

        for (let i = parts.length - 1; i >= 0; i--) {
            const testPath = parts.slice(0, i + 1).join("/");
            if (allFiles.has(path.join(testPath, "package.json"))) {
                rootIndex = i;
                break;
            }
        }

        const projectRoot = parts.slice(0, rootIndex + 1).join("/");
        targetPath = path.join(projectRoot, importSource.slice(2));
    } else {
        // Relative import
        const fromDir = path.dirname(fromFile);
        targetPath = path.resolve(fromDir, importSource);
    }

    // Try with various extensions
    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

    for (const ext of extensions) {
        const fullPath = targetPath + ext;
        if (allFiles.has(fullPath)) {
            return fullPath;
        }
    }

    return null;
}

/**
 * Builds a component graph from parsed files
 */
export function buildComponentGraph(
    files: Map<string, { file: FileInfo; parsed: ParsedFile }>
): ComponentGraph {
    const nodes = new Map<string, FileNode>();
    const edges: DependencyEdge[] = [];
    const directories = new Map<string, string[]>();

    // Build file lookup map
    const filePathMap = new Map<string, FileInfo>();
    for (const [filePath, { file }] of files) {
        filePathMap.set(filePath, file);
    }

    // Process each file
    for (const [filePath, { file, parsed }] of files) {
        nodes.set(filePath, { file, parsed });

        // Group by directory
        const dir = path.dirname(file.relativePath);
        const dirFiles = directories.get(dir) || [];
        dirFiles.push(filePath);
        directories.set(dir, dirFiles);

        // Process imports to build edges
        for (const imp of parsed.imports) {
            const importType = classifyImport(imp.source);

            if (importType === "local") {
                const resolvedPath = resolveLocalImport(imp.source, filePath, filePathMap);
                edges.push({
                    from: filePath,
                    to: resolvedPath || imp.source,
                    type: "local",
                });
            } else {
                edges.push({
                    from: filePath,
                    to: imp.source,
                    type: importType,
                });
            }
        }
    }

    return { nodes, edges, directories };
}

/**
 * Gets all files that depend on a given file
 */
export function getDependents(graph: ComponentGraph, filePath: string): string[] {
    return graph.edges
        .filter((e) => e.to === filePath)
        .map((e) => e.from);
}

/**
 * Gets all files that a given file depends on (local only)
 */
export function getDependencies(graph: ComponentGraph, filePath: string): string[] {
    return graph.edges
        .filter((e) => e.from === filePath && e.type === "local")
        .map((e) => e.to);
}

/**
 * Gets external dependencies for a file
 */
export function getExternalDependencies(graph: ComponentGraph, filePath: string): string[] {
    return graph.edges
        .filter((e) => e.from === filePath && e.type === "external")
        .map((e) => e.to);
}

/**
 * Identifies entry points (files with no dependents)
 */
export function findEntryPoints(graph: ComponentGraph): string[] {
    const hasDependent = new Set(graph.edges.filter((e) => e.type === "local").map((e) => e.to));
    return Array.from(graph.nodes.keys()).filter((path) => !hasDependent.has(path));
}

/**
 * Calculates importance score based on connections
 */
export function calculateImportance(graph: ComponentGraph, filePath: string): number {
    const dependents = getDependents(graph, filePath).length;
    const dependencies = getDependencies(graph, filePath).length;

    // Files with many dependents are more important
    // Files with few dependencies are more foundational
    return dependents * 2 + (dependencies > 0 ? 1 / dependencies : 1);
}

/**
 * Gets summary statistics for the graph
 */
export function getGraphStats(graph: ComponentGraph) {
    const localEdges = graph.edges.filter((e) => e.type === "local");
    const externalDeps = new Set(graph.edges.filter((e) => e.type === "external").map((e) => e.to));

    return {
        totalFiles: graph.nodes.size,
        totalDirectories: graph.directories.size,
        totalLocalConnections: localEdges.length,
        externalDependencies: Array.from(externalDeps),
        entryPoints: findEntryPoints(graph),
    };
}
