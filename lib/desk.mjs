// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { listItems, submitRequest } from './catalog.mjs';
import { getRequest, listRequests, openStore } from './store.mjs';
import { readEstate } from './estate.mjs';
import { STAMP } from './runtime.mjs';

export const BODY_LIMIT = 1024 * 1024;
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};
const assets = new Map([
  ['/desk.js', [readFileSync(new URL('../static/desk.js', import.meta.url)), 'text/javascript; charset=utf-8']],
  ['/desk.css', [readFileSync(new URL('../static/desk.css', import.meta.url)), 'text/css; charset=utf-8']],
]);
const page = readFileSync(new URL('../static/desk.html', import.meta.url), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fail = (status, message) => Object.assign(new Error(message), { status });
function sameToken(value, token) {
  return typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
}
export async function readJson(req) {
  if (Number(req.headers['content-length']) > BODY_LIMIT) { req.resume(); throw fail(413, 'request body exceeds 1 MB'); }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > BODY_LIMIT) { req.resume(); throw fail(413, 'request body exceeds 1 MB'); }
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw fail(400, 'invalid JSON body'); }
}
export function createDeskHandler({ config, db, actor, token = randomBytes(32).toString('hex'), demo = false, notice = console.error }) {
  const port = config.desk.port;
  const hosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
  const estate = readEstate(config.sources?.estate, { notice });
  return async (req, res) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    if (req.socket.remoteAddress !== '127.0.0.1' || !hosts.has(req.headers.host)) return json(403, { error: 'local Host required' });
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (url.origin !== 'http://' + req.headers.host) return json(403, { error: 'same-origin URL required' });
      if (req.method === 'POST') {
        if (req.headers.origin !== 'http://' + req.headers.host) return json(403, { error: 'same-origin Origin required' });
        if (!sameToken(req.headers['x-catalog-token'], token)) return json(403, { error: 'bad token; reload the desk' });
        if (url.pathname !== '/api/submit') return json(404, { error: 'not found' });
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(415, { error: 'application/json required' });
        const input = await readJson(req);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'body must be an object');
        const row = await submitRequest(db, input.itemId, input.variables, { settings: config, actor, engineIds: estate.engineIds });
        return json(200, { ...row, stamp: STAMP });
      }
      if (req.method !== 'GET') return json(405, { error: 'method not allowed' });
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(page.replaceAll('__TITLE__', esc(config.desk.title)).replaceAll('__TOKEN__', token)
          .replaceAll('__STAMP__', STAMP).replaceAll('__DEMO__', demo ? '<div class="banner">DEMO — Juniper Trail Studio. All people, businesses and data are synthetic.</div>' : ''));
      }
      if (assets.has(url.pathname)) {
        const [body, type] = assets.get(url.pathname);
        res.writeHead(200, { 'Content-Type': type }); return res.end(body);
      }
      if (url.pathname === '/api/health') return json(200, { ok: true, engine: 'avalanche-service-catalog', stamp: STAMP });
      if (url.pathname === '/api/data') return json(200, {
        items: listItems(config).map(({ producerArgs, ...item }) => item),
        requests: listRequests(db, { limit: 250 }),
        engineIds: estate.engineIds, sourceMessage: estate.message, actor, stamp: STAMP,
      });
      if (url.pathname === '/api/request') return json(200, { ...getRequest(db, url.searchParams.get('number')), stamp: STAMP });
      return json(404, { error: 'not found' });
    } catch (error) {
      const expected = /(?:required|must be|cannot start|unknown variable|no catalog item|no request|unsupported reference|invalid)/.test(error.message);
      return json(error.status || (expected ? 400 : 500), { error: error.message });
    }
  };
}
export async function startDesk({ config, dataDir, actor, demo = false }) {
  const db = openStore(config.db);
  const server = createServer(createDeskHandler({ config, db, actor, demo }));
  server.requestTimeout = 120_000;
  server.headersTimeout = 10_000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.desk.port, '127.0.0.1', resolve);
    });
  } catch (error) { db.close(); throw new Error('Desk could not bind its allocated port: ' + error.message); }
  console.log(config.name + ' desk: http://127.0.0.1:' + config.desk.port + '/');
  console.log('Data directory: ' + dataDir);
  console.log('Actor: ' + actor);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(() => { db.close(); });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('close', () => {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  });
  return server;
}
