import * as vscode from 'vscode';
import { Detector, DefinedVars, EnvVarReference, MAX_FILE_BYTES } from './index';

/**
 * Detects env var usage in Node.js projects.
 *
 * Patterns covered in .js/.ts/.mjs/.cjs:
 *   process.env.VAR_NAME
 *   process.env['VAR_NAME']   process.env["VAR_NAME"]
 *
 * Defined vars read from:
 *   .env  .env.local  .env.development  .env.production  (dotenv convention)
 */
const PATTERNS: RegExp[] = [
  /\bprocess\.env\.([A-Z_][A-Z0-9_]*)\b/g,
  /\bprocess\.env\[\s*['"]([A-Z_][A-Z0-9_]+)['"]\s*\]/g,
];

export class NodeDetector implements Detector {
  readonly name = 'Node.js';

  async detect(workspaceRoot: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceRoot, 'package.json'));
      return true;
    } catch {
      return false;
    }
  }

  async findReferences(workspaceRoot: vscode.Uri): Promise<EnvVarReference[]> {
    const excludes = getExcludeGlob();
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceRoot, '**/*.{js,ts,mjs,cjs,jsx,tsx}'),
      excludes
    );

    const refs: EnvVarReference[] = [];
    for (const file of files) {
      refs.push(...(await scanFile(file, PATTERNS)));
    }
    return refs;
  }

  async findDefined(workspaceRoot: vscode.Uri): Promise<DefinedVars> {
    const inProjectFiles = new Set<string>();

    const envFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceRoot, '.env{,.local,.development,.production,.test}'),
      getExcludeGlob()
    );
    for (const file of envFiles) {
      await readDotEnvFile(file, inProjectFiles);
    }

    // OS vars suppress warnings (CI/system injection) but are NOT shown in the panel
    const forSuppression = new Set<string>(inProjectFiles);
    for (const key of Object.keys(process.env)) {
      forSuppression.add(key);
    }

    return { forSuppression, inProjectFiles };
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
    // .env may not exist
  }
}

function getExcludeGlob(): string {
  const config = vscode.workspace.getConfiguration('envwatch');
  const patterns: string[] = config.get('exclude') ?? [];
  return `{${patterns.join(',')}}`;
}
