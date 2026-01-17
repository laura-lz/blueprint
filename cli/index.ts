#!/usr/bin/env node

/**
 * CLI entry point for the codebase documentation agent
 * Usage: npx tsx cli/index.ts --target ./samples/calculator --output ./output
 */

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import {
    scanDirectory,
    readFileContent,
    parseFile,
    buildComponentGraph,
    generateWiki,
    createOpenRouterClient,
    type FileInfo,
    type ParsedFile,
} from "../src/core";

const program = new Command();

program
    .name("nexhacks-agent")
    .description("Codebase documentation agent - generates wiki and diagrams")
    .version("1.0.0")
    .requiredOption("-t, --target <path>", "Target directory to scan")
    .option("-o, --output <path>", "Output directory for documentation", "./output")
    .option("-m, --model <model>", "OpenRouter model to use", "anthropic/claude-3.5-sonnet")
    .option("--no-ai", "Disable AI-powered summaries")
    .option("--no-diagrams", "Disable Mermaid diagram generation")
    .option("-v, --verbose", "Enable verbose logging")
    .parse(process.argv);

const options = program.opts();

async function main() {
    const targetPath = path.resolve(options.target);
    const outputPath = path.resolve(options.output);

    console.log("🚀 Nexhacks Codebase Documentation Agent");
    console.log("========================================");
    console.log(`📁 Target: ${targetPath}`);
    console.log(`📤 Output: ${outputPath}`);
    console.log("");

    // Step 1: Scan the codebase
    console.log("📂 Scanning codebase...");
    const files = await scanDirectory({ rootDir: targetPath });
    console.log(`   Found ${files.length} code files`);

    if (files.length === 0) {
        console.log("❌ No code files found. Exiting.");
        process.exit(1);
    }

    // Step 2: Parse each file
    console.log("🔍 Parsing files...");
    const parsedFiles = new Map<string, { file: FileInfo; parsed: ParsedFile }>();

    for (const file of files) {
        if (options.verbose) {
            console.log(`   Parsing: ${file.relativePath}`);
        }

        try {
            const content = await readFileContent(file.path);
            const parsed = parseFile(content, file.type);
            parsedFiles.set(file.path, { file, parsed });
        } catch (error) {
            if (options.verbose) {
                console.warn(`   ⚠️ Failed to parse: ${file.relativePath}`);
            }
        }
    }

    console.log(`   Parsed ${parsedFiles.size} files successfully`);

    // Step 3: Build component graph
    console.log("🔗 Building component graph...");
    const graph = buildComponentGraph(parsedFiles);
    console.log(`   ${graph.nodes.size} nodes, ${graph.edges.length} edges`);

    // Step 4: Create OpenRouter client
    const client = options.ai ? createOpenRouterClient() : null;

    if (options.ai && client?.isConfigured()) {
        console.log("🤖 AI summaries enabled");
    } else if (options.ai) {
        console.log("⚠️ No OPENROUTER_API_KEY found - using basic summaries");
    }

    // Step 5: Generate wiki
    console.log("📝 Generating documentation...");
    const wiki = await generateWiki(graph, client || undefined, {
        includeDiagrams: options.diagrams,
        useAI: options.ai && client?.isConfigured(),
        maxAIFiles: 20,
    });

    // Step 6: Write output
    console.log("💾 Writing output files...");
    await fs.mkdir(outputPath, { recursive: true });

    const wikiPath = path.join(outputPath, "wiki.md");
    await fs.writeFile(wikiPath, wiki.markdown, "utf-8");
    console.log(`   📄 Wiki: ${wikiPath}`);

    if (options.diagrams && wiki.mermaidDiagram) {
        const diagramPath = path.join(outputPath, "diagram.mmd");
        await fs.writeFile(diagramPath, wiki.mermaidDiagram, "utf-8");
        console.log(`   📊 Diagram: ${diagramPath}`);
    }

    // Write individual file summaries as JSON
    const summariesPath = path.join(outputPath, "summaries.json");
    const summariesObj: Record<string, string> = {};
    for (const [filePath, summary] of wiki.fileSummaries) {
        const relativePath = path.relative(targetPath, filePath);
        summariesObj[relativePath] = summary;
    }
    await fs.writeFile(summariesPath, JSON.stringify(summariesObj, null, 2), "utf-8");
    console.log(`   📋 Summaries: ${summariesPath}`);

    console.log("");
    console.log("✅ Documentation generated successfully!");
    console.log("");
    console.log("📖 Open the wiki file to view your documentation:");
    console.log(`   ${wikiPath}`);
}

main().catch((error) => {
    console.error("❌ Error:", error.message);
    if (options.verbose) {
        console.error(error.stack);
    }
    process.exit(1);
});
