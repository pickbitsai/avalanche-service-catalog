// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, cpSync, lstatSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trackableFiles } from './leakscan.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = join(root, '.test-tmp', 'consumer');
mkdirSync(base, { recursive: true });
const sandbox = mkdtempSync(join(base, 'run-')), consumer = join(sandbox, 'code'), data = join(sandbox, 'data');
const npmCli = [
  process.env.npm_execpath,
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find(path => path && existsSync(path));
assert.ok(npmCli, 'npm must be installed alongside Node, or npm_execpath must point to npm-cli.js');
const env = { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
for (const key of Object.keys(env)) if (/^(?:AVALANCHE_CATALOG_|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete env[key];
env.AVALANCHE_CATALOG_USER = 'agent:scout';
let passed = 0;
const run = args => execFileSync(process.execPath, args, { cwd: consumer, env, encoding: 'utf8', timeout: 60_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const cli = args => run([npmCli, 'exec', '--offline', '--', 'avalanche-catalog', ...args, '--data-dir', data]);
try {
  mkdirSync(consumer);
  const files = trackableFiles();
  assert.ok(files.includes('package-lock.json'));
  for (const file of files) {
    const source = resolve(root, file), rel = relative(root, source);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    assert.ok(!file.split('/').some(part => ['node_modules', 'data', 'logs', '.test-tmp', '.git'].includes(part)));
    assert.ok(file !== 'config.mjs' && !/(?:^|\/)\.env/.test(file) && !/\.(?:db|sqlite)(?:$|[-.])/.test(file));
    assert.equal(lstatSync(source).isSymbolicLink(), false);
    const destination = join(consumer, file);
    mkdirSync(dirname(destination), { recursive: true }); cpSync(source, destination);
  }
  const pkg = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'avalanche-service-catalog'); assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.private, true); assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0); passed++;
  run([npmCli, 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund']); passed++;
  assert.match(cli(['--help']), /Made with Avalanche Service Catalog by PickBits/); passed++;
  assert.match(cli(['init']), /Created config.mjs/);
  assert.equal(readFileSync(join(data, 'config.mjs'), 'utf8'), readFileSync(join(consumer, 'config.example.mjs'), 'utf8')); passed++;
  // init created an empty ledger; use a separate fresh demo directory.
  const demoData = join(sandbox, 'demo');
  const demoCli = args => run([npmCli, 'exec', '--offline', '--', 'avalanche-catalog', ...args, '--data-dir', demoData]);
  assert.match(demoCli(['demo', '--seed-only']), /Seeded 41 demo requests/); passed++;
  const items = JSON.parse(demoCli(['list', '--json']));
  assert.equal(items.items.length, 8); assert.ok(items.stamp); passed++;
  const rows = JSON.parse(demoCli(['requests', '--json']));
  assert.equal(rows.requests.length, 41); assert.equal(rows.requests.filter(row => row.state === 'failed').length, 2); passed++;
  console.log('consumer: ' + passed + ' passed, 0 failed; ' + files.length + ' files copied; offline install, actual bin, help, init, demo and two reads; no ports bound.');
} finally {
  const rel = relative(base, sandbox);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
  rmSync(sandbox, { recursive: true, force: true });
}
