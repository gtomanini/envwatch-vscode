import * as vscode from 'vscode';
import { Detector, DefinedVars, EnvVarReference, MAX_FILE_BYTES } from './index';

/**
 * Detects env var usage in Symfony projects.
 *
 * Patterns covered in PHP:
 *   $_ENV['VAR']          $_SERVER['VAR']
 *   getenv('VAR')
 *
 * Patterns covered in YAML config (services.yaml, etc.):
 *   %env(VAR)%
 *   %env(int:VAR)%        (typed env vars with processors)
 *
 * Patterns covered in .env files (Symfony uses symfony/dotenv):
 *   VAR=value
 *
 * Defined vars read from:
 *   .env  .env.local  .env.{APP_ENV}  .env.{APP_ENV}.local
 */

const PHP_PATTERNS: RegExp[] = [
  /\$_ENV\[\s*['"]([A-Z0-9_]+)['"]\s*\]/g,
  /\$_SERVER\[\s*['"]([A-Z0-9_]+)['"]\s*\]/g,
  /\bgetenv\(\s*['"]([A-Z0-9_]+)['"]/g,
];

// %env(PROCESSOR:VAR)% — capture the last segment (the actual var name)
const YAML_PATTERN = /%env\((?:[a-z_]+:)*([A-Z0-9_]+)\)%/g;

export class SymfonyDetector implements Detector {
  readonly name = 'Symfony';

  async detect(workspaceRoot: vscode.Uri): Promise<boolean> {
    // Symfony projects have a symfony.lock or a bin/console
    const indicators = ['symfony.lock', 'bin/console'];
    for (const file of indicators) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceRoot, file));
        return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  async findReferences(workspaceRoot: vscode.Uri): Promise<EnvVarReference[]> {
    const excludes = getExcludeGlob();
    const [phpFiles, yamlFiles] = await Promise.all([
      vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '**/*.php'),
        excludes
      ),
      vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '**/*.{yaml,yml}'),
        excludes
      ),
    ]);

    const refs: EnvVarReference[] = [];

    for (const file of phpFiles) {
      refs.push(...(await scanFile(file, PHP_PATTERNS)));
    }
    for (const file of yamlFiles) {
      refs.push(...(await scanFile(file, [YAML_PATTERN])));
    }
    return refs;
  }

  async findDefined(workspaceRoot: vscode.Uri): Promise<DefinedVars> {
    const inProjectFiles = new Set<string>();

    // Symfony loads .env, then .env.local, then .env.{APP_ENV}, then .env.{APP_ENV}.local
    const envFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceRoot, '.env{,.local,.dev,.prod,.test,.dev.local,.prod.local,.test.local}'),
      getExcludeGlob()
    );
    for (const file of envFiles) {
      await readDotEnvFile(file, inProjectFiles);
    }

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
