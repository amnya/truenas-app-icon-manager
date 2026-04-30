import fs from 'node:fs/promises';
import { paths } from './config.js';

const entries = [];
const maxEntries = 500;

export async function log(level, message, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    details
  };

  entries.unshift(entry);
  if (entries.length > maxEntries) entries.pop();

  const line = `${JSON.stringify(entry)}\n`;
  if (level === 'error') {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }

  try {
    await fs.mkdir(paths.logsFile.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
    await fs.appendFile(paths.logsFile, line, 'utf8');
  } catch {
    // Logging must never block metadata safety.
  }
}

export async function readLogs(limit = 200, offset = 0) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), maxEntries);
  const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
  return {
    entries: entries.slice(safeOffset, safeOffset + safeLimit),
    total: entries.length,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + safeLimit < entries.length
  };
}
