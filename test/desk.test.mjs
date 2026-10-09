// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createDeskHandler, BODY_LIMIT } from '../lib/desk.mjs';
import { loadConfig, STAMP } from '../lib/runtime.mjs';
import { fixture } from './helpers.mjs';
const host = '127.0.0.1:4179', token = 'a'.repeat(64);
async function harness(t, demo = false) {
  const { db, dir } = fixture(t);
  const config = await loadConfig(dir, { env: {}, notice() {} });
  return createDeskHandler({ config, db, actor: 'agent:builder', token, demo, notice() {} });
}
async function call(handler, { method = 'GET', url = '/', headers = {}, body = '', remoteAddress = '127.0.0.1', chunks } = {}) {
  const req = Readable.from(chunks || [Buffer.from(body)]);
  Object.assign(req, { method, url, headers: { host, ...headers }, socket: { remoteAddress } });
  const res = { status: 200, headers: {}, body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    writeHead(status, headers = {}) { this.status = status; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); },
    end(body = '') { this.body = String(body); },
  };
  await handler(req, res);
  return res;
}
const post = { method: 'POST', url: '/api/submit', headers: { origin: 'http://' + host, 'x-catalog-token': token, 'content-type': 'application/json' },
  body: JSON.stringify({ itemId: 'report-an-issue', variables: { title: 'Restore guide download' } }) };
test('desk requires local remote address and an exact Host on every route', async t => {
  const handler = await harness(t);
  for (const bad of ['evil.example.com', '127.0.0.1', 'localhost:4180', '127.0.0.1:4179.evil.example.com', '', undefined]) {
    assert.equal((await call(handler, { headers: { host: bad } })).status, 403);
  }
  assert.equal((await call(handler, { remoteAddress: '192.0.2.1' })).status, 403);
  assert.equal((await call(handler, { headers: { host: 'localhost:4179' } })).status, 200);
});
test('POST requires both a per-process token and exact same-origin Origin', async t => {
  const handler = await harness(t);
  for (const origin of [undefined, '', 'null', 'https://' + host, 'http://localhost:4179', 'http://evil.example.com']) {
    assert.equal((await call(handler, { ...post, headers: { ...post.headers, origin } })).status, 403);
  }
  for (const value of [undefined, '', 'wrong', 'b'.repeat(64)]) {
    assert.equal((await call(handler, { ...post, headers: { ...post.headers, 'x-catalog-token': value } })).status, 403);
  }
});
test('desk uses shared submission flow and preserves actor, audit and captured reference', async t => {
  const handler = await harness(t);
  const result = await call(handler, post);
  assert.equal(result.status, 200, result.body);
  const row = JSON.parse(result.body);
  assert.equal(row.state, 'fulfilled');
  assert.match(row.created_ref, /^JTS-TICKET-[A-F0-9]{12}$/);
  assert.equal(row.submitted_by, 'agent:builder');
  assert.equal(row.events.length, 2);
  const data = JSON.parse((await call(handler, { url: '/api/data' })).body);
  assert.equal(data.requests.length, 1);
  assert.match(data.sourceMessage, /disabled/);
  const detail = JSON.parse((await call(handler, { url: '/api/request?number=REQ0001' })).body);
  assert.equal(detail.events.length, 2);
});
test('body limit counts bytes for announced, chunked and multibyte bodies', async t => {
  const handler = await harness(t);
  assert.equal((await call(handler, { ...post, headers: { ...post.headers, 'content-length': BODY_LIMIT + 1 } })).status, 413);
  assert.equal((await call(handler, { ...post, chunks: [Buffer.alloc(BODY_LIMIT), Buffer.from('x')] })).status, 413);
  assert.equal((await call(handler, { ...post, body: 'é'.repeat(BODY_LIMIT / 2 + 1) })).status, 413);
  assert.equal((await call(handler, { ...post, body: 'invalid' })).status, 400);
  assert.equal((await call(handler, { ...post, body: '[]' })).status, 400);
  assert.equal((await call(handler, { ...post, headers: { ...post.headers, 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call(handler, { ...post, body: JSON.stringify({ itemId: 'report-an-issue', variables: {} }) })).status, 400);
});
test('all desk responses carry security headers and scripts/styles are external', async t => {
  const handler = await harness(t, true);
  for (const url of ['/', '/desk.js', '/desk.css', '/api/data', '/api/health', '/missing']) {
    const res = await call(handler, { url });
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.doesNotMatch(res.headers['content-security-policy'], /unsafe-inline/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'same-origin');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  }
  const page = (await call(handler)).body;
  assert.match(page, /Avalanche Service Catalog/);
  assert.ok(page.includes(STAMP));
  assert.match(page, /DEMO/);
  assert.doesNotMatch(page, / on(?:click|submit|load)=|<script>/);
  assert.match(page, /src="\/desk.js"/);
  assert.match(page, /content="a{64}"/);
});
