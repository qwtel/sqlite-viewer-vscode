import * as vsc from 'vscode';
import { SQLiteEditorDefaultProvider, SQLiteEditorOptionProvider } from './sqliteEditor';
import TelemetryReporter from '@vscode/extension-telemetry';
import { IS_VSCODE } from './util';
// import { Credentials } from './credentials';

const ExtensionId = 'sqlite-viewer'
const FullExtensionId = `qwtel.${ExtensionId}`
const Key = "36072a93-f98f-4c93-88c3-8870add45a57";

const NestingPattern = "${capture}.${extname}-*";
const FileNestingPatternsAdded = 'fileNestingPatternsAdded';

const SyncedKeys = [
  FileNestingPatternsAdded
];

export async function activate(context: vsc.ExtensionContext) {
  const reporter = new TelemetryReporter(Key);
  context.subscriptions.push(reporter);

  // const credentials = new Credentials(context);
  context.subscriptions.push(SQLiteEditorDefaultProvider.register(context, reporter /* , credentials */));
  context.subscriptions.push(SQLiteEditorOptionProvider.register(context, reporter /* , credentials */));

  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.addFileNestingPatterns`, addFileNestingPatternsCommand),
  );

  context.globalState.setKeysForSync(SyncedKeys);

  addFileNestingPatternsOnce(context);
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

function addFileNestingPatternsCommand() {
  return addFileNestingPatterns({ force: true });
}

async function addFileNestingPatternsOnce(context: vsc.ExtensionContext) {
  const patternsAdded = context.globalState.get<boolean>(FileNestingPatternsAdded, false);
  if (!patternsAdded) {
    await addFileNestingPatterns({ force: false });
    await context.globalState.update(FileNestingPatternsAdded, true);
  }
}

async function addFileNestingPatterns({ force = false } = {}) {
  const config = vsc.workspace.getConfiguration('explorer.fileNesting');
  const currPatterns = config.get<{ [key: string]: string }>('patterns', {});

  const newPatterns = {
    ...force || !currPatterns["*.sqlite"] ? { "*.sqlite": NestingPattern } : {},
    ...force || !currPatterns["*.db"] ? { "*.db": NestingPattern } : {},
    ...force || !currPatterns["*.sqlite3"] ? { "*.sqlite3": NestingPattern } : {},
    ...force || !currPatterns["*.db3"] ? { "*.db3": NestingPattern } : {},
    ...force || !currPatterns["*.sdb"] ? { "*.sdb": NestingPattern } : {},
    ...force || !currPatterns["*.s3db"] ? { "*.s3db": NestingPattern } : {},
  };

  const updatedPatterns = {
    ...currPatterns,
    ...newPatterns,
  };

  await config.update('patterns', updatedPatterns, vsc.ConfigurationTarget.Global);
}

const openChangelog = (frag?: `#${string}`) => vsc.env.openExternal(
  vsc.Uri.parse(IS_VSCODE
    ? `https://marketplace.visualstudio.com/items/qwtel.sqlite-viewer/changelog${frag ? `#user-content-${frag.slice(1)}` : ''}`
    : `https://open-vsx.org/extension/qwtel/sqlite-viewer/changes${frag}`)
);

async function showWhatsNew(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const prevVersion = context.globalState.get<string>(FullExtensionId);
  const currVersion = vsc.extensions.getExtension(FullExtensionId)!.packageJSON.version as string;

  // store latest version
  context.globalState.update(ExtensionId, currVersion);

  if (
    prevVersion === undefined ||
    prevVersion !== currVersion
    // || context.extensionMode === vsc.ExtensionMode.Development
  ) {
    reporter.sendTelemetryEvent("install");

    if (
      isMajorUpdate(currVersion, prevVersion)
    ) {
      let actions;
      const result = await vsc.window.showInformationMessage(
        `SQLite Viewer now supports reading WAL mode databases. Check out the Changelog for details.`,
        ...actions = [{ title: 'Open Changelog ↗' }]
      );

      switch (result) {
        case actions[0]: {
          return await openChangelog('#v0.5');
        }
      }
    }
    else if (
      prevVersion !== currVersion
      || context.extensionMode === vsc.ExtensionMode.Development
    ) {
      let actions;
      const result = await vsc.window.showInformationMessage(
        `SQLite Viewer now has experimental support for Views and more column filter options. Check out the Changelog for details`,
        ...actions = [{ title: 'Open Changelog ↗' }]
      );

      switch (result) {
        case actions[0]: {
          return await openChangelog('#v0.5.7');
        }
      }
    }
  }
}
