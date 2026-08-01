'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  let launches=0, closed=0, moduleLoads=0, injectedToken='', timezone='', targetUrl='';
  global.__KV_TEST_PUPPETEER__={ launch:async binding => {
    assert.strictEqual(binding,'browser-binding'); launches++;
    return {
      newPage:async () => ({
        emulateTimezone:async value => { timezone=value; },
        evaluateOnNewDocument:async (_fn,value) => { injectedToken=value; },
        goto:async value => { targetUrl=value; },
        waitForFunction:async () => true,
        evaluate:async (_fn,date) => {
          if (date === undefined) { moduleLoads++; return true; }
          return { schema:'kochi_cloud_precompute_result/v1',babaCode:'31',raceDate:date,
            history:{races:12000,horses:50000},raceCount:1,eligible:1,published:1,failures:[],ok:true };
        },
      }),
      close:async () => { closed++; },
    };
  }};
  const root=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'cloudflare-worker.js'),'utf8')
    .replace("import puppeteer from '@cloudflare/puppeteer';",'const puppeteer = globalThis.__KV_TEST_PUPPETEER__;');
  const worker=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const signature=worker.cloudRunnerSignature(
    {distance:'1400',track_cond:'良',race_class:'C1'},
    [2,1].map(uma => ({uma_ban:uma,horse_name:`horse-${uma}`,jockey:'騎手',trainer:'厩舎',kinryo:'56',weight:'480',sex_age:'牡4'})),
  );
  assert.strictEqual(signature,'d7c2af6dc6fecd05','Worker and viewer must use the same runner-signature contract');
  let audit=null;
  global.fetch=async (input,init={}) => {
    const url=String(input);
    if (url.includes('/keiba_horses?')) return Response.json([1,2,3,4].map(uma => ({race_no:1,uma_ban:uma,chakujun:'',horse_name:`horse-${uma}`,jockey:'',trainer:'',kinryo:'',weight:'',sex_age:''})));
    if (url.includes('/keiba_races?')) return Response.json([{race_no:1,distance:'1400',track_cond:'良',race_class:'C1'}]);
    if (url.includes('/keiba_ai_predictions?')) return Response.json([]);
    if (url.includes('/keiba_capture_runs?')) return Response.json(audit ? [{status:audit.status,finished_at:audit.finished_at,details:audit.details}] : []);
    if (url.endsWith('/rest/v1/keiba_capture_runs') && init.method === 'POST') {
      audit=JSON.parse(String(init.body)); return new Response('',{status:201});
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const env={BROWSER:'browser-binding',ADMIN_WRITE_TOKEN:'admin-secret',SUPABASE_SERVICE_KEY:'service-secret',RELEASE_SHA:'test'};
  const first=await worker.runCloudBrowserPrecompute(env,'2026/08/01');
  assert.strictEqual(first.ok,true);
  assert.strictEqual(first.result.published,1);
  assert.strictEqual(launches,1);
  assert.strictEqual(closed,1);
  assert.strictEqual(moduleLoads,1,'AI insights module must be loaded before its cloud entry point is called');
  assert.strictEqual(injectedToken,'admin-secret');
  assert.strictEqual(timezone,'Asia/Tokyo');
  assert(targetUrl.startsWith('https://yukochi.com/?sim=1&date=2026%2F08%2F01'));
  assert.strictEqual(audit.id,'precompute_31_20260801');
  assert.strictEqual(audit.baba_code,'31');
  assert.strictEqual(audit.status,'success');

  const second=await worker.runCloudBrowserPrecompute(env,'2026/08/01');
  assert.strictEqual(second.attempted,false,'recent audit must suppress duplicate browser launches');
  assert.strictEqual(second.reason,'retry_cooldown');
  assert.strictEqual(launches,1);
  console.log('Kochi cloud precompute: missing inputs launch once, inject no user-PC state, and cooldown prevents duplicates');
})().catch(error => { console.error(error); process.exit(1); });
