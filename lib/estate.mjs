// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { readFileSync } from 'node:fs';

// Estate is selector data only. No commands, URLs or directories from it are executed.
export function readEstate(source, { notice = console.error } = {}) {
  let message;
  if (!source?.path) message = 'Estate source disabled: sources.estate.path is not configured.';
  else {
    try {
      const data = JSON.parse(readFileSync(source.path, 'utf8'));
      if (!Array.isArray(data.engines) || data.engines.some(engine => !engine || typeof engine.id !== 'string' || !engine.id.trim())) throw new Error('engines must be an array of objects with non-empty ids');
      return { engineIds: [...new Set(data.engines.map(engine => engine.id))], message: null };
    } catch (error) { message = 'Estate source disabled: ' + (error.code || error.message); }
  }
  notice(message);
  return { engineIds: [], message };
}
