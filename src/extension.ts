import * as vsc from 'vscode';
import { SQLiteEditorDefaultProvider, SQLiteEditorOptionProvider  } from './sqliteEditor';
import TelemetryReporter from '@vscode/extension-telemetry';
// import { Credentials } from './credentials';

const ExtensionId = 'qwtel.sqlite-viewer'
const Key = "36072a93-f98f-4c93-88c3-8870add45a57";

export async function activate(context: vsc.ExtensionContext) {
  const reporter = new TelemetryReporter(Key);
  // const credentials = new Credentials(context);
  context.subscriptions.push(SQLiteEditorDefaultProvider.register(context, reporter /* , credentials */));
  context.subscriptions.push(SQLiteEditorOptionProvider.register(context, reporter /* , credentials */));
  context.subscriptions.push(reporter);

  showWhatsNew(context, reporter);
}

// https://stackoverflow.com/a/66303259/3073272
function isMajorUpdate(currVersion: string, prevVersion?: string|null) {
  if (!prevVersion?.includes('.')) {
    return true;
  }
  //returns int array [1,1,1] i.e. [major,minor,patch]
  var prev = prevVersion.split('-')[0].split('.').map(Number);
  var curr = currVersion.split('-')[0].split('.').map(Number);

  if (curr[0] > prev[0] || (curr[0] === 0 && prev[0] === 0 && curr[1] > prev[1])) {
    return true;
  } else {
    return false;
  }
}

async function showWhatsNew(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const prevVersion = context.globalState.get<string>(ExtensionId);
  const currVersion = vsc.extensions.getExtension(ExtensionId)!.packageJSON.version as string;

  // store latest version
  context.globalState.update(ExtensionId, currVersion);

  if (
    prevVersion === undefined || 
    prevVersion !== currVersion || 
    context.extensionMode === vsc.ExtensionMode.Development
  ) {
    reporter.sendTelemetryEvent("install");

    if (
      isMajorUpdate(currVersion, prevVersion) ||
      context.extensionMode === vsc.ExtensionMode.Development
    ) {
      let actions;
      const result = await vsc.window.showInformationMessage(
        `SQLite Viewer now supports reading WAL mode databases. Check out the Changelog for details.`,
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
}
