/**
 * OpenRouter API client for LLM integration
 * Compatible with OpenAI-style API format
 */

export interface OpenRouterConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    siteUrl?: string;
    siteName?: string;
}

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

const DEFAULT_MODEL = "z-ai/glm-4.7";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter client for generating AI-powered summaries
 */
export class OpenRouterClient {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    private siteUrl: string;
    private siteName: string;

    constructor(config: OpenRouterConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
        this.model = config.model || DEFAULT_MODEL;
        this.siteUrl = config.siteUrl || "http://localhost";
        this.siteName = config.siteName || "Nexhacks Agent";
    }

    /**
     * Sends a chat completion request to OpenRouter
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
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }

        const data: ChatCompletionResponse = await response.json();
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
     * Check if the client is properly configured
     */
    isConfigured(): boolean {
        return Boolean(this.apiKey && this.apiKey.length > 0);
    }
}

/**
 * Create a mock client for testing without API key
 */
export function createMockClient(): OpenRouterClient {
    return {
        chat: async () => "Mock response - No API key configured",
        generateFileSummary: async (filePath: string) =>
            `**Purpose**: This file (${filePath.split("/").pop()}) contains code that needs an OpenRouter API key for detailed analysis.\n\n**Key Components**: See exports list.\n\n**Dependencies**: See imports list.\n\n**Usage**: Configure OPENROUTER_API_KEY for AI-powered summaries.`,
        generateArchitectureOverview: async () =>
            "Architecture overview requires an OpenRouter API key. Configure OPENROUTER_API_KEY environment variable.",
        isConfigured: () => false,
    } as unknown as OpenRouterClient;
}

/**
 * Factory function to create OpenRouter client
 */
export function createOpenRouterClient(apiKey?: string): OpenRouterClient {
    const key = apiKey || process.env.OPENROUTER_API_KEY;

    if (!key) {
        console.warn("No OpenRouter API key found. Using mock client.");
        return createMockClient();
    }

    return new OpenRouterClient({
        apiKey: key,
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    });
}