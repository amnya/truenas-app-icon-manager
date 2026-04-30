import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { log, readLogs } from './logger.js';
import { deleteMapping, ensureConfigDirs, readMappings, upsertMapping } from './mappings.js';
import { fetchIconToDataUri, fileToDataUri, validateDataUri, validateIconUrl } from './icons.js';
import { findDashboardIconSuggestions, isDashboardIconUrl } from './dashboard-icons.js';
import { getMetadataStatus, listApps, readMetadata, reapplyMappings, startMetadataPoller } from './metadata.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxIconSizeBytes }
});

const app = express();
app.use(express.json({ limit: '700kb' }));

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  await readMetadata();
  res.json({
    ok: true,
    service: 'TrueNAS App Icon Manager',
    metadataFile: config.metadataFile,
    configDir: config.configDir,
    pollIntervalSeconds: config.pollIntervalSeconds
  });
}));

app.get('/api/apps', asyncHandler(async (_req, res) => {
  res.json({ apps: await listApps() });
}));

app.get('/api/mappings', asyncHandler(async (_req, res) => {
  res.json({ mappings: await readMappings() });
}));

app.get('/api/status', asyncHandler(async (_req, res) => {
  res.json({ metadata: getMetadataStatus() });
}));

app.get('/api/icon-suggestions/:appName', asyncHandler(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 5;
  const suggestions = await findDashboardIconSuggestions({
    appName: req.params.appName,
    title: req.query.title,
    query: req.query.query,
    limit: Math.min(Math.max(limit, 1), 10)
  });
  res.json({ suggestions });
}));

app.post('/api/icon-suggestions/:appName/use', asyncHandler(async (req, res) => {
  const { appName } = req.params;
  const { url, slug } = req.body || {};

  if (!url || !isDashboardIconUrl(url)) {
    throw badRequest('Icon suggestion URL must come from Dashboard Icons');
  }

  const finalIcon = await fetchIconToDataUri(url);
  const mapping = await upsertMapping(appName, finalIcon, 'dashboard-icons');
  const result = await reapplyMappings({ reason: `Dashboard Icons suggestion saved for ${appName}`, debounceMs: 500 });
  await log('info', 'Saved Dashboard Icons suggestion', { appName, slug, url });
  res.json({ mapping, reapply: result });
}));

app.post('/api/mappings/:appName', upload.single('iconFile'), asyncHandler(async (req, res) => {
  const { appName } = req.params;
  const { icon, iconUrl } = req.body;

  let finalIcon;
  let source;

  if (req.file) {
    finalIcon = fileToDataUri(req.file);
    source = 'upload';
  } else if (iconUrl) {
    finalIcon = validateIconUrl(iconUrl);
    source = 'url';
  } else if (icon) {
    finalIcon = validateDataUri(icon);
    source = 'data-uri';
  } else {
    res.status(400).json({ error: 'Provide iconFile, iconUrl, or icon data URI' });
    return;
  }

  const mapping = await upsertMapping(appName, finalIcon, source);
  const result = await reapplyMappings({ reason: `mapping saved for ${appName}`, debounceMs: 500 });
  await log('info', 'Saved icon mapping', { appName, source });
  res.json({ mapping, reapply: result });
}));

app.delete('/api/mappings/:appName', asyncHandler(async (req, res) => {
  const existed = await deleteMapping(req.params.appName);
  await log('info', 'Removed icon mapping', { appName: req.params.appName, existed });
  res.json({ ok: true, existed });
}));

app.post('/api/reapply', asyncHandler(async (_req, res) => {
  res.json(await reapplyMappings({ reason: 'manual button', debounceMs: 0 }));
}));

app.get('/api/logs', asyncHandler(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 200;
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const page = await readLogs(limit, offset);
  res.json({ logs: page.entries, total: page.total, limit: page.limit, offset: page.offset, hasMore: page.hasMore });
}));

app.use((error, _req, res, _next) => {
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.statusCode || 500;
  log('error', 'Request failed', { error: error.message, status });
  res.status(status).json({ error: error.message });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

try {
  await fs.access(distDir);
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} catch {
  app.get('/', (_req, res) => {
    res.type('text/plain').send('TrueNAS App Icon Manager API is running. Build the frontend with npm run build.');
  });
}

await ensureConfigDirs();
await log('info', 'Starting TrueNAS App Icon Manager', {
  metadataFile: config.metadataFile,
  configDir: config.configDir
});

reapplyMappings({ reason: 'startup', debounceMs: 0 }).catch((error) => {
  log('error', 'Startup metadata reapply failed', { error: error.message });
});
startMetadataPoller();

app.listen(config.port, '0.0.0.0', () => {
  log('info', 'HTTP server listening', { port: config.port });
});
