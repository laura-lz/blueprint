// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { createUpperLevelAPI, GeminiClient, RiskAnalysisAgent, type FileCapsule, type DirectoryCapsule, type ExportEntry, type RiskAnalysis } from './core/index.js';

let canvasPanel: vscode.WebviewPanel | undefined;

// Capsules data cache
interface CapsulesData {
	stats: {
		totalFiles: number;
		totalDirectories: number;
		totalEdges: number;
		externalDependencies: string[];
		entryPoints: string[];
		projectOverview?: string;
	};
	files: Record<string, FileCapsule>;
	directories: Record<string, DirectoryCapsule>;
}

let capsulesCache: CapsulesData | null = null;

// Background deep analysis queue manager
interface DeepAnalysisQueue {
	pending: Set<string>;           // Files waiting to be analyzed
	inProgress: Set<string>;        // Files currently being analyzed
	priorityFile: string | null;    // User-selected file to prioritize
	isRunning: boolean;
	webview: vscode.Webview | null;
}

const deepAnalysisQueue: DeepAnalysisQueue = {
	pending: new Set(),
	inProgress: new Set(),
	priorityFile: null,
	isRunning: false,
	webview: null
};

const DEEP_ANALYSIS_CONCURRENCY = 300;
const RISK_ANALYSIS_CONCURRENCY = 2;

// Background risk analysis queue manager
interface RiskAnalysisQueue {
	pending: Map<string, string[]>;  // Map of relativePath -> function names to analyze
	inProgress: Set<string>;          // Functions currently being analyzed
	isRunning: boolean;
	webview: vscode.Webview | null;
}

const riskAnalysisQueue: RiskAnalysisQueue = {
	pending: new Map(),
	inProgress: new Set(),
	isRunning: false,
	webview: null
};

// Cache for risk analysis results
const riskAnalysisCache: Map<string, Map<string, RiskAnalysis>> = new Map();

/**
 * Start or continue background deep analysis for all files
 */
async function runBackgroundDeepAnalysis() {
	if (deepAnalysisQueue.isRunning || !deepAnalysisQueue.webview) {
		return;
	}

	const config = vscode.workspace.getConfiguration('nexhacks');
	const apiKey = config.get<string>('geminiApiKey');
	const ttcApiKey = config.get<string>('ttcApiKey');

	if (!apiKey || !capsulesCache) {
		return;
	}

	deepAnalysisQueue.isRunning = true;
	console.log(`[Nexhacks] 🔬 Starting background deep analysis (${deepAnalysisQueue.pending.size} files pending)...`);

	const client = new GeminiClient({ apiKey, ttcApiKey });
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders?.length) {
		deepAnalysisQueue.isRunning = false;
		return;
	}
	const rootPath = workspaceFolders[0].uri.fsPath;

	const analyzeFile = async (relativePath: string): Promise<void> => {
		if (!capsulesCache?.files[relativePath] || !deepAnalysisQueue.webview) {
			return;
		}

		const capsule = capsulesCache.files[relativePath];

		// Skip if already analyzed
		if (capsule.structure && capsule.structure.length > 0) {
			return;
		}

		deepAnalysisQueue.inProgress.add(relativePath);

		try {
			const filePath = path.join(rootPath, relativePath);
			const fileContent = fs.readFileSync(filePath, 'utf-8');

			const analysis = await client.generateDeepAnalysis(relativePath, fileContent);

			// Update cache
			capsule.structure = analysis.structure;
			capsule.lowerLevelSummary = analysis.lowerLevelSummary;

			// Send update to webview
			deepAnalysisQueue.webview?.postMessage({
				type: 'updateFileStructure',
				data: {
					relativePath,
					structure: analysis.structure,
					lowerLevelSummary: analysis.lowerLevelSummary
				}
			});

			console.log(`[Nexhacks] ✅ Deep analysis complete: ${relativePath}`);
		} catch (error) {
			console.warn(`[Nexhacks] Failed deep analysis for ${relativePath}:`, error);
		} finally {
			deepAnalysisQueue.inProgress.delete(relativePath);
			deepAnalysisQueue.pending.delete(relativePath);
		}
	};

	// Process files in batches with priority support
	while (deepAnalysisQueue.pending.size > 0) {
		// Check if there's a priority file that needs immediate attention
		if (deepAnalysisQueue.priorityFile && deepAnalysisQueue.pending.has(deepAnalysisQueue.priorityFile)) {
			const priorityPath = deepAnalysisQueue.priorityFile;
			deepAnalysisQueue.priorityFile = null;
			console.log(`[Nexhacks] 🚀 Prioritizing: ${priorityPath}`);
			await analyzeFile(priorityPath);
			continue;
		}

		// Get batch of files to process
		const batch: string[] = [];
		for (const file of deepAnalysisQueue.pending) {
			if (batch.length >= DEEP_ANALYSIS_CONCURRENCY) break;
			if (!deepAnalysisQueue.inProgress.has(file)) {
				batch.push(file);
			}
		}

		if (batch.length === 0) break;

		// Process batch in parallel
		await Promise.all(batch.map(file => analyzeFile(file)));
	}

	deepAnalysisQueue.isRunning = false;
	console.log('[Nexhacks] 🔬 Background deep analysis complete');

	// Save updated capsules with deep analysis data
	if (capsulesCache) {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders?.length) {
			const rootPath = workspaceFolders[0].uri.fsPath;
			const outputDir = path.join(rootPath, '.nexhacks');
			const outputPath = path.join(outputDir, 'capsules.json');
			try {
				if (!fs.existsSync(outputDir)) {
					fs.mkdirSync(outputDir, { recursive: true });
				}
				fs.writeFileSync(outputPath, JSON.stringify(capsulesCache, null, 2), 'utf-8');
				console.log(`[Nexhacks] 💾 Deep analysis saved to: ${outputPath}`);
			} catch (writeError) {
				console.warn('[Nexhacks] Failed to save capsules file after deep analysis:', writeError);
			}
		}
	}

	// Start risk analysis after deep analysis
	runBackgroundRiskAnalysis();
}

