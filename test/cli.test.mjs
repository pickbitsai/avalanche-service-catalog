// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
const tmpdir = () => { const path = join(process.cwd(), ".test-tmp"); mkdirSync(path, { recursive: true }); return path; };
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, "bin", "catalog.mjs");
const CONFIG = join(ROOT, "test", "fixtures", "config.mjs");

function freshDataDir(t) {
  const parent = mkdtempSync(join(tmpdir(), "catalog-cli-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dataDir = join(parent, "absent", "data");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("AVALANCHE_CATALOG_")) delete env[key];
  const run = (args, overrides = {}, bin = CLI) => spawnSync(process.execPath, [bin, ...args, "--data-dir", dataDir], {
    cwd: ROOT, env: { ...env, ...overrides }, encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000,
  });
  const assertAbsent = () => assert.equal(existsSync(join(parent, "absent")), false, "command created the data directory or its parent");
  assertAbsent();
  return { dataDir, run, assertAbsent };
}

for (const [label, args, bin] of [
  ["--help", ["--help"], CLI],
  ["-h", ["-h"], CLI],
  ["implicit help", [], CLI],
  ["desk --help", ["--help"], join(ROOT, "bin", "desk.mjs")],
]) test(`CLI ${label} leaves a nonexistent data directory absent`, t => {
  const { run, assertAbsent } = freshDataDir(t);
  const result = run(args, {}, bin);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /avalanche-catalog submit/);
  assertAbsent();
});

for (const [label, args, message, env = {}] of [
  ["unknown command", ["unknown"], /unknown command/],
  ["unknown option", ["--unknown"], /Unknown option/],
  ["demo-only option", ["list", "--reset"], /require demo/],
  ["missing item", ["show"], /item id is required/],
  ["unknown item", ["show", "missing"], /no catalog item/],
  ["invalid actor", ["list", "--actor", " "], /actor must be/],
  ["invalid port", ["list"], /desk.port/, { AVALANCHE_CATALOG_DESK_PORT: "bad" }],
  ["invalid init port", ["init"], /desk.port/, { AVALANCHE_CATALOG_DESK_PORT: "bad" }],
  ["missing submit item", ["submit"], /item id is required/],
  ["unknown submit item", ["submit", "missing"], /no catalog item/],
  ["malformed variable", ["submit", "report-an-issue", "--var", "title"], /name=value/],
  ["duplicate variable", ["submit", "report-an-issue", "--var", "title=one", "--var", "title=two"], /more than once/],
  ["required variable", ["submit", "report-an-issue"], /Request title is required/],
  ["unknown variable", ["submit", "report-an-issue", "--var", "unknown=value"], /unknown variable/],
  ["invalid choice", ["submit", "report-an-issue", "--var", "title=Test", "--var", "product=missing"], /must be one of/],
]) test(`CLI rejects ${label} without creating data`, t => {
  const { run, assertAbsent } = freshDataDir(t);
  const result = run(args, env);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, message);
  assertAbsent();
});

test("CLI catalog reads leave data absent until a valid submission opens the store", t => {
  const { dataDir, run, assertAbsent } = freshDataDir(t);
  for (const args of [["list"], ["show", "fixture-item"]]) {
    const result = run(args, { AVALANCHE_CATALOG_CONFIG: CONFIG });
    assert.equal(result.status, 0, result.stderr);
    assertAbsent();
  }
  const result = run(["submit", "fixture-item", "--var", "title=Lazy store"], { AVALANCHE_CATALOG_CONFIG: CONFIG });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REQ0001 fulfilled/);
  assert.equal(existsSync(join(dataDir, "catalog.sqlite")), true);
});

test("CLI lists, shows, submits, and reads one request ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "catalog-cli-"));
  const path = join(dir, "cli.db");
  const env = {
    ...process.env,
    AVALANCHE_CATALOG_DATA_DIR: dir,
    AVALANCHE_CATALOG_CONFIG: CONFIG,
    AVALANCHE_CATALOG_USER: "human:cli-test",
  };
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT, env, encoding: "utf8", shell: false,
  });
  const ok = (...args) => {
    const result = run(...args);
    assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  assert.match(ok("list"), /fixture-item/);
  assert.match(ok("show", "fixture-item"), /destination: fixture/);
  assert.match(ok("submit", "fixture-item", "--var", "title=CLI request"), /REQ0001 fulfilled -> JTS-TICKET-[A-F0-9]{12}/);
  assert.match(ok("requests", "--state", "fulfilled"), /REQ0001/);
  const row = JSON.parse(ok("request", "REQ0001", "--json"));
  assert.equal(row.submitted_by, "human:cli-test");
  assert.equal(row.variables.title, "CLI request");
  assert.equal(row.state, "fulfilled");
  rmSync(dir, { recursive: true, force: true });
});
