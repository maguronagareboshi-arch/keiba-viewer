'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = require(path.join(root, 'modules', 'umaren-distortion-shadow.js'));
  const workerSource = fs.readFileSync(path.join(root, 'cloudflare-worker.js'), 'utf8');
  const workerUrl = `data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`;
  const worker = await import(workerUrl);
  const numbers = [
    [56, .2, .1, .2, .3, -.3, .1, .02, -.8, .4, .2, .1, .05, .2, .3],
    [51, .1, 0, .1, .2, -.5, .2, 0, -.9, .3, .1, 0, .02, .1, .2],
    [47, 0, -.1, 0, .1, -.7, 0, -.02, -1.0, .2, 0, -.1, 0, 0, .1],
    [44, -.1, -.2, -.1, 0, -.9, -.1, -.03, -1.1, .1, -.1, -.2, -.02, -.1, 0],
    [40, -.2, -.3, -.2, -.1, -1.1, -.2, -.04, -1.2, 0, -.2, -.3, -.04, -.2, -.1],
    [36, -.3, -.4, -.3, -.2, -1.3, -.3, -.05, -1.3, -.1, -.3, -.4, -.06, -.3, -.2],
  ];
  const scored = numbers.map((x,index) => ({
    horse:{ umaBan:index + 1, horseName:`Horse ${index + 1}` }, totalScore:70-index*4,
    baseScore:x[0], condMod:x[1], distMod:x[2], rotMod:x[3], classMod:x[4], _cornModRaw:x[5],
    trendMod:x[6], weightMod:x[7], agariMod:x[8], comboMod:x[9], marginMod:x[10],
    winStrMod:x[11], takiMod:x[12], cornConsistMod:x[13], rakuMod:x[14],
  }));
  const vnextRanks = new Map(scored.map((row,index) => [row.horse.umaBan,index]));
  const market = [2.1,4.8,9.5,13.2,21.0,35.0].map((odds,index) => ({u:index+1,odds}));
  const input = {
    schema:'kochi_umaren_cloud_input/v1', babaCode:'31', raceNo:1,
    modelId:browser.contract.modelId, modelFingerprint:browser.modelFingerprint,
    runnerSet:[1,2,3,4,5,6],
    runners:scored.map((row,index) => ({
      u:index+1,name:row.horse.horseName,totalScore:row.totalScore,vnextRank:vnextRanks.get(index+1),
      x:{baseScore:row.baseScore,condMod:row.condMod,distMod:row.distMod,rotMod:row.rotMod,
        classMod:row.classMod,cornModRaw:row._cornModRaw,trendMod:row.trendMod,weightMod:row.weightMod,
        agariMod:row.agariMod,comboMod:row.comboMod,marginMod:row.marginMod,winStrMod:row.winStrMod,
        takiMod:row.takiMod,cornConsistMod:row.cornConsistMod,rakuMod:row.rakuMod},
    })),
  };
  const browserAxis = browser.scoreAxis(scored,market,vnextRanks);
  const cloudAxis = worker.scoreCloudUmarenAxis(input,market);
  assert.deepStrictEqual(cloudAxis,browserAxis,'cloud T10 output must exactly match the browser model');

  const pairRows=[];
  for (let first=1;first<=6;first++) for (let second=first+1;second<=6;second++) {
    pairRows.push({first,second,odds:5 + first*4 + second*2});
  }
  const axisSnapshot={ selected:3, rows:browserAxis.rows, runnerSet:browserAxis.runnerSet };
  const browserPairs=browser.scorePairs(axisSnapshot,scored,pairRows);
  const cloudPairs=worker.scoreCloudUmarenPairs(axisSnapshot,input,pairRows);
  assert.deepStrictEqual(cloudPairs,browserPairs,'cloud T5 output must exactly match the browser model');

  const wrongTrack={...input,babaCode:'36'};
  assert.strictEqual(worker.scoreCloudUmarenAxis(wrongTrack,market).reason,'INVALID_CLOUD_INPUT','non-Kochi input must be rejected');

  let savedT10=null, savedT5=null;
  global.fetch=async (target,init={}) => {
    const url=String(target);
    if (url.includes('/keiba_ai_predictions?')) return new Response(JSON.stringify([{
      race_no:1,computed_at:'2026-08-01T05:00:00Z',payload:{umarenCloudInput:input},
    }]),{status:200,headers:{'Content-Type':'application/json'}});
    if (url.includes('/keiba_value_t10_ledger?')) return new Response(JSON.stringify(savedT10 ? [{race_no:1,payload:savedT10.payload}] : []),
      {status:200,headers:{'Content-Type':'application/json'}});
    if (url.endsWith('/rest/v1/keiba_value_t10_ledger') && init.method === 'POST') {
      const rows=JSON.parse(String(init.body));
      for (const row of rows) { if (row.id.startsWith('umaren_t10_')) savedT10=row; if (row.id.startsWith('umaren_t5_')) savedT5=row; }
      return new Response('',{status:201});
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const env={SUPABASE_SERVICE_KEY:'test'};
  const t10Run=await worker.runCloudUmarenInference(env,{date:'2026/08/01',races:[{
    race_no:1,status:'CAPTURED',minutes_to_post:10,post_time:'18:00',raw_sha256:'single-sha',market_rows:market,
  }]});
  assert.strictEqual(t10Run.saved,1,'cloud T10 must persist one inference row');
  assert.strictEqual(savedT10.payload.execution,'cloud_worker');
  // Force a valid axis so the storage path is tested independently from this synthetic fixture's gate result.
  savedT10.payload.selected=3;
  const t5Run=await worker.runCloudUmarenInference(env,{date:'2026/08/01',races:[{
    race_no:1,status:'CAPTURED',minutes_to_post:5,post_time:'18:00',pair_raw_sha256:'pair-sha',pair_rows:pairRows,
  }]});
  assert.strictEqual(t5Run.saved,1,'cloud T5 must persist one inference row');
  assert.strictEqual(savedT5.payload.execution,'cloud_worker');
  assert.strictEqual(savedT5.baba_code,'31');
  console.log('Kochi umaren cloud equivalence: browser and Worker T10/T5 outputs are identical');
})().catch(error => { console.error(error); process.exit(1); });