/**
 * Start or continue background risk analysis for all analyzed functions
 */
async function runBackgroundRiskAnalysis() {
	if (riskAnalysisQueue.isRunning || !riskAnalysisQueue.webview) {
		return;
	}

	const config = vscode.workspace.getConfiguration('nexhacks');
	const apiKey = config.get<string>('geminiApiKey');
	const ttcApiKey = config.get<string>('ttcApiKey');

	if (!apiKey || !capsulesCache) {
		return;
	}

	riskAnalysisQueue.isRunning = true;
	console.log(`[Nexhacks] 🔍 Starting background risk analysis...`);

	const agent = new RiskAnalysisAgent({ apiKey, ttcApiKey });
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders?.length) {
		riskAnalysisQueue.isRunning = false;
		return;
	}
	const rootPath = workspaceFolders[0].uri.fsPath;

	// Collect all functions from analyzed files
	const functionsToAnalyze: { relativePath: string; block: { name: string; startLine: number; endLine: number }; lang: string }[] = [];

	for (const [relativePath, capsule] of Object.entries(capsulesCache.files)) {
		if (!capsule.structure?.length) continue;

		// Check if already analyzed
		if (riskAnalysisCache.has(relativePath)) continue;

		for (const block of capsule.structure) {
			functionsToAnalyze.push({
				relativePath,
				block: { name: block.name, startLine: block.startLine, endLine: block.endLine },
				lang: capsule.lang
			});
		}
	}

	console.log(`[Nexhacks] 🔍 Found ${functionsToAnalyze.length} functions to analyze for risks`);

	// Process in batches
	for (let i = 0; i < functionsToAnalyze.length; i += RISK_ANALYSIS_CONCURRENCY) {
		const batch = functionsToAnalyze.slice(i, i + RISK_ANALYSIS_CONCURRENCY);

		await Promise.all(batch.map(async ({ relativePath, block, lang }) => {
			const key = `${relativePath}:${block.name}`;
			if (riskAnalysisQueue.inProgress.has(key)) return;

			riskAnalysisQueue.inProgress.add(key);

			try {
				const filePath = path.join(rootPath, relativePath);
				const code = agent.extractFunctionCode(filePath, block.startLine, block.endLine);
				const analysis = await agent.analyzeFunction(code, lang as any, block.name, { filePath: relativePath });

				// Store in cache
				if (!riskAnalysisCache.has(relativePath)) {
					riskAnalysisCache.set(relativePath, new Map());
				}
				riskAnalysisCache.get(relativePath)!.set(block.name, analysis);

				// Send update to webview
				riskAnalysisQueue.webview?.postMessage({
					type: 'updateFunctionRisk',
					data: {
						relativePath,
						functionName: block.name,
						analysis
					}
				});

				console.log(`[Nexhacks] ✅ Risk analysis complete: ${relativePath}:${block.name} (${analysis.riskLevel})`);
			} catch (error) {
				console.warn(`[Nexhacks] Failed risk analysis for ${key}:`, error);
			} finally {
				riskAnalysisQueue.inProgress.delete(key);
			}
		}));
	}

	riskAnalysisQueue.isRunning = false;
	console.log('[Nexhacks] 🔍 Background risk analysis complete');
}

