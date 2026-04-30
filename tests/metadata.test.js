import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.join(process.cwd(), '.tmp-tests', `metadata-${Date.now()}`);
const ixApps = path.join(root, 'ix-apps');
const configDir = path.join(root, 'config');
const metadataFile = path.join(ixApps, 'metadata.yaml');

process.env.IX_APPS_PATH = ixApps;
process.env.METADATA_FILE = metadataFile;
process.env.CONFIG_DIR = configDir;
process.env.POLL_INTERVAL_SECONDS = '30';

const { upsertMapping } = await import('../server/mappings.js');
const { listApps, reapplyMappings } = await import('../server/metadata.js');

test('lists apps and patches metadata.icon using stored data URI', async () => {
  await fs.mkdir(ixApps, { recursive: true });
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

  const apps = await listApps();
  assert.equal(apps.length, 2);
  assert.equal(apps.find((app) => app.name === 'alphaedge').missingIcon, true);
  assert.equal(apps.find((app) => app.name === 'alphaedge').custom_app, true);

  const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  await upsertMapping('alphaedge', icon, 'upload');
  const result = await reapplyMappings({ reason: 'test' });

  assert.equal(result.changed, true);
  assert.deepEqual(result.patchedApps, ['alphaedge']);

  const patched = await fs.readFile(metadataFile, 'utf8');
  assert.match(patched, /alphaedge:/);
  assert.match(patched, /metadata:/);
  assert.match(patched, /icon: data:image\/png;base64/);

  const secondRun = await reapplyMappings({ reason: 'test-second-run' });
  assert.equal(secondRun.changed, false);

  const backups = await fs.readdir(path.join(configDir, 'backups'));
  assert.equal(backups.length, 1);
});
