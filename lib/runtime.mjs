// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits.
import { existsSync, mkdirSync, realpathSync, copyFileSync, constants } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join, win32 } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateCatalogConfig } from './catalog.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const STAMP = 'Made with Avalanche Service Catalog by PickBits';
export const EXAMPLE = join(ROOT, 'config.example.mjs');
export const inside = (base, path) => {
  const rel = relative(resolve(base), resolve(path));
  return rel === '' || (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && rel !== '..' && !isAbsolute(rel));
};
function physical(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(physical(parent), relative(parent, path));
}
export function assertDataDir(path, root = ROOT) {
  const target = physical(resolve(path));
  const code = physical(resolve(root));
  if (inside(code, target) && !inside(join(code, '.test-tmp'), target)) {
    throw new Error('data directory must be outside the repository (tests and demos may use .test-tmp)');
  }
  if (inside(target, code)) throw new Error('data directory must not contain the repository');
  return resolve(path);
}
export function defaultDataDir({ platform = process.platform, home = homedir() } = {}) {
  return platform === 'win32'
    ? win32.join(win32.parse(home).root, 'new', 'avalanche-data', 'service-catalog')
    : join(home, '.local', 'share', 'avalanche', 'service-catalog');
}
export function resolveDataDir({ flag, env = process.env, root = ROOT, platform, home } = {}) {
  return assertDataDir(flag || env.AVALANCHE_CATALOG_DATA_DIR || defaultDataDir({ platform, home }), root);
}
export function resolveActor({ actor, env = process.env, config = {}, username = userInfo().username } = {}) {
  const value = actor ?? env.AVALANCHE_CATALOG_USER ?? config.actors?.default ?? 'human:' + username;
  if (typeof value !== 'string' || !value.trim()) throw new Error('actor must be a non-empty string');
  return value.trim();
}
export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config must export an object');
  for (const [key, value] of [['name', config.name], ['db', config.db], ['desk.title', config.desk?.title]]) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(key + ' must be a non-empty string');
  }
  if (!Number.isInteger(config.desk?.port) || config.desk.port < 1 || config.desk.port > 65535) throw new Error('desk.port must be an integer from 1 to 65535');
  if (config.actors?.default !== undefined && (typeof config.actors.default !== 'string' || !config.actors.default.trim())) throw new Error('actors.default must be a non-empty string');
  if (config.sources !== undefined && (!config.sources || typeof config.sources !== 'object' || Array.isArray(config.sources))) throw new Error('sources must be an object');
  const estate = config.sources?.estate;
  if (estate !== undefined && (!estate || typeof estate !== 'object' || Array.isArray(estate))) throw new Error('sources.estate must be an object');
  if (estate?.path !== undefined && typeof estate.path !== 'string') throw new Error('sources.estate.path must be a string');
  const numbers = config.requestNumbers;
  if (!numbers || typeof numbers.prefix !== 'string' || !/^[A-Z][A-Z0-9-]*$/.test(numbers.prefix)) throw new Error('requestNumbers.prefix must use uppercase letters, digits or hyphens');
  if (!Number.isInteger(numbers.width) || numbers.width < 1 || numbers.width > 16) throw new Error('requestNumbers.width must be an integer from 1 to 16');
  if (!Number.isSafeInteger(numbers.startsAt) || numbers.startsAt < 1) throw new Error('requestNumbers.startsAt must be a positive safe integer');
  validateCatalogConfig(config);
  return config;
}
export async function loadConfig(dataDir, { env = process.env, notice = console.error } = {}) {
  assertDataDir(dataDir);
  const configPath = resolve(env.AVALANCHE_CATALOG_CONFIG || join(dataDir, 'config.mjs'));
  const found = existsSync(configPath);
  if (!found && env.AVALANCHE_CATALOG_CONFIG) throw new Error('AVALANCHE_CATALOG_CONFIG does not exist');
  if (!found) notice('No data-directory config.mjs; using config.example.mjs. Run init to create a private config.');
  const imported = (await import(pathToFileURL(found ? configPath : EXAMPLE).href)).default;
  const config = { ...imported, desk: { ...imported.desk }, sources: { ...imported.sources }, producers: { ...imported.producers } };
  if (env.AVALANCHE_CATALOG_DESK_PORT !== undefined) config.desk.port = Number(env.AVALANCHE_CATALOG_DESK_PORT);
  validateConfig(config);
  config.db = resolve(dataDir, config.db);
  if (!inside(physical(resolve(dataDir)), physical(config.db)) || physical(config.db) === physical(resolve(dataDir))) throw new Error('db must be a file inside the data directory');
  assertDataDir(dirname(config.db));
  const configDir = found ? dirname(configPath) : dataDir;
  if (config.sources.estate?.path) config.sources.estate = { ...config.sources.estate, path: resolve(configDir, config.sources.estate.path) };
  for (const [key, producer] of Object.entries(config.producers)) {
    config.producers[key] = { ...producer, cwd: producer.cwd === '@module' ? ROOT : resolve(configDir, producer.cwd) };
  }
  return config;
}
export function initConfig(dataDir) {
  assertDataDir(dataDir);
  mkdirSync(dataDir, { recursive: true });
  const target = join(dataDir, 'config.mjs');
  if (existsSync(target)) return false;
  copyFileSync(EXAMPLE, target, constants.COPYFILE_EXCL);
  return true;
}
