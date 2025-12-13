
import type { TelemetryReporter } from '@vscode/extension-telemetry';
import type { WorkerDb, DbEdit } from '../sqlite-viewer-core/src/worker-db';
import type { SQLiteReadonlyEditorProvider } from './sqliteEditorProvider';

import * as vsc from 'vscode';

import * as Caplink from "../sqlite-viewer-core/src/caplink";

import { ConfigurationSection, FullExtensionId } from './constants';
import { Disposable } from './dispose';
import { cancelTokenToAbortSignal, getUriParts, generateSQLiteDocumentKey } from './util';
import { VscodeFns } from './vscodeFns';
import { WorkerBundle } from './workerBundle';

import { createWebWorker, getConfiguredMaxFileSize } from './webWorker';

import { createProWorker } from '../sqlite-viewer-core/pro/src/proWorker';
import { UndoHistory } from '../sqlite-viewer-core/pro/src/undoHistory';

export type SQLiteEdit = { label: string } & DbEdit;

const Extension = vsc.extensions.getExtension(FullExtensionId);

export const LocalMode = !vsc.env.remoteName;
export const RemoteWorkspaceMode = !!vsc.env.remoteName && Extension?.extensionKind === vsc.ExtensionKind.Workspace;
export const ReadWriteMode = LocalMode || RemoteWorkspaceMode;

const MaxHistory = 100;

export const GlobalSQLiteDocuments = new Map<string, SQLiteDocument>();

export function getInstantCommit() {
  const config = vsc.workspace.getConfiguration(ConfigurationSection);
  const value = config.get<string>('instantCommit', 'never');
  return value === 'always' || (value === 'remote-only' && RemoteWorkspaceMode)
}

export class SQLiteDocument extends Disposable implements vsc.CustomDocument {
  readonly #key: Promise<string>;

  static async create(
    provider: SQLiteReadonlyEditorProvider,
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    token?: vsc.CancellationToken,
  ): Promise<SQLiteDocument> {
    const { reporter, verified, context: { extensionUri } } = provider;
    let { readOnly } = provider;

    const createWorker = !import.meta.env.VSCODE_BROWSER_EXT && verified && ReadWriteMode // Do not change this line
      ? createProWorker
      : createWebWorker;

    const { filename } = getUriParts(uri);
    const instantCommit = getInstantCommit();

    let workerFns, importDb, dbRemote;
    try {
      ({ workerFns, importDb } = createWorker(extensionUri, reporter));
      ({ dbRemote, readOnly } = await importDb(uri, filename, readOnly, instantCommit));
    } catch (err) {
      // In case something goes wrong, try to create using the WASM worker
      if (createWorker !== createWebWorker) {
        try {
          ({ workerFns, importDb } = createWebWorker(extensionUri, reporter));
          ({ dbRemote, readOnly } = await importDb(uri, filename, readOnly));
          if (err instanceof Error) {
            vsc.window.showWarningMessage(vsc.l10n.t("[{0}] occurred while trying to open '{1}'", err.message, filename), {
              detail: vsc.l10n.t('The document could not be opened using SQLite Viewer PRO and will be opened in read-only mode instead.'),
            }); 
          }
        } catch (err2) {
          throw new AggregateError([err, err2], vsc.l10n.t('Failed to open database'));
        }
      } else {
        throw err;
      }
    }

    let history: UndoHistory<SQLiteEdit>|null = null;
    if (typeof openContext.backupId === 'string' && !instantCommit) {
      const editsUri = vsc.Uri.parse(openContext.backupId);
      const editsBuffer = await vsc.workspace.fs.readFile(editsUri);
      const h = history = UndoHistory.restore(editsBuffer, MaxHistory);

      try {
        await dbRemote.applyEdits(h.getUnsavedEdits(), cancelTokenToAbortSignal(token));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : vsc.l10n.t('Unknown error')
        await vsc.window.showErrorMessage(vsc.l10n.t('[{0}] occurred while trying to apply unsaved changes', errMsg), { 
          modal: true, 
          detail: vsc.l10n.t('The document was opened from a backup, but the unsaved changes could not be applied. The document will be opened in read-only mode.')
        });
        readOnly = true;
      }
    }
    
    const importedDb = { dbRemote, readOnly };
    return new SQLiteDocument(provider, uri, history, instantCommit, importedDb, workerFns, importDb, reporter);
  }

  getConfiguredMaxFileSize() { return getConfiguredMaxFileSize() }

  readonly #history: UndoHistory<SQLiteEdit>;
  readonly #vscodeFns: VscodeFns;

  private constructor(
    readonly provider: SQLiteReadonlyEditorProvider,
    readonly uri: vsc.Uri,
    history: UndoHistory<SQLiteEdit>|null,
    public instantCommit: boolean,
    private workerDb: { dbRemote: Caplink.Remote<WorkerDb>, readOnly?: boolean },
    private readonly workerFns: WorkerBundle["workerFns"],
    private readonly createWorkerDb: WorkerBundle["importDb"],
    private readonly reporter?: TelemetryReporter,
  ) {
    super();
    this.#history = history ?? new UndoHistory<SQLiteEdit>(MaxHistory);
    this.#vscodeFns = new VscodeFns(provider, this);
    this.#key = generateSQLiteDocumentKey(this.uri);
    this.#key.then(key => GlobalSQLiteDocuments.set(key, this));
  }

