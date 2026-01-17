/**
 * Wiki and Mermaid diagram generator
 * Creates documentation from analyzed codebase
 */

import type { ComponentGraph, FileNode } from "./analyzer";
import { getDependencies, getDependents, getGraphStats, calculateImportance } from "./analyzer";
import { OpenRouterClient } from "./openrouter";
import * as path from "path";

export interface WikiOptions {
    /** Include Mermaid diagrams */
    includeDiagrams?: boolean;
    /** Use AI for summaries (requires OpenRouter client) */
    useAI?: boolean;
    /** Maximum files to process with AI (to limit API calls) */
    maxAIFiles?: number;
}

export interface GeneratedWiki {
    markdown: string;
    mermaidDiagram: string;
    fileSummaries: Map<string, string>;
}

/**
 * Generates a Mermaid flowchart from the component graph
 */
export function generateMermaidDiagram(graph: ComponentGraph): string {
    const lines: string[] = ["flowchart TB"];
    const stats = getGraphStats(graph);

    // Group nodes by directory for subgraphs
    for (const [dir, filePaths] of graph.directories) {
        const safeDirId = dir.replace(/[^a-zA-Z0-9]/g, "_") || "root";
        const dirLabel = dir || "Root";

        lines.push(`  subgraph ${safeDirId}["📁 ${dirLabel}"]`);

        for (const filePath of filePaths) {
            const node = graph.nodes.get(filePath);
            if (!node) continue;

            const fileName = node.file.name;
            const nodeId = filePath.replace(/[^a-zA-Z0-9]/g, "_");
            const icon = node.parsed.isReactComponent ? "⚛️" : "📄";

            lines.push(`    ${nodeId}["${icon} ${fileName}"]`);
        }

        lines.push("  end");
    }

    // Add edges (local dependencies only)
    const addedEdges = new Set<string>();

    for (const edge of graph.edges) {
        if (edge.type !== "local") continue;

        const fromId = edge.from.replace(/[^a-zA-Z0-9]/g, "_");
        const toNode = graph.nodes.get(edge.to);

        if (!toNode) continue;

        const toId = edge.to.replace(/[^a-zA-Z0-9]/g, "_");
        const edgeKey = `${fromId}-${toId}`;

        if (!addedEdges.has(edgeKey)) {
            lines.push(`  ${fromId} --> ${toId}`);
            addedEdges.add(edgeKey);
        }
    }

    // Style nodes based on type
    lines.push("");
    lines.push("  %% Styling");

    for (const [filePath, node] of graph.nodes) {
        const nodeId = filePath.replace(/[^a-zA-Z0-9]/g, "_");

        if (node.parsed.isReactComponent) {
            lines.push(`  style ${nodeId} fill:#61dafb,color:#000`);
        } else if (node.file.type === "typescript") {
            lines.push(`  style ${nodeId} fill:#3178c6,color:#fff`);
        }
    }

    return lines.join("\n");
}

/**
 * Generates a simple text-based summary for a file (no AI)
 */
function generateBasicSummary(node: FileNode, graph: ComponentGraph): string {
    const exports = node.parsed.exports.map((e) => e.name).join(", ") || "None";
    const imports = node.parsed.imports.map((i) => i.source).join(", ") || "None";
    const deps = getDependencies(graph, node.file.path);
    const dependents = getDependents(graph, node.file.path);

    let fileType = "Module";
    if (node.parsed.isReactComponent) {
        fileType = "React Component";
    } else if (node.parsed.classes.length > 0) {
        fileType = "Class Module";
    } else if (node.file.type === "css") {
        fileType = "Stylesheet";
    } else if (node.file.type === "json") {
        fileType = "Configuration";
    }

    const parts = [
        `**Type:** ${fileType}`,
        `**Exports:** ${exports}`,
        `**Dependencies:** ${deps.length > 0 ? deps.map((d) => path.basename(d)).join(", ") : "None"}`,
        `**Used By:** ${dependents.length > 0 ? dependents.map((d) => path.basename(d)).join(", ") : "None"}`,
    ];

    if (node.parsed.functions.length > 0) {
        parts.push(`**Functions:** ${node.parsed.functions.join(", ")}`);
    }

    if (node.parsed.classes.length > 0) {
        parts.push(`**Classes:** ${node.parsed.classes.join(", ")}`);
    }

    return parts.join("\n");
}

