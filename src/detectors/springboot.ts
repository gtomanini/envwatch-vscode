import * as vscode from 'vscode';
import { Detector, DefinedVars, EnvVarReference, MAX_FILE_BYTES } from './index';

/**
 * Detects env var usage in Spring Boot projects.
 *
 * Patterns covered in Java/Kotlin:
 *   @Value("${VAR_NAME}")
 *   @Value("${VAR_NAME:default}")
 *   System.getenv("VAR_NAME")
 *   Environment.getProperty("VAR_NAME")           (Spring Environment)
 *   environment.getRequiredProperty("VAR_NAME")
 *
 * Patterns covered in application.properties / application.yml:
 *   key=${VAR_NAME}
 *   key=${VAR_NAME:default}
 */
const JAVA_PATTERNS: RegExp[] = [
  // @Value("${VAR}") or @Value("${VAR:default}")
  /@Value\(\s*["']\$\{([A-Z0-9_]+)(?::[^}]*)?\}["']/g,
  // System.getenv("VAR")
  /System\.getenv\(\s*["']([A-Z0-9_]+)["']/g,
  // environment.getProperty("VAR") / getRequiredProperty("VAR")
  /\.get(?:Required)?Property\(\s*["']([A-Z0-9_]+)["']/g,
];

const PROPS_PATTERN = /\$\{([A-Z0-9_]+)(?::[^}]*)?\}/g;

export class SpringBootDetector implements Detector {
  readonly name = 'Spring Boot';

  async detect(workspaceRoot: vscode.Uri): Promise<boolean> {
    // Presence of pom.xml or build.gradle with spring-boot is a good signal
    const indicators = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
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
    const [javaFiles, propsFiles, ymlFiles] = await Promise.all([
      vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '**/*.{java,kt}'),
        excludes
      ),
      vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '**/application*.properties'),
        excludes
      ),
      vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '**/application*.{yml,yaml}'),
        excludes
      ),
    ]);

    const refs: EnvVarReference[] = [];

    for (const file of javaFiles) {
      refs.push(...(await scanFile(file, JAVA_PATTERNS)));
    }
    for (const file of [...propsFiles, ...ymlFiles]) {
      refs.push(...(await scanFile(file, [PROPS_PATTERN])));
    }
    return refs;
  }

  async findDefined(workspaceRoot: vscode.Uri): Promise<DefinedVars> {
    const inProjectFiles = new Set<string>();

    const propsFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceRoot, '**/application*.properties'),
      getExcludeGlob()
    );
    for (const file of propsFiles) {
      await readPropertiesFile(file, inProjectFiles);
    }

    const ymlFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceRoot, '**/application*.{yml,yaml}'),
      getExcludeGlob()
    );
    for (const file of ymlFiles) {
      await readYamlEnvBlock(file, inProjectFiles);
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

async function readPropertiesFile(uri: vscode.Uri, out: Set<string>): Promise<void> {
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
    // ignore missing files
  }
}

async function readYamlEnvBlock(uri: vscode.Uri, out: Set<string>): Promise<void> {
  // Minimal YAML env block reader: looks for lines under an `env:` key
  // that match the pattern `  KEY: value` or `  KEY: ${...}`
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(bytes).toString('utf8');
    let inEnvBlock = false;
    for (const line of content.split('\n')) {
      if (/^env\s*:/.test(line)) {
        inEnvBlock = true;
        continue;
      }
      if (inEnvBlock) {
        // End of the env block (new top-level key)
        if (/^\S/.test(line) && !line.trim().startsWith('#')) {
          inEnvBlock = false;
        }
        const match = /^\s+([A-Z0-9_]+)\s*:/.exec(line);
        if (match) {
          out.add(match[1]);
        }
      }
    }
  } catch {
    // ignore missing files
  }
}

function getExcludeGlob(): string {
  const config = vscode.workspace.getConfiguration('envwatch');
  const patterns: string[] = config.get('exclude') ?? [];
  return `{${patterns.join(',')}}`;
}
