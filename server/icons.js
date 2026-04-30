import { Buffer } from 'node:buffer';
import { config } from './config.js';

const allowedMimeTypes = new Set([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
  'image/webp'
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function validateIconMime(mimeType) {
  if (!allowedMimeTypes.has(mimeType)) {
    throw validationError(`Unsupported icon MIME type: ${mimeType || 'unknown'}`);
  }
}

export function validateIconSize(size) {
  if (size > config.maxIconSizeBytes) {
    throw validationError(`Icon exceeds maximum size of ${config.maxIconSizeBytes} bytes`);
  }
}

export function validateDataUri(value) {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    throw validationError('Icon must be a data URI when using base64 input');
  }

  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw validationError('Icon data URI must use base64 encoding');
  }

  const [, mimeType, payload] = match;
  validateIconMime(mimeType);
  const bytes = Buffer.from(payload.replace(/\s/g, ''), 'base64');
  validateIconSize(bytes.length);

  if (mimeType === 'image/svg+xml') {
    validateSvg(bytes.toString('utf8'));
  }

  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

export function validateIconUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw validationError('Icon URL must be a valid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw validationError('Icon URL must use http or https');
  }
  return parsed.toString();
}

export function fileToDataUri(file) {
  return bufferToDataUri(file.buffer, file.mimetype);
}

export function bufferToDataUri(buffer, mimeType) {
  validateIconMime(mimeType);
  validateIconSize(buffer.length);

  if (mimeType === 'image/svg+xml') {
    validateSvg(buffer.toString('utf8'));
  }

  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function fetchIconToDataUri(url) {
  const finalUrl = validateIconUrl(url);
  const response = await fetch(finalUrl, {
    headers: { accept: 'image/png,image/svg+xml,image/jpeg,image/webp' }
  });

  if (!response.ok) {
    throw validationError(`Icon download failed: ${response.status}`);
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > config.maxIconSizeBytes) {
    throw validationError(`Icon exceeds maximum size of ${config.maxIconSizeBytes} bytes`);
  }

  const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  validateIconMime(mimeType);

  const buffer = Buffer.from(await response.arrayBuffer());
  return bufferToDataUri(buffer, mimeType);
}

export function validateSvg(svgText) {
  const lowered = svgText.toLowerCase();
  const blockedPatterns = [
    /<script[\s>]/,
    /\son[a-z]+\s*=/,
    /javascript\s*:/,
    /data:text\/html/,
    /<foreignobject[\s>]/
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(lowered)) {
      throw validationError('SVG contains executable or unsafe content');
    }
  }

  if (!/<svg[\s>]/i.test(svgText)) {
    throw validationError('SVG icon must contain an <svg> element');
  }
}
