// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createUpperLevelAPI, OpenRouterClient, type FileCapsule, type ExportEntry } from './core/index.js';

let canvasPanel: vscode.WebviewPanel | undefined;

// Capsules data cache
interface CapsulesData {
	stats: {
		totalFiles: number;
		totalDirectories: number;
		totalEdges: number;
		externalDependencies: string[];
		entryPoints: string[];
	};
	files: Record<string, FileCapsule>;
}

let capsulesCache: CapsulesData | null = null;

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
			canvasPanel.reveal(vscode.ViewColumn.Active);
			sendCapsulesDataToWebview(canvasPanel.webview);
			return;
		}

		console.log('[Nexhacks] Creating new webview panel...');
		canvasPanel = vscode.window.createWebviewPanel(
			'nexhacksCanvas',
			'Nexhacks Visualizer',
			vscode.ViewColumn.Active,
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
						// Open the file in the main editor column (not a new split)
						await vscode.window.showTextDocument(fileUri, {
							viewColumn: vscode.ViewColumn.One,
							preserveFocus: false
						});
					} catch (error) {
						console.error('[Nexhacks] Failed to open file:', error);
						vscode.window.showErrorMessage(`Failed to open file: ${message.relativePath}`);
					}
				}
				return;
			}
			if (message?.type === 'setApiKey') {
				const value = await vscode.window.showInputBox({
					prompt: 'Enter your LLM API key (OpenRouter or OpenAI)',
					placeHolder: 'sk-... or your OpenRouter key',
					password: true,
					ignoreFocusOut: true
				});
				if (value) {
					const config = vscode.workspace.getConfiguration('nexhacks');
					await config.update('llmApiKey', value, vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage('API key saved. Configure provider in Settings (nexhacks.llmProvider).');
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
		});
	});

	context.subscriptions.push(disposable, readCodebase, openCanvas);
}

// This method is called when your extension is deactivated
export function deactivate() { }

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

			capsulesCache = { stats, files };
			console.log(`[Nexhacks] Scan complete in ${Date.now() - startTime}ms. Total files: ${Object.keys(files).length}`);

			// PHASE 1: Send initial capsules immediately (without AI summaries)
			webview.postMessage({
				type: 'setCapsules',
				data: capsulesCache
			});
			console.log('[Nexhacks] Sent initial capsules to webview');

			// PHASE 2: Generate AI summaries in background if API key is configured
			const config = vscode.workspace.getConfiguration('nexhacks');
			const provider = config.get<string>('llmProvider') || 'openrouter';
			const apiKey = config.get<string>('llmApiKey');
			const model = config.get<string>('llmModel') || 'google/gemini-2.0-flash-001';

			if (apiKey && apiKey.length > 0) {
				console.log(`[Nexhacks] 🤖 Generating AI summaries using ${provider}...`);

				// Configure base URL based on provider
				const baseUrl = provider === 'openai'
					? 'https://api.openai.com/v1'
					: 'https://openrouter.ai/api/v1';

				const client = new OpenRouterClient({ apiKey, baseUrl, model });

				let summarized = 0;

				// Generate AI summaries in background and stream updates
				for (const [relativePath, capsule] of Object.entries(files)) {
					// Skip if summary already exists (e.g. from partial run) or non-code
					if (capsule.summary ||
						!capsule.summaryContext ||
						['json', 'css', 'markdown', 'yaml'].includes(capsule.lang)) {
						continue;
					}

					try {
						const summary = await client.generateCapsuleSummary(
							relativePath,
							{
								fileDocstring: capsule.summaryContext.fileDocstring,
								functionSignatures: capsule.summaryContext.functionSignatures,
								firstNLines: capsule.summaryContext.firstNLines,
								usedBy: capsule.summaryContext.usedBy,
								dependsOn: capsule.summaryContext.dependsOn,
								exports: capsule.exports.map((e: ExportEntry) => e.name),
							}
						);

						capsule.summary = summary;
						summarized++;

						// Send incremental update to webview
						webview.postMessage({
							type: 'updateFileSummary',
							data: { relativePath, summary }
						});

						if (summarized % 5 === 0) {
							console.log(`[Nexhacks] Summarized ${summarized} files...`);
						}
					} catch (error) {
						console.warn(`[Nexhacks] Failed to summarize ${relativePath}:`, error);
					}
				}

				console.log(`[Nexhacks] ✅ Generated ${summarized} AI summaries`);

				// Update cache with summaries
				capsulesCache = { stats, files };
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
