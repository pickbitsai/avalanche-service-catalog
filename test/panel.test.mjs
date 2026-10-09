// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { submitRequest } from "../lib/catalog.mjs";
import { collect, id, nav, render, stat, title } from "../lib/panel.mjs";
import { SETTINGS, fixture } from "./helpers.mjs";

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
})[char]);

test("panel contract is catalog, read-only, and null-safe for a missing store", () => {
  assert.deepEqual({ id, title, nav }, { id: "catalog", title: "Avalanche Service Catalog", nav: "Catalog" });
  assert.equal(collect({ settings: { db: join(process.cwd(), "missing.db") } }), null);
  assert.equal(stat(null), null);
  assert.equal(render(null, { esc }), "");
});

test("panel prioritizes failed requests, then requests today, and renders recent refs", async (t) => {
  const { db, path } = fixture(t);
  await submitRequest(db, "test-item", { title: "Needs human", kind: "simple" }, {
    settings: SETTINGS, actor: "human:test", engineIds: [],
    now: new Date("2026-08-14T10:00:00.000Z"), finishedAt: "2026-08-14T10:00:01.000Z",
    spawnImpl: async () => ({ code: 2, stdout: "", stderr: "failed fixture" }),
  });
  db.close();
  const data = collect({ settings: { db: path, now: "2026-08-14T12:00:00.000Z" } });
  assert.equal(data.failed, 1);
  assert.equal(data.today, 1);
  assert.deepEqual(stat(data), { label: "failed requests", value: 1 });
  const html = render(data, { esc });
  assert.match(html, /REQ0001/);
  assert.match(html, /failed/);
  assert.match(html, /Made with Avalanche Service Catalog by PickBits/);
});
