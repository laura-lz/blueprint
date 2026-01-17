/**
 * Upper Level API - Queryable interface for the file-level graph
 * Exposes: getFileCapsule, getDependencyNeighborhood, searchSymbolIndex
 */

import * as path from "path";
import type {
    FileCapsule,
    FileNode,
    FileEdge,
    UpperLevelGraph,
    IUpperLevelAPI,
    NeighborhoodOptions,
    SymbolSearchResult,
    GraphStats,
    ImportEntry,
    ExportEntry,
    TopSymbol,
    Language,
} from "./types";
import { scanDirectory, readFileContent, type FileInfo } from "./scanner";
import { parseFile, type ParsedFile } from "./parser";

/**
 * Build a FileCapsule from a FileInfo and ParsedFile
 */
function buildFileCapsule(
    file: FileInfo,
    parsed: ParsedFile,
    rootPath: string
): FileCapsule {
    // Convert imports to ImportEntry format
    const imports: ImportEntry[] = parsed.imports.map((imp) => ({
        pathOrModule: imp.source,
        symbols: imp.specifiers,
        isDefault: imp.isDefault,
        isLocal: imp.source.startsWith(".") || imp.source.startsWith("@/"),
    }));

    // Convert exports to ExportEntry format
    const exports: ExportEntry[] = parsed.exports.map((exp) => ({
        name: exp.name,
        kind: exp.type === "default" ? "default" : exp.type,
        isDefault: exp.isDefault,
    }));

    // Build top symbols list
    const topSymbols: TopSymbol[] = [];

    // Add functions
    for (const fn of parsed.functions) {
        const isExported = parsed.exports.some((e) => e.name === fn.name);
        topSymbols.push({
            name: fn.name,
            kind: "function",
            location: {
                start: { line: fn.location.startLine, column: 0 },
                end: { line: fn.location.endLine, column: 0 },
            },
            exported: isExported,
        });
    }

    // Add classes
    for (const cls of parsed.classes) {
        const isExported = parsed.exports.some((e) => e.name === cls.name);
        topSymbols.push({
            name: cls.name,
            kind: "class",
            location: {
                start: { line: cls.location.startLine, column: 0 },
                end: { line: cls.location.endLine, column: 0 },
            },
            exported: isExported,
        });
    }

    // Add constants
    for (const cst of parsed.constants) {
        const isExported = parsed.exports.some((e) => e.name === cst.name);
        topSymbols.push({
            name: cst.name,
            kind: "const",
            location: {
                start: { line: cst.location.startLine, column: 0 },
                end: { line: cst.location.endLine, column: 0 },
            },
            exported: isExported,
        });
    }

    return {
        path: file.path,
        relativePath: file.relativePath,
        name: file.name,
        lang: file.type as Language,
        imports,
        exports,
        topSymbols,
    };
}

/**
 * Upper Level API implementation
 */
export class UpperLevelAPI implements IUpperLevelAPI {
    private graph: UpperLevelGraph;
    private symbolIndex: Map<string, SymbolSearchResult[]>;

    constructor(graph: UpperLevelGraph) {
        this.graph = graph;
        this.symbolIndex = this.buildSymbolIndex();
    }

    /**
     * Build a searchable index of all symbols
     */
    private buildSymbolIndex(): Map<string, SymbolSearchResult[]> {
        const index = new Map<string, SymbolSearchResult[]>();

        for (const [filePath, node] of this.graph.nodes) {
            for (const symbol of node.capsule.topSymbols) {
                const key = symbol.name.toLowerCase();
                const existing = index.get(key) || [];
                existing.push({
                    filePath,
                    symbolName: symbol.name,
                    kind: symbol.kind,
                    exported: symbol.exported,
                });
                index.set(key, existing);
            }
        }

        return index;
    }

    /**
     * Get the capsule for a specific file
     */
    getFileCapsule(filePath: string): FileCapsule | undefined {
        // Try exact path match first
        const node = this.graph.nodes.get(filePath);
        if (node) {
            return node.capsule;
        }

        // Try relative path match
        for (const [absPath, n] of this.graph.nodes) {
            if (n.capsule.relativePath === filePath || absPath.endsWith(filePath)) {
                return n.capsule;
            }
        }

        return undefined;
    }

