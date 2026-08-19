import * as vsc from 'vscode';
import * as jose from 'jose';
import type { TelemetryReporter } from '@vscode/extension-telemetry';

import { AccessToken, getLandingPageOrigin, JWTPublicKeySPKI, LicenseKey } from './constants';
import { activateProviders } from './extension';
import { getShortMachineId } from './util';

export type TokenPayload = jose.JWTPayload & { mid: string, ent?: 1 };

const licenseKeyRegex = /[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/i;
const legacyLicenseKeyRegex = /[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i;

const { l10n } = vsc;

const getLandingPageOriginForContext = (context: vsc.ExtensionContext) => getLandingPageOrigin(
  context.extensionMode === vsc.ExtensionMode.Development,
  import.meta.env.VSCODE_PRE_RELEASE,
);

export { exportTableCommand } from '../sqlite-viewer-core/pro/src/exportCommand';

export async function enterLicenseKeyCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const licenseKey = await vsc.window.showInputBox({
    title: l10n.t('SQLite Viewer PRO License Activation'),
    prompt: l10n.t('Enter License Key'),
    placeHolder: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
    password: false,
    ignoreFocusOut: true,
    validateInput: (value) => {
      return licenseKeyRegex.test(value) || legacyLicenseKeyRegex.test(value) 
        ? null 
        : l10n.t('License key must be in the format {0}', 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX');
    },
  });
  if (!licenseKey) return;
  if (!licenseKeyRegex.test(licenseKey) && !legacyLicenseKeyRegex.test(licenseKey)) throw Error(l10n.t('Invalid license key format'));

  const shortMachineId = await getShortMachineId();

  let response;
  try {
    const baseURL = getLandingPageOriginForContext(context);
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
  const payload = await verifyToken(data.token, shortMachineId);
  if (!payload) throw Error(l10n.t('Invalid access token'));

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
  const baseURL = getLandingPageOriginForContext(context);

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

  const payload = await verifyToken(accessToken, shortMachineId);
  if (!payload) throw Error(l10n.t('Invalid access token'));

  await context.globalState.update(AccessToken, accessToken);
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

export function calcDaysSinceIssued(issuedAt?: number) {
  if (!issuedAt) return null;
  const currentTime = Date.now() / 1000;
  const diffSeconds = currentTime - issuedAt;
  const diffDays = diffSeconds / (24 * 60 * 60);
  return diffDays;
}

function abortControllerTimeout(n: number) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), n);
  return ctrl.signal;
}

export async function refreshAccessToken(context: vsc.ExtensionContext, licenseKey: string, accessToken?: string) {
  let response;
  try {
    const baseURL = getLandingPageOriginForContext(context);
    const shortMachineId = await getShortMachineId();

    const payload = accessToken ? await verifyToken(accessToken, shortMachineId) : null;
    if (accessToken && payload?.ent === 1) return accessToken;

    const daysSinceIssued = payload ? calcDaysSinceIssued(payload.iat) : null;
    if (!accessToken || !payload || daysSinceIssued === null || daysSinceIssued > 14) {
      response = await fetch(new URL('/api/register', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'machine_id': shortMachineId, 'license_key': licenseKey }),
        signal: abortControllerTimeout(5000),
      });
    } else if (daysSinceIssued > 1) {
      response = await fetch(new URL('/api/refresh', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'machine_id': shortMachineId, 'license_key': licenseKey, 'access_token': accessToken }),
        signal: abortControllerTimeout(5000),
      });
    } else {
      return accessToken;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw Error(l10n.t('License validation request timed out'));
    throw new Error(l10n.t('No response from license validation service'));
  }

  if (!response.ok || response.headers.get('Content-Type')?.includes('application/json') === false) {
    await response.text().then(console.error).catch(() => {});
    throw new Error(l10n.t(`License validation request failed: {0}`, response.status));
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    throw new Error(l10n.t('Failed to parse response'));
  }

  const freshPayload = await verifyToken(data.token);
  if (!freshPayload) throw Error(l10n.t('Invalid access token'));
  return data.token;
}

export async function verifyToken(
  accessToken: string,
  expectedMid: string|PromiseLike<string> = getShortMachineId()
): Promise<TokenPayload|null> {
  try {
    const jwtKey = await jose.importSPKI(JWTPublicKeySPKI, 'ES256');
    const { payload } = await jose.jwtVerify(accessToken, jwtKey, { algorithms: ['ES256'] });
    if (payload.mid !== await expectedMid) return null;
    if (typeof payload.iat !== 'number') return null;
    if (payload.ent !== 1 && typeof payload.exp !== 'number') return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}
