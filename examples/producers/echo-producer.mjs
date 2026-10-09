// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
const { values } = parseArgs({ options: {
  kind: { type: 'string', default: 'TICKET' },
  title: { type: 'string' },
  product: { type: 'string' },
  detail: { type: 'string' },
  fail: { type: 'boolean', default: false },
} });
if (values.fail) {
  console.error('The publishing window is closed; inspect the request before resubmitting.');
  process.exitCode = 2;
} else if (!/^[A-Z]+$/.test(values.kind) || !values.title?.trim()) {
  console.error('kind must be uppercase letters and title is required');
  process.exitCode = 1;
} else {
  console.log('JTS-' + values.kind + '-' + randomBytes(6).toString('hex').toUpperCase());
}