    /**
     * Get files in the dependency neighborhood
     */
    getDependencyNeighborhood(
        filePath: string,
        options: NeighborhoodOptions = {}
    ): string[] {
        const {
            radius = 2,
            cap = 20,
            includeDependents = true,
            includeDependencies = true
        } = options;

        // Resolve the file path
        let resolvedPath = filePath;
        if (!this.graph.nodes.has(filePath)) {
            for (const [absPath, n] of this.graph.nodes) {
                if (n.capsule.relativePath === filePath || absPath.endsWith(filePath)) {
                    resolvedPath = absPath;
                    break;
                }
            }
        }

        const visited = new Set<string>();
        const result: string[] = [];
        const queue: { path: string; depth: number }[] = [{ path: resolvedPath, depth: 0 }];

        while (queue.length > 0 && result.length < cap) {
            const current = queue.shift()!;

            if (visited.has(current.path) || current.depth > radius) {
                continue;
            }

            visited.add(current.path);

            // Don't include the starting file in results
            if (current.path !== resolvedPath) {
                result.push(current.path);
            }

            if (current.depth < radius) {
                // Find edges from/to this file
                for (const edge of this.graph.edges) {
                    if (includeDependencies && edge.from === current.path && !visited.has(edge.to)) {
                        // This file imports edge.to
                        if (this.graph.nodes.has(edge.to)) {
                            queue.push({ path: edge.to, depth: current.depth + 1 });
                        }
                    }

                    if (includeDependents && edge.to === current.path && !visited.has(edge.from)) {
                        // edge.from imports this file
                        queue.push({ path: edge.from, depth: current.depth + 1 });
                    }
                }
            }
        }

        return result.slice(0, cap);
    }

    /**
     * Search for symbols across the indexed files
     */
    searchSymbolIndex(query: string): SymbolSearchResult[] {
        const lowerQuery = query.toLowerCase();
        const results: SymbolSearchResult[] = [];

        for (const [key, symbols] of this.symbolIndex) {
            if (key.includes(lowerQuery)) {
                results.push(...symbols);
            }
        }

        return results;
    }

    /**
     * Get all files in the graph
     */
    getAllFiles(): string[] {
        return Array.from(this.graph.nodes.keys());
    }

    /**
     * Get statistics about the graph
     */
    getStats(): GraphStats {
        const externalDeps = new Set<string>();

        for (const [, node] of this.graph.nodes) {
            for (const imp of node.capsule.imports) {
                if (!imp.isLocal) {
                    externalDeps.add(imp.pathOrModule);
                }
            }
        }

        // Find entry points (files with no dependents)
        const hasDependent = new Set(
            this.graph.edges.map((e) => e.to)
        );
        const entryPoints = Array.from(this.graph.nodes.keys())
            .filter((p) => !hasDependent.has(p))
            .map((p) => this.graph.nodes.get(p)!.capsule.relativePath);

        return {
            totalFiles: this.graph.nodes.size,
            totalDirectories: this.graph.directories.size,
            totalEdges: this.graph.edges.length,
            externalDependencies: Array.from(externalDeps).sort(),
            entryPoints: entryPoints.slice(0, 10),
        };
    }
}

/**
 * Build the upper-level graph from a directory
 */
export async function buildUpperLevelGraph(rootDir: string): Promise<UpperLevelGraph> {
    const absoluteRoot = path.resolve(rootDir);

    // Scan the directory
    const files = await scanDirectory({ rootDir: absoluteRoot });

    // Build nodes
    const nodes = new Map<string, FileNode>();
    const directories = new Map<string, string[]>();
    const edges: FileEdge[] = [];

    // Parse each file and build capsules
    for (const file of files) {
        try {
            const content = await readFileContent(file.path);
            const parsed = parseFile(content, file.type);
            const capsule = buildFileCapsule(file, parsed, absoluteRoot);

            nodes.set(file.path, { id: file.path, capsule });

            // Group by directory
            const dir = path.dirname(file.relativePath);
            const dirFiles = directories.get(dir) || [];
            dirFiles.push(file.path);
            directories.set(dir, dirFiles);
        } catch (error) {
            console.warn(`Failed to process ${file.relativePath}:`, error);
        }
    }

    // Build edges from imports
    for (const [filePath, node] of nodes) {
        for (const imp of node.capsule.imports) {
            if (imp.isLocal) {
                // Resolve local import to absolute path
                const resolved = resolveLocalImport(imp.pathOrModule, filePath, nodes);
                if (resolved) {
                    edges.push({
                        from: filePath,
                        to: resolved,
                        type: "imports",
                        symbols: imp.symbols,
                    });
                }
            }
        }
    }

    return {
        nodes,
        edges,
        directories,
        rootPath: absoluteRoot,
    };
}

/**
 * Resolve a local import to an absolute path
 */
function resolveLocalImport(
    importSource: string,
    fromFile: string,
    nodes: Map<string, FileNode>
): string | null {
    let targetPath: string;

    if (importSource.startsWith("@/")) {
        // Handle @ alias - find project root
        const parts = fromFile.split("/");
        let rootIndex = parts.length - 1;

        for (let i = parts.length - 1; i >= 0; i--) {
            const testPath = parts.slice(0, i + 1).join("/");
            if (nodes.has(path.join(testPath, "package.json"))) {
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
        if (nodes.has(fullPath)) {
            return fullPath;
        }
    }

    return null;
}

/**
 * Factory function to create UpperLevelAPI from a directory
 */
export async function createUpperLevelAPI(rootDir: string): Promise<UpperLevelAPI> {
    const graph = await buildUpperLevelGraph(rootDir);
    return new UpperLevelAPI(graph);
}
