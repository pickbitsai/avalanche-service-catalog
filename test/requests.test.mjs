// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitRequest } from "../lib/catalog.mjs";
import { getRequest, listRequests } from "../lib/store.mjs";
import { SETTINGS, fixture } from "./helpers.mjs";

test("successful submission preserves the ledger, argv audit, and captured destination ref", async (t) => {
  const { db } = fixture(t);
  let received;
  const row = await submitRequest(db, "test-item", { title: "One value", kind: "simple" }, {
    settings: SETTINGS,
    actor: "human:test",
    engineIds: [],
    now: new Date("2026-08-14T01:00:00.000Z"),
    finishedAt: "2026-08-14T01:00:01.000Z",
    spawnImpl: async (argv, options) => {
      received = { argv, options };
      return { code: 0, stdout: "created TST-ABC123\n", stderr: "" };
    },
  });
  assert.deepEqual(received.argv, ["node", "fake.mjs", "--title", "One value"]);
  assert.equal(received.options.cwd, ".");
  assert.equal(received.options.timeoutMs, SETTINGS.producers.test.timeoutMs);
  assert.equal(row.number, "REQ0001");
  assert.equal(row.state, "fulfilled");
  assert.equal(row.created_ref, "TST-ABC123");
  assert.equal(row.fulfilled_at, "2026-08-14T01:00:01.000Z");
  assert.deepEqual(row.events.map((event) => event.kind), ["submitted", "fulfilled"]);
  assert.equal(listRequests(db).length, 1);
});

test("non-zero producer failures preserve bounded output and failed state", async (t) => {
  const { db } = fixture(t);
  const row = await submitRequest(db, "test-item", {
    title: "Failure", kind: "detailed", detail: "Repro steps",
  }, {
    settings: SETTINGS,
    actor: "human:test",
    engineIds: [],
    spawnImpl: async () => ({ code: 9, stdout: "partial output\n", stderr: `boom ${"x".repeat(5000)}` }),
  });
  assert.equal(row.state, "failed");
  assert.equal(row.created_ref, null);
  assert.equal(row.producer_exit, 9);
  assert.equal(row.fulfilled_at, null);
  assert.ok(row.producer_output.includes("partial output"));
  assert.ok(row.producer_output.includes("[stderr]"));
  assert.equal(row.producer_output.length, 4000);
  assert.deepEqual(getRequest(db, row.number).variables, {
    title: "Failure", kind: "detailed", detail: "Repro steps",
  });
  assert.equal(listRequests(db, { state: "failed" }).length, 1);
  assert.deepEqual(row.events.map((event) => event.kind), ["submitted", "failed"]);
});

test("zero exit without a matching ref is a recorded failure", async (t) => {
  const { db } = fixture(t);
  const row = await submitRequest(db, "test-item", { title: "No ref", kind: "simple" }, {
    settings: SETTINGS, actor: "human:test", engineIds: [],
    spawnImpl: async () => ({ code: 0, stdout: "created something else", stderr: "" }),
  });
  assert.equal(row.state, "failed");
  assert.equal(row.producer_exit, 0);
  assert.match(JSON.stringify(row.events.at(-1).detail), /no destination reference/);
});
