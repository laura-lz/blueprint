/**
 * Gemini API client for LLM integration
 * Uses Google's Gemini API for generating summaries
 */

import { CAPSULE_SUMMARY_VARIANTS, DEEP_ANALYSIS_VARIANTS } from './prompts.js';
import { FeedbackManager } from './feedback-manager.js';

export interface GeminiConfig {
    apiKey: string;
    model?: string;
    ttcApiKey?: string;
    feedbackManager?: FeedbackManager;
}

export interface Message {
    role: "system" | "user" | "assistant" | "model";
    content: string;
}

interface GeminiContent {
    role: "user" | "model";
    parts: { text: string }[];
}

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
            role: string;
        };
        finishReason: string;
    }[];
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

const DEFAULT_MODEL = "gemini-3-flash-preview";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TTC_COMPRESS_URL = "https://api.thetokencompany.com/v1/compress";

interface TTCResponse {
    output?: string;
    output_tokens?: number;
    original_input_tokens?: number;
    compression_time?: number;
}

/**
 * Gemini client for generating AI-powered summaries
 */
export class GeminiClient {
    private apiKey: string;
    private model: string;
    private ttcApiKey?: string;
    private feedbackManager?: FeedbackManager;

    constructor(config: GeminiConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_MODEL;
        this.ttcApiKey = config.ttcApiKey;
        this.feedbackManager = config.feedbackManager;
    }

