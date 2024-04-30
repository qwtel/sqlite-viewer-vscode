import * as vsc from 'vscode';
import { SQLiteEditorDefaultProvider, SQLiteEditorOptionProvider  } from './sqliteEditor';
import TelemetryReporter from '@vscode/extension-telemetry';
// import { Credentials } from './credentials';

const key = "36072a93-f98f-4c93-88c3-8870add45a57";

export async function activate(context: vsc.ExtensionContext) {
  const reporter = new TelemetryReporter(key);
  // const credentials = new Credentials(context);
  context.subscriptions.push(SQLiteEditorDefaultProvider.register(context, reporter /* , credentials */));
  context.subscriptions.push(SQLiteEditorOptionProvider.register(context, reporter /* , credentials */));
  context.subscriptions.push(reporter);

  showWhatsNew(context, reporter);
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

async function showWhatsNew(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const previousVersion = context.globalState.get<string>(extensionId);
  const currentVersion = vsc.extensions.getExtension(extensionId)!.packageJSON.version;

  // store latest version
  context.globalState.update(extensionId, currentVersion);

  if (
    previousVersion === undefined || 
    previousVersion !== currentVersion || 
    context.extensionMode === vsc.ExtensionMode.Development
  ) {
    reporter.sendTelemetryEvent("install");

    let actions;
    const result = await vsc.window.showInformationMessage(
      `SQLite Viewer updated to new major version! Check out the Changelog to see what's new!`,
      ...actions = [{ title: 'Open Changelog ↗'}]
    );

    if (result !== null) {
      if (result === actions[0]) {
        await vsc.env.openExternal(
          vsc.Uri.parse('https://marketplace.visualstudio.com/items/qwtel.sqlite-viewer/changelog')
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