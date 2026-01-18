/**
 * Prompt variants for the RLHF-like feedback loop
 */

export interface PromptVariant {
  id: string;
  description: string;
  focus: "completeness" | "accuracy" | "clarity" | "verbosity" | "balanced";
  template: string;
  systemInstruction: string;
}

export const CAPSULE_SUMMARY_VARIANTS: Record<string, PromptVariant> = {
  "v1_balanced": {
    id: "v1_balanced",
    description: "Balanced summary (default)",
    focus: "balanced",
    systemInstruction: "You are a code documentation expert. Generate extremely concise 1-sentence file summaries. Do not include any prefixes, labels, or formatting - just 1 plain sentences.",
    template: `Generate a 1-sentence summary for this code file based on ONLY the following context.

File: {{filePath}}

{{docstring}}

Exports: {{exports}}
Used by: {{usedBy}}
Depends on: {{dependsOn}}

Function signatures:
{{signatures}}

First 15 lines preview:
{{firstLines}}

Respond with ONLY 1 sentences:
1. What this file does (purpose)
2. How it fits into the codebase (dependencies/usage)

Write for optimal readability and understanding; the output does not have to be full sentences.`
  },
  "v2_verbose": {
    id: "v2_verbose",
    description: "Descriptive summary (high completeness)",
    focus: "completeness",
    systemInstruction: "You are a technical documentarian. Provide thorough but clear 2-sentence summaries of code files.",
    template: `Provide a detailed 2-sentence summary for this code file.

File: {{filePath}}

{{docstring}}

Context:
- Exports: {{exports}}
- Relationships: Used by {{usedBy}}, Depends on {{dependsOn}}
- Symbols: {{signatures}}

Preview:
{{firstLines}}

Provide exactly two sentences:
Sentence 1: Explain the core logic and architectural role of this file.
Sentence 2: Detail specific technical responsibilities and data transformations it handles.`
  },
  "v3_precision": {
    id: "v3_precision",
    description: "Ultra-concise summary (high clarity/accuracy)",
    focus: "accuracy",
    systemInstruction: "You are a senior principal engineer. Summarize files with extreme precision and zero fluff.",
    template: `Summarize technical role of {{filePath}}.

Data:
{{docstring}}
Exports: {{exports}}
Context: {{usedBy}} -> THIS -> {{dependsOn}}
API: {{signatures}}

Rule: Max 20 words. Focus on the 'Why' and the 'Input/Output'.`
  }
};

export const DEEP_ANALYSIS_VARIANTS: Record<string, PromptVariant> = {
  "v1_structured": {
    id: "v1_structured",
    description: "Standard structured analysis",
    focus: "balanced",
    systemInstruction: "You are a code analyst. Output strict JSON. Be concise.",
    template: `Analyze this code file.
CRITICAL: You must provide ACCURATE startLine and endLine for each block. These line numbers will be used to highlight code in the editor, so they must match the provided code exactly.

File: {{filePath}}

Code:
\`\`\`
{{content}}
\`\`\`

Provide a JSON response with the following structure:
{
  "lowerLevelSummary": "A concise paragraph (2-3 sentences) summarizing the file's purpose.",
  "structure": [
    {
      "name": "Function/Class Name",
      "type": "function" | "class" | "block",
      "startLine": <number>,
      "endLine": <number>,
      "summary": "Brief 1-sentence summary."
    }
  ]
}

Identify all main functions, classes, and logical blocks.

IMPORTANT: Verify line numbers against the provided code. 'startLine' is where the function/class definition begins, 'endLine' is the closing brace.
IMPORTANT JSON RULES:
1. Output MUST be valid JSON.
2. Escape all double quotes within strings.
3. Do NOT use unescaped newlines in strings.
Respond ONLY with the RAW JSON object.

Example:
{
  "lowerLevelSummary": "Handles config setup.",
  "structure": [
    { "name": "init", "type": "function", "startLine": 1, "endLine": 10, "summary": "Initializes app." },
    { "name": "loadConfig", "type": "function", "startLine": 12, "endLine": 25, "summary": "Loads config file." }
  ]
}`
  },
  "v2_detailed": {
    id: "v2_detailed",
    description: "Deep dive analysis (high completeness)",
    focus: "completeness",
    systemInstruction: "You are a deep-learning code auditor. Provide extensive analysis of function interactions.",
    template: `Conduct an exhaustive deep analysis of {{filePath}}.

Code:
\`\`\`
{{content}}
\`\`\`

Output JSON:
{
  "lowerLevelSummary": "A detailed technical breakdown of the file's algorithm and edge cases.",
  "structure": [
    { 
      "name": "Name", 
      "type": "function", 
      "startLine": N, 
      "endLine": M, 
      "summary": "Detailed technical explanation of logic, parameters, and return types." 
    }
  ]
}`
  }
};

export type PromptCategory = "capsuleSummary" | "deepAnalysis";