  get uriParts() { return getUriParts(this.uri); }
  get vscodeFns() { return this.#vscodeFns; }
  get key() { return this.#key; }

  readonly #onDidDispose = this._register(new vsc.EventEmitter<void>());
  readonly onDidDispose = this.#onDidDispose.event;

  readonly #onDidChangeContent = this._register(new vsc.EventEmitter<{
    // readonly edits: readonly SQLiteEdit[];
  }>());

  /**
   * Fired to notify webviews that the document has changed.
   */
  readonly onDidChangeContent = this.#onDidChangeContent.event;

  readonly #onDidChange = this._register(new vsc.EventEmitter<{
    readonly label: string,
    undo(): void|Promise<void>,
    redo(): void|Promise<void>,
  }>());

  /**
   * Fired to tell VS Code that an edit has occurred in the document.
   *
   * This updates the document's dirty indicator.
   */
  readonly onDidChange = this.#onDidChange.event;

  /**
   * Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed.
   */
  async dispose() {
    const key = await this.#key;
    GlobalSQLiteDocuments.delete(key);
    this.workerFns[Symbol.dispose]();
    super.dispose();
    this.#onDidDispose.fire();
  }

  /**
   * Called when the user edits the document in a webview.
   *
   * This fires an event to notify VS Code that the document has been edited.
   */
  makeEdit(edit: SQLiteEdit) {
    const history = this.#history;
    history.push(edit);
    this.#onDidChange.fire({
      label: edit.label,
      undo: async () => {
        const edit = history.undo();
        if (!edit) return;
        await this.dbRemote.undo(edit);
        this.#onDidChangeContent.fire({ /* edits: this.#edits */ });
        this.#maybeSave();
      },
      redo: async () => {
        const edit = history.redo();
        if (!edit) return;
        await this.dbRemote.redo(edit);
        this.#onDidChangeContent.fire({ /* edits: this.#edits */ });
        this.#maybeSave();
      }
    });
    this.#maybeSave();
  }

  makeExternalEdit(edit: SQLiteEdit) {
    this.makeEdit(edit);
    this.#onDidChangeContent.fire({ /* edits: this.#edits */ });
  }

  checkReadonly = async () => {
    if (this.readOnly) throw new Error(vsc.l10n.t('Document is read-only'));
  }

  /**
   * Called by VS Code when the user saves the document.
   */
  async save(token?: vsc.CancellationToken): Promise<void> {
    await this.checkReadonly();
    await this.#history.save();
    if (!this.instantCommit) {
      await this.dbRemote.commit(cancelTokenToAbortSignal(token));
    }
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(targetResource: vsc.Uri, token: vsc.CancellationToken): Promise<void> {
    await this.checkReadonly();
    const stat = await vsc.workspace.fs.stat(this.uri);
    if (stat.size > this.getConfiguredMaxFileSize()) {
      throw new Error(vsc.l10n.t('Database too large to save as a copy'));
    }
    const { filename } = this.uriParts;
    const data = await this.dbRemote.exportDb(filename, cancelTokenToAbortSignal(token));
    await vsc.workspace.fs.writeFile(targetResource, data);
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(token: vsc.CancellationToken): Promise<void> {
    await this.checkReadonly();
    this.#history.revert();
    await this.dbRemote.rollback(this.#history.getUnsavedEdits(), cancelTokenToAbortSignal(token));
    this.#onDidChangeContent.fire({ /* edits: this.#edits */ });
    this.#maybeSave();
  }

  async #maybeSave() {
    try {
      if (this.instantCommit) {
        if (this.#hasActiveEditor) {
          await this.forceSave();
        } else {
          this.#pendingSave = true;
        }
      }
    } catch {}
  }

  #hasActiveEditor = false;
  set hasActiveEditor(value: boolean) {
    this.#hasActiveEditor = value;
  }

  #pendingSave = false;
  get pendingSave() { 
    return this.#pendingSave
  }

  async forceSave() {
    this.#pendingSave = false;
    await vsc.commands.executeCommand('workbench.action.files.save');
  }

  get dbRemote() {
    return this.workerDb.dbRemote;
  }

  get readOnly() {
    return this.workerDb.readOnly ?? false;
  }

  get doubleClickBehavior() {
    const config = vsc.workspace.getConfiguration(ConfigurationSection);
    return config.get<string>('doubleClickBehavior', 'modal');
  }

  async refreshDb() {
    const oldDbRemote = this.dbRemote;

    if ((await oldDbRemote.type) === 'wasm') { // XXX: hard-coded refresh for wasm, not sure if this could be put in a better place
      oldDbRemote[Symbol.dispose]();
      const { dbRemote, readOnly } = await this.createWorkerDb(this.uri, this.uriParts.filename);
      this.workerDb = { dbRemote, readOnly };
      return dbRemote;
    }

    return oldDbRemote;
  }

  /**
   * Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit.
   */
  async backup(destination: vsc.Uri, _token: vsc.CancellationToken): Promise<vsc.CustomDocumentBackup> {
    const unsavedEditsBuffer = this.#history.backup();
    await vsc.workspace.fs.writeFile(destination, unsavedEditsBuffer);

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vsc.workspace.fs.delete(destination)
        } catch { /* noop */ }
      }
    };
  }
}
