import * as vscode from 'vscode';
import { fetch } from './webFetch';
// import * as jose from 'jose';

const GITHUB_AUTH_PROVIDER_ID = 'github';

const extensionId = 'qwtel.sqlite-viewer'

/** 
 * The GitHub Authentication Provider accepts the scopes described here:
 * https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
 */
const SCOPES = ['user:email', 'read:org'];

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();
const alg = 'ES256'
async function checkExpiration(token: string) {
	// const { payload } = await jose.jwtVerify(token, await jose.importSPKI(JWT_PUBLIC_KEY, alg))
	// const exp = payload.exp!;
	// const currentTime = Date.now() / 1000; // Convert to seconds
	// const diffSeconds = exp - currentTime;
	// const diffDays = diffSeconds / (24 * 60 * 60);
	// return diffDays > 29;
	return true;
}

const BASE_URL = 'https://alpha.sqliteviewer.app';
// const BASE_URL = 'http://localhost:8788';

const timeout = (n: number) => {
	const ctrl = new AbortController();
	setTimeout(() => ctrl.abort(), n);
	return ctrl;
}

export class Credentials {
	#token: Promise<string | undefined>;

	constructor(context: vscode.ExtensionContext) {
		this.registerListeners(context);
		this.#token = this.setToken(context);
	}

	get token() { return this.#token }

	private async setToken(context: vscode.ExtensionContext) {
		try {
			/**
			 * By passing the `createIfNone` flag, a numbered badge will show up on the accounts activity bar icon.
			 * An entry for the sample extension will be added under the menu to sign in. This allows quietly 
			 * prompting the user to sign in.
			 * */
			const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: false });
			if (session) {
				const { account, accessToken } = session;
				const previousToken = context.globalState.get<string>(`${extensionId}/tokens/${account.id}`);
				try {
					if (previousToken && await checkExpiration(previousToken)) {
						return previousToken;
					} else {
						const response = await fetch(new URL('/sponsors/check', BASE_URL), {
							headers: [['Authorization', `Bearer ${accessToken}`]],
							signal: timeout(5000).signal,
							mode: 'cors',
						});
						if (response.ok) {
							const { token } = await response.json() as { token: string };
							context.globalState.update(`${extensionId}/tokens/${account.id}`, token);
							return token;
						}
						/* fallthrough */
					}
				} catch (err) {
					console.warn(err);
					/* fallthrough */
				}
				return previousToken;
			}
		} catch (err) {
			console.warn(err);
		}
	}

	registerListeners(context: vscode.ExtensionContext): void {
		/**
		 * Sessions are changed when a user logs in or logs out.
		 */
		context.subscriptions.push(vscode.authentication.onDidChangeSessions(async ev => {
			if (ev.provider.id === GITHUB_AUTH_PROVIDER_ID) {
				this.#token = this.setToken(context);
			}
		}));
	}
}
