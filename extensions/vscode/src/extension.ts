/**
 * Extension host entry. Registers the rule tree, the three commands and a
 * debounced watcher on the open database file.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import { RulesTreeProvider } from './rulesTree';

/** Remembered across sessions so the tree comes back where it was. */
const FILE_KEY = 'bifrost.databaseFile';

/**
 * SQLite writes a file several times per save (journal, main, truncate), so a
 * raw watcher reloads three to five times per export. Coalesce.
 */
const RELOAD_DEBOUNCE_MS = 400;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const tree = new RulesTreeProvider();
  context.subscriptions.push(tree);

  const view = vscode.window.createTreeView('bifrostRules', { treeDataProvider: tree });
  context.subscriptions.push(view);

  let watcher: vscode.FileSystemWatcher | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const watch = (file: string | null) => {
    watcher?.dispose();
    watcher = null;
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
    if (!file) return;

    // A watcher on the single file, not a glob over the workspace.
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)),
    );
    const schedule = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        void tree.reload();
      }, RELOAD_DEBOUNCE_MS);
    };
    watcher.onDidChange(schedule);
    watcher.onDidCreate(schedule);
    watcher.onDidDelete(schedule);
    context.subscriptions.push(watcher);
  };

  const open = async (file: string | null) => {
    await context.workspaceState.update(FILE_KEY, file ?? undefined);
    await tree.setFile(file);
    watch(file);
    view.description = file ? path.basename(file) : undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('bifrost.openDatabase', async () => {
      const file = await pickDatabase();
      if (file) await open(file);
    }),

    vscode.commands.registerCommand('bifrost.refreshRules', () => tree.reload()),

    vscode.commands.registerCommand('bifrost.copyCel', async (node) => {
      const cel = tree.celOf(node);
      if (!cel) return;
      await vscode.env.clipboard.writeText(cel);
      vscode.window.setStatusBarMessage('CEL kopiert', 2000);
    }),
  );

  await open(await initialFile(context));
}

/**
 * Settings path wins; then the remembered file; then — only when the workspace
 * holds exactly one candidate — that one. More than one and we stay silent
 * rather than guess.
 */
async function initialFile(context: vscode.ExtensionContext): Promise<string | null> {
  const configured = vscode.workspace
    .getConfiguration('bifrost')
    .get<string>('databasePath')
    ?.trim();
  if (configured) {
    const root = vscode.workspace.workspaceFolders?.[0];
    return root ? path.resolve(root.uri.fsPath, configured) : configured;
  }

  const remembered = context.workspaceState.get<string>(FILE_KEY);
  if (remembered) return remembered;

  const found = await findDatabases();
  return found.length === 1 ? found[0].fsPath : null;
}

function findDatabases(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles('**/*.{db,sqlite,sqlite3}', '**/node_modules/**', 50);
}

async function pickDatabase(): Promise<string | null> {
  const found = await findDatabases();
  const browse = '$(folder-opened) Datei wählen…';
  const items = [
    ...found.map((uri) => ({
      label: path.basename(uri.fsPath),
      description: vscode.workspace.asRelativePath(uri),
      uri,
    })),
    { label: browse, description: '', uri: undefined },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Bifrost-Regel-Datenbank',
  });
  if (!picked) return null;
  if (picked.uri) return picked.uri.fsPath;

  const chosen = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { SQLite: ['db', 'sqlite', 'sqlite3'] },
  });
  return chosen?.[0]?.fsPath ?? null;
}

export function deactivate(): void {
  // Disposables are owned by `context.subscriptions`.
}
