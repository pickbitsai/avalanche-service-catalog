// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import example from '../config.example.mjs';
import { buildProducerArgv, captureReference, runProducer } from '../lib/producers.mjs';
import { validateConfig, ROOT } from '../lib/runtime.mjs';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/requests.json', import.meta.url), 'utf8'));
test('example forms and command producers form a valid standalone config', () => {
  assert.equal(validateConfig(example), example);
  assert.equal(example.items.length, 8);
});
test('fixture submissions expand into distinct echo arguments and return matching references', async () => {
  for (const fixture of fixtures) {
    const item = example.items.find(item => item.id === fixture.item);
    const producer = example.producers[item.destination];
    const argv = buildProducerArgv(item, producer, { title: fixture.title, product: fixture.product });
    assert.deepEqual(argv.slice(2), ['--kind', fixture.kind, '--title', fixture.title, '--product', fixture.product]);
    const result = await runProducer(argv, { cwd: ROOT, timeoutMs: producer.timeoutMs });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(captureReference(result.stdout, producer.refPattern).startsWith('JTS-' + fixture.kind + '-'));
  }
});
