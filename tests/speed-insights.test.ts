import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSpeedInsight} from '../web/speed-insights';

test('performance events retain route attribution without repository, run or OAuth context', () => {
  assert.deepEqual(sanitizeSpeedInsight({
    type: 'vital',
    url: 'https://patchgoblin.vercel.app/workbench?repo=private/repo&run=123&code=secret#evidence',
    route: '/workbench?repo=private/repo',
  }), {
    type: 'vital', url: 'https://patchgoblin.vercel.app/workbench', route: '/workbench',
  });
});

test('performance events redact unknown paths and reject malformed URLs', () => {
  assert.deepEqual(sanitizeSpeedInsight({
    type: 'vital', url: 'https://patchgoblin.vercel.app/private/repository?token=secret',
  }), {
    type: 'vital', url: 'https://patchgoblin.vercel.app/not-found', route: '/not-found',
  });
  assert.equal(sanitizeSpeedInsight({type: 'vital', url: 'invalid'}), null);
});
