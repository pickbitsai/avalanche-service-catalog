// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import example from '../../config.example.mjs';
export default {
  ...example,
  name: 'Juniper Trail Studio Catalog',
  actors: { default: 'human:test' },
  items: [{
    id: 'fixture-item', name: 'Fixture item', short_description: 'Exercise the bundled producer.',
    category: 'Tests', destination: 'fixture',
    variables: [{ name: 'title', label: 'Title', type: 'string', mandatory: true }],
    producerArgs: { title: 'title' },
  }],
  producers: { fixture: {
    argv: [process.execPath, 'examples/producers/echo-producer.mjs', '--title', '{title}'],
    cwd: '@module', timeoutMs: 5000, refPattern: /\bJTS-TICKET-[A-F0-9]{12}\b/,
  } },
};
