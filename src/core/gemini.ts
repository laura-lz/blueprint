/**
 * Native Gemini API client for LLM integration
 * Uses Google's generativelanguage.googleapis.com REST API
 */

export interface GeminiConfig {
    apiKey: string;
    model?: string;
}

export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

// Gemini API types
interface GeminiPart {
    text: string;
}

interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
}

interface GeminiRequest {
    systemInstruction?: { parts: GeminiPart[] };
    contents: GeminiContent[];
}

interface GeminiResponse {
    candidates?: {
        content: {
            parts: GeminiPart[];
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
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Native Gemini client for generating AI-powered summaries
 */
export class GeminiClient {
    private apiKey: string;
    private model: string;

    constructor(config: GeminiConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_MODEL;
    }

    /**
     * Converts OpenAI-style messages to Gemini format
     */
    private convertMessages(messages: Message[]): GeminiRequest {
        const request: GeminiRequest = {
            contents: [],
        };

        for (const msg of messages) {
            if (msg.role === "system") {
                // System messages become systemInstruction
                request.systemInstruction = {
                    parts: [{ text: msg.content }],
                };
            } else {
                // Map user/assistant to user/model
                request.contents.push({
                    role: msg.role === "assistant" ? "model" : "user",
                    parts: [{ text: msg.content }],
                });
            }
        }

        return request;
    }

    /**
     * Sends a chat completion request to Gemini
     */
    async chat(messages: Message[]): Promise<string> {
        const endpoint = `${API_BASE_URL}/models/${this.model}:generateContent`;
        const body = this.convertMessages(messages);

        const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = (await response.json()) as GeminiResponse;
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
                content:
                    "You are a technical documentation writer. Generate concise, accurate summaries of code files in wiki format.",
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
        const fileList = files.map((f) => `- ${f.path}: ${f.summary.split("\n")[0]}`).join("\n");

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
        const prompt = `Generate a ONE-SENTENCE summary for this code file.

File: ${filePath}

${context.fileDocstring ? `Docstring: ${context.fileDocstring}` : ""}

Exports: ${context.exports.join(", ") || "None"}
Used by: ${context.usedBy.join(", ") || "No dependents"}
Depends on: ${context.dependsOn.join(", ") || "No local dependencies"}

Function signatures:
${context.functionSignatures.map((s) => `- ${s.signature}${s.jsdoc ? ` // ${s.jsdoc}` : ""}`).join("\n") || "None"}

First 15 lines preview:
${context.firstNLines.split("\n").slice(0, 15).join("\n")}

Rules:
1. Respond with ONLY ONE sentence (max 15 words)
2. Start with a verb (e.g., "Handles...", "Provides...", "Defines...", "Exports...")
3. Focus on WHAT the file does, not implementation details
4. Be direct and action-oriented`;

        return this.chat([
            {
                role: "system",
                content:
                    "You are a code documentation expert. Generate extremely concise 2-sentence file summaries. Do not include any prefixes, labels, or formatting - just 2 plain sentences.",
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
        const fileList = files.map((f) => `- ${f.name}: ${f.summary}`).join("\n");

        const prompt = `Generate a concise summary for this directory based on its contents.

Directory: ${dirPath}

Files:
${fileList}

Subdirectories: ${subdirectories.join(", ") || "None"}

Respond with a 1-sentence summary:
1. What is the primary purpose of this directory?
2. What are the key functionalities contained within?`;

        return this.chat([
            {
                role: "system",
                content:
                    "You are a code documentation expert. Generate extremely concise 1-sentence directory summaries.",
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
  "lowerLevelSummary": "• First key point\\n• Second key point\\n• Third key point",
  "structure": [
    {
      "name": "Function/Class Name",
      "type": "function" | "class" | "block",
      "startLine": <number>,
      "endLine": <number>,
      "summary": "Detailed explanation of what this block does.",
      "calls": ["list", "of", "function", "names", "this", "block", "calls"]
    }
  ]
}

Rules:
1. For lowerLevelSummary: write 3-5 bullet points (each starting with •) about key functionality
2. Identify the main functions, classes, and logical blocks
3. Estimate start/end lines based on the provided code
4. For "calls", list ONLY functions/methods defined within THIS FILE that are called by this block
5. Do not include external library calls or built-in functions in "calls"
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
                structure: [],
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