/**
 * File scanner module
 * Recursively traverses directories and identifies code files
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface FileInfo {
    path: string;
    relativePath: string;
    name: string;
    extension: string;
    size: number;
    type: FileType;
}

export type FileType =
    | "typescript"
    | "javascript"
    | "react-typescript"
    | "react-javascript"
    | "python"
    | "go"
    | "rust"
    | "java"
    | "kotlin"
    | "c"
    | "cpp"
    | "csharp"
    | "ruby"
    | "php"
    | "swift"
    | "shell"
    | "css"
    | "scss"
    | "html"
    | "vue"
    | "json"
    | "yaml"
    | "markdown"
    | "other";

const CODE_EXTENSIONS: Record<string, FileType> = {
    // JavaScript/TypeScript
    ".ts": "typescript",
    ".tsx": "react-typescript",
    ".js": "javascript",
    ".jsx": "react-javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",

    // Python
    ".py": "python",
    ".pyw": "python",

    // Go
    ".go": "go",

    // Rust
    ".rs": "rust",

    // Java/Kotlin
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",

    // C/C++/C#
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",

    // Ruby
    ".rb": "ruby",
    ".rake": "ruby",

    // PHP
    ".php": "php",

    // Swift
    ".swift": "swift",

    // Shell
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",

    // Web
    ".css": "css",
    ".scss": "scss",
    ".sass": "scss",
    ".html": "html",
    ".htm": "html",
    ".vue": "vue",
    ".svelte": "html",

    // Config/Data
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
};

/**
 * Default patterns to exclude from scanning
 */
const DEFAULT_EXCLUDE_PATTERNS = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".cache",
    "__pycache__",
    ".turbo",
    "*.lock",
    "*.log",
];

export interface ScanOptions {
    /** Root directory to scan */
    rootDir: string;
    /** Patterns to exclude (glob-like) */
    excludePatterns?: string[];
    /** File extensions to include */
    includeExtensions?: string[];
    /** Maximum depth to traverse (undefined = unlimited) */
    maxDepth?: number;
}

/**
 * Checks if a path should be excluded based on patterns
 */
function shouldExclude(filePath: string, patterns: string[]): boolean {
    const name = path.basename(filePath);
    return patterns.some((pattern) => {
        if (pattern.startsWith("*")) {
            return name.endsWith(pattern.slice(1));
        }
        return name === pattern || filePath.includes(`/${pattern}/`);
    });
}

/**
 * Determines the file type based on extension
 */
function getFileType(extension: string): FileType {
    return CODE_EXTENSIONS[extension.toLowerCase()] || "other";
}

/**
 * Scans a directory recursively and returns file information
 */
export async function scanDirectory(options: ScanOptions): Promise<FileInfo[]> {
    const {
        rootDir,
        excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
        includeExtensions,
        maxDepth,
    } = options;

    const files: FileInfo[] = [];
    const absoluteRoot = path.resolve(rootDir);

    async function scanRecursive(dir: string, depth: number): Promise<void> {
        if (maxDepth !== undefined && depth > maxDepth) {
            return;
        }

        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (error) {
            console.warn(`Could not read directory: ${dir}`);
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(absoluteRoot, fullPath);

            if (shouldExclude(fullPath, excludePatterns)) {
                continue;
            }

            if (entry.isDirectory()) {
                await scanRecursive(fullPath, depth + 1);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);

                // Skip if extension filter is set and this doesn't match
                if (includeExtensions && !includeExtensions.includes(ext)) {
                    continue;
                }

                // Only include recognized code files by default
                const fileType = getFileType(ext);
                if (fileType === "other" && !includeExtensions) {
                    continue;
                }

                let stat;
                try {
                    stat = await fs.stat(fullPath);
                } catch {
                    continue;
                }

                files.push({
                    path: fullPath,
                    relativePath,
                    name: entry.name,
                    extension: ext,
                    size: stat.size,
                    type: fileType,
                });
            }
        }
    }

    await scanRecursive(absoluteRoot, 0);
    return files;
}

/**
 * Groups files by directory
 */
export function groupFilesByDirectory(files: FileInfo[]): Map<string, FileInfo[]> {
    const groups = new Map<string, FileInfo[]>();

    for (const file of files) {
        const dir = path.dirname(file.relativePath);
        const existing = groups.get(dir) || [];
        existing.push(file);
        groups.set(dir, existing);
    }

    return groups;
}

/**
 * Reads file content
 */
export async function readFileContent(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
}
