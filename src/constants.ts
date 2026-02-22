export const Ns = 'qwtel';
export const ExtensionId = 'sqlite-viewer';
export const FullExtensionId = `${Ns}.${ExtensionId}`

export const UriScheme = 'sqlite-viewer';

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

export const Title = 'SQLite Viewer';
export const ProcessTitle = 'SQLite Viewer Helper';

export const JWTPublicKeySPKI = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();

export const CopilotChatId = 'github.copilot-chat';

// Default presets for column creation
export const DefaultCheckConstraintPresets: Record<string, string> = {
  "Valid datetime": "datetime(\"{column}\") IS NOT NULL",
  "Valid date": "date(\"{column}\") IS NOT NULL",
  "Valid JSON": "json_valid(\"{column}\")",
  "Valid JSONB": "json_valid(\"{column}\", 0x04)",
  "Positive number": "\"{column}\" > 0",
  "Max length (255)": "length(\"{column}\") <= 255",
  "Email (simple)": "\"{column}\" LIKE '%@%.%'",
  "Enum/In list": "\"{column}\" IN ('value1', 'value2')"
};

export const DefaultForeignKeyClausePresets: string[] = [
  "ON DELETE CASCADE",
  "ON DELETE SET NULL",
  "ON DELETE CASCADE ON UPDATE CASCADE",
  "ON DELETE SET NULL ON UPDATE CASCADE",
  "ON DELETE RESTRICT",
  "ON UPDATE CASCADE",
  "ON UPDATE SET NULL"
];

export const DefaultValueExpressionPresets: Record<string, string> = {
  "Current timestamp": "CURRENT_TIMESTAMP",
  "Current date": "CURRENT_DATE",
  "Unix timestamp": "strftime('%s', 'now')",
  "UUID (random)": "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))",
  "Random positive integer": "abs(random())",
  "Random BLOB (16 bytes)": "randomblob(16)",
  "Empty JSONB object": "jsonb('{}')",
};

/** Default CSS rules for markdown preview (selector → declaration block). Rules using --x-* vars are fixed in the UI. */
export const DefaultMarkdownPreviewStyles: Record<string, string> = {
  "p": "margin:0.6em 0",
  "h1,h2,h3,h4,h5,h6": "margin:0.9em 0 0.45em;line-height:1.25",
  "h1": "font-size:1.25em",
  "h2": "font-size:1.1em",
  "h3": "font-size:1em",
  "h4,h5,h6": "font-size:0.95em",
  "ul,ol": "padding-left:1.5em;margin:0.6em 0",
  "li": "margin:0.25em 0",
  "blockquote": "margin:0.75em 0;padding:0.25em 0 0.25em 0.75em;opacity:0.9",
  "hr": "border:0;margin:1em 0",
  "table": "border-collapse:collapse;display:block;overflow:auto;scrollbar-width:thin",
  "thead th,tbody th,tbody td": "padding:0.25em 0.5em;word-break:normal;overflow-wrap:normal;white-space:normal",
  "code": "padding:0.1em 0.25em;border-radius:3px",
  "pre": "overflow:auto;margin:0.6em 0;padding:0.6em;border-radius:4px;scrollbar-width:thin",
  "pre code": "padding:0;background:none",
  "img": "max-width:100%;height:auto",
};

// Temporarily disabled - see CUSTOM_COLUMN_TYPES.md
// export interface CustomColumnType {
//   value: string;
//   uiAffinity: string;
//   codicon: string;
// }

// Temporarily disabled - see CUSTOM_COLUMN_TYPES.md
// export const DefaultCustomColumnTypes: CustomColumnType[] = [];
