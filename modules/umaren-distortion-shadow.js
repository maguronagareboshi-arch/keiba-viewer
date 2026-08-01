/*
 * 高知 馬連「AI評価と市場評価の差」モデル v1。
 * T10で回収率型の軸を固定し、T5馬連オッズをレース選別にだけ使って
 * 現行能力AI上位2頭へ流す。現行の◎○▲△は変更しない。
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.KvUmarenDistortionShadow = api;
    root.kvCaptureUmarenAxisT10 = api.captureT10;
    root.kvCaptureUmarenDecisionT5 = api.captureT5;
    root.kvGetUmarenDistortionState = api.getState;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  const MODEL = Object.freeze({
    schema:'kochi_umaren_distortion_shadow/v1',
    modelId:'kochi-umaren-distortion-shadow-v1',
    status:'forward_shadow_only',
    productionMarksAllowed:false,
    dataCutoff:'2024-12-31',
    axisRule:Object.freeze({ probabilityType:'avg', oddsMin:8, oddsMax:50, evMin:0.5,
      marketRankMin:3, currentRankMax:5, vnextRankMax:3 }),
    pairRule:Object.freeze({ calibrationAlpha:0.9173336186692329, oddsMax:50,
      evMin:0, gapMin:1, currentPartnerCount:2 }),
    referenceBudget:Object.freeze({ raceYen:5000, perTicketYen:2500, tickets:2 }),
    capture:Object.freeze({
      t10Min:10, t10Max:10.9, t5Min:5, t5Max:5.9,
      maxMarketAgeMinutes:2, maxFetchDurationSeconds:120,
      singleSource:'first_party_worker:keiba.go.jp/OddsTanFuku',
      pairSource:'first_party_worker:keiba.go.jp/OddsUmLenFuku',
    }),
    evidence:Object.freeze({
      calibrationYears:'2022-2024', developmentYear:2025,
      exploratoryConfirmation:'2026 through 2026-07-11',
      caveat:'mark-flow rule was designed after inspecting the 2026 direct-EV result',
    }),
    additive:Object.freeze({
      features:Object.freeze(['base','condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN','marginN','winStrN','takiN','cornConsistN','rakuN']),
      mean:Object.freeze([41.32801595491268,0.0020473612921104245,-0.07084211348685605,-0.19869143170747447,-0.00025725457913150854,-0.9749531770538747,-0.035359581578582405,-0.026176510941894205,-1.148061948884481,0.03340430712068965,-0.00000675293270177859,0.08164831584002123,0.013377238114837983,0.0031333607738218785,0.13458702064896755]),
      sd:Object.freeze([9.946127386540878,0.7559050374959382,0.3830344803411909,0.39587899451602265,0.38527370268303895,1.3658917072854169,0.7534613600017239,0.09476023325628567,0.33615523158006205,0.5611413822096927,0.44853693809948136,0.17894687179303576,0.08858550879983638,0.6088507006405194,0.7024965324613972]),
      w:Object.freeze([1.606183708761838,0.0273270585864609,0.027882738146400105,0.006245247732827066,0.15423734138248832,0.24575641323886596,0.1311015684275099,0.044403344615545015,0.11678458406458045,0.28802836589206543,0.04417364560887074,-0.03586296481417553,-0.0003007276171790805,-0.11390036426742269,0.07448651694374255]),
    }),
    offset:Object.freeze({
      features:Object.freeze(['base','distNew','clsN','cornN','trendN','weightN','agariN','comboN','marginN','cornConsistN','rotTakiN']),
      mean:Object.freeze([41.32801595491268,-0.07084211348685605,-0.00025725457913150854,-0.9749531770538747,-0.035359581578582405,-0.026176510941894205,-1.148061948884481,0.03340430712068965,-0.00000675293270177859,0.0031333607738218785,-0.1853141935926545]),
      sd:Object.freeze([9.946127386540878,0.3830344803411909,0.38527370268303895,1.3658917072854169,0.7534613600017239,0.09476023325628567,0.33615523158006205,0.5611413822096927,0.44853693809948136,0.6088507006405194,0.4106685206767861]),
      w:Object.freeze([0.38517760144823615,-0.016054218219129533,0.0391511278280639,-0.034268446807129184,-0.001903264269807987,0.02703319236209095,0.02209957519840687,0.022646602643800137,-0.019540346760428123,-0.10017290243089289,-0.04434197027185414]),
    }),
  });
  const T10_PREFIX = 'umarenDistortionT10_v1';
  const T5_PREFIX = 'umarenDistortionT5_v1';

  const finite = value => {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const uma = value => {
    const number = Number.parseInt(value, 10);
    return Number.isInteger(number) && number > 0 ? number : null;
  };
  const raceDate = value => {
    const match = String(value || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    return match ? `${match[1]}/${String(match[2]).padStart(2,'0')}/${String(match[3]).padStart(2,'0')}` : '';
  };
  const round8 = value => Math.round((Number(value) + Number.EPSILON) * 1e8) / 1e8;
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  const fnv = value => {
    const text = stable(value);
    let first = 0x84222325, second = 0xcbf29ce4;
    for (let index = 0; index < text.length; index++) {
      first ^= text.charCodeAt(index); first = Math.imul(first, 0x1b3);
      second ^= text.charCodeAt(index); second = Math.imul(second, 0x1000193);
    }
    return (second >>> 0).toString(16).padStart(8,'0') + (first >>> 0).toString(16).padStart(8,'0');
  };
  const modelFingerprint = fnv(MODEL);
  const clone = value => { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const softmax = scores => {
    if (!Array.isArray(scores) || !scores.length || scores.some(value => !Number.isFinite(value))) return null;
    const maximum = Math.max(...scores);
    const exponents = scores.map(value => Math.exp(value - maximum));
    const total = exponents.reduce((sum, value) => sum + value, 0);
    return Number.isFinite(total) && total > 0 ? exponents.map(value => value / total) : null;
  };
  const runnerSet = rows => rows.map(row => uma(row?.horse?.umaBan ?? row?.u ?? row?.umaBan)).filter(Boolean).sort((a,b) => a-b);
  const sameSet = (left, right) => left.length === right.length && left.every((value,index) => value === right[index]);
  const keyFor = (prefix, date, raceNo) => `${prefix}|31|${date.replace(/\D/g,'')}|${String(Number(raceNo)).padStart(2,'0')}`;

  function featureMap(scored) {
    const rot = finite(scored?.rotMod) ?? 0;
    const taki = finite(scored?.takiMod) ?? 0;
    return {
      base:scored?.baseScore, condNew:scored?.condMod, distNew:scored?.distMod,
      rotN:scored?.rotMod, clsN:scored?.classMod, cornN:scored?._cornModRaw,
      trendN:scored?.trendMod, weightN:scored?.weightMod, agariN:scored?.agariMod,
      comboN:scored?.comboMod, marginN:scored?.marginMod, winStrN:scored?.winStrMod,
      takiN:scored?.takiMod, cornConsistN:scored?.cornConsistMod, rakuN:scored?.rakuMod,
      rotTakiN:rot + taki,
    };
  }

  function standardizedScore(raw, specification) {
    return specification.features.reduce((sum, name, index) => {
      const value = finite(raw[name]);
      const clean = value == null ? 0 : value;
      return sum + ((clean - specification.mean[index]) / specification.sd[index]) * specification.w[index];
    }, 0);
  }

  function buildVnextRanks(raceNo, scored) {
    try {
      const scorer = root?.KvVnextPartnerShadow;
      const rawFor = root?.kvVnextRawForScored;
      if (!scorer || typeof scorer.scoreRace !== 'function' || typeof rawFor !== 'function') return null;
      const input = scored.map(row => ({
        u:uma(row?.horse?.umaBan), name:String(row?.horse?.horseName || ''),
        currentScore:finite(row?.totalScore), raw:rawFor(raceNo, row),
      }));
      if (input.some(row => !row.u || row.currentScore == null || !row.raw)) return null;
      const result = scorer.scoreRace(input);
      if (!result?.ok || !result.anchor || !Array.isArray(result.ranked)) return null;
      const ranks = new Map([[uma(result.anchor.u), 0]]);
      result.ranked.forEach((row,index) => ranks.set(uma(row.u), index + 1));
      return ranks.size === scored.length ? ranks : null;
    } catch (_) { return null; }
  }

  function scoreAxis(scored, marketRows, vnextRanks) {
    if (!Array.isArray(scored) || scored.length < 4) return { ok:false, reason:'INSUFFICIENT_RUNNERS', rows:[], candidate:null };
    if (!Array.isArray(marketRows) || marketRows.length !== scored.length) return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH', rows:[], candidate:null };
    const runners = scored.map(row => ({
      u:uma(row?.horse?.umaBan), name:String(row?.horse?.horseName || ''),
      currentScore:finite(row?.totalScore), raw:featureMap(row),
    }));
    const market = marketRows.map(row => ({ u:uma(row?.u ?? row?.umaBan), odds:finite(row?.odds) }));
    if (runners.some(row => !row.u || row.currentScore == null) || new Set(runners.map(row => row.u)).size !== runners.length) {
      return { ok:false, reason:'INCOMPLETE_ABILITY_UNIVERSE', rows:[], candidate:null };
    }
    if (market.some(row => !row.u || row.odds == null || row.odds <= 0) || new Set(market.map(row => row.u)).size !== market.length ||
        !sameSet(runnerSet(runners), runnerSet(market))) {
      return { ok:false, reason:'INCOMPLETE_T10_MARKET', rows:[], candidate:null };
    }
    const vnext = vnextRanks instanceof Map ? vnextRanks : new Map(Object.entries(vnextRanks || {}).map(([key,value]) => [uma(key), Number(value)]));
    if (runners.some(row => !Number.isInteger(vnext.get(row.u)))) return { ok:false, reason:'INCOMPLETE_VNEXT_RANKS', rows:[], candidate:null };

    const oddsByUma = new Map(market.map(row => [row.u,row.odds]));
    const currentOrder = runners.slice().sort((a,b) => b.currentScore-a.currentScore || a.u-b.u);
    const currentRank = new Map(currentOrder.map((row,index) => [row.u,index+1]));
    const marketOrder = market.slice().sort((a,b) => a.odds-b.odds || a.u-b.u);
    const marketRank = new Map(marketOrder.map((row,index) => [row.u,index+1]));
    const additiveScores = runners.map(row => standardizedScore(row.raw, MODEL.additive));
    const inverseTotal = market.reduce((sum,row) => sum + 1/row.odds,0);
    const offsetScores = runners.map(row => {
      const probability=(1/oddsByUma.get(row.u))/inverseTotal;
      return Math.log(Math.max(probability,1e-9)) + standardizedScore(row.raw, MODEL.offset);
    });
    const pAdditive = softmax(additiveScores), pOffset = softmax(offsetScores);
    if (!pAdditive || !pOffset) return { ok:false, reason:'PROBABILITY_FAILURE', rows:[], candidate:null };
    const exactEv = new Map();
    const gate = MODEL.axisRule;
    const rows = runners.map((row,index) => {
      const probability = (pAdditive[index] + pOffset[index]) / 2;
      const odds = oddsByUma.get(row.u), ev = probability * odds - 1;
      exactEv.set(row.u,ev);
      let reason = null;
      if (!(odds >= gate.oddsMin && odds < gate.oddsMax)) reason='ODDS_OUT_OF_BAND';
      else if (marketRank.get(row.u) < gate.marketRankMin) reason='TOO_POPULAR';
      else if (currentRank.get(row.u) > gate.currentRankMax) reason='ABILITY_RANK_TOO_LOW';
      else if (vnext.get(row.u) > gate.vnextRankMax) reason='VNEXT_RANK_TOO_LOW';
      else if (ev < gate.evMin) reason='EV_BELOW_THRESHOLD';
      return { u:row.u, name:row.name, odds:round8(odds), probability:round8(probability),
        pAdditive:round8(pAdditive[index]), pOffset:round8(pOffset[index]), ev:round8(ev),
        marketRank:marketRank.get(row.u), currentRank:currentRank.get(row.u), vnextRank:vnext.get(row.u),
        eligible:reason == null, reason };
    });
    const eligible = rows.filter(row => row.eligible).sort((a,b) => exactEv.get(b.u)-exactEv.get(a.u) || a.u-b.u);
    const candidate = eligible[0] || null;
    rows.forEach(row => { if (row.eligible && row !== candidate) row.reason='NOT_MAX_EV'; });
    return { ok:true, reason:candidate ? 'AXIS_SELECTED' : 'NO_AXIS', rows, candidate,
      runnerSet:runners.map(row => row.u).sort((a,b) => a-b), modelId:MODEL.modelId, modelFingerprint };
  }

  function comboKey(first, second) { return [uma(first),uma(second)].sort((a,b) => a-b).join('-'); }

  function scorePairs(axisSnapshot, scored, pairRows) {
    if (!axisSnapshot?.selected || !Array.isArray(axisSnapshot.rows)) return { ok:false, reason:'NO_T10_AXIS', trigger:false, tickets:[] };
    const currentSet = runnerSet(scored);
    if (!sameSet(currentSet, (axisSnapshot.runnerSet || []).slice().sort((a,b) => a-b))) return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH', trigger:false, tickets:[] };
    const board = new Map();
    for (const row of Array.isArray(pairRows) ? pairRows : []) {
      const first=uma(row?.first ?? row?.combo?.[0]), second=uma(row?.second ?? row?.combo?.[1]), odds=finite(row?.odds);
      if (!first || !second || first === second || odds == null || odds <= 0) return { ok:false, reason:'INVALID_T5_PAIR_MARKET', trigger:false, tickets:[] };
      const key=comboKey(first,second);
      if (board.has(key)) return { ok:false, reason:'DUPLICATE_T5_PAIR', trigger:false, tickets:[] };
      board.set(key,{ first:Math.min(first,second), second:Math.max(first,second), odds });
    }
    const expected=[];
    for (let left=0; left<currentSet.length; left++) for (let right=left+1; right<currentSet.length; right++) expected.push(comboKey(currentSet[left],currentSet[right]));
    if (board.size !== expected.length || expected.some(key => !board.has(key))) return { ok:false, reason:'INCOMPLETE_T5_PAIR_MARKET', trigger:false, tickets:[] };

    const probabilityByUma = new Map(axisSnapshot.rows.map(row => [uma(row.u),finite(row.probability)]));
    if (currentSet.some(value => probabilityByUma.get(value) == null)) return { ok:false, reason:'INCOMPLETE_AXIS_PROBABILITIES', trigger:false, tickets:[] };
    const rawPair = new Map();
    for (const key of expected) {
      const [first,second]=key.split('-').map(Number), p1=probabilityByUma.get(first), p2=probabilityByUma.get(second);
      rawPair.set(key,(p1*p2/(1-p1)) + (p2*p1/(1-p2)));
    }
    const rawTotal=[...rawPair.values()].reduce((sum,value) => sum+value,0);
    const powered=new Map([...rawPair].map(([key,value]) => [key,Math.pow(value/rawTotal,MODEL.pairRule.calibrationAlpha)]));
    const poweredTotal=[...powered.values()].reduce((sum,value) => sum+value,0);
    const inverseTotal=[...board.values()].reduce((sum,row) => sum + 1/row.odds,0);
    const axis=uma(axisSnapshot.selected), choices=[];
    for (const value of currentSet) {
      if (value === axis) continue;
      const key=comboKey(axis,value), market=board.get(key), probability=powered.get(key)/poweredTotal;
      const marketProbability=(1/market.odds)/inverseTotal, ev=probability*market.odds-1, gap=probability/marketProbability;
      choices.push({ combo:[market.first,market.second], partner:value, odds:round8(market.odds),
        probability:round8(probability), marketProbability:round8(marketProbability),
        ev:round8(ev), gapRatio:round8(gap),
        eligible:market.odds <= MODEL.pairRule.oddsMax && ev >= MODEL.pairRule.evMin && gap >= MODEL.pairRule.gapMin });
    }
    choices.sort((a,b) => b.ev-a.ev || b.gapRatio-a.gapRatio || a.partner-b.partner);
    const triggerChoice=choices.find(row => row.eligible) || null;
    const currentOrder=scored.map(row => ({ u:uma(row?.horse?.umaBan), score:finite(row?.totalScore), name:String(row?.horse?.horseName || '') }))
      .filter(row => row.u !== axis).sort((a,b) => b.score-a.score || a.u-b.u).slice(0,MODEL.pairRule.currentPartnerCount);
    const tickets=currentOrder.map(row => {
      const market=board.get(comboKey(axis,row.u));
      return { combo:[market.first,market.second], partner:row.u, partnerName:row.name,
        odds:round8(market.odds), referenceStakeYen:MODEL.referenceBudget.perTicketYen };
    });
    return { ok:true, reason:triggerChoice ? 'DISTORTION_TRIGGER' : 'NO_DISTORTION', trigger:!!triggerChoice,
      axis, choices, triggerChoice, partners:currentOrder.map(row => row.u), tickets:triggerChoice ? tickets : [],
      referenceBudgetYen:triggerChoice ? MODEL.referenceBudget.raceYen : 0,
      modelId:MODEL.modelId, modelFingerprint };
  }

  function validCapture(context, phase) {
    const capture=MODEL.capture, minutes=finite(context?.timing?.minutesBeforeStart);
    const expectedSource=phase === 't10' ? capture.singleSource : capture.pairSource;
    const observed=Date.parse(String(context?.market?.observedAt || ''));
    const requested=Date.parse(String(context?.market?.requestedAt || ''));
    const age=(Date.now()-observed)/60000, duration=(observed-requested)/1000;
    const minimum=phase === 't10' ? capture.t10Min : capture.t5Min;
    const maximum=phase === 't10' ? capture.t10Max : capture.t5Max;
    if (minutes == null || minutes < minimum || minutes > maximum) return { ok:false, reason:`OUTSIDE_${phase.toUpperCase()}_WINDOW` };
    if (context?.market?.source !== expectedSource || !Number.isFinite(observed) || !Number.isFinite(requested) ||
        age < 0 || age > capture.maxMarketAgeMinutes || duration < 0 || duration > capture.maxFetchDurationSeconds) {
      return { ok:false, reason:'STALE_OR_UNVERIFIED_MARKET' };
    }
    return { ok:true };
  }

  function getStored(key) {
    try { return typeof root?.lsRead === 'function' ? root.lsRead()[key] || null : null; } catch (_) { return null; }
  }
  function saveStored(key,value) {
    if (typeof root?.lsWrite !== 'function') return false;
    root.lsWrite(key,value); return true;
  }
  function isAdmin() { try { return typeof root?.isAdminMode === 'function' && root.isAdminMode(); } catch (_) { return false; } }
  function persist(id,row) {
    if (typeof root?.apiUpsert !== 'function') return;
    Promise.resolve(root.apiUpsert('keiba_value_t10_ledger',id,row)).catch(error => console.warn('[umaren distortion persist]',error));
  }

  function captureT10(context) {
    try {
      if (!isAdmin()) return { saved:false, reason:'NOT_ADMIN' };
      const valid=validCapture(context,'t10'); if (!valid.ok) return { saved:false, reason:valid.reason };
      const date=raceDate(context.raceDate), raceNo=Number(context.raceNo), key=keyFor(T10_PREFIX,date,raceNo);
      const prior=getStored(key); if (prior) return { saved:false, reason:'DUPLICATE', snapshot:prior };
      const vnext=buildVnextRanks(raceNo,context.scored);
      if (!vnext) return { saved:false, reason:'INCOMPLETE_VNEXT_RANKS' };
      const result=scoreAxis(context.scored,context.market.rows,vnext);
      if (!result.ok) return { saved:false, reason:result.reason };
      const snapshot={ type:'umarenDistortionT10', schema:'kochi_umaren_distortion_t10/v1', status:'forward_shadow_only',
        babaCode:'31', raceDate:date, raceNo, capturedAt:new Date().toISOString(), scheduledStartAt:context.timing.scheduledStartAt,
        minutesBeforeStart:Number(context.timing.minutesBeforeStart), market:clone(context.market), runnerSet:result.runnerSet,
        model:{ id:MODEL.modelId, fingerprint:modelFingerprint, axisRule:MODEL.axisRule }, rows:result.rows,
        selected:result.candidate?.u ?? null, selectionReason:result.reason };
      snapshot.inputFingerprint=fnv({ raceDate:date,raceNo,market:snapshot.market,runnerSet:snapshot.runnerSet,rows:snapshot.rows });
      if (!saveStored(key,snapshot)) return { saved:false, reason:'NO_STORAGE' };
      const id=`umaren_t10_31_${date.replace(/\D/g,'')}_${String(raceNo).padStart(2,'0')}`;
      persist(id,{ baba_code:'31',race_date:date,race_no:raceNo,scheduled_post_at:snapshot.scheduledStartAt,
        status:snapshot.selected ? 'axis' : 'no_axis',transport:'first_party_worker+admin_viewer',
        runner_count:snapshot.runnerSet.length,model_fingerprint:modelFingerprint,payload:snapshot });
      return { saved:true, key, snapshot, result };
    } catch (error) { return { saved:false, reason:'CAPTURE_ERROR', error:String(error?.message || error) }; }
  }

  function captureT5(context) {
    try {
      if (!isAdmin()) return { saved:false, reason:'NOT_ADMIN' };
      const valid=validCapture(context,'t5'); if (!valid.ok) return { saved:false, reason:valid.reason };
      const date=raceDate(context.raceDate), raceNo=Number(context.raceNo), t10=getStored(keyFor(T10_PREFIX,date,raceNo));
      if (!t10) return { saved:false, reason:'NO_T10_SNAPSHOT' };
      if (!t10.selected) return { saved:false, reason:'NO_T10_AXIS', snapshot:t10 };
      const key=keyFor(T5_PREFIX,date,raceNo), prior=getStored(key);
      if (prior) return { saved:false, reason:'DUPLICATE', snapshot:prior };
      const result=scorePairs(t10,context.scored,context.market.rows);
      if (!result.ok) return { saved:false, reason:result.reason };
      const snapshot={ type:'umarenDistortionT5', schema:'kochi_umaren_distortion_t5/v1', status:'forward_shadow_only',
        babaCode:'31',raceDate:date,raceNo,capturedAt:new Date().toISOString(),scheduledStartAt:context.timing.scheduledStartAt,
        minutesBeforeStart:Number(context.timing.minutesBeforeStart),market:clone(context.market),runnerSet:t10.runnerSet,
        model:{ id:MODEL.modelId,fingerprint:modelFingerprint,pairRule:MODEL.pairRule,referenceBudget:MODEL.referenceBudget },
        axis:t10.selected,axisRow:t10.rows.find(row => row.u === t10.selected) || null,
        trigger:result.trigger,triggerChoice:result.triggerChoice,tickets:result.tickets,choices:result.choices,
        referenceBudgetYen:result.referenceBudgetYen,selectionReason:result.reason,t10InputFingerprint:t10.inputFingerprint };
      snapshot.inputFingerprint=fnv({ t10:t10.inputFingerprint,market:snapshot.market,trigger:snapshot.trigger,tickets:snapshot.tickets });
      if (!saveStored(key,snapshot)) return { saved:false, reason:'NO_STORAGE' };
      const id=`umaren_t5_31_${date.replace(/\D/g,'')}_${String(raceNo).padStart(2,'0')}`;
      persist(id,{ baba_code:'31',race_date:date,race_no:raceNo,scheduled_post_at:snapshot.scheduledStartAt,
        status:snapshot.trigger ? 'trigger' : 'no_bet',transport:'first_party_worker+admin_viewer',
        runner_count:snapshot.runnerSet.length,model_fingerprint:modelFingerprint,payload:snapshot });
      return { saved:true,key,snapshot,result };
    } catch (error) { return { saved:false,reason:'CAPTURE_ERROR',error:String(error?.message || error) }; }
  }

  function getState(dateValue,raceNo) {
    const date=raceDate(dateValue);
    return { t10:getStored(keyFor(T10_PREFIX,date,raceNo)), t5:getStored(keyFor(T5_PREFIX,date,raceNo)) };
  }

  return Object.freeze({ contract:MODEL, modelFingerprint, scoreAxis, scorePairs, buildVnextRanks,
    captureT10, captureT5, getState });
});
