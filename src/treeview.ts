import * as vscode from 'vscode';
import { EnvVarReference } from './detectors/index';

type NodeKind = 'group' | 'missing' | 'defined';

export class EnvVarNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    public readonly ref?: EnvVarReference,
    collapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);

    if (kind === 'group') {
      this.contextValue = 'group';
    } else if (kind === 'missing') {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
      this.contextValue = 'missing';
      if (ref) {
        this.description = vscode.workspace.asRelativePath(ref.uri);
        this.command = {
          command: 'envwatch.openFile',
          title: 'Open File',
          arguments: [ref.uri, ref.range],
        };
        this.tooltip = `${label} — not defined`;
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      this.contextValue = 'defined';
      this.tooltip = `${label} — defined`;
    }
  }
}

export interface ScanResult {
  missing: EnvVarReference[];
  defined: string[];
}

export class EnvVarTreeProvider implements vscode.TreeDataProvider<EnvVarNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private result: ScanResult = { missing: [], defined: [] };
  private loading = false;

  update(result: ScanResult): void {
    this.result = result;
    this.loading = false;
    this._onDidChangeTreeData.fire();
  }

  setLoading(): void {
    this.loading = true;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: EnvVarNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EnvVarNode): EnvVarNode[] {
    if (this.loading) {
      return [new EnvVarNode('group', 'Scanning…')];
    }

    if (!element) {
      return [
        new EnvVarNode(
          'group',
          `Missing (${this.result.missing.length})`,
          undefined,
          this.result.missing.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
        ),
        new EnvVarNode(
          'group',
          `Defined (${this.result.defined.length})`,
          undefined,
          vscode.TreeItemCollapsibleState.Collapsed
        ),
      ];
    }

    if (element.label?.toString().startsWith('Missing')) {
      // Deduplicate by var name — show each missing var once, pointing to first occurrence
      const seen = new Map<string, EnvVarReference>();
      for (const ref of this.result.missing) {
        if (!seen.has(ref.name)) seen.set(ref.name, ref);
      }
      return [...seen.entries()].map(
        ([name, ref]) => new EnvVarNode('missing', name, ref)
      );
    }

    if (element.label?.toString().startsWith('Defined')) {
      return this.result.defined.map((name) => new EnvVarNode('defined', name));
    }

    return [];
  }
}
