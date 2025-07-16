import * as vsc from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { calcDaysSinceIssued, deleteLicenseKeyCommand, enterAccessTokenCommand, enterLicenseKeyCommand, getPayload, refreshAccessToken, verifyToken, exportTableCommand } from './commands';
import { IsVSCode } from './util';
import { AccessToken, ExtensionId, FileNestingPatternsAdded, FistInstallMs, FullExtensionId, LicenseKey, NestingPattern, SyncedKeys, TelemetryConnectionString, Title } from './constants';
import { disposeAll } from './dispose';
import { registerFileProvider, registerProvider } from './sqliteEditor';

export type DbParams = {
  filename: string,
  table: string,
  name: string,
}

export let GlobalOutputChannel: vsc.OutputChannel|null = null;

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
  context.subscriptions.push(
    vsc.commands.registerCommand(`${ExtensionId}.exportTable`, (dbParams: DbParams, columns: string[], dbOptions?: any, tableStore?: any, exportOptions?: any, extras?: any) => 
      exportTableCommand(context, reporter, dbParams, columns, dbOptions, tableStore, exportOptions, extras)),
  );

  context.globalState.setKeysForSync(SyncedKeys);

  addFileNestingPatternsOnce(context);
}

const globalProviderSubs = new WeakSet<vsc.Disposable>();

const showWarningAndReturn = <T>(accessToken?: T) => (err: unknown) => {
  if (err instanceof Error) vsc.window.showWarningMessage(err.message); else console.error(err)
  return accessToken;
}

export async function activateProviders(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const prevSubs = context.subscriptions.filter(x => globalProviderSubs.has(x));
  for (const sub of prevSubs) context.subscriptions.splice(context.subscriptions.indexOf(sub), 1);
  disposeAll(prevSubs);

  let verified = false;
  let accessToken = context.globalState.get<string>(AccessToken);
  try {
    const licenseKey = context.globalState.get<string>(LicenseKey);
    if (licenseKey) {
      const payload = getPayload(accessToken);
      const daysSinceIssued = accessToken && payload?.exp && calcDaysSinceIssued(payload.iat);
      const freshAccessTokenPromise = refreshAccessToken(context, licenseKey, accessToken).catch(showWarningAndReturn(accessToken));
      if (!accessToken || (daysSinceIssued && daysSinceIssued > 14)) {
        accessToken = await freshAccessTokenPromise;
      }
    }
    verified = !!accessToken && !!(await verifyToken(accessToken));
  } catch (err) {
    if (err instanceof Error) vsc.window.showWarningMessage(err.message); else console.error(err)
  }

  const subs = [];
  const channel = GlobalOutputChannel = verified ? vsc.window.createOutputChannel(Title, 'sql') : null;
  channel && subs.push(channel)
  
  subs.push(registerProvider(`${ExtensionId}.view`, context, reporter, channel, { verified, accessToken }));
  subs.push(registerProvider(`${ExtensionId}.option`, context, reporter, channel, { verified, accessToken }));
  subs.push(registerProvider(`${ExtensionId}.readonly`, context, reporter, channel, { verified, accessToken, readOnly: true }));
  subs.push(registerFileProvider(context));

  for (const sub of subs) globalProviderSubs.add(sub);
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
  vsc.Uri.parse(IsVSCode
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
