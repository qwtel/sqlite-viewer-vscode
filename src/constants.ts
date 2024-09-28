export const ExtensionId = 'sqlite-viewer';
export const FullExtensionId = `qwtel.${ExtensionId}`

export const ConfigurationSection = 'sqliteViewer';

export const TelemetryConnectionString = "InstrumentationKey=36072a93-f98f-4c93-88c3-8870add45a57;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=5ef71db6-3a49-4597-ad99-b159b2b49125";

export const NestingPattern = "${capture}.${extname}-*";
export const FileNestingPatternsAdded = 'fileNestingPatternsAdded';

export const SyncedKeys = [
  FullExtensionId,
  FileNestingPatternsAdded
];

export const ProcessTitle = 'SQLite Viewer Helper';