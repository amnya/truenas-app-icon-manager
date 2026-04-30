import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Check, Coffee, ExternalLink, Github, Heart, ImagePlus, Moon, RefreshCw, Search, Sparkles, Sun, Trash2, Upload } from 'lucide-react';
import packageJson from '../../package.json';
import './styles.css';

const appVersion = packageJson.version;
const filters = [
  { id: 'all', label: 'All apps' },
  { id: 'missing', label: 'Missing icons' },
  { id: 'custom', label: 'Custom apps' }
];
const logLimit = 6;

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function Badge({ children, tone = 'neutral' }) {
  const classes = {
    neutral: 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    good: 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    managed: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200'
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classes[tone]}`}>{children}</span>;
}

function IconPreview({ src, title }) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900">
      {src ? (
        <img src={src} alt={`${title} icon`} className="h-full w-full object-contain p-1" />
      ) : (
        <ImagePlus className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      )}
    </div>
  );
}

function defaultIconSearchTerm(app) {
  const title = String(app.title || '').trim();
  if (app.custom_app && title.toLowerCase() === 'custom app') return app.name;
  return title || app.name;
}

function SuggestedIcon({ app, onUsed }) {
  const defaultQuery = defaultIconSearchTerm(app);
  const [searchTerm, setSearchTerm] = useState(defaultQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usingSlug, setUsingSlug] = useState('');
  const [error, setError] = useState('');

  async function fetchSuggestions() {
    const query = searchTerm.trim();
    if (!query) {
      setError('Enter a search term first.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ title: defaultQuery, query, limit: '6' });
      const body = await api(`/api/icon-suggestions/${encodeURIComponent(app.name)}?${params.toString()}`);
      setSuggestions(body.suggestions || []);
      if (!body.suggestions?.length) setError(`No Dashboard Icons match for "${query}".`);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSearchTerm(defaultQuery);
    setSuggestions([]);
    setError('');
  }, [app.name, app.title]);

  async function useSuggestion(suggestion) {
    setUsingSlug(suggestion.slug);
    setError('');
    try {
      await api(`/api/icon-suggestions/${encodeURIComponent(app.name)}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: suggestion.url, slug: suggestion.slug })
      });
      await onUsed();
    } catch (useError) {
      setError(useError.message);
    } finally {
      setUsingSlug('');
    }
  }

  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/40">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-ocean" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">Suggested icon</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">Search Dashboard Icons by app name, title, or your own term.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') fetchSuggestions();
              }}
              placeholder="Try Gotify, Plex, Jellyfin..."
              className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-ocean focus:ring-2 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-teal-950"
            />
          </div>
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-ocean hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 dark:text-teal-300 dark:hover:bg-slate-900"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {loading ? 'Searching' : 'Search'}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((suggestion) => (
              <div key={suggestion.slug} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 items-center gap-2">
                  <IconPreview src={suggestion.previewUrl} title={suggestion.slug} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink dark:text-slate-100">{suggestion.slug}</p>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{suggestion.format}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => useSuggestion(suggestion)}
                  disabled={Boolean(usingSlug)}
                  className="inline-flex items-center gap-2 rounded-lg bg-ocean px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-600"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {usingSlug === suggestion.slug ? 'Using' : 'Use'}
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
        {!loading && suggestions.length === 0 && !error && <p className="text-xs text-slate-500 dark:text-slate-400">Requires this container to reach dashboardicons.com/jsDelivr.</p>}
      </div>
    </div>
  );
}
function AppEditor({ app, onSaved, onRemoved }) {
  const [mode, setMode] = useState('file');
  const [textValue, setTextValue] = useState(app.desiredIcon || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(app.desiredIcon || app.icon || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTextValue(app.desiredIcon || '');
    setPreview(app.desiredIcon || app.icon || '');
    setFile(null);
    setError('');
  }, [app.name, app.desiredIcon, app.icon]);

  function handleFile(nextFile) {
    setError('');
    setFile(nextFile || null);
    if (!nextFile) return;

    if (nextFile.size > 524288) {
      setError('Icon file is larger than 512 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(nextFile);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      if (mode === 'file') {
        if (!file) throw new Error('Choose an icon file first.');
        form.append('iconFile', file);
      } else if (mode === 'url') {
        form.append('iconUrl', textValue.trim());
      } else {
        form.append('icon', textValue.trim());
      }

      await api(`/api/mappings/${encodeURIComponent(app.name)}`, {
        method: 'POST',
        body: form
      });
      await onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/mappings/${encodeURIComponent(app.name)}`, { method: 'DELETE' });
      await onRemoved();
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <SuggestedIcon app={app} onUsed={onSaved} />
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-1">
            {[
              ['file', 'Upload'],
              ['url', 'URL'],
              ['data', 'Base64 data URI']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-md px-3 py-2 text-sm font-medium ${mode === id ? 'bg-ink text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'file' ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white px-4 py-4 text-sm dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:border-ocean">
              <Upload className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">{file ? file.name : 'Choose PNG, SVG, JPEG, or WebP up to 512 KB'}</span>
              <input
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </label>
          ) : (
            <textarea
              value={textValue}
              onChange={(event) => {
                setTextValue(event.target.value);
                setPreview(event.target.value.trim());
              }}
              rows={4}
              className="w-full rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:border-ocean focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950 dark:text-slate-100"
              placeholder={mode === 'url' ? 'https://example.com/icon.png' : 'data:image/png;base64,iVBORw0KGgo...'}
            />
          )}

          {error && <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
        </div>

        <div className="flex items-end justify-between gap-3 lg:flex-col lg:items-stretch">
          <div className="flex items-center gap-3 lg:justify-end">
            <IconPreview src={preview} title={app.title} />
            <div className="text-xs text-slate-500 dark:text-slate-400 lg:hidden">Preview</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-ocean px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Save
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy || !app.managed}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({ app, refresh }) {
  return (
    <article className="rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <IconPreview src={app.icon || app.desiredIcon} title={app.title} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink dark:text-slate-100">{app.title}</h2>
            <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">{app.name}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {app.missingIcon ? <Badge tone="warn">Missing icon</Badge> : <Badge tone="good">Has icon</Badge>}
              {app.managed && <Badge tone="managed">Managed</Badge>}
              {app.custom_app && <Badge>Custom app</Badge>}
            </div>
          </div>
        </div>
      </div>
      <AppEditor app={app} onSaved={refresh} onRemoved={refresh} />
    </article>
  );
}

function App() {
  const [apps, setApps] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState([]);
  const [logPage, setLogPage] = useState(0);
  const [logMeta, setLogMeta] = useState({ total: 0, hasMore: false });
  const [metadataStatus, setMetadataStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', useDark);
    document.documentElement.style.colorScheme = useDark ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const darkActive = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  function toggleTheme() {
    setTheme(darkActive ? 'light' : 'dark');
  }

  async function fetchLogs(page = logPage) {
    const offset = page * logLimit;
    const logsBody = await api(`/api/logs?limit=${logLimit}&offset=${offset}`);
    setLogs(logsBody.logs);
    setLogMeta({ total: logsBody.total || 0, hasMore: Boolean(logsBody.hasMore) });
  }

  async function refresh() {
    const [appsBody, statusBody] = await Promise.all([
      api('/api/apps'),
      api('/api/status')
    ]);
    setApps(appsBody.apps);
    setMetadataStatus(statusBody.metadata || null);
    await fetchLogs(logPage);
  }

  useEffect(() => {
    refresh()
      .catch((error) => setStatus(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs(logPage).catch((error) => setStatus(error.message));
  }, [logPage]);

  const visibleApps = useMemo(() => {
    return apps.filter((app) => {
      if (filter === 'missing' && !app.missingIcon) return false;
      if (filter === 'custom' && !app.custom_app) return false;
      const haystack = `${app.name} ${app.title}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [apps, filter, query]);

  async function reapply() {
    setStatus('Reapplying saved icon mappings...');
    try {
      const result = await api('/api/reapply', { method: 'POST' });
      setStatus(result.changed ? `Reapplied icons for ${result.patchedApps.join(', ')}` : 'Saved icons are already applied.');
      setLogPage(0);
      await refresh();
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <main className="min-h-screen bg-panel text-ink dark:bg-slate-950 dark:text-slate-100">
      <section className="border-b border-line bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-ocean">TrueNAS SCALE helper</p>
              <h1 className="mt-2 text-3xl font-bold tracking-normal">TrueNAS App Icon Manager</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                aria-label="Toggle dark mode"
              >
                {darkActive ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                {darkActive ? 'Light' : 'Dark'}
              </button>
              <button
                type="button"
                onClick={reapply}
                className="inline-flex w-fit items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reapply now
              </button>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              This app modifies TrueNAS generated metadata YAML at <span className="font-mono">/mnt/.ix-apps/metadata.yaml</span>.
              TrueNAS can overwrite that file during redeploys, edits, updates, or reboot, so saved mappings are reapplied on startup and by the background poller.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-3 shadow-soft md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps"
                className="w-full rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-ocean focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === item.id ? 'bg-ocean text-white' : 'border border-line bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {status && <div className="rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 shadow-soft">{status}</div>}

          {loading ? (
            <div className="rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300 shadow-soft">Loading apps...</div>
          ) : visibleApps.length > 0 ? (
            <div className="space-y-4">
              {visibleApps.map((app) => (
                <AppCard key={app.name} app={app} refresh={refresh} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300 shadow-soft">No apps match the current filters.</div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-soft">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Summary</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Apps</dt>
                <dd className="text-2xl font-bold">{apps.length}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Missing</dt>
                <dd className="text-2xl font-bold">{apps.filter((app) => app.missingIcon).length}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Managed</dt>
                <dd className="text-2xl font-bold">{apps.filter((app) => app.managed).length}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Custom</dt>
                <dd className="text-2xl font-bold">{apps.filter((app) => app.custom_app).length}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Metadata Status</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Last check</dt>
                <dd className="font-medium text-ink dark:text-slate-100">
                  {metadataStatus?.lastCheckedAt ? new Date(metadataStatus.lastCheckedAt).toLocaleString() : 'Not checked yet'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Last result</dt>
                <dd className="font-medium text-ink dark:text-slate-100">
                  {metadataStatus?.lastResult === 'changed' ? 'Metadata patched' : metadataStatus?.lastResult === 'error' ? 'Check failed' : metadataStatus?.lastResult === 'no_change' ? 'No patch needed' : 'Waiting'}
                </dd>
              </div>
              {metadataStatus?.lastChangedAt && (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Last patched</dt>
                  <dd className="font-medium text-ink dark:text-slate-100">{new Date(metadataStatus.lastChangedAt).toLocaleString()}</dd>
                </div>
              )}
              {metadataStatus?.lastError && <p className="text-sm font-medium text-red-700 dark:text-red-300">{metadataStatus.lastError}</p>}
            </dl>
          </div>

          <div className="rounded-lg border border-line bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Patch Log</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">{logMeta.total} entries</span>
            </div>
            <div className="mt-4 space-y-3">
              {logs.length > 0 ? logs.map((entry) => (
                <div key={`${entry.ts}-${entry.message}`} className="border-b border-line pb-3 dark:border-slate-800 last:border-b-0 last:pb-0">
                  <p className="text-sm font-medium text-ink dark:text-slate-100">{entry.message}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(entry.ts).toLocaleString()}</p>
                </div>
              )) : <p className="text-sm text-slate-500 dark:text-slate-400">No log entries yet.</p>}
            </div>
            {(logPage > 0 || logMeta.hasMore) && (
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setLogPage((page) => Math.max(page - 1, 0))}
                  disabled={logPage === 0}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Newer
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">Page {logPage + 1}</span>
                <button
                  type="button"
                  onClick={() => setLogPage((page) => page + 1)}
                  disabled={!logMeta.hasMore}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Older
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Project</h2>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">v{appVersion}</span>
            </div>
            <div className="mt-4 space-y-2">
              {[
                ['GitHub repository', 'https://github.com/amnya/truenas-app-icon-manager', Github],
                ['Sponsor on GitHub', 'https://github.com/sponsors/amnya', Heart],
                ['Support on Ko-fi', 'https://ko-fi.com/amnya', Coffee]
              ].map(([label, href, Icon]) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
