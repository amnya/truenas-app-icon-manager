const ICON_REPOSITORY_BASE = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const TREE_URL = `${ICON_REPOSITORY_BASE}/tree.json`;
const FORMATS = ['png', 'webp', 'svg'];
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache = {
  loadedAt: 0,
  icons: []
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, '-');
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function collectFiles(value, files = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectFiles(item, files);
    return files;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectFiles(key, files);
      collectFiles(child, files);
    }
    return files;
  }

  if (typeof value === 'string' && /\.(svg|png|webp)$/i.test(value)) {
    files.push(value);
  }

  return files;
}

function parseIconFiles(tree) {
  const icons = new Map();
  const files = collectFiles(tree);

  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/').replace(/^\/+/, '');
    const match = normalizedFile.match(/(?:^|\/)(svg|png|webp)\/([^/]+)\.(svg|png|webp)$/i) || normalizedFile.match(/^([^/]+)\.(svg|png|webp)$/i);
    if (!match) continue;

    const format = match.length === 4 ? match[1].toLowerCase() : match[2].toLowerCase();
    const filename = match.length === 4 ? match[2] : match[1];
    const slug = filename.toLowerCase();
    const existing = icons.get(slug) || { slug, name: filename.replace(/-/g, ' '), formats: new Set() };
    existing.formats.add(format);
    icons.set(slug, existing);
  }

  return Array.from(icons.values()).map((icon) => ({
    slug: icon.slug,
    name: icon.name,
    formats: Array.from(icon.formats)
  }));
}

async function fetchIconCatalog() {
  if (cache.icons.length > 0 && Date.now() - cache.loadedAt < CACHE_MS) {
    return cache.icons;
  }

  const response = await fetch(TREE_URL, {
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Dashboard Icons catalog request failed: ${response.status}`);
  }

  const tree = await response.json();
  const icons = parseIconFiles(tree);
  cache = { loadedAt: Date.now(), icons };
  return icons;
}

function scoreIcon(icon, query) {
  const querySlug = slugify(query);
  const queryTokens = tokens(query);
  const iconSlug = icon.slug;
  const iconTokens = tokens(icon.slug);

  let score = 0;
  if (iconSlug === querySlug) score += 100;
  if (iconSlug.replace(/-(dark|light)$/i, '') === querySlug) score += 90;
  if (iconSlug.startsWith(querySlug)) score += 50;
  if (iconSlug.includes(querySlug)) score += 35;

  for (const token of queryTokens) {
    if (iconTokens.includes(token)) score += 12;
    else if (iconSlug.includes(token)) score += 6;
  }

  if (score === 0) return 0;
  if (iconSlug.endsWith('-dark') || iconSlug.endsWith('-light')) score -= 6;
  if (icon.formats.includes('svg')) score += 3;
  return score;
}

function preferredFormat(icon) {
  return FORMATS.find((format) => icon.formats.includes(format)) || icon.formats[0];
}

function iconUrl(icon, format = preferredFormat(icon)) {
  return `${ICON_REPOSITORY_BASE}/${format}/${icon.slug}.${format}`;
}

export async function findDashboardIconSuggestions({ appName, title, query, limit = 5 }) {
  const catalog = await fetchIconCatalog();
  const queries = query ? [query] : Array.from(new Set([title, appName].filter(Boolean)));
  const scored = new Map();

  for (const icon of catalog) {
    const score = Math.max(...queries.map((query) => scoreIcon(icon, query)));
    if (score <= 0) continue;
    const format = preferredFormat(icon);
    scored.set(icon.slug, {
      name: icon.name,
      slug: icon.slug,
      format,
      formats: icon.formats,
      score,
      source: 'dashboardicons.com',
      url: iconUrl(icon, format),
      previewUrl: iconUrl(icon, format),
      pageUrl: `https://dashboardicons.com/icons/${icon.slug.replace(/-(dark|light)$/i, '')}`
    });
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

export function isDashboardIconUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/gh/homarr-labs/dashboard-icons/');
  } catch {
    return false;
  }
}
