import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics';
import { LaravelDetector } from './detectors/laravel';
import { SpringBootDetector } from './detectors/springboot';
import { Detector } from './detectors/index';
import { EnvVarTreeProvider } from './treeview';
import { NodeDetector } from './detectors/node';
import { SymfonyDetector } from './detectors/symfony';

// All registered detectors. Add new frameworks here.
const DETECTORS: Detector[] = [
  new LaravelDetector(),
  new SpringBootDetector(),
  new NodeDetector(),
  new SymfonyDetector(),
];

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new EnvVarTreeProvider();

  const treeView = vscode.window.createTreeView('envwatch.panel', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const collection = vscode.languages.createDiagnosticCollection('missing-env-vars');
  const provider = new DiagnosticsProvider(collection, (result) => {
    treeProvider.update(result);
  });

  context.subscriptions.push(collection, treeView);

  const runScan = async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    treeProvider.setLoading();
    await Promise.all(folders.map((f) => provider.scan(f.uri, DETECTORS)));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('envwatch.scan', runScan),

    vscode.commands.registerCommand(
      'envwatch.openFile',
      (uri: vscode.Uri, range: vscode.Range) => {
        vscode.window.showTextDocument(uri, { selection: range, preserveFocus: false });
      }
    )
  );

  // Re-scan when env/config files change
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/{.env,.env.*,application*.properties,application*.yml,application*.yaml}'
  );
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(runScan),
    watcher.onDidCreate(runScan),
    watcher.onDidDelete(runScan)
  );

  // Re-scan when source files are saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const relevant = ['.php', '.java', '.kt', '.properties', '.yml', '.yaml'];
      if (relevant.some((ext) => doc.fileName.endsWith(ext))) {
        runScan();
      }
    })
  );

  runScan();
}

export function deactivate(): void {}
