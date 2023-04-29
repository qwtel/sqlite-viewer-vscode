import * as vsc from 'vscode';
import { SQLiteEditorDefaultProvider, SQLiteEditorOptionProvider  } from './sqliteEditor';

export function activate(context: vsc.ExtensionContext) {
  showWhatsNew(context);
  context.subscriptions.push(SQLiteEditorDefaultProvider.register(context));
  context.subscriptions.push(SQLiteEditorOptionProvider.register(context));
}

const extensionId = 'qwtel.sqlite-viewer'

// // https://stackoverflow.com/a/66303259/3073272
// function isMajorUpdate(previousVersion: string, currentVersion: string) {
//   // rain-check for malformed string
//   if (previousVersion.indexOf('.') === -1) {
//     return true;
//   }
//   //returns int array [1,1,1] i.e. [major,minor,patch]
//   var previousVerArr = previousVersion.split('.').map(Number);
//   var currentVerArr = currentVersion.split('.').map(Number);

//   if (currentVerArr[0] > previousVerArr[0]) {
//     return true;
//   } else {
//     return false;
//   }
// }

async function showWhatsNew(context: vsc.ExtensionContext) {
  const previousVersion = context.globalState.get<string>(extensionId);
  const currentVersion = vsc.extensions.getExtension(extensionId)!.packageJSON.version;

  // store latest version
  context.globalState.update(extensionId, currentVersion);

  if (
    previousVersion === undefined || 
    previousVersion !== currentVersion || 
    context.extensionMode === vsc.ExtensionMode.Development
  ) {
    let actions;
    const result = await vsc.window.showInformationMessage(
      `SQLite Viewer 2 is under active development and looking for 🎀 Sponsors!`,
      ...actions = [{ title: 'GitHub Sponsors ↗'}]
    );

    if (result !== null) {
      if (result === actions[0]) {
        await vsc.env.openExternal(
          vsc.Uri.parse('https://github.com/sponsors/qwtel')
        );
      } 
      // else if (result === actions[1]) {
      //   await vsc.env.openExternal(
      //     vsc.Uri.parse('https://github.com/qwtel/sqlite-viewer-vscode/issues')
      //   );
      // }
    }
  }
}