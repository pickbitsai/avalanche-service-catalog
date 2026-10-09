// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, win32 } from 'node:path';
import example from '../config.example.mjs';
import { validateConfig, resolveDataDir, defaultDataDir, resolveActor, loadConfig, initConfig, ROOT, STAMP } from '../lib/runtime.mjs';
import { readEstate } from '../lib/estate.mjs';
import { fixture } from './helpers.mjs';
test('data directory resolution is flag then environment then platform default', t => {
  const { dir } = fixture(t);
  const env = { AVALANCHE_CATALOG_DATA_DIR: join(dir, 'env') };
  assert.equal(resolveDataDir({ flag: join(dir, 'flag'), env }), join(dir, 'flag'));
  assert.equal(resolveDataDir({ env }), env.AVALANCHE_CATALOG_DATA_DIR);
  assert.equal(resolveDataDir({ env: {} }), resolve(defaultDataDir()));
  const drive = String.fromCharCode(67) + ':';
  assert.equal(defaultDataDir({ platform: 'win32', home: drive + '\\Users\\owner' }), win32.join(drive + '\\', 'new', 'avalanche-data', 'service-catalog'));
  assert.equal(defaultDataDir({ platform: 'linux', home: '/home/owner' }), join('/home/owner', '.local/share/avalanche/service-catalog'));
});
test('repo directory and descendants are rejected except ignored test/demo data', () => {
  for (const flag of [ROOT, join(ROOT, 'data'), join(ROOT, 'lib'), join(ROOT, '..')]) assert.throws(() => resolveDataDir({ flag }), /repository/);
  assert.equal(resolveDataDir({ flag: join(ROOT, '.test-tmp', 'demo') }), join(ROOT, '.test-tmp', 'demo'));
});
test('actor precedence is flag, environment, config, OS username', () => {
  const options = { actor: 'agent:scout', env: { AVALANCHE_CATALOG_USER: 'agent:builder' }, config: { actors: { default: 'agent:scribe' } }, username: 'local-user' };
  assert.equal(resolveActor(options), 'agent:scout');
  delete options.actor; assert.equal(resolveActor(options), 'agent:builder');
  options.env = {}; assert.equal(resolveActor(options), 'agent:scribe');
  options.config = {}; assert.equal(resolveActor(options), 'human:local-user');
  assert.throws(() => resolveActor({ actor: '' }), /actor/);
});
const invalid = [
  ['name', c => { c.name = ''; }, /name/],
  ['db', c => { c.db = ''; }, /db/],
  ['port', c => { c.desk.port = 0; }, /desk.port/],
  ['title', c => { c.desk.title = ''; }, /desk.title/],
  ['actor', c => { c.actors.default = ''; }, /actors.default/],
  ['source', c => { c.sources.estate.path = 17; }, /sources.estate.path/],
  ['prefix', c => { c.requestNumbers.prefix = ''; }, /prefix/],
  ['width', c => { c.requestNumbers.width = 0; }, /width/],
  ['start', c => { c.requestNumbers.startsAt = -1; }, /startsAt/],
  ['argv', c => { c.producers.ticket.argv = []; }, /argv/],
  ['cwd', c => { c.producers.ticket.cwd = ''; }, /cwd/],
  ['timeout', c => { c.producers.ticket.timeoutMs = 0; }, /timeoutMs/],
  ['pattern', c => { c.producers.ticket.refPattern = '['; }, /refPattern/],
  ['destination', c => { c.items[0].destination = 'missing'; }, /destination/],
  ['duplicate', c => { c.items[1].id = c.items[0].id; }, /duplicate/],
  ['mapping', c => { c.items[0].producerArgs.title = 'missing'; }, /unknown variable/],
  ['inline placeholder', c => { c.producers.ticket.argv[0] = 'run-{title}'; }, /distinct argv/],
];
for (const [label, mutate, message] of invalid) test('config validation: ' + label, () => {
  const config = structuredClone(example); mutate(config); assert.throws(() => validateConfig(config), message);
});
test('config fallback, init, override, db containment and port override', async t => {
  const { dir } = fixture(t);
  const notices = [];
  const fallback = await loadConfig(dir, { env: {}, notice: value => notices.push(value) });
  assert.ok(fallback.db.startsWith(dir));
  assert.match(notices[0], /config.example.mjs/);
  assert.equal(initConfig(dir), true);
  const saved = readFileSync(join(dir, 'config.mjs'), 'utf8');
  assert.equal(initConfig(dir), false);
  assert.equal(readFileSync(join(dir, 'config.mjs'), 'utf8'), saved);
  const configured = await loadConfig(dir, { env: { AVALANCHE_CATALOG_DESK_PORT: '4179' } });
  assert.equal(configured.desk.port, 4179);
  await assert.rejects(loadConfig(dir, { env: { AVALANCHE_CATALOG_DESK_PORT: 'bad' } }), /desk.port/);
  await assert.rejects(loadConfig(dir, { env: { AVALANCHE_CATALOG_CONFIG: join(dir, 'absent.mjs') } }), /does not exist/);
  const override = join(dir, 'unsafe.mjs');
  writeFileSync(override, saved.replace("db: 'catalog.sqlite'", "db: '../escape.sqlite'"));
  await assert.rejects(loadConfig(dir, { env: { AVALANCHE_CATALOG_CONFIG: override } }), /inside the data directory/);
  assert.equal(existsSync(join(ROOT, 'catalog.sqlite')), false);
});
test('optional estate source handles absent, missing and malformed paths gracefully', t => {
  const { dir } = fixture(t), notices = [];
  for (const source of [undefined, {}, { path: '' }, { path: join(dir, 'missing.json') }]) assert.deepEqual(readEstate(source, { notice: m => notices.push(m) }).engineIds, []);
  const path = join(dir, 'estate.json');
  for (const text of ['invalid', '{}', '{"engines":[{}]}']) {
    writeFileSync(path, text);
    assert.deepEqual(readEstate({ path }, { notice: m => notices.push(m) }).engineIds, []);
  }
  assert.ok(notices.every(m => m.includes('disabled')));
  assert.equal(readEstate({ path: join(ROOT, 'examples', 'estate.example.json') }).engineIds.length, 8);
  assert.equal(STAMP, 'Made with Avalanche Service Catalog by PickBits');
});
