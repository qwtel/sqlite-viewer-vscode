import * as vscode from 'vscode';
import { SQLiteEditorProvider  } from './sqliteEditor';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(SQLiteEditorProvider.register(context));
}