/**
 * Prioritize a specific file for deep analysis
 */
function prioritizeDeepAnalysis(relativePath: string) {
	// If already analyzed, no need to prioritize
	if (capsulesCache?.files[relativePath]?.structure?.length) {
		return;
	}

	deepAnalysisQueue.priorityFile = relativePath;

	// Ensure file is in the queue
	if (!deepAnalysisQueue.pending.has(relativePath)) {
		deepAnalysisQueue.pending.add(relativePath);
	}

	// Start background analysis if not running
	if (!deepAnalysisQueue.isRunning) {
		runBackgroundDeepAnalysis();
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "nexhacks" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('nexhacks.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from nexhacks!');
	});

	const readCodebase = vscode.commands.registerCommand('nexhacks.readCodebase', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showWarningMessage('No workspace folder is open.');
			return;
		}

		const include = '**/*.{ts,tsx,js,jsx,py,go,java,kt,rb,php,rs,cpp,c,cs,md,json,yaml,yml,txt}';
		const exclude = '**/{node_modules,.git,dist,out,build,coverage,.next,.turbo}/**';
		const files = await vscode.workspace.findFiles(include, exclude);

		const decoder = new TextDecoder('utf-8');
		const maxBytes = 2 * 1024 * 1024;

		const contents: { uri: vscode.Uri; text: string }[] = [];
		let skippedLarge = 0;
		let skippedUnreadable = 0;

		for (const file of files) {
			try {
				const stat = await vscode.workspace.fs.stat(file);
				if (stat.size > maxBytes) {
					skippedLarge += 1;
					continue;
				}

				const data = await vscode.workspace.fs.readFile(file);
				const text = decoder.decode(data);
				contents.push({ uri: file, text });
			} catch {
				skippedUnreadable += 1;
			}
		}

		vscode.window.showInformationMessage(
			`Read ${contents.length} files (${skippedLarge} skipped large, ${skippedUnreadable} unreadable).`
		);

		// TODO: send contents to LLM and build graph.
	});

	const openCanvas = vscode.commands.registerCommand('nexhacks.openCanvas', async () => {
		console.log('[Nexhacks] openCanvas command triggered');

		if (canvasPanel) {
			console.log('[Nexhacks] Panel exists, revealing and sending data');
			canvasPanel.reveal(vscode.ViewColumn.Two);
			sendCapsulesDataToWebview(canvasPanel.webview);
			return;
		}

		console.log('[Nexhacks] Creating new webview panel...');
		canvasPanel = vscode.window.createWebviewPanel(
			'nexhacksCanvas',
			'Nexhacks Visualizer',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))
				]
			}
		);
		console.log('[Nexhacks] Webview panel created');

		canvasPanel.onDidDispose(() => {
			console.log('[Nexhacks] Panel disposed');
			canvasPanel = undefined;
		});

		canvasPanel.webview.html = getWebviewHtml(canvasPanel.webview, context.extensionPath);
		console.log('[Nexhacks] HTML set, starting scan immediately...');

		// Start scanning immediately instead of waiting for webview message
		sendCapsulesDataToWebview(canvasPanel.webview);

		canvasPanel.webview.onDidReceiveMessage(async (message) => {
			console.log('[Nexhacks] Received message from webview:', message?.type);
			if (!canvasPanel) {
				return;
			}
			if (message?.type === 'openFile' && message.relativePath) {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (workspaceFolders && workspaceFolders.length > 0) {
					const filePath = path.join(workspaceFolders[0].uri.fsPath, message.relativePath);
					const fileUri = vscode.Uri.file(filePath);
					try {
						// Create selection range if provided
						let selection: vscode.Range | undefined;
						if (message.startLine && message.endLine) {
							// VS Code lines are 0-indexed
							selection = new vscode.Range(
								message.startLine - 1, 0,
								message.endLine - 1, 1000
							);
						} else if (message.line) {
							selection = new vscode.Range(
								message.line - 1, 0,
								message.line - 1, 1000
							);
						}

						// Open the file in the main editor column (not a new split)
						await vscode.window.showTextDocument(fileUri, {
							viewColumn: vscode.ViewColumn.One,
							preserveFocus: false,
							selection: selection
						});
					} catch (error) {
						console.error('[Nexhacks] Failed to open file:', error);
						vscode.window.showErrorMessage(`Failed to open file: ${message.relativePath}`);
					}
				}
				return;
			}
			if (message?.type === 'setApiKey') {
				const geminiKey = await vscode.window.showInputBox({
					prompt: 'Enter your Gemini API key',
					placeHolder: 'Gemini API key (starts with AIza...)',
					password: true,
					ignoreFocusOut: true
				});

				const ttcKey = await vscode.window.showInputBox({
					prompt: 'Enter your TTC API key (Optional)',
					placeHolder: 'The Token Company API key',
					password: true,
					ignoreFocusOut: true
				});

				if (geminiKey !== undefined) {
					const config = vscode.workspace.getConfiguration('nexhacks');
					await config.update('geminiApiKey', geminiKey, vscode.ConfigurationTarget.Global);
				}

				if (ttcKey !== undefined) {
					const config = vscode.workspace.getConfiguration('nexhacks');
					await config.update('ttcApiKey', ttcKey, vscode.ConfigurationTarget.Global);
				}

				if (geminiKey || ttcKey) {
					vscode.window.showInformationMessage('API keys saved. Reloading...');
					// Trigger a cache clear/reload
					capsulesCache = null;
					sendCapsulesDataToWebview(canvasPanel.webview);
				}
				return;
			}
			if (message?.type === 'ready' || message?.type === 'requestCapsules') {
				console.log('[Nexhacks] Webview requested capsules, sending...');
				sendCapsulesDataToWebview(canvasPanel.webview);
			}
			if (message?.type === 'refresh') {
				console.log('[Nexhacks] Refresh requested, clearing cache...');
				// Force re-scan on refresh
				capsulesCache = null;
				sendCapsulesDataToWebview(canvasPanel.webview);
			}
			if (message?.type === 'analyzeFile' && message.relativePath) {
				const relativePath = message.relativePath;
				console.log(`[Nexhacks] Deep analysis requested for ${relativePath}`);

				if (!capsulesCache?.files[relativePath]) {
					console.error('[Nexhacks] File not found in cache:', relativePath);
					return;
				}

				const capsule = capsulesCache.files[relativePath];

				// Check if already analyzed - send cached data
				if (capsule.structure && capsule.structure.length > 0) {
					console.log('[Nexhacks] Structure already exists, resending...');
					canvasPanel.webview.postMessage({
						type: 'updateFileStructure',
						data: {
							relativePath,
							structure: capsule.structure,
							lowerLevelSummary: capsule.lowerLevelSummary
						}
					});
					return;
				}

				// Use priority queue - prioritize this file over background analysis
				console.log(`[Nexhacks] 🚀 Prioritizing deep analysis for ${relativePath}`);
				prioritizeDeepAnalysis(relativePath);
			}
		});
	});

	// Monitor active editor changes to highlight nodes in the graph
	const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor && canvasPanel && canvasPanel.visible) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) return;

			const rootPath = workspaceFolders[0].uri.fsPath;
			const fileName = editor.document.fileName;

			// Handle potentially different path separators or case sensitivity
			if (fileName.toLowerCase().startsWith(rootPath.toLowerCase())) {
				let relativePath = path.relative(rootPath, fileName);
				// Ensure forward slashes for consistency with graph IDs
				relativePath = relativePath.split(path.sep).join('/');

				console.log(`[Nexhacks] Editor changed: ${relativePath}`);
				canvasPanel.webview.postMessage({
					type: 'highlightFile',
					data: { relativePath }
				});
			}
		}
	});

	context.subscriptions.push(disposable, readCodebase, openCanvas, activeEditorListener);
}

