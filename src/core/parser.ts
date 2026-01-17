/**
 * AST Parser module
 * Extracts imports, exports, and component information from code files
 */

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { FileType } from "./scanner";

export interface SymbolLocation {
    startLine: number;
    endLine: number;
}

export interface SymbolInfo {
    name: string;
    location: SymbolLocation;
}

export interface FunctionSignature {
    name: string;
    signature: string;          // e.g., "function add(a: number, b: number): number"
    jsdoc?: string;             // JSDoc comment if present
    location: SymbolLocation;
    exported: boolean;
}

export interface ParsedFile {
    imports: ImportInfo[];
    exports: ExportInfo[];
    isReactComponent: boolean;
    functions: SymbolInfo[];
    classes: SymbolInfo[];
    constants: SymbolInfo[];

    // New: for summary context
    fileDocstring?: string;              // First comment block at file top
    functionSignatures: FunctionSignature[];  // Signatures without bodies
}

export interface ImportInfo {
    source: string;
    specifiers: string[];
    isDefault: boolean;
    isNamespace: boolean;
}

export interface ExportInfo {
    name: string;
    type: "function" | "class" | "variable" | "default" | "type";
    isDefault: boolean;
    location?: SymbolLocation;
}

/**
 * Get Babel parser plugins based on file type
 */
function getParserPlugins(fileType: FileType): parser.ParserPlugin[] {
    const basePlugins: parser.ParserPlugin[] = ["decorators-legacy"];

    switch (fileType) {
        case "typescript":
            return [...basePlugins, "typescript"];
        case "react-typescript":
            return [...basePlugins, "typescript", "jsx"];
        case "javascript":
            return [...basePlugins];
        case "react-javascript":
            return [...basePlugins, "jsx"];
        default:
            return basePlugins;
    }
}

/**
 * Parse a JavaScript/TypeScript file and extract metadata
 */
