// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
// SQLite request ledger and append-only audit spine.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TABLES = `
CREATE TABLE IF NOT EXISTS requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  submitted_at    TEXT NOT NULL,
  submitted_by    TEXT NOT NULL,
  variables       TEXT NOT NULL,
  state           TEXT NOT NULL,
  destination     TEXT NOT NULL,
  created_ref     TEXT,
  producer_exit   INTEGER,
  producer_output TEXT,
  fulfilled_at    TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind      TEXT NOT NULL,
  actor     TEXT NOT NULL,
  detail    TEXT
);

CREATE TABLE IF NOT EXISTS sequences (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;

const INDEXES_AND_GUARDS = `
CREATE UNIQUE INDEX IF NOT EXISTS requests_number ON requests(number);
CREATE INDEX IF NOT EXISTS requests_state_time ON requests(state, submitted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS requests_item_time ON requests(item_id, submitted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS events_entity ON events(entity, entity_id, at, id);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
`;

const required = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
};

export function withTransaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Keep the original transaction error. */ }
    throw error;
  }
}

export function serializeDetail(detail) {
  if (detail == null) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

export function recordEvent(db, { at, entity, entityId, kind, actor, detail = null }) {
  db.prepare(`INSERT INTO events (at, entity, entity_id, kind, actor, detail)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(required(at, "event timestamp"), required(entity, "event entity"),
      required(entityId, "event entity id"), required(kind, "event kind"),
      required(actor, "event actor"), serializeDetail(detail));
}

function ensureColumns(db, table, columns) {
  const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  for (const [name, declaration] of Object.entries(columns)) {
    if (!present.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`);
  }
}

function migrateSchema(db) {
  ensureColumns(db, "requests", {
    number: "TEXT",
    item_id: "TEXT",
    submitted_at: "TEXT",
    submitted_by: "TEXT",
    variables: "TEXT NOT NULL DEFAULT '{}'",
    state: "TEXT NOT NULL DEFAULT 'submitted'",
    destination: "TEXT",
    created_ref: "TEXT",
    producer_exit: "INTEGER",
    producer_output: "TEXT",
    fulfilled_at: "TEXT",
  });
  ensureColumns(db, "events", {
    at: "TEXT",
    entity: "TEXT",
    entity_id: "TEXT",
    kind: "TEXT",
    actor: "TEXT",
    detail: "TEXT",
  });
}

export function openStore(path, { readOnly = false } = {}) {
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (!readOnly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(TABLES);
    migrateSchema(db);
    db.exec(INDEXES_AND_GUARDS);
  }
  return db;
}

export function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || "{}"); } catch { return fallback; }
}

function hydrate(row) {
  return row ? { ...row, variables: parseJson(row.variables) } : row;
}

export function getRequest(db, reference, { includeEvents = true } = {}) {
  const ref = required(reference, "request number");
  const row = /^\d+$/.test(ref)
    ? db.prepare("SELECT * FROM requests WHERE id = ? OR number = ?").get(Number(ref), ref)
    : db.prepare("SELECT * FROM requests WHERE number = ? COLLATE NOCASE").get(ref);
  if (!row) throw new Error(`no request "${ref}"`);
  const request = hydrate(row);
  if (includeEvents) {
    request.events = db.prepare(`SELECT * FROM events WHERE entity = 'request' AND entity_id = ?
      ORDER BY at, id`).all(String(row.id)).map((event) => ({
      ...event, detail: parseJson(event.detail, event.detail),
    }));
  }
  return request;
}

export function listRequests(db, { state = null, limit = 100 } = {}) {
  const count = Number(limit);
  if (!Number.isInteger(count) || count < 1) throw new Error("request limit must be a positive integer");
  const states = ["submitted", "fulfilled", "failed"];
  if (state && !states.includes(state)) throw new Error(`request state must be one of: ${states.join(", ")}`);
  const rows = state
    ? db.prepare(`SELECT * FROM requests WHERE state = ? ORDER BY submitted_at DESC, id DESC LIMIT ?`)
      .all(state, count)
    : db.prepare("SELECT * FROM requests ORDER BY submitted_at DESC, id DESC LIMIT ?").all(count);
  return rows.map(hydrate);
}
