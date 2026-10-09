// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVariables } from "../lib/catalog.mjs";

const item = {
  id: "matrix",
  variables: [
    { name: "summary", label: "Summary", type: "string", mandatory: true },
    {
      name: "mode", label: "Mode", type: "choice", mandatory: true,
      choices: [{ value: "basic", label: "Basic" }, { value: "advanced", label: "Advanced" }],
    },
    {
      name: "advanced_note", label: "Advanced note", type: "text", mandatory: true,
      visibleIf: { variable: "mode", equals: "advanced" },
    },
    { name: "engine", label: "Engine", type: "reference", reference: "engine", mandatory: true },
    { name: "enabled", label: "Enabled", type: "boolean", mandatory: true },
    { name: "due", label: "Due", type: "date", mandatory: false },
  ],
};

test("variable validation enforces mandatory, choice, reference, boolean, and date rules", () => {
  const common = { summary: "A request", mode: "basic", engine: "trail-notes", enabled: "false" };
  assert.throws(() => validateVariables(item, { ...common, summary: "" }, { engineIds: ["trail-notes"] }), /Summary is required/);
  assert.throws(() => validateVariables(item, { ...common, mode: "expert" }, { engineIds: ["trail-notes"] }), /Mode must be one of/);
  assert.throws(() => validateVariables(item, { ...common, engine: "missing" }, { engineIds: ["trail-notes"] }), /registered engine/);
  assert.throws(() => validateVariables(item, { ...common, enabled: "perhaps" }, { engineIds: ["trail-notes"] }), /true or false/);
  assert.throws(() => validateVariables(item, { ...common, due: "2026-02-30" }, { engineIds: ["trail-notes"] }), /real calendar date/);
  assert.deepEqual(validateVariables(item, { ...common, due: "2026-08-14" }, { engineIds: ["trail-notes"] }), {
    summary: "A request", mode: "basic", engine: "trail-notes", enabled: false, due: "2026-08-14",
  });
});

test("visibleIf strips hidden values and exempts hidden mandatory variables", () => {
  const basic = validateVariables(item, {
    summary: "Basic", mode: "basic", advanced_note: "must disappear", engine: "mesa-publishing", enabled: true,
  }, { engineIds: ["mesa-publishing"] });
  assert.equal("advanced_note" in basic, false);
  assert.deepEqual(basic, { summary: "Basic", mode: "basic", engine: "mesa-publishing", enabled: true });
  assert.throws(() => validateVariables(item, {
    summary: "Advanced", mode: "advanced", engine: "mesa-publishing", enabled: true,
  }, { engineIds: ["mesa-publishing"] }), /Advanced note is required/);
});

test("unknown variables and flag-shaped values are rejected", () => {
  const common = { summary: "A request", mode: "basic", engine: "mesa-publishing", enabled: true };
  assert.throws(() => validateVariables(item, { ...common, surprise: "x" }, { engineIds: ["mesa-publishing"] }), /unknown variable/);
  assert.throws(() => validateVariables(item, { ...common, summary: "--json" }, { engineIds: ["mesa-publishing"] }), /cannot start/);
});
