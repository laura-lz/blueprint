/**
 * Gemini API client for LLM integration
 * Compatible with OpenAI/OpenRouter-style API format
 */

export interface GeminiConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    siteUrl?: string;
    siteName?: string;
}

export type OpenRouterConfig = GeminiConfig;

export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatCompletionResponse {
    id: string;
    choices: {
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Gemini client for generating AI-powered summaries
 */
export class GeminiClient {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    private siteUrl: string;
    private siteName: string;

    constructor(config: GeminiConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
        this.model = config.model || DEFAULT_MODEL;
        this.siteUrl = config.siteUrl || "http://localhost";
        this.siteName = config.siteName || "Nexhacks Agent";
    }

    /**
     * Sends a chat completion request to Gemini (via OpenRouter or direct)
     */
    async chat(messages: Message[]): Promise<string> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": this.siteUrl,
                "X-Title": this.siteName,
            },
            body: JSON.stringify({
                model: this.model,
                messages,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as ChatCompletionResponse;
        return data.choices[0]?.message?.content || "";
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
        const prompt = `Analyze this code file and provide a concise wiki-style summary.

File: ${filePath}

Exports: ${exports.join(", ") || "None"}
Imports: ${imports.join(", ") || "None"}

Code:
\`\`\`
${fileContent.slice(0, 3000)}${fileContent.length > 3000 ? "\n... (truncated)" : ""}
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

        return this.chat([
            {
                role: "system",
                content: "You are a code documentation expert. Generate extremely concise 2-sentence file summaries. Do not include any prefixes, labels, or formatting - just 2 plain sentences.",
            },
            {
                role: "user",
                content: prompt,
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
        const prompt = `Analyze this code file in detail.

File: ${filePath}

Code:
\`\`\`
${fileContent.slice(0, 8000)}${fileContent.length > 8000 ? "\n... (truncated)" : ""}
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
    });
}

// Re-export with OpenRouter-compatible names for backward compatibility
export { GeminiClient as OpenRouterClient };
export { createGeminiClient as createOpenRouterClient };