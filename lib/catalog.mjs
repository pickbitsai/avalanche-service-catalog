// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
// Catalog item validation and immediate record-production flow. Both CLI and desk call here.

import { readEstate } from "./estate.mjs";
import { buildProducerArgv, captureReference, producerOutput, runProducer } from "./producers.mjs";
import { getRequest, listRequests, recordEvent, withTransaction } from "./store.mjs";

export const VARIABLE_TYPES = ["string", "text", "choice", "boolean", "date", "reference"];
export const REQUEST_STATES = ["submitted", "fulfilled", "failed"];

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME = /^[a-z][a-z0-9_]*$/;

const required = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
};

export function loadEngineIds(path) {
  return readEstate({ path }).engineIds;
}

export function validateCatalogConfig(settings) {
  if (!Array.isArray(settings?.items)) throw new Error("catalog items must be an array");
  if (!settings?.producers || typeof settings.producers !== "object") {
    throw new Error("catalog producers must be a map");
  }
  for (const [name, producer] of Object.entries(settings.producers)) {
    if (!producer || !Array.isArray(producer.argv) || !producer.argv.length || producer.argv.some(part => typeof part !== "string" || !part || part.includes("\0"))) throw new Error('producer "' + name + '" argv must be a non-empty array of strings');
    if (typeof producer.cwd !== "string" || !producer.cwd.trim()) throw new Error('producer "' + name + '" cwd is required');
    if (!Number.isInteger(producer.timeoutMs) || producer.timeoutMs < 1 || producer.timeoutMs > 2_147_483_647) throw new Error('producer "' + name + '" timeoutMs must be a positive integer within the Node timer limit');
    if (!(producer.refPattern instanceof RegExp) && typeof producer.refPattern !== "string") throw new Error('producer "' + name + '" refPattern is required');
    try { new RegExp(producer.refPattern); } catch { throw new Error('producer "' + name + '" refPattern is invalid'); }
  }
  const itemIds = new Set();
  for (const item of settings.items) {
    const id = required(item.id, "item id");
    if (!KEBAB.test(id)) throw new Error(`item id "${id}" must be kebab-case`);
    if (itemIds.has(id)) throw new Error(`duplicate item id "${id}"`);
    itemIds.add(id);
    required(item.name, `item "${id}" name`);
    required(item.short_description, `item "${id}" short_description`);
    required(item.category, `item "${id}" category`);
    const destination = required(item.destination, `item "${id}" destination`);
    if (!settings.producers[destination]) throw new Error(`item "${id}" has unknown destination "${destination}"`);
    if (!Array.isArray(item.variables)) throw new Error(`item "${id}" variables must be an array`);
    const names = new Set();
    for (const variable of item.variables) {
      const name = required(variable.name, `item "${id}" variable name`);
      if (!NAME.test(name)) throw new Error(`variable name "${name}" must be lower snake_case`);
      if (names.has(name)) throw new Error(`item "${id}" has duplicate variable "${name}"`);
      names.add(name);
      required(variable.label, `variable "${name}" label`);
      if (!VARIABLE_TYPES.includes(variable.type)) {
        throw new Error(`variable "${name}" type must be one of: ${VARIABLE_TYPES.join(", ")}`);
      }
      if (typeof variable.mandatory !== "boolean") {
        throw new Error(`variable "${name}" mandatory must be boolean`);
      }
      if (variable.type === "choice") {
        if (!Array.isArray(variable.choices) || !variable.choices.length) {
          throw new Error(`choice variable "${name}" must declare choices`);
        }
        const values = variable.choices.map((choice) => required(choice.value, `choice value for "${name}"`));
        if (new Set(values).size !== values.length) throw new Error(`choice variable "${name}" has duplicate values`);
        for (const choice of variable.choices) required(choice.label, `choice label for "${name}"`);
        if (variable.default !== undefined && !values.includes(String(variable.default))) {
          throw new Error(`choice variable "${name}" has an invalid default`);
        }
      }
      if (variable.type === "reference" && variable.reference !== "engine") {
        throw new Error(`reference variable "${name}" must reference "engine"`);
      }
    }
    for (const variable of item.variables) {
      if (variable.visibleIf && !names.has(variable.visibleIf.variable)) {
        throw new Error(`variable "${variable.name}" has unknown visibleIf variable "${variable.visibleIf.variable}"`);
      }
    }
    if (!item.producerArgs || typeof item.producerArgs !== "object" || Array.isArray(item.producerArgs)) {
      throw new Error(`item "${id}" producerArgs must be a map`);
    }
    const template = settings.producers[destination].argv;
    if (!Array.isArray(template) || template.length < 1) {
      throw new Error(`producer "${destination}" has an invalid argv`);
    }
    const placeholders = [];
    for (const part of template) {
      const text = String(part);
      if (!text.includes("{") && !text.includes("}")) continue;
      const match = text.match(/^\{([a-z][a-z0-9_-]*)\}$/);
      if (!match) throw new Error(`producer placeholder "${text}" must occupy one distinct argv element`);
      placeholders.push(match[1]);
    }
    for (const placeholder of placeholders) {
      const variableName = item.producerArgs[placeholder];
      if (!variableName) throw new Error(`item "${id}" does not map producer argument "${placeholder}"`);
      if (!names.has(variableName)) {
        throw new Error(`item "${id}" maps producer argument "${placeholder}" to unknown variable "${variableName}"`);
      }
    }
    for (const placeholder of Object.keys(item.producerArgs)) {
      if (!placeholders.includes(placeholder)) {
        throw new Error(`item "${id}" maps unused producer argument "${placeholder}"`);
      }
    }
  }
  return settings;
}

