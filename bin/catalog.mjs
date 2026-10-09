#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { main } from '../lib/cli.mjs';
try { await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
