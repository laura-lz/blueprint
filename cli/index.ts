#!/usr/bin/env node

/**
 * CLI entry point for the codebase documentation agent
 * Usage: npx tsx cli/index.ts --target ./samples/calculator --output ./output
 */

import "dotenv/config";

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import {
    createUpperLevelAPI,
    createGeminiClient,
    type FileCapsule,
} from "../src/core";

const program = new Command();

program
    .name("nexhacks-agent")
    .description("Codebase documentation agent - generates file capsules for upper-level graph")
    .version("1.0.0")
    .requiredOption("-t, --target <path>", "Target directory to scan")
    .option("-o, --output <path>", "Output directory for capsules.json", "./output")
    .option("--no-summarize", "Disable AI summary generation")
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

    // Build upper-level graph using API
    console.log("📂 Building upper-level graph...");
    const api = await createUpperLevelAPI(targetPath);
    const stats = api.getStats();
    console.log(`   ${stats.totalFiles} files, ${stats.totalEdges} edges`);

    // Get all file capsules
    const allFiles = api.getAllFiles();
    const capsules = new Map<string, FileCapsule>();

    for (const filePath of allFiles) {
        const capsule = api.getFileCapsule(filePath);
        if (capsule) {
            capsules.set(filePath, capsule);
        }
    }

    console.log(`   ${capsules.size} file capsules generated`);

    // Generate AI summaries if requested
    if (options.summarize) {
        const client = createGeminiClient();

        if (client.isConfigured()) {
            console.log("🤖 Generating AI summaries...");
            let count = 0;
            const total = capsules.size;

            for (const [, capsule] of capsules) {
                // Skip non-code files
                if (!capsule.summaryContext ||
                    ["json", "css", "markdown"].includes(capsule.lang)) {
                    continue;
                }

                try {
                    count++;
                    if (options.verbose) {
                        console.log(`   [${count}/${total}] ${capsule.relativePath}`);
                    }

                    const summary = await client.generateCapsuleSummary(
                        capsule.relativePath,
                        {
                            fileDocstring: capsule.summaryContext.fileDocstring,
                            functionSignatures: capsule.summaryContext.functionSignatures,
                            firstNLines: capsule.summaryContext.firstNLines,
                            usedBy: capsule.summaryContext.usedBy,
                            dependsOn: capsule.summaryContext.dependsOn,
                            exports: capsule.exports.map(e => e.name),
                        }
                    );

                    capsule.summary = summary;
                } catch (error) {
                    console.warn(`   ⚠️ Failed to summarize ${capsule.relativePath}`);
                }
            }

            console.log(`   ✅ Generated ${count} summaries`);

            // Generate Directory Summaries
            console.log("📂 Generating Directory summaries...");
            let dirCount = 0;
            const directories = api.getAllDirectories();

            for (const dirPath of directories) {
                const dirCapsule = api.getDirectoryCapsule(dirPath);
                if (!dirCapsule) continue;

                // Collect file summaries for context
                const fileContexts = dirCapsule.files.map(relPath => {
                    // find the capsule for this file
                    // we need to look up by relative path
                    let fileCap: FileCapsule | undefined;
                    for (const [, cap] of capsules) {
                        if (cap.relativePath === relPath) {
                            fileCap = cap;
                            break;
                        }
                    }
                    return {
                        name: path.basename(relPath),
                        summary: fileCap?.summary || "No summary available"
                    };
                });

                try {
                    dirCount++;
                    if (options.verbose) {
                        console.log(`   [DIR] ${dirCapsule.relativePath}`);
                    }

                    const summary = await client.generateDirectorySummary(
                        dirCapsule.relativePath,
                        fileContexts,
                        dirCapsule.subdirectories
                    );

                    dirCapsule.summary = summary;
                } catch (error) {
                    console.warn(`   ⚠️ Failed to summarize directory ${dirCapsule.relativePath}`);
                }
            }
            console.log(`   ✅ Generated ${dirCount} directory summaries`);
        } else {
            console.log("⚠️ GEMINI_API_KEY not set, skipping AI summaries");
        }
    }

    // Write output
    console.log("💾 Writing output...");
    await fs.mkdir(outputPath, { recursive: true });

    // Generate directory map for output
    const directoriesMap: Record<string, any> = {};
    for (const dirPath of api.getAllDirectories()) {
        const caps = api.getDirectoryCapsule(dirPath);
        if (caps) {
            directoriesMap[caps.relativePath] = caps;
        }
    }

    // Output capsules JSON with stats
    const capsulesPath = path.join(outputPath, "capsules.json");
    const output = {
        stats,
        files: Object.fromEntries(
            Array.from(capsules.entries()).map(([, v]) => [v.relativePath, v])
        ),
        directories: directoriesMap,
    };
    await fs.writeFile(capsulesPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`   📋 ${capsulesPath}`);

    // Demo neighborhood query
    if (allFiles.length > 0 && options.verbose) {
        console.log("");
        console.log("🔍 API Demo - getDependencyNeighborhood:");
        const sampleFile = allFiles.find((f) => f.includes("Calculator")) || allFiles[0];
        const neighbors = api.getDependencyNeighborhood(sampleFile, { radius: 2, cap: 5 });
        console.log(`   File: ${path.basename(sampleFile)}`);
        console.log(`   Neighborhood: ${neighbors.map((n) => path.basename(n)).join(", ") || "(none)"}`);
    }

    console.log("");
    console.log("✅ Done!");
}

main().catch((error) => {
    console.error("❌ Error:", error.message);
    if (options.verbose) {
        console.error(error.stack);
    }
    process.exit(1);
});
