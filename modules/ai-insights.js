// 高知競馬ビューア: 軽量AI予想キャッシュ・信頼度校正・相手候補監査
// 重い全履歴を展開せずに読み込める独立モジュール。予想順位そのものは変更しない。
(function (global) {
  'use strict';

  // v2: 期待値なしでも「軸＋相手を検討」と買わせる旧判断を廃止。
  const PRECALC_SCHEMA = 'ai_prediction_precalc/v2';
  const PRECALC_PREFIX = 'aiPrecalc_v2';
  const SERVER_TABLE = 'keiba_ai_predictions';
  const MARKS = ['◎', '○', '▲', '△', '×', '×'];
  const serverCache = new Map();
  const serverLoads = new Map();
  const serverPublishes = new Set();
  const INSIGHTS = Object.freeze({
    schema:'ai_insights_shipped/v1',source:'complete-v3 legacy_v2_anchor.score_approx + final market',rankingLabel:'現行AI近似順位',marketLabel:'確定単勝人気・最終単勝オッズ（事後監査専用）',startDate:'2025/01/01',endDate:'2026/07/11',raceCount:1241,choiceSetSha256:'699f63e95dfa47f1fdc5f6ff0c0db8fa5d005f11c11a012a2df9e75b89bbc0ec',marketSha256:'16406e68cf41e3b372bc36a4736b24270afcef8d0e6f022b79e8938e8c43b3ec',excluded:{incompleteScore:560,invalidTop3:13,missingMarket:0},
    confidence:{'全体':{n:1241,win:520,top3:900,oddsN:1239,winReturn:1099.7},'1人気':{n:835,win:418,top3:675,oddsN:834,winReturn:678.5},'2-3人気':{n:304,win:86,top3:190,oddsN:303,winReturn:299.0},'4-6人気':{n:83,win:15,top3:30,oddsN:83,winReturn:109.2},'7人気以下':{n:19,win:1,top3:5,oddsN:19,winReturn:13.0},'4人気以下':{n:102,win:16,top3:35,oddsN:102,winReturn:122.2}},
    opponents:{definition:'AI2〜4位（○▲△）',byMark:{'○':{n:1241,win:250,top3:696,oddsN:1239,winReturn:1010.0},'▲':{n:1241,win:140,top3:574,oddsN:1239,winReturn:904.9},'△':{n:1241,win:89,top3:439,oddsN:1239,winReturn:906.3}},byPopularity:{'1人気':{n:337,win:109,top3:222,oddsN:336,winReturn:244.9},'2-3人気':{n:1727,win:278,top3:970,oddsN:1724,winReturn:1301.4},'4-6人気':{n:1347,win:84,top3:466,oddsN:1345,winReturn:1021.7},'7人気以下':{n:312,win:8,top3:51,oddsN:312,winReturn:253.2}},byDistance:{'800':{n:15,win:3,top3:8,oddsN:15,winReturn:11.3},'1300':{n:1212,win:146,top3:545,oddsN:1206,winReturn:851.9},'1400':{n:1689,win:226,top3:777,oddsN:1689,winReturn:1359.1},'1600':{n:759,win:97,top3:358,oddsN:759,winReturn:559.4},'その他':{n:48,win:7,top3:21,oddsN:48,winReturn:39.5}},byClass:{'A':{n:357,win:55,top3:168,oddsN:357,winReturn:283.0},'B':{n:297,win:39,top3:131,oddsN:297,winReturn:227.9},'C1':{n:609,win:80,top3:263,oddsN:609,winReturn:406.5},'C2':{n:621,win:67,top3:261,oddsN:621,winReturn:398.4},'C3':{n:1335,win:161,top3:631,oddsN:1335,winReturn:980.1},'3歳':{n:390,win:57,top3:193,oddsN:390,winReturn:351.6},'2歳':{n:99,win:18,top3:54,oddsN:93,winReturn:161.6},'その他':{n:15,win:2,top3:8,oddsN:15,winReturn:12.1}},longshot:{'4人気以下':{n:1659,win:92,top3:517,oddsN:1657,winReturn:1274.9},'7人気以下':{n:312,win:8,top3:51,oddsN:312,winReturn:253.2}}}
  });

  function esc(value) {
    return typeof escapeHTML === 'function' ? escapeHTML(value) : String(value == null ? '' : value)
      .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function dateKey(value) { return String(value || '').replace(/\D/g, ''); }
  function racePrefix(date) { return `${PRECALC_PREFIX}|31|${dateKey(date)}|`; }
  function cacheKey(date, raceNo, fingerprint) {
    return `${racePrefix(date)}${String(parseInt(raceNo, 10)).padStart(2, '0')}|${fingerprint}`;
  }
  function serverKey(date, raceNo, fingerprint) {
    return `${dateKey(date)}|${String(parseInt(raceNo, 10)).padStart(2, '0')}|${fingerprint}`;
  }
  function serverId(snapshot) {
    return `ai_31_${dateKey(snapshot.raceDate)}_${String(parseInt(snapshot.raceNo, 10)).padStart(2, '0')}_${String(snapshot.modelFingerprint || '').replace(/[^0-9A-Za-z_-]/g, '')}`;
  }
  function popularityBand(value) {
    const rank = parseInt(value, 10);
    if (!Number.isFinite(rank) || rank < 1) return '全体';
    if (rank === 1) return '1人気';
    if (rank <= 3) return '2-3人気';
    if (rank <= 6) return '4-6人気';
    return '7人気以下';
  }
  function wilsonLower(hits, n, z) {
    if (!n) return 0;
    const p = hits / n, zz = z * z;
    return (p + zz / (2 * n) - z * Math.sqrt((p * (1 - p) + zz / (4 * n)) / n)) / (1 + zz / n);
  }
  function confidenceForPopularity(value) {
    const requestedBand = popularityBand(value);
    let band = requestedBand, stat = INSIGHTS.confidence[band];
    // 7人気以下は19件しかないため、事前登録した4人気以下セルへ縮約する。
    if (!stat || stat.n < 50) { band = requestedBand === '7人気以下' ? '4人気以下' : '全体'; stat = INSIGHTS.confidence[band]; }
    const winRate = stat.win / stat.n, top3Rate = stat.top3 / stat.n;
    const winLow = wilsonLower(stat.win, stat.n, 1.645), top3Low = wilsonLower(stat.top3, stat.n, 1.645);
    const label = winLow >= .40 && top3Low >= .70 ? '高' : winLow >= .20 && top3Low >= .50 ? '中' : '慎重';
    return { label, kind:'market_band_history', className:label === '高' ? 'high' : label === '中' ? 'mid' : 'low', band,
      requestedBand, n:stat.n, winRate, top3Rate, winLow, top3Low,
      source:`同人気帯における◎の過去成績 ${INSIGHTS.raceCount}R（${INSIGHTS.startDate}〜${INSIGHTS.endDate}）。AI勝率ではありません` };
  }
  function reasonFor(row) {
    if (typeof _cockpitReasonFor === 'function') return _cockpitReasonFor(row);
    return '総合評価上位';
  }
  function runnerSignature(data) {
    const race = data && data.raceInfo || {};
    const rows = (data && data.horses || []).map(h => [
      parseInt(h.umaBan, 10) || null, String(h.horseName || ''), String(h.jockey || ''),
      String(h.trainer || ''), String(h.kinryo || ''), String(h.weight || ''), String(h.sexAge || ''),
    ])
      .sort((a, b) => (a[0] || 0) - (b[0] || 0));
    const signatureInput = { distance:String(race.distance || ''), trackCond:String(race.trackCond || ''),
      raceClass:String(race.raceClass || ''), runners:rows };
    return typeof _aiFingerprint === 'function' ? _aiFingerprint(signatureInput) : JSON.stringify(signatureInput);
  }
  function findValuePick(raceNo, result, scored) {
    // 旧EVモデルは最終オッズ混入のため廃止。新T10モデルは管理者のforward shadowへ隔離し、
    // 公開・共有キャッシュには候補を保存しない。
    return null;
  }

  function cachePrediction(raceNo, computed) {
    try {
      if (typeof lsRead !== 'function' || typeof lsWrite !== 'function' || typeof buildRankingModelIdentity !== 'function') return null;
      const data = allRacesData && allRacesData[raceNo];
      if (!data || !data.raceInfo || !Array.isArray(data.horses)) return null;
      if (data.horses.some(h => /^\d+$/.test(String(h.chakujun || '')))) return null;
      const scored = (computed && computed.scored || []).filter(s => s && s.horse && s.totalScore != null);
      if (scored.length < 4) return null;
      const model = buildRankingModelIdentity(), raceDate = data.raceInfo.raceDate || currentDate || '';
      const value = findValuePick(raceNo, computed, scored);
      const runners = scored.map((s, index) => ({
        u:parseInt(s.horse.umaBan, 10) || null, name:String(s.horse.horseName || ''), jockey:String(s.jockey || s.horse.jockey || ''),
        mark:MARKS[index] || '', rank:index + 1, totalScore:Number(s.totalScore), reason:reasonFor(s),
        odds:Number.isFinite(parseFloat(s.horse.odds)) ? parseFloat(s.horse.odds) : null,
        ninki:Number.isFinite(parseInt(s.horse.ninki, 10)) ? parseInt(s.horse.ninki, 10) : null
      }));
      const now = new Date().toISOString();
      const snapshot = { type:'aiPredictionPrecalc', schema:PRECALC_SCHEMA, babaCode:'31', raceDate,
        raceNo:parseInt(raceNo, 10), computedAt:now, modelFingerprint:model.fingerprint,
        modelVersion:model.version, runnerSignature:runnerSignature(data), runners,
        value:value || null, confidence:confidenceForPopularity(runners[0] && runners[0].ninki) };
      snapshot.outputFingerprint = typeof _aiFingerprint === 'function'
        ? _aiFingerprint(runners.map(r => [r.u, r.rank, r.totalScore])) : '';
      const key = cacheKey(raceDate, raceNo, model.fingerprint);
      const prior = lsRead()[key];
      if (!prior || prior.outputFingerprint !== snapshot.outputFingerprint || prior.runnerSignature !== snapshot.runnerSignature) lsWrite(key, snapshot);
      publishServerPrediction(snapshot);
      return snapshot;
    } catch (error) {
      console.warn('[ai precalc cache]', error);
      return null;
    }
  }

  function isUsableSnapshot(row, data, model) {
    return !!(row && row.schema === PRECALC_SCHEMA && row.modelFingerprint === model.fingerprint &&
      row.runnerSignature === runnerSignature(data) && Array.isArray(row.runners) && row.runners.length >= 4);
  }

  function publishServerPrediction(snapshot) {
    try {
      if (!snapshot || typeof apiUpsert !== 'function' || typeof isAdminMode !== 'function' || !isAdminMode() ||
          typeof getWriteToken !== 'function' || !getWriteToken()) return;
      const id = serverId(snapshot);
      const signature = `${id}|${snapshot.runnerSignature}|${snapshot.outputFingerprint}`;
      if (serverPublishes.has(signature)) return;
      serverPublishes.add(signature);
      Promise.resolve(apiUpsert(SERVER_TABLE, id, {
        baba_code:'31', race_date:snapshot.raceDate, race_no:parseInt(snapshot.raceNo, 10),
        model_fingerprint:snapshot.modelFingerprint, runner_signature:snapshot.runnerSignature,
        output_fingerprint:snapshot.outputFingerprint || '', computed_at:snapshot.computedAt,
        payload:snapshot,
      })).catch(error => {
        serverPublishes.delete(signature);
        console.warn('[ai server cache publish]', error);
      });
    } catch (error) {
      console.warn('[ai server cache publish]', error);
    }
  }

  async function hydrateServerDay(date) {
    const wanted = String(date || currentDate || '');
    if (!wanted || typeof fetch !== 'function' || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_HEADERS === 'undefined') return [];
    if (serverLoads.has(wanted)) return serverLoads.get(wanted);
    const job = (async () => {
      try {
        const url = `${SUPABASE_URL}/rest/v1/${SERVER_TABLE}?select=race_date,race_no,model_fingerprint,runner_signature,output_fingerprint,computed_at,payload&baba_code=eq.31&race_date=eq.${encodeURIComponent(wanted)}&order=race_no.asc&limit=24`;
        const response = await fetch(url, { headers:SUPABASE_HEADERS, cache:'no-store' });
        if (!response.ok) {
          if (response.status !== 404) console.warn('[ai server cache load]', response.status);
          return [];
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) return [];
        rows.forEach(dbRow => {
          const payload = dbRow && dbRow.payload;
          if (!payload || payload.schema !== PRECALC_SCHEMA || !dbRow.model_fingerprint) return;
          const snapshot = { ...payload, cacheSource:'server' };
          const sk = serverKey(dbRow.race_date || payload.raceDate, dbRow.race_no || payload.raceNo, dbRow.model_fingerprint);
          serverCache.set(sk, snapshot);
          if (typeof lsWrite === 'function') lsWrite(cacheKey(payload.raceDate, payload.raceNo, payload.modelFingerprint), snapshot);
        });
        return rows;
      } catch (error) {
        console.warn('[ai server cache load]', error);
        return [];
      }
    })();
    serverLoads.set(wanted, job);
    return job;
  }

  function getCachedPrediction(raceNo) {
    try {
      if (typeof lsRead !== 'function' || typeof buildRankingModelIdentity !== 'function') return null;
      const data = allRacesData && allRacesData[raceNo];
      if (!data || !data.raceInfo) return null;
      const model = buildRankingModelIdentity();
      const raceDate = data.raceInfo.raceDate || currentDate;
      const local = lsRead()[cacheKey(raceDate, raceNo, model.fingerprint)];
      if (isUsableSnapshot(local, data, model)) return local;
      const shared = serverCache.get(serverKey(raceDate, raceNo, model.fingerprint));
      return isUsableSnapshot(shared, data, model) ? shared : null;
    } catch (_) { return null; }
  }
  function marketText(row, live) {
    const ninki = parseInt(live && live.ninki, 10) || parseInt(row.ninki, 10);
    const odds = parseFloat(live && live.odds) || parseFloat(row.odds);
    return `${Number.isFinite(ninki) ? ninki + '人気' : '人気—'}${Number.isFinite(odds) ? ' ' + odds.toFixed(1) : ''}`;
  }
  function snapshotAction(confidence, hasValue) {
    return hasValue ? '単勝の期待値候補あり' : '見送り';
  }
  function confidenceHtml(confidence) {
    return `◎1着 ${(confidence.winRate * 100).toFixed(1)}%・3着内 ${(confidence.top3Rate * 100).toFixed(1)}%（${esc(confidence.band)} n=${confidence.n}）`;
  }
  function renderCachedPrediction(raceNo) {
    if (typeof _idbFullReady !== 'undefined' && _idbFullReady && typeof computeYosoScored === 'function') return false;
    const snapshot = getCachedPrediction(raceNo);
    if (!snapshot) return false;
    const data = allRacesData && allRacesData[raceNo], liveByU = new Map((data && data.horses || []).map(h => [parseInt(h.umaBan, 10), h]));
    const dock = document.getElementById(`cockpit-picks-${raceNo}`), panel = document.getElementById(`cockpit-ai-panel-${raceNo}`);
    if (!dock && !panel) return false;
    const rows = snapshot.runners, main = rows[0], opponents = rows.slice(1, 4), value = snapshot.value && rows.find(r => r.u === snapshot.value.u);
    const confidence = confidenceForPopularity((liveByU.get(main.u) || main).ninki);
    const card = (row, mark, kind, note) => row ? `<button type="button" class="cockpit-pick is-${kind}" onclick="switchViewTab(${raceNo},'yoso')"><span class="cockpit-mark is-${kind}">${mark}</span><span class="cockpit-pick-copy"><strong>${esc(row.u || '—')}番 ${esc(row.name)}</strong><small>${esc(note)}</small></span><span class="cockpit-odds">${esc(marketText(row, liveByU.get(row.u)))}</span></button>` : '';
    const opponentHtml = `<button type="button" class="cockpit-pick is-opponents" onclick="switchViewTab(${raceNo},'yoso')"><span class="cockpit-mark is-second">○</span><span class="cockpit-opponent-list"><span class="cockpit-opponent-head">相手候補</span>${opponents.map((r, i) => `<span class="cockpit-opponent-line"><span class="cockpit-opponent-mark">${['○','▲','△'][i]}</span><b>${esc(r.u)}番 ${esc(r.name)}</b><small>${esc(marketText(r, liveByU.get(r.u)))}</small></span>`).join('')}</span></button>`;
    const risks = [];
    const gap = rows[1] ? Number(main.totalScore) - Number(rows[1].totalScore) : 0;
    if (gap < 2) risks.push('上位評価が接近');
    if (!value) risks.push('明確な妙味なし');
    if (!risks.length) risks.push('大きな不安材料なし');
    const decision = `<div class="cockpit-decision"><span class="decision-chip is-${confidence.className}" title="${esc(confidence.source)}"><i class="fas fa-chart-bar"></i> 同人気帯実績 ${confidence.label}</span><span class="decision-action"><i class="fas fa-gavel"></i> ${esc(snapshotAction(confidence, !!value))}</span><span class="decision-risk"><b>${confidenceHtml(confidence)}</b><br>不安材料: ${esc(risks.join('・'))}</span><button type="button" class="btn btn-secondary btn-sm viewer-ok" onclick="kvRefreshPrediction(${raceNo})">端末データで最新計算</button></div>`;
    if (dock) dock.innerHTML = card(main, '◎', 'main', `能力1位・${main.reason}`) + opponentHtml + (value ? card(value, '☆', 'value', snapshot.value.note) : '') + decision;
    if (panel) {
      const time = new Date(snapshot.computedAt), stamp = Number.isNaN(time.getTime()) ? '' : time.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const tableRows = rows.slice(0, 6).map(row => `<tr class="cockpit-rank-row"><td><div class="cockpit-horse"><span class="cockpit-rank-mark">${row.mark}</span><span class="cockpit-uma">${esc(row.u)}</span><span><b>${esc(row.name)}</b><small>AI ${row.rank}位</small></span></div></td><td class="cockpit-market">${esc(marketText(row, liveByU.get(row.u)))}</td><td><i class="fas fa-layer-group"></i> ${esc(row.reason)}</td></tr>`).join('');
      const sourceLabel = snapshot.cacheSource === 'server' ? '共有事前計算' : '端末の事前計算';
      panel.innerHTML = `<div class="cockpit-panel-head"><div><h3>能力予想</h3><p>◎○▲△はオッズ非依存。期待値候補がなければ購入は見送り</p></div><span><i class="fas fa-bolt"></i> ${sourceLabel} ${esc(stamp)}</span></div><div class="table-wrapper"><table class="cockpit-table"><thead><tr><th>印・馬</th><th>市場</th><th>判断材料</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
    }
    return true;
  }

  const scheduledDays = new Set();
  function scheduleDayPrecompute(date) {
    if (typeof _idbFullReady !== 'undefined' && !_idbFullReady) return;
    if (typeof computeYosoScored !== 'function') return;
    const wanted = String(date || currentDate || ''), token = `${wanted}|${buildRankingModelIdentity().fingerprint}`;
    if (scheduledDays.has(token)) return;
    scheduledDays.add(token);
    const raceNos = Object.keys(allRacesData || {}).map(Number).filter(Number.isFinite).sort((a,b) => a-b);
    let index = 0;
    const step = () => {
      while (index < raceNos.length) {
        const raceNo = raceNos[index++], data = allRacesData[raceNo];
        if (!data || data.raceInfo.raceDate !== wanted || data.horses.some(h => /^\d+$/.test(String(h.chakujun || '')))) continue;
        try { cachePrediction(raceNo, computeYosoScored(raceNo, null)); } catch (_) {}
        break;
      }
      if (index < raceNos.length) {
        if (global.requestIdleCallback) global.requestIdleCallback(step, {timeout:2000}); else setTimeout(step, 50);
      }
    };
    if (global.requestIdleCallback) global.requestIdleCallback(step, {timeout:1500}); else setTimeout(step, 50);
  }

  function rate(stat, field) { return stat && stat.n ? `${(Number(stat[field] || 0) / stat.n * 100).toFixed(1)}%` : '—'; }
  function roi(stat) { return stat && stat.oddsN ? `${(Number(stat.winReturn || 0) / stat.oddsN * 100).toFixed(1)}%` : '—'; }
  function auditRows(source) {
    return Object.entries(source || {}).map(([label, stat]) => `<tr><td><b>${esc(label)}</b></td><td>${stat.n}</td><td>${rate(stat,'win')}</td><td>${rate(stat,'top3')}</td><td>${roi(stat)}</td></tr>`).join('');
  }
  function renderOpponentAudit(targetId, dimension) {
    const target = typeof targetId === 'string' ? document.getElementById(targetId) : targetId;
    if (!target) return;
    const dim = ['byPopularity','byDistance','byClass'].includes(dimension) ? dimension : (target.dataset.dimension || 'byPopularity');
    target.dataset.dimension = dim;
    const sources = {byPopularity:INSIGHTS.opponents.byPopularity,byDistance:INSIGHTS.opponents.byDistance,byClass:INSIGHTS.opponents.byClass};
    const labels = {byPopularity:'人気帯',byDistance:'距離',byClass:'クラス'};
    const hole = INSIGHTS.opponents.longshot['4人気以下'], deep = INSIGHTS.opponents.longshot['7人気以下'];
    target.innerHTML = `<section style="margin-top:16px;border:1px solid #334155;border-radius:10px;background:#0b1624;padding:14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><h3 style="margin:0;color:#e2e8f0;font-size:15px">相手候補監査（○▲△・穴相手）</h3><p style="margin:4px 0 0;color:#94a3b8;font-size:11px">${esc(INSIGHTS.startDate)}〜${esc(INSIGHTS.endDate)}・${INSIGHTS.raceCount}R／${esc(INSIGHTS.opponents.definition)}</p></div><label style="color:#cbd5e1;font-size:12px">内訳 <select onchange="window.kvAiRenderOpponentAudit('${esc(target.id)}',this.value)" style="margin-left:6px;background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:5px"><option value="byPopularity"${dim==='byPopularity'?' selected':''}>人気帯</option><option value="byDistance"${dim==='byDistance'?' selected':''}>距離</option><option value="byClass"${dim==='byClass'?' selected':''}>クラス</option></select></label></div><div style="overflow-x:auto;margin-top:12px"><table class="ais-table"><thead><tr><th>${labels[dim]}</th><th>対象頭数</th><th>1着率</th><th>複勝率</th><th>単勝回収</th></tr></thead><tbody>${auditRows(sources[dim])}</tbody></table></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:10px"><div style="padding:9px;border:1px solid #854d0e;border-radius:7px;background:#2b2109;color:#fde68a;font-size:12px"><b>4人気以下の相手</b><br>n=${hole.n}・複勝率 ${rate(hole,'top3')}・単勝回収 ${roi(hole)}</div><div style="padding:9px;border:1px solid #475569;border-radius:7px;background:#111827;color:#cbd5e1;font-size:12px"><b>7人気以下の相手</b><br>n=${deep.n}・複勝率 ${rate(deep,'top3')}・単勝回収 ${roi(deep)}</div></div><p style="margin:10px 0 0;color:#94a3b8;font-size:11px;line-height:1.6"><b style="color:#fca5a5">監査結論:</b> 人気薄にも3着内例はありますが、固定データでは単勝回収100%を下回り、現時点で「人気薄だから期待値あり」とは判定できません。人気・オッズは確定値による事後区分で、購入推奨には使いません。順位は${esc(INSIGHTS.rankingLabel)}です。</p></section>`;
  }

  global.KV_AI_INSIGHTS_SHIPPED = INSIGHTS;
  global.kvAiGetCalibratedConfidence = confidenceForPopularity;
  global.kvAiCachePrediction = cachePrediction;
  global.kvAiGetCachedPrediction = getCachedPrediction;
  global.kvAiRenderCachedPrediction = renderCachedPrediction;
  global.kvAiHydrateServerDay = hydrateServerDay;
  global.kvAiScheduleDayPrecompute = scheduleDayPrecompute;
  global.kvAiRenderOpponentAudit = renderOpponentAudit;
  global.kvAiInsightsReady = true;
})(window);
