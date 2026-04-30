import test from 'node:test';
import assert from 'node:assert/strict';

const { validateIconUrl } = await import('../server/icons.js');

test('accepts http and https icon URLs', () => {
  assert.equal(validateIconUrl('https://example.com/icon.png'), 'https://example.com/icon.png');
  assert.equal(validateIconUrl('http://example.com/icon.png'), 'http://example.com/icon.png');
});

test('rejects malformed and non-http icon URLs as bad requests', () => {
  assert.throws(
    () => validateIconUrl('not a url'),
    (error) => error.statusCode === 400 && error.message === 'Icon URL must be a valid URL'
  );

  assert.throws(
    () => validateIconUrl('file:///tmp/icon.png'),
    (error) => error.statusCode === 400 && error.message === 'Icon URL must use http or https'
  );
});
