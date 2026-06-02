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
  ].join('') + '-' + String(now.getMilliseconds()).padStart(3, '0');
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

function normalizePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function normalizeProtocol(value) {
  const protocol = String(value || 'tcp').toLowerCase();
  return ['tcp', 'udp'].includes(protocol) ? protocol : 'tcp';
}

function firstPortFromKeys(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const port = normalizePort(object[key]);
      if (port) return port;
    }
  }
  return null;
}

function parsePortString(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const protocol = normalizeProtocol(text.match(/\/(tcp|udp)$/i)?.[1] || text.match(/^(tcp|udp):\/\//i)?.[1]);
  const withoutProtocol = text
    .replace(/^(tcp|udp):\/\//i, '')
    .replace(/\/(tcp|udp)$/i, '');
  const parts = withoutProtocol.split(':').map((part) => part.trim()).filter(Boolean);
  const numbers = parts.map((part) => normalizePort(part)).filter(Boolean);

  if (numbers.length >= 2) {
    return { hostPort: numbers[numbers.length - 2], containerPort: numbers[numbers.length - 1], protocol };
  }

  if (numbers.length === 1) {
    return { hostPort: numbers[0], containerPort: numbers[0], protocol };
  }

  return null;
}

function extractPortMappings(value) {
  const ports = [];
  const seen = new Set();
  const hostKeys = ['host_port', 'hostPort', 'published', 'published_port', 'publishedPort', 'external_port', 'externalPort', 'node_port', 'nodePort'];
  const containerKeys = ['container_port', 'containerPort', 'target', 'targetPort', 'internal_port', 'internalPort', 'port'];
  const portLikeKey = /ports?|port_mappings?|published_ports?/i;

  function add(port) {
    if (!port?.hostPort) return;
    const normalized = {
      hostPort: port.hostPort,
      containerPort: port.containerPort || port.hostPort,
      protocol: normalizeProtocol(port.protocol)
    };
    const key = `${normalized.protocol}:${normalized.hostPort}:${normalized.containerPort}`;
    if (seen.has(key)) return;
    seen.add(key);
    ports.push(normalized);
  }

  function walk(node, key = '') {
    if (!node) return;

    if (typeof node === 'string') {
      if (portLikeKey.test(key)) add(parsePortString(node));
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, key));
      return;
    }

    if (typeof node !== 'object') return;

    const hostPort = firstPortFromKeys(node, hostKeys);
    if (hostPort) {
      add({
        hostPort,
        containerPort: firstPortFromKeys(node, containerKeys) || hostPort,
        protocol: node.protocol || node.proto || node.mode
      });
    }

    for (const [childKey, childValue] of Object.entries(node)) {
      walk(childValue, childKey);
    }
  }

  walk(value);
  return ports.slice(0, 12);
}

async function findYamlFiles(rootDir, { maxDepth = 6, maxFiles = 40 } = {}) {
  const files = [];

  async function walk(currentDir, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return;

    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
      } else if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  await walk(rootDir, 0);
  return files;
}

async function extractAppConfigPorts(appName) {
  const appConfigsRoot = path.resolve(config.ixAppsPath, 'app_configs');
  const appConfigDir = path.resolve(appConfigsRoot, appName);
  const rootWithSeparator = `${appConfigsRoot}${path.sep}`;

  if (appConfigDir !== appConfigsRoot && !appConfigDir.startsWith(rootWithSeparator)) {
    return [];
  }

  const yamlFiles = await findYamlFiles(appConfigDir);
  const ports = [];
  const seen = new Set();

  for (const yamlFile of yamlFiles) {
    const stat = await fs.stat(yamlFile).catch(() => null);
    if (!stat || stat.size > 512 * 1024) continue;

    const raw = await fs.readFile(yamlFile, 'utf8').catch(() => '');
    if (!raw) continue;

    let parsed;
    try {
      parsed = yaml.load(raw, { json: false });
    } catch {
      continue;
    }

    for (const port of extractPortMappings(parsed)) {
      const key = `${port.protocol}:${port.hostPort}:${port.containerPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ports.push(port);
    }
  }

  return ports.slice(0, 12);
}

export async function listApps({ includePorts = false } = {}) {
  const metadata = await readMetadata();
  const mappings = await readMappings();

  const apps = await Promise.all(Object.entries(metadata)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(async ([name, app]) => {
      const appMetadata = app.metadata && typeof app.metadata === 'object' ? app.metadata : {};
      const portals = app.portals && typeof app.portals === 'object' && !Array.isArray(app.portals) ? app.portals : {};
      const mapping = mappings[name] || {};
      const icon = appMetadata.icon || '';
      const portalUrl = typeof portals['Web UI'] === 'string' ? portals['Web UI'] : '';
      const title = app.title || appMetadata.title || app.name || name;
      const customApp = Boolean(app.custom_app ?? appMetadata.custom_app ?? false);
      const iconManaged = typeof mapping.icon === 'string' && mapping.icon.length > 0;
      const portalManaged = Boolean(mapping.portal?.url);
      const managed = iconManaged || portalManaged;
      const metadataPorts = includePorts && customApp ? extractPortMappings(app) : [];
      const ports = includePorts && customApp && metadataPorts.length === 0 ? await extractAppConfigPorts(name) : metadataPorts;

      return {
        name,
        title,
        custom_app: customApp,
        icon,
        ports,
        portalUrl,
        missingIcon: !icon,
        managed,
        iconManaged,
        portalManaged,
        desiredIcon: iconManaged ? mapping.icon : null,
        desiredPortalUrl: portalManaged ? mapping.portal.url : null,
        mappingUpdatedAt: iconManaged ? mapping.updatedAt : null,
        portalUpdatedAt: portalManaged ? mapping.portalUpdatedAt : null
      };
    }));

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

function applyMappings(metadata, mappings) {
  const patched = new Set();

  for (const [appName, mapping] of Object.entries(mappings)) {
    if (!mapping || typeof mapping !== 'object') continue;
    const app = metadata[appName];
    if (!app || typeof app !== 'object' || Array.isArray(app)) continue;

    if (typeof mapping.icon === 'string' && mapping.icon.length > 0) {
      if (!app.metadata || typeof app.metadata !== 'object' || Array.isArray(app.metadata)) {
        app.metadata = {};
      }

      if (app.metadata.icon !== mapping.icon) {
        app.metadata.icon = mapping.icon;
        patched.add(appName);
      }
    }

    if (typeof mapping.portal?.url === 'string' && mapping.portal.url.length > 0) {
      if (!app.portals || typeof app.portals !== 'object' || Array.isArray(app.portals)) {
        app.portals = {};
      }

      if (app.portals['Web UI'] !== mapping.portal.url) {
        app.portals['Web UI'] = mapping.portal.url;
        patched.add(appName);
      }
    }
  }

  return [...patched];
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

async function pruneOldBackups() {
  const retentionCount = config.backupRetentionCount;
  if (retentionCount <= 0) return;

  const entries = await fs.readdir(paths.backupsDir, { withFileTypes: true }).catch(() => []);
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^metadata\.yaml\.\d{8}-\d{6}(?:-\d{3})?\.bak$/.test(entry.name))
      .map(async (entry) => {
        const backupPath = path.join(paths.backupsDir, entry.name);
        const stat = await fs.stat(backupPath);
        return { path: backupPath, mtimeMs: stat.mtimeMs };
      })
  );

  backups
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(retentionCount)
    .forEach((backup) => {
      fs.rm(backup.path, { force: true }).catch(() => {});
    });
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
      await pruneOldBackups();
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
