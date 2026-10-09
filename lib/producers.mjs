// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
// Record-producer expansion and execution. User values are always standalone argv entries and
// producer processes are always spawned with shell:false.

import { spawn } from "node:child_process";

const PLACEHOLDER = /^\{([a-z][a-z0-9_-]*)\}$/;

function safeValue(value, label) {
  const text = typeof value === "boolean" ? String(value) : String(value ?? "").trim();
  if (text.startsWith("-")) throw new Error(`${label} cannot start with "-"`);
  return text;
}

export function buildProducerArgv(item, producer, variables) {
  if (!Array.isArray(producer?.argv) || producer.argv.length < 1) {
    throw new Error(`producer "${item?.destination ?? "unknown"}" has an invalid argv`);
  }
  if (!item?.producerArgs || typeof item.producerArgs !== "object" || Array.isArray(item.producerArgs)) {
    throw new Error(`item "${item?.id ?? "unknown"}" has invalid producerArgs`);
  }
  const argv = [];
  for (const raw of producer.argv) {
    const part = String(raw);
    if (part.includes("{") || part.includes("}")) {
      const match = part.match(PLACEHOLDER);
      if (!match) throw new Error(`producer placeholder "${part}" must occupy one distinct argv element`);
      const placeholder = match[1];
      const variableName = item.producerArgs[placeholder];
      if (!variableName) throw new Error(`item "${item.id}" does not map producer argument "${placeholder}"`);
      if (!(variableName in variables)) {
        if (argv.at(-1)?.startsWith("--")) argv.pop();
        else throw new Error(`producer argument "${placeholder}" has no visible value`);
        continue;
      }
      argv.push(safeValue(variables[variableName], `variable "${variableName}"`));
      continue;
    }
    argv.push(part);
  }
  for (const name of Object.keys(item.producerArgs)) {
    if (!producer.argv.includes(`{${name}}`)) {
      throw new Error(`item "${item.id}" maps unused producer argument "${name}"`);
    }
  }
  return argv;
}

export function runProducer(argv, { cwd, timeoutMs = 60_000, env = process.env } = {}) {
  if (!Array.isArray(argv) || !argv.length) throw new Error("producer argv is required");
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timer;
    let forceTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolve({ ...result, stdout, stderr, timedOut });
    };
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return resolve({ code: null, stdout, stderr, error, timedOut: false });
    }
    const keep = (current, chunk) => (current + chunk).slice(0, 64_000);
    child.stdout?.on("data", (chunk) => { stdout = keep(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = keep(stderr, chunk); });
    child.once("error", (error) => finish({ code: null, error }));
    child.once("close", (code, signal) => finish({ code, signal }));
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
      forceTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();
  });
}

export function captureReference(output, pattern) {
  if (!(pattern instanceof RegExp) && typeof pattern !== "string") {
    throw new Error("producer refPattern must be a regular expression or string");
  }
  const source = pattern instanceof RegExp ? pattern.source : pattern;
  const flags = pattern instanceof RegExp ? pattern.flags.replaceAll("g", "") : "";
  return String(output ?? "").match(new RegExp(source, flags))?.[0] ?? null;
}

export function producerOutput(outcome, limit = 4000) {
  const stdout = String(outcome?.stdout ?? "");
  const stderr = String(outcome?.stderr ?? "");
  const error = outcome?.error?.message ? `[spawn error]\n${outcome.error.message}` : "";
  const timeout = outcome?.timedOut ? "[producer timed out]" : "";
  return [stdout, stderr && `[stderr]\n${stderr}`, error, timeout].filter(Boolean).join("\n").slice(0, limit);
}
