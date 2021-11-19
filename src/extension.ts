import * as vscode from 'vscode';
import { SQLiteEditorProvider, SQLiteEditorOptionProvider  } from './sqliteEditor';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(SQLiteEditorProvider.register(context));
  context.subscriptions.push(SQLiteEditorOptionProvider.register(context));
}
