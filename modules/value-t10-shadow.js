/*
 * 高知 T10 単勝価値モデル v1 / forward ledger v2。
 * 2024-12-31までの係数と条件を固定した forward-shadow 専用実装。
 * 公開印・買い推奨・金額表示には一切使わない。
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.KvT10ValueShadow = api;
    root.kvComputeT10ValueShadow = api.computeLive;
    root.kvCaptureT10ValueShadow = api.captureLive;
    root.kvPersistT10DecisionLedger = api.persistDecisionLedger;
    root.kvRefreshT10LedgerMonitor = api.refreshDecisionLedgerMonitor;
    root.kvListT10ValueShadowSnapshots = api.listSnapshots;
    root.kvEvaluateT10ValueShadow = api.evaluateSnapshots;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  const MODEL = Object.freeze({
    schema:'kochi_t10_value_model/v1',
    modelId:'kochi-t10-value-shadow-v1',
    status:'forward_shadow_only',
    productionAllowed:false,
    dataCutoff:'2024-12-31',
    trainedRaces:12070,
    probability:'normalize(sqrt(p_additive * p_current))',
    betaCurrent:1.191459575752015,
    gates:Object.freeze({ oddsMin:5, oddsMax:20, marketRankMin:4, currentRankMax:5, evMin:0.75 }),
    capture:Object.freeze({ minutesMin:10, minutesMax:10.9, maxMarketAgeMinutes:2,
      maxFetchDurationSeconds:120, source:'first_party_worker:keiba.go.jp/OddsTanFuku', maxPicksPerRace:1 }),
    confirmation:Object.freeze({ years:'2025-2026', bets:273, roi:104.18,
      dayBootstrap95:Object.freeze([68.28,144.49]), roiWithoutTopPayout:95.05, maxLosingStreak:37,
      currentScoreCaveat:'104.18% historical confirmation used legacy_v2_anchor.score_approx; the deployed live totalScore stream requires independent forward validation' }),
    additive:Object.freeze({
      features:Object.freeze(['base','condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN','marginN','winStrN','takiN','cornConsistN','rakuN']),
      mean:Object.freeze([41.32801595491268,0.0020473612921104245,-0.07084211348685605,-0.19869143170747447,-0.00025725457913150854,-0.9749531770538747,-0.035359581578582405,-0.026176510941894205,-1.148061948884481,0.03340430712068965,-0.00000675293270177859,0.08164831584002123,0.013377238114837983,0.0031333607738218785,0.13458702064896755]),
      sd:Object.freeze([9.946127386540878,0.7559050374959382,0.3830344803411909,0.39587899451602265,0.38527370268303895,1.3658917072854169,0.7534613600017239,0.09476023325628567,0.33615523158006205,0.5611413822096927,0.44853693809948136,0.17894687179303576,0.08858550879983638,0.6088507006405194,0.7024965324613972]),
      w:Object.freeze([1.606183708761838,0.0273270585864609,0.027882738146400105,0.006245247732827066,0.15423734138248832,0.24575641323886596,0.1311015684275099,0.044403344615545015,0.11678458406458045,0.28802836589206543,0.04417364560887074,-0.03586296481417553,-0.0003007276171790805,-0.11390036426742269,0.07448651694374255]),
    }),
  });
  const SNAPSHOT_TYPE = 'valueT10ShadowSnapshot';
  const SNAPSHOT_SCHEMA = 'value_t10_shadow_snapshot/v2';
  const SNAPSHOT_KEY_PREFIX = 'valueT10Shadow_v2';

  const finite = value => {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const uma = value => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const date = value => {
    const m = String(value || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    return m ? `${m[1]}/${String(m[2]).padStart(2,'0')}/${String(m[3]).padStart(2,'0')}` : '';
  };
  const round8 = n => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  };
  const fnv = value => {
    const text = stable(value);
    let h1 = 0x84222325, h2 = 0xcbf29ce4;
    for (let i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i); h1 = Math.imul(h1, 0x1b3);
      h2 ^= text.charCodeAt(i); h2 = Math.imul(h2, 0x1000193);
    }
    return (h2 >>> 0).toString(16).padStart(8,'0') + (h1 >>> 0).toString(16).padStart(8,'0');
  };
  const modelFingerprint = fnv(MODEL);
  const cloneJson = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const same = (left, right) => stable(left) === stable(right);
  const sortedUma = values => values.map(uma).filter(Boolean).sort((a,b) => a-b);

  function rankingModelIdentity() {
    try {
      const build = root && root.buildRankingModelIdentity;
      if (typeof build !== 'function') return null;
      const identity = cloneJson(build());
      if (!identity || typeof identity !== 'object' || !String(identity.fingerprint || '')) return null;
      identity.fingerprint = String(identity.fingerprint);
      return identity;
    } catch (_) { return null; }
  }

  function softmax(logits) {
    if (!Array.isArray(logits) || !logits.length || logits.some(v => !Number.isFinite(v))) return null;
    const mx = Math.max(...logits);
    const exp = logits.map(v => Math.exp(v - mx));
    const sum = exp.reduce((a,b) => a + b, 0);
    return Number.isFinite(sum) && sum > 0 ? exp.map(v => v / sum) : null;
  }

  function featureMap(scored) {
    return {
      base:scored.baseScore, condNew:scored.condMod, distNew:scored.distMod,
      rotN:scored.rotMod, clsN:scored.classMod, cornN:scored._cornModRaw,
      trendN:scored.trendMod, weightN:scored.weightMod, agariN:scored.agariMod,
      comboN:scored.comboMod, marginN:scored.marginMod, winStrN:scored.winStrMod,
      takiN:scored.takiMod, cornConsistN:scored.cornConsistMod, rakuN:scored.rakuMod,
    };
  }

  function normalizedFeatures(scored) {
    const raw = featureMap(scored || {});
    return Object.fromEntries(MODEL.additive.features.map(key => [key, finite(raw[key])]));
  }

  function scoredFromInputRows(inputRows) {
    if (!Array.isArray(inputRows)) return [];
    return inputRows.map(row => {
      const f = row && row.features || {};
      return {
        horse:{ umaBan:row && row.u, horseName:String(row && row.name || '') },
        totalScore:row && row.currentScore,
        siCount:row && row.quality && row.quality.siCount,
        kochiSICount:row && row.quality && row.quality.kochiSICount,
        isTransfer:!!(row && row.quality && row.quality.isTransfer),
        isEstimatedScore:!!(row && row.quality && row.quality.isEstimatedScore),
        baseScore:f.base, condMod:f.condNew, distMod:f.distNew, rotMod:f.rotN,
        classMod:f.clsN, _cornModRaw:f.cornN, trendMod:f.trendN,
        weightMod:f.weightN, agariMod:f.agariN, comboMod:f.comboN,
        marginMod:f.marginN, winStrMod:f.winStrN, takiMod:f.takiN,
        cornConsistMod:f.cornConsistN, rakuMod:f.rakuN,
      };
    });
  }

  function scoreRace(scored, marketRows) {
    if (!Array.isArray(scored) || scored.length < 4) return { ok:false, reason:'INSUFFICIENT_RUNNERS', rows:[], candidate:null };
    if (!Array.isArray(marketRows) || marketRows.length !== scored.length) return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH', rows:[], candidate:null };
    const runners = scored.map(s => ({
      scored:s, u:uma(s?.horse?.umaBan), name:String(s?.horse?.horseName || ''), currentScore:finite(s?.totalScore), feat:normalizedFeatures(s || {}),
      quality:{ siCount:Number(s?.siCount || 0), kochiSICount:Number(s?.kochiSICount || 0),
        isTransfer:!!s?.isTransfer, isEstimatedScore:!!s?.isEstimatedScore },
    }));
    const market = marketRows.map(r => ({ u:uma(r?.u ?? r?.umaBan), odds:finite(r?.odds) }));
    if (runners.some(r => r.u == null || r.currentScore == null) || new Set(runners.map(r => r.u)).size !== runners.length) {
      return { ok:false, reason:'INCOMPLETE_ABILITY_UNIVERSE', rows:[], candidate:null };
    }
    if (market.some(r => r.u == null || r.odds == null || r.odds <= 0) || new Set(market.map(r => r.u)).size !== market.length) {
      return { ok:false, reason:'INCOMPLETE_T10_MARKET', rows:[], candidate:null };
    }
    const runnerSet = runners.map(r => r.u).sort((a,b) => a-b);
    const marketSet = market.map(r => r.u).sort((a,b) => a-b);
    if (runnerSet.join(',') !== marketSet.join(',')) return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH', rows:[], candidate:null };
    const oddsByU = new Map(market.map(r => [r.u, r.odds]));
    const inputRows = runners.map(r => ({
      u:r.u, name:r.name, currentScore:r.currentScore,
      features:Object.fromEntries(MODEL.additive.features.map(key => [key, r.feat[key]])),
      quality:{ ...r.quality, missingFeatureCount:MODEL.additive.features.filter(key => r.feat[key] == null).length },
      odds:oddsByU.get(r.u),
    })).sort((a,b) => a.u - b.u);
    const abilityOrder = runners.slice().sort((a,b) => b.currentScore - a.currentScore || a.u - b.u);
    const currentRank = new Map(abilityOrder.map((r,i) => [r.u, i + 1]));
    const marketOrder = market.slice().sort((a,b) => a.odds - b.odds || a.u - b.u);
    const marketRank = new Map(marketOrder.map((r,i) => [r.u, i + 1]));

    const A = MODEL.additive;
    const additiveLogits = runners.map(r => A.features.reduce((sum,key,i) => {
      const value = finite(r.feat[key]);
      return sum + (((value == null ? 0 : value) - A.mean[i]) / A.sd[i]) * A.w[i];
    }, 0));
    const pAdditive = softmax(additiveLogits);
    const avg = runners.reduce((sum,r) => sum + r.currentScore, 0) / runners.length;
    const sd0 = Math.sqrt(runners.reduce((sum,r) => sum + Math.pow(r.currentScore - avg, 2), 0) / runners.length);
    const sd = sd0 < 1e-12 ? 1 : sd0;
    const pCurrent = softmax(runners.map(r => MODEL.betaCurrent * ((r.currentScore - avg) / sd)));
    if (!pAdditive || !pCurrent) return { ok:false, reason:'PROBABILITY_FAILURE', rows:[], candidate:null };
    const rawBlend = runners.map((_,i) => Math.sqrt(pAdditive[i] * pCurrent[i]));
    const blendSum = rawBlend.reduce((a,b) => a+b, 0);
    if (!Number.isFinite(blendSum) || blendSum <= 0) return { ok:false, reason:'PROBABILITY_FAILURE', rows:[], candidate:null };
    const pBlend = rawBlend.map(v => v / blendSum);
    const G = MODEL.gates;
    const exactEvByU = new Map();
    const rows = runners.map((r,i) => {
      const odds = oddsByU.get(r.u), ev = pBlend[i] * odds - 1;
      exactEvByU.set(r.u, ev);
      let reason = null;
      if (!(odds >= G.oddsMin && odds < G.oddsMax)) reason = 'ODDS_OUT_OF_BAND';
      else if (!(marketRank.get(r.u) >= G.marketRankMin)) reason = 'TOO_POPULAR';
      else if (!(currentRank.get(r.u) <= G.currentRankMax)) reason = 'ABILITY_RANK_TOO_LOW';
      else if (!(ev >= G.evMin)) reason = 'EV_BELOW_THRESHOLD';
      return {
        u:r.u, uma:r.u, name:r.name, odds:round8(odds), marketRank:marketRank.get(r.u),
        currentRank:currentRank.get(r.u), pAdditive:round8(pAdditive[i]), pCurrent:round8(pCurrent[i]),
        probability:round8(pBlend[i]), ev:round8(ev), eligible:reason == null, reason,
      };
    });
    const eligible = rows.filter(r => r.eligible)
      .sort((a,b) => exactEvByU.get(b.u) - exactEvByU.get(a.u) || a.u - b.u);
    const candidate = eligible[0] || null;
    rows.forEach(r => { if (r.eligible && r !== candidate) r.reason = 'NOT_MAX_EV'; });
    return { ok:true, reason:candidate ? 'SHADOW_CANDIDATE' : 'NO_QUALIFYING_VALUE', rows,
      candidate, inputRows, modelId:MODEL.modelId, modelFingerprint, publicEligible:false };
  }

  function liveMarket(raceNo, scored) {
    try {
      const races = root && root.allRacesData;
      const race = races && races[raceNo];
      if (!race || !race.raceInfo || !Array.isArray(race.horses)) return { ok:false, reason:'NO_RACE' };
      if (String(race.raceInfo.babaCode ?? '') !== '31') return { ok:false, reason:'NOT_KOCHI' };
      const raceDate = date(race.raceInfo.raceDate);
      const timeMeta = root && root._aiPredictionTimeMeta;
      const timing = typeof timeMeta === 'function' ? timeMeta(raceDate, raceNo, '31') : null;
      if (!timing || timing.timing !== 'verified_prestart' || !Number.isFinite(Number(timing.minutesBeforeStart)) ||
          !Number.isFinite(Date.parse(timing.scheduledStartAt))) {
        return { ok:false, reason:'NOT_VERIFIED_PRESTART' };
      }
      const minutes = Number(timing.minutesBeforeStart), C = MODEL.capture;
      if (minutes < C.minutesMin || minutes > C.minutesMax) return { ok:false, reason:minutes > C.minutesMax ? 'WAIT_FOR_T10' : 'T10_WINDOW_CLOSED' };
      const observedMs = Date.parse(race._liveOddsObservedAt);
      const requestedMs = Number(race._liveOddsRequestNonce);
      const ageMinutes = (Date.now() - observedMs) / 60000;
      const fetchDurationSeconds = (observedMs - requestedMs) / 1000;
      if (race._liveOddsSource !== C.source || !Number.isFinite(observedMs) || !Number.isFinite(requestedMs) ||
          fetchDurationSeconds < 0 || fetchDurationSeconds > C.maxFetchDurationSeconds ||
          ageMinutes < 0 || ageMinutes > C.maxMarketAgeMinutes) {
        return { ok:false, reason:'STALE_OR_UNVERIFIED_MARKET' };
      }
      if (Number(race._liveOddsRunnerCount) !== scored.length || race.horses.length !== scored.length) {
        return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH' };
      }
      const rows = race.horses.map(h => ({ u:uma(h.umaBan), odds:finite(h.odds) }));
      const rankingModel = rankingModelIdentity();
      if (!rankingModel) return { ok:false, reason:'NO_RANKING_MODEL_IDENTITY' };
      return { ok:true, race, raceDate, timing, rows, observedAt:race._liveOddsObservedAt,
        requestedAt:new Date(requestedMs).toISOString(), source:race._liveOddsSource, rankingModel };
    } catch (_) { return { ok:false, reason:'LIVE_MARKET_ERROR' }; }
  }

  function computeLive(raceNo, scored) {
    const live = liveMarket(raceNo, scored);
    if (!live.ok) return { ok:false, reason:live.reason, rows:[], candidate:null, modelId:MODEL.modelId,
      modelFingerprint, publicEligible:false };
    return { ...scoreRace(scored, live.rows), raceDate:live.raceDate, raceNo:Number.parseInt(raceNo,10),
      timing:live.timing, marketObservedAt:live.observedAt, marketSource:live.source,
      marketRequestedAt:live.requestedAt,
      rankingModel:live.rankingModel, rankingModelFingerprint:live.rankingModel.fingerprint };
  }

  function persistServerSnapshot(key, snapshot) {
    const upsert = root && root.apiUpsert;
    if (typeof upsert !== 'function') return;
    const id = `t10_31_${snapshot.raceDate.replace(/\D/g,'')}_${String(snapshot.raceNo).padStart(2,'0')}`;
    Promise.resolve(upsert('keiba_value_t10_ledger', id, {
      baba_code:'31', race_date:snapshot.raceDate, race_no:snapshot.raceNo,
      scheduled_post_at:snapshot.scheduledStartAt, status:snapshot.selected == null ? 'no_bet' : 'saved',
      transport:'first_party_worker', runner_count:snapshot.runnerSet.length,
      model_fingerprint:snapshot.model.fingerprint, payload:snapshot,
    })).then(() => {
      const read = root && root.lsRead, write = root && root.lsWrite;
      if (typeof read !== 'function' || typeof write !== 'function') return;
      const current = read()[key];
      if (current) write(key, { ...current, serverSync:'saved', serverSyncedAt:new Date().toISOString() });
    }).catch(error => {
      const read = root && root.lsRead, write = root && root.lsWrite;
      if (typeof read === 'function' && typeof write === 'function') {
        const current = read()[key];
        if (current) write(key, { ...current, serverSync:'failed', serverSyncError:String(error && error.message || error).slice(0,240) });
      }
    });
  }

  function captureLive(raceNo, scored, options) {
    try {
      const admin = root && root.isAdminMode, read = root && root.lsRead, write = root && root.lsWrite;
      if (typeof admin !== 'function' || !admin()) return { saved:false, reason:'NOT_ADMIN' };
      if (typeof read !== 'function' || typeof write !== 'function') return { saved:false, reason:'NO_STORAGE' };
      const result = computeLive(raceNo, scored);
      if (!result.ok) return { saved:false, reason:result.reason };
      if (!Array.isArray(result.inputRows) || !result.rankingModelFingerprint) {
        return { saved:false, reason:'INCOMPLETE_AUDIT_INPUT' };
      }
      const capturedAt = new Date().toISOString(), capturedMs = Date.parse(capturedAt);
      const scheduledMs = Date.parse(result.timing.scheduledStartAt);
      const requestedMs = Date.parse(result.marketRequestedAt);
      const observedMs = Date.parse(result.marketObservedAt);
      const minutesBeforeStart = (scheduledMs - capturedMs) / 60000;
      const marketAgeMinutes = (capturedMs - observedMs) / 60000;
      const fetchDurationSeconds = (observedMs - requestedMs) / 1000;
      const C = MODEL.capture;
      if (!Number.isFinite(scheduledMs) || !Number.isFinite(minutesBeforeStart) ||
          minutesBeforeStart < C.minutesMin || minutesBeforeStart > C.minutesMax) {
        return { saved:false, reason:minutesBeforeStart > C.minutesMax ? 'WAIT_FOR_T10' : 'T10_WINDOW_CLOSED' };
      }
      if (!Number.isFinite(requestedMs) || !Number.isFinite(observedMs) || fetchDurationSeconds < 0 ||
          fetchDurationSeconds > C.maxFetchDurationSeconds ||
          marketAgeMinutes < 0 || marketAgeMinutes > C.maxMarketAgeMinutes ||
          result.marketSource !== C.source) return { saved:false, reason:'STALE_OR_UNVERIFIED_MARKET' };
      const scheduledStartAt = new Date(scheduledMs).toISOString();
      const marketRequestedAt = new Date(requestedMs).toISOString();
      const marketObservedAt = new Date(observedMs).toISOString();
      const rankingModel = cloneJson(result.rankingModel);
      if (!rankingModel || String(rankingModel.fingerprint || '') !== String(result.rankingModelFingerprint)) {
        return { saved:false, reason:'NO_RANKING_MODEL_IDENTITY' };
      }
      const rawRows = cloneJson(result.inputRows).sort((a,b) => Number(a.u) - Number(b.u));
      const runnerSet = rawRows.map(r => uma(r.u)).filter(Boolean).sort((a,b) => a-b);
      const input = {
        schema:'value_t10_shadow_input/v2', babaCode:'31', raceDate:result.raceDate,
        raceNo:result.raceNo, modelFingerprint, rankingModel,
        // Keep the evidence fingerprint stable across render/scheduler hooks that
        // observe the same upstream inputs.  The capture instant is validated on
        // the snapshot envelope below, but is not itself a model/market input.
        timing:{ timing:'verified_prestart', scheduledStartAt },
        market:{ source:C.source, requestedAt:marketRequestedAt, observedAt:marketObservedAt },
        runnerSet, rows:rawRows,
      };
      const inputFingerprint = fnv(input);
      const key = `${SNAPSHOT_KEY_PREFIX}|31|${result.raceDate.replace(/\D/g,'')}|${String(result.raceNo).padStart(2,'0')}|${modelFingerprint}|${rankingModel.fingerprint}|${inputFingerprint}`;
      if (read()[key]) return { saved:false, reason:'DUPLICATE', key, result };
      const storedRows = result.rows.map(r => ({...r})).sort((a,b) => a.u - b.u);
      const snapshot = {
        type:SNAPSHOT_TYPE, schema:SNAPSHOT_SCHEMA, status:'forward_shadow_only', publicEligible:false,
        babaCode:'31', raceDate:result.raceDate, raceNo:result.raceNo, capturedAt,
        scheduledStartAt, minutesBeforeStart, timing:'verified_prestart',
        marketRequestedAt, marketObservedAt, marketSource:C.source,
        model:{ id:MODEL.modelId, fingerprint:modelFingerprint, dataCutoff:MODEL.dataCutoff, gates:MODEL.gates },
        rankingModel, rankingModelFingerprint:rankingModel.fingerprint,
        input, inputFingerprint, runnerSet, rows:storedRows,
        selected:result.candidate ? result.candidate.u : null,
        selectionReason:result.reason,
        serverSync:'pending',
      };
      write(key, snapshot);
      if (!(options && options.deferServer)) persistServerSnapshot(key, snapshot);
      return { saved:true, key, result, snapshot };
    } catch (e) { return { saved:false, reason:'WRITE_ERROR', error:String(e && e.message || e) }; }
  }

  const DECISION_LEDGER_SCHEMA = 'kochi_t10_decision_ledger/v1';
  const cleanJson = value => cloneJson(value) ?? null;
  const component = (status, data, reason) => ({ status, ...(reason ? { reason:String(reason).slice(0,120) } : {}),
    ...(data == null ? {} : { data:cleanJson(data) }) });

  async function persistDecisionLedger(raceNo, scored) {
    const admin = root && root.isAdminMode, upsert = root && root.apiUpsert;
    if (typeof admin !== 'function' || !admin()) return { saved:false, reason:'NOT_ADMIN' };
    if (typeof upsert !== 'function') return { saved:false, reason:'NO_SERVER_TRANSPORT' };
    const races = root && root.allRacesData, race = races && races[raceNo];
    if (!race || String(race.raceInfo?.babaCode || '') !== '31' || !Array.isArray(race.horses)) {
      return { saved:false, reason:'NO_KOCHI_RACE' };
    }
    const raceDate = date(race.raceInfo.raceDate), tm = typeof root._aiPredictionTimeMeta === 'function'
      ? root._aiPredictionTimeMeta(raceDate, raceNo, '31') : null;
    const minutes = Number(tm && tm.minutesBeforeStart);
    if (!tm || tm.timing !== 'verified_prestart' || minutes < 10 || minutes > 10.9) {
      return { saved:false, reason:'OUTSIDE_T10_WINDOW' };
    }
    const capturedAt = new Date().toISOString();
    const runnerSet = sortedUma(race.horses.map(h => h.umaBan));
    const marketRows = race.horses.map(h => ({ u:uma(h.umaBan), name:String(h.horseName || ''),
      odds:finite(h.odds), ninki:finite(h.ninki) })).sort((a,b) => a.u-b.u);
    const marketComplete = runnerSet.length >= 4 && marketRows.length === runnerSet.length &&
      marketRows.every(r => r.u && r.odds != null && r.odds > 0);
    const rankingModel = rankingModelIdentity();
    const abilityRows = Array.isArray(scored) ? scored.map((s,index) => ({
      u:uma(s?.horse?.umaBan), name:String(s?.horse?.horseName || ''), rank:finite(s?.totalScore) == null ? null : index+1,
      totalScore:finite(s?.totalScore), features:{ ...normalizedFeatures(s || {}), jockeyChgN:finite(s?.jockeyChgMod),
        paceCtxN:finite(s?.paceCtxMod), relSIN:finite(s?.relSIMod) },
      quality:{ siCount:Number(s?.siCount || 0), kochiSICount:Number(s?.kochiSICount || 0),
        isTransfer:!!s?.isTransfer, isEstimatedScore:!!s?.isEstimatedScore },
    })).sort((a,b) => a.u-b.u) : [];
    const abilityComplete = !!rankingModel && same(sortedUma(abilityRows.map(r => r.u)), runnerSet) &&
      abilityRows.every(r => r.totalScore != null);

    let longshotRows = [], longshotError = '';
    try {
      if (typeof root.computeLongshotCandidateRows !== 'function') longshotError = 'MODEL_NOT_LOADED';
      else longshotRows = root.computeLongshotCandidateRows(raceNo, scored, null).map(row => ({
        u:uma(row.umaBan), name:String(row.name || ''), marketSource:String(row.marketSource || ''),
        facts:cleanJson(row.facts), decision:cleanJson(row.decision),
      })).sort((a,b) => a.u-b.u);
    } catch (error) { longshotError = String(error && error.message || 'COMPUTE_FAILED'); }
    const longshotComplete = same(sortedUma(longshotRows.map(r => r.u)), runnerSet);

    try { if (typeof root.kvEnsureVnextPartnerShadowRegistered === 'function') root.kvEnsureVnextPartnerShadowRegistered(); } catch (_) {}
    const active = typeof root.getActiveOpponentShadowModel === 'function' ? root.getActiveOpponentShadowModel() : null;
    const modelIds = [...new Set([active?.model?.id || 'kochi-t10-market-mainline-v1',
      root.kvVnextPartnerModelId || 'kochi-vnext-rich-partner-shadow-v1',
      root.kvVnextMarketBlendModelId || 'kochi-t10-vnext-blend-mainline-v1'])];
    const opponent = modelIds.map(modelId => {
      try {
        if (typeof root.computeOpponentShadow !== 'function') return { modelId, status:'unavailable', reason:'MODEL_NOT_LOADED' };
        const shadow = root.computeOpponentShadow(raceNo, scored, modelId);
        return shadow ? { modelId, status:'computed', data:cleanJson(shadow) }
          : { modelId, status:'rejected', reason:'MODEL_GATE_REJECTED' };
      } catch (error) { return { modelId, status:'failed', reason:String(error && error.message || 'COMPUTE_FAILED').slice(0,120) }; }
    });
    const valueResult = computeLive(raceNo, scored);
    const value = valueResult.ok ? component(valueResult.candidate ? 'candidate' : 'no_candidate', {
      modelId:valueResult.modelId, modelFingerprint:valueResult.modelFingerprint,
      selectionReason:valueResult.reason, selected:valueResult.candidate?.u ?? null,
      rows:valueResult.rows, inputRows:valueResult.inputRows,
    }) : component('failed', null, valueResult.reason);
    const complete = marketComplete && abilityComplete && longshotComplete && valueResult.ok &&
      opponent.every(row => row.status === 'computed');
    const payload = {
      schema:DECISION_LEDGER_SCHEMA, capturePolicy:'automatic-admin-viewer-at-verified-t10', capturedAt,
      race:{ babaCode:'31', raceDate, raceNo:Number(raceNo), scheduledStartAt:tm.scheduledStartAt,
        minutesBeforeStart:minutes, runnerSet },
      market:{ status:marketComplete ? 'complete' : 'incomplete', source:race._liveOddsSource || null,
        requestedAt:Number.isFinite(Number(race._liveOddsRequestNonce)) ? new Date(Number(race._liveOddsRequestNonce)).toISOString() : null,
        observedAt:race._liveOddsObservedAt || null, rows:marketRows },
      components:{
        ability:abilityComplete ? component('computed',{ model:rankingModel, rows:abilityRows })
          : component('incomplete',{ model:rankingModel, rows:abilityRows },'INCOMPLETE_ABILITY_UNIVERSE'),
        longshot:longshotComplete ? component('computed',{ candidateCount:longshotRows.filter(r => r.decision?.candidate).length, rows:longshotRows })
          : component('incomplete',{ rows:longshotRows },longshotError || 'INCOMPLETE_RUNNER_UNIVERSE'),
        opponent:{ status:opponent.every(row => row.status === 'computed') ? 'computed' : 'incomplete', models:opponent },
        value,
      },
    };
    payload.inputFingerprint = fnv({ race:payload.race, market:payload.market, components:payload.components });
    const id = `t10_31_${raceDate.replace(/\D/g,'')}_${String(Number(raceNo)).padStart(2,'0')}`;
    const localKey = `t10DecisionLedger_v1|${id}`;
    const row = { baba_code:'31', race_date:raceDate, race_no:Number(raceNo),
      scheduled_post_at:tm.scheduledStartAt, status:complete ? (valueResult.candidate ? 'saved' : 'no_bet') : 'incomplete',
      transport:'first_party_worker+admin_viewer', runner_count:runnerSet.length,
      model_fingerprint:rankingModel?.fingerprint || '', payload };
    try {
      if (typeof root.lsWrite === 'function') root.lsWrite(localKey, { ...payload, type:'t10DecisionLedger', serverSync:'pending' });
      await upsert('keiba_value_t10_ledger', id, row);
      if (typeof root.lsWrite === 'function') root.lsWrite(localKey, { ...payload, type:'t10DecisionLedger', serverSync:'saved', serverSyncedAt:new Date().toISOString() });
      return { saved:true, key:localKey, id, status:row.status, payload };
    } catch (error) {
      if (typeof root.lsWrite === 'function') root.lsWrite(localKey, { ...payload, type:'t10DecisionLedger', serverSync:'failed', serverSyncError:String(error && error.message || error).slice(0,240) });
      return { saved:false, reason:'SERVER_WRITE_FAILED', error:String(error && error.message || error), key:localKey };
    }
  }

  function settleDecisionLedgerRow(row, db) {
    const payload = row && row.payload, race = payload && payload.race;
    if (!payload || payload.schema !== DECISION_LEDGER_SCHEMA || !race) return { status:'not_unified' };
    const runners = sortedUma(race.runnerSet || []), prefix = `31_${race.raceDate}_${Number(race.raceNo)}_`;
    const results = runners.map(u => ({ u, row:db && db[`${prefix}${u}`] }));
    const parsed = results.map(x => ({ u:x.u, finish:Number.parseInt(x.row?.chakujun,10), raw:String(x.row?.chakujun || '') }));
    if (!runners.length || parsed.some(x => !Number.isInteger(x.finish) && !/中止|失格|取消|除外/.test(x.raw))) {
      return { status:'awaiting_result', runnerCount:runners.length };
    }
    if (parsed.some(x => /取消|除外/.test(x.raw))) return { status:'void_late_exclusion', runnerCount:runners.length };
    const finishByU = new Map(parsed.map(x => [x.u,x.finish]));
    const winnerSet = parsed.filter(x => x.finish === 1).map(x => x.u);
    const top3 = u => { const f=finishByU.get(uma(u)); return Number.isInteger(f) && f <= 3; };
    const valueData = payload.components?.value?.data || {}, selected = uma(valueData.selected);
    const payout = db && db[`payout_31_${race.raceDate}_${Number(race.raceNo)}`];
    const wins = tanPayouts(payout), winPay = selected ? (wins.find(x => x.u === selected)?.pay || 0) : 0;
    const longRows = payload.components?.longshot?.data?.rows || [];
    const candidates = longRows.filter(x => x?.decision?.candidate), rejected = longRows.filter(x => !x?.decision?.candidate);
    const models = payload.components?.opponent?.models || [];
    const settlement = {
      schema:'kochi_t10_decision_settlement/v1', status:'settled', settledAt:new Date().toISOString(),
      winnerSet, runnerCount:runners.length,
      ability:{ top1:uma(payload.components?.ability?.data?.rows?.find(x => x.rank === 1)?.u),
        top1Win:winnerSet.includes(uma(payload.components?.ability?.data?.rows?.find(x => x.rank === 1)?.u)) },
      longshot:{ candidates:candidates.length, candidateTop3:candidates.filter(x => top3(x.u)).length,
        rejected:rejected.length, rejectedTop3:rejected.filter(x => top3(x.u)).length },
      opponent:models.map(model => { const data=model.data || {}, picks=data.mainline || [];
        return { modelId:model.modelId, status:model.status, anchorTop3:top3(data.anchor?.u),
          bothMainlineTop3:picks.length >= 2 && picks.slice(0,2).every(x => top3(x.u)) }; }),
      value:{ selected, hit:selected ? winnerSet.includes(selected) : false, stake:selected ? 100 : 0,
        returned:selected && wins.length ? winPay : null, payoutAvailable:!selected || wins.length > 0 },
    };
    settlement.resultFingerprint=fnv({ winnerSet, ability:settlement.ability, longshot:settlement.longshot,
      opponent:settlement.opponent, value:settlement.value });
    return settlement;
  }

  function summarizeSettlements(rows) {
    const settled = rows.filter(x => x?.status === 'settled'), values = settled.map(x => x.value).filter(x => x?.selected);
    const withPay = values.filter(x => x.payoutAvailable), stake = withPay.reduce((s,x) => s+x.stake,0);
    const returned = withPay.reduce((s,x) => s+(x.returned || 0),0);
    const longshot = settled.reduce((a,x) => ({ candidates:a.candidates+x.longshot.candidates,
      candidateTop3:a.candidateTop3+x.longshot.candidateTop3, rejected:a.rejected+x.longshot.rejected,
      rejectedTop3:a.rejectedTop3+x.longshot.rejectedTop3 }), { candidates:0,candidateTop3:0,rejected:0,rejectedTop3:0 });
    return { total:rows.length, settled:settled.length, pending:rows.filter(x => x?.status === 'awaiting_result').length,
      void:rows.filter(x => x?.status === 'void_late_exclusion').length, selections:values.length,
      hits:values.filter(x => x.hit).length, payoutReady:withPay.length, stake, returned,
      roi:stake ? 100*returned/stake : null, longshot };
  }

  async function syncMissingPayouts(ledger, db, options) {
    const fetchDay = options?.fetchDay || (root && root._fetchRefundPayoutsDay);
    const read = options?.read || (root && root.lsRead), write = options?.write || (root && root.lsWrite);
    const admin = options?.admin ?? (typeof root?.isAdminMode === 'function' && root.isAdminMode());
    if (!admin || typeof fetchDay !== 'function' || typeof read !== 'function' || typeof write !== 'function') {
      return { status:'unavailable', attemptedDays:0, savedRaces:0, failedDates:[], skippedDates:[] };
    }
    const source = db || read(), dates = [];
    for (const row of Array.isArray(ledger) ? ledger : []) {
      const payload=row?.payload, race=payload?.race, selected=uma(payload?.components?.value?.data?.selected);
      if (!race || payload.schema !== DECISION_LEDGER_SCHEMA || !selected) continue;
      if (source[`payout_31_${race.raceDate}_${Number(race.raceNo)}`]) continue;
      if (settleDecisionLedgerRow(row,source).status !== 'settled') continue;
      if (!dates.includes(race.raceDate)) dates.push(race.raceDate);
    }
    let attemptedDays=0, savedRaces=0; const failedDates=[], skippedDates=[];
    for (const raceDate of dates.slice(0,3)) {
      const auditKey=`t10PayoutAuto_v1|31|${raceDate.replace(/\D/g,'')}`, prior=read()[auditKey];
      const last=Date.parse(prior?.lastAttemptAt), waitMs=prior?.status === 'failed' ? 15*60000 : 6*3600000;
      if (Number.isFinite(last) && Date.now()-last < waitMs) { skippedDates.push(raceDate); continue; }
      attemptedDays++; const attemptedAt=new Date().toISOString();
      try {
        const day=await fetchDay(raceDate), raceNos=Object.keys(day || {});
        if (!raceNos.length) throw new Error('PAYOUT_NOT_PUBLISHED');
        for (const raceNo of raceNos) {
          write(`payout_31_${raceDate}_${raceNo}`,{ type:'payout',race_date:raceDate,race_no:Number(raceNo),
            baba_code:'31',...day[raceNo],savedAt:new Date().toISOString(),source:'keiba.go.jp/RefundMoneyList:auto' });
          savedRaces++;
        }
        write(auditKey,{ type:'t10PayoutAutoAudit',raceDate,status:'saved',lastAttemptAt:attemptedAt,savedRaces:raceNos.length });
      } catch (error) {
        failedDates.push(raceDate);
        write(auditKey,{ type:'t10PayoutAutoAudit',raceDate,status:'failed',lastAttemptAt:attemptedAt,
          reason:String(error && error.message || error).slice(0,160) });
      }
    }
    return { status:failedDates.length ? 'partial' : 'ok', attemptedDays, savedRaces, failedDates, skippedDates };
  }

  let monitorPromise = null, monitorAt = 0;
  async function refreshDecisionLedgerMonitor(force) {
    if (monitorPromise) return monitorPromise;
    if (!force && Date.now()-monitorAt < 60000) return null;
    monitorPromise = (async () => {
      const el = root.document && root.document.getElementById('t10-ledger-monitor');
      if (el) el.innerHTML = 'T10統合台帳を確認中…';
      try {
        const config = typeof root.kvSupabaseReadConfig === 'function' ? root.kvSupabaseReadConfig() : null;
        if (!config?.url || !config?.headers) throw new Error('SERVER_CONFIG_UNAVAILABLE');
        const url = `${config.url}/rest/v1/keiba_value_t10_ledger?select=*&baba_code=eq.31&order=race_date.desc,race_no.desc&limit=500`;
        const response = await fetch(url,{ headers:config.headers });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const ledger = await response.json(); let db = typeof root.lsRead === 'function' ? root.lsRead() : {};
        const payoutSync = await syncMissingPayouts(ledger,db);
        if (typeof root.lsRead === 'function') db=root.lsRead();
        const settlements = ledger.map(row => settleDecisionLedgerRow(row,db));
        const summary = summarizeSettlements(settlements), statusCounts = {};
        ledger.forEach(row => { statusCounts[row.status] = (statusCounts[row.status] || 0)+1; });
        if (typeof root.isAdminMode === 'function' && root.isAdminMode() && typeof root.apiUpsert === 'function') {
          for (let i=0;i<ledger.length;i++) {
            const row=ledger[i], settlement=settlements[i];
            if (settlement.status !== 'settled' || row.payload?.settlement?.resultFingerprint === settlement.resultFingerprint) continue;
            const payload={ ...row.payload, settlement };
            await root.apiUpsert('keiba_value_t10_ledger',row.id,{ baba_code:row.baba_code,race_date:row.race_date,
              race_no:row.race_no,scheduled_post_at:row.scheduled_post_at,status:row.status,transport:row.transport,
              upstream_status:row.upstream_status,raw_sha256:row.raw_sha256,runner_count:row.runner_count,
              model_fingerprint:row.model_fingerprint,payload });
          }
        }
        if (el) {
          const pct=(a,b)=>b ? `${(100*a/b).toFixed(1)}%` : '—', roi=summary.roi == null ? '払戻待ち' : `${summary.roi.toFixed(1)}%`;
          el.innerHTML=`<b>T10台帳 ${summary.total}R</b>　精算${summary.settled}R／結果待ち${summary.pending}R　`+
            `価値候補 ${summary.hits}/${summary.selections}的中・ROI ${roi}（払戻${summary.payoutReady}件）<br>`+
            `激走候補 複勝${pct(summary.longshot.candidateTop3,summary.longshot.candidates)} `+
            `／候補外${pct(summary.longshot.rejectedTop3,summary.longshot.rejected)}　`+
            `保存状態 ${Object.entries(statusCounts).map(([k,v])=>`${k}:${v}`).join(' / ')}<br>`+
            `払戻自動取得 ${payoutSync.savedRaces ? `${payoutSync.savedRaces}R保存` : '追加なし'}`+
            `${payoutSync.failedDates.length ? `／未公表・取得失敗 ${payoutSync.failedDates.join('、')}` : ''}`;
        }
        monitorAt=Date.now(); return { ledger, settlements, summary, statusCounts, payoutSync };
      } catch (error) {
        if (el) el.innerHTML=`<span style="color:#b91c1c">T10台帳の取得失敗：${String(error && error.message || error).slice(0,120)}</span>`;
        return { error:String(error && error.message || error) };
      } finally { monitorPromise=null; }
    })();
    return monitorPromise;
  }

  function listSnapshots() {
    const read = root && root.lsRead;
    if (typeof read !== 'function') return [];
    return Object.entries(read()).filter(([key,v]) => key.startsWith(`${SNAPSHOT_KEY_PREFIX}|`) &&
        v && v.type === SNAPSHOT_TYPE && v.schema === SNAPSHOT_SCHEMA)
      .map(([key,v]) => ({ ...v, key })).sort((a,b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  }

  function resultStatus(row) {
    const finish = Number.parseInt(row && row.chakujun, 10);
    if (Number.isInteger(finish) && finish >= 1 && finish <= 20) return { settled:true, starter:true, finish };
    const text = `${row?.chakujun || ''} ${row?.diff || ''}`;
    if (/中止|失格/.test(text)) return { settled:true, starter:true, finish:null };
    if (/取消|除外/.test(text)) return { settled:true, starter:false, finish:null };
    return { settled:false, starter:false, finish:null };
  }

  function tanPayouts(record) {
    const source = Array.isArray(record && record.tan) ? record.tan
      : (record && record.tan ? [record.tan] : []);
    const byUma = new Map();
    source.forEach(row => {
      const u = uma(row && row.uma), pay = finite(row && row.pay);
      if (u && pay != null && pay > 0) byUma.set(u, { u, pay });
    });
    return [...byUma.values()].sort((a,b) => a.u - b.u);
  }

  function validateSnapshot(snapshot) {
    const fail = reason => ({ ok:false, reason });
    const s = snapshot;
    if (!s || typeof s !== 'object' || s.type !== SNAPSHOT_TYPE || s.schema !== SNAPSHOT_SCHEMA ||
        (s.key && !String(s.key).startsWith(`${SNAPSHOT_KEY_PREFIX}|`))) return fail('INVALID_SCHEMA');
    if (s.status !== MODEL.status || s.publicEligible !== false || String(s.babaCode) !== '31') {
      return fail('INVALID_VENUE_OR_STATUS');
    }
    const raceDate = date(s.raceDate), raceNo = Number(s.raceNo);
    if (!raceDate || raceDate !== s.raceDate || !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12) {
      return fail('INVALID_RACE_IDENTITY');
    }
    if (!s.model || s.model.id !== MODEL.modelId || s.model.fingerprint !== modelFingerprint ||
        s.model.dataCutoff !== MODEL.dataCutoff || !same(s.model.gates, MODEL.gates)) return fail('INVALID_MODEL');
    const rankingFingerprint = String(s.rankingModelFingerprint || '');
    if (!rankingFingerprint || !s.rankingModel ||
        String(s.rankingModel.fingerprint || '') !== rankingFingerprint) return fail('INVALID_RANKING_MODEL');

    const capturedMs = Date.parse(s.capturedAt), scheduledMs = Date.parse(s.scheduledStartAt);
    const requestedMs = Date.parse(s.marketRequestedAt), observedMs = Date.parse(s.marketObservedAt);
    const minutes = Number(s.minutesBeforeStart);
    const marketAgeMinutes = (capturedMs - observedMs) / 60000;
    const fetchDurationSeconds = (observedMs - requestedMs) / 1000;
    const derivedMinutes = (scheduledMs - capturedMs) / 60000, C = MODEL.capture;
    if (s.timing !== 'verified_prestart' || !Number.isFinite(capturedMs) || !Number.isFinite(scheduledMs) ||
        !Number.isFinite(minutes) || minutes < C.minutesMin || minutes > C.minutesMax ||
        Math.abs(derivedMinutes - minutes) > 1e-9) return fail('INVALID_TIMING');
    if (s.marketSource !== C.source || !Number.isFinite(requestedMs) || !Number.isFinite(observedMs) ||
        fetchDurationSeconds < 0 || fetchDurationSeconds > C.maxFetchDurationSeconds ||
        marketAgeMinutes < 0 || marketAgeMinutes > C.maxMarketAgeMinutes) return fail('INVALID_MARKET_PROVENANCE');

    const input = s.input;
    if (!input || input.schema !== 'value_t10_shadow_input/v2' || fnv(input) !== s.inputFingerprint) {
      return fail('INPUT_FINGERPRINT_MISMATCH');
    }
    if (String(input.babaCode) !== '31' || input.raceDate !== raceDate || Number(input.raceNo) !== raceNo ||
        input.modelFingerprint !== modelFingerprint || !same(input.rankingModel, s.rankingModel) ||
        input.rankingModel.fingerprint !== rankingFingerprint || !input.timing || !input.market ||
        input.timing.timing !== s.timing || input.timing.scheduledStartAt !== s.scheduledStartAt ||
        input.market.source !== s.marketSource ||
        input.market.requestedAt !== s.marketRequestedAt ||
        input.market.observedAt !== s.marketObservedAt) return fail('INPUT_ENVELOPE_MISMATCH');
    if (!Array.isArray(input.rows) || input.rows.length < 4 || !Array.isArray(input.runnerSet)) {
      return fail('INVALID_INPUT_ROWS');
    }
    const validRawRows = input.rows.every(row => {
      if (!row || !uma(row.u) || typeof row.name !== 'string' ||
          typeof row.currentScore !== 'number' || !Number.isFinite(row.currentScore) ||
          typeof row.odds !== 'number' || !Number.isFinite(row.odds) || row.odds <= 0 ||
          !row.features || typeof row.features !== 'object') return false;
      return MODEL.additive.features.every(key => Object.prototype.hasOwnProperty.call(row.features, key) &&
        (row.features[key] === null || (typeof row.features[key] === 'number' && Number.isFinite(row.features[key]))));
    });
    const rowSet = sortedUma(input.rows.map(row => row.u));
    if (!validRawRows || rowSet.length !== input.rows.length || new Set(rowSet).size !== rowSet.length ||
        !same(rowSet, sortedUma(input.runnerSet)) || !same(rowSet, sortedUma(s.runnerSet))) {
      return fail('INVALID_RUNNER_SET');
    }
    const recomputed = scoreRace(scoredFromInputRows(input.rows), input.rows.map(row => ({ u:row.u, odds:row.odds })));
    if (!recomputed.ok || !same(recomputed.inputRows, input.rows)) return fail('INPUT_RECOMPUTE_FAILED');
    const recomputedRows = recomputed.rows.map(row => ({...row})).sort((a,b) => a.u - b.u);
    if (!Array.isArray(s.rows) || !same(recomputedRows, s.rows)) return fail('SELECTION_ROWS_MISMATCH');
    const expectedSelected = recomputed.candidate ? recomputed.candidate.u : null;
    const storedSelected = s.selected == null ? null : uma(s.selected);
    if (storedSelected !== expectedSelected || s.selectionReason !== recomputed.reason) {
      return fail('SELECTION_RECOMPUTE_MISMATCH');
    }
    if (s.key) {
      const expectedKey = `${SNAPSHOT_KEY_PREFIX}|31|${raceDate.replace(/\D/g,'')}|${String(raceNo).padStart(2,'0')}|${modelFingerprint}|${rankingFingerprint}|${s.inputFingerprint}`;
      if (String(s.key) !== expectedKey) return fail('SNAPSHOT_KEY_MISMATCH');
    }
    return { ok:true, rankingModelFingerprint:rankingFingerprint, recomputed };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /** 日を再標本化する決定論的bootstrap。ブラウザでの監査再実行でも同じ区間を返す。 */
  function dayBootstrap95(rows, iterations) {
    const byDay = new Map();
    rows.forEach(r => {
      const x = byDay.get(r.raceDate) || { stake:0, returned:0 };
      x.stake += 100; x.returned += Number(r.payout) || 0; byDay.set(r.raceDate, x);
    });
    const days = [...byDay.values()];
    if (!days.length) return null;
    let state = 0x7f4a7c15;
    const random = () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
    const samples = [];
    for (let b = 0; b < (iterations || 2000); b++) {
      let stake = 0, returned = 0;
      for (let i = 0; i < days.length; i++) {
        const d = days[Math.min(days.length - 1, Math.floor(random() * days.length))];
        stake += d.stake; returned += d.returned;
      }
      samples.push(stake ? 100 * returned / stake : 0);
    }
    samples.sort((a,b) => a-b);
    return [quantile(samples, .025), quantile(samples, .975)];
  }

  function evaluateSnapshots(options) {
    const read = root && root.lsRead, db = typeof read === 'function' ? read() : {};
    const requestedFingerprint = typeof options === 'string' ? options
      : String(options && options.rankingModelFingerprint || '');
    const all = listSnapshots();
    const invalidReasons = {};
    const valid = [];
    all.forEach(snapshot => {
      const checked = validateSnapshot(snapshot);
      if (!checked.ok) {
        invalidReasons[checked.reason] = Number(invalidReasons[checked.reason] || 0) + 1;
      } else valid.push({ snapshot, checked });
    });
    const rankingModelFingerprints = [...new Set(valid.map(row => row.checked.rankingModelFingerprint))].sort();
    const baseCounts = { snapshots:all.length, validSnapshots:valid.length,
      invalidSnapshots:all.length - valid.length, excludedRankingSnapshots:0, races:0,
      settledRaces:0, noBetRaces:0, selections:0, settledSelections:0,
      pendingResults:0, pendingPayout:0, lateExclusion:0, invalidUniverse:0 };
    if (!requestedFingerprint && rankingModelFingerprints.length > 1) {
      return { schema:'value_t10_shadow_evaluation/v2', status:'ranking_fingerprint_selection_required',
        error:'MULTIPLE_RANKING_FINGERPRINTS', modelId:MODEL.modelId, modelFingerprint,
        rankingModelFingerprints, invalidReasons, counts:baseCounts,
        metrics:{ hits:0, hitRate:null, roi:null, stake:0, returned:0, dayBootstrap95:null,
          topPayout:null, roiWithoutTopPayout:null, maxLosingStreak:0, maxDrawdown:0 },
        reviewGate:{ firstReviewAt:200, continuationLimit:400, ready:false,
          passesStatisticalGate:false, productionEligible:false,
          required:'select one rankingModelFingerprint before evaluation' }, rows:[] };
    }
    const selectedRankingFingerprint = requestedFingerprint || rankingModelFingerprints[0] || null;
    const scoped = selectedRankingFingerprint
      ? valid.filter(row => row.checked.rankingModelFingerprint === selectedRankingFingerprint) : [];
    const chosen = new Map();
    for (const entry of scoped) {
      const s = entry.snapshot, k = `${s.raceDate}|${s.raceNo}`;
      const prev = chosen.get(k);
      if (!prev || Number(s.minutesBeforeStart) < Number(prev.snapshot.minutesBeforeStart) ||
          (Number(s.minutesBeforeStart) === Number(prev.snapshot.minutesBeforeStart) &&
           String(s.capturedAt) > String(prev.snapshot.capturedAt))) chosen.set(k,entry);
    }
    const counts = { ...baseCounts, excludedRankingSnapshots:valid.length - scoped.length, races:chosen.size };
    let stake = 0, returned = 0, hits = 0;
    const rows = [];
    const ordered = [...chosen.values()].sort((a,b) =>
      String(a.snapshot.raceDate).localeCompare(String(b.snapshot.raceDate)) ||
      Number(a.snapshot.raceNo) - Number(b.snapshot.raceNo));
    for (const entry of ordered) {
      const s = entry.snapshot, snapSet = sortedUma(s.runnerSet);
      const payoutRecord = db[`payout_31_${s.raceDate}_${Number(s.raceNo)}`];
      const resultRows = new Map(snapSet.map(u => [u, db[`31_${s.raceDate}_${Number(s.raceNo)}_${u}`]]));
      const statuses = new Map([...resultRows].map(([u,row]) => [u, resultStatus(row)]));
      if ([...statuses.values()].some(x => !x.settled)) {
        const missingRows = [...resultRows.values()].some(row => !row || typeof row !== 'object');
        if (payoutRecord && missingRows) counts.invalidUniverse++;
        else counts.pendingResults++;
        continue;
      }
      if ([...statuses.values()].some(x => !x.starter)) { counts.lateExclusion++; continue; }
      const prefix = `31_${s.raceDate}_${Number(s.raceNo)}_`;
      const actual = Object.entries(db).filter(([k,v]) => k.startsWith(prefix) && v && v.type === 'horse')
        .map(([k,v]) => ({ u:uma(k.slice(prefix.length)), status:resultStatus(v) }))
        .filter(x => x.u && x.status.settled && x.status.starter).map(x => x.u).sort((a,b) => a-b);
      if (!same(actual, snapSet)) { counts.invalidUniverse++; continue; }
      counts.settledRaces++;
      const selected = s.selected == null ? null : uma(s.selected);
      if (!selected) { counts.noBetRaces++; continue; }
      counts.selections++;
      const payouts = tanPayouts(payoutRecord);
      if (!payouts.length) { counts.pendingPayout++; continue; }
      const resultWinners = [...statuses.entries()].filter(([,status]) => status.finish === 1).map(([u]) => u).sort((a,b) => a-b);
      const payoutWinners = payouts.map(payout => payout.u).sort((a,b) => a-b);
      if (!same(resultWinners, payoutWinners)) { counts.invalidUniverse++; continue; }
      counts.settledSelections++; stake += 100;
      const winningPayout = payouts.find(payout => payout.u === selected) || null;
      const hit = !!winningPayout, pay = winningPayout ? winningPayout.pay : 0;
      returned += pay; if (hit) hits++;
      const selectedInput = (s.rows || []).find(row => uma(row.u ?? row.uma) === selected) || {};
      rows.push({ raceDate:s.raceDate, raceNo:s.raceNo, selected, hit, payout:pay,
        payoutWinners:payouts.map(payout => payout.u), t10Odds:finite(selectedInput.odds),
        estimatedProbability:finite(selectedInput.probability), estimatedEv:finite(selectedInput.ev) });
    }
    let losingStreak = 0, maxLosingStreak = 0, equity = 0, peak = 0, maxDrawdown = 0;
    rows.forEach(row => {
      if (row.hit) losingStreak = 0;
      else { losingStreak++; maxLosingStreak = Math.max(maxLosingStreak, losingStreak); }
      equity += (Number(row.payout) || 0) - 100;
      peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity);
    });
    const ci = dayBootstrap95(rows, 2000);
    const topPayout = rows.length ? Math.max(...rows.map(row => Number(row.payout) || 0)) : null;
    const roiWithoutTopPayout = rows.length > 1 ? 100 * (returned - topPayout) / (stake - 100) : null;
    const roi = stake ? 100 * returned / stake : null, ready = counts.settledSelections >= 200;
    const passesStatisticalGate = !!(ready && roi > 100 && ci && ci[0] >= 100 &&
      roiWithoutTopPayout != null && roiWithoutTopPayout >= 100);
    return { schema:'value_t10_shadow_evaluation/v2', status:'ok', modelId:MODEL.modelId,
      modelFingerprint, rankingModelFingerprint:selectedRankingFingerprint,
      rankingModelFingerprints, invalidReasons, counts,
      metrics:{ hits, hitRate:counts.settledSelections ? hits/counts.settledSelections : null,
        roi, stake, returned, dayBootstrap95:ci, topPayout, roiWithoutTopPayout,
        maxLosingStreak, maxDrawdown },
      reviewGate:{ firstReviewAt:200, continuationLimit:400, ready, passesStatisticalGate,
        productionEligible:false, required:'ROI>100, day-bootstrap CI lower bound>=100, and ROI without top payout>=100; production promotion is always manual' }, rows };
  }

  return Object.freeze({ contract:MODEL, modelFingerprint, softmax, scoreRace, computeLive, captureLive, persistDecisionLedger,
    settleDecisionLedgerRow, summarizeSettlements, syncMissingPayouts, refreshDecisionLedgerMonitor,
    decisionLedgerSchema:DECISION_LEDGER_SCHEMA,
    snapshotSchema:SNAPSHOT_SCHEMA, snapshotKeyPrefix:SNAPSHOT_KEY_PREFIX,
    listSnapshots, validateSnapshot, evaluateSnapshots, tanPayouts, dayBootstrap95 });
});
