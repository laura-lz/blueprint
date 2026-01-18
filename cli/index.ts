#!/usr/bin/env node

/**
 * CLI entry point for the codebase documentation agent
 * Usage: npx tsx cli/index.ts --target ./samples/calculator --output ./output
 */

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { config } from "dotenv";

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
config({ path: path.resolve(__dirname, "../.env"), override: true });
import {
    createUpperLevelAPI,
    createGeminiClient,
    readFileContent,
    type FileCapsule,
    type ExportEntry,
} from "../src/core/index.js";

const program = new Command();

program
    .name("nexhacks-agent")
    .description("Codebase documentation agent - generates file capsules for upper-level graph")
    .version("1.0.0")
    .requiredOption("-t, --target <path>", "Target directory to scan")
    .option("-o, --output <path>", "Output directory for capsules.json", "./output")
    .option("--no-summarize", "Disable AI summary generation")
    .option("--deep-all", "Generate deep analysis (lowerLevelSummary + structure) for all code files")
    .option("--with-evals", "Run LLM evaluations after agent completes (saves CSVs to monitoring/)")
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

    let rootSummary: string | undefined;

    // Generate AI summaries if requested
    if (options.summarize) {
        const client = createGeminiClient();

        if (client.isConfigured()) {
            console.log("🤖 Generating AI summaries...");
            let count = 0;
            const total = capsules.size;

            for (const [, capsule] of capsules) {
                // Skip files without metadata
                if (!capsule.metadata) {
                    continue;
                }

                try {
                    count++;
                    if (options.verbose) {
                        console.log(`   [${count}/${total}] ${capsule.relativePath}`);
                    }

                    const { summary, version } = await client.generateCapsuleSummary(
                        capsule.relativePath,
                        {
                            fileDocstring: capsule.metadata.fileDocstring,
                            functionSignatures: capsule.metadata.functionSignatures,
                            firstNLines: capsule.metadata.firstNLines,
                            usedBy: capsule.metadata.usedBy,
                            dependsOn: capsule.metadata.dependsOn,
                            exports: capsule.exports.map((e: ExportEntry) => e.name),
                        }
                    );

                    capsule.upperLevelSummary = summary;
                    capsule.upperLevelSummaryVersion = version;
                } catch (error) {
                    console.warn(`   ⚠️ Failed to summarize ${capsule.relativePath}`);
                }
            }

            console.log(`   ✅ Generated ${count} summaries`);

            // Generate root directory summary
            console.log("📁 Generating root directory summary...");
            const rootFiles: { name: string; summary: string }[] = [];
            const rootSubdirs = new Set<string>();

            for (const [filePath, capsule] of capsules) {
                const rel = path.relative(targetPath, filePath);
                const parts = rel.split(path.sep);

                if (parts.length === 1) {
                    // It's in the root
                    rootFiles.push({
                        name: capsule.name,
                        summary: capsule.upperLevelSummary || "No summary generated",
                    });
                } else {
                    rootSubdirs.add(parts[0]);
                }
            }

            try {
                rootSummary = await client.generateDirectorySummary(
                    targetPath,
                    rootFiles,
                    Array.from(rootSubdirs)
                );
                console.log("   ✅ Root summary generated");
            } catch (error) {
                console.warn("   ⚠️ Failed to generate root summary");
            }
        } else {
            console.log("⚠️ GEMINI_API_KEY not set, skipping AI summaries");
        }
    }

    // Generate deep analysis if requested
    if (options.deepAll) {
        const client = createGeminiClient();

        if (client.isConfigured()) {
            console.log("🔬 Generating deep analysis for all files...");
            let deepCount = 0;

            for (const [filePath, capsule] of capsules) {
                // Skip non-code files
                if (["json", "css", "markdown", "yaml"].includes(capsule.lang)) {
                    continue;
                }

                try {
                    deepCount++;
                    if (options.verbose) {
                        console.log(`   [deep ${deepCount}] ${capsule.relativePath}`);
                    }

                    const fileContent = await readFileContent(filePath);
                    const analysis = await client.generateDeepAnalysis(
                        capsule.relativePath,
                        fileContent
                    );

                    capsule.lowerLevelSummary = analysis.lowerLevelSummary;
                    capsule.structure = analysis.structure;
                    capsule.lowerLevelSummaryVersion = analysis.version;
                } catch (error) {
                    console.warn(`   ⚠️ Failed deep analysis for ${capsule.relativePath}`);
                    if (options.verbose) {
                        console.warn(`      ${error}`);
                    }
                }
            }

            console.log(`   ✅ Deep analysis complete for ${deepCount} files`);
        } else {
            console.log("⚠️ GEMINI_API_KEY not set, skipping deep analysis");
        }
    }

    // Write output
    console.log("💾 Writing output...");
    await fs.mkdir(outputPath, { recursive: true });

    // Output capsules JSON with stats
    const capsulesPath = path.join(outputPath, "capsules.json");
    const output = {
        stats,
        rootSummary,
        files: Object.fromEntries(
            Array.from(capsules.entries()).map(([, v]) => [v.relativePath, v])
        ),
    };
    await fs.writeFile(capsulesPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`   📋 ${capsulesPath}`);

    // Demo neighborhood query
    if (allFiles.length > 0 && options.verbose) {
        console.log("");
        console.log("🔍 API Demo - getDependencyNeighborhood:");
        const sampleFile = allFiles.find((f: string) => f.includes("Calculator")) || allFiles[0];
        const neighbors = api.getDependencyNeighborhood(sampleFile, { radius: 2, cap: 5 });
        console.log(`   File: ${path.basename(sampleFile)}`);
        console.log(`   Neighborhood: ${neighbors.map((n: string) => path.basename(n)).join(", ") || "(none)"}`);
    }

    console.log("");
    console.log("✅ Done!");

    // Run evaluations if requested
    if (options.withEvals) {
        console.log("");
        console.log("🧪 Running LLM evaluations...");

        const monitoringDir = path.resolve(__dirname, "../monitoring");
        const appPy = path.join(monitoringDir, "app.py");

        try {
            await fs.access(appPy);
        } catch {
            console.warn("⚠️ monitoring/app.py not found, skipping evaluations.");
            return;
        }

        const pythonProcess = spawn("python", [
            appPy,
            "--headless",
            "--capsules-path", capsulesPath
        ], {
            cwd: monitoringDir,
            stdio: "inherit"
        });

        await new Promise<void>((resolve, reject) => {
            pythonProcess.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Evaluation script exited with code ${code}`));
                }
            });
            pythonProcess.on("error", reject);
        });
    }
}

main().catch((error) => {
    console.error("❌ Error:", error.message);
    if (options.verbose) {
        console.error(error.stack);
    }
    process.exit(1);
});
