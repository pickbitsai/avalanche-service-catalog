// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
const tmpdir = () => { const path = join(process.cwd(), ".test-tmp"); mkdirSync(path, { recursive: true }); return path; };
import { join } from "node:path";
import { openStore } from "../lib/store.mjs";

export const SETTINGS = {
  name: "Test Catalog",
  db: "unused.db",
  sources: {},
  requestNumbers: { prefix: "REQ", width: 4, startsAt: 1 },
  producers: {
    test: {
      argv: ["node", "fake.mjs", "--title", "{title}", "--detail", "{detail}"],
      cwd: ".",
      timeoutMs: 1000,
      refPattern: /\bTST-[A-Z0-9]{6}\b/,
    },
  },
  items: [
    {
      id: "test-item",
      name: "Test item",
      short_description: "Exercise the request path.",
      category: "Tests",
      destination: "test",
      variables: [
        { name: "title", label: "Title", type: "string", mandatory: true },
        {
          name: "kind", label: "Kind", type: "choice", mandatory: true, default: "simple",
          choices: [{ value: "simple", label: "Simple" }, { value: "detailed", label: "Detailed" }],
        },
        {
          name: "detail", label: "Detail", type: "text", mandatory: true,
          visibleIf: { variable: "kind", equals: "detailed" },
        },
      ],
      producerArgs: { title: "title", detail: "detail" },
    },
  ],
};

export function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "catalog-test-"));
  const path = join(dir, "catalog.db");
  const db = openStore(path);
  t.after(() => {
    try { db.close(); } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, path, db };
}
