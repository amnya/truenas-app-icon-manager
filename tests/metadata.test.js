import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const root = path.join(process.cwd(), '.tmp-tests', `metadata-${Date.now()}`);
const ixApps = path.join(root, 'ix-apps');
const appConfigs = path.join(ixApps, 'app_configs');
const configDir = path.join(root, 'config');
const metadataFile = path.join(ixApps, 'metadata.yaml');

process.env.IX_APPS_PATH = ixApps;
process.env.METADATA_FILE = metadataFile;
process.env.CONFIG_DIR = configDir;
process.env.POLL_INTERVAL_SECONDS = '30';

const { upsertMapping, upsertPortalMapping } = await import('../server/mappings.js');
const { listApps, reapplyMappings } = await import('../server/metadata.js');

test('lists apps and patches metadata.icon using stored data URI', async () => {
  await fs.mkdir(ixApps, { recursive: true });
  await fs.mkdir(path.join(appConfigs, 'alphaedge', 'versions', '1.0.0'), { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(metadataFile, [
    '"alphaedge":',
    '  title: AlphaEdge',
    '  custom_app: true',
    '  metadata:',
    '    train: custom',
    'jellyfin:',
    '  title: Jellyfin',
    '  metadata:',
    '    icon: https://example.com/jellyfin.png',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(appConfigs, 'alphaedge', 'versions', '1.0.0', 'docker-compose.yaml'), [
    'services:',
    '  alphaedge:',
    '    ports:',
    '      - target: 8080',
    '        published: 18080',
    '        protocol: tcp',
    '      - "18443:443/tcp"',
    ''
  ].join('\n'));

  const apps = await listApps({ includePorts: true });
  assert.equal(apps.length, 2);
  assert.equal(apps.find((app) => app.name === 'alphaedge').missingIcon, true);
  assert.equal(apps.find((app) => app.name === 'alphaedge').custom_app, true);
  assert.deepEqual(apps.find((app) => app.name === 'alphaedge').ports, [
    { hostPort: 18080, containerPort: 8080, protocol: 'tcp' },
    { hostPort: 18443, containerPort: 443, protocol: 'tcp' }
  ]);

  const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  await upsertMapping('alphaedge', icon, 'upload');
  const result = await reapplyMappings({ reason: 'test' });

  assert.equal(result.changed, true);
  assert.deepEqual(result.patchedApps, ['alphaedge']);

  const patched = await fs.readFile(metadataFile, 'utf8');
  assert.match(patched, /alphaedge:/);
  assert.match(patched, /metadata:/);
  assert.match(patched, /icon: data:image\/png;base64/);

  const portalUrl = 'http://192.168.1.171:8099/';
  await upsertPortalMapping('alphaedge', { label: 'Web UI', url: portalUrl }, 'manual');
  const portalResult = await reapplyMappings({ reason: 'test-portal' });
  assert.equal(portalResult.changed, true);
  assert.deepEqual(portalResult.patchedApps, ['alphaedge']);

  const portalPatched = yaml.load(await fs.readFile(metadataFile, 'utf8'));
  assert.equal(portalPatched.alphaedge.portals['Web UI'], portalUrl);

  const appsAfterPortal = await listApps();
  const alphaedge = appsAfterPortal.find((app) => app.name === 'alphaedge');
  assert.equal(alphaedge.portalUrl, portalUrl);
  assert.equal(alphaedge.desiredPortalUrl, portalUrl);
  assert.equal(alphaedge.portalManaged, true);

  const secondRun = await reapplyMappings({ reason: 'test-second-run' });
  assert.equal(secondRun.changed, false);

  const backups = await fs.readdir(path.join(configDir, 'backups'));
  assert.equal(backups.length, 2);
});
