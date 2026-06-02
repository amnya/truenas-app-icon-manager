import fs from 'node:fs/promises';
import { paths } from './config.js';

export async function ensureConfigDirs() {
  await fs.mkdir(paths.backupsDir, { recursive: true });
}

export async function readMappings() {
  await ensureConfigDirs();
  try {
    const raw = await fs.readFile(paths.mappingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Unable to read icon mappings: ${error.message}`);
  }
}

export async function writeMappings(mappings) {
  await ensureConfigDirs();
  const temp = `${paths.mappingsFile}.tmp-${process.pid}-${Date.now()}`;
  const body = `${JSON.stringify(mappings, null, 2)}\n`;
  await fs.writeFile(temp, body, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temp, paths.mappingsFile);
}

function pruneEmptyMapping(mappings, appName) {
  const mapping = mappings[appName];
  if (!mapping) return;

  if (!mapping.icon && !mapping.portal) {
    delete mappings[appName];
  }
}

export async function upsertMapping(appName, icon, source = 'manual') {
  const mappings = await readMappings();
  mappings[appName] = {
    ...(mappings[appName] || {}),
    icon,
    source,
    updatedAt: new Date().toISOString()
  };
  await writeMappings(mappings);
  return mappings[appName];
}

export async function upsertPortalMapping(appName, portal, source = 'manual') {
  const mappings = await readMappings();
  mappings[appName] = {
    ...(mappings[appName] || {}),
    portal,
    portalSource: source,
    portalUpdatedAt: new Date().toISOString()
  };
  await writeMappings(mappings);
  return mappings[appName];
}

export async function deleteIconMapping(appName) {
  const mappings = await readMappings();
  const existed = Boolean(mappings[appName]?.icon);
  if (mappings[appName]) {
    delete mappings[appName].icon;
    delete mappings[appName].source;
    delete mappings[appName].updatedAt;
    pruneEmptyMapping(mappings, appName);
  }
  await writeMappings(mappings);
  return existed;
}

export async function deletePortalMapping(appName) {
  const mappings = await readMappings();
  const existed = Boolean(mappings[appName]?.portal);
  if (mappings[appName]) {
    delete mappings[appName].portal;
    delete mappings[appName].portalSource;
    delete mappings[appName].portalUpdatedAt;
    pruneEmptyMapping(mappings, appName);
  }
  await writeMappings(mappings);
  return existed;
}

export async function deleteMapping(appName) {
  const mappings = await readMappings();
  const existed = Object.prototype.hasOwnProperty.call(mappings, appName);
  delete mappings[appName];
  await writeMappings(mappings);
  return existed;
}
