// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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

	context.subscriptions.push(disposable, readCodebase);
}

// This method is called when your extension is deactivated
export function deactivate() {}