export function parseFile(content: string, fileType: FileType): ParsedFile {
    const result: ParsedFile = {
        imports: [],
        exports: [],
        isReactComponent: false,
        functions: [],
        classes: [],
        constants: [],
        functionSignatures: [],
    };

    // Skip non-JS/TS files
    if (!["typescript", "javascript", "react-typescript", "react-javascript"].includes(fileType)) {
        return result;
    }

    let ast;
    try {
        ast = parser.parse(content, {
            sourceType: "module",
            plugins: getParserPlugins(fileType),
            errorRecovery: true,
            attachComment: true,  // Attach comments for docstring extraction
        });
    } catch (error) {
        console.warn("Failed to parse file:", error);
        return result;
    }

    // Extract file-level docstring (first leading comment)
    if (ast.comments && ast.comments.length > 0) {
        const firstComment = ast.comments[0];
        // Only use if it's at the start of the file (first 5 lines)
        if (firstComment.loc && firstComment.loc.start.line <= 5) {
            result.fileDocstring = firstComment.value.trim();
        }
    }

    // Type assertion for traverse
    const traverseFn = (typeof traverse === "function" ? traverse : (traverse as { default: typeof traverse }).default);

    traverseFn(ast, {
        // Track imports
        ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
            const source = path.node.source.value;
            const specifiers: string[] = [];
            let isDefault = false;
            let isNamespace = false;

            for (const spec of path.node.specifiers) {
                if (t.isImportDefaultSpecifier(spec)) {
                    specifiers.push(spec.local.name);
                    isDefault = true;
                } else if (t.isImportNamespaceSpecifier(spec)) {
                    specifiers.push(`* as ${spec.local.name}`);
                    isNamespace = true;
                } else if (t.isImportSpecifier(spec)) {
                    const imported = t.isIdentifier(spec.imported)
                        ? spec.imported.name
                        : spec.imported.value;
                    specifiers.push(imported);
                }
            }

            result.imports.push({ source, specifiers, isDefault, isNamespace });

            // Check for React import
            if (source === "react" || source === "React") {
                result.isReactComponent = true;
            }
        },

        // Track named exports
        ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
            const declaration = path.node.declaration;

            if (declaration) {
                const loc = declaration.loc;
                const location: SymbolLocation = {
                    startLine: loc?.start.line ?? 0,
                    endLine: loc?.end.line ?? 0,
                };

                if (t.isFunctionDeclaration(declaration) && declaration.id) {
                    result.exports.push({
                        name: declaration.id.name,
                        type: "function",
                        isDefault: false,
                        location,
                    });
                    result.functions.push({ name: declaration.id.name, location });
                } else if (t.isClassDeclaration(declaration) && declaration.id) {
                    result.exports.push({
                        name: declaration.id.name,
                        type: "class",
                        isDefault: false,
                        location,
                    });
                    result.classes.push({ name: declaration.id.name, location });
                } else if (t.isVariableDeclaration(declaration)) {
                    for (const decl of declaration.declarations) {
                        if (t.isIdentifier(decl.id)) {
                            const declLoc = decl.loc;
                            const declLocation: SymbolLocation = {
                                startLine: declLoc?.start.line ?? 0,
                                endLine: declLoc?.end.line ?? 0,
                            };
                            result.exports.push({
                                name: decl.id.name,
                                type: "variable",
                                isDefault: false,
                                location: declLocation,
                            });
                            result.constants.push({ name: decl.id.name, location: declLocation });
                        }
                    }
                } else if (t.isTSTypeAliasDeclaration(declaration)) {
                    result.exports.push({
                        name: declaration.id.name,
                        type: "type",
                        isDefault: false,
                    });
                } else if (t.isTSInterfaceDeclaration(declaration)) {
                    result.exports.push({
                        name: declaration.id.name,
                        type: "type",
                        isDefault: false,
                    });
                }
            }

            // Handle export { foo, bar }
            for (const spec of path.node.specifiers) {
                if (t.isExportSpecifier(spec)) {
                    const exported = t.isIdentifier(spec.exported)
                        ? spec.exported.name
                        : spec.exported.value;
                    result.exports.push({
                        name: exported,
                        type: "variable",
                        isDefault: false,
                    });
                }
            }
        },

        // Track default exports
        ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
            const declaration = path.node.declaration;
            let name = "default";
            const loc = path.node.loc;
            const location: SymbolLocation = {
                startLine: loc?.start.line ?? 0,
                endLine: loc?.end.line ?? 0,
            };

            if (t.isFunctionDeclaration(declaration) && declaration.id) {
                name = declaration.id.name;
                const declLoc = declaration.loc;
                result.functions.push({
                    name,
                    location: {
                        startLine: declLoc?.start.line ?? 0,
                        endLine: declLoc?.end.line ?? 0,
                    },
                });
            } else if (t.isClassDeclaration(declaration) && declaration.id) {
                name = declaration.id.name;
                const declLoc = declaration.loc;
                result.classes.push({
                    name,
                    location: {
                        startLine: declLoc?.start.line ?? 0,
                        endLine: declLoc?.end.line ?? 0,
                    },
                });
            } else if (t.isIdentifier(declaration)) {
                name = declaration.name;
            }

            result.exports.push({
                name,
                type: "default",
                isDefault: true,
                location,
            });
        },

        // Track function declarations (non-exported)
        FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id && !path.findParent((p) => t.isExportDeclaration(p.node))) {
                const loc = path.node.loc;
                result.functions.push({
                    name: path.node.id.name,
                    location: {
                        startLine: loc?.start.line ?? 0,
                        endLine: loc?.end.line ?? 0,
                    },
                });
            }
        },

        // Track class declarations (non-exported)
        ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
            if (path.node.id && !path.findParent((p) => t.isExportDeclaration(p.node))) {
                const loc = path.node.loc;
                result.classes.push({
                    name: path.node.id.name,
                    location: {
                        startLine: loc?.start.line ?? 0,
                        endLine: loc?.end.line ?? 0,
                    },
                });
            }
        },

        // Check for JSX usage
        JSXElement() {
            result.isReactComponent = true;
        },
    });

    return result;
}

/**
 * Parse file with additional context for summary generation
 * Extracts function signatures and JSDoc comments
 */
