// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export function trackableFiles() {
  return [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean))].filter(file => existsSync(join(root, file)));
}
export function scanText(text, path = 'text') {
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const report = rule => findings.push(path + ':' + (index + 1) + ' ' + rule);
    if (/\b[A-Z]:[\/\\]/i.test(line)) report('absolute drive path');
    if (new RegExp('pickbits' + '-services', 'i').test(line)) report('private workspace name');
    if (new RegExp('pickbits' + '\\.ai', 'i').test(line)) report('private domain');
    if (/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{10,}|xox[a-z]-[A-Za-z0-9-]{10,}|AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16})/.test(line) || /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(line)) report('credential literal');
    const emails = line.match(/[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    for (const email of emails) if (!/^example\.(com|org|net)$/i.test(email.split('@').at(-1))) report('non-synthetic email');
    const phones = line.match(/\+1\d{10}\b|(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b|\b[2-9]\d{9}\b|\b\d{3}-\d{4}\b/g) ?? [];
    for (const phone of phones) {
      const digits = phone.replace(/\D/g, '');
      const national = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
      if (!/^(?:[2-9]\d{2})?55501\d{2}$/.test(national)) report('non-synthetic phone');
    }
  });
  return findings;
}
export function leakscan() {
  const findings = []; let scanned = 0;
  for (const file of trackableFiles()) {
    const path = join(root, file);
    if (lstatSync(path).isSymbolicLink()) { findings.push(file + ': symlink is not publishable'); continue; }
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue;
    scanned++; findings.push(...scanText(bytes.toString('utf8'), file));
  }
  return { scanned, findings };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { scanned, findings } = leakscan();
  console.log('leakscan: ' + scanned + ' text files; ' + findings.length + ' findings');
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
  else console.log('PASS: no private paths, domains, credentials, emails or phones.');
}
