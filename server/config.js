import path from 'node:path';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  ixAppsPath: process.env.IX_APPS_PATH || '/ix-apps',
  metadataFile: process.env.METADATA_FILE || '/ix-apps/metadata.yaml',
  configDir: process.env.CONFIG_DIR || '/config',
  pollIntervalSeconds: toInt(process.env.POLL_INTERVAL_SECONDS, 30),
  maxIconSizeBytes: toInt(process.env.MAX_ICON_SIZE_BYTES, 524288),
  port: toInt(process.env.PORT, 8080)
};

export const paths = {
  mappingsFile: path.join(config.configDir, 'icon-mappings.json'),
  backupsDir: path.join(config.configDir, 'backups'),
  logsFile: path.join(config.configDir, 'icon-manager.log')
};
