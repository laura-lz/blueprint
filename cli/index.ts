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
    .option("-f, --file <path>", "Analyze a specific file in depth")
    .option("--deep-all", "Run deep analysis on all files")
    .option("--no-summarize", "Disable AI summary generation")
    .option("-v, --verbose", "Enable verbose logging")
    .parse(process.argv);

const options = program.opts();

interface CapsulesJson {
    stats: any;
    files: Record<string, FileCapsule>;
    directories: Record<string, any>;
}

async function main() {
    const targetPath = path.resolve(options.target);
    const outputPath = path.resolve(options.output);
    const capsulesPath = path.join(outputPath, "capsules.json");

    console.log("🚀 Nexhacks Codebase Documentation Agent");
    console.log("========================================");
    console.log(`📁 Target: ${targetPath}`);
    console.log(`📤 Output: ${outputPath}`);
    console.log("");

    let capsules = new Map<string, FileCapsule>();
    let directoriesMap: Record<string, any> = {};
    let stats: any = { totalFiles: 0, totalEdges: 0 };
    let api: any = null;
    let loadedFromJson = false;

    // 1. Try to load existing capsules.json to avoid full rescan
    if (options.file) {
        try {
            const data = await fs.readFile(capsulesPath, "utf-8");
            const json = JSON.parse(data) as CapsulesJson;

            stats = json.stats;
            directoriesMap = json.directories;

            // Reconstruct Map with absolute paths as keys (assuming v.path is absolute)
            for (const [, cap] of Object.entries(json.files)) {
                capsules.set(cap.path, cap);
            }

            loadedFromJson = true;
            console.log("📦 Loaded existing capsules.json (Merge Mode)");
            console.log(`   ${capsules.size} file capsules loaded`);
        } catch (error) {
            console.warn("⚠️ Could not load existing capsules.json, falling back to full scan.");
        }
    }

    // 2. If not loaded (or not requested), perform full scan
    if (!loadedFromJson) {
        console.log("📂 Building upper-level graph...");
        api = await createUpperLevelAPI(targetPath);
        stats = api.getStats();
        console.log(`   ${stats.totalFiles} files, ${stats.totalEdges} edges`);

        // Get all file capsules
        const allFiles = api.getAllFiles();
        for (const filePath of allFiles) {
            const capsule = api.getFileCapsule(filePath);
            if (capsule) {
                capsules.set(filePath, capsule);
            }
        }
        console.log(`   ${capsules.size} file capsules generated`);
    }

    // 3. Generate AI summaries (only if NOT loaded from JSON, or if explicitly forced - implied by !loadedFromJson check logic above?)
    // Actually, if loadedFromJson, we typically skip mass summarization to preserve state/speed.
    // Unless user explicitly wants to re-summarize?
    // Current logic: if loadedFromJson, we skip this block unless we want to be smart.
    // But for simplicity/safety: only summarize if we did a fresh scan OR if we assume user wants it.
    // User goal: "generating a lower level output shouldn't force the upper level generation"
    // So if context is Merge Mode, we skip this unless needed.
    // But `options.summarize` is defaults true.
    // We'll skip if loadedFromJson to respect the "compartmentalize" request.

    if (options.summarize && !loadedFromJson) {
        const client = createGeminiClient();

        if (client.isConfigured()) {
            console.log("🤖 Generating AI summaries...");
            let count = 0;
            const total = capsules.size;

            for (const [, capsule] of capsules) {
                if (!capsule.metadata ||
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
                            fileDocstring: capsule.metadata.fileDocstring,
                            functionSignatures: capsule.metadata.functionSignatures,
                            firstNLines: capsule.metadata.firstNLines,
                            usedBy: capsule.metadata.usedBy,
                            dependsOn: capsule.metadata.dependsOn,
                            exports: capsule.exports.map(e => e.name),
                        }
                    );

                    capsule.upperLevelSummary = summary;
                } catch (error) {
                    console.warn(`   ⚠️ Failed to summarize ${capsule.relativePath}`);
                }
            }
            console.log(`   ✅ Generated ${count} summaries`);

            // Generate Directory Summaries (requires API or reconstructed directory structure)
            // If !loadedFromJson, we have `api`.
            if (api) {
                console.log("📂 Generating Directory summaries...");
                let dirCount = 0;
                const directories = api.getAllDirectories();

                for (const dirPath of directories) {
                    const dirCapsule = api.getDirectoryCapsule(dirPath);
                    if (!dirCapsule) continue;

                    const fileContexts = dirCapsule.files.map((relPath: string) => {
                        let fileCap: FileCapsule | undefined;
                        for (const [, cap] of capsules) {
                            if (cap.relativePath === relPath) {
                                fileCap = cap;
                                break;
                            }
                        }
                        return {
                            name: path.basename(relPath),
                            summary: fileCap?.upperLevelSummary || "No summary available"
                        };
                    });

                    try {
                        dirCount++;
                        if (options.verbose) console.log(`   [DIR] ${dirCapsule.relativePath}`);

                        const summary = await client.generateDirectorySummary(
                            dirCapsule.relativePath,
                            fileContexts,
                            dirCapsule.subdirectories
                        );
                        dirCapsule.summary = summary;

                        // Store in directoriesMap to be saved
                        directoriesMap[dirCapsule.relativePath] = dirCapsule;
                    } catch (error) {
                        console.warn(`   ⚠️ Failed to summarize directory ${dirCapsule.relativePath}`);
                    }
                }
                console.log(`   ✅ Generated ${dirCount} directory summaries`);
            }
        } else {
            console.log("⚠️ GEMINI_API_KEY not set, skipping AI summaries");
        }
    }

    // Phase 3: Deep File Analysis (if requested via --file or --deep-all)
    if (options.file || options.deepAll) {
        const client = createGeminiClient();
        if (client.isConfigured()) {
            // Determine which capsules to analyze
            let capsulesToAnalyze: FileCapsule[] = [];

            if (options.deepAll) {
                console.log("🔬 Performing deep analysis on ALL files...");
                // Analyze all capsules that have analyzable content
                for (const [, cap] of capsules) {
                    // Skip non-analyzable files (JSON, CSS, markdown, etc.)
                    if (["json", "css", "markdown", "md"].includes(cap.lang)) {
                        continue;
                    }
                    capsulesToAnalyze.push(cap);
                }
                console.log(`   Found ${capsulesToAnalyze.length} files to analyze`);
            } else if (options.file) {
                console.log(`🔬 Performing deep analysis on: ${options.file}`);
                const deepFileAbsPath = path.resolve(process.cwd(), options.file);
                for (const [, cap] of capsules) {
                    if (cap.path === deepFileAbsPath) {
                        capsulesToAnalyze.push(cap);
                        break;
                    }
                }
                if (capsulesToAnalyze.length === 0) {
                    console.warn(`   ⚠️ Target file not found in graph: ${options.file}`);
                    console.warn(`      Make sure it is within the target directory: ${targetPath}`);
                    if (loadedFromJson) {
                        console.warn(`      (Loaded from existing capsules.json - maybe try re-scanning without --file first?)`);
                    }
                }
            }

            // Perform deep analysis on each capsule
            let successCount = 0;
            const total = capsulesToAnalyze.length;
            for (let i = 0; i < capsulesToAnalyze.length; i++) {
                const capsule = capsulesToAnalyze[i];
                try {
                    if (options.verbose || options.deepAll) {
                        console.log(`   [${i + 1}/${total}] ${capsule.relativePath}`);
                    }

                    const content = await fs.readFile(capsule.path, "utf-8");
                    const analysis = await client.generateDeepAnalysis(capsule.relativePath, content);

                    // Update capsule with lower level analysis
                    capsule.lowerLevelSummary = analysis.lowerLevelSummary;
                    capsule.structure = analysis.structure;

                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Deep analysis failed for ${capsule.relativePath}:`, error);
                }
            }
            console.log(`   ✅ Deep analysis complete: ${successCount}/${total} files`);
        } else {
            console.log("⚠️ GEMINI_API_KEY not set, skipping deep analysis");
        }
    }

    // Write output
    console.log("💾 Writing output...");
    await fs.mkdir(outputPath, { recursive: true });

    const output = {
        stats,
        files: Object.fromEntries(
            Array.from(capsules.entries()).map(([, v]) => [v.relativePath, v])
        ),
        directories: directoriesMap,
    };
    await fs.writeFile(capsulesPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`   📋 ${capsulesPath}`);

    // Demo neighborhood query (Only if API was built, as we don't hydrate API from JSON yet)
    // If loadedFromJson, api is null, so skip this check.
    if (api && capsules.size > 0 && options.verbose) {
        console.log("");
        console.log("🔍 API Demo - getDependencyNeighborhood:");
        const allFilePaths = Array.from(capsules.keys());
        const sampleFile = allFilePaths.find((f) => f.includes("Calculator")) || allFilePaths[0];
        const neighbors = api.getDependencyNeighborhood(sampleFile, { radius: 2, cap: 5 });
        console.log(`   File: ${path.basename(sampleFile)}`);
        console.log(`   Neighborhood: ${neighbors.map((n: string) => path.basename(n)).join(", ") || "(none)"}`);
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
