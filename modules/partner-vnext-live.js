/*
 * vNext相手モデルのライブ接続層。
 * 学習・保存は管理者forward shadowのまま。T10 blendは相手的中率を上げた一方で
 * 券種別回収率を下げたため、公開印には既定で反映しない。明示的な研究テスト時だけ
 * 表示計画を返せるよう接続層を残す。
 */
(function(root) {
  'use strict';

  const MODEL_ID = 'kochi-vnext-rich-partner-shadow-v1';
  const BLEND_MODEL_ID = 'kochi-t10-vnext-blend-mainline-v1';
  const ROLLOUT_CACHE_PREFIX = 'kv_t10_partner_rollout_cache_v1|';
  const ROLLOUT_DISABLE_KEY = 'kv_t10_partner_rollout_disabled_v1';
  const T10_MIN = 10;
  const T10_MAX = 10.9;
  const MAX_MARKET_AGE_MINUTES = 2;
  let liveIndex = null;
  let vnextRegistered = false;
  let blendRegistered = false;
  const abilityScoreCache = new Map();
  if (typeof root.KV_T10_PARTNER_ROLLOUT_ENABLED !== 'boolean') root.KV_T10_PARTNER_ROLLOUT_ENABLED = false;

  const text = value => String(value == null ? '' : value).normalize('NFKC').trim().replace(/\s+/g, ' ');
  const number = value => {
    if (value == null || typeof value === 'boolean') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const match = String(value).replace(/,/g, '').match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round8 = value => Math.round((Number(value) + Number.EPSILON) * 1e8) / 1e8;
  const date = value => {
    const match = String(value || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    return match ? `${match[1]}/${String(match[2]).padStart(2, '0')}/${String(match[3]).padStart(2, '0')}` : '';
  };
  const before = (leftDate, leftNo, rightDate, rightNo) =>
    leftDate < rightDate || (leftDate === rightDate && Number(leftNo) < Number(rightNo));
  const starter = row => {
    const finish = Number.parseInt(row.chakujun, 10);
    if (Number.isFinite(finish) && finish >= 1 && finish <= 20) return { finish, status:'finished' };
    const detail = `${row.chakujun || ''} ${row.diff || ''}`;
    if (detail.includes('中止')) return { finish:null, status:'dnc' };
    if (detail.includes('失格')) return { finish:null, status:'dq' };
    return null;
  };
  const corner = value => String(value || '').match(/\d+/g)?.map(Number).filter(value => value > 0) || [];

  function identityResolver(codesByName) {
    return row => {
      const code = text(row.lineageLoginCode || row.lineage_login_code);
      const name = text(row.horseName || row.horse_name);
      if (code) return `lineage:${code}`;
      const known = codesByName.get(name);
      if (known && known.size === 1) return `lineage:${[...known][0]}`;
      return known && known.size > 1 ? '' : (name ? `name:${name}` : '');
    };
  }

  function addConnection(map, key, raceDate, raceNo, top3) {
    if (!key) return;
    let rows = map.get(key);
    if (!rows) { rows = []; map.set(key, rows); }
    const prior = rows.length ? rows[rows.length - 1] : { start:0, top3:0 };
    rows.push({ d:raceDate, n:raceNo, start:prior.start + 1, top3:prior.top3 + Number(top3) });
  }

  function buildLiveIndex() {
    if (liveIndex) return liveIndex;
    const store = typeof lsRead === 'function' ? lsRead() : {};
    const groups = new Map();
    const codesByName = new Map();
    const groupFor = (raceDate, raceNo) => {
      const key = `${raceDate}|${raceNo}`;
      let group = groups.get(key);
      if (!group) { group = { d:raceDate, n:raceNo, meta:{}, rows:[] }; groups.set(key, group); }
      return group;
    };
    for (const [key, value] of Object.entries(store || {})) {
      if (!value || typeof value !== 'object') continue;
      if (value.type === 'race') {
        const baba = String(value.baba_code || value.babaCode || '');
        const raceDate = date(value.race_date || value.raceDate);
        const raceNo = Number.parseInt(value.race_no || value.raceNo, 10);
        if (baba === '31' && raceDate && Number.isFinite(raceNo)) groupFor(raceDate, raceNo).meta = value;
        continue;
      }
      if (value.type !== 'horse' || key.startsWith('offi_')) continue;
      const parts = String(key).split('_');
      const baba = String(value.baba_code || value.babaCode || parts[0] || '');
      const raceDate = date(value.race_date || value.raceDate || parts[1]);
      const raceNo = Number.parseInt(value.race_no || value.raceNo || parts[2], 10);
      if (baba !== '31' || !raceDate || !Number.isFinite(raceNo)) continue;
      const row = { ...value, _key:key, _date:raceDate, _raceNo:raceNo };
      groupFor(raceDate, raceNo).rows.push(row);
      const name = text(value.horseName || value.horse_name);
      const code = text(value.lineageLoginCode || value.lineage_login_code);
      if (name && code) {
        if (!codesByName.has(name)) codesByName.set(name, new Set());
        codesByName.get(name).add(code);
      }
    }

    const resolveIdentity = identityResolver(codesByName);
    const histories = new Map();
    const jockeyEvents = new Map(), trainerEvents = new Map(), comboEvents = new Map();
    const ordered = [...groups.values()].sort((a, b) => a.d.localeCompare(b.d) || a.n - b.n);
    for (const group of ordered) {
      const actual = group.rows.map(row => ({ row, starter:starter(row) })).filter(item => item.starter);
      if (!actual.some(item => item.starter.finish === 1)) continue;
      const fieldSize = actual.length;
      const distance = Number.parseInt(String(group.meta.distance || '').replace(/\D/g, ''), 10) || null;
      const condition = text(group.meta.track_cond || group.meta.trackCond);
      for (const item of actual) {
        const row = item.row, status = item.starter;
        const identity = resolveIdentity(row);
        if (identity) {
          if (!histories.has(identity)) histories.set(identity, []);
          const corners = corner(row.corner);
          const agari = number(row.agari3f);
          histories.get(identity).push({
            raceDate:group.d, raceNo:group.n, finish:status.finish,
            finishPercentile:status.finish == null ? 1 : round8((status.finish - 1) / Math.max(fieldSize - 1, 1)),
            starterStatus:status.status, distance, trackCondition:condition,
            corner1:corners.length ? corners[0] : null,
            corner4:corners.length ? corners[corners.length - 1] : null,
            agari3f:agari != null && agari >= 25 && agari <= 60 ? agari : null,
            bodyWeight:number(row.weight), jockey:text(row.jockey),
          });
        }
        const jockey = text(row.jockey), trainer = text(row.trainer);
        const top3 = status.finish != null && status.finish <= 3;
        addConnection(jockeyEvents, jockey, group.d, group.n, top3);
        addConnection(trainerEvents, trainer, group.d, group.n, top3);
        addConnection(comboEvents, jockey && trainer ? `${jockey}\u241f${trainer}` : '', group.d, group.n, top3);
      }
    }
    liveIndex = { codesByName, resolveIdentity, histories, jockeyEvents, trainerEvents, comboEvents };
    return liveIndex;
  }

  function connectionAsOf(events, key, raceDate, raceNo) {
    const rows = events.get(key) || [];
    let low = 0, high = rows.length - 1, answer = -1;
    while (low <= high) {
      const middle = (low + high) >> 1, row = rows[middle];
      if (before(row.d, row.n, raceDate, raceNo)) { answer = middle; low = middle + 1; }
      else high = middle - 1;
    }
    return answer >= 0 ? { start:rows[answer].start, top3:rows[answer].top3 } : { start:0, top3:0 };
  }

  function rawForRunner(raceNo, scoredRunner) {
    const api = root.KvVnextPartnerShadow;
    if (!api || typeof api.buildRawFeatures !== 'function') return null;
    const race = allRacesData[raceNo];
    const horse = scoredRunner && scoredRunner.horse;
    if (!race || !horse) return null;
    const index = buildLiveIndex();
    const raceDate = date(race.raceInfo && race.raceInfo.raceDate);
    const rno = Number.parseInt(raceNo, 10);
    const currentIdentity = index.resolveIdentity(horse);
    if (!currentIdentity) return null;
    const history = (index.histories.get(currentIdentity) || []).filter(run => before(run.raceDate, run.raceNo, raceDate, rno));
    const jockey = text(horse.jockey), trainer = text(horse.trainer);
    const context = {
      currentDate:raceDate,
      currentDistance:Number.parseInt(String(race.raceInfo.distance || '').replace(/\D/g, ''), 10) || null,
      currentCondition:text(race.raceInfo.trackCond || race.raceInfo.track_cond),
      current:{ kinryo:horse.kinryo, bodyWeight:horse.weight, jockey, trainer },
      connections:{
        jockey:connectionAsOf(index.jockeyEvents, jockey, raceDate, rno),
        trainer:connectionAsOf(index.trainerEvents, trainer, raceDate, rno),
        combo:connectionAsOf(index.comboEvents, jockey && trainer ? `${jockey}\u241f${trainer}` : '', raceDate, rno),
      },
      history,
    };
    const built = api.buildRawFeatures(context);
    return built && built.ok ? built.raw : null;
  }

  function scoreAbilityRunners(runners) {
    const api = root.KvVnextPartnerShadow;
    if (!api || !Array.isArray(runners)) return { ok:false, reason:'vnext_unavailable' };
    const normalized = runners.map(runner => ({
      u:runner.u, name:runner.name, currentScore:runner.totalScore, raw:runner.vnextRaw,
    }));
    const cacheKey = JSON.stringify(normalized);
    if (abilityScoreCache.has(cacheKey)) return abilityScoreCache.get(cacheKey);
    const result = api.scoreRace(normalized);
    abilityScoreCache.set(cacheKey, result);
    if (abilityScoreCache.size > 24) abilityScoreCache.delete(abilityScoreCache.keys().next().value);
    return result;
  }

  function predictor(input) {
    if (!input || !Array.isArray(input.runners)) return { mainline:[], longshot:[] };
    if (input.runners.some(runner => !runner.vnextRaw || !Number.isFinite(Number(runner.totalScore)))) {
      return { mainline:[], longshot:[] };
    }
    const result = scoreAbilityRunners(input.runners);
    if (!result.ok || !result.anchor || result.anchor.u !== input.anchor.u) return { mainline:[], longshot:[] };
    return {
      mainline:result.ranked.slice(0, 2).map((runner, index) => ({
        u:runner.u, probability:runner.probability, score:runner.linear,
        reasons:[`vNext相手順位${index + 1}`, '近走・適性・騎手厩舎を統合'],
      })),
      longshot:[],
    };
  }

  function blendPredictor(input) {
    const api = root.KvVnextMarketBlend;
    if (!api || !input || !Array.isArray(input.runners) || !input.anchor ||
        !input.market || input.market.source !== 'keiba.go.jp/OddsTanFuku' ||
        Number(input.market.fetchedRunnerCount) !== input.runners.length) {
      return { mainline:[], longshot:[] };
    }
    if (input.runners.some(runner => !runner.vnextRaw || !Number.isFinite(Number(runner.totalScore)) ||
        !Number.isFinite(Number(runner.odds)) || Number(runner.odds) <= 0)) {
      return { mainline:[], longshot:[] };
    }
    const result = api.scoreRace(input.runners.map(runner => ({
      u:runner.u, name:runner.name, currentScore:runner.totalScore,
      odds:runner.odds, raw:runner.vnextRaw,
    })), { scoreRace:runners => {
      // vNext単体shadowを同じ入力で直前に計算済みなら、その全候補出力を再利用する。
      return scoreAbilityRunners(runners.map(runner => ({
        u:runner.u, name:runner.name, totalScore:runner.currentScore, vnextRaw:runner.raw,
      })));
    }});
    if (!result.ok || !result.anchor || result.anchor.u !== input.anchor.u) return { mainline:[], longshot:[] };
    return {
      mainline:result.ranked.slice(0, 2).map((runner, index) => ({
        u:runner.u, probability:runner.probability, score:runner.linear,
        reasons:[
          `固定blend相手順位${index + 1}`,
          `市場75%・能力25%`,
          `市場${(runner.marketProbability * 100).toFixed(1)}%／能力${(runner.abilityProbability * 100).toFixed(1)}%`,
        ],
      })),
      longshot:[],
    };
  }

  function fallbackPlan(scored, reason) {
    return {
      active:false,
      reason:reason || 'fallback',
      source:'current',
      modelId:BLEND_MODEL_ID,
      ordered:Array.isArray(scored) ? scored.slice() : [],
      anchor:null,
      mainline:[],
    };
  }

  function rolloutEnabled() {
    try {
      return root.KV_T10_PARTNER_ROLLOUT_ENABLED === true &&
        root.localStorage?.getItem(ROLLOUT_DISABLE_KEY) !== '1';
    } catch (e) { return false; }
  }

  function setRolloutEnabled(enabled) {
    try {
      if (enabled) root.localStorage?.removeItem(ROLLOUT_DISABLE_KEY);
      else root.localStorage?.setItem(ROLLOUT_DISABLE_KEY, '1');
      return rolloutEnabled();
    } catch (e) { return false; }
  }

  function raceTiming(raceNo, raceDate) {
    try {
      return typeof root._aiPredictionTimeMeta === 'function'
        ? root._aiPredictionTimeMeta(raceDate, raceNo) : null;
    } catch (e) { return null; }
  }

  function runnerSet(scored) {
    return (Array.isArray(scored) ? scored : []).map(row => Number.parseInt(row?.horse?.umaBan, 10))
      .filter(Number.isInteger).sort((a, b) => a - b);
  }

  function sameRunnerSet(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => value === right[index]);
  }

  function cacheKey(raceDate, raceNo) {
    return `${ROLLOUT_CACHE_PREFIX}${String(raceDate || '').replace(/\D/g, '')}|${String(Number.parseInt(raceNo, 10)).padStart(2, '0')}`;
  }

  function readCachedPicks(raceDate, raceNo, expectedRunnerSet) {
    try {
      const value = JSON.parse(root.localStorage?.getItem(cacheKey(raceDate, raceNo)) || 'null');
      if (!value || value.modelId !== BLEND_MODEL_ID || value.marketSource !== 'keiba.go.jp/OddsTanFuku' ||
          !sameRunnerSet(value.runnerSet, expectedRunnerSet) || !Array.isArray(value.mainline) ||
          value.mainline.length !== 2 || Number(value.minutesBeforeStart) < T10_MIN ||
          Number(value.minutesBeforeStart) > T10_MAX) return null;
      return value;
    } catch (e) { return null; }
  }

  function writeCachedPicks(raceDate, raceNo, value) {
    try { root.localStorage?.setItem(cacheKey(raceDate, raceNo), JSON.stringify(value)); } catch (e) {}
  }

  function findSavedT10Picks(raceDate, raceNo, expectedRunnerSet, anchorUma) {
    try {
      if (typeof root.listForwardOpponentShadowSnapshots !== 'function') return null;
      const rows = root.listForwardOpponentShadowSnapshots().filter(row =>
        row && row.opponentModel?.id === BLEND_MODEL_ID && row.raceDate === raceDate &&
        Number(row.raceNo) === Number(raceNo) && Number(row.anchor) === anchorUma &&
        row.timing === 'verified_prestart' && row.marketSource === 'keiba.go.jp/OddsTanFuku' &&
        Number(row.minutesBeforeStart) >= T10_MIN && Number(row.minutesBeforeStart) <= T10_MAX &&
        Array.isArray(row.mainline) && row.mainline.length === 2 && Array.isArray(row.marketAtCapture));
      rows.sort((a, b) => Math.abs(Number(a.minutesBeforeStart) - T10_MIN) - Math.abs(Number(b.minutesBeforeStart) - T10_MIN) ||
        String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')));
      for (const row of rows) {
        const capturedSet = row.marketAtCapture.map(item => Number.parseInt(item?.u, 10))
          .filter(Number.isInteger).sort((a, b) => a - b);
        if (!sameRunnerSet(capturedSet, expectedRunnerSet) ||
            row.marketAtCapture.some(item => !Number.isFinite(Number(item?.odds)) || Number(item.odds) <= 0)) continue;
        return {
          modelId:BLEND_MODEL_ID,
          source:'saved-t10',
          capturedAt:row.capturedAt || null,
          observedAt:row.marketObservedAt || null,
          marketSource:row.marketSource,
          minutesBeforeStart:Number(row.minutesBeforeStart),
          runnerSet:expectedRunnerSet,
          anchor:anchorUma,
          mainline:row.mainline.map(item => Number.parseInt(item.u, 10)),
        };
      }
    } catch (e) {}
    return null;
  }

  function computeFreshT10Picks(raceNo, scored, raceDate, timing, expectedRunnerSet, anchorUma) {
    if (!timing || timing.timing !== 'verified_prestart' ||
        Number(timing.minutesBeforeStart) < T10_MIN || Number(timing.minutesBeforeStart) > T10_MAX) return null;
    try {
      if (typeof root._opponentShadowInput !== 'function') return null;
      const input = root._opponentShadowInput(raceNo, scored, { includeVnext:true });
      if (!input || !input.anchor || Number(input.anchor.u) !== anchorUma ||
          input.market?.source !== 'keiba.go.jp/OddsTanFuku' ||
          Number(input.market?.fetchedRunnerCount) !== expectedRunnerSet.length ||
          input.runners.length !== expectedRunnerSet.length) return null;
      const observedMs = Date.parse(input.market.observedAt);
      const ageMinutes = (Date.now() - observedMs) / 60000;
      if (!Number.isFinite(observedMs) || !Number.isFinite(ageMinutes) || ageMinutes < -0.1 ||
          ageMinutes > MAX_MARKET_AGE_MINUTES) return null;
      const raw = blendPredictor(input);
      const mainline = (raw.mainline || []).map(item => Number.parseInt(item.u, 10));
      if (mainline.length !== 2) return null;
      const value = {
        modelId:BLEND_MODEL_ID,
        source:'live-t10',
        capturedAt:new Date().toISOString(),
        observedAt:input.market.observedAt,
        marketSource:input.market.source,
        minutesBeforeStart:Number(timing.minutesBeforeStart),
        runnerSet:expectedRunnerSet,
        anchor:anchorUma,
        mainline,
      };
      writeCachedPicks(raceDate, raceNo, value);
      return value;
    } catch (e) { return null; }
  }

  /**
   * 監査済みT10相手モデルの表示計画。scoredと各要素は変更しない。
   * ◎は常にscored[0]。T10の出走馬集合・公式オッズ・発走時刻が揃わなければ従来順へ戻す。
   */
  function buildT10PartnerDisplayPlan(raceNo, scored) {
    if (!Array.isArray(scored) || scored.length < 4) return fallbackPlan(scored, 'insufficient-runners');
    if (!rolloutEnabled()) return fallbackPlan(scored, 'kill-switch');
    const race = (typeof allRacesData !== 'undefined' && allRacesData) ? allRacesData[raceNo] : null;
    const raceDate = date(race?.raceInfo?.raceDate);
    const timing = raceTiming(raceNo, raceDate);
    if (!raceDate || !timing || timing.timing !== 'verified_prestart') return fallbackPlan(scored, 'not-verified-prestart');
    const expectedRunnerSet = runnerSet(scored);
    if (expectedRunnerSet.length !== scored.length) return fallbackPlan(scored, 'invalid-runner-set');
    const anchorUma = Number.parseInt(scored[0]?.horse?.umaBan, 10);
    if (!Number.isInteger(anchorUma)) return fallbackPlan(scored, 'invalid-anchor');

    const value = findSavedT10Picks(raceDate, raceNo, expectedRunnerSet, anchorUma) ||
      readCachedPicks(raceDate, raceNo, expectedRunnerSet) ||
      computeFreshT10Picks(raceNo, scored, raceDate, timing, expectedRunnerSet, anchorUma);
    if (!value || Number(value.anchor) !== anchorUma) return fallbackPlan(scored, 't10-data-unavailable');
    const byUma = new Map(scored.map(row => [Number.parseInt(row?.horse?.umaBan, 10), row]));
    const mainline = value.mainline.map(uma => byUma.get(Number(uma))).filter(Boolean);
    if (mainline.length !== 2 || mainline[0] === mainline[1] || mainline.includes(scored[0])) {
      return fallbackPlan(scored, 'invalid-t10-picks');
    }
    const used = new Set([scored[0], ...mainline]);
    return {
      active:true,
      reason:null,
      source:value.source,
      modelId:BLEND_MODEL_ID,
      capturedAt:value.capturedAt || null,
      observedAt:value.observedAt || null,
      minutesBeforeStart:Number(value.minutesBeforeStart),
      ordered:[scored[0], ...mainline, ...scored.filter(row => !used.has(row))],
      anchor:scored[0],
      mainline,
    };
  }

  function ensureRegistered() {
    const api = root.KvVnextPartnerShadow;
    if (!api || typeof registerOpponentShadowModel !== 'function') return false;
    if (!vnextRegistered) {
      registerOpponentShadowModel({
        id:MODEL_ID, version:'1.0.0', family:'rich-market-free-partner-shadow',
        target:'actual-ui-anchor-conditioned-top3',
        featurePipelineVersion:'complete-v3-reliable-all-live-v1', marketInputs:[],
        config:{
          requiresVnextFeatures:true, sourceBundleSha256:api.contract.sourceBundleSha256,
          selectedCandidate:api.contract.selectedCandidate,
          baseline:'actual-ui-current-rank-2-and-3',
          currentScorePolicy:'actual-ui-totalScore-new-forward-hypothesis',
          captureCutoffMinutes:10,
          requiredMainlinePicks:2, requiresCompleteBaseline:true,
          primaryMetric:'both2-top3-given-actual-ui-anchor-top3',
          productionMarksAllowed:false, valueBetAdviceAllowed:false,
        }, activate:false,
      }, predictor);
      vnextRegistered = true;
    }
    const blendApi = root.KvVnextMarketBlend;
    if (blendApi && !blendRegistered) {
      registerOpponentShadowModel({
        id:BLEND_MODEL_ID, version:'1.0.0', family:'forward-market-vnext-blend-shadow',
        target:'actual-ui-anchor-conditioned-top3',
        featurePipelineVersion:'complete-v3-reliable-all-live-v1+t10-market-proxy-v1',
        marketInputs:['odds'],
        config:{
          requiresVnextFeatures:true, requiresVerifiedStart:true, requiresFreshMarket:true,
          maxMarketAgeMinutes:2, captureCutoffMinutes:10,
          requiredMainlinePicks:2, requiresCompleteBaseline:true,
          componentModels:[
            'kochi-t10-market-mainline-v1@1.0.0',
            'kochi-vnext-rich-partner-shadow-v1@1.0.0',
          ],
          sourceBundleSha256:api.contract.sourceBundleSha256,
          blendContractVersion:blendApi.contract.schemaVersion,
          marketWeight:blendApi.contract.marketWeight,
          abilityWeight:blendApi.contract.abilityWeight,
          marketProbability:blendApi.contract.marketProbability,
          blend:blendApi.contract.blend,
          marketUniverse:'all-live-runners-including-anchor; never-renormalize-after-anchor-removal',
          marketSource:'keiba.go.jp/OddsTanFuku',
          lateExclusionPolicy:'exclude-whole-race-if-capture-universe-differs-from-result-starters',
          baseline:'actual-ui-current-rank-2-and-3',
          primaryMetric:'both2-top3-given-actual-ui-anchor-top3',
          productionMarksAllowed:false, valueBetAdviceAllowed:false,
        }, activate:false,
      }, blendPredictor);
      blendRegistered = true;
    }
    return vnextRegistered && blendRegistered;
  }

  function capture(raceNo, scored) {
    if (!ensureRegistered() || typeof computeOpponentShadow !== 'function' ||
        typeof recordForwardOpponentShadowSnapshot !== 'function') return { saved:false, reason:'VNEXT_NOT_READY' };
    const shadow = computeOpponentShadow(raceNo, scored, MODEL_ID);
    if (!shadow) return { saved:false, reason:'VNEXT_MODEL_GATE_REJECTED' };
    return recordForwardOpponentShadowSnapshot(raceNo, shadow);
  }

  // 画面に出す相手候補は、T10市場モデルではなくオッズ非依存の能力モデルを明示指定する。
  // active model は既存のT10収集契約で使うため変更せず、両実験の台帳を混同しない。
  function computeAbilityShadow(raceNo, scored) {
    if (!ensureRegistered() || typeof computeOpponentShadow !== 'function') return null;
    return computeOpponentShadow(raceNo, scored, MODEL_ID);
  }

  function captureBlend(raceNo, scored) {
    if (!ensureRegistered() || typeof computeOpponentShadow !== 'function' ||
        typeof recordForwardOpponentShadowSnapshot !== 'function') return { saved:false, reason:'BLEND_NOT_READY' };
    const shadow = computeOpponentShadow(raceNo, scored, BLEND_MODEL_ID);
    if (!shadow) return { saved:false, reason:'BLEND_MODEL_GATE_REJECTED' };
    return recordForwardOpponentShadowSnapshot(raceNo, shadow);
  }

  root.kvVnextPartnerModelId = MODEL_ID;
  root.kvVnextMarketBlendModelId = BLEND_MODEL_ID;
  root.kvVnextRawForScored = rawForRunner;
  root.kvEnsureVnextPartnerShadowRegistered = ensureRegistered;
  root.kvComputeVnextPartnerShadow = computeAbilityShadow;
  root.kvCaptureVnextPartnerShadow = capture;
  root.kvCaptureVnextMarketBlendShadow = captureBlend;
  root.kvT10PartnerRolloutEnabled = rolloutEnabled;
  root.kvSetT10PartnerRolloutEnabled = setRolloutEnabled;
  root.kvBuildT10PartnerDisplayPlan = buildT10PartnerDisplayPlan;
  root.kvResetVnextPartnerLiveIndex = () => { liveIndex = null; abilityScoreCache.clear(); };
})(typeof globalThis !== 'undefined' ? globalThis : window);
