// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { getItem, listItems, prepareRequest, submitRequest } from './catalog.mjs';
import { getRequest, listRequests, openStore } from './store.mjs';
import { ROOT, STAMP, initConfig, loadConfig, resolveActor, resolveDataDir } from './runtime.mjs';
import { readEstate } from './estate.mjs';
import { seedDemo, isDemo } from './demo.mjs';
import { startDesk } from './desk.mjs';

function parseVariables(entries) {
  const result = Object.create(null);
  for (const entry of entries) {
    const at = entry.indexOf('=');
    if (at < 1) throw new Error('--var must be name=value');
    const name = entry.slice(0, at).trim();
    if (Object.hasOwn(result, name)) throw new Error('variable supplied more than once: ' + name);
    result[name] = entry.slice(at + 1);
  }
  return result;
}
export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'data-dir': { type: 'string' }, actor: { type: 'string' }, var: { type: 'string', multiple: true, default: [] },
    state: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    reset: { type: 'boolean' }, 'seed-only': { type: 'boolean' },
  } });
  const command = values.help ? 'help' : positionals[0] || 'help';
  const demo = command === 'demo';
  const dataDir = resolveDataDir({ flag: values['data-dir'] || (demo ? join(ROOT, '.test-tmp', 'demo') : undefined), env: demo ? {} : process.env });
  if (!demo && (values.reset || values['seed-only'])) throw new Error('--reset and --seed-only require demo');
  if (demo) {
    console.error('=== DEMO: Juniper Trail Studio — all people, businesses and data are synthetic ===');
    const result = await seedDemo(dataDir, { reset: values.reset });
    if (result.complete === false) throw new Error('Demo seeding was interrupted; run demo --reset');
    console.log((result.seeded ? 'Seeded' : 'Reused') + ' 41 demo requests in ' + dataDir);
    if (values['seed-only']) { console.log(STAMP); return; }
  }
  const config = await loadConfig(dataDir, { env: demo ? { AVALANCHE_CATALOG_DESK_PORT: process.env.AVALANCHE_CATALOG_DESK_PORT } : process.env });
  const actor = resolveActor({ actor: values.actor, config, env: demo ? {} : process.env });
  const output = (value, key) => console.log(values.json
    ? JSON.stringify(Array.isArray(value) ? { [key]: value, stamp: STAMP } : { ...value, stamp: STAMP }, null, 2)
    : typeof value === 'string' ? value + '\n' + STAMP : JSON.stringify(value, null, 2) + '\n' + STAMP);
  if (command === 'help') {
    console.log([
      'Avalanche Service Catalog 0.1.0 — local request forms and command producers',
      '', 'avalanche-catalog init',
      'avalanche-catalog list [--json]',
      'avalanche-catalog show <item-id> [--json]',
      'avalanche-catalog submit <item-id> --var name=value [--var name=value] [--actor actor] [--json]',
      'avalanche-catalog requests [--state submitted|fulfilled|failed] [--json]',
      'avalanche-catalog request <REQnnnn> [--json]',
      'avalanche-catalog desk [--actor actor]',
      'avalanche-catalog demo [--reset] [--seed-only]',
      '', 'All commands: --data-dir <path>; JSON exports carry a stamp.',
      'Data directory: ' + dataDir, 'Database: ' + config.db, 'Actor: ' + actor,
      'Config: <data-dir>/config.mjs; AVALANCHE_CATALOG_CONFIG overrides it.',
      'Data: --data-dir > AVALANCHE_CATALOG_DATA_DIR > platform default.',
      'Actor: --actor > AVALANCHE_CATALOG_USER > actors.default > OS username.',
      'Desk: 127.0.0.1:' + config.desk.port + '; AVALANCHE_CATALOG_DESK_PORT overrides config.desk.port.',
      STAMP,
    ].join('\n')); return;
  }
  if (command === 'desk' || demo) return startDesk({ config, dataDir, actor, demo: demo || isDemo(dataDir) });
  const { engineIds } = readEstate(config.sources?.estate);
  if (command === 'init') {
    console.log(initConfig(dataDir) ? 'Created config.mjs in ' + dataDir : 'Kept existing config.mjs in ' + dataDir);
    const db = openStore(config.db); db.close(); console.log(STAMP); return;
  }
  if (command === 'list') {
    const items = listItems(config);
    return output(values.json ? items : items.map(item => item.id + ' | ' + item.category + ' | ' + item.name).join('\n'), 'items');
  }
  if (command === 'show') {
    const item = getItem(config, positionals[1]);
    return output(values.json ? item : item.name + ' (' + item.id + ')\n' + item.short_description + '\ndestination: ' + item.destination +
      '\n' + item.variables.map(v => v.name + ' | ' + v.type + ' | ' + (v.mandatory ? 'required' : 'optional') +
        (v.choices ? ' | ' + v.choices.map(c => c.value).join(', ') : '') + (v.visibleIf ? ' | visible if ' + v.visibleIf.variable + '=' + v.visibleIf.equals : '')).join('\n'));
  }
  if (!['submit', 'requests', 'request'].includes(command)) throw new Error('unknown command "' + command + '"');
  let variables;
  if (command === 'submit') {
    variables = parseVariables(values.var);
    prepareRequest(positionals[1], variables, { settings: config, actor, engineIds });
  }
  const db = openStore(config.db, { readOnly: command !== 'submit' });
  try {
    if (command === 'submit') {
      const row = await submitRequest(db, positionals[1], variables, { settings: config, actor, engineIds });
      output(values.json ? row : row.number + ' ' + row.state + (row.created_ref ? ' -> ' + row.created_ref : '\n' + (row.producer_output || '')));
      if (row.state === 'failed') process.exitCode = 1;
    } else if (command === 'requests') {
      const rows = listRequests(db, { state: values.state });
      output(values.json ? rows : rows.map(row => [row.number, row.state, row.item_id, row.created_ref || '-', row.submitted_by].join(' | ')).join('\n') || 'no matching requests', 'requests');
    } else {
      const row = getRequest(db, positionals[1]);
      output(row);
    }
  } finally { db.close(); }
}