// This method is called when your extension is deactivated
export function deactivate() { }

/** Concurrency limits for API calls */
const FILE_SUMMARY_CONCURRENCY = 300;
const DIRECTORY_SUMMARY_CONCURRENCY = 300;

/**
 * Process items in parallel with a concurrency limit
 * Uses a simple batching approach for reliable concurrent execution
 */
async function processInParallelWithLimit<T>(
	items: T[],
	fn: (item: T) => Promise<void>,
	concurrencyLimit: number
): Promise<void> {
	// Process in batches
	for (let i = 0; i < items.length; i += concurrencyLimit) {
		const batch = items.slice(i, i + concurrencyLimit);
		await Promise.all(batch.map(item => fn(item)));
	}
}

/**
 * Scan workspace and send capsules data to webview
 */
async function sendCapsulesDataToWebview(webview: vscode.Webview) {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		webview.postMessage({
			type: 'error',
			message: 'No workspace folder is open.'
		});
		return;
	}

	// Send loading state
	webview.postMessage({ type: 'loading' });

	try {
		// Use cache if available
		if (!capsulesCache) {
			const rootPath = workspaceFolders[0].uri.fsPath;
			console.log(`[Nexhacks] Starting workspace scan: ${rootPath}`);
			const startTime = Date.now();

			console.log('[Nexhacks] Creating upper level API...');
			const api = await createUpperLevelAPI(rootPath);
			console.log(`[Nexhacks] API created in ${Date.now() - startTime}ms`);

			const stats = api.getStats();
			console.log(`[Nexhacks] Stats: ${stats.totalFiles} files, ${stats.totalDirectories} directories, ${stats.totalEdges} edges`);

			const allFiles = api.getAllFiles();
			console.log(`[Nexhacks] Processing ${allFiles.length} files...`);

			// Build files map
			const files: Record<string, FileCapsule> = {};
			let processed = 0;
			for (const filePath of allFiles) {
				const capsule = api.getFileCapsule(filePath);
				if (capsule) {
					files[capsule.relativePath] = capsule;
				}
				processed++;
				if (processed % 50 === 0) {
					console.log(`[Nexhacks] Processed ${processed}/${allFiles.length} files...`);
				}
			}

			// Build directories map
			const directories: Record<string, DirectoryCapsule> = {};
			// We need to access the internal directories map from api's graph exposed implicitly or rebuild it
			// Since IUpperLevelAPI doesn't expose directories directly, we rebuild it from files
			for (const file of Object.values(files)) {
				const dirPath = path.dirname(file.path);
				const dirRelativePath = path.dirname(file.relativePath);

				if (!directories[dirRelativePath]) {
					directories[dirRelativePath] = {
						path: dirPath,
						relativePath: dirRelativePath,
						name: path.basename(dirPath),
						files: [],
						subdirectories: [],
						metadata: { fileCount: 0, subdirCount: 0 }
					};
				}

				directories[dirRelativePath].files.push(file.relativePath);
				directories[dirRelativePath].metadata!.fileCount++;
			}

			// Link subdirectories
			const dirKeys = Object.keys(directories).sort();
			for (const dirRel of dirKeys) {
				if (dirRel === '.') continue;
				const parentDir = path.dirname(dirRel);
				if (directories[parentDir]) {
					directories[parentDir].subdirectories.push(dirRel);
					directories[parentDir].metadata!.subdirCount++;
				}
			}

			// Ensure root directory exists if not already
			if (!directories['.']) {
				directories['.'] = {
					path: rootPath,
					relativePath: '.',
					name: path.basename(rootPath),
					files: [],
					subdirectories: dirKeys.filter(d => path.dirname(d) === '.' && d !== '.'),
					metadata: { fileCount: 0, subdirCount: 0 }
				};
				directories['.'].metadata!.subdirCount = directories['.'].subdirectories.length;
			}

			capsulesCache = { stats, files, directories };
			console.log(`[Nexhacks] Scan complete in ${Date.now() - startTime}ms. Total files: ${Object.keys(files).length}`);

			// PHASE 1: Send initial capsules immediately (without AI summaries)
			webview.postMessage({
				type: 'setCapsules',
				data: capsulesCache
			});
			console.log('[Nexhacks] Sent initial capsules to webview');

			// PHASE 2: Generate AI summaries in background if API key is configured
			const config = vscode.workspace.getConfiguration('nexhacks');
			const apiKey = config.get<string>('geminiApiKey');

			const ttcApiKey = config.get<string>('ttcApiKey');

			if (apiKey && apiKey.length > 0) {
				console.log('[Nexhacks] 🤖 Generating AI summaries using Gemini...');
				if (ttcApiKey) {
					console.log('[Nexhacks] 🐻 TTC Compression enabled');
				}

				const client = new GeminiClient({ apiKey, ttcApiKey });

				let summarized = 0;

				// Generate AI summaries in background and stream updates (Fully Parallelized)
				// User requested "all of the call async".
				const fileEntries = Object.entries(files);
				let processedCount = 0;

				const processFile = async ([relativePath, capsule]: [string, FileCapsule]) => {
					// Skip if summary already exists or non-code
					if (capsule.upperLevelSummary ||
						!capsule.metadata) {
						return;
					}

					try {
						const summary = await client.generateCapsuleSummary(
							relativePath,
							{
								fileDocstring: capsule.metadata.fileDocstring,
								functionSignatures: capsule.metadata.functionSignatures,
								firstNLines: capsule.metadata.firstNLines,
								usedBy: capsule.metadata.usedBy,
								dependsOn: capsule.metadata.dependsOn,
								exports: capsule.exports.map((e: ExportEntry) => e.name),
							}
						);

						capsule.upperLevelSummary = summary;
						processedCount++;
						summarized++;

						// Send incremental update to webview
						webview.postMessage({
							type: 'updateFileSummary',
							data: { relativePath, summary }
						});
					} catch (error) {
						console.warn(`[Nexhacks] Failed to summarize ${relativePath}:`, error);
					}
				};

				// Process file summaries with concurrency limit
				console.log(`[Nexhacks] Processing ${fileEntries.length} files with concurrency limit of ${FILE_SUMMARY_CONCURRENCY}...`);
				await processInParallelWithLimit(fileEntries, processFile, FILE_SUMMARY_CONCURRENCY);

				console.log(`[Nexhacks] ✅ Generated ${summarized} AI summaries`);

				// Build Directory Summaries with concurrency limit
				console.log('[Nexhacks] 📂 Generating Directory summaries...');

				const processDirectory = async ([dirRelPath, dirCapsule]: [string, DirectoryCapsule]) => {
					// Prepare simple file list for context
					const fileContexts = dirCapsule.files.map(fPath => ({
						name: path.basename(fPath),
						summary: files[fPath]?.upperLevelSummary || "No summary"
					}));

					try {
						const summary = await client.generateDirectorySummary(
							dirRelPath,
							fileContexts,
							dirCapsule.subdirectories
						);
						dirCapsule.upperLevelSummary = summary;

						// Send update for directory
						webview.postMessage({
							type: 'updateDirectorySummary',
							data: { relativePath: dirRelPath, summary }
						});
					} catch (error) {
						console.warn(`[Nexhacks] Failed to summarize directory ${dirRelPath}`);
					}
				};

				// Process directory summaries with concurrency limit
				const dirEntries = Object.entries(directories);
				console.log(`[Nexhacks] Processing ${dirEntries.length} directories with concurrency limit of ${DIRECTORY_SUMMARY_CONCURRENCY}...`);
				await processInParallelWithLimit(dirEntries, processDirectory, DIRECTORY_SUMMARY_CONCURRENCY);

				// Update cache with summaries
				capsulesCache = { stats, files, directories };

				// PHASE 3: Start background deep analysis for all code files
				console.log('[Nexhacks] 🔬 Queuing files for background deep analysis...');
				deepAnalysisQueue.webview = webview;
				deepAnalysisQueue.pending.clear();
				riskAnalysisQueue.webview = webview;

				// Queue all code files for deep analysis
				for (const [relativePath, capsule] of Object.entries(files)) {
					// Skip non-code files and already analyzed files
					if (['json', 'css', 'markdown', 'yaml', 'txt'].includes(capsule.lang)) {
						continue;
					}
					if (capsule.structure && capsule.structure.length > 0) {
						continue;
					}
					deepAnalysisQueue.pending.add(relativePath);
				}

				console.log(`[Nexhacks] 🔬 Queued ${deepAnalysisQueue.pending.size} files for deep analysis`);

				// Start background processing (non-blocking)
				runBackgroundDeepAnalysis();
				// Generate Global Project Overview
				console.log('[Nexhacks] 🌍 Generating Project Architecture Overview...');
				const fileSummaries = Object.values(files)
					.filter(f => f.upperLevelSummary && f.upperLevelSummary.length > 0)
					.map(f => ({
						path: f.relativePath,
						summary: f.upperLevelSummary!,
						exports: f.exports.map(e => e.name),
						imports: f.imports.map(i => i.pathOrModule)
					}));

				if (fileSummaries.length > 0) {
					try {
						const overview = await client.generateArchitectureOverview(fileSummaries);
						if (capsulesCache) {
							capsulesCache.stats.projectOverview = overview;

							// Send updated stats/capsules to webview
							webview.postMessage({
								type: 'setCapsules',
								data: capsulesCache
							});
						}
						console.log('[Nexhacks] ✅ Generated Project Overview');
					} catch (error) {
						console.warn('[Nexhacks] Failed to generate project overview:', error);
					}
				}
			} else {
				console.log('[Nexhacks] No API key configured, skipping AI summaries');
			}

			// Save capsules to file in workspace
			const outputDir = path.join(rootPath, '.nexhacks');
			const outputPath = path.join(outputDir, 'capsules.json');
			try {
				if (!fs.existsSync(outputDir)) {
					fs.mkdirSync(outputDir, { recursive: true });
				}
				fs.writeFileSync(outputPath, JSON.stringify(capsulesCache, null, 2), 'utf-8');
				console.log(`[Nexhacks] Capsules saved to: ${outputPath}`);
			} catch (writeError) {
				console.warn('[Nexhacks] Failed to save capsules file:', writeError);
			}
		} else {
			console.log('[Nexhacks] Using cached capsules data');
			webview.postMessage({
				type: 'setCapsules',
				data: capsulesCache
			});
		}


	} catch (error) {
		console.error('Failed to scan workspace:', error);
		webview.postMessage({
			type: 'error',
			message: error instanceof Error ? error.message : 'Failed to scan workspace'
		});
	}
}

