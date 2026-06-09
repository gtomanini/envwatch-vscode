# EnvWatch

Never ship a missing environment variable again.

**EnvWatch** scans your codebase and instantly warns you when an environment variable is used in the code but not defined in your configuration files — directly in the editor, with no extra setup required.

---

## Features

### Inline diagnostics
Missing variables appear underlined right where they are used. No need to leave your editor or run the app to discover the problem.

![Inline warning showing DB_PASSWORD is not defined](https://raw.githubusercontent.com/your-org/missing-env-vars/main/media/screenshot-inline.png)

### Sidebar panel
Click the **Env Vars** icon in the Activity Bar to see a full list of missing and defined variables. Click any missing variable to jump directly to where it is used.

![Sidebar panel showing missing and defined variables](https://raw.githubusercontent.com/your-org/missing-env-vars/main/media/screenshot-panel.png)

### Automatic rescanning
The extension rescans automatically when you save a source file or modify a `.env` file. You can also trigger a manual scan at any time via the refresh button in the panel or the command palette.

---

## Supported Frameworks

| Framework | Patterns detected | Config files read |
|---|---|---|
| **Laravel** | `env()`, `$_ENV[]`, `$_SERVER[]`, `getenv()` | `.env` |
| **Symfony** | `$_ENV[]`, `$_SERVER[]`, `getenv()`, `%env(VAR)%` in YAML | `.env`, `.env.local`, `.env.{environment}` |
| **Node.js** | `process.env.VAR`, `process.env['VAR']` | `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test` |
| **Spring Boot** | `@Value("${VAR}")`, `System.getenv()`, `${VAR}` in properties/YAML | `application.properties`, `application.yml` |

---

## Usage

The extension activates automatically when a supported project is opened. No configuration needed.

**Commands**
- `EnvWatch: Scan Project` — trigger a manual scan from the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

**Settings**

| Setting | Default | Description |
|---|---|---|
| `envwatch.severity` | `warning` | Diagnostic severity: `error`, `warning`, or `information` |
| `envwatch.exclude` | `**/vendor/**`, `**/node_modules/**`, `**/target/**` | Glob patterns to exclude from scanning |

---

## Adding Support for New Frameworks

The extension is built around a simple `Detector` interface. To add a new framework, create a file in `src/detectors/` implementing three methods:

```typescript
export interface Detector {
  readonly name: string;
  detect(workspaceRoot: vscode.Uri): Promise<boolean>;
  findReferences(workspaceRoot: vscode.Uri): Promise<EnvVarReference[]>;
  findDefined(workspaceRoot: vscode.Uri): Promise<Set<string>>;
}
```

Then register the new detector in `src/extension.ts`. No other changes required.

---

## Known Limitations

- Detection is based on static regex patterns. Environment variables assembled dynamically at runtime (e.g. `` `PREFIX_${name}` ``) will not be detected.
- Spring Boot variables defined only via OS environment or CI secrets are considered defined at scan time.

---

## License

MIT
