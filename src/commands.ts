import * as vsc from 'vscode';
import * as jose from 'jose';
import TelemetryReporter from '@vscode/extension-telemetry';
import { AccessToken, JWTPublicKeySPKI, LicenseKey } from './constants';
import { activateProviders } from './extension';
import { getShortMachineId } from './util';

const licenseKeyRegex = /[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/i;
const legacyLicenseKeyRegex = /[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i;

const { l10n } = vsc;

export async function enterLicenseKeyCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const licenseKey = await vsc.window.showInputBox({
    title: l10n.t('SQLite Viewer PRO License Activation'),
    prompt: l10n.t('Enter License Key'),
    placeHolder: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
    password: false,
    ignoreFocusOut: true,
    validateInput: (value) => {
      return licenseKeyRegex.test(value) || legacyLicenseKeyRegex.test(value) ? null : l10n.t('License key must be in the format {0}', 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX');
    },
  });
  if (!licenseKey) return;
  if (!licenseKeyRegex.test(licenseKey) && !legacyLicenseKeyRegex.test(licenseKey)) throw Error(l10n.t('Invalid license key format'));

  const shortMachineId = await getShortMachineId();

  let response;
  try {
    const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';
    response = await fetch(new URL('/api/register', baseURL), {
      method: 'POST',
      headers: [['Content-Type', 'application/x-www-form-urlencoded']],
      body: new URLSearchParams({ 'machine_id': shortMachineId, 'license_key': licenseKey }),
    });
  } catch {
    throw Error(l10n.t('No response from license validation service'));
  }

  const contentType = response.headers.get('Content-Type');
  if (!response.ok || contentType?.includes('application/json') === false) {
    const message = contentType?.includes('text/plain') ? await response.text() : response.status.toString();
    throw Error(l10n.t(`License validation request failed: {0}`, message));
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    throw Error(l10n.t('Failed to parse response'));
  }
				
  const payload = jose.decodeJwt(data.token);
  // if (!payload) throw Error(l10n.t('Invalid access token'));
  // if (payload.mid !== shortMachineId) {
  //   throw Error(l10n.t('Machine ID in token does not match this device, this should never happen!'));
  // }

  await Promise.all([
    context.globalState.update(LicenseKey, licenseKey),
    context.globalState.update(AccessToken, data.token),
  ]);
  await activateProviders(context, reporter);

  vsc.window.showInformationMessage(l10n.t('Thank you for purchasing {0}!', `SQLite Viewer PRO${payload.ent ? ' Business Edition' : ''}`), {
    modal: true, 
    detail: l10n.t('Exclusive PRO features will be unlocked once you open the next file.')
  });
}

export async function enterAccessTokenCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';

  const answer1 = await vsc.window.showInformationMessage(l10n.t('SQLite Viewer PRO Offline Activation'), {
    modal: true, 
    detail: l10n.t(`This wizard will activate the PRO version of SQLite Viewer without connecting to the license service directly. It is intended for Business Edition customers who have purchased a license for offline use. PRO customers can use it to gain 14 days of offline use (same as regular activation).`),
  }, ...[{ title: l10n.t('Continue'), value: true }]);
  if (answer1?.value !== true) return;

  const shortMachineId = await getShortMachineId();
  const registerHref = new URL(`/api/register?id=${shortMachineId}`, baseURL).href;

  const answer2 = await vsc.window.showInformationMessage(l10n.t('Out-of-Band Activation'), {
    modal: true, 
    detail: l10n.t(`On any device with an active internet connection, open\n\n{0}\n\nDo you want to open it on this device or copy it to the clipboard?`, registerHref)
  }, ...[{ title: l10n.t('Open'), value: 'open' }, { title: l10n.t('Copy'), value: 'copy' }] as const);

  if (answer2?.value === 'open')
    await vsc.env.openExternal(vsc.Uri.parse(registerHref));
  else if (answer2?.value === 'copy')
    await vsc.env.clipboard.writeText(registerHref);

  const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
  const accessToken = await Promise.resolve(vsc.window.showInputBox({
    title: l10n.t('SQLite Viewer PRO Offline Activation'),
    prompt: l10n.t('Enter access token generated on the website'),
    placeHolder: 'eyJhbGciOiJFUzI1NiJ9.eyJ…',
    password: false,
    ignoreFocusOut: true,
    validateInput: (value) => {
      return jwtRegex.test(value) ? null : l10n.t('Access token must be a JWT');
    },
  }));
  if (!accessToken) throw Error(l10n.t('No access token'));
  if (!jwtRegex.test(accessToken)) throw Error(l10n.t('Invalid access token format'));

  let payload;
  try {
    payload = await verifyToken<Payload>(accessToken);
  } catch (err) {
    throw Error(l10n.t('Invalid access token', { cause: err }));
  }
  if (!payload) throw Error(l10n.t('Invalid access token'));
  // if (payload.mid !== shortMachineId) {
  //   throw Error(l10n.t('Machine ID in token does not match this device. Was the token generated by <https://vscode.sqliteviewer.app/api/register>?'));
  // }
  if (!payload.ent && (!payload.key && !payload.licenseKey)) {
    throw Error(l10n.t('Token does not contain license key. Was it generated by <https://vscode.sqliteviewer.app/api/register>?')); 
  }

  await Promise.all([
    !payload.ent ? context.globalState.update(LicenseKey, payload.key || payload.licenseKey) : null,
    context.globalState.update(AccessToken, accessToken),
  ]);
  await activateProviders(context, reporter);

  vsc.window.showInformationMessage(l10n.t('Thank you for purchasing {0}!', `SQLite Viewer PRO${payload.ent ? ' Business Edition' : ''}`), {
    modal: true, 
    detail: l10n.t('Exclusive PRO features will be unlocked once you open the next file.')
  });
}

export async function deleteLicenseKeyCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  await Promise.all([
    context.globalState.update(LicenseKey, ''),
    context.globalState.update(AccessToken, ''),
  ]);
  await activateProviders(context, reporter);

  vsc.window.showInformationMessage(l10n.t('The license was deactivated for this device!'), {
    modal: true, 
    detail: l10n.t('SQLite Viewer PRO will be deactivated once you open the next file.')
  });
}

