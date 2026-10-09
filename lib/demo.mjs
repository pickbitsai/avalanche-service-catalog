// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, copyFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertDataDir, EXAMPLE, loadConfig, ROOT, STAMP } from './runtime.mjs';
import { openStore, recordEvent, withTransaction } from './store.mjs';
import { submitRequest } from './catalog.mjs';

export const DEMO_ACTORS = ['human:priya-natarajan', 'human:owen-castellanos', 'agent:scout', 'agent:builder', 'agent:scribe'];
const titles = [
  'Restore the lesson download link', 'Move the weekly release window', 'Explain archive access after renewal',
  'Build a compact lesson checklist', 'Grant the builder access to release drafts', 'Publish the autumn field guide',
  'Restore last week’s archive into a scratch folder', 'Explore a printable route notebook',
];
export function isDemo(dataDir) { return existsSync(join(dataDir, 'demo.json')); }
export async function seedDemo(dataDir = join(ROOT, '.test-tmp', 'demo'), { reset = false, now = new Date() } = {}) {
  dataDir = assertDataDir(resolve(dataDir));
  mkdirSync(dataDir, { recursive: true });
  const marker = join(dataDir, 'demo.json');
  const existing = readdirSync(dataDir);
  if (!existsSync(marker) && existing.some(name => name !== 'config.mjs')) throw new Error('Demo requires an empty directory or its own demo marker');
  if (!existsSync(marker) && existing.includes('config.mjs') && readFileSync(join(dataDir, 'config.mjs'), 'utf8') !== readFileSync(EXAMPLE, 'utf8')) throw new Error('Demo will not overwrite a customized config');
  if (existsSync(marker)) {
    const meta = JSON.parse(readFileSync(marker, 'utf8'));
    if (meta.module !== 'avalanche-service-catalog' || meta.dataDir !== dataDir) throw new Error('Demo marker does not match this directory');
    if (!reset) return { dataDir, seeded: false, ...meta };
  }
  const artifacts = ['catalog.sqlite', 'catalog.sqlite-wal', 'catalog.sqlite-shm', 'config.mjs', 'estate.json', 'demo.json'];
  for (const name of artifacts) {
    const path = join(dataDir, name);
    if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())) throw new Error('Demo artifact must be a regular file: ' + name);
  }
  // Only these known demo files are replaced; no recursive deletion is used.
  for (const name of artifacts) rmSync(join(dataDir, name), { force: true });
  writeFileSync(marker, JSON.stringify({ module: 'avalanche-service-catalog', dataDir, complete: false, stamp: STAMP }, null, 2));
  const text = readFileSync(EXAMPLE, 'utf8').replace('actors: {}', "actors: { default: 'human:priya-natarajan' }").replace("estate: { path: '' }", "estate: { path: 'estate.json' }");
  writeFileSync(join(dataDir, 'config.mjs'), text);
  copyFileSync(join(ROOT, 'examples', 'estate.example.json'), join(dataDir, 'estate.json'));
  const config = await loadConfig(dataDir, { env: {} });
  const db = openStore(config.db);
  try {
    for (let index = 0; index < 40; index++) {
      const item = config.items[index % config.items.length];
      const at = new Date(now.getTime() - (59 - Math.floor(index * 59 / 39)) * 86400000);
      const product = item.variables.find(v => v.name === 'product').choices[index % 8].value;
      const variables = { title: titles[index % titles.length] + ' — cycle ' + (Math.floor(index / 8) + 1), product, detail: 'Juniper Trail Studio: ' + (index % 2 ? 'Owen will review the release notes before the next weekly window.' : 'Priya will verify the result with the requesting agent.') };
      if (item.id === 'request-a-change') { variables.scheduled = true; variables.due = at.toISOString().slice(0, 10); }
      const settings = index === 13 || index === 29
        ? { ...config, producers: { ...config.producers, [item.destination]: { ...config.producers[item.destination], argv: [...config.producers[item.destination].argv, '--fail'] } } }
        : config;
      await submitRequest(db, item.id, variables, { settings, actor: DEMO_ACTORS[index % DEMO_ACTORS.length], now: at, finishedAt: new Date(at.getTime() + 1000), engineIds: [] });
    }
    // An interrupted submission demonstrates the ledger's non-retry state.
    withTransaction(db, () => {
      const at = now.toISOString(), actor = 'agent:scribe';
      const result = db.prepare("INSERT INTO requests (number,item_id,submitted_at,submitted_by,variables,state,destination) VALUES (?,?,?,?,?,'submitted',?)")
        .run('REQ0041', 'propose-an-initiative', at, actor, JSON.stringify({ title: 'Prepare next month’s lesson plan', product: 'canyon-lessons', detail: 'Saved before a worker restart; inspect the destination before retrying.' }), 'initiative');
      db.prepare("UPDATE sequences SET value = 41 WHERE name = 'request_number'").run();
      recordEvent(db, { at, actor, entity: 'request', entityId: Number(result.lastInsertRowid), kind: 'submitted', detail: { number: 'REQ0041', item_id: 'propose-an-initiative', destination: 'initiative', note: 'Worker interrupted before a destination reference was captured.' } });
    });
  } finally { db.close(); }
  const meta = { module: 'avalanche-service-catalog', dataDir, complete: true, company: 'Juniper Trail Studio', location: 'Flagstaff, Arizona', founders: ['Priya Natarajan', 'Owen Castellanos'], actors: DEMO_ACTORS, requests: 41, stamp: STAMP };
  writeFileSync(marker, JSON.stringify(meta, null, 2) + '\n');
  return { ...meta, seeded: true };
}
