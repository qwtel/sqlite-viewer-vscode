export const Ns = 'qwtel';
export const ExtensionId = 'sqlite-viewer';
export const FullExtensionId = `${Ns}.${ExtensionId}`

export const ConfigurationSection = 'sqliteViewer';

export const TelemetryConnectionString = "InstrumentationKey=36072a93-f98f-4c93-88c3-8870add45a57;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=5ef71db6-3a49-4597-ad99-b159b2b49125";

export const NestingPattern = "${capture}.${extname}-*";
export const FileNestingPatternsAdded = 'fileNestingPatternsAdded';

export const LicenseKey = 'licenseKey';
export const AccessToken = 'accessToken';
export const FistInstallMs = `fistInstallMs`
export const SidebarLeft = 'sidebarLeft';
export const SidebarRight = 'sidebarRight';

export const SyncedKeys = [
  FullExtensionId,
  FileNestingPatternsAdded,
  LicenseKey,
  FistInstallMs,
];

export const ProcessTitle = 'SQLite Viewer Helper';

export const JWTPublicKeySPKI = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();
