import * as vscode from 'vscode';
import { Detector, EnvVarReference } from './detectors/index';
import { ScanResult } from './treeview';

export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private onScanComplete?: (result: ScanResult) => void;

  constructor(collection: vscode.DiagnosticCollection, onScanComplete?: (result: ScanResult) => void) {
    this.collection = collection;
    this.onScanComplete = onScanComplete;
  }

  async scan(workspaceRoot: vscode.Uri, detectors: Detector[]): Promise<void> {
    this.collection.clear();

    const activeDetectors: Detector[] = [];
    for (const d of detectors) {
      if (await d.detect(workspaceRoot)) {
        activeDetectors.push(d);
      }
    }

    if (activeDetectors.length === 0) {
      this.onScanComplete?.({ missing: [], defined: [] });
      return;
    }

    const severity = getSeverity();

    const results = await Promise.all(
      activeDetectors.map(async (d) => ({
        refs: await d.findReferences(workspaceRoot),
        defined: await d.findDefined(workspaceRoot),
      }))
    );

    const diagMap = new Map<string, vscode.Diagnostic[]>();
    const missingRefs: EnvVarReference[] = [];

    // forSuppression (includes OS vars) used to decide whether to emit a warning
    const allForSuppression = new Set<string>();
    // inProjectFiles used for the sidebar panel — OS vars excluded
    const allInProjectFiles = new Set<string>();

    for (const { defined } of results) {
      for (const name of defined.forSuppression) allForSuppression.add(name);
      for (const name of defined.inProjectFiles) allInProjectFiles.add(name);
    }

    for (const { refs } of results) {
      for (const ref of refs) {
        if (allForSuppression.has(ref.name)) continue;

        missingRefs.push(ref);

        const diag = new vscode.Diagnostic(
          ref.range,
          `Environment variable "${ref.name}" is not defined`,
          severity
        );
        diag.source = 'envwatch';
        diag.code = ref.name;

        const key = ref.uri.toString();
        const list = diagMap.get(key) ?? [];
        list.push(diag);
        diagMap.set(key, list);
      }
    }

    for (const [uriStr, diags] of diagMap) {
      this.collection.set(vscode.Uri.parse(uriStr), dedup(diags));
    }

    // Panel shows only vars defined in project files that are actually referenced in code
    const allRefs = results.flatMap((r) => r.refs);
    const referencedDefined = [...new Set(
      allRefs.filter((r) => allInProjectFiles.has(r.name)).map((r) => r.name)
    )].sort();

    this.onScanComplete?.({ missing: missingRefs, defined: referencedDefined });
  }

  dispose(): void {
    this.collection.dispose();
  }
}

function dedup(diags: vscode.Diagnostic[]): vscode.Diagnostic[] {
  const seen = new Set<string>();
  return diags.filter((d) => {
    const key = `${d.range.start.line}:${d.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSeverity(): vscode.DiagnosticSeverity {
  const level: string =
    vscode.workspace.getConfiguration('envwatch').get('severity') ?? 'warning';
  switch (level) {
    case 'error': return vscode.DiagnosticSeverity.Error;
    case 'information': return vscode.DiagnosticSeverity.Information;
    default: return vscode.DiagnosticSeverity.Warning;
  }
}
