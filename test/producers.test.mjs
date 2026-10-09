// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProducerArgv, captureReference, producerOutput, runProducer } from "../lib/producers.mjs";

const item = {
  id: "safe-item",
  destination: "test",
  producerArgs: { title: "title", detail: "detail" },
};
const producer = {
  argv: ["node", "producer.mjs", "--title", "{title}", "--detail", "{detail}"],
  refPattern: /\bOUT-[A-Z0-9]{4}\b/,
};

test("producer substitution keeps every submitted value in one distinct argv element", () => {
  const argv = buildProducerArgv(item, producer, { title: "spaces stay together", detail: "x & y" });
  assert.deepEqual(argv, ["node", "producer.mjs", "--title", "spaces stay together", "--detail", "x & y"]);
  assert.equal(argv.includes("--title spaces stay together"), false);
});

test("hidden optional producer values remove their flag and cannot leak", () => {
  assert.deepEqual(buildProducerArgv(item, producer, { title: "Visible" }),
    ["node", "producer.mjs", "--title", "Visible"]);
});

test("producer expansion rejects flag injection and concatenated placeholders", () => {
  assert.throws(() => buildProducerArgv(item, producer, { title: "--json", detail: "safe" }), /cannot start/);
  assert.throws(() => buildProducerArgv(item, {
    ...producer, argv: ["node", "producer.mjs", "prefix={title}"],
  }, { title: "safe", detail: "safe" }), /distinct argv element/);
});

test("reference capture is exact and output is bounded", () => {
  assert.equal(captureReference("created OUT-AB12\n", producer.refPattern), "OUT-AB12");
  assert.equal(captureReference("created nothing", producer.refPattern), null);
  assert.equal(producerOutput({ stdout: "x".repeat(5000) }).length, 4000);
});

test("producer execution enforces its timeout", async () => {
  const outcome = await runProducer([
    process.execPath, "-e", "setInterval(() => {}, 1000)",
  ], { timeoutMs: 50 });
  assert.equal(outcome.timedOut, true);
  assert.notEqual(outcome.code, 0);
});