export function listItems(settings) {
  validateCatalogConfig(settings);
  return settings.items.map((item) => item);
}

export function getItem(settings, itemId) {
  validateCatalogConfig(settings);
  const id = required(itemId, "item id");
  const item = settings.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`no catalog item "${id}"`);
  return item;
}

function hasValue(value, type) {
  if (type === "boolean") return value !== undefined && value !== null && value !== "";
  return String(value ?? "").trim() !== "";
}

function normalizeBoolean(value, label) {
  if (typeof value === "boolean") return value;
  const clean = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(clean)) return true;
  if (["false", "0", "no", "off"].includes(clean)) return false;
  throw new Error(`${label} must be true or false`);
}

function normalizeDate(value, label) {
  const clean = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new Error(`${label} must be YYYY-MM-DD`);
  const date = new Date(`${clean}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== clean) {
    throw new Error(`${label} must be a real calendar date`);
  }
  return clean;
}

export function isVariableVisible(variable, values) {
  if (!variable.visibleIf) return true;
  return String(values[variable.visibleIf.variable] ?? "").trim()
    === String(variable.visibleIf.equals ?? "").trim();
}

export function validateVariables(item, submitted = {}, { engineIds = [] } = {}) {
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    throw new Error("submitted variables must be an object");
  }
  const definitions = new Map(item.variables.map((variable) => [variable.name, variable]));
  for (const name of Object.keys(submitted)) {
    if (!definitions.has(name)) throw new Error(`unknown variable "${name}" for item "${item.id}"`);
  }
  const candidate = {};
  for (const variable of item.variables) {
    if (submitted[variable.name] !== undefined) candidate[variable.name] = submitted[variable.name];
    else if (variable.default !== undefined) candidate[variable.name] = variable.default;
  }
  const values = {};
  for (const variable of item.variables) {
    if (!isVariableVisible(variable, candidate)) continue;
    const value = candidate[variable.name];
    if (!hasValue(value, variable.type)) {
      if (variable.mandatory) throw new Error(`${variable.label} is required`);
      continue;
    }
    let clean;
    if (variable.type === "boolean") clean = normalizeBoolean(value, variable.label);
    else if (variable.type === "date") clean = normalizeDate(value, variable.label);
    else clean = String(value).trim();
    if (typeof clean === "string" && clean.startsWith("-")) {
      throw new Error(`${variable.label} cannot start with "-"`);
    }
    if (variable.type === "choice") {
      const legal = variable.choices.map((choice) => String(choice.value));
      if (!legal.includes(clean)) throw new Error(`${variable.label} must be one of: ${legal.join(", ")}`);
    }
    if (variable.type === "reference") {
      if (variable.reference !== "engine") throw new Error(`unsupported reference "${variable.reference}"`);
      if (!engineIds.includes(clean)) throw new Error(`${variable.label} must name a registered engine`);
    }
    values[variable.name] = clean;
  }
  return values;
}

function requestNumberSettings(settings) {
  const prefix = required(settings?.requestNumbers?.prefix, "request number prefix");
  const width = Number(settings?.requestNumbers?.width);
  const startsAt = Number(settings?.requestNumbers?.startsAt);
  if (!Number.isInteger(width) || width < 1) throw new Error("request number width must be a positive integer");
  if (!Number.isInteger(startsAt) || startsAt < 1) throw new Error("request number start must be a positive integer");
  return { prefix, width, startsAt };
}

function nextRequestNumber(db, settings) {
  const { prefix, width, startsAt } = requestNumberSettings(settings);
  db.prepare("INSERT OR IGNORE INTO sequences (name, value) VALUES ('request_number', ?)").run(startsAt - 1);
  db.prepare("UPDATE sequences SET value = value + 1 WHERE name = 'request_number'").run();
  const value = Number(db.prepare("SELECT value FROM sequences WHERE name = 'request_number'").get().value);
  return `${prefix}${String(value).padStart(width, "0")}`;
}

function insertSubmitted(db, item, variables, { actor, now, settings, argv }) {
  const at = now.toISOString();
  return withTransaction(db, () => {
    const number = nextRequestNumber(db, settings);
    const result = db.prepare(`INSERT INTO requests
      (number, item_id, submitted_at, submitted_by, variables, state, destination,
       created_ref, producer_exit, producer_output, fulfilled_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?, NULL, NULL, NULL, NULL)`)
      .run(number, item.id, at, actor, JSON.stringify(variables), item.destination);
    const id = Number(result.lastInsertRowid);
    recordEvent(db, {
      at, entity: "request", entityId: id, kind: "submitted", actor,
      detail: { number, item_id: item.id, destination: item.destination, argv },
    });
    return getRequest(db, number, { includeEvents: false });
  });
}

function finishRequest(db, request, outcome, producer, { actor, now }) {
  const code = Number.isInteger(outcome?.code) ? outcome.code : null;
  const ref = code === 0 && !outcome?.error && !outcome?.timedOut
    ? captureReference(outcome.stdout, producer.refPattern) : null;
  const state = code === 0 && ref ? "fulfilled" : "failed";
  const at = now.toISOString();
  const output = producerOutput(outcome);
  return withTransaction(db, () => {
    const changed = db.prepare(`UPDATE requests SET state = ?, created_ref = ?, producer_exit = ?,
      producer_output = ?, fulfilled_at = ? WHERE id = ? AND state = 'submitted'`)
      .run(state, ref, code, output || null, state === "fulfilled" ? at : null, request.id);
    if (changed.changes !== 1) throw new Error(`${request.number} is no longer submitted`);
    recordEvent(db, {
      at, entity: "request", entityId: request.id, kind: state, actor,
      detail: state === "fulfilled"
        ? { created_ref: ref, producer_exit: code }
        : {
          producer_exit: code,
          reason: outcome?.timedOut ? "producer timed out"
            : outcome?.error?.message ?? (code === 0 ? "no destination reference in output" : "producer exited non-zero"),
        },
    });
    return getRequest(db, request.number);
  });
}

// Validate and expand a submission before the CLI opens a writable store.
export function prepareRequest(itemId, submitted, { settings, actor, engineIds = null } = {}) {
  const cleanActor = required(actor, "actor");
  validateCatalogConfig(settings);
  const item = getItem(settings, itemId);
  const producer = settings.producers[item.destination];
  const needsEngineRegistry = item.variables.some((variable) => variable.type === "reference");
  const registryIds = engineIds ?? (needsEngineRegistry ? readEstate(settings.sources?.estate).engineIds : []);
  const variables = validateVariables(item, submitted, { engineIds: registryIds });
  const argv = buildProducerArgv(item, producer, variables);
  return { item, producer, variables, argv, actor: cleanActor };
}

export async function submitRequest(db, itemId, submitted, {
  settings,
  actor,
  now = new Date(),
  finishedAt = null,
  engineIds = null,
  spawnImpl = runProducer,
} = {}) {
  const { item, producer, variables, argv, actor: cleanActor } = prepareRequest(itemId, submitted, { settings, actor, engineIds });
  const request = insertSubmitted(db, item, variables, { actor: cleanActor, now, settings, argv });
  let outcome;
  try {
    outcome = await spawnImpl(argv, {
      cwd: producer.cwd,
      timeoutMs: producer.timeoutMs,
      env: process.env,
    });
  } catch (error) {
    outcome = { code: null, stdout: "", stderr: "", error };
  }
  return finishRequest(db, request, outcome || {}, producer, {
    actor: cleanActor,
    now: finishedAt ? new Date(finishedAt) : new Date(),
  });
}

export { getRequest, listRequests };
