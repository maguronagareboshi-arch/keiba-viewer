'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Keep checkpoint arithmetic deterministic even when CI itself runs near JST midnight.
const RealDate = Date;
const FIXED_NOW = RealDate.parse('2026-08-01T06:00:00Z'); // 15:00 JST
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
};

function postTime(minutesAhead) {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const total = jst.getUTCHours() * 60 + jst.getUTCMinutes() + minutesAhead;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function singleHtml(minutesAhead) {
  return `<div class="odd_popular_table_02"><span>${postTime(minutesAhead)} \u767a\u8d70</span><tbody>
    <tr><td>1</td><td>1</td><td>Horse A</td><td>2.5</td><td>1.1 - 1.3</td></tr>
    <tr><td>2</td><td>2</td><td>Horse B</td><td>5.0</td><td>1.8 - 2.0</td></tr>
  </tbody></div>`;
}

const pairHtml = `<table class="odd_ranking_table"><tbody>
  <tr><td>1 - 2</td><td>8.4</td></tr>
</tbody></table>`;

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'cloudflare-worker.js'), 'utf8')
    .replace("import puppeteer from '@cloudflare/puppeteer';", 'const puppeteer = globalThis.__KV_TEST_PUPPETEER__;');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const worker = (await import(moduleUrl)).default;
  const health = await worker.fetch(new Request('https://worker.example/health'), { RELEASE_SHA:'unit-test' });
  assert.strictEqual(health.status, 200, 'health check must be public and side-effect free');
  assert.deepStrictEqual(await health.json(), { ok:true, service:'kochi-capture', release_sha:'unit-test' });

  const preflight = await worker.fetch(new Request('https://worker.example/auth/check', {
    method:'OPTIONS', headers:{ Origin:'https://yukochi.com', 'Access-Control-Request-Method':'GET', 'Access-Control-Request-Headers':'X-Write-Token' },
  }), {});
  assert.strictEqual(preflight.status, 204, 'write preflight must succeed');
  const badAuth = await worker.fetch(new Request('https://worker.example/auth/check', { headers:{'X-Write-Token':'old'} }), { ADMIN_WRITE_TOKEN:'current' });
  assert.strictEqual(badAuth.status, 401, 'stale admin token must be rejected');
  const goodAuth = await worker.fetch(new Request('https://worker.example/auth/check', { headers:{'X-Write-Token':'current'} }), { ADMIN_WRITE_TOKEN:'current', RELEASE_SHA:'unit-test' });
  assert.strictEqual(goodAuth.status, 200, 'current admin token must be accepted');

  let deleteCall = null;
  global.fetch = async (input, init = {}) => {
    deleteCall = { url:String(input), body:JSON.parse(String(init.body || '{}')) };
    return new Response(JSON.stringify({ deleted_horses:12, deleted_races:1 }), { status:200 });
  };
  const deleteResponse = await worker.fetch(new Request('https://worker.example/rpc/delete-keiba-day', {
    method:'POST', headers:{'Content-Type':'application/json','X-Write-Token':'current'},
    body:JSON.stringify({baba_code:'31',race_date:'2026/07/25'}),
  }), { ADMIN_WRITE_TOKEN:'current', SUPABASE_SERVICE_KEY:'service-test' });
  assert.strictEqual(deleteResponse.status, 200, 'atomic meeting-day delete must be accepted');
  assert(deleteCall.url.endsWith('/rest/v1/rpc/delete_keiba_day'), 'delete must use the database RPC');
  assert.deepStrictEqual(deleteCall.body, {p_baba_code:'31',p_race_date:'2026/07/25'});

  const writes = [];
  const requested = [];
  let minutesAhead = 10;
  global.fetch = async (input, init = {}) => {
    const url = String(input); requested.push(url);
    if (url.includes('/OddsTanFuku?')) return new Response(singleHtml(minutesAhead), { status:200 });
    if (url.includes('/OddsUmLenFuku?')) return new Response(pairHtml, { status:200 });
    if (url.includes('?select=')) return new Response('[]', { status:200, headers:{'Content-Type':'application/json'} });
    const body = init.body ? JSON.parse(String(init.body)) : null;
    writes.push({ url, body, headers:init.headers || {} });
    return new Response('', { status:201 });
  };

  async function fireSchedule() {
    const pending = [];
    await worker.scheduled({}, { SUPABASE_SERVICE_KEY:'service-test', RELEASE_SHA:'unit-test' }, {
      waitUntil(promise) { pending.push(Promise.resolve(promise)); },
    });
    await Promise.all(pending);
  }

  await fireSchedule();
  minutesAhead = 5;
  await fireSchedule();

  const oddsWrites = writes.filter(x => x.url.endsWith('/rest/v1/keiba_odds_snapshots'));
  const checkpointWrites = writes.filter(x => x.url.endsWith('/rest/v1/keiba_market_checkpoints'));
  const ledgerWrites = writes.filter(x => x.url.endsWith('/rest/v1/keiba_value_t10_ledger'));
  const runWrites = writes.filter(x => x.url.endsWith('/rest/v1/keiba_capture_runs'));
  assert.strictEqual(oddsWrites.length, 2, 'T10 and T5 must each write one snapshot batch');
  assert(oddsWrites.every(write => write.body.length === 24), 'each checkpoint must contain 12 races x 2 runners');
  assert(oddsWrites.flatMap(write => write.body).every(row => row.baba_code === '31'), 'all snapshots must be Kochi');
  assert.strictEqual(checkpointWrites.length, 2, 'T10 and T5 must each write one checkpoint batch');
  assert(checkpointWrites[0].body.every(row => row.phase === 't10' && row.status === 'complete'), 'T10 single boards must be complete');
  assert(checkpointWrites[1].body.every(row => row.phase === 't5' && row.status === 'complete'), 'T5 pair boards must be complete');
  assert(checkpointWrites[1].body.every(row => row.payload.umaren.rows.length === 1), 'T5 must retain the complete quinella board');
  assert(ledgerWrites.some(write => write.body.length === 12), 'all 12 T10 denominator rows must be recorded');
  assert.strictEqual(runWrites.length, 2, 'checkpoint captures must always be audited');
  assert.strictEqual(requested.filter(url => url.includes('/OddsUmLenFuku?')).length, 12, 'pair odds must be fetched only at T5');
  assert(requested.filter(url => url.startsWith('https://www.keiba.go.jp/')).every(url => url.includes('k_babaCode=31')), 'every official request must use Kochi code 31');

  console.log('Kochi cloud capture unit: exact T10/T5, complete pair boards, deterministic storage and audit OK');
})().catch(error => { console.error(error); process.exit(1); });
