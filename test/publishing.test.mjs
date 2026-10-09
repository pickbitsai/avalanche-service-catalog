// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanText, trackableFiles } from './leakscan.mjs';
import { ROOT } from '../lib/runtime.mjs';
const cases = [
  ['drive path', String.fromCharCode(67) + ':' + '/new/project', 'absolute drive path'],
  ['backslash drive', String.fromCharCode(68) + ':' + '\\workspace', 'absolute drive path'],
  ['workspace', 'pickbits' + '-services', 'private workspace name'],
  ['domain', 'pickbits' + '.ai', 'private domain'],
  ['key', 'sk-' + 'z'.repeat(24), 'credential literal'],
  ['anthropic key', 'sk-' + 'ant-' + 'z'.repeat(24), 'credential literal'],
  ...'pousr'.split('').map(letter => ['github ' + letter, 'gh' + letter + '_' + 'z'.repeat(24), 'credential literal']),
  ['slack', 'xox' + 'b-' + 'z'.repeat(24), 'credential literal'],
  ['cloud key', 'AKIA' + 'Z'.repeat(16), 'credential literal'],
  ...['', 'RSA ', 'EC ', 'OPENSSH ', 'DSA ', 'ENCRYPTED '].map(kind => ['private key ' + kind, '-----BEGIN ' + kind + 'PRIVATE' + ' KEY-----', 'credential literal']),
  ['email', 'person' + '@' + 'invalid.test', 'non-synthetic email'],
  ['phone', ['928', '234', '5678'].join('-'), 'non-synthetic phone'],
  ['compact phone', ['928', '234', '5678'].join(''), 'non-synthetic phone'],
  ['international phone', '+' + ['1', '928', '234', '5678'].join(''), 'non-synthetic phone'],
  ['short phone', ['555', '0200'].join('-'), 'non-synthetic phone'],
];
for (const [label, text, rule] of cases) test('leakscan detects ' + label, () => assert.ok(scanText(text).some(finding => finding.includes(rule))));
test('leakscan accepts synthetic identities, example domains, reserved phones and documented example key', () => {
  assert.deepEqual(scanText('Juniper Trail Studio | Priya Natarajan | Owen Castellanos | agent:scout | team@example.com | mail@example.org | help@example.net | 928-555-0100 | 928-555-0199 | AKIAIOSFODNN7EXAMPLE'), []);
  assert.deepEqual(scanText(readFileSync(join(ROOT, 'examples', 'estate.example.json'), 'utf8')), []);
});
test('every first-party executable source, stylesheet and HTML file has the publishing header', () => {
  const files = trackableFiles().filter(file => /\.(mjs|js|css|html)$/.test(file));
  assert.ok(files.length > 20);
  for (const file of files) {
    if (file === 'scripts/release-guard.mjs') continue;
    const text = readFileSync(join(ROOT, file), 'utf8').replace(/^#![^\n]*\n/, '');
    const first = text.split(/\r?\n/).slice(0, 2).join('\n');
    assert.match(first, /SPDX-License-Identifier: Apache-2.0/, file);
    assert.match(first, /Copyright 2026 Mark Pickering and PICKBITS LLC\. Part of Avalanche Service Catalog by PickBits\./, file);
  }
});
