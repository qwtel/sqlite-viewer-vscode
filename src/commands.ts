import * as vsc from 'vscode';
import * as jose from 'jose';
import TelemetryReporter from '@vscode/extension-telemetry';

import { AccessToken, ExtensionId, JWTPublicKeySPKI, LicenseKey } from './constants';
import { disposeAll } from "./dispose";
import { registerProvider } from './sqliteEditor';

const providerSubscriptions = new WeakMap<vsc.ExtensionContext, vsc.Disposable[]>();

export async function activateProviders(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const prevSubs = providerSubscriptions.get(context);
  // console.log({ prevSubs });
  prevSubs && disposeAll(prevSubs);

  let subs;
  providerSubscriptions.set(context, subs = []);

  const licenseKey = context.globalState.get<string>(LicenseKey);
  let accessToken = context.globalState.get<string>(AccessToken);
  if (!accessToken && licenseKey) {
    const freshAccessToken = refreshAccessToken(context, licenseKey, accessToken).catch(err => (console.warn(err), accessToken));
    accessToken = await freshAccessToken;
  }
  const verified = !!accessToken && !!licenseKey && await verifyToken(accessToken);

  subs.push(registerProvider(context, reporter, `${ExtensionId}.view`, verified, accessToken));
  subs.push(registerProvider(context, reporter, `${ExtensionId}.option`, verified, accessToken));

  context.subscriptions.push(...subs);
}

export async function enterLicenseKeyCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const licenseKey = await vsc.window.showInputBox({
    prompt: 'Enter License Key',
    placeHolder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    password: false,
    ignoreFocusOut: true,
    validateInput: (value) => {
      return /[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i.test(value) || context.extensionMode === vsc.ExtensionMode.Development
        ? null
        : 'License key must be in the format XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX';
    },
  });
  if (!licenseKey) return;
  if (!/[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i.test(licenseKey)) throw Error('Invalid license key format');

  let response;
  try {
    const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';
    response = await fetch(new URL('/api/register', baseURL), {
      method: 'POST',
      headers: [['Content-Type', 'application/x-www-form-urlencoded']],
      body: new URLSearchParams({ 'license_key': licenseKey }),
    });
  } catch {
    throw Error('No response from license validation service');
  }

  if (!response.ok || response.headers.get('Content-Type')?.includes('application/json') === false) {
    const message = await response.text();
    throw Error(`License validation request failed: ${message}`);
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    throw Error('Failed to parse response');
  }
				
  // console.log(data);

  await Promise.all([
    context.globalState.update(LicenseKey, licenseKey),
    context.globalState.update(AccessToken, data.token),
  ]);
  await activateProviders(context, reporter);

  vsc.window.showInformationMessage('Thank you for purchasing SQLite Viewer PRO!', {
    modal: true, 
    detail: 'SQLite Viewer PRO will be enabled once you open the next file.'
  });
}

export async function deleteLicenseKeyCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  await Promise.all([
    context.globalState.update(LicenseKey, ''),
    context.globalState.update(AccessToken, ''),
  ]);
  await activateProviders(context, reporter);

  vsc.window.showInformationMessage('The license was deactivated for this device!', {
    modal: true, 
    detail: 'SQLite Viewer PRO will be deactivated once you open the next file.'
  });
}

function calcDaysSinceIssued(token: string) {
	const payload = jose.decodeJwt(token);
  const issuedAt = payload.iat!;
  const currentTime = Date.now() / 1000;
  const diffSeconds = currentTime - issuedAt;
  const diffDays = diffSeconds / (24 * 60 * 60);
  return diffDays;
}

export async function refreshAccessToken(context: vsc.ExtensionContext, licenseKey: string, accessToken?: string) {
  let response;
  try {
    const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';
    const daysSinceIssued = accessToken && calcDaysSinceIssued(accessToken);
    // console.log({ daysSinceIssued })
    if (!daysSinceIssued || daysSinceIssued > 14) {
      response = await fetch(new URL('/api/register', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'license_key': licenseKey }),
      });
    } else if (daysSinceIssued > 1) {
      response = await fetch(new URL('/api/refresh', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'license_key': licenseKey, 'access_token': accessToken }),
      });
    } else {
      return accessToken;
    }
  } catch {
    throw new Error('No response from license validation service');
  }

  if (!response.ok || response.headers.get('Content-Type')?.includes('application/json') === false) {
    response.text().then(console.error).catch();
    throw new Error(`License validation request failed: ${response.status}`);
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    throw new Error('Failed to parse response');
  }
				
  // console.log(data);
  Promise.resolve(context.globalState.update(AccessToken, data.token)).catch(console.warn);
  return data.token;
}

const jwtKey = jose.importSPKI(JWTPublicKeySPKI, 'ES256');
jwtKey.catch();
export async function verifyToken(accessToken: string) {
  try {
    const { payload } = await jose.jwtVerify(accessToken, await jwtKey);
    return !!payload;
  } catch {
    return false;
  }
}
