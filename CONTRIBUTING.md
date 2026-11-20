# Contributing to EnvWatch

Thanks for your interest in improving EnvWatch!

## Development setup

Requirements: Node.js 20+ and VS Code 1.85+.

```bash
git clone https://github.com/gtomanini/envwatch-vscode.git
cd envwatch-vscode
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded, then open a Laravel, Symfony, Node.js or Spring Boot project to try it.

Useful scripts:

| Command | What it does |
|---|---|
| `npm run compile` | Type-check and build to `out/` |
| `npm run watch` | Rebuild on change |
| `npm run lint` | Run ESLint |
| `npm run package` | Build a `.vsix` |

## Adding a framework

1. Create `src/detectors/<framework>.ts` implementing the `Detector` interface from `src/detectors/index.ts`.
2. Register it in the `DETECTORS` array in `src/extension.ts`.
3. If the framework uses new file types or config files, update `activationEvents` in `package.json` and the file watcher / on-save extension list in `src/extension.ts`.
4. Add a row to the "Supported Frameworks" table in `README.md`.

Keep the two sets in `DefinedVars` separate: `inProjectFiles` must only contain variables from project files, because it is shown in the UI. Never display OS environment variables.

## Pull requests

- Branch off `main` and keep each PR focused on one change.
- Make sure `npm run compile` and `npm run lint` pass.
- Describe what you changed and how you tested it. A small sample project or snippet that reproduces the issue helps a lot.
- Add an entry under `[Unreleased]` in `CHANGELOG.md` for user-visible changes.

## Reporting bugs

Open an issue with your framework, a minimal snippet showing the env var usage, the config file contents (names only — **never paste real secret values**), and what you expected to see.