function getWebviewHtml(webview: vscode.Webview, extensionPath: string) {
	const webviewPath = path.join(extensionPath, 'out', 'webview');
	const htmlPath = path.join(webviewPath, 'index.html');

	// Check if React build exists
	if (!fs.existsSync(htmlPath)) {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Nexhacks Visualizer</title>
	<style>
	body {
		margin: 0;
		padding: 40px;
		background: #121212;
		color: #fff;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}
	h1 { color: #007acc; }
	code { background: #333; padding: 2px 6px; border-radius: 4px; }
	pre { background: #1a1a1a; padding: 16px; border-radius: 8px; overflow-x: auto; }
	</style>
</head>
<body>
	<h1>Build Required</h1>
	<p>The webview UI has not been built yet. Please run:</p>
	<pre><code>cd webview-ui && pnpm install && pnpm build</code></pre>
	<p>Then reload this window.</p>
</body>
</html>`;
	}

	let html = fs.readFileSync(htmlPath, 'utf-8');

	// Convert local paths to webview URIs
	const assetsUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, 'assets')));

	// Replace relative paths with webview URIs
	html = html.replace(/href="\.\/assets\//g, `href="${assetsUri}/`);
	html = html.replace(/src="\.\/assets\//g, `src="${assetsUri}/`);

	// Remove the dev script tag (vite dev server) and replace with built assets
	html = html.replace(/<script type="module" src="\/src\/main\.tsx"><\/script>/, '');

	// Find and inject the built JS files
	const assetsDir = path.join(webviewPath, 'assets');
	if (fs.existsSync(assetsDir)) {
		const files = fs.readdirSync(assetsDir);
		const jsFile = files.find(f => f.endsWith('.js'));
		const cssFile = files.find(f => f.endsWith('.css'));

		if (cssFile) {
			html = html.replace('</head>', `<link rel="stylesheet" href="${assetsUri}/${cssFile}">\n</head>`);
		}
		if (jsFile) {
			html = html.replace('</body>', `<script type="module" src="${assetsUri}/${jsFile}"></script>\n</body>`);
		}
	}

	return html;
}
