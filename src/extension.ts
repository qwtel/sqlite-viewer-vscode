import * as vscode from 'vscode';
import { CatScratchEditorProvider } from './catScratchEditor';
import { PawDrawEditorProvider } from './pawDrawEditor';
import { SQLiteEditorProvider  } from './sqliteEditor';

export function activate(context: vscode.ExtensionContext) {
  // Register our custom editor providers
  context.subscriptions.push(CatScratchEditorProvider.register(context));
  context.subscriptions.push(PawDrawEditorProvider.register(context));
  context.subscriptions.push(SQLiteEditorProvider.register(context));
}
