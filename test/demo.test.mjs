// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { seedDemo, DEMO_ACTORS } from '../lib/demo.mjs';
import { ROOT, STAMP } from '../lib/runtime.mjs';
import { openStore, listRequests, getRequest } from '../lib/store.mjs';
test('demo is isolated, has two months of requests, five actors, all states and preserves edits until reset', async t => {
  const base = join(ROOT, '.test-tmp'); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'demo-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sentinel = join(dir, 'private.txt'); writeFileSync(sentinel, 'keep');
  await assert.rejects(seedDemo(dir), /empty directory/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep'); rmSync(sentinel);
  const now = new Date('2026-10-09T12:00:00Z');
  const seeded = await seedDemo(dir, { now });
  assert.equal(seeded.stamp, STAMP);
  assert.equal(seeded.requests, 41);
  const db = openStore(join(dir, 'catalog.sqlite'), { readOnly: true });
  const rows = listRequests(db);
  assert.equal(rows.length, 41);
  assert.equal(rows.filter(row => row.state === 'fulfilled').length, 38);
  assert.equal(rows.filter(row => row.state === 'failed').length, 2);
  assert.equal(rows.filter(row => row.state === 'submitted').length, 1);
  assert.deepEqual(new Set(rows.map(row => row.submitted_by)), new Set(DEMO_ACTORS));
  assert.equal(new Set(rows.map(row => row.item_id)).size, 8);
  assert.equal(new Date(rows[0].submitted_at) - new Date(rows.at(-1).submitted_at), 59 * 86400000);
  assert.equal(getRequest(db, 'REQ0001').events.length, 2);
  db.close();
  const reused = await seedDemo(dir);
  assert.equal(reused.seeded, false);
  writeFileSync(sentinel, 'keep');
  assert.equal((await seedDemo(dir, { reset: true, now })).seeded, true);
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep');
  assert.equal(existsSync(join(ROOT, 'catalog.sqlite')), false);
});
