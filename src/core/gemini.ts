/**
 * Gemini API client for LLM integration
 * Uses Google's Gemini API for generating summaries
 */

export interface GeminiConfig {
    apiKey: string;
    model?: string;
    ttcApiKey?: string;
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

    constructor(config: GeminiConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_MODEL;
        this.ttcApiKey = config.ttcApiKey;
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
    async chat(messages: Message[]): Promise<string> {
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
            }
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

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

Generate a concise overview adhering to these strict rules:
1. **Total Length**: Maximum 200 words.
2. **Structure**:
   - **Puppose**: A brief description of the codebase's function and purpose (2-3 sentences).
   - **Data Flow**: Explain the core data flow (how data moves through the system, start to finish).
   - **Architecture**: Identify the architectural pattern (e.g., Client-Server, Extension-Webview) and key tech stack components.

Do not include generic fluff. Focus on the technical design and flow.`;

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
     * Generates a concise 2-line summary from a FileCapsule's context
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
    ): Promise<string> {
        const prompt = `Generate a 2-sentence summary for this code file based on ONLY the following context.

File: ${filePath}

${context.fileDocstring ? `Docstring: ${context.fileDocstring}` : ""}

Exports: ${context.exports.join(", ") || "None"}
Used by: ${context.usedBy.join(", ") || "No dependents"}
Depends on: ${context.dependsOn.join(", ") || "No local dependencies"}

Function signatures:
${context.functionSignatures.map(s => `- ${s.signature}${s.jsdoc ? ` // ${s.jsdoc}` : ""}`).join("\n") || "None"}

First 15 lines preview:
${context.firstNLines.split("\n").slice(0, 15).join("\n")}

Respond with ONLY 2 sentences:
1. What this file does (purpose)
2. How it fits into the codebase (dependencies/usage)

Write for optimal readability and understanding; the output does not have to be full sentences.`;
        const compressedPrompt = await this.compressContent(prompt);

        return this.chat([
            {
                role: "system",
                content: "You are a code documentation expert. Generate extremely concise 2-sentence file summaries. Do not include any prefixes, labels, or formatting - just 2 plain sentences.",
            },
            {
                role: "user",
                content: compressedPrompt,
            },
        ]);
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

Respond with a 2-sentence summary:
1. What is the primary purpose of this directory?
2. What are the key functionalities contained within?`;

        return this.chat([
            {
                role: "system",
                content: "You are a code documentation expert. Generate extremely concise 2-sentence directory summaries.",
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
    ): Promise<{ lowerLevelSummary: string; structure: any[] }> {
        // Compress content before analysis
        const contentToAnalyze = await this.compressContent(fileContent);

        const prompt = `Analyze this code file in detail.

File: ${filePath}

Code:
\`\`\`
${contentToAnalyze.slice(0, 8000)}${contentToAnalyze.length > 8000 ? "\n... (truncated)" : ""}
\`\`\`

Provide a JSON response with the following structure:
{
  "lowerLevelSummary": "A comprehensive paragraph summarizing the file's purpose, key algorithms, and role.",
  "structure": [
    {
      "name": "Function/Class Name",
      "type": "function" | "class" | "block",
      "startLine": <number>,
      "endLine": <number>,
      "summary": "Detailed explanation of what this block does."
    }
  ]
}

Identify the main functions, classes, and logical blocks. Estimate start/end lines based on the provided code.
Respond ONLY with the JSON object.`;

        const response = await this.chat([
            {
                role: "system",
                content: "You are a senior code analyst. detailed analysis in JSON format.",
            },
            {
                role: "user",
                content: prompt,
            },
        ]);

        try {
            // Strip markdown code fences if present
            const cleanJson = response.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse deep analysis JSON:", e);
            return {
                lowerLevelSummary: "Failed to generate deep analysis.",
                structure: []
            };
        }
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
export function createGeminiClient(apiKey?: string): GeminiClient {
    const key = apiKey || process.env.GEMINI_API_KEY || "";


    return new GeminiClient({
        apiKey: key,
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        ttcApiKey: process.env.TTC_API_KEY,
    });
}

// Re-export with OpenRouter-compatible names for backward compatibility
export { GeminiClient as OpenRouterClient };
export { createGeminiClient as createOpenRouterClient };