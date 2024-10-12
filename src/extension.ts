import * as vsc from 'vscode';
import { activateProviders, enterLicenseKeyCommand } from './sqliteEditor';
import TelemetryReporter from '@vscode/extension-telemetry';
import { IS_VSCODE } from './util';
import { ExtensionId, FileNestingPatternsAdded, FullExtensionId, NestingPattern, SyncedKeys, TelemetryConnectionString } from './constants';

export async function activate(context: vsc.ExtensionContext) {
  const reporter = new TelemetryReporter(TelemetryConnectionString);
  context.subscriptions.push(reporter);

  await activateProviders(context, reporter);

  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.addFileNestingPatterns`, addFileNestingPatternsCommand),
  );
  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.enterLicenseKey`, () => enterLicenseKeyCommand(context, reporter)),
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
  context.globalState.update(FullExtensionId, currVersion);

  if (
    prevVersion === undefined ||
    prevVersion !== currVersion
    // || context.extensionMode === vsc.ExtensionMode.Development
  ) {
    reporter.sendTelemetryEvent("install");

    if (
      isMajorUpdate(currVersion, prevVersion)
    ) {
      // let actions;
      // const result = await vsc.window.showInformationMessage(
      //   `SQLite Viewer now has a secondary sidebar 🎉. It can show the current row selection or meta data about the current table.`,
      //   ...actions = [{ title: 'Open Changelog ↗' }]
      // );

      // switch (result) {
      //   case actions[0]: {
      //     return await openChangelog('#v0.6');
      //   }
      // }
    }
    else if (
      prevVersion !== currVersion
      // || context.extensionMode === vsc.ExtensionMode.Development
    ) {
      // let actions;
      // const result = await vsc.window.showInformationMessage(
      //   `SQLite Viewer can now open more than one than one editor per SQLite file. Check out the changelog for details:`,
      //   ...actions = [{ title: 'Open Changelog ↗' }]
      // );

      // switch (result) {
      //   case actions[0]: {
      //     return await openChangelog('#v0.6.4');
      //   }
      // }
    }
  }
}
