'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'cloudflare-worker.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase-cloud-capture.sql'), 'utf8');

assert(worker.includes("const BABA = '31'"), 'worker must identify Kochi explicitly');
assert(worker.includes('const CAPTURE_MINUTES = new Set([10, 5])'), 'storage must be limited to T10 and T5');
assert(worker.includes('async function captureKochiOdds('), 'worker must expose one Kochi-only capture path');
assert(worker.includes('/rest/v1/keiba_odds_snapshots'), 'worker must write runner snapshots');
assert(worker.includes('/rest/v1/keiba_market_checkpoints'), 'worker must write market checkpoint boards');
assert(worker.includes('/OddsUmLenFuku?'), 'T5 capture must use the official quinella page');
assert(!worker.includes("const BABA = '36'"), 'worker must not contain another track code');
assert(!worker.includes('/rest/v1/monbetsu_odds'), 'worker must not write another project table');
assert(!worker.includes('pruneMonbetsu'), 'worker must not own another project retention job');

assert(worker.includes('capture_run_id:runId'), 'each runner snapshot must retain its capture-run audit id');
assert(worker.includes('snapshot_key:`${BABA}|${dateStr}|${rno}|${r.uma}|${mtp}`'), 'snapshots must have an idempotency key');
assert(worker.includes("'Prefer':'resolution=ignore-duplicates,return=minimal'"), 'checkpoint retries must ignore duplicate ids');
assert(worker.includes('await recordMarketCheckpoints(env, kochi)'), 'every T10/T5 board must be persisted server-side');
assert(worker.includes('await recordT10Coverage(env, kochi)'), 'T10 denominator must be recorded without an open browser');

assert(wrangler.includes('name = "keiba-proxydeploy"'), 'deployment must target the existing Kochi worker');
assert(wrangler.includes('keep_vars = true'), 'deployments must preserve dashboard-managed variables and secrets');
assert(wrangler.includes('crons = ["* 5-12 * * *"]'), 'Kochi checkpoint detection must run every minute');
assert(migration.includes("check (baba_code = '31')"), 'database storage must reject non-Kochi rows');
assert(migration.includes("phase in ('t10','t5')"), 'database storage must accept only T10/T5 phases');

console.log('Kochi worker scope: code 31 only, exact T10/T5, idempotent cloud storage OK');
