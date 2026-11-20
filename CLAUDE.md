# CLAUDE.md

EnvWatch is a VS Code extension (TypeScript, no runtime dependencies) that flags environment variables used in code but not defined in the project's config files. Supports Laravel, Symfony, Node.js and Spring Boot.

## Commands

```bash
npm install          # first time only
npm run compile      # tsc -> out/  (the main correctness check — run after every change)
npm run watch        # incremental compile
npm run package      # builds envwatch-<version>.vsix
```

- **Requires Node 20+** (`.nvmrc`). The shell default here may be Node 16, which breaks ESLint and `vsce` — use `nvm use` or prefix `PATH=~/.nvm/versions/node/v20.18.3/bin:$PATH`.
- `npm run lint` (ESLint, `.eslintrc.json`) must pass; CI runs compile + lint + `npm audit --omit=dev`.
- Add user-visible changes under `[Unreleased]` in `CHANGELOG.md`.
- There is **no test suite**. Verify changes with `npm run compile`, and for behavior changes, by reasoning through the regexes with concrete sample inputs (or a throwaway Node script in a scratch dir — never commit it).
- Manual testing: press F5 in VS Code ("Run Extension" in `.vscode/launch.json`) to open an Extension Development Host, then open a sample Laravel/Node/Symfony/Spring project.

## Architecture

```
src/extension.ts        activate(): registers DETECTORS, tree view, commands, file watchers, on-save rescan
src/diagnostics.ts      DiagnosticsProvider.scan(): runs active detectors, diffs refs vs defined, emits diagnostics
src/treeview.ts         EnvVarTreeProvider: sidebar panel (missing / defined vars)
src/detectors/index.ts  Detector interface, EnvVarReference, DefinedVars, MAX_FILE_BYTES
src/detectors/*.ts      one file per framework
```

Scan flow: `detect(root)` decides if a detector applies → `findReferences(root)` regex-scans source files → `findDefined(root)` reads config files → `diagnostics.ts` reports refs not in `forSuppression`.

### Key conventions

- **`DefinedVars` has two sets on purpose.** `forSuppression` may include OS env vars (so CI/system vars don't produce warnings); `inProjectFiles` must contain only vars from project files. The sidebar uses `inProjectFiles` only — never show OS env vars in the UI (risk of leaking secrets like `AWS_SECRET_KEY`).
- **Adding a framework:** create `src/detectors/<name>.ts` implementing `Detector`, add it to `DETECTORS` in `src/extension.ts`, update the README "Supported Frameworks" table, and check `activationEvents` in `package.json`, the file watcher glob and the on-save extension list in `extension.ts`.
- Patterns are regexes with the `g` flag and a single capture group for the var name (`[A-Z0-9_]+`). Dynamically built names are out of scope (documented limitation).
- Skip files larger than `MAX_FILE_BYTES`. Respect the `envwatch.exclude` setting via each detector's `getExcludeGlob()`.
- Helpers (`scanFile`, `offsetToPosition`, `readDotEnvFile`, `getExcludeGlob`) are currently **duplicated in each detector file**. When fixing a bug in one, apply it to all copies (or extract them into a shared module as a deliberate refactor).
- Use the `vscode.workspace.fs` API for file access, not Node `fs`, so the extension works with remote/virtual workspaces.
- New settings go in `contributes.configuration` in `package.json` and in the README settings table.

## Workflow

- Branch off `main` for each feature/fix (`feat/...`, `fix/...`); keep commits focused.
- Before calling a change done: `npm run compile` passes with no errors.
- User-visible changes: update `README.md`. Bump `version` in `package.json` only when asked to prepare a release.
