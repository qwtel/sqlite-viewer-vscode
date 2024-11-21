import * as vsc from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { deleteLicenseKeyCommand, enterAccessTokenCommand, enterLicenseKeyCommand, getDaysSinceIssued, refreshAccessToken, verifyToken } from './commands';
import { IS_VSCODE } from './util';
import { AccessToken, ExtensionId, FileNestingPatternsAdded, FistInstallMs, FullExtensionId, LicenseKey, NestingPattern, SyncedKeys, TelemetryConnectionString } from './constants';
import { disposeAll } from './dispose';
import { registerProvider } from './sqliteEditor';

export async function activate(context: vsc.ExtensionContext) {
  const reporter = new TelemetryReporter(TelemetryConnectionString);
  context.subscriptions.push(reporter);

  showWhatsNew(context, reporter);

  await activateProviders(context, reporter);

  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.addFileNestingPatterns`, addFileNestingPatternsCommand),
  );
  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.enterLicenseKey`, () => enterLicenseKeyCommand(context, reporter)),
  );
  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.removeLicenseKey`, () => deleteLicenseKeyCommand(context, reporter)),
  );
  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.enterAccessToken`, () => enterAccessTokenCommand(context, reporter)),
  );

  context.globalState.setKeysForSync(SyncedKeys);

  addFileNestingPatternsOnce(context);
}

const providerSubs = new WeakSet<vsc.Disposable>();
export async function activateProviders(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const prevSubs = context.subscriptions.filter(x => providerSubs.has(x));
  for (const sub of prevSubs) context.subscriptions.splice(context.subscriptions.indexOf(sub), 1);
  disposeAll(prevSubs);

  const licenseKey = context.globalState.get<string>(LicenseKey);
  let accessToken = context.globalState.get<string>(AccessToken);
  if (licenseKey) {
    const daysSinceIssued = getDaysSinceIssued(accessToken)
    console.log({ daysSinceIssued })
    const freshAccessToken = refreshAccessToken(context, daysSinceIssued, licenseKey, accessToken).catch(err => (console.warn(err), accessToken));
    if (!accessToken || daysSinceIssued > 14) {
      accessToken = await freshAccessToken;
    }
  }
  const verified = !!accessToken && !!await verifyToken(accessToken);

  const subs = [];
  subs.push(registerProvider(context, reporter, `${ExtensionId}.view`, verified, accessToken));
  subs.push(registerProvider(context, reporter, `${ExtensionId}.option`, verified, accessToken));

  for (const sub of subs) providerSubs.add(sub);
  context.subscriptions.push(...subs);
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

  const firstInstall = context.globalState.get<number>(FistInstallMs);
  if (firstInstall === undefined) {
    if (prevVersion)
      context.globalState.update(FistInstallMs, 0);
    else
      context.globalState.update(FistInstallMs, Date.now());
  }

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
