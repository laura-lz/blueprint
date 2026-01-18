/**
 * Risk Analysis Agent
 * Analyzes function code for security risks, best practices, and provides recommendations
 */

import * as fs from 'fs';
import * as path from 'path';
import { GeminiClient } from './gemini.js';
import type { Language, CodeBlockSummary } from './types.js';

// ============================================================
// TYPES
// ============================================================

export type RiskType = 'security' | 'performance' | 'error_handling' | 'concurrency' | 'type_safety' | 'api_misuse';
export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Risk {
    type: RiskType;
    description: string;
    severity: RiskSeverity;
    lineNumbers?: number[];
}

export interface BestPractice {
    practice: string;
    suggestion: string;
    reference?: string;
}

export interface RiskAnalysis {
    functionName: string;
    riskLevel: RiskLevel;
    risks: Risk[];
    bestPractices: BestPractice[];
    summary: string;
}

export interface RiskAnalysisConfig {
    apiKey: string;
    ttcApiKey?: string;
}

// ============================================================
// RISK ANALYSIS AGENT
// ============================================================

/**
 * Agent for analyzing code functions for risks and best practices
 */
export class RiskAnalysisAgent {
    private client: GeminiClient;

    constructor(config: RiskAnalysisConfig) {
        this.client = new GeminiClient({
            apiKey: config.apiKey,
            ttcApiKey: config.ttcApiKey
        });
    }

    /**
     * Extract function code from a file using line numbers
     */
    extractFunctionCode(filePath: string, startLine: number, endLine: number): string {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Clamp to valid range (1-indexed to 0-indexed)
        const start = Math.max(0, startLine - 1);
        const end = Math.min(lines.length, endLine);

        return lines.slice(start, end).join('\n');
    }

    /**
     * Analyze a single function for risks and best practices
     */
    async analyzeFunction(
        functionCode: string,
        language: Language,
        functionName: string,
        context?: { filePath?: string; exports?: string[] }
    ): Promise<RiskAnalysis> {
        const prompt = this.generateRiskPrompt(functionCode, language, functionName, context);

        const response = await this.client.chat([
            {
                role: 'system',
                content: `You are a senior code reviewer and security expert. Analyze code for risks across these categories:
- Security: SQL injection, XSS, path traversal, hardcoded secrets, insecure crypto, SSRF
- Performance: Memory leaks, N+1 queries, blocking I/O, inefficient algorithms
- Error Handling: Unhandled exceptions, swallowed errors, missing input validation
- Concurrency: Race conditions, deadlocks, shared state mutations without locks
- Type Safety: Unsafe casts, any usage, potential null/undefined errors
- API Misuse: Deprecated APIs, incorrect patterns, missing cleanup/disposal

Output strict JSON. Be concise but thorough.`
            },
            {
                role: 'user',
                content: prompt
            }
        ], { responseMimeType: 'application/json' });

        try {
            const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);

            return {
                functionName,
                riskLevel: parsed.riskLevel || 'low',
                risks: parsed.risks || [],
                bestPractices: parsed.bestPractices || [],
                summary: parsed.summary || 'No issues found.'
            };
        } catch (e) {
            console.error('[RiskAgent] Failed to parse analysis:', e);
            return {
                functionName,
                riskLevel: 'low',
                risks: [],
                bestPractices: [],
                summary: 'Failed to analyze function.'
            };
        }
    }

    /**
     * Analyze all code blocks in a file's structure
     */
    async analyzeFileStructure(
        filePath: string,
        structure: CodeBlockSummary[],
        language: Language
    ): Promise<Map<string, RiskAnalysis>> {
        const results = new Map<string, RiskAnalysis>();

        for (const block of structure) {
            try {
                const code = this.extractFunctionCode(filePath, block.startLine, block.endLine);
                const analysis = await this.analyzeFunction(code, language, block.name);
                results.set(block.name, analysis);
            } catch (error) {
                console.warn(`[RiskAgent] Failed to analyze ${block.name}:`, error);
            }
        }

        return results;
    }

    /**
     * Generate the risk analysis prompt
     */
    private generateRiskPrompt(
        code: string,
        language: Language,
        functionName: string,
        context?: { filePath?: string; exports?: string[] }
    ): string {
        return `Analyze this ${language} function for risks and best practices.

Function: ${functionName}
${context?.filePath ? `File: ${context.filePath}` : ''}
${context?.exports?.length ? `Exports: ${context.exports.join(', ')}` : ''}

\`\`\`${language}
${code}
\`\`\`

Provide JSON with this structure:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "risks": [
    {
      "type": "security" | "performance" | "error_handling" | "concurrency" | "type_safety" | "api_misuse",
      "description": "Brief description of the risk",
      "severity": "low" | "medium" | "high",
      "lineNumbers": [1, 2]  // Optional: relative line numbers within the function
    }
  ],
  "bestPractices": [
    {
      "practice": "Name of the best practice",
      "suggestion": "How to improve the code",
      "reference": "Link to docs if known"
    }
  ],
  "summary": "1-2 sentence summary of overall code quality"
}

If no risks found, return empty risks array with riskLevel "low".
Focus on actionable, specific findings. Avoid generic advice.`;
    }

    /**
     * Calculate overall file risk from function analyses
     */
    calculateFileRisk(analyses: Map<string, RiskAnalysis>): RiskLevel {
        let maxSeverity = 0;

        for (const analysis of analyses.values()) {
            const level = this.riskLevelToNumber(analysis.riskLevel);
            if (level > maxSeverity) {
                maxSeverity = level;
            }
        }

        return this.numberToRiskLevel(maxSeverity);
    }

    private riskLevelToNumber(level: RiskLevel): number {
        switch (level) {
            case 'critical': return 4;
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 0;
        }
    }

    private numberToRiskLevel(num: number): RiskLevel {
        if (num >= 4) return 'critical';
        if (num >= 3) return 'high';
        if (num >= 2) return 'medium';
        return 'low';
    }
}

/**
 * Factory function to create RiskAnalysisAgent
 */
export function createRiskAnalysisAgent(apiKey: string, ttcApiKey?: string): RiskAnalysisAgent {
    return new RiskAnalysisAgent({ apiKey, ttcApiKey });
}