    /**
     * Compresses content using The Token Company's Bear-1 model
     */
    async compressContent(text: string): Promise<string> {
        if (!this.ttcApiKey) {
            return text; // Pass through if no key configured
        }

        console.log("Using TTC to compress content...");

        try {
            const start = Date.now();
            const response = await fetch(TTC_COMPRESS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.ttcApiKey}`
                },
                body: JSON.stringify({
                    model: "bear-1",
                    input: text,
                    compression_settings: {
                        aggressiveness: 0.6, // Balanced compression
                    }
                })
            });
            if (!response.ok) {
                console.warn(`⚠️ Compression failed: ${response.statusText}. Using original content.`);
                return text;
            }

            const data = await response.json() as TTCResponse;
            const compressedText = data.output || text;

            // Log savings calculation if available
            if (data.original_input_tokens && data.output_tokens) {
                const savings = Math.round((1 - (data.output_tokens / data.original_input_tokens)) * 100);
                console.log(`   🐻 Compressed: ${savings}% smaller (${data.original_input_tokens} -> ${data.output_tokens} tokens) in ${Date.now() - start}ms`);
            }

            return compressedText;
        } catch (error) {
            console.warn("⚠️ Compression error:", error);
            return text; // Fallback to original
        }
    }

    /**
     * Sends a chat request to Gemini
     */
    /**
     * Sends a chat request to Gemini
     */
    async chat(messages: Message[], configOverrides?: { responseMimeType?: string, maxOutputTokens?: number }): Promise<string> {
        // Convert OpenAI-style messages to Gemini format
        const systemInstruction = messages.find(m => m.role === "system")?.content;
        const contents: GeminiContent[] = messages
            .filter(m => m.role !== "system")
            .map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }]
            }));

        const requestBody: Record<string, unknown> = {
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
                ...configOverrides
            }
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

        // console.log("Gemini Request Config:", JSON.stringify(requestBody.generationConfig)); // Debug log

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as GeminiResponse;
        return data.candidates[0]?.content?.parts[0]?.text || "";
    }

    /**
     * Generates a summary for a file
     */
    async generateFileSummary(
        filePath: string,
        fileContent: string,
        exports: string[],
        imports: string[]
    ): Promise<string> {
        // Compress content before analysis
        const contentToAnalyze = await this.compressContent(fileContent);

        const prompt = `Analyze this code file and provide a concise wiki-style summary.

File: ${filePath}

Exports: ${exports.join(", ") || "None"}
Imports: ${imports.join(", ") || "None"}

Code:
\`\`\`
${contentToAnalyze.slice(0, 3000)}${contentToAnalyze.length > 3000 ? "\n... (truncated)" : ""}
\`\`\`

Provide a summary in the following format:
- **Purpose**: One sentence describing what this file does
- **Key Components**: List the main functions/classes/components
- **Dependencies**: Brief note on what it depends on
- **Usage**: How other parts of the codebase might use this

Keep it concise (max 150 words).`;

        return this.chat([
            {
                role: "system",
                content: "You are a technical documentation writer. Generate concise, accurate summaries of code files in wiki format.",
            },
            {
                role: "user",
                content: prompt,
            },
        ]);
    }

    /**
     * Generates an architecture overview from file summaries
     */
    async generateArchitectureOverview(
        files: { path: string; summary: string; exports: string[]; imports: string[] }[]
    ): Promise<string> {
        const fileList = files
            .map((f) => `- ${f.path}: ${f.summary.split("\n")[0]}`)
            .join("\n");

        const prompt = `Given these file summaries from a codebase, generate a high-level architecture overview.

Files:
${fileList}

Generate:
1. A brief description of what this codebase does (2-3 sentences)
2. The main components/modules and their responsibilities
3. How the components relate to each other

Keep it concise and focused on the big picture.`;

        return this.chat([
            {
                role: "system",
                content: "You are a software architect. Generate clear, high-level architecture overviews.",
            },
            {
                role: "user",
                content: prompt,
            },
        ]);
    }

    /**
     * Generates a concise 1-line summary from a FileCapsule's context
     * Uses only extracted metadata, not full file content
     */
    async generateCapsuleSummary(
        filePath: string,
        context: {
            fileDocstring?: string;
            functionSignatures: { name: string; signature: string; jsdoc?: string }[];
            firstNLines: string;
            usedBy: string[];
            dependsOn: string[];
            exports: string[];
        }
    ): Promise<{ summary: string; version: string }> {
        // Select prompt version
        const versionId = this.feedbackManager
            ? this.feedbackManager.getActiveVersion("capsuleSummary")
            : "v1_balanced";

        const variant = CAPSULE_SUMMARY_VARIANTS[versionId] || CAPSULE_SUMMARY_VARIANTS["v1_balanced"];

        const docstring = context.fileDocstring ? `Docstring: ${context.fileDocstring}` : "";
        const signatures = context.functionSignatures.map(s => `- ${s.signature}${s.jsdoc ? ` // ${s.jsdoc}` : ""}`).join("\n") || "None";
        const firstLines = context.firstNLines.split("\n").slice(0, 15).join("\n");

        const prompt = variant.template
            .replace("{{filePath}}", filePath)
            .replace("{{docstring}}", docstring)
            .replace("{{exports}}", context.exports.join(", ") || "None")
            .replace("{{usedBy}}", context.usedBy.join(", ") || "No dependents")
            .replace("{{dependsOn}}", context.dependsOn.join(", ") || "No local dependencies")
            .replace("{{signatures}}", signatures)
            .replace("{{firstLines}}", firstLines);

        const compressedPrompt = await this.compressContent(prompt);

        const summary = await this.chat([
            {
                role: "system",
                content: variant.systemInstruction,
            },
            {
                role: "user",
                content: compressedPrompt,
            },
        ]);

        return { summary: summary.trim(), version: versionId };
    }

    /**
     * Generates a concise summary for a directory
     */
    async generateDirectorySummary(
        dirPath: string,
        files: { name: string; summary: string }[],
        subdirectories: string[]
    ): Promise<string> {
        const fileList = files
            .map(f => `- ${f.name}: ${f.summary}`)
            .join("\n");

        const prompt = `Generate a concise summary for this directory based on its contents.

Directory: ${dirPath}

Files:
${fileList}

Subdirectories: ${subdirectories.join(", ") || "None"}

Respond with a short 1-sentence summary:
1. What is the primary purpose of this directory?
2. What are the key functionalities contained within?
(Does not need to be grammatically correct; the sentence can start with a verb)
`;

        return this.chat([
            {
                role: "system",
                content: "You are a code documentation expert. Generate extremely concise 1-sentence directory summaries.",
            },
            {
                role: "user",
                content: prompt,
            },
        ]);
    }

    /**
     * Generates a deep analysis for a single file including block-level summaries
     */
    async generateDeepAnalysis(
        filePath: string,
        fileContent: string
    ): Promise<{ lowerLevelSummary: string; structure: any[]; version: string }> {
        // Select prompt version
        const versionId = this.feedbackManager
            ? this.feedbackManager.getActiveVersion("deepAnalysis")
            : "v1_structured";

        const variant = DEEP_ANALYSIS_VARIANTS[versionId] || DEEP_ANALYSIS_VARIANTS["v1_structured"];

        // OPTIMIZATION: Strip comments but preserve newlines to keep line numbers accurate.
        const contentToAnalyze = fileContent
            .replace(/\/\/[^\n]*/g, '') // Remove single line comments
            .replace(/\/\*[\s\S]*?\*\//g, (match) => '\n'.repeat(match.split('\n').length - 1)); // Replace block comments with newlines

        const prompt = variant.template
            .replace("{{filePath}}", filePath)
            .replace("{{content}}", contentToAnalyze);

        const MAX_ATTEMPTS = 3;
        let lastError: any;
        let lastResponse = "";

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                // Enable output as JSON for robustness
                const response = await this.chat([
                    {
                        role: "system",
                        content: variant.systemInstruction,
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ], { responseMimeType: "application/json" });


                lastResponse = response;

                // Strip markdown code fences if present and trim whitespace
                // Gemini JSON mode might still return markdown fences sometimes, or just raw JSON.
                let cleanResponse = response.replace(/```json/g, "").replace(/```/g, "").trim();

                const result = JSON.parse(cleanResponse);
                return {
                    ...result,
                    version: versionId
                };
            } catch (e) {
                console.warn(`[Gemini] Deep analysis attempt ${attempt}/${MAX_ATTEMPTS} failed to parse JSON.`);
                lastError = e;

                // If it's the last attempt, we let it fall through to the return below
                if (attempt < MAX_ATTEMPTS) {
                    console.log(`[Gemini] Retrying...`);
                }
            }
        }

        console.error("Failed to parse deep analysis JSON after retries:", lastError);
        console.error("Raw Response:", lastResponse);

        return {
            lowerLevelSummary: "Failed to generate deep analysis due to invalid JSON response. Please try again.",
            structure: [],
            version: versionId
        };
    }

    /**
     * Check if the client is properly configured
     */
    isConfigured(): boolean {
        return Boolean(this.apiKey && this.apiKey.length > 0);
    }
}

/**
 * Factory function to create Gemini client
 */
export function createGeminiClient(apiKey?: string, feedbackManager?: FeedbackManager): GeminiClient {
    const key = apiKey || process.env.GEMINI_API_KEY || "";


    return new GeminiClient({
        apiKey: key,
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        ttcApiKey: process.env.TTC_API_KEY,
        feedbackManager
    });
}

// Re-export with OpenRouter-compatible names for backward compatibility
export { GeminiClient as OpenRouterClient };
export { createGeminiClient as createOpenRouterClient };