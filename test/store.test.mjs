// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
const tmpdir = () => { const path = join(process.cwd(), ".test-tmp"); mkdirSync(path, { recursive: true }); return path; };
import { join } from "node:path";
import { openStore, withTransaction } from "../lib/store.mjs";

test("openStore migrations are idempotent and events are database-enforced append-only", () => {
  const dir = mkdtempSync(join(tmpdir(), "catalog-migration-"));
  const path = join(dir, "old.db");
  const old = new DatabaseSync(path);
  old.exec("CREATE TABLE requests (id INTEGER PRIMARY KEY)");
  old.close();
  for (let i = 0; i < 2; i++) {
    const db = openStore(path);
    assert.equal(db.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    const columns = db.prepare("PRAGMA table_info(requests)").all().map((row) => row.name);
    for (const name of ["number", "item_id", "submitted_by", "variables", "state", "created_ref", "producer_output"]) {
      assert.ok(columns.includes(name), `migration must add ${name}`);
    }
    db.close();
  }
  const db = openStore(path);
  db.prepare(`INSERT INTO events (at, entity, entity_id, kind, actor, detail)
    VALUES (?, 'request', '1', 'test', 'human:test', NULL)`).run(new Date().toISOString());
  assert.throws(() => db.prepare("UPDATE events SET detail = 'changed' WHERE id = 1").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM events WHERE id = 1").run(), /append-only/);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("rollback preserves the original failure even when the transaction already ended", () => {
  const original = new Error("work failed");
  const statements = [];
  const db = { exec(sql) { statements.push(sql); if (sql === "ROLLBACK") throw new Error("no transaction is active"); } };
  assert.throws(() => withTransaction(db, () => { throw original; }), error => error === original);
  assert.deepEqual(statements, ["BEGIN IMMEDIATE", "ROLLBACK"]);
});
