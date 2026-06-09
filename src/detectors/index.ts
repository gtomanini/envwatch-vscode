import * as vscode from 'vscode';

/** Files larger than this are skipped to avoid memory issues with minified/binary files. */
export const MAX_FILE_BYTES = 500 * 1024; // 500 KB

export interface EnvVarReference {
  name: string;
  uri: vscode.Uri;
  range: vscode.Range;
}

export interface DefinedVars {
  /**
   * All vars considered "defined" for warning suppression purposes.
   * Includes OS environment variables (CI secrets, system vars, etc.).
   */
  forSuppression: Set<string>;

  /**
   * Vars defined explicitly in project config files (.env, application.properties, etc.).
   * Used for the sidebar panel — OS vars are intentionally excluded to avoid
   * leaking sensitive keys like AWS_SECRET_KEY into the visible UI.
   */
  inProjectFiles: Set<string>;
}

/**
 * A detector scans files for environment variable references.
 * Add new framework support by implementing this interface.
 */
export interface Detector {
  /** Human-readable name shown in logs/output */
  readonly name: string;

  /**
   * Returns true when this detector should activate for the given workspace.
   * Checked once per workspace scan.
   */
  detect(workspaceRoot: vscode.Uri): Promise<boolean>;

  /**
   * Scans the workspace and returns all env var references found.
   */
  findReferences(workspaceRoot: vscode.Uri): Promise<EnvVarReference[]>;

  /**
   * Returns the defined variable sets.
   * See DefinedVars for the distinction between suppression and panel display.
   */
  findDefined(workspaceRoot: vscode.Uri): Promise<DefinedVars>;
}
