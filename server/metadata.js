import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { config, paths } from './config.js';
import { log } from './logger.js';
import { ensureConfigDirs, readMappings } from './mappings.js';

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

async function readMetadataRaw() {
  return fs.readFile(config.metadataFile, 'utf8');
}

export async function readMetadata() {
  const raw = await readMetadataRaw();
  try {
    const parsed = yaml.load(raw, { json: false });
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('metadata.yaml must contain a top-level mapping');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Unable to parse TrueNAS generated metadata YAML: ${error.message}`);
  }
}

export async function listApps() {
  const metadata = await readMetadata();
  const mappings = await readMappings();

  return Object.entries(metadata)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([name, app]) => {
      const appMetadata = app.metadata && typeof app.metadata === 'object' ? app.metadata : {};
      const icon = appMetadata.icon || '';
      const title = app.title || appMetadata.title || app.name || name;
      const customApp = Boolean(app.custom_app ?? appMetadata.custom_app ?? false);
      const managed = Object.prototype.hasOwnProperty.call(mappings, name);

      return {
        name,
        title,
        custom_app: customApp,
        icon,
        missingIcon: !icon,
        managed,
        desiredIcon: managed ? mappings[name].icon : null,
        mappingUpdatedAt: managed ? mappings[name].updatedAt : null
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function applyMappings(metadata, mappings) {
  const patched = [];

  for (const [appName, mapping] of Object.entries(mappings)) {
    if (!mapping || typeof mapping.icon !== 'string' || mapping.icon.length === 0) continue;
    const app = metadata[appName];
    if (!app || typeof app !== 'object' || Array.isArray(app)) continue;

    if (!app.metadata || typeof app.metadata !== 'object' || Array.isArray(app.metadata)) {
      app.metadata = {};
    }

    if (app.metadata.icon !== mapping.icon) {
      app.metadata.icon = mapping.icon;
      patched.push(appName);
    }
  }

  return patched;
}

async function writeMetadataAtomically(metadata) {
  await ensureConfigDirs();

  const originalRaw = await readMetadataRaw();
  const backupPath = path.join(paths.backupsDir, `metadata.yaml.${timestamp()}.bak`);
  await fs.writeFile(backupPath, originalRaw, { encoding: 'utf8', mode: 0o600 });

  const output = yaml.dump(metadata, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false
  });

  try {
    yaml.load(output);
  } catch (error) {
    throw new Error(`Generated YAML failed validation: ${error.message}`);
  }

  const targetDir = path.dirname(config.metadataFile);
  const tempPath = path.join(targetDir, `.metadata.yaml.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tempPath, output, { encoding: 'utf8', mode: 0o600 });

  try {
    const tempRaw = await fs.readFile(tempPath, 'utf8');
    yaml.load(tempRaw);
    await fs.rename(tempPath, config.metadataFile);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return backupPath;
}

let pendingReapply = null;
let lastWriteAt = 0;
const metadataStatus = {
  lastCheckedAt: null,
  lastChangedAt: null,
  lastReason: null,
  lastResult: 'not_checked',
  lastPatchedApps: [],
  lastBackupPath: null,
  lastError: null
};

function updateMetadataStatus({ reason, result, patchedApps = [], backupPath = null, error = null }) {
  const now = new Date().toISOString();
  metadataStatus.lastCheckedAt = now;
  metadataStatus.lastReason = reason;
  metadataStatus.lastResult = result;
  metadataStatus.lastPatchedApps = patchedApps;
  metadataStatus.lastBackupPath = backupPath;
  metadataStatus.lastError = error;

  if (result === 'changed') {
    metadataStatus.lastChangedAt = now;
  }
}

export function getMetadataStatus() {
  return { ...metadataStatus };
}

export async function reapplyMappings({ reason = 'manual', debounceMs = 0 } = {}) {
  if (pendingReapply) return pendingReapply;

  pendingReapply = (async () => {
    try {
      const elapsed = Date.now() - lastWriteAt;
      if (debounceMs > 0 && elapsed < debounceMs) {
        await new Promise((resolve) => setTimeout(resolve, debounceMs - elapsed));
      }

      const mappings = await readMappings();
      const metadata = await readMetadata();
      const patchedApps = applyMappings(metadata, mappings);

      if (patchedApps.length === 0) {
        updateMetadataStatus({ reason, result: 'no_change' });
        if (reason !== 'poller') {
          await log('info', 'No metadata patch needed', { reason });
        }
        return { changed: false, patchedApps: [], backupPath: null };
      }

      const backupPath = await writeMetadataAtomically(metadata);
      lastWriteAt = Date.now();
      updateMetadataStatus({ reason, result: 'changed', patchedApps, backupPath });
      await log('info', 'Patched TrueNAS generated metadata YAML', {
        reason,
        patchedApps,
        backupPath
      });

      return { changed: true, patchedApps, backupPath };
    } catch (error) {
      updateMetadataStatus({ reason, result: 'error', error: error.message });
      throw error;
    }
  })();

  try {
    return await pendingReapply;
  } finally {
    pendingReapply = null;
  }
}

export function startMetadataPoller() {
  const intervalMs = config.pollIntervalSeconds * 1000;
  const run = () => {
    reapplyMappings({ reason: 'poller', debounceMs: 1500 }).catch((error) => {
      log('error', 'Background metadata reapply failed', { error: error.message });
    });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
