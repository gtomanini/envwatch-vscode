import * as vscode from 'vscode';
import * as path from 'path';
import { Detector, DefinedVars, EnvVarReference, MAX_FILE_BYTES } from './index';

/**
 * Detects env var usage in Laravel projects.
 *
 * Patterns covered:
 *   env('VAR')         env("VAR")
 *   env('VAR', default)
 *   $_ENV['VAR']       $_SERVER['VAR']
 *   getenv('VAR')
 */
const PATTERNS: RegExp[] = [
  /\benv\(\s*['"]([A-Z0-9_]+)['"]/g,
  /\$_ENV\[\s*['"]([A-Z0-9_]+)['"]\s*\]/g,
  /\$_SERVER\[\s*['"]([A-Z0-9_]+)['"]\s*\]/g,
  /\bgetenv\(\s*['"]([A-Z0-9_]+)['"]/g,
];

export class LaravelDetector implements Detector {
  readonly name = 'Laravel';

  async detect(workspaceRoot: vscode.Uri): Promise<boolean> {
    const artisan = vscode.Uri.joinPath(workspaceRoot, 'artisan');
    try {
      await vscode.workspace.fs.stat(artisan);
      return true;
    } catch {
      return false;
    }
  }

  async findReferences(workspaceRoot: vscode.Uri): Promise<EnvVarReference[]> {
    const excludes = getExcludeGlob();
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceRoot, '**/*.php'),
      excludes
    );

    const refs: EnvVarReference[] = [];
    for (const file of files) {
      const matches = await scanFile(file, PATTERNS);
      refs.push(...matches);
    }
    return refs;
  }

  async findDefined(workspaceRoot: vscode.Uri): Promise<DefinedVars> {
    const inProjectFiles = new Set<string>();
    const envFile = vscode.Uri.joinPath(workspaceRoot, '.env');
    await readDotEnvFile(envFile, inProjectFiles);
    return { forSuppression: inProjectFiles, inProjectFiles };
  }
}

async function scanFile(uri: vscode.Uri, patterns: RegExp[]): Promise<EnvVarReference[]> {
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > MAX_FILE_BYTES) return [];
    content = Buffer.from(bytes).toString('utf8');
  } catch {
    return [];
  }

  const refs: EnvVarReference[] = [];
  const lines = content.split('\n');

  for (const pattern of patterns) {
    // Reset lastIndex since patterns are reused across files
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const varName = match[1];
      const offset = match.index + match[0].indexOf(varName);
      const pos = offsetToPosition(lines, offset);
      refs.push({
        name: varName,
        uri,
        range: new vscode.Range(pos, pos.translate(0, varName.length)),
      });
    }
  }
  return refs;
}

function offsetToPosition(lines: string[], offset: number): vscode.Position {
  let remaining = offset;
  for (let i = 0; i < lines.length; i++) {
    // +1 for the newline character
    const lineLen = lines[i].length + 1;
    if (remaining < lineLen) {
      return new vscode.Position(i, remaining);
    }
    remaining -= lineLen;
  }
  return new vscode.Position(lines.length - 1, 0);
}

async function readDotEnvFile(uri: vscode.Uri, out: Set<string>): Promise<void> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(bytes).toString('utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        out.add(trimmed.slice(0, eqIdx).trim());
      }
    }
  } catch {
    // .env may not exist — that's fine, defined set stays empty
  }
}

function getExcludeGlob(): string {
  const config = vscode.workspace.getConfiguration('envwatch');
  const patterns: string[] = config.get('exclude') ?? [];
  return `{${patterns.join(',')}}`;
}
