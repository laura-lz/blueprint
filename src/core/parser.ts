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

export interface ParsedFile {
    imports: ImportInfo[];
    exports: ExportInfo[];
    isReactComponent: boolean;
    functions: SymbolInfo[];
    classes: SymbolInfo[];
    constants: SymbolInfo[];
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
        });
    } catch (error) {
        console.warn("Failed to parse file:", error);
        return result;
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