export function calcDaysSinceIssued(issuedAt: number) {
  const currentTime = Date.now() / 1000;
  const diffSeconds = currentTime - issuedAt;
  const diffDays = diffSeconds / (24 * 60 * 60);
  return diffDays;
}

export function getPayload(accessToken?: string) {
  return accessToken != null ? jose.decodeJwt(accessToken) : null;
}

function abortControllerTimeout(n: number) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), n);
  return ctrl.signal;
}

export async function refreshAccessToken(context: vsc.ExtensionContext, licenseKey: string, accessToken?: string) {
  let response;
  try {
    const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';

    const payload = getPayload(accessToken);
    if (payload && 'ent' in payload) return accessToken;

    const daysSinceIssued = accessToken && payload?.iat && calcDaysSinceIssued(payload.iat);
    if (!daysSinceIssued || daysSinceIssued > 14) {
      response = await fetch(new URL('/api/register', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'machine_id': await getShortMachineId(), 'license_key': licenseKey }),
        signal: abortControllerTimeout(5000),
      });
    } else if (daysSinceIssued > 1) {
      response = await fetch(new URL('/api/refresh', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'machine_id': await getShortMachineId(), 'license_key': licenseKey, 'access_token': accessToken }),
      });
    } else {
      return accessToken;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw Error(l10n.t('License validation request timed out'));
    throw new Error(l10n.t('No response from license validation service'));
  }

  if (!response.ok || response.headers.get('Content-Type')?.includes('application/json') === false) {
    response.text().then(console.error).catch(() => {});
    throw new Error(l10n.t(`License validation request failed: {0}`, response.status));
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    throw new Error(l10n.t('Failed to parse response'));
  }

  // const freshPayload = jose.decodeJwt(data.token);
  // if (!freshPayload) throw Error(l10n.t('Invalid access token'));
  // if (freshPayload.mid !== await getShortMachineId()) {
  //   throw Error(l10n.t('Machine ID in token does not match this device, this should never happen!'));
  // }

  // console.log(data);
  Promise.resolve(context.globalState.update(AccessToken, data.token)).catch(console.warn);
  return data.token;
}

export async function verifyToken<PayloadType = jose.JWTPayload>(accessToken: string): Promise<PayloadType & jose.JWTPayload|null> {
  try {
    const jwtKey = await jose.importSPKI(JWTPublicKeySPKI, 'ES256');
    const { payload } = await jose.jwtVerify<PayloadType>(accessToken, jwtKey);
    return payload;
  } catch {
    return null;
  }
}

type Payload = { mid: string, key?: string, licenseKey?: string, ent?: 1 }