export function parseFileWithContext(content: string, fileType: FileType): ParsedFile {
    const result = parseFile(content, fileType);

    // Skip if not a JS/TS file
    if (!["typescript", "javascript", "react-typescript", "react-javascript"].includes(fileType)) {
        return result;
    }

    let ast;
    try {
        ast = parser.parse(content, {
            sourceType: "module",
            plugins: getParserPlugins(fileType),
            errorRecovery: true,
            attachComment: true,
        });
    } catch {
        return result;
    }

    const traverseFn = (typeof traverse === "function" ? traverse : (traverse as { default: typeof traverse }).default);

    // Second pass: extract function signatures
    traverseFn(ast, {
        FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
            if (path.node.id) {
                const name = path.node.id.name;
                const loc = path.node.loc;
                const isExported = Boolean(path.findParent((p) => t.isExportDeclaration(p.node)));
                const jsdoc = extractJSDoc(path.node);
                const signature = generateFunctionSignature(path.node, name, content);

                result.functionSignatures.push({
                    name,
                    signature,
                    jsdoc,
                    location: {
                        startLine: loc?.start.line ?? 0,
                        endLine: loc?.end.line ?? 0,
                    },
                    exported: isExported,
                });
            }
        },

        // Also capture arrow functions assigned to const
        VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
            if (
                t.isIdentifier(path.node.id) &&
                (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))
            ) {
                const name = path.node.id.name;
                const init = path.node.init;
                const loc = path.node.loc;

                // Check if exported
                const varDecl = path.findParent((p) => t.isVariableDeclaration(p.node));
                const isExported = Boolean(varDecl?.findParent((p) => t.isExportDeclaration(p.node)));

                // Get JSDoc from the variable declaration
                const jsdoc = varDecl ? extractJSDoc(varDecl.node) : undefined;
                const signature = generateFunctionSignature(init, name, content);

                result.functionSignatures.push({
                    name,
                    signature,
                    jsdoc,
                    location: {
                        startLine: loc?.start.line ?? 0,
                        endLine: loc?.end.line ?? 0,
                    },
                    exported: isExported,
                });
            }
        },
    });

    return result;
}


/**
 * Get a simple text representation of exports
 */
export function getExportNames(parsed: ParsedFile): string[] {
    return parsed.exports.map((e) => e.name);
}

/**
 * Get import sources
 */
export function getImportSources(parsed: ParsedFile): string[] {
    return parsed.imports.map((i) => i.source);
}

/**
 * Generate a function signature string from a FunctionDeclaration node
 */
export function generateFunctionSignature(
    node: t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression,
    name: string,
    content: string
): string {
    const loc = node.loc;
    if (!loc) return `function ${name}()`;

    // Get just the first line of the function (the signature)
    const lines = content.split("\n");
    const startLine = loc.start.line - 1; // 0-indexed

    if (startLine >= 0 && startLine < lines.length) {
        let signature = lines[startLine].trim();

        // If the signature spans multiple lines, try to get the full params
        if (!signature.includes(")") && startLine + 1 < lines.length) {
            // Multi-line params, just get first line + "..."
            signature = signature + " ...";
        }

        // Clean up - remove function body start
        signature = signature.replace(/\s*\{.*$/, "").trim();

        return signature;
    }

    return `function ${name}()`;
}

/**
 * Extract JSDoc comment from a node's leading comments
 */
export function extractJSDoc(node: t.Node): string | undefined {
    const comments = node.leadingComments;
    if (!comments || comments.length === 0) return undefined;

    // Look for JSDoc-style comment (starts with /*)
    for (const comment of comments) {
        if (comment.type === "CommentBlock" && comment.value.startsWith("*")) {
            // Clean up the JSDoc - remove * at start of lines
            return comment.value
                .split("\n")
                .map(line => line.replace(/^\s*\*\s?/, "").trim())
                .filter(line => line.length > 0)
                .join(" ")
                .slice(0, 200); // Limit length
        }
    }

    return undefined;
}

/**
 * Get first N lines of content
 */
export function getFirstNLines(content: string, n: number = 30): string {
    return content.split("\n").slice(0, n).join("\n");
}
