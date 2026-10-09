// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
// Read-only Company OS panel. Missing, old, or unreadable stores simply remove the section.

import { existsSync } from "node:fs";
import { openStore, listRequests } from "./store.mjs";

export const id = "catalog";
export const title = "Avalanche Service Catalog";
export const nav = "Catalog";

export function collect({ settings = {} } = {}) {
  try {
    if (!settings.db || !existsSync(settings.db)) return null;
    const db = openStore(settings.db, { readOnly: true });
    try {
      const recent = listRequests(db, { limit: Number(settings.limit || 12) });
      const failed = Number(db.prepare("SELECT COUNT(*) AS n FROM requests WHERE state = 'failed'").get().n);
      const now = settings.now ? new Date(settings.now) : new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const today = Number(db.prepare("SELECT COUNT(*) AS n FROM requests WHERE submitted_at >= ? AND submitted_at < ?")
        .get(start.toISOString(), end.toISOString()).n);
      return { recent, failed, today };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export function stat(data) {
  try {
    if (!data) return null;
    if (data.failed) return { label: "failed requests", value: data.failed };
    return { label: "requests today", value: data.today };
  } catch {
    return null;
  }
}

export function render(data, { esc } = {}) {
  try {
    if (!data || !data.recent.length || typeof esc !== "function") return "";
    const rows = data.recent.map((row) => {
      const chip = row.state === "failed" ? "bad" : row.state === "submitted" ? "warn" : "";
      return `<tr><td class="mono">${esc(row.number)}</td><td><b>${esc(row.item_id)}</b><br>${esc(row.destination)}</td>`
        + `<td><span class="chip ${chip}">${esc(row.state)}</span></td>`
        + `<td class="mono">${esc(row.created_ref || "—")}</td><td>${esc(row.submitted_by)}</td></tr>`;
    }).join("");
    return `<details class="ops-section" id="catalog"${data.failed ? " open" : ""}>`
      + `<summary>${esc(title)} <span class="section-count">${data.failed} failed · ${data.today} today</span></summary>`
      + `<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">`
      + `<p class="doc">Shared request intake. This panel is read-only; submit and inspect requests in the catalog desk or CLI.</p></div>`
      + `<div class="table-shell"><table><tr><th>Request</th><th>Item</th><th>State</th><th>Created record</th><th>Actor</th></tr>`
      + `${rows}</table></div><p>Made with Avalanche Service Catalog by PickBits</p></details>`;
  } catch {
    return "";
  }
}
