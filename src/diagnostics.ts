import * as vscode from 'vscode';
import { DefinedVars, Detector, EnvVarReference } from './detectors/index';
import { ScanResult } from './treeview';

export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private onScanComplete?: (result: ScanResult) => void;

  constructor(collection: vscode.DiagnosticCollection, onScanComplete?: (result: ScanResult) => void) {
    this.collection = collection;
    this.onScanComplete = onScanComplete;
  }

  private scanGeneration = 0;

  /**
   * Scans every workspace folder and replaces all diagnostics in one go.
   * Scanning all roots together keeps multi-root workspaces from clearing each
   * other's results; the generation counter drops results from a scan that was
   * superseded by a newer one while it was still running.
   */
  async scan(workspaceRoots: readonly vscode.Uri[], detectors: Detector[]): Promise<void> {
    const generation = ++this.scanGeneration;

    const perRoot = await Promise.all(
      workspaceRoots.map((root) => scanRoot(root, detectors))
    );
    if (generation !== this.scanGeneration) return;

    const results = perRoot.flat();
    const severity = getSeverity();

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

    this.collection.clear();
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

interface DetectorResult {
  refs: EnvVarReference[];
  defined: DefinedVars;
}

async function scanRoot(root: vscode.Uri, detectors: Detector[]): Promise<DetectorResult[]> {
  const active: Detector[] = [];
  for (const d of detectors) {
    if (await d.detect(root)) active.push(d);
  }
  return Promise.all(
    active.map(async (d) => ({
      refs: await d.findReferences(root),
      defined: await d.findDefined(root),
    }))
  );
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
