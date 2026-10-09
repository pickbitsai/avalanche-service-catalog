// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.

// Shared field definitions keep the eight request forms consistent.
const products = ['trail-notes', 'mesa-publishing', 'canyon-lessons', 'pine-studio', 'ridge-status', 'creek-archive', 'aspen-billing', 'juniper-lab'];
const title = { name: 'title', label: 'Request title', type: 'string', mandatory: true }; // Required one-line summary.
const product = { name: 'product', label: 'Product or service', type: 'choice', mandatory: true, default: 'trail-notes', choices: products.map(value => ({ value, label: value })) }; // Local choices work without estate.
const detail = { name: 'detail', label: 'Details', type: 'text', mandatory: false, help: 'Describe the outcome and enough context to act.' }; // Optional free text.
const engine = { name: 'engine', label: 'Related engine', type: 'reference', reference: 'engine', mandatory: false, help: 'Available when the estate source is configured.' }; // Optional estate selector.

// Each item names a producer through destination; producerArgs maps placeholders to variables.
function item(id, name, category, destination, short_description, extra = []) {
  return { id, name, short_description, category, destination, variables: [title, product, detail, engine, ...extra], producerArgs: { title: 'title', product: 'product', detail: 'detail' } };
}
function producer(kind) {
  return {
    argv: ['node', 'examples/producers/echo-producer.mjs', '--kind', kind, '--title', '{title}', '--product', '{product}', '--detail', '{detail}'], // Executable plus distinct argv entries; never a shell command.
    cwd: '@module', // @module means the installed code directory; other relative paths use the config directory.
    timeoutMs: 5000, // Maximum time before terminating the direct child.
    refPattern: /\bJTS-[A-Z]+-[A-F0-9]{12}\b/, // Match the reference printed to stdout after success.
  };
}
export default {
  name: 'Avalanche Service Catalog', // CLI display name.
  db: 'catalog.sqlite', // Database filename relative to the data directory; must remain inside it.
  actors: {}, // Optional default property sets an actor; otherwise use the operating-system username.
  requestNumbers: {
    prefix: 'REQ', // Request reference prefix.
    width: 4, // Minimum numeric padding.
    startsAt: 1, // First sequence value for an empty ledger.
  },
  sources: {
    estate: { path: '' }, // Optional engines JSON path relative to config.mjs; empty disables it.
  },
  desk: {
    port: 4179, // Allocated port; AVALANCHE_CATALOG_DESK_PORT overrides it without scanning.
    title: 'Avalanche Service Catalog', // Browser title and header.
  },
  producers: { // Trusted command definitions keyed by destination.
    ticket: producer('TICKET'),
    change: producer('CHANGE'),
    case: producer('CASE'),
    initiative: producer('INITIATIVE'),
  },
  items: [ // Forms: stable id, name, short_description, category, destination, variables and producerArgs.
    item('report-an-issue', 'Report an issue', 'Operate', 'ticket', 'Restore a product or service that is not working.'),
    item('request-a-change', 'Request a change', 'Operate', 'change', 'Plan a change with a clear maintenance window.', [
      { name: 'scheduled', label: 'Schedule a window', type: 'boolean', mandatory: true, default: false }, // Boolean fields accept true or false.
      { name: 'due', label: 'Requested date', type: 'date', mandatory: true, visibleIf: { variable: 'scheduled', equals: 'true' } }, // Conditional fields are discarded when hidden.
    ]),
    item('new-customer-case', 'Open a customer case', 'Support', 'case', 'Track a question raised through the help inbox.'),
    item('propose-an-initiative', 'Propose an initiative', 'Plan', 'initiative', 'Describe a small investment and its intended outcome.'),
    item('request-access', 'Request access', 'Operate', 'ticket', 'Request a role for a founder or an agent.'),
    item('publish-content', 'Publish content', 'Create', 'change', 'Prepare a lesson or publication for release.'),
    item('review-backup', 'Review a backup', 'Operate', 'ticket', 'Check that a recent archive can be restored.'),
    item('research-opportunity', 'Research an opportunity', 'Plan', 'initiative', 'Time-box an idea before committing to a build.'),
  ],
};