/**
 * Generates the complete wiki documentation
 */
export async function generateWiki(
    graph: ComponentGraph,
    client?: OpenRouterClient,
    options: WikiOptions = {}
): Promise<GeneratedWiki> {
    const { includeDiagrams = true, useAI = false, maxAIFiles = 20 } = options;

    const fileSummaries = new Map<string, string>();
    const stats = getGraphStats(graph);

    // Generate Mermaid diagram
    const mermaidDiagram = includeDiagrams ? generateMermaidDiagram(graph) : "";

    // Sort files by importance for AI processing
    const sortedFiles = Array.from(graph.nodes.entries())
        .map(([path, node]) => ({
            path,
            node,
            importance: calculateImportance(graph, path),
        }))
        .sort((a, b) => b.importance - a.importance);

    // Generate summaries
    let aiProcessed = 0;

    for (const { path: filePath, node } of sortedFiles) {
        let summary: string;

        if (useAI && client?.isConfigured() && aiProcessed < maxAIFiles) {
            try {
                // For AI, we'd need file content - this is a simplified version
                summary = await client.generateFileSummary(
                    node.file.relativePath,
                    "// File content would be passed here",
                    node.parsed.exports.map((e) => e.name),
                    node.parsed.imports.map((i) => i.source)
                );
                aiProcessed++;
            } catch (error) {
                console.warn(`AI summary failed for ${filePath}:`, error);
                summary = generateBasicSummary(node, graph);
            }
        } else {
            summary = generateBasicSummary(node, graph);
        }

        fileSummaries.set(filePath, summary);
    }

    // Build markdown document
    const markdown = buildMarkdownDocument(graph, fileSummaries, mermaidDiagram, stats);

    return {
        markdown,
        mermaidDiagram,
        fileSummaries,
    };
}

/**
 * Builds the final markdown document
 */
function buildMarkdownDocument(
    graph: ComponentGraph,
    summaries: Map<string, string>,
    mermaid: string,
    stats: ReturnType<typeof getGraphStats>
): string {
    const lines: string[] = [];

    // Header
    lines.push("# Codebase Documentation");
    lines.push("");
    lines.push("*Auto-generated wiki documentation*");
    lines.push("");

    // Overview
    lines.push("## Overview");
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Files | ${stats.totalFiles} |`);
    lines.push(`| Directories | ${stats.totalDirectories} |`);
    lines.push(`| Internal Connections | ${stats.totalLocalConnections} |`);
    lines.push(`| External Dependencies | ${stats.externalDependencies.length} |`);
    lines.push("");

    // Entry points
    if (stats.entryPoints.length > 0) {
        lines.push("### Entry Points");
        lines.push("");
        for (const entry of stats.entryPoints.slice(0, 5)) {
            const node = graph.nodes.get(entry);
            if (node) {
                lines.push(`- \`${node.file.relativePath}\``);
            }
        }
        lines.push("");
    }

    // Architecture diagram
    if (mermaid) {
        lines.push("## Architecture Diagram");
        lines.push("");
        lines.push("```mermaid");
        lines.push(mermaid);
        lines.push("```");
        lines.push("");
    }

    // External dependencies
    if (stats.externalDependencies.length > 0) {
        lines.push("## External Dependencies");
        lines.push("");
        for (const dep of stats.externalDependencies.sort()) {
            lines.push(`- \`${dep}\``);
        }
        lines.push("");
    }

    // File documentation by directory
    lines.push("## Files");
    lines.push("");

    for (const [dir, filePaths] of graph.directories) {
        const dirLabel = dir || "(root)";
        lines.push(`### 📁 ${dirLabel}`);
        lines.push("");

        for (const filePath of filePaths) {
            const node = graph.nodes.get(filePath);
            const summary = summaries.get(filePath);

            if (!node) continue;

            const icon = node.parsed.isReactComponent ? "⚛️" : "📄";
            lines.push(`#### ${icon} ${node.file.name}`);
            lines.push("");

            if (summary) {
                lines.push(summary);
                lines.push("");
            }

            lines.push("---");
            lines.push("");
        }
    }

    return lines.join("\n");
}

/**
 * Exports wiki to a file
 */
export function wikiToFile(wiki: GeneratedWiki): { wiki: string; diagram: string } {
    return {
        wiki: wiki.markdown,
        diagram: wiki.mermaidDiagram,
    };
}
