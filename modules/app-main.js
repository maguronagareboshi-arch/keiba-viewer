// ============================================================
// 高知競馬ビューア - メインスクリプト v5 (インライン版)
// ============================================================

// ── 握り潰した例外の記録（2026-08-04 導入）──────────────────
// このコードには「握り潰す catch」が100箇所以上ある。多くは "失敗しても画面を
// 止めない" ための意図的な設計だが、2026-08-04 に「馬場ページが例外も出さずに
// 真っ白」という故障が起き、その原因が中身の空な catch の1つだったことが分かった。
// 握り潰す方針は変えない（画面を止めない方が利用者には良い）が、痕跡は必ず残す。
//
//   window.kvSwallowedReport()  … 記録の一覧をコンソールへ
//   window._kvDebug = true      … 以後は握り潰しをその場でconsole.warnする
//
// 記録は最大200件（それ以上は古いものから捨てる）。メモリを増やさないための上限。
const _KV_SWALLOW_MAX = 200;
function _kvSwallow(tag, e) {
  try {
    const log = (window._kvSwallowed = window._kvSwallowed || []);
    const msg = String((e && (e.message || e.name)) || e || '');
    // 同じ場所の同じ例外は件数だけ増やす（ループ内の catch で溢れさせない）
    const last = log.find(r => r.tag === tag && r.msg === msg);
    if (last) { last.count++; last.at = Date.now(); }
    else {
      log.push({ tag, msg, count: 1, at: Date.now(), stack: (e && e.stack) ? String(e.stack).split('\n').slice(0, 3).join(' / ') : '' });
      if (log.length > _KV_SWALLOW_MAX) log.shift();
    }
    if (window._kvDebug) console.warn('[swallow]', tag, e);
  } catch (_) { /* 記録側で落ちて本体を巻き込まないこと */ }
}
window._kvSwallow = _kvSwallow;
window.kvSwallowedReport = function () {
  const log = window._kvSwallowed || [];
  if (!log.length) { console.log('[swallow] 記録なし'); return []; }
  console.table(log.map(r => ({ 場所: r.tag, 例外: r.msg, 回数: r.count, 最後: new Date(r.at).toLocaleTimeString() })));
  return log;
};

// 初回表示では不要な大容量ライブラリを、機能を使った時だけ読み込む。
// 同時に複数箇所から要求されても同じscriptを二重追加しない。
const _kvLibPromises = Object.create(null);
const _kvLibSpecs = {
  chart: {
    src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    integrity: 'sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g',
    ready: () => !!window.Chart,
  },
  html2canvas: {
    src: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    ready: () => !!window.html2canvas,
  },
  jspdf: {
    src: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    ready: () => !!window.jspdf?.jsPDF,
  },
  adminHorse: {
    src: 'modules/admin-horse-data.js',
    ready: () => typeof window.fetchAllByNameForRace === 'function' && typeof window.storeOfficialRacesAsHorseEntries === 'function',
  },
  jraTransferShadow: {
    src: 'modules/jra-transfer-shadow.js?v=20260726-v3',
    ready: () => typeof window.KvJraTransferShadow?.scoreHorse === 'function' &&
      window.KvJraTransferShadow?.contract?.status === 'production_first_start',
  },
  aiAnalysis: {
    src: 'modules/ai-analysis.js?v=20260804-obs1',
    ready: () => typeof window.computeYosoScored === 'function' && typeof window.renderPredictionPanel === 'function' && typeof window.renderAnalysis === 'function',
  },
  aiInsights: {
    src: 'modules/ai-insights.js?v=20260804-obs1',
    ready: () => window.kvAiInsightsReady === true,
  },
  vnextPartnerScorer: {
    src: 'modules/partner-vnext-shadow.js',
    ready: () => !!window.KvVnextPartnerShadow?.scoreRace && !!window.KvVnextPartnerShadow?.buildRawFeatures,
  },
  vnextMarketBlend: {
    src: 'modules/partner-vnext-market-blend.js',
    ready: () => !!window.KvVnextMarketBlend?.scoreRace,
  },
  vnextPartnerLive: {
    src: 'modules/partner-vnext-live.js?v=20260723-partner1',
    ready: () => typeof window.kvEnsureVnextPartnerShadowRegistered === 'function' &&
      typeof window.kvComputeVnextPartnerShadow === 'function',
  },
  eraDriftShadow: {
    src: 'modules/era-drift-shadow.js?v=20260723-v2',
    ready: () => typeof window.kvCaptureEraDriftShadow === 'function' &&
      window.KvEraDriftShadow?.contract?.status === 'forward_shadow_only',
  },
  paceV2Baseline: {
    src: 'data/kochi-pace-baselines-v2.js?v=20260726-v1',
    ready: () => window.KOCHI_PACE_BASELINES_V2?.version === 2,
  },
  paceV2Shadow: {
    src: 'modules/pace-v2-shadow.js?v=20260726-v1',
    ready: () => typeof window.KvPaceV2Shadow?.computeLive === 'function' &&
      window.KvPaceV2Shadow?.contract?.status === 'forward_shadow_only',
  },
  probabilityCalibration: {
    src: 'modules/probability-calibration.js?v=20260723-v1',
    ready: () => typeof window.KvProbabilityCalibration?.calibrateScored === 'function',
  },
  valueT10Shadow: {
    src: 'modules/value-t10-shadow.js?v=20260723-purchase1',
    ready: () => typeof window.kvComputeT10ValueShadow === 'function' &&
      typeof window.kvCaptureT10ValueShadow === 'function' && typeof window.kvPersistT10DecisionLedger === 'function',
  },
  umarenDistortionShadow: {
    src: 'modules/umaren-distortion-shadow.js?v=20260730-v1',
    ready: () => typeof window.kvCaptureUmarenAxisT10 === 'function' &&
      typeof window.kvCaptureUmarenDecisionT5 === 'function' && typeof window.kvGetUmarenDistortionState === 'function',
  },
  kochiRoster: {
    src: 'data/kochi-roster-baselines.js?v=20260725',
    ready: () => !!window.KOCHI_ROSTER_BASELINES?.seasons,
  },
  // 予想AI v3（MLの再ランク・forward shadow）。⛔印は変えない。新旧の並走記録だけ。
  // 特徴の定義は ドキュメント\高知競馬ビューア改善\research\viewer-ai-v2\phase3_rebuild.py と1:1。
  // 片方だけ直すと学習と本番がズレる。差し替え時は parity_test.js で不一致0を確認すること。
  viewerAiV3Shadow: {
    src: 'modules/viewer-ai-v3-shadow.js?v=20260805-v1',
    ready: () => typeof window.kvCaptureViewerAiV3 === 'function' &&
      window.KvViewerAiV3?.contract?.status === 'forward_shadow_only',
  },
};

function _kvLoadLibrary(key) {
  const spec = _kvLibSpecs[key];
  if (!spec) return Promise.reject(new Error(`未定義のライブラリ: ${key}`));
  if (spec.ready()) return Promise.resolve();
  if (_kvLibPromises[key]) return _kvLibPromises[key];

  _kvLibPromises[key] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = spec.src;
    script.async = true;
    script.dataset.kvLib = key;
    if (spec.integrity) {
      script.integrity = spec.integrity;
      script.crossOrigin = 'anonymous';
    }
    script.onload = () => spec.ready()
      ? resolve()
      : reject(new Error(`${key} の初期化に失敗しました`));
    script.onerror = () => reject(new Error(`${key} の読み込みに失敗しました`));
    document.head.appendChild(script);
  }).catch(err => {
    delete _kvLibPromises[key];
    document.querySelector(`script[data-kv-lib="${key}"]`)?.remove();
    throw err;
  });
  return _kvLibPromises[key];
}

function ensureCaptureLibs(withPdf) {
  const jobs = [_kvLoadLibrary('html2canvas')];
  if (withPdf) jobs.push(_kvLoadLibrary('jspdf'));
  return Promise.all(jobs);
}

/** 外部データをHTMLへ描画する全画面共通のエスケープ。初期出馬表でも使うため遅延分離しない。 */
function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

/** onclick属性内の単一引用符つきJavaScript文字列用。 */
function jsAttrEsc(s) {
  return escapeHTML(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

function _ensureAiAnalysisModule() {
  return _kvLoadLibrary('jraTransferShadow').then(() => _kvLoadLibrary('aiAnalysis')).then(() => {
    if (window._kvAnalysisModuleInitialized) return;
    window._kvAnalysisModuleInitialized = true;
    try { if (typeof initAnalysisDateSelect === 'function') initAnalysisDateSelect(); } catch (e) { _kvSwallow('_ensureAiAnalysisModule', e); }
    const saveStatus = document.getElementById('save-status');
    if (saveStatus && window.MutationObserver) {
      new MutationObserver(() => {
        if (saveStatus.textContent.includes('保存しました')) {
          try { initAnalysisDateSelect(); } catch (e) { _kvSwallow('_ensureAiAnalysisModule#2', e); }
        }
      }).observe(saveStatus, { childList:true, characterData:true, subtree:true });
    }
  });
}

function _ensureAiInsightsModule() { return _kvLoadLibrary('aiInsights'); }

function _ensureVnextPartnerShadowModule() {
  return _kvLoadLibrary('vnextPartnerScorer')
    .then(() => _kvLoadLibrary('vnextMarketBlend'))
    .then(() => _kvLoadLibrary('vnextPartnerLive'))
    .then(() => _kvLoadLibrary('eraDriftShadow'))
    .then(() => _kvLoadLibrary('paceV2Baseline'))
    .then(() => _kvLoadLibrary('paceV2Shadow'))
    .then(() => {
      if (window.kvEnsureVnextPartnerShadowRegistered) window.kvEnsureVnextPartnerShadowRegistered();
      if (typeof isAdminMode === 'function' && isAdminMode() && window.KvEraDriftShadow?.hydrateServerSnapshots) {
        window.KvEraDriftShadow.hydrateServerSnapshots().catch(() => {});
      }
      // 予想AI v3（印の並びを作る）。computeYosoScored は同期なので先に準備しておく。
      // 準備前に描かれた場合は従来の並びが出て、準備完了時にキャッシュを捨てて描き直す。
      _kvLoadLibrary('viewerAiV3Shadow')
        .then(() => window.KvViewerAiV3?.prepare?.())
        .catch(e => console.warn('[viewerAiV3 preload]', e));
    });
}

function _ensureValueT10ShadowModule() { return _kvLoadLibrary('valueT10Shadow'); }
function _ensureUmarenDistortionShadowModule() { return _kvLoadLibrary('umarenDistortionShadow'); }

function _ensureRaceIntelligence() {
  const _t10 = (() => { try { return window.KV_T10_PARTNER_ROLLOUT_ENABLED === true && localStorage.getItem('kv_t10_partner_rollout_disabled_v1') !== '1'; } catch(e) { return false; } })();
  const _admin = typeof isAdminMode === 'function' && isAdminMode();
  const partnerShadow = (_admin || _t10) ? _ensureVnextPartnerShadowModule() : Promise.resolve();
  const valueShadow = _admin ? _ensureValueT10ShadowModule() : Promise.resolve();
  const umarenShadow = _admin ? _ensureUmarenDistortionShadowModule() : Promise.resolve();
  const calibration = _admin ? _kvLoadLibrary('probabilityCalibration') : Promise.resolve();
  // ◎○▲△を作る本体は全履歴＋aiAnalysisだけ。影予想・期待値・校正の一時障害で
  // 本体まで利用不能にしない。補助群は同時に開始するが、失敗は個別に隔離する。
  Promise.allSettled([partnerShadow, valueShadow, umarenShadow, calibration]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') console.warn('[optional AI module]', ['partner','value','umaren','calibration'][index], result.reason);
    });
    // Optional modules are now ready, so publish the market-free cloud inputs
    // for every prestart Kochi race.  The Worker will add official T10/T5 odds.
    if (_admin && window.kvAiScheduleDayPrecompute) window.kvAiScheduleDayPrecompute(currentDate);
  });
  return Promise.all([_ensureFullIDBCache(), _ensureAiAnalysisModule()]);
}

/** 通信・AI計算・失敗を同じスピナー文言にせず、利用者が待つ理由と次の操作を判断できる状態表示。 */
function _kvAsyncStateHtml(kind, title, detail, retryJs) {
  const isError = kind === 'error';
  const icon = isError ? 'fa-exclamation-triangle' : (kind === 'ai' ? 'fa-brain fa-pulse' : 'fa-cloud-download-alt fa-pulse');
  const retry = isError && retryJs
    ? `<button type="button" class="btn btn-primary btn-sm" onclick="${escapeHTML(retryJs)}"><i class="fas fa-redo"></i> 再試行</button>` : '';
  return `<div class="kv-async-state${isError ? ' is-error' : ''}" data-state="${escapeHTML(kind)}" role="${isError ? 'alert' : 'status'}" aria-live="${isError ? 'assertive' : 'polite'}"><i class="fas ${icon}" aria-hidden="true"></i><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(detail || '')}</small></span>${retry}</div>`;
}

function _kvSetRouteState(kind, title, detail) {
  const el = document.getElementById('kv-route-status');
  if (!el) return;
  if (!kind) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.innerHTML = _kvAsyncStateHtml(kind, title, detail, kind === 'error' ? 'location.reload()' : '');
}

/** 重要でない処理を最初の描画後へ回す（未対応ブラウザは短いタイマーで代替）。 */
function _kvScheduleIdle(task, timeout = 4000) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    try {
      const result = task();
      if (result?.catch) result.catch(e => console.warn('[idle task]', e));
    } catch (e) { console.warn('[idle task]', e); }
  };
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout });
  else setTimeout(run, Math.min(timeout, 1500));
}
const KOCHI_WORKER_ORIGIN = 'https://keiba-proxydeploy.maguronagareboshi.workers.dev';
const CORS_PROXIES = [
  (url) => `${KOCHI_WORKER_ORIGIN}/?url=${encodeURIComponent(url)}`,
];

function normalizeOfficialPrize(value) {
  const match = String(value ?? '').replace(/,/g,'').match(/\d+(?:\.\d+)?/);
  if(!match) return '';
  const amount = Number(match[0]);
  return String(amount >= 10000 ? Math.round(amount / 1000) / 10 : amount);
}

function isOfficialHistoryCacheValid(races) {
  return Array.isArray(races)&&races.length>0&&races.every(r=>(!r.time||/^\d+:\d{2}\.\d$/.test(String(r.time)))&&(!r.prize||/^\d+(?:\.\d+)?$/.test(String(r.prize))))&&races.some(r=>/^\d+:\d{2}\.\d$/.test(String(r.time||'')));
}

// 公式成績は追走のたびに増えるため、「形式が正常」だけでは最新性を保証できない。
// 当日付近の開催は半日ごとに再検証し、端末側にキャッシュより新しい既知レースが
// ある場合は時刻に関係なく再取得する。
const OFFICIAL_HISTORY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function _officialHistoryDateMs(value) {
  if(value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : NaN;
  const parsed=parseDateStr(String(value||''));
  return parsed&&Number.isFinite(parsed.getTime()) ? parsed.getTime() : NaN;
}

function getOfficialHistoryCacheState(cached, refDate, knownRaces, nowDate) {
  const races=Array.isArray(cached?.races)?cached.races:[];
  if(!cached||cached.type!=='official'||!isOfficialHistoryCacheValid(races)){
    return {usable:false,shouldRefresh:true,reason:'invalid'};
  }

  const cutoffMs=_officialHistoryDateMs(refDate);
  const latestBeforeCutoff=list=>(Array.isArray(list)?list:[]).reduce((latest,r)=>{
    const ms=_officialHistoryDateMs(r?.raceDate);
    if(!Number.isFinite(ms)||(Number.isFinite(cutoffMs)&&ms>=cutoffMs)) return latest;
    return Number.isFinite(latest)?Math.max(latest,ms):ms;
  },NaN);
  const cachedLatestMs=latestBeforeCutoff(races);
  const knownLatestMs=latestBeforeCutoff(knownRaces);

  // 保存済みの通常レース履歴が公式キャッシュより新しければ、今回のイカホのように
  // 最新賞金が欠けていることが確定するため、即時更新する。
  if(Number.isFinite(knownLatestMs)&&(!Number.isFinite(cachedLatestMs)||knownLatestMs>cachedLatestMs)){
    return {usable:true,shouldRefresh:true,reason:'newer_known_race',cachedLatestMs,knownLatestMs};
  }

  const nowInstant=nowDate instanceof Date&&Number.isFinite(nowDate.getTime())?nowDate.getTime():Date.now();
  const now=new Date(nowInstant);
  now.setHours(0,0,0,0);
  const liveFloor=new Date(now); liveFloor.setDate(liveFloor.getDate()-1);
  const nearLive=!Number.isFinite(cutoffMs)||cutoffMs>=liveFloor.getTime();
  if(nearLive){
    const savedMs=Date.parse(String(cached.savedAt||''));
    const age=Number.isFinite(savedMs)?nowInstant-savedMs:Infinity;
    if(!Number.isFinite(savedMs)||age>OFFICIAL_HISTORY_CACHE_MAX_AGE_MS){
      return {usable:true,shouldRefresh:true,reason:'expired',cachedLatestMs,knownLatestMs};
    }
  }
  return {usable:true,shouldRefresh:false,reason:'fresh',cachedLatestMs,knownLatestMs};
}

async function fetchOfficialHorseHistory(code, horseName, timeout = 15000) {
  const lineage = String(code || '').trim();
  if(!/^\d{8,14}$/.test(lineage)) throw new Error('invalid lineage');
  const url = `${KOCHI_WORKER_ORIGIN}/horse-history?lineage=${encodeURIComponent(lineage)}&horse=${encodeURIComponent(horseName || '')}`;
  const res = await fetch(url, {signal:AbortSignal.timeout(timeout), cache:'no-store'});
  if(!res.ok) throw new Error(`official history HTTP ${res.status}`);
  const payload = await res.json();
  if(!Array.isArray(payload.races) || !payload.races.length) throw new Error('official history empty');
  return {
    races:payload.races.map(r=>({...r,
      raceClass:detectRaceClass(r.raceClassRaw||r.raceClass||r.raceName)||r.raceClass||'',
      prize:normalizeOfficialPrize(r.prize)
    })),
    basicInfo:payload.basic_info||{},
    fetchedAt:payload.fetched_at||new Date().toISOString()
  };
}

async function getKochiOfficialBaseline(code, refDate) {
  await _kvLoadLibrary('kochiRoster');
  const d=refDate?new Date(refDate):new Date();
  const anchors=window.KOCHI_ROSTER_BASELINES?.seasons?.[getKochiFiscalYear(d)]?.anchors||[];
  const anchor=[...anchors].reverse().find(a=>parseDateStr(a.effectiveFrom)<=d);
  const prize=Number(anchor?.horses?.[String(code||'')]);
  return Number.isFinite(prize) ? {prize,asOf:anchor.asOf,effectiveFrom:anchor.effectiveFrom,source:anchor.source} : null;
}

// セッション内プロキシ死活管理
const _proxyHealth = CORS_PROXIES.map(() => ({ blockedUntil: 0 }));
const _raceListPreferredPage = new Map();

function _availableProxies() {
  const now = Date.now();
  const avail = CORS_PROXIES.filter((_, i) => now > _proxyHealth[i].blockedUntil);
  if (avail.length > 0) return avail;
  _proxyHealth.forEach(h => { h.blockedUntil = 0; });
  return CORS_PROXIES;
}

function _blockProxy(makeProxy, ms = 90000) {
  const idx = CORS_PROXIES.indexOf(makeProxy);
  if (idx >= 0) _proxyHealth[idx].blockedUntil = Date.now() + ms;
}

// 公式サイトへの取得は自前Workerだけを使う。第三者の無料CORSプロキシへ
// 閲覧レースや日付を送らず、障害時は明示的に失敗させて再試行できるようにする。
async function fetchHtmlWithProxy(url, timeout = 12000, options) {
  const firstPartyOnly = !!(options && options.firstPartyOnly);
  const RATE_LIMIT_RE = /Too Many Requests|Rate Limit|Access Denied|403 Forbidden/i;
  const candidates = firstPartyOnly ? [CORS_PROXIES[0]] : _availableProxies();
  const tryBatch = async batch => {
    const controllers = batch.map(() => new AbortController());
    const timers = controllers.map(c => setTimeout(() => c.abort(), timeout));
    try {
      const html = await Promise.any(batch.map(async (makeProxy, i) => {
        const res = await fetch(makeProxy(url), { signal:controllers[i].signal, cache:'no-store' });
        if ([429,502,503].includes(res.status)) { _blockProxy(makeProxy, 90000); throw new Error(`rate_limited:${res.status}`); }
        if (!res.ok) throw new Error(`HTTP:${res.status}`);
        const body = await res.text();
        if (!body || body.length < 200) throw new Error('empty');
        if (RATE_LIMIT_RE.test(body)) { _blockProxy(makeProxy, 90000); throw new Error('content_blocked'); }
        return body;
      }));
      controllers.forEach(c => c.abort());
      return html;
    } finally {
      timers.forEach(clearTimeout);
      controllers.forEach(c => c.abort());
    }
  };
  let lastError = null;
  for (let i = 0; i < candidates.length; i += 2) {
    try { return await tryBatch(candidates.slice(i, i + 2)); }
    catch (e) { lastError = e; if (firstPartyOnly) break; }
  }
  throw lastError || new Error('利用できる取得経路がありません');
}

let allRacesData = {};
let currentRaceNo = null;
let currentDate = '';
let currentBaba = '31';
let _commentVisible = true; // レース後コメントの表示フラグ（チェックボックスで制御）
let _kvLastViewTab = 'deban'; // レースを開いた直後は出馬表を表示。以後は直近の選択をレース間で維持する。

// 馬体重の差分を +/- 表記にフォーマット（例: "475(9)" → "475(+9)"）
function fmtWeightDiff(w) {
  if (!w) return '—';
  return String(w).replace(/\((\d+)\)/, '(+$1)');
}

// ── ページ内ナビゲーション履歴管理 ─────────────────────────
// ブラウザの戻るボタンでアプリが終了せず、1つ前の操作（ページ/モーダル）に戻る。
let _currentPage = 'search';
let _navReady = false;

/** 描画に失敗したページの先頭へ「表示できませんでした・再試行」を出す。
 *  【2026-08-04】ここは以前 try{}catch{} で握り潰しており、renderTrackTrend が
 *  ReferenceError を投げると馬場ページが「エラーも出ないまま真っ白」になっていた。
 *  握り潰す方針自体は変えない（他ページは動かしたい）が、失敗した画面には必ず理由を出す。 */
function _kvShowPageError(pageId) {
  const host = document.getElementById('page-' + pageId);
  if (!host) return;
  let el = document.getElementById('kv-page-error-' + pageId);
  if (!el) {
    el = document.createElement('div');
    el.id = 'kv-page-error-' + pageId;
    el.style.marginBottom = '12px';
    host.insertBefore(el, host.firstChild);
  }
  el.innerHTML = _kvAsyncStateHtml('error', 'この画面を表示できませんでした',
    '一時的な不具合の可能性があります。再試行しても直らないときはページを再読み込みしてください。',
    `switchPage('${pageId}')`);
}
function _kvClearPageError(pageId) {
  const el = document.getElementById('kv-page-error-' + pageId);
  if (el) el.remove();
}

/** 計測管理ページ（管理者専用）に、内部で伏せた不具合の一覧を出す。 */
function renderSwallowLog() {
  const el = document.getElementById('kv-swallow-log');
  if (!el) return;
  const log = (window._kvSwallowed || []).slice().sort((a, b) => b.at - a.at);
  if (!log.length) {
    el.innerHTML = '<p class="no-data">記録なし（この起動では何も起きていません）</p>';
    return;
  }
  el.innerHTML = `<div class="table-wrapper"><table class="deban-table" style="font-size:12px">
    <thead><tr><th style="text-align:left">場所</th><th style="text-align:left">内容</th><th style="text-align:right">回数</th><th style="text-align:right">最後</th></tr></thead>
    <tbody>${log.map(r => `<tr>
      <td style="white-space:nowrap">${escapeHTML(r.tag)}</td>
      <td style="color:#dc2626">${escapeHTML(r.msg)}</td>
      <td style="text-align:right">${Number(r.count) || 1}</td>
      <td style="text-align:right;color:#94a3b8;white-space:nowrap">${escapeHTML(new Date(r.at).toLocaleTimeString('ja-JP'))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
window.renderSwallowLog = renderSwallowLog;

function _renderPageWithHistory(pageId, renderFn, needsAiModule) {
  const run = () => {
    if (_currentPage !== pageId) return;
    try { renderFn(); _kvClearPageError(pageId); }
    catch (e) { _kvSwallow('renderPage:' + pageId, e); _kvShowPageError(pageId); }
  };
  const moduleReady = !needsAiModule || typeof window.computeYosoScored === 'function';
  if (_idbFullReady && moduleReady) { setTimeout(run, 0); return; }
  const st = document.getElementById('save-status');
  if (st) st.textContent = '⏳ AI・分析用の過去データを準備中…';
  setTimeout(() => {
    const prepare = needsAiModule ? _ensureRaceIntelligence() : _ensureFullIDBCache();
    prepare.then(() => {
      if (st && st.textContent.includes('過去データを準備中')) st.textContent = '';
      run();
    }).catch(() => {
      if (st) st.textContent = '⚠ 過去データを準備できませんでした';
    });
  }, 0);
}

const KV_PAGE_IDS = ['search','deban','bunseki','baba','jchg','saved','f3avg','bets','aiseiseki','keisoku'];
function switchPage(pageId, _fromPop) {
  // 廃止したページ（旧PSF履歴など）の古いブックマークで真っ白にしない
  if (!KV_PAGE_IDS.includes(pageId)) pageId = 'search';
  // 閲覧者は管理者専用ページ（保存データ・収支ノート・計測管理）へは入れない
  if (typeof isAdminMode === 'function' && !isAdminMode() && ['saved', 'bets', 'keisoku'].includes(pageId)) pageId = 'search';
  KV_PAGE_IDS.forEach(id => {
    const el = document.getElementById('page-' + id);
    if (el) el.classList.toggle('page-hidden', id !== pageId);
  });
  document.querySelectorAll('.header-nav-btn, .kbn-btn').forEach(btn => {
    const active = btn.dataset.page === pageId;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current');
  });
  // 「その他」配下のページでは上下ナビの⋯をアクティブに
  const _morePages = ['jchg', 'saved', 'f3avg', 'bets', 'aiseiseki', 'keisoku'];
  const _headerMoreBtn = document.getElementById('header-more-btn');
  if (_headerMoreBtn) _headerMoreBtn.classList.toggle('active', _morePages.includes(pageId));
  const _moreBtn = document.getElementById('kbn-more');
  if (_moreBtn) _moreBtn.classList.toggle('active', _morePages.includes(pageId));
  if (typeof toggleKbnMore === 'function') toggleKbnMore(false);
  document.querySelectorAll('.header-more[open]').forEach(el => el.removeAttribute('open'));
  window.scrollTo(0, 0);
  _currentPage = pageId;
  // 履歴へ積む（戻るボタン由来の呼び出し時は積まない＝二重化防止）。
  // 出馬表ページではURLハッシュに日付/レース番号を反映し、他ページではハッシュを消す。
  if (_navReady && !_fromPop && !_kvNavFromPop) {
    try {
      const _onDeban = pageId === 'deban' && typeof currentDate !== 'undefined' && currentDate && currentBaba === '31' && currentRaceNo;
      history.pushState(
        { kvPage: pageId, kvDate: (typeof currentDate !== 'undefined' && currentDate) || null, kvRace: (typeof currentRaceNo !== 'undefined' && currentRaceNo) || null },
        '',
        _onDeban ? _kvHashFor(currentDate, currentRaceNo) : (location.pathname + location.search)
      );
    } catch(e) { _kvSwallow('switchPage', e); }
  }
  // 分析ページに切り替えたとき自動レンダリング
  if (pageId === 'bunseki') { _renderPageWithHistory(pageId, () => renderAnalysis(), true); }
  if (pageId === 'jchg')    { _renderPageWithHistory(pageId, renderJockeyChangeAnalysis); }
  if (pageId === 'deban')   { setTimeout(() => { try { (Object.keys(allRacesData).length ? showDebanRaceView : showDebanDateList)(); } catch(e){ _kvSwallow('switchPage#2', e); } }, 0); }
  if (pageId === 'baba')    { _renderPageWithHistory(pageId, renderTrackTrend); }
  if (pageId === 'saved')   {
    setTimeout(() => { try { renderSavedList(); } catch(e){ _kvSwallow('switchPage#3', e); } }, 0);
    _renderPageWithHistory(pageId, refreshOpponentShadowCollectionStatus);
    _ensureValueT10ShadowModule().then(() => kvRefreshT10LedgerMonitor(true)).catch(()=>{});
  }
  if (pageId === 'f3avg')   { _renderPageWithHistory(pageId, renderF3Averages); }
  // 計測管理（管理者専用・modules/keisoku-admin.js が window.ksOpen を定義する）
  if (pageId === 'keisoku') { setTimeout(() => { try { if (typeof ksOpen === 'function') ksOpen(); } catch(e){ _kvSwallow('switchPage:keisoku', e); } renderSwallowLog(); }, 0); }
  if (pageId === 'aiseiseki') {
    setTimeout(() => _ensureAiInsightsModule().then(() => {
      if (_currentPage === pageId) renderAiSeisekiPage();
    }).catch(() => {
      const el = document.getElementById('aiseiseki-body');
      if (el) el.innerHTML = _kvAsyncStateHtml('error','AI成績の表示に失敗しました','監査データを読み込めませんでした',"switchPage('aiseiseki')");
    }), 0);
  }
  if (pageId === 'bets')    { _renderPageWithHistory(pageId, renderBetsPage); }
}

// ══ URLハッシュルーティング（最小版・2026-07-11導入）══
// 形式: #d/2026-07-11/9（開催日＋レース番号・高知固定）。
// 書き込みは「出馬表ページでレースを開いている時」だけ。他ページではハッシュを消す。
// 管理者モード等の状態は絶対にURLへ載せない（共有リンクから管理UIを推測されないため）。
function _kvHashFor(date, raceNo) {
  if (!date) return location.pathname + location.search;
  return '#d/' + String(date).replace(/\//g, '-') + (raceNo ? '/' + raceNo : '');
}
function _kvParseHash() {
  const m = (location.hash || '').match(/^#d\/(\d{4})-(\d{2})-(\d{2})(?:\/(\d{1,2}))?$/);
  if (!m) return null;
  const raceNo = m[4] ? parseInt(m[4]) : null;
  if (raceNo != null && (raceNo < 1 || raceNo > 12)) return null;
  return { date: `${m[1]}/${m[2]}/${m[3]}`, raceNo };
}
let _kvNavFromPop = false; // popstate起因のページ遷移では履歴へ積まない（restoreFromSaved経由のswitchPage対策）

// ══ 閲覧者の公開範囲（2026-07-11導入・段階公開／2026-07-15に先週分まで／2026-07-29に1か月へ拡大）══
// 閲覧者に見せる出馬表は「今日から数えて過去 _KV_VIEWER_PAST_DAYS 日以内の開催日」のみ。
// 管理者（書き込みトークン保有端末）は全期間閲覧できる。
// 対象＝出馬表（開催日一覧・レース表示・検索取得・ディープリンク）。
// 分析・馬場傾向などの集計ページは個別レースの出馬表ではないため対象外。
// ⛔曜日アンカー（旧: 先週の月曜0時）はやめた。曜日で窓の長さが8〜14日に伸縮して分かりにくいため。
// ⛔`setMonth(-1)` の暦月引き算は使わない。3/31 → 3/3 のように**1か月より短くなる日がある**。
//   日数固定なら常に31日ぶん見える。範囲を変えるときはこの定数1つだけを動かす。
const _KV_VIEWER_PAST_DAYS = 31;
function _kvViewerDateAllowed(date) {
  try {
    if (typeof isAdminMode === 'function' && isAdminMode()) return true;
    if (!date) return false;
    const d = new Date(String(date).replace(/\//g, '-') + 'T00:00:00');
    if (isNaN(d)) return false;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - _KV_VIEWER_PAST_DAYS);
    return d >= from;
  } catch (e) { return false; }
}
const _KV_PAST_HIDDEN_MSG = '過去の出馬表は現在公開していません（直近1か月の開催のみ閲覧できます）';

// ブラウザ戻る/進むの処理
function _initNavHistory() {
  if (_navReady) return;
  try { history.replaceState({ kvPage: _currentPage }, ''); } catch(e) { _kvSwallow('_initNavHistory', e); }
  _navReady = true;
  window.addEventListener('popstate', async (e) => {
    // ① モーダルが開いていれば、まず閉じる（履歴位置は補填してアプリ内に留まる）
    const modal = document.getElementById('horse-modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeHorseModal();
      try { history.pushState({ kvPage: _currentPage }, ''); } catch(err) { _kvSwallow('_initNavHistory#2', err); }
      return;
    }
    _kvNavFromPop = true;
    try {
      // ② state無し（手入力のハッシュ変更等）→ ハッシュから直接復元を試みる
      if (!e.state) {
        const dl = _kvParseHash();
        if (dl && _kvViewerDateAllowed(dl.date)) {
          try {
            await restoreFromSaved(dl.date, '31', true);
            if (dl.raceNo && allRacesData[dl.raceNo]) switchRaceTab(dl.raceNo);
            switchPage('deban', true);
          } catch(err) { _kvSwallow('_initNavHistory#3', err); }
          return;
        }
      }
      // ③ ページ状態を復元（戻る＝1つ前のページへ。日付・レースも状態にあれば戻す）
      const st = e.state || {};
      try {
        if (st.kvDate && st.kvDate !== currentDate) {
          await restoreFromSaved(st.kvDate, '31', true);
          if (st.kvRace && allRacesData[st.kvRace]) switchRaceTab(st.kvRace);
        } else if (st.kvRace && st.kvRace !== currentRaceNo && allRacesData[st.kvRace]) {
          switchRaceTab(st.kvRace);
        }
      } catch(err) { _kvSwallow('_initNavHistory#4', err); }
      switchPage(st.kvPage || 'search', true);
    } finally { _kvNavFromPop = false; }
  });
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
  _updateDarkModeBtn(isDark);
}

/** スマホ下部ナビの「その他」メニュー開閉（開いた時は外側タップで閉じる） */
function toggleKbnMore(force) {
  const m = document.getElementById('kbn-more-menu');
  if (!m) return;
  const willShow = force != null ? force : m.classList.contains('hidden');
  m.classList.toggle('hidden', !willShow);
  if (willShow) {
    setTimeout(() => {
      const h = e => {
        if (!m.contains(e.target) && !e.target.closest('#kbn-more')) {
          m.classList.add('hidden');
          document.removeEventListener('click', h);
        }
      };
      document.addEventListener('click', h);
    }, 0);
  }
}

// ===== 【一時】前半3F出力ボタン（デバッグ用・すぐ削除可・ボタン本体はheaderのtemp-f3-out-btn） =====
function tempOutputFirst3F() {
  const rows = [];
  for (const raceNo of Object.keys(allRacesData).map(Number).sort((a, b) => a - b)) {
    const data = allRacesData[raceNo];
    if (!data || !data.horses) continue;
    for (const h of data.horses) {
      rows.push({ raceNo, umaBan: h.umaBan, horseName: h.horseName || '', first3f: h.first3f || '' });
    }
  }
  if (!rows.length) { alert('表示中のレースデータがありません'); return; }
  console.table(rows);
  const tsv = 'レース\t馬番\t馬名\t前半3F\n' + rows.map(r => `${r.raceNo}\t${r.umaBan}\t${r.horseName}\t${r.first3f}`).join('\n');
  if (navigator.clipboard) navigator.clipboard.writeText(tsv).catch(() => {});
  alert(`前半3Fを${rows.length}件出力しました（コンソール表示＋クリップボードにコピー済み）`);
}
// ===== 【一時】ここまで =====

// ===== 3F一括取込: 計測アプリのTSV/CSVを貼り付けて各馬のfirst3fへ反映(保存ボタンで確定) =====
function import3FBulk() {
  if (document.getElementById('f3imp-overlay')) return;
  const ov = document.createElement('div');
  ov.className = 'save-modal-overlay';
  ov.id = 'f3imp-overlay';
  ov.innerHTML = `<div class="f3imp-modal">
    <h3>📥 前半3F 一括取込</h3>
    <textarea id="f3imp-text" placeholder="レース\t馬番\t馬名\t前半3F\n1\t7\t(馬名省略可)\t38.9\n1\t9\t\t39.1\n…\n※タブ・カンマ区切りどちらも可。ヘッダ行や空の値は自動スキップ"></textarea>
    <div class="f3imp-note">計測アプリの出力(kochi_3f_tsv_日付.txt)や「前半3F出力」形式をそのまま貼り付けできます。表示中の日付分がデプロイ済みなら「自動取得」で貼り付け作業を省略できます。<br>末尾に向正面ラベル列(最内/内/外2/外3/大外)がある新形式なら<b>向正面(内外)も同時反映</b>されます(自動推定のため<b>手入力済みの欄は上書きしません</b>)。<br>反映後、<b>保存ボタンを押すまで確定されません</b>。既に手入力済みの値は上書きされます(空の値では上書きしません)。</div>
    <div class="f3imp-btns">
      <button onclick="document.getElementById('f3imp-overlay').remove()">キャンセル</button>
      <button onclick="fetchAndImport3FFromDeploy()" title="サイトに同梱された当日分のTSVを取得してここに貼り付けます">📥 自動取得</button>
      <button class="pri" onclick="applyImport3F()">反映する</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.getElementById('f3imp-text').focus();
}
// 計測TSVは高知プロジェクトのdata/3f/からサイトと一緒に配信する。
// 表示中のレース日(currentDate、'YYYY/MM/DD')に対応するファイルを同一オリジンから取得するだけ。
async function fetchAndImport3FFromDeploy() {
  if (!isAdminMode()) { alert('この機能は管理者のみ利用できます。'); return; }
  if (typeof currentDate === 'undefined' || !currentDate) { alert('レースを開いてから実行してください'); return; }
  const dateStr = currentDate.replace(/\//g, '');
  const url = `data/3f/kochi_3f_tsv_${dateStr}.txt`;
  let res;
  try { res = await fetch(url); }
  catch (e) { alert('取得に失敗しました: ' + e.message); return; }
  if (!res.ok) { alert(`この日のTSVはまだサイトに同梱されていません（${url}）。\n計測アプリの出力を貼り付けるか、keiba-deployへ配置してデプロイしてください。`); return; }
  const txt = await res.text();
  const ta = document.getElementById('f3imp-text');
  if (ta) ta.value = txt;
}
function applyImport3F() {
  const txt = (document.getElementById('f3imp-text')?.value || '').trim();
  if (!txt) { alert('テキストが空です'); return; }
  const MUKAE_LABELS = ['最内', '内', '外2', '外3', '大外'];
  let applied = 0, appliedPos = 0, noRace = new Set(), noHorse = 0, skipped = 0;
  let guarded = 0;                  // 既に値があるところへ推定を書こうとして止めた数
  const changes = [];               // 既存の値を書き換える行(確認ダイアログに出す)
  const rows = [];                  // 実際に反映する行を貯めてから、確認後にまとめて書く
  for (const line of txt.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || /レース|馬番|race/i.test(s)) continue;   // ヘッダ行
    const cols = s.split(/\t|,/).map(c => c.trim());
    if (cols.length < 2) { skipped++; continue; }
    const raceNo = parseInt(cols[0]), umaBan = parseInt(cols[1]);
    // 3F=馬番より後ろの「最後の数値列」(3〜5列形式対応)。向正面ラベル列(最内/内/外2/外3/大外)が
    // あれば内外も反映(計測アプリのポジション自動出力対応・2026-07-15拡張)
    // 出自列(推定/実測/実測(旧)/実測(融合N頭))があれば拾う(2026-07-26追加・下の保護に使う)
    let val = NaN, mukae = '', src = '';
    for (let ci = 2; ci < cols.length; ci++) {
      const f = parseFloat(cols[ci]);
      if (isFinite(f) && f >= 25 && f <= 60) { val = f; continue; }
      if (MUKAE_LABELS.includes(cols[ci])) { mukae = cols[ci]; continue; }
      if (/^(推定|実測)/.test(cols[ci])) src = cols[ci];
    }
    if (!raceNo || !umaBan || (!isFinite(val) && !mukae)) { skipped++; continue; }
    const data = allRacesData[raceNo];
    if (!data || !data.horses) { noRace.add(raceNo); continue; }
    const horse = data.horses.find(h => parseInt(h.umaBan) === umaBan);
    if (!horse) { noHorse++; continue; }
    if (isFinite(val)) {
      const v = (Math.round(val * 10) / 10).toFixed(1);
      const cur = String(horse.first3f || '').trim();
      // ⛔既に入っている値を「推定」で潰さない(2026-07-26追加)。
      //   推定は映像を一切使っていない値なので、手入力にも実測にも劣る。空欄だけ埋める。
      //   実測系(実測/実測(旧)/実測(融合N頭))は書く——ただし値が変わる場合は下で確認を取る。
      if (cur && src.startsWith('推定')) { guarded++; continue; }
      if (cur && cur !== v) changes.push(`R${raceNo} ${umaBan}番 ${cur} → ${v}${src ? '（' + src + '）' : ''}`);
      rows.push({ raceNo, umaBan, horse, v });
    }
    if (mukae && !horse.mukaeShoumen) {
      // 自動ラベルは±1ビン82%精度の推定値のため、手入力済みの値は上書きしない(空欄のみ埋める)
      horse.mukaeShoumen = mukae;
      const sel = document.querySelector(`select.pos-select[onchange="onHorsePosChange(this,${raceNo},${umaBan},'mukaeShoumen')"]`);
      if (sel) {
        sel.value = mukae;
        const vw = sel.closest('td')?.querySelector('.vw-val');
        if (vw) vw.textContent = mukae;
      }
      appliedPos++;
    }
  }
  // ⛔既存の値を書き換えるときは、黙って上書きせず件数と中身を見せて確認を取る。
  if (changes.length) {
    const head = changes.slice(0, 12).join('\n');
    const more = changes.length > 12 ? `\n…ほか ${changes.length - 12} 頭` : '';
    if (!confirm(`既に値が入っている ${changes.length} 頭を書き換えます。よろしいですか？\n\n${head}${more}`)) {
      alert('取込を中止しました。何も変更していません。');
      return;
    }
  }
  for (const r of rows) {
    {
      const { raceNo, umaBan, horse, v } = r;
      horse.first3f = v;
      const inp = document.querySelector(`input.threef-input[oninput="onHorse3FInput(this,${raceNo},${umaBan})"]`);
      if (inp) {
        inp.value = v;
        const vw = inp.closest('td')?.querySelector('.vw-val');
        if (vw) vw.textContent = v + '秒';
      }
      applied++;
    }
  }
  document.getElementById('f3imp-overlay')?.remove();
  let msg = `前半3Fを ${applied}件 反映しました。\n※「保存」ボタンを押すと確定されます。`;
  if (guarded) msg += `\n既に値が入っていたので推定で上書きしなかった: ${guarded}件`;
  if (appliedPos) msg += `\n向正面(内外)も ${appliedPos}件 反映しました。`;
  if (noRace.size) msg += `\n未読込のレース(スキップ): R${[...noRace].join(', R')} — 対象日の出馬表を読み込んでから取込してください`;
  if (noHorse) msg += `\n馬番不一致スキップ: ${noHorse}件`;
  if (skipped) msg += `\n書式スキップ: ${skipped}行`;
  alert(msg);
}
// ===== 3F一括取込 ここまで =====

// スマホ表示プレビュー：?sim=1 付きの自アプリを390px幅iframeで開く。
// iframe内ではメディアクエリが実際のスマホ幅で発火するため、CSSを複製せず正確に確認できる。
const KV_IS_SIM = new URLSearchParams(location.search).has('sim');
function toggleSimMode() {
  const existing = document.getElementById('kv-sim-overlay');
  if (existing) { existing.remove(); return; }
  // 現在のページ（と出馬表なら読み込み中のレース日・レース番号）をプレビューへ引き継ぐ。
  // これがないと毎回トップの「検索」に戻ってしまうため。
  const params = new URLSearchParams({ sim: '1' });
  const page = (typeof _currentPage === 'string') ? _currentPage : 'search';
  params.set('page', page);
  if (page === 'deban' && typeof allRacesData === 'object') {
    const anyRace = Object.values(allRacesData).find(d => d && d.raceInfo && d.raceInfo.raceDate);
    if (anyRace) {
      params.set('date', anyRace.raceInfo.raceDate);
      params.set('baba', (typeof currentBaba === 'string' ? currentBaba : '31'));
      if (currentRaceNo != null) params.set('r', currentRaceNo);
    }
  } else if (page === 'bunseki') {
    const d = document.getElementById('ana-date-select')?.value;
    if (d) params.set('anadate', d);
  }
  const ov = document.createElement('div');
  ov.id = 'kv-sim-overlay';
  ov.innerHTML = `
    <div class="kv-sim-frame">
      <div class="kv-sim-topbar">
        <span>📱 スマホ表示プレビュー（390px幅）</span>
        <button type="button" class="kv-sim-close" onclick="toggleSimMode()">✕ 閉じる</button>
      </div>
      <iframe class="kv-sim-iframe" src="${location.pathname}?${params.toString()}"></iframe>
    </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) toggleSimMode(); });
  document.body.appendChild(ov);
}

// ── アクセスカウンター（1端末1日1カウント・表示は管理者のみ）─────────────
function _acDayKey(d) { d = d || new Date(); return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
/** 訪問を1回だけ加算（同一端末は1日1回）。集計はSupabaseの bump_stat 関数（匿名でも+1だけ可）。 */
async function _bumpAccessCounter() {
  if (typeof KV_IS_SIM !== 'undefined' && KV_IS_SIM) return;   // プレビューiframeでは数えない
  const dk = _acDayKey();
  if (!localStorage.getItem('kv_visit_' + dk)) {
    localStorage.setItem('kv_visit_' + dk, '1');
    const bump = k => fetch(SUPABASE_URL + '/rest/v1/rpc/bump_stat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ k })
    }).catch(() => {});
    try { await Promise.all([bump('total'), bump('d_' + dk)]); } catch (e) { _kvSwallow('_bumpAccessCounter', e); }
  }
  _renderAccessCounter();
}
/** カウンター表示を更新（管理者のみ・累計/今日/昨日）。 */
async function _renderAccessCounter() {
  const card = document.getElementById('access-counter-card');
  if (!card || !isAdminMode()) return;
  const dk = _acDayKey(), yk = _acDayKey(new Date(Date.now() - 86400000));
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_stats?select=key,n&key=in.(total,d_${dk},d_${yk})`, { headers: SUPABASE_HEADERS });
    const rows = await res.json();
    const map = {}; (Array.isArray(rows) ? rows : []).forEach(r => { map[r.key] = r.n; });
    const set = (id, v) => { const el = document.getElementById(id); if (el) _animateNum(el, Number(v) || 0); };
    set('ac-total', map['total']); set('ac-today', map['d_' + dk]); set('ac-yesterday', map['d_' + yk]);
  } catch (e) { console.warn('[access-counter]', e); }
}

/** 数字をカウントアップ（0→to・イージング）。fmtで整形（既定は千区切り整数）。 */
function _animateNum(el, to, dur, fmt) {
  if (!el) return; dur = dur || 850; fmt = fmt || (v => Math.round(v).toLocaleString('en-US'));
  if (typeof to !== 'number' || !isFinite(to)) { el.textContent = fmt(0); return; }
  el.textContent = fmt(to); // フォールバック：rAFが動かなくても最終値は必ず表示（カウントアップは装飾）
  if (typeof requestAnimationFrame !== 'function') return;
  const t0 = performance.now();
  const step = now => { const p = Math.min((now - t0) / dur, 1); const e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(to * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ── レース展開リプレイ（コーナー通過順アニメ）─────────────────────────
const _WAKU_BG = { 1: '#ffffff', 2: '#1a1a1a', 3: '#e02020', 4: '#1a6fd0', 5: '#f2c200', 6: '#18a020', 7: '#f26a00', 8: '#f06fa8' };
const _WAKU_FG = { 1: '#222', 2: '#fff', 3: '#fff', 4: '#fff', 5: '#333', 6: '#fff', 7: '#fff', 8: '#333' };
function _rpWaku(h) { const w = parseInt(h.wakuBan); if (!isNaN(w) && w >= 1 && w <= 8) return w; const u = parseInt(h.umaBan) || 1; return Math.min(8, Math.ceil(u / 2)); }

function openRaceReplay(raceNo) {
  const data = allRacesData[raceNo]; if (!data) return;
  const horses = data.horses || [];
  const runners = [];
  horses.forEach(h => {
    const chaku = parseInt(h.chakujun);
    const segs = String(h.corner || '').split(/[-‐]/).map(x => parseInt(x)).filter(x => !isNaN(x) && x > 0);
    if (!segs.length && isNaN(chaku)) return;
    runners.push({ uma: parseInt(h.umaBan), waku: _rpWaku(h), name: h.horseName || '', segs, chaku: isNaN(chaku) ? null : chaku });
  });
  if (runners.length < 2) { alert('このレースは展開データ（コーナー通過順）がありません。'); return; }
  const segLen = {}; runners.forEach(r => { if (r.segs.length) segLen[r.segs.length] = (segLen[r.segs.length] || 0) + 1; });
  const segN = parseInt(Object.keys(segLen).sort((a, b) => segLen[b] - segLen[a])[0]) || 4;
  const N = runners.length;
  runners.forEach(r => {
    const s = r.segs.slice(0, segN);
    while (s.length < segN) s.push(s.length ? s[s.length - 1] : N);
    const goal = (r.chaku != null) ? r.chaku : s[s.length - 1];
    r.ranks = s.concat([goal]);
    for (let i = 0; i < r.ranks.length; i++) { let v = r.ranks[i]; if (isNaN(v) || v < 1) v = (i > 0 ? r.ranks[i - 1] : N); r.ranks[i] = Math.min(Math.max(v, 1), Math.max(N, 12)); }
  });
  runners.sort((a, b) => (a.chaku || 99) - (b.chaku || 99));
  window._rp = { raceNo, runners, N, nStages: segN + 1, segN, progress: 0, playing: false, speed: 1, raf: null, last: 0, duration: 5200,
    cornerGroups: (data.raceInfo && data.raceInfo.cornerGroups) || null };
  _rpBuildSvg(); _rpBuildLegend();
  document.getElementById('rp-title').textContent = (data.raceInfo.raceName || ('第' + raceNo + 'レース')) + ' 展開リプレイ';
  document.getElementById('race-replay-modal').classList.remove('hidden');
  document.querySelectorAll('.rp-spd').forEach(b => b.classList.toggle('active', b.dataset.s === '1'));
  rpRestart();
  setTimeout(rpTogglePlay, 350);
  // 実測タイムライン（あれば）で精度を底上げ。無ければ従来のコーナー通過順表示のまま。
  if (data.raceInfo && data.raceInfo.raceDate) _rpTryUpgradeToTimed(raceNo, data.raceInfo.raceDate);
}
function _rpBuildSvg() {
  const st = window._rp, svg = document.getElementById('rp-svg');
  const rowH = 24, topPad = 30, botPad = 10, W = 680;
  const H = topPad + st.N * rowH + botPad, x0 = 52, x1 = W - 22;
  st.dims = { rowH, topPad, W, H, x0, x1 };
  const sx = i => x0 + (x1 - x0) * i / (st.nStages - 1);
  const y = rank => topPad + (rank - 0.5) * rowH;
  const parts = [];
  for (let r = 1; r <= st.N; r++) parts.push(`<line x1="${x0}" y1="${y(r)}" x2="${x1}" y2="${y(r)}" stroke="#16273b" stroke-width="1"/>`);
  // ── コーナー通過の近接度（corners_*.json由来のcornerPassTableから抽出・表示専用）──
  // 「馬群密集度」ではなく「このコーナーで隣接して通過した馬同士」の目安。予想ロジックには影響しない。
  // 実測タイム駆動モード(st.timed)では区間が角番号と対応しないため対象外。
  if (st.cornerGroups && !st.timed) {
    const umaRankAt = (uma, i) => { const rr = st.runners.find(r => r.uma === uma); return rr ? rr.ranks[i] : null; };
    Object.keys(st.cornerGroups).forEach(cornerNumStr => {
      const stageIdx = parseInt(cornerNumStr) - 1;
      if (stageIdx < 0 || stageIdx >= st.segN) return; // ゴール列・レンジ外は対象外
      const xx = sx(stageIdx);
      (st.cornerGroups[cornerNumStr] || []).forEach(group => {
        const ranks = group.map(u => umaRankAt(u, stageIdx)).filter(v => v != null);
        if (ranks.length < 2) return;
        const yMin = y(Math.min(...ranks)) - 7, yMax = y(Math.max(...ranks)) + 7;
        parts.push(`<rect x="${(xx - 5).toFixed(1)}" y="${yMin.toFixed(1)}" width="10" height="${(yMax - yMin).toFixed(1)}" rx="5" fill="#38bdf8" opacity="0.18" stroke="#38bdf8" stroke-width="1" stroke-opacity="0.35"><title>${cornerNumStr}角：${group.join('・')}番が近接して通過</title></rect>`);
      });
    });
  }
  for (let i = 0; i < st.nStages; i++) {
    const xx = sx(i), goal = i === st.nStages - 1;
    parts.push(`<line x1="${xx}" y1="${topPad - 6}" x2="${xx}" y2="${H - botPad}" stroke="${goal ? '#38bdf8' : '#22344e'}" stroke-width="${goal ? 2 : 1}" ${goal ? '' : 'stroke-dasharray="3 4"'}/>`);
    const _label = st.stageLabels ? st.stageLabels[i] : (goal ? 'ゴール' : (i + 1) + '角');
    parts.push(`<text x="${xx}" y="${topPad - 12}" fill="#9fb2c8" font-size="10" font-weight="700" text-anchor="middle">${_label}</text>`);
  }
  st.runners.forEach(rr => {
    const pts = []; for (let i = 0; i < st.nStages; i++) pts.push(sx(i) + ',' + y(rr.ranks[i]));
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${_WAKU_BG[rr.waku]}" stroke-width="2" opacity="0.30" stroke-linejoin="round" stroke-linecap="round"/>`);
  });
  st.runners.slice().reverse().forEach(rr => {
    const medal = rr.chaku === 1 ? '#ffd24a' : rr.chaku === 2 ? '#cbd5e1' : rr.chaku === 3 ? '#e8974a' : null;
    parts.push(`<g id="rp-chip-${rr.uma}"><circle r="10" fill="${_WAKU_BG[rr.waku]}" stroke="${medal || '#0b1220'}" stroke-width="${medal ? 2.5 : 1}"/><text y="3.6" fill="${_WAKU_FG[rr.waku]}" font-size="11" font-weight="900" text-anchor="middle">${rr.uma}</text></g>`);
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = parts.join('');
}
function _rpBuildLegend() {
  const st = window._rp, el = document.getElementById('rp-legend'); if (!el) return;
  el.innerHTML = st.runners.map(rr =>
    `<span class="rp-leg-item"><span class="rp-leg-chip" style="background:${_WAKU_BG[rr.waku]};color:${_WAKU_FG[rr.waku]}">${rr.uma}</span>${rr.name}<span class="rp-leg-rank">${rr.chaku ? rr.chaku + '着' : '—'}</span></span>`).join('');
}

// ── 展開リプレイの実測タイム駆動化（大玉③①・表示専用）──
// 検証済み計測JSONを高知プロジェクトのdata/replay/から配信する。
// データが無い/不完全なレースは既存のコーナー通過順(推定)モードのまま・何も変わらない。
const _replayTimelineCache = {};
function fetchRaceReplayTimeline(raceDateSlash, raceNo) {
  const dateStr = String(raceDateSlash).replace(/\//g, '');
  const key = dateStr + '_' + raceNo;
  if (_replayTimelineCache[key] !== undefined) return _replayTimelineCache[key];
  const url = `data/replay/kochi_${dateStr}_R${raceNo}.json`;
  const p = fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
  _replayTimelineCache[key] = p;
  return p;
}
// timeline(meta.markers=距離点配列・records[距離][馬番]={t:絶対秒})から、各走者の実測ランク列と
// 区間ごとの実経過時間比率(segShare・再生ペースに反映)を組み立てる。出走馬全員が最終計測点に無ければ不採用(null)。
function _rpBuildTimedState(timeline, runners, N) {
  const meta = timeline && timeline.meta;
  const markers = meta && meta.markers;
  if (!Array.isArray(markers) || markers.length < 2) return null;
  const recAt = m => timeline.records && timeline.records[String(m)];
  const finalRec = recAt(markers[markers.length - 1]);
  if (!finalRec || !runners.every(r => finalRec[String(r.uma)] != null)) return null;  // カバレッジ不足→不採用
  // 欠測・時刻逆転はコーナー順表示へ戻す。
  for (const runner of runners) {
    let previous = -Infinity;
    for (const marker of markers) {
      const t = Number(recAt(marker)?.[String(runner.uma)]?.t);
      if (!Number.isFinite(t) || t < previous) return null;
      previous = t;
    }
  }
  const ranksByMarker = markers.map(m => {
    const rec = recAt(m) || {};
    const arr = Object.keys(rec).map(k => ({ uma: parseInt(k), t: rec[k].t })).filter(o => !isNaN(o.uma) && typeof o.t === 'number');
    arr.sort((a, b) => a.t - b.t);
    const rankMap = {}; arr.forEach((o, idx) => { rankMap[o.uma] = idx + 1; });
    return rankMap;
  });
  const ranksByUma = {};
  runners.forEach(r => {
    const arr = ranksByMarker.map(rm => rm[r.uma] != null ? rm[r.uma] : null);
    for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = i > 0 ? arr[i - 1] : N;
    ranksByUma[r.uma] = arr;
  });
  // 区間ごとの実経過時間（先頭馬到達時刻の差）→ segShareへ正規化（再生時、この比率で区間の長さを決める）
  const segDur = [];
  for (let i = 0; i < markers.length - 1; i++) {
    const t1s = Object.values(recAt(markers[i]) || {}).map(o => o.t).filter(t => typeof t === 'number');
    const t2s = Object.values(recAt(markers[i + 1]) || {}).map(o => o.t).filter(t => typeof t === 'number');
    segDur.push((!t1s.length || !t2s.length) ? 1 : Math.max(0.05, Math.min(...t2s) - Math.min(...t1s)));
  }
  const totalDur = segDur.reduce((s, v) => s + v, 0) || segDur.length;
  const segShare = segDur.map(v => v / totalDur);
  const stageLabels = markers.map((m, i) => i === markers.length - 1 ? 'ゴール' : (m === 0 ? '発走' : m + 'm'));
  return { nStages: markers.length, segN: markers.length - 1, segShare, stageLabels, ranksByUma };
}
// 開いた直後は従来通りの表示（即座に開ける）で、実測データが取得できればその場でランク・ペースを底上げする。
async function _rpTryUpgradeToTimed(raceNo, raceDateSlash) {
  const timeline = await fetchRaceReplayTimeline(raceDateSlash, raceNo);
  const st = window._rp;
  if (!timeline || !st || st.raceNo !== raceNo) return;  // データ無し／別レースへ切替済み
  const upgrade = _rpBuildTimedState(timeline, st.runners, st.N);
  if (!upgrade) return;  // カバレッジ不足等で不採用（既存表示を維持）
  st.nStages = upgrade.nStages; st.segN = upgrade.segN; st.segShare = upgrade.segShare;
  st.stageLabels = upgrade.stageLabels; st.timed = true;
  st.runners.forEach(r => { r.ranks = upgrade.ranksByUma[r.uma]; });
  const wasPlaying = st.playing;
  if (wasPlaying) { st.playing = false; if (st.raf) cancelAnimationFrame(st.raf); }
  _rpBuildSvg();
  if (wasPlaying) rpTogglePlay(); else rpRender();
}
function rpRender() {
  const st = window._rp; if (!st || !st.dims) return; const d = st.dims;
  let i, frac;
  if (st.segShare) {
    // 実測タイム駆動：区間ごとの実経過時間比率(segShare)に沿って非等速に進める
    let acc = 0; i = 0;
    for (; i < st.segShare.length - 1; i++) { if (st.progress < acc + st.segShare[i]) break; acc += st.segShare[i]; }
    frac = st.segShare[i] > 0 ? Math.min(1, Math.max(0, (st.progress - acc) / st.segShare[i])) : 0;
  } else {
    const sf = st.progress * (st.nStages - 1); i = Math.min(Math.floor(sf), st.nStages - 2); frac = sf - i;
  }
  const y = rank => d.topPad + (rank - 0.5) * d.rowH;
  const px = d.x0 + (d.x1 - d.x0) * st.progress;
  st.runners.forEach(rr => {
    const rankNow = rr.ranks[i] + (rr.ranks[i + 1] - rr.ranks[i]) * frac;
    const g = document.getElementById('rp-chip-' + rr.uma);
    if (g) g.setAttribute('transform', `translate(${px.toFixed(1)},${y(rankNow).toFixed(1)})`);
  });
  const seek = document.getElementById('rp-seek'); if (seek) seek.value = Math.round(st.progress * 1000);
}
function rpTogglePlay() {
  const st = window._rp; if (!st) return; const btn = document.getElementById('rp-play');
  if (st.playing) { st.playing = false; if (st.raf) cancelAnimationFrame(st.raf); if (btn) btn.textContent = '▶ 再生'; return; }
  if (st.progress >= 1) st.progress = 0;
  st.playing = true; st.last = performance.now(); if (btn) btn.textContent = '⏸ 一時停止';
  const tick = now => {
    if (!st.playing) return; const dt = now - st.last; st.last = now;
    st.progress += dt / st.duration * st.speed;
    if (st.progress >= 1) { st.progress = 1; st.playing = false; if (btn) btn.textContent = '⟲ もう一度'; }
    rpRender(); if (st.playing) st.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
}
function rpRestart() { const st = window._rp; if (!st) return; st.progress = 0; st.last = performance.now(); rpRender(); }
function rpSeek(v) { const st = window._rp; if (!st) return; st.progress = Math.max(0, Math.min(1, v / 1000)); st.last = performance.now(); rpRender(); }
function rpSetSpeed(s, btn) { const st = window._rp; if (st) st.speed = s; document.querySelectorAll('.rp-spd').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); }
function closeRaceReplay() { const st = window._rp; if (st) { st.playing = false; if (st.raf) cancelAnimationFrame(st.raf); } const m = document.getElementById('race-replay-modal'); if (m) m.classList.add('hidden'); }

// ── 収支ノート（マイ的中トラッカー）─────────────────────────────────
const BET_TYPES = ['単勝', '複勝', '馬連', '馬単', 'ワイド', '3連複', '3連単'];
const _BET_NSEL = { '単勝': 1, '複勝': 1, '馬連': 2, '馬単': 2, 'ワイド': 2, '3連複': 3, '3連単': 3 };
function _betsRead() { try { return JSON.parse(localStorage.getItem('kv_bets') || '[]'); } catch (e) { return []; } }
function _betsWrite(a) { localStorage.setItem('kv_bets', JSON.stringify(a)); }
function _bnEsc(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function _betLookupRace(baba, date, r) {
  const ls = lsRead(); const pref = (baba || '31') + '_' + date + '_' + r + '_'; const m = {};
  for (const k in ls) { if (k.indexOf(pref) !== 0) continue; const v = ls[k]; if (!v || v.type !== 'horse') continue;
    const uma = parseInt(k.slice(pref.length)); if (isNaN(uma)) continue;
    const chaku = parseInt(v.chakujun), odds = parseFloat(v.odds);
    m[uma] = { chaku: isNaN(chaku) ? null : chaku, odds: isNaN(odds) ? null : odds };
  }
  return m;
}
function _settleBet(bet) {
  const m = _betLookupRace(bet.baba, bet.date, bet.r);
  const umas = Object.keys(m);
  if (!umas.length) return { status: 'no_data' };
  const byC = {}; umas.forEach(u => { const c = m[u].chaku; if (c) byC[c] = parseInt(u); });
  if (byC[1] == null) return { status: 'pending' };
  const n = umas.length, placeLine = n >= 8 ? 3 : n >= 5 ? 2 : 1;
  const sel = (bet.sel || []).map(Number);
  const ch = u => m[u] ? m[u].chaku : null;
  const sSort = arr => arr.slice().sort((a, b) => a - b).join(',');
  const t = bet.type; let hit = false;
  if (t === '単勝') hit = ch(sel[0]) === 1;
  else if (t === '複勝') hit = ch(sel[0]) != null && ch(sel[0]) <= placeLine;
  else if (t === 'ワイド') hit = sel.length === 2 && ch(sel[0]) != null && ch(sel[1]) != null && ch(sel[0]) <= placeLine && ch(sel[1]) <= placeLine;
  else if (t === '馬連') hit = sSort(sel) === sSort([byC[1], byC[2]]);
  else if (t === '馬単') hit = sel[0] === byC[1] && sel[1] === byC[2];
  else if (t === '3連複') hit = sSort(sel) === sSort([byC[1], byC[2], byC[3]]);
  else if (t === '3連単') hit = sel[0] === byC[1] && sel[1] === byC[2] && sel[2] === byC[3];
  if (!hit) return { status: 'settled', hit: false, payout: 0, pl: -bet.stake };
  let payout = null;
  if (t === '単勝') { const o = m[sel[0]] && m[sel[0]].odds; payout = o ? Math.round(bet.stake * o) : null; }
  else payout = (bet.payout != null) ? bet.payout : null;
  if (payout == null) return { status: 'need_payout', hit: true };
  return { status: 'settled', hit: true, payout, pl: payout - bet.stake };
}
function _bnAddBet() {
  const date = (document.getElementById('bn-date').value || '').replace(/-/g, '/');
  const r = parseInt(document.getElementById('bn-r').value);
  const type = document.getElementById('bn-type').value;
  const selRaw = document.getElementById('bn-sel').value.trim();
  const stake = parseInt(document.getElementById('bn-stake').value);
  const memo = document.getElementById('bn-memo').value.trim();
  if (!date) { alert('日付を入力してください'); return; }
  if (!r || r < 1 || r > 12) { alert('Rは1〜12で入力してください'); return; }
  const sel = selRaw.split(/[-\s,>→＞]+/).map(x => parseInt(x)).filter(x => !isNaN(x));
  const need = _BET_NSEL[type];
  if (sel.length !== need) { alert(type + 'は馬番を' + need + 'つ入力してください（例: ' + (need === 1 ? '7' : need === 2 ? '7-3' : '7-3-1') + '）'); return; }
  if (!stake || stake < 100) { alert('金額は100円以上で入力してください'); return; }
  const bets = _betsRead();
  bets.push({ id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6), date, baba: '31', r, type, sel, stake, payout: null, memo, createdAt: Date.now() });
  _betsWrite(bets);
  document.getElementById('bn-sel').value = ''; document.getElementById('bn-memo').value = '';
  renderBetsPage();
}
function _copyPickText(btn) {
  const card = btn.closest('.pick-summary'); if (!card) return;
  const rows = [...card.querySelectorAll('.ps-row')].map(r => r.querySelector('.ps-tag').textContent + '：' + r.querySelector('.ps-body').textContent.replace(/\s+/g, ' ').trim());
  const line = (card.querySelector('.ps-line') || {}).textContent || '';
  const txt = '🎯 狙い目\n' + rows.join('\n') + '\n' + line + '\n#高知競馬';
  const done = () => { const o = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = o, 1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done).catch(() => {});
}
// bet.type(アプリの券種名) → 楽天払戻ページの表記 の対応（馬連=馬複／3連複=三連複／3連単=三連単、他は同名）
const _RAKUTEN_TYPE_MAP = { '単勝': '単勝', '複勝': '複勝', '馬連': '馬複', '馬単': '馬単', 'ワイド': 'ワイド', '3連複': '三連複', '3連単': '三連単' };
/** 楽天競馬の払戻ページから当日の払戻金を取得し、的中済み(need_payout)の馬券にだけ自動反映する（管理者専用）。 */
async function _bnFetchPayouts() {
  if (!isAdminMode()) { alert('払戻の自動取得は管理者のみ可能です。'); return; }
  const dateVal = document.getElementById('bn-date').value;
  if (!dateVal) { alert('日付を入力してください'); return; }
  const date = dateVal.replace(/-/g, '/');
  const btn = document.getElementById('bn-fetch-btn');
  const statusEl = document.getElementById('bn-fetch-status');
  if (btn) { btn.disabled = true; btn.textContent = '取得中...'; }
  if (statusEl) statusEl.textContent = '';
  let divs;
  try { divs = await fetchRakutenDividendsForDay(date); }
  catch (e) { if (statusEl) statusEl.textContent = '⚠️ 取得に失敗しました'; if (btn) { btn.disabled = false; btn.textContent = '📥 楽天から払戻を取得'; } return; }
  if (!Object.keys(divs).length) {
    if (statusEl) statusEl.textContent = 'この日の払戻データが見つかりませんでした（開催前／まだ確定していない可能性）';
    if (btn) { btn.disabled = false; btn.textContent = '📥 楽天から払戻を取得'; }
    return;
  }
  const bets = _betsRead();
  let filled = 0, checked = 0, notFound = 0;
  bets.forEach(b => {
    if (b.date !== date) return;
    const s = _settleBet(b);
    if (s.status !== 'need_payout') return;   // 的中確定・払戻未登録の馬券だけを対象（既存の的中判定はそのまま信頼）
    checked++;
    const entries = divs[b.r]; const rkType = _RAKUTEN_TYPE_MAP[b.type];
    if (!entries || !rkType) { notFound++; return; }
    const cands = entries.filter(e => e.type === rkType);
    const sel = (b.sel || []).map(Number);
    let match = null;
    if (b.type === '馬単' || b.type === '3連単') {
      const selStr = sel.join('-');
      match = cands.find(e => e.combo === selStr);
    } else {
      const selSorted = sel.slice().sort((a, c) => a - c).join(',');
      match = cands.find(e => e.combo.split('-').map(Number).sort((a, c) => a - c).join(',') === selSorted);
    }
    if (match) { b.payout = match.yen; filled++; } else { notFound++; }
  });
  _betsWrite(bets);
  if (btn) { btn.disabled = false; btn.textContent = '📥 楽天から払戻を取得'; }
  if (statusEl) statusEl.textContent = `✅ ${date}：的中済み${checked}件中 ${filled}件の払戻を反映しました` + (notFound ? `（${notFound}件は照合できず）` : '');
  renderBetsPage();
}
function _bnDelete(id) { if (!confirm('この記録を削除しますか？')) return; _betsWrite(_betsRead().filter(b => b.id !== id)); renderBetsPage(); }
function _bnSetPayout(id, val) { const p = parseInt(val); if (isNaN(p) || p < 0) return; const bets = _betsRead(); const b = bets.find(x => x.id === id); if (b) { b.payout = p; _betsWrite(bets); renderBetsPage(); } }
function _bnRenderChart(labels, pts) {
  const cv = document.getElementById('bn-chart'); if (!cv) return;
  // ensureChartJs は ai-analysis.js（遅延ロード）にしか無く、収支ノートはそのモジュールを
  // 待たないため ReferenceError になっていた（2026-08-04 実測）。中身は _kvLoadLibrary('chart')
  // の薄いラッパで本体はこのファイルにあるので、そちらを直接呼ぶ。
  if (typeof Chart === 'undefined') {
    _kvLoadLibrary('chart').then(() => _bnRenderChart(labels, pts)).catch(e => _kvSwallow('_bnRenderChart:chart', e));
    return;
  }
  if (window._bnChart) { try { window._bnChart.destroy(); } catch (e) { _kvSwallow('_bnRenderChart', e); } window._bnChart = null; }
  const ctx = cv.getContext('2d');
  if (!pts.length) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
  const dark = document.body.classList.contains('dark-mode');
  const col = pts[pts.length - 1] >= 0 ? '#059669' : '#dc2626';
  window._bnChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: '累計収支', data: pts, borderColor: col, backgroundColor: col + '22', fill: true, tension: 0.2, pointRadius: 2, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: dark ? '#94a3b8' : '#64748b', maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 10 }, callback: v => Number(v).toLocaleString() }, grid: { color: dark ? '#1e2e44' : '#eef2f7' } }
      } }
  });
}
function renderBetsPage() {
  const dEl = document.getElementById('bn-date');
  if (dEl && !dEl.value) { const t = new Date(); dEl.value = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  const bets = _betsRead().slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  const rows = bets.map(b => ({ bet: b, s: _settleBet(b) }));
  let stakeSum = 0, payoutSum = 0, hits = 0, settled = 0, cum = 0; const pts = [], labels = [];
  const bd = {}; BET_TYPES.forEach(t => bd[t] = { n: 0, hit: 0, stake: 0, pay: 0 });
  rows.forEach(({ bet, s }) => {
    bd[bet.type].n++;
    if (s.status === 'settled') { settled++; stakeSum += bet.stake; payoutSum += s.payout; if (s.hit) hits++; cum += s.pl; pts.push(cum); labels.push(bet.date.slice(5) + ' ' + bet.r + 'R'); if (s.hit) bd[bet.type].hit++; bd[bet.type].stake += bet.stake; bd[bet.type].pay += s.payout; }
  });
  const pl = payoutSum - stakeSum;
  const roi = stakeSum ? Math.round(payoutSum / stakeSum * 1000) / 10 : 0;
  const hr = settled ? Math.round(hits / settled * 1000) / 10 : 0;
  const plC = pl >= 0 ? 'bn-pos' : 'bn-neg', roiC = roi >= 100 ? 'bn-pos' : 'bn-neg';
  document.getElementById('bn-summary').innerHTML =
    `<div class="bn-stat"><div class="bn-stat-label">収支</div><div class="bn-stat-val ${plC}" id="bnv-pl">${pl >= 0 ? '+' : ''}${pl.toLocaleString()}</div></div>` +
    `<div class="bn-stat"><div class="bn-stat-label">回収率</div><div class="bn-stat-val ${roiC}" id="bnv-roi">${roi}%</div></div>` +
    `<div class="bn-stat"><div class="bn-stat-label">的中率</div><div class="bn-stat-val" id="bnv-hr">${hr}%</div></div>` +
    `<div class="bn-stat"><div class="bn-stat-label">的中/件数</div><div class="bn-stat-val">${hits}/${settled}</div></div>`;
  _animateNum(document.getElementById('bnv-pl'), pl, 750, v => (v >= 0 ? '+' : '') + Math.round(v).toLocaleString('en-US'));
  _animateNum(document.getElementById('bnv-roi'), roi, 750, v => (Math.round(v * 10) / 10) + '%');
  _animateNum(document.getElementById('bnv-hr'), hr, 750, v => (Math.round(v * 10) / 10) + '%');
  _bnRenderChart(labels, pts);
  const bdRows = BET_TYPES.filter(t => bd[t].n > 0).map(t => { const o = bd[t]; const roiT = o.stake ? Math.round(o.pay / o.stake * 1000) / 10 : null; return `<div class="bn-bd-row"><span>${t} <span class="bn-muted">${o.n}件</span></span><span>的中${o.hit}${roiT != null ? '・回収' + roiT + '%' : ''}</span></div>`; }).join('');
  document.getElementById('bn-breakdown').innerHTML = bdRows ? ('<div class="bn-breakdown">' + bdRows + '</div>') : '';
  const listEl = document.getElementById('bn-list');
  document.getElementById('bn-count').textContent = bets.length ? ('(' + bets.length + '件)') : '';
  if (!bets.length) { listEl.innerHTML = '<p class="bn-muted" style="padding:8px 2px">まだ記録がありません。上のフォームから馬券を記録してみましょう。</p>'; return; }
  listEl.innerHTML = rows.slice().reverse().map(({ bet, s }) => {
    let badge;
    if (s.status === 'no_data') badge = '<span class="bn-badge bn-b-pending">その日を未取得</span>';
    else if (s.status === 'pending') badge = '<span class="bn-badge bn-b-pending">結果待ち</span>';
    else if (s.status === 'need_payout') badge = `<span class="bn-badge bn-b-pay">的中！</span><input type="number" class="bn-pay-input" placeholder="払戻¥" onchange="_bnSetPayout('${bet.id}',this.value)">`;
    else if (s.hit) badge = `<span class="bn-badge bn-b-hit">${s.pl >= 0 ? '+' : ''}${s.pl.toLocaleString()}</span><span class="bn-muted">払戻¥${s.payout.toLocaleString()}</span>`;
    else badge = `<span class="bn-badge bn-b-miss">−${bet.stake.toLocaleString()}</span>`;
    return `<div class="bn-row"><div class="bn-row-main"><span class="bn-rr">${bet.date.slice(5)} ${bet.r}R</span><span class="bn-type">${bet.type}</span><span class="bn-sel">${bet.sel.join('-')}</span><span class="bn-stake">¥${bet.stake.toLocaleString()}</span>${bet.memo ? '<span class="bn-muted">' + _bnEsc(bet.memo) + '</span>' : ''}</div>${badge}<button class="bn-del" onclick="_bnDelete('${bet.id}')" title="削除">🗑</button></div>`;
  }).join('');
}

/** スマホプレビュー(iframe)内で、親から引き継いだ page / レース日 を復元する。
 *  IDB(ローカルDB)の読み込みは非同期なので、対象日のデータが揃うまで待ってから復元する。 */
function _simRestoreState() {
  const p = new URLSearchParams(location.search);
  const page = p.get('page');
  if (!page || page === 'search') return;
  try { switchPage(page); } catch (e) { _kvSwallow('_simRestoreState', e); }
  if (page === 'deban' && p.get('date')) {
    const date = p.get('date'), baba = p.get('baba') || '31', r = parseInt(p.get('r'));
    const prefix = `race_${baba}_${date}_`;
    let restored = false, fetched = false;
    const poll = (attempt) => {
      // ① 既にメモリに読み込み済み（保存復元 or ネット取得完了）→ レース切替して終了
      const loaded = (typeof allRacesData === 'object') && Object.values(allRacesData).some(d => d && d.raceInfo && d.raceInfo.raceDate === date);
      if (loaded) { if (!isNaN(r) && typeof switchRaceTab === 'function') { try { switchRaceTab(r); } catch (e) { _kvSwallow('poll', e); } } return; }
      // ② IDB(保存データ)にあれば保存復元（即時・オフラインOK）
      const ls = (typeof lsRead === 'function') ? lsRead() : {};
      const inIdb = Object.keys(ls).some(k => k.indexOf(prefix) === 0);
      if (inIdb && !restored) { restored = true; try { restoreFromSaved(date, baba); } catch (e) { _kvSwallow('poll#2', e); } }
      // ③ IDBに無ければ（今日のレース等・未保存）ネットから取得（1回だけ）
      else if (!inIdb && !fetched && attempt >= 6 && typeof loadSavedDay === 'function') { fetched = true; try { loadSavedDay(date, baba); } catch (e) { _kvSwallow('poll#3', e); } }
      if (attempt < 60) setTimeout(() => poll(attempt + 1), 200);
    };
    poll(0);
  } else if (page === 'bunseki') {
    const ad = p.get('anadate');
    if (ad) {
      const tryAna = (attempt) => {
        const sel = document.getElementById('ana-date-select');
        const has = sel && [...sel.options].some(o => o.value === ad);
        if (!has) { if (attempt < 40) setTimeout(() => tryAna(attempt + 1), 150); return; }
        sel.value = ad;
        if (typeof renderAnalysis === 'function') { try { renderAnalysis(); } catch (e) { _kvSwallow('tryAna', e); } }
      };
      tryAna(0);
    }
  }
}

function _updateDarkModeBtn(isDark) {
  const icon  = document.getElementById('dark-mode-icon');
  const label = document.getElementById('dark-mode-label');
  if (icon)  icon.textContent  = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'ライト' : 'ダーク';
}

function initMinimalMode() {
  document.body.classList.remove('minimal-mode');
  localStorage.removeItem('minimalMode');
}

function _updateCockpitHeaderDate() {
  const el = document.getElementById('cockpit-today-label');
  if (!el) return;
  el.textContent = _cockpitDateLabel();
}

/** ヘッダー実高をCSS変数に反映（レースタブのsticky位置決め用。折返しで高さが変わるためresizeでも更新） */
function _setHeaderHVar() {
  const h = document.querySelector('.app-header');
  if (h) document.documentElement.style.setProperty('--kv-header-h', h.offsetHeight + 'px');
}
window.addEventListener('resize', _setHeaderHVar);

function initDarkMode() {
  const saved = localStorage.getItem('darkMode');
  // ダークがデフォルト（モダンダーク基調・2026-07-02）。明示的にライトを選んだ場合のみライト。
  const isDark = saved !== null ? saved === '1' : true;
  if (isDark) document.body.classList.add('dark-mode');
  _updateDarkModeBtn(isDark);
}

// ════════════════════════════════════════════════════════
//  管理者モード（起動必須）
//  AI・分析モジュールを読み込む前にも公開UIとDB初期化で使うため、初期コードに置く。
// ════════════════════════════════════════════════════════

function isAdminMode() {
  // 通常ログインはsessionStorage（タブ終了で破棄）。localStorageは旧版互換テストだけに残す。
  // ※旧・開発用トグル(kv_dev_admin)の優先判定は廃止（ログアウトが効かなくなる不具合の原因だったため）。
  return !!(sessionStorage.getItem('kv_write_token') || localStorage.getItem('kv_write_token'));
}

/** 【開発用】管理者⇔閲覧者を手動トグル（完成後はこの関数とボタン・isAdminModeのdev分岐を削除） */
function toggleDevAdmin() {
  const next = isAdminMode() ? '0' : '1';
  localStorage.setItem('kv_dev_admin', next);
  applyModeUI();
  _updateDevAdminBtn();
  if (typeof _currentPage === 'string') switchPage(_currentPage, true);
}

function _updateDevAdminBtn() {
  const btn = document.getElementById('dev-admin-btn');
  const label = document.getElementById('dev-admin-label');
  const admin = isAdminMode();
  if (label) label.textContent = admin ? '管理者' : '閲覧者';
  if (btn) btn.classList.toggle('dev-admin-public', !admin);
}

function applyModeUI() {
  const isAdmin = isAdminMode();
  document.body.classList.toggle('public-mode', !isAdmin);
  const badge = document.getElementById('admin-mode-badge');
  const loginBtn = document.getElementById('admin-login-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const devBtn = document.getElementById('dev-admin-btn');
  if (devBtn) devBtn.classList.add('hidden');
  if (loginBtn) loginBtn.classList.add('hidden');
  if (badge) badge.classList.toggle('hidden', !isAdmin);
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !isAdmin);
  if (isAdmin && typeof _renderAccessCounter === 'function') { try { _renderAccessCounter(); } catch (e) { _kvSwallow('applyModeUI', e); } }
  if (typeof kvxApplyShell === 'function') kvxApplyShell();
}

/** 管理者ログインの秘密の入口：①URLに #admin ②ヘッダーのロゴを5回タップ。 */
function _wireSecretAdminEntry() {
  const _hashOpen = () => {
    if (/^#(admin|kanri)$/i.test(location.hash) && !isAdminMode()) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { _kvSwallow('_hashOpen', e); }
      if (typeof openAdminLogin === 'function') openAdminLogin();
    }
  };
  _hashOpen();
  window.addEventListener('hashchange', _hashOpen);
  const logo = document.querySelector('.header-title');
  if (logo && !logo._secretWired) {
    logo._secretWired = true;
    logo.style.cursor = 'default';
    let taps = 0, timer = null;
    logo.addEventListener('click', () => {
      if (isAdminMode()) return;
      taps++;
      clearTimeout(timer);
      timer = setTimeout(() => { taps = 0; }, 2000);
      if (taps >= 5) { taps = 0; if (typeof openAdminLogin === 'function') openAdminLogin(); }
    });
  }
}

let _adminLoginReturnFocus = null;
function openAdminLogin() {
  const modal = document.getElementById('admin-login-modal');
  if (!modal) return;
  _adminLoginReturnFocus = document.activeElement;
  modal.style.display = 'flex';
  if (!modal._a11yWired) {
    modal._a11yWired = true;
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeAdminLogin(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  setTimeout(() => { const inp = document.getElementById('admin-pw-input'); if (inp) inp.focus(); }, 80);
  const errEl = document.getElementById('admin-login-error');
  if (errEl) errEl.style.display = 'none';
  const inp = document.getElementById('admin-pw-input');
  if (inp) inp.value = '';
}

function closeAdminLogin() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.style.display = 'none';
  if (_adminLoginReturnFocus && typeof _adminLoginReturnFocus.focus === 'function') _adminLoginReturnFocus.focus();
  _adminLoginReturnFocus = null;
}

async function doAdminLogin() {
  const inp = document.getElementById('admin-pw-input');
  if (!inp) return;
  const token = inp.value.trim();
  const errEl = document.getElementById('admin-login-error');
  const btn = document.querySelector('#admin-login-modal button[type=submit]');
  if (!token) { if (errEl) { errEl.textContent = 'トークンを入力してください'; errEl.style.display = 'block'; } return; }
  if (btn) { btn.disabled = true; btn.dataset._l = btn.innerHTML; btn.innerHTML = '確認中...'; }
  let ok = false;
  try {
    const res = await fetch(`${WORKER_URL}/auth/check`, {
      method: 'GET', headers: { 'X-Write-Token': token }, signal:AbortSignal.timeout(10000),
    });
    ok = res.ok;
  } catch (e) { ok = false; }
  if (btn) { btn.disabled = false; if (btn.dataset._l) btn.innerHTML = btn.dataset._l; }
  if (ok) {
    sessionStorage.setItem('kv_write_token', token);
    localStorage.removeItem('kv_write_token');
    closeAdminLogin();
    applyModeUI();
    if (typeof _currentPage === 'string' && typeof switchPage === 'function') switchPage(_currentPage, true);
  } else {
    if (errEl) { errEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> トークンが違います'; errEl.style.display = 'block'; }
    inp.value = ''; inp.focus();
  }
}

function adminLogout() {
  if (!confirm('管理者モードからログアウトしますか？\n（この端末から書き込みトークンを削除します。データ閲覧は引き続き可能です）')) return;
  sessionStorage.removeItem('kv_write_token');
  localStorage.removeItem('kv_write_token');
  localStorage.removeItem('kv_dev_admin');
  sessionStorage.removeItem('kv_admin_session');
  applyModeUI();
  if (typeof _currentPage === 'string' && typeof switchPage === 'function') switchPage(_currentPage, true);
}

document.addEventListener('DOMContentLoaded', () => {
  applyModeUI();
  try { _wireSecretAdminEntry(); } catch (e) { _kvSwallow('adminLogout', e); }
});
// スクリプトはbody末尾にあるため、初回描画前にも公開UIを適用する。
(function(){ applyModeUI(); })();

document.addEventListener('DOMContentLoaded', () => {
  // CSS注入確認（page_private環境でheadスクリプトがフィルタされた場合の保険）
  injectStyles();
  initDarkMode();
  initMinimalMode();
  _updateCockpitHeaderDate();
  _updateDevAdminBtn();
  _setHeaderHVar();
  // sim内（プレビューiframe）では入れ子防止のためスマホ表示ボタンを隠す
  if (KV_IS_SIM) document.getElementById('sim-mode-btn')?.classList.add('hidden');
  // アクセスカウンターは表示・操作に不要なので、最初の描画後に送信する
  _kvScheduleIdle(() => _bumpAccessCounter(), 3000);
  // 折返しによる高さ変化を拾う。ResizeObserver対応環境ではポーリングを動かさない。
  const _hdr = document.querySelector('.app-header');
  if (window.ResizeObserver) {
    if (_hdr) new ResizeObserver(_setHeaderHVar).observe(_hdr);
  } else {
    // 古いアプリ内ブラウザ向けのフォールバック
    setInterval(() => {
      if (!_hdr) return;
      const v = _hdr.offsetHeight + 'px';
      if (document.documentElement.style.getPropertyValue('--kv-header-h') !== v) {
        document.documentElement.style.setProperty('--kv-header-h', v);
      }
    }, 1500);
  }

  const t = new Date();
  document.getElementById('race-date').value =
    `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  // ディープリンク（#d/YYYY-MM-DD/N）があれば起動後に該当レースを開く（initDB内で消費）
  try { window._kvDeepLink = _kvParseHash(); } catch(e) { window._kvDeepLink = null; }
  _initNavHistory();
  _kvStartTickers();   // 発走カウントダウン＆当日オッズの5分毎自動更新
  renderFavoriteHorsesPanel();
  initDB().catch(e => console.warn('[initDB]', e));
});

/** ディープリンクの消費を試みる。データ未到着ならfalse（Phase2完了後に再試行される）。 */
async function _kvTryDeepLink() {
  const dl = window._kvDeepLink;
  if (!dl) return false;
  // 閲覧者に公開していない過去日へのリンク→ハッシュを消して通常起動（本日モード）へ
  if (!_kvViewerDateAllowed(dl.date)) {
    window._kvDeepLink = null;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch(e) { _kvSwallow('_kvTryDeepLink', e); }
    const st = document.getElementById('save-status');
    if (st) { st.textContent = '🔒 ' + _KV_PAST_HIDDEN_MSG; setTimeout(() => { st.textContent = ''; }, 6000); }
    try { await kvTodayMode(); } catch(e) { _kvSwallow('_kvTryDeepLink#2', e); }
    return true;
  }
  // 日付索引を使い、ディープリンクを開くたびに全保存データを走査しない。
  const day = _raceDayIndex?.get(`31|${dl.date}`);
  const has = day
    ? [...day.values()].some(entry => entry.raceVal)
    : Object.values(lsRead()).some(v => v.type === 'race' && v.race_date === dl.date && v.baba_code === '31');
  if (!has) return false;
  window._kvDeepLink = null;
  await restoreFromSaved(dl.date, '31', true);
  if (dl.raceNo && allRacesData[dl.raceNo]) switchRaceTab(dl.raceNo);
  return true;
}

function injectStyles() {
  if(document.getElementById('kv-styles') || document.getElementById('kv-styles-injected')) return;
  var el = document.createElement('style');
  el.setAttribute('type','text/css');
  el.id = 'kv-styles-injected';
  el.textContent = KV_APP_CSS.join('\n');
  (document.head || document.documentElement).appendChild(el);
  console.log('[KV] スタイル注入完了');
}

function parseAndFetchUrl() {
  const raw = document.getElementById('direct-url').value.trim();
  if (!raw) { alert('URLを入力してください'); return; }
  try {
    const u = new URL(raw);
    const rd = u.searchParams.get('k_raceDate') || '';
    const rn = u.searchParams.get('k_raceNo') || '1';
    const bc = u.searchParams.get('k_babaCode') || '31';
    if (!rd) { alert('k_raceDateパラメータが見つかりません'); return; }
    // DebaTable URL かどうかを自動判定
    if (u.pathname.includes('DebaTable')) {
      fetchDebaTableSingle(rd, parseInt(rn), bc);
    } else {
      if (rd) document.getElementById('race-date').value = rd.replace(/\//g,'-');
      document.getElementById('baba-code').value = bc;
      document.getElementById('race-no-single').value = rn;
      fetchSingleRace();
    }
  } catch(e) { alert('URLの形式が正しくありません'); }
}

async function fetchSingleRace() {
  const dateRaw = document.getElementById('race-date').value;
  const raceNo = parseInt(document.getElementById('race-no-single').value);
  const baba = document.getElementById('baba-code').value;
  if (!dateRaw) { alert('日付を選択してください'); return; }
  const newDate = dateRaw.replace(/-/g,'/');
  if (!_kvViewerDateAllowed(newDate)) { alert(_KV_PAST_HIDDEN_MSG); return; }
  if (newDate !== currentDate || baba !== currentBaba) { allRacesData = {}; clearRaceTabs(); }
  currentDate = newDate; currentBaba = baba;
  showLoading(true); hideError();
  const result = await fetchOneRace(currentDate, raceNo, baba);
  showLoading(false);
  if (!result) { showError(`${raceNo}R のデータ取得に失敗しました。競走成績・出馬表ともに取得できませんでした。`); return; }
  _sanDeep(result);
  if (allRacesData[raceNo]) {
    const prev = allRacesData[raceNo];
    result.horses = mergeHorseData(prev.horses, result.horses);
    _mergeFirst3fInfo(prev.raceInfo, result.raceInfo);
    if (String(prev.raceInfo?.agari4f || '').trim()) result.raceInfo.agari4f = prev.raceInfo.agari4f;
    if (String(prev.raceInfo?.agari3f_race || '').trim()) result.raceInfo.agari3f_race = prev.raceInfo.agari3f_race;
  }
  allRacesData[raceNo] = result;
  addRaceTab(raceNo); switchRaceTab(raceNo);
  switchPage('deban');
}

async function fetchAllRaces() {
  const dateRaw = document.getElementById('race-date').value;
  const baba = document.getElementById('baba-code').value;
  if (!dateRaw) { alert('日付を選択してください'); return; }
  const newDate = dateRaw.replace(/-/g,'/');
  if (!_kvViewerDateAllowed(newDate)) { alert(_KV_PAST_HIDDEN_MSG); return; }
  if (newDate !== currentDate || baba !== currentBaba) { allRacesData = {}; clearRaceTabs(); }
  currentDate = newDate; currentBaba = baba;
  hideError(); showLoading(false); showProgress(true);

  // プロキシ健康状態をセッション開始時にリセット
  _proxyHealth.forEach(h => { h.blockedUntil = 0; });

  // 未来日チェック
  const today = new Date(); today.setHours(0,0,0,0);
  const raceDateObj = new Date(newDate.replace(/\//g,'-')); raceDateObj.setHours(0,0,0,0);
  const isFuture = raceDateObj > today;

  // RaceListからレース番号一覧を取得
  const raceListResult = await fetchRaceList(currentDate, baba);
  let targets;
  if (Array.isArray(raceListResult) && raceListResult.length > 0) {
    targets = raceListResult;
  } else if (raceListResult && raceListResult.notFound) {
    showProgress(false);
    showError(`${newDate}（${getBabaName(baba)}）の開催情報が見つかりませんでした。\n開催がない日付か、まだ開催情報が公開されていない可能性があります。`, true);
    return;
  } else {
    targets = [1,2,3,4,5,6,7,8,9,10,11,12];
  }

  // 画面で選ばれているレース→次レース→残りの順に取得し、最初の判断画面を先に使えるようにする。
  const preferred = parseInt(currentRaceNo || document.getElementById('race-no-single')?.value, 10);
  if (Number.isFinite(preferred) && targets.includes(preferred)) {
    const priority = [preferred, preferred + 1].filter(rn => targets.includes(rn));
    targets = [...new Set([...priority, ...targets])];
  }

  // 2並行で取得（プロキシ負荷を分散しつつ高速化）
  const CONCURRENCY = 2, BATCH_GAP = 700, INNER_GAP = 400;
  let done = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    updateProgress(done, targets.length, batch[0]);
    await Promise.all(batch.map(async (rn, j) => {
      if (j > 0) await new Promise(r => setTimeout(r, INNER_GAP));
      const result = await fetchOneRace(currentDate, rn, baba);
      done++;
      updateProgress(done, targets.length, targets[i + CONCURRENCY] ?? null);
      if (result) {
        _sanDeep(result);
        if (allRacesData[rn]) {
          result.horses = mergeHorseData(allRacesData[rn].horses, result.horses);
          // ユーザー入力済みのラップタイムを保持（再取得で消えないように）
          const prevInfo = allRacesData[rn].raceInfo;
          _mergeFirst3fInfo(prevInfo, result.raceInfo);
          if (String(prevInfo?.agari4f || '').trim()) result.raceInfo.agari4f = prevInfo.agari4f;
          if (String(prevInfo?.agari3f_race || '').trim()) result.raceInfo.agari3f_race = prevInfo.agari3f_race;
          if (prevInfo && prevInfo.lapTimes && prevInfo.lapTimes.some(v => v != null)) {
            result.raceInfo.lapTimes = prevInfo.lapTimes;
          }
        }
        allRacesData[rn] = result;
        addRaceTab(rn);
        if (!document.querySelector('.race-tab.active')) {
          switchRaceTab(rn);
          switchPage('deban');
        }
        updateProgressStatus(rn, true);
      } else {
        updateProgressStatus(rn, false);
      }
    }));
    if (i + CONCURRENCY < targets.length) await new Promise(r => setTimeout(r, BATCH_GAP));
  }

  updateProgress(targets.length, targets.length, null);
  showProgress(false);
  const obtained = Object.keys(allRacesData).map(Number).sort((a,b)=>a-b);
  if (!obtained.length) {
    if (isFuture) {
      showError(`${newDate}（${getBabaName(baba)}）は未来の日付です。\n出馬表（DebaTable）も取得できませんでした。\nkeiba.go.jpに出馬表が掲載される前の可能性があります。`, true);
    } else {
      showError('全レースのデータ取得に失敗しました。しばらく待って再試行してください。');
    }
    return;
  }
  rebuildAllTabs(); switchRaceTab(obtained[0]);
  switchPage('deban');
  renderNextRaceHomeCard();

  // 公式成績を自動取得（管理者のみ：Supabaseへ保存されるデータ入力操作のため）
  if (isAdminMode()) fetchAllHorsesOfficialData(true);
}

async function fetchRaceList(raceDate, babaCode) {
  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate=${encodeURIComponent(raceDate)}&k_babaCode=${babaCode}`;
  console.log(`[fetchRaceList] URL: ${url}`);

  let html;
  try {
    html = await fetchHtmlWithProxy(url, 12000);
  } catch(e) {
    console.log(`[fetchRaceList] 全プロキシ失敗:`, e.message);
    return [];
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // RaceMarkTable または DebaTable へのリンクからレース番号を収集
  const links = Array.from(doc.querySelectorAll('a[href*="RaceMarkTable"], a[href*="DebaTable"]'));
  links.forEach(a => {
    try {
      const u = new URL(a.href, 'https://www.keiba.go.jp');
      const rn = parseInt(u.searchParams.get('k_raceNo'));
      if (rn >= 1 && rn <= 12) {
        const key = `${raceDate}|${babaCode}|${rn}`;
        const prior = _raceListPreferredPage.get(key) || '';
        // 同じレースへのリンクが複数ある場合は、結果ページを常に優先する。
        // DOM上のリンク順により出馬表へ上書きされると、確定済みレースでも結果を二重取得していた。
        if (/RaceMark/i.test(u.pathname) || !prior) _raceListPreferredPage.set(key, u.pathname);
      }
    } catch(e) { _kvSwallow('fetchRaceList', e); }
  });
  const nos = [...new Set(links.map(a => {
    try {
      const u = new URL(a.href, 'https://www.keiba.go.jp');
      return parseInt(u.searchParams.get('k_raceNo'));
    } catch(e) { return NaN; }
  }).filter(n => !isNaN(n) && n >= 1 && n <= 12))].sort((a,b)=>a-b);

  // 発走時刻も同じページから抽出（レース行の<tr>内の HH:MM セル）→ 本日モードの動線に使用
  try {
    const timeMap = {};
    links.forEach(a => {
      let rn = NaN;
      try { rn = parseInt(new URL(a.href, 'https://www.keiba.go.jp').searchParams.get('k_raceNo')); } catch(e) { _kvSwallow('fetchRaceList#2', e); }
      if (isNaN(rn) || timeMap[rn]) return;
      const tr = a.closest('tr');
      if (!tr) return;
      for (const td of tr.querySelectorAll('td,th')) {
        const m = (td.textContent || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (m) { timeMap[rn] = `${m[1].padStart(2,'0')}:${m[2]}`; break; }
      }
    });
    if (Object.keys(timeMap).length) _kvSaveRaceTimes(raceDate, timeMap, babaCode);
  } catch(e) { console.warn('[fetchRaceList] 発走時刻パース失敗:', e); }

  if (nos.length > 0) {
    console.log(`[fetchRaceList] レース番号取得成功: ${nos.join(',')}`);
    return nos;
  }

  // リンクが見つからない場合 → 開催なしか確認
  const bodyText = (doc.body?.textContent||'').replace(/\s+/g,' ');
  const BABA_NAMES = ['帯広','盛岡','水沢','浦和','船橋','大井','川崎','金沢','笠松','名古屋','園田','姫路','高知','佐賀'];
  if (!BABA_NAMES.some(n => bodyText.includes(n))) {
    console.log(`[fetchRaceList] 開催情報なし`);
    return { notFound: true };
  }
  return [];
}

/**
 * 指定日に対象競馬場の開催があるかRaceListで確認する
 * 戻り値: { exists: bool, raceNos: [] }
 */
async function checkRaceListExists(raceDate, babaCode) {
  const result = await fetchRaceList(raceDate, babaCode);
  if (Array.isArray(result) && result.length > 0) return { exists: true, raceNos: result };
  if (result && result.notFound) return { exists: false, raceNos: [] };
  return { exists: null, raceNos: [] }; // 不明（通信失敗）
}

// ══════════════ 本日モード＆発走時刻（2026-07-10）══════════════
// 開催日当日はアプリ起動時に本日の出馬表へ直行し、発走時刻から「次のレース」を
// 自動選択・タブにハイライト表示する。時刻はRaceListページから副次取得（localStorage保持・14日で破棄）。
const KV_RACETIMES_KEY = 'kv_raceTimes';
function _kvReadRaceTimes() { try { return JSON.parse(localStorage.getItem(KV_RACETIMES_KEY) || '{}'); } catch (e) { return {}; } }
function _kvRaceTimeKey(dateYmd, babaCode) { return `${String(babaCode || currentBaba || '31')}|${dateYmd}`; }
function _kvSaveRaceTimes(dateYmd, map, babaCode) {
  const all = _kvReadRaceTimes();
  const key = _kvRaceTimeKey(dateYmd, babaCode);
  all[key] = Object.assign(all[key] || {}, map);
  const lim = new Date(); lim.setDate(lim.getDate() - 14);
  const limStr = `${lim.getFullYear()}/${String(lim.getMonth() + 1).padStart(2, '0')}/${String(lim.getDate()).padStart(2, '0')}`;
  Object.keys(all).forEach(k => { const d = k.includes('|') ? k.slice(k.indexOf('|') + 1) : k; if (d < limStr) delete all[k]; });
  try { localStorage.setItem(KV_RACETIMES_KEY, JSON.stringify(all)); } catch (e) { _kvSwallow('_kvSaveRaceTimes', e); }
  try { _kvDecorateRaceTabs(); } catch (e) { _kvSwallow('_kvSaveRaceTimes#2', e); }
}
function _kvGetRaceTime(dateYmd, raceNo, babaCode) {
  const all = _kvReadRaceTimes(), baba = String(babaCode || currentBaba || '31');
  const m = all[_kvRaceTimeKey(dateYmd, baba)] || (babaCode == null && baba === '31' ? all[dateYmd] : null);
  return m ? (m[raceNo] || '') : '';
}
function _kvTodayYmd() { const t = new Date(); return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}`; }

/** 「次のレース」＝発走時刻がまだ（2分後まで許容）の最初のレース。時刻不明なら結果未確定の最初のレース。当日以外はnull。 */
function _kvNextRaceNo() {
  const rns = Object.keys(allRacesData).map(Number).sort((a, b) => a - b);
  if (!rns.length) return null;
  const today = _kvTodayYmd();
  if (!rns.some(rn => allRacesData[rn]?.raceInfo?.raceDate === today)) return null;
  const allTimes = _kvReadRaceTimes();
  const times = allTimes[_kvRaceTimeKey(today, currentBaba)] || (String(currentBaba) === '31' ? allTimes[today] : null) || {};
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const rn of rns) {
    const tm = times[rn]; if (!tm) continue;
    const [h, m] = tm.split(':').map(Number);
    if (h * 60 + m + 2 >= nowMin) return rn;
  }
  const noResult = rn => !allRacesData[rn].horses.some(h => /^\d+$/.test(String(h.chakujun)));
  for (const rn of rns) { if (noResult(rn)) return rn; }
  return rns[rns.length - 1];
}

/** レースタブへ発走時刻チップ＋「次のレース」リングを付与（タブ再構築後・時刻取得後・毎分呼ばれる） */
function _kvDecorateRaceTabs() {
  const tabsEl = document.getElementById('race-tabs'); if (!tabsEl) return;
  const today = _kvTodayYmd();
  const next = _kvNextRaceNo();
  tabsEl.querySelectorAll('.race-tab').forEach(btn => {
    const rn = parseInt(btn.dataset.raceNo);
    const d = allRacesData[rn]; if (!d) return;
    const dateYmd = d.raceInfo?.raceDate || '';
    const tm = _kvGetRaceTime(dateYmd, rn);
    if (tm) {
      let chip = btn.querySelector('.race-tab-time');
      if (!chip) { chip = document.createElement('span'); chip.className = 'race-tab-sub race-tab-time'; btn.appendChild(chip); }
      chip.textContent = tm;
    }
    btn.classList.toggle('race-tab--next', dateYmd === today && rn === next);
  });
}
setInterval(() => { try { _kvDecorateRaceTabs(); } catch (e) { _kvSwallow('_kvDecorateRaceTabs', e); } }, 60000);

// ══════════════ 馬名・騎手 横断検索（2026-07-10）══════════════
// 保存済み全データ（IDBキャッシュ）から馬名/騎手名で過去出走を横断検索し、
// 該当レースへワンタップでジャンプする。閲覧者にも公開。
let _xsTimer = null;
function kvCrossSearchDebounced() { clearTimeout(_xsTimer); _xsTimer = setTimeout(kvCrossSearch, 250); }

function _xsKata(s) { return String(s || '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)); }
function _xsChaku(ch) {
  const n = parseInt(ch);
  const cls = isNaN(n) ? 'rf-x' : n === 1 ? 'rf-1' : n === 2 ? 'rf-2' : n === 3 ? 'rf-3' : 'rf-o';
  return `<span class="rf-chip ${cls}">${isNaN(n) ? '－' : n}</span>`;
}
/** 保存レースが存在すればその日をロードして該当レースを開く */
// 閲覧者は「直近1か月の開催のみ」出馬表を開けるが、横断検索の過去レースはこの範囲外にもヒットする。
// 従来は範囲外を開こうとするとalertで行き止まりだったため、horseNameが分かる場合は
// 全期間の成績を見られる馬モーダル(openHorseModal)へ誘導し、導線を活かす（管理者は従来通り開ける）。
async function kvJumpToRace(date, raceNo, horseName) {
  const key = `race_31_${date}_${raceNo}`;
  if (!lsRead()[key]) { alert(`${date} ${raceNo}R の保存データが見つかりません`); return; }
  if (!_kvViewerDateAllowed(date)) {
    if (horseName && typeof openHorseModal === 'function') { openHorseModal(horseName, parseInt(raceNo) || currentRaceNo || 1); return; }
    alert(_KV_PAST_HIDDEN_MSG);
    return;
  }
  await restoreFromSaved(date, '31');
  switchRaceTab(parseInt(raceNo));
}
function _xsRunRow(h, horseName) {
  const cls = h.raceClass || h._raceClass || '';
  const jumpArgs = `'${jsAttrEsc(h.raceDate)}',${parseInt(h.raceNo) || 0}${horseName ? `,'${jsAttrEsc(horseName)}'` : ''}`;
  return `<button type="button" class="xs-run" onclick="kvJumpToRace(${jumpArgs})" title="このレースを開く（公開期間外はこの馬の成績を表示）">
    <span class="xs-run-date">${escapeHTML((h.raceDate || '').slice(2))}</span>
    <span class="xs-run-no">${escapeHTML(h.raceNo)}R</span>
    ${_xsChaku(h.chakujun)}
    <span class="xs-run-meta">${escapeHTML(cls)}${h.distance ? ' ' + String(h.distance).replace(/[^\d]/g, '') + 'm' : ''}${h.time ? ' ' + escapeHTML(h.time) : ''}${h.jockey ? ' ' + escapeHTML(h.jockey) : ''}</span>
  </button>`;
}
async function kvCrossSearch() {
  const inp = document.getElementById('xs-input');
  const out = document.getElementById('xs-results');
  if (!inp || !out) return;
  const qRaw = inp.value.trim();
  if (qRaw.length < 2) { out.innerHTML = qRaw ? '<p class="xs-hint">2文字以上で検索します</p>' : ''; return; }
  if (!_idbFullReady) {
    out.innerHTML = '<p class="xs-hint"><i class="fas fa-spinner fa-spin"></i> 検索用の過去データを準備中です…</p>';
    try { await _ensureFullIDBCache(); } catch (e) {
      out.innerHTML = '<p class="xs-hint">過去データを準備できませんでした</p>'; return;
    }
    if (inp.value.trim() !== qRaw) return kvCrossSearch();
  }
  const qKata = _xsKata(qRaw);
  const lsData = lsRead();
  // データがまだ読み込み中（起動直後）→ 案内を出して読み込み完了後に自動で再検索
  if (Object.keys(lsData).length < 100) {
    out.innerHTML = '<p class="xs-hint"><i class="fas fa-spinner fa-spin"></i> データを読み込み中です…読み込みが終わると自動で検索します</p>';
    clearTimeout(_xsTimer);
    _xsTimer = setTimeout(kvCrossSearch, 1500);
    return;
  }

  // ── 馬名検索（索引の全馬名から部分一致・前方一致優先） ──
  let names = [];
  if (_horseKeyIndex) names = [..._horseKeyIndex.keys()];
  else names = [...new Set(Object.values(lsData).filter(v => v.type === 'horse' && v.horseName).map(v => v.horseName))];
  const horseHits = names.filter(n => n.includes(qKata) || n.includes(qRaw))
    .sort((a, b) => (b.startsWith(qKata) ? 1 : 0) - (a.startsWith(qKata) ? 1 : 0) || a.localeCompare(b))
    .slice(0, 8);

  // ── 騎手検索（馬エントリを走査して騎手ごとに集計） ──
  const jkMap = {};
  for (const v of Object.values(lsData)) {
    if (v.type !== 'horse' || !v.jockey) continue;
    if (!v.jockey.includes(qRaw)) continue;
    (jkMap[v.jockey] = jkMap[v.jockey] || []).push(v);
  }
  const jkHits = Object.entries(jkMap).sort((a, b) => b[1].length - a[1].length).slice(0, 4);

  if (!horseHits.length && !jkHits.length) { out.innerHTML = `<p class="xs-hint">「${escapeHTML(qRaw)}」に一致する馬・騎手が見つかりません</p>`; return; }

  let html = '';
  if (horseHits.length) {
    html += '<div class="xs-group-title"><i class="fas fa-horse"></i> 競走馬</div>';
    html += horseHits.map(name => {
      const hist = getHorseHistory(name);
      const last5 = hist.slice(0, 5).map(h => _xsChaku(h.chakujun)).join('');
      const latest = hist[0];
      return `<details class="xs-item">
        <summary class="xs-sum">
          <span class="xs-name">${escapeHTML(name)}</span>
          <span class="xs-chips">${last5 || '<span class="xs-hint">出走記録なし</span>'}</span>
          <span class="xs-meta">${hist.length}走${latest ? '・最新 ' + escapeHTML(latest.raceDate) : ''}</span>
        </summary>
        <div class="xs-runs">${hist.slice(0, 30).map(h => _xsRunRow(h, name)).join('') || '<p class="xs-hint">出走記録がありません</p>'}</div>
      </details>`;
    }).join('');
  }
  if (jkHits.length) {
    html += '<div class="xs-group-title"><i class="fas fa-user"></i> 騎手</div>';
    html += jkHits.map(([jk, rides]) => {
      const withRes = rides.filter(r => /^\d+$/.test(String(r.chakujun)));
      const n = withRes.length;
      const w = withRes.filter(r => parseInt(r.chakujun) === 1).length;
      const q2 = withRes.filter(r => parseInt(r.chakujun) <= 2).length;
      const p3 = withRes.filter(r => parseInt(r.chakujun) <= 3).length;
      const pct = x => n ? Math.round(100 * x / n) : 0;
      // 直近騎乗（キーから日付を復元してソート）
      const recent = rides.map(v => {
        const idx = [...(_horseKeyIndex?.get(v.horseName) || [])].find(k => lsData[k] === v) || '';
        const parts = idx.split('_');
        return { v, date: parts[1] || '', raceNo: parseInt(parts[2]) || 0 };
      }).filter(r => r.date).sort((a, b) => b.date.localeCompare(a.date) || b.raceNo - a.raceNo).slice(0, 20);
      return `<details class="xs-item">
        <summary class="xs-sum">
          <span class="xs-name">${escapeHTML(jk)}</span>
          <span class="xs-meta">${rides.length}騎乗</span>
          <span class="xs-meta">勝率${pct(w)}%・連対${pct(q2)}%・複勝${pct(p3)}%</span>
        </summary>
        <div class="xs-runs">${recent.map(r => `<button type="button" class="xs-run" onclick="kvJumpToRace('${jsAttrEsc(r.date)}',${r.raceNo},'${jsAttrEsc(r.v.horseName)}')" title="このレースを開く（公開期間外はこの馬の成績を表示）">
          <span class="xs-run-date">${escapeHTML(r.date.slice(2))}</span><span class="xs-run-no">${r.raceNo}R</span>
          ${_xsChaku(r.v.chakujun)}<span class="xs-run-meta">${escapeHTML(r.v.horseName)}</span>
        </button>`).join('') || '<p class="xs-hint">騎乗データなし</p>'}</div>
      </details>`;
    }).join('');
  }
  out.innerHTML = html;
}

/** 本日モード：開催日当日（保存データあり）は起動時に本日の出馬表へ直行し、次のレースを自動選択。1セッション1回。 */
let _kvTodayModeDone = false;
async function kvTodayMode() {
  if (_kvTodayModeDone) return;
  _kvTodayModeDone = true;
  try { if (sessionStorage.getItem('kv_todayJumped')) return; } catch (e) { _kvSwallow('kvTodayMode', e); }
  const today = _kvTodayYmd();
  // 本日の有無だけを調べるために全開催日のグループを組み立てない。
  const day = _raceDayIndex?.get(`31|${today}`);
  const hasToday = day
    ? [...day.values()].some(entry => entry.raceVal)
    : Object.values(lsRead()).some(v => v.type === 'race' && v.race_date === today && v.baba_code === '31');
  if (!hasToday) return; // 本日の保存データなし＝通常起動
  try { sessionStorage.setItem('kv_todayJumped', '1'); } catch (e) { _kvSwallow('kvTodayMode#2', e); }
  // まず保存済み出馬表を即表示する。RaceListは並行取得し、発走時刻が揃った後に
  // 「次のレース」だけ選び直すことで、時刻通信を初画面のブロッカーにしない。
  const raceListJob = !Object.keys(_kvReadRaceTimes()[today] || {}).length
    ? fetchRaceList(today, '31').catch(() => null)
    : Promise.resolve(null);
  await restoreFromSaved(today, '31', true);
  await raceListJob;
  const next = _kvNextRaceNo();
  if (next != null) switchRaceTab(next);
  const st = document.getElementById('save-status');
  if (st) { st.textContent = '📅 本日の開催を自動で開きました'; setTimeout(() => { st.textContent = ''; }, 4000); }
}

// ══════════════ 週間開催予定ダッシュボード ══════════════
// 「今週の開催予定」＝ 高知(babaCode=31)について今日から7日分をRaceListで軽量プローブし、
// 開催日をワンクリックで検索フォームに反映できるようにする。日1回分はlocalStorageにキャッシュ。
const WEEKLY_CACHE_KEY = 'kv_weeklySchedule';

function _weeklyDateList() {
  const out = [];
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(t); d.setDate(t.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ iso, ymd: iso.replace(/-/g, '/'), dow: DOW[d.getDay()], isToday: i === 0, md: `${d.getMonth() + 1}/${d.getDate()}` });
  }
  return out;
}

async function loadWeeklySchedule(force) {
  const bodyEl = document.getElementById('weekly-schedule-body');
  if (!bodyEl) return;
  const days = _weeklyDateList();
  const todayIso = days[0].iso;

  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(WEEKLY_CACHE_KEY) || 'null');
      if (cached && cached.baseDate === todayIso && Array.isArray(cached.days) && cached.days.length === 7) {
        renderWeeklySchedule(cached.days);
        return;
      }
    } catch (e) { _kvSwallow('loadWeeklySchedule', e); }
  }

  bodyEl.innerHTML = '<p style="color:#9ca3af;font-size:13px"><i class="fas fa-spinner fa-spin"></i> 高知の開催予定を確認中...</p>';

  const results = new Array(days.length).fill(null);
  const CONCURRENCY = 2, GAP = 500;
  for (let i = 0; i < days.length; i += CONCURRENCY) {
    const batch = days.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (day, j) => {
      const idx = i + j;
      try {
        const r = await checkRaceListExists(day.ymd, '31');
        results[idx] = { ...day, exists: r.exists, raceCount: r.raceNos.length };
      } catch (e) {
        results[idx] = { ...day, exists: null, raceCount: 0 };
      }
    }));
    if (i + CONCURRENCY < days.length) await new Promise(r => setTimeout(r, GAP));
  }

  try { localStorage.setItem(WEEKLY_CACHE_KEY, JSON.stringify({ baseDate: todayIso, days: results })); } catch (e) { _kvSwallow('loadWeeklySchedule#2', e); }
  renderWeeklySchedule(results);
}

function renderWeeklySchedule(days) {
  const bodyEl = document.getElementById('weekly-schedule-body');
  if (!bodyEl) return;

  const chips = days.map(d => {
    let cls = 'week-chip', status = '－', clickable = false;
    if (d.exists === true && d.raceCount > 0) { cls += ' week-chip--scheduled'; status = `${d.raceCount}R`; clickable = true; }
    else if (d.exists === true) { cls += ' week-chip--pending'; status = '開催予定'; clickable = true; }
    else { cls += ' week-chip--empty'; status = d.exists === false ? '－' : '不明'; }
    if (d.isToday) cls += ' week-chip--today';
    const onclick = clickable ? ` onclick="_selectWeeklyDay('${d.ymd}')"` : '';
    return `<div class="${cls}"${onclick} title="${d.md}(${d.dow})${clickable ? ' クリックで検索' : ''}">
      <div class="week-chip-dow">${d.isToday ? '本日' : d.dow + '曜'}</div>
      <div class="week-chip-date">${d.md}</div>
      <div class="week-chip-status">${status}</div>
    </div>`;
  }).join('');

  const nearest = days.find(d => d.exists === true && d.raceCount > 0);

  bodyEl.innerHTML = `
    <div class="week-strip">${chips}</div>
    ${nearest ? `
    <details style="margin-top:12px" ontoggle="if(this.open) _loadWeeklyJockeyChanges('${nearest.ymd}', ${nearest.raceCount}, this.querySelector('.wjc-body'))">
      <summary style="cursor:pointer;color:#6b7280;font-size:12px;font-weight:600">🔁 ${nearest.isToday ? '本日' : nearest.md}の注目の乗り替わりをチェック</summary>
      <div class="wjc-body" style="margin-top:8px;font-size:12px;color:#6b7280">タップして読み込み...</div>
    </details>` : '<p style="color:#9ca3af;font-size:12px;margin-top:10px">今後7日間で確認できた開催予定はありません。</p>'}
  `;
}

function _selectWeeklyDay(ymd) {
  document.getElementById('race-date').value = ymd.replace(/\//g, '-');
  document.getElementById('baba-code').value = '31';
  fetchAllRaces();
}

// 直近の開催日について、出馬表の騎手と各馬の前走騎手を比較し、乗り替わり幅（勝率差）が大きいものを抽出
async function _loadWeeklyJockeyChanges(ymd, raceCount, targetEl) {
  if (!targetEl || targetEl.dataset.loaded) return;
  targetEl.dataset.loaded = '1';
  targetEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 出馬表を確認中...';

  // 騎手統計はAI・分析モジュール側にある。ユーザーが詳細を開いた時だけ全履歴と一緒に準備する。
  try { await _ensureRaceIntelligence(); } catch (e) {
    targetEl.innerHTML = '騎手統計を準備できませんでした。';
    return;
  }

  const targets = Array.from({ length: Math.min(raceCount, 12) }, (_, i) => i + 1);
  const found = [];
  const jwr = name => { const s = lookupJockeyStats(name); if (!s) return 12; const src = (s.recent?.n >= 30 ? s.recent : null) || s.all; return src?.wr ?? 12; };
  const CONCURRENCY = 2, GAP = 500;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (rn) => {
      try {
        const result = await fetchOneRace(ymd, rn, '31');
        if (!result || !result.horses) return;
        for (const h of result.horses) {
          const hName = h.horseName || '';
          const curJockey = (h.jockey || '').trim();
          if (!hName || !curJockey) continue;
          const hist = getHorseHistory(hName);
          if (!hist.length) continue;
          const prevJockey = (hist[0].jockey || '').trim();
          if (!prevJockey || prevJockey === curJockey) continue;
          const diff = jwr(curJockey) - jwr(prevJockey);
          if (Math.abs(diff) >= 5) found.push({ raceNo: rn, hName, prevJockey, curJockey, diff });
        }
      } catch (e) { _kvSwallow('_loadWeeklyJockeyChanges', e); }
    }));
    if (i + CONCURRENCY < targets.length) await new Promise(r => setTimeout(r, GAP));
  }

  if (!targetEl.isConnected) return; // details が閉じてDOMから外れた場合は描画しない
  if (!found.length) {
    targetEl.innerHTML = '大きな乗り替わりは見つかりませんでした。';
    return;
  }
  found.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  targetEl.innerHTML = found.slice(0, 10).map(f => {
    const color = f.diff > 0 ? '#15803d' : '#dc2626';
    const arrow = f.diff > 0 ? '↑' : '↓';
    return `<div style="padding:4px 0;border-bottom:1px solid #f0f0f0">
      <strong>${f.raceNo}R ${f.hName}</strong>
      <span style="color:#9ca3af">　${f.prevJockey}→${f.curJockey}</span>
      <span style="color:${color};font-weight:700;margin-left:4px">${arrow}${Math.abs(f.diff).toFixed(1)}</span>
    </div>`;
  }).join('');
}

async function fetchOneRace(raceDate, raceNo, babaCode) {
  const today = new Date(); today.setHours(0,0,0,0);
  const raceDateObj = new Date(raceDate.replace(/\//g,'-')); raceDateObj.setHours(0,0,0,0);
  // 厳密に「明日以降」だけ未来扱い — 当日の終了済みレースも結果を取りに行く
  const isFuture = raceDateObj > today;
  const listedPage = _raceListPreferredPage.get(`${raceDate}|${babaCode}|${raceNo}`) || '';

  // RaceListが出馬表を指している未発走レースは、存在しない結果ページを先に取りに行かない。
  if (listedPage.includes('/DebaTable')) {
    const listed = await fetchDebaTableRace(raceDate, raceNo, babaCode);
    if (listed) { listed.raceInfo._isDebaFallback = !isFuture; listed.raceInfo._isDebaTable = true; }
    return listed;
  }

  if (!isFuture) {
    // 今日・過去 → 競走成績（RaceMarkTable）を並行プロキシで試みる
    const urlMark = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable?k_raceDate=${encodeURIComponent(raceDate)}&k_raceNo=${raceNo}&k_babaCode=${babaCode}`;
    try {
      const html = await fetchHtmlWithProxy(urlMark, 12000);
      const parsed = parseRaceMarkTable(html, raceDate, raceNo, babaCode);
      if (parsed && parsed.horses.length > 0) {
        // 着順データがあれば確定レース結果として返す
        const hasResults = parsed.horses.some(h => h.chakujun && h.chakujun !== '');
        if (hasResults) return parsed;
        // 着順なし = まだ未実施 → DebaTableにフォールバック
      }
    } catch(e) {
      console.log(`[fetch] ${raceNo}R: RaceMarkTable失敗 → DebaTableへ`, e.message);
    }
  }

  // 未来 / RaceMarkTable失敗 / 着順なし → 出馬表（DebaTable）
  const result = await fetchDebaTableRace(raceDate, raceNo, babaCode);
  if (result) {
    result.raceInfo._isDebaFallback = !isFuture; // 過去なのに結果取れなかった場合
    result.raceInfo._isDebaTable    = isFuture;  // 未来レース = 出馬表のみ
    return result;
  }
  return null;
}

// ============================================================
// rowspan/colspanを考慮してテーブルを完全グリッドに展開するヘルパー
// 戻り値: [ [cell, cell, ...], ... ]  各cellは実際のTD/TH要素
// rowspanで結合されたセルは後続行にも同じ要素を再配置する
// ============================================================
function expandTableGrid(table) {
  const grid = [];
  const pending = {}; // { colIdx: { cell, remaining } }
  for (const tr of table.querySelectorAll(':scope > tbody > tr, :scope > tr, :scope > thead > tr, :scope > tfoot > tr')) {
    const row = [];
    let cellIdx = 0;
    let colIdx  = 0;
    const domCells = Array.from(tr.querySelectorAll(':scope > td, :scope > th'));
    while (cellIdx < domCells.length || Object.keys(pending).some(k => parseInt(k) >= colIdx)) {
      if (pending[colIdx]) {
        // 前の行からの rowspan セルを挿入
        row.push(pending[colIdx].cell);
        pending[colIdx].remaining--;
        if (pending[colIdx].remaining <= 0) delete pending[colIdx];
        colIdx++;
      } else if (cellIdx < domCells.length) {
        const cell = domCells[cellIdx++];
        const rs = Math.max(1, parseInt(cell.getAttribute('rowspan')) || 1);
        const cs = Math.max(1, parseInt(cell.getAttribute('colspan')) || 1);
        for (let c = 0; c < cs; c++) {
          row.push(cell);
          if (rs > 1) {
            pending[colIdx + c] = { cell, remaining: rs - 1 };
          }
        }
        colIdx += cs;
      } else {
        break;
      }
    }
    if (row.length > 0) grid.push(row);
  }
  return grid;
}

// ============================================================
// DebaTable パーサー（出馬表のみ・未来レース用）
// 列構成: [0]枠 [1]馬番 [2]馬名 [3]所属 [4]性齢 [5]斤量 [6]騎手 [7]調教師 [8]馬体重
// ============================================================
function parseDebaTable(html, raceDate, raceNo, babaCode) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g,' ');
  let raceName = `第${raceNo}レース`, distance = '', raceClass = '', trackCond = '';
  for (const pat of [/[ダ芝障][右左内外]?\s*\d{3,4}\s*[mMｍ]/,/[ダ芝障][ーート]?\s*\d{3,4}\s*[mMｍ]/,/\d{3,4}\s*[mMｍ]/]) {
    const m = bodyText.match(pat); if (m) { distance = m[0].replace(/\s/g,''); break; }
  }
  for (const pat of [/馬場状態\s*[：:]\s*(良|稍重|重|不良)/,/馬場\s*[：:]\s*(良|稍重|重|不良)/,/[\[(（](良|稍重|重|不良)[）)\]]/,/\s(良|稍重|重|不良)\s/]) {
    const m = bodyText.match(pat); if (m && m[1]) { trackCond = m[1]; break; }
  }
  const NG = ['地方競馬情報サイト','競馬情報','出馬表','競走成績','DebaTable','keiba.go.jp'];
  for (const tag of ['h2','h3','h4','h1']) {
    for (const el of doc.querySelectorAll(tag)) {
      const t = el.textContent.replace(/\s+/g,' ').trim();
      if (t.length > 1 && t.length < 60 && !NG.some(ng => t.includes(ng)) && !/^\d+R/.test(t)) { raceName = t; break; }
    }
    if (raceName !== `第${raceNo}レース`) break;
  }
  if (raceName === `第${raceNo}レース`) {
    const tt = doc.querySelector('title')?.textContent.replace(/\s+/g,' ').trim() || '';
    if (!NG.some(ng => tt === ng) && tt.length > 1 && tt.length < 60) raceName = tt;
  }
  raceClass = detectRaceClass(raceName);

  // テーブル選択（rowspan展開後のグリッドで枠+馬番パターンを検出）
  const tables = doc.querySelectorAll('table');
  let bestTable = null, maxRows = 0;
  for (const tbl of tables) {
    const g = expandTableGrid(tbl);
    let cnt = 0;
    for (const row of g) {
      if (row.length < 5) continue;
      if (/^\s*[1-8]\s*$/.test(row[0]?.textContent||'') && /^\s*\d+\s*$/.test(row[1]?.textContent||'')) cnt++;
    }
    if (cnt > maxRows) { maxRows = cnt; bestTable = tbl; }
  }
  if (!bestTable || maxRows === 0) return null;

  // rowspan展開グリッドを使用
  const grid = expandTableGrid(bestTable);

  // ヘッダー列マッピング（先頭行から検出）
  // 実際のkeiba.go.jp DebaTable構造：[0]枠番 [1]馬番 [2-4]競走馬(馬名/colspan) [5]騎手・調教師(騎手のみ掲載)
  //   [6]オッズ・馬体重(前売りオッズ+人気/馬体重は直前) [7]着別成績(戦績) [8-12]近5走。
  //   ※所属・性齢・斤量・調教師は出馬表には個別掲載がないため、専用列がある時だけ採用し無ければ空欄にする。
  const hTexts = (grid[0]||[]).map(cell => (cell?.textContent||'').replace(/\s+/g,''));
  const col = { waku:0, umaBan:1, umaName:2, sexAge:-1, kinryo:-1, jockey:5, trainer:-1, oddsW:6 };
  if (hTexts.length >= 5) {
    let _nameSet = false;   // 「競走馬」はcolspan=3でヘッダーが重複するため最初の列だけ採用（性齢はこの列に来る）
    hTexts.forEach((t,i) => {
      if (/^枠/.test(t)) col.waku=i;
      else if (/馬番/.test(t)) col.umaBan=i;
      else if (/競走馬|^馬名/.test(t)) { if (!_nameSet) { col.umaName=i; _nameSet=true; } }
      else if (/性齢/.test(t)) col.sexAge=i;
      else if (/斤量|負担/.test(t)) col.kinryo=i;
      else if (/騎手/.test(t)) col.jockey=i;                 // 「騎手・調教師」列（騎手を採用）
      else if (/調教師/.test(t)) col.trainer=i;              // 調教師単独列がある時だけ
      else if (/オッズ|馬体重|体重/.test(t)) col.oddsW=i;     // 「オッズ馬体重変更情報」列
    });
  }

  // 各馬は縦5行ブロック（rowspanで枠/馬番/オッズ列が結合）。行の役割：
  //   [0]馬名/騎手 [1]性齢/負担重量(斤量)+騎乗成績/馬体重 [2]父名/調教師 [3]母名/馬主 [4]母父/生産牧場
  //   斤量・調教師・性齢はブロックの2・3行目にあるので、先頭行だけでなくブロック全体を読む。
  const horses = [];
  const seenUmaBan = new Set();
  const _txt = (r, idx) => (!r || idx<0 || idx>=r.length) ? '' : (r[idx]?.textContent||'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();
  const _linkTxt = (r, idx) => { const a = r?.[idx]?.querySelector?.('a'); return a ? a.textContent.replace(/\s+/g,'').trim() : ''; };
  for (let ri = 0; ri < grid.length; ri++) {
    const row = grid[ri];
    if (!row || row.length < 5) continue;
    const wk = _txt(row, col.waku).replace(/\s/g,''), ub = _txt(row, col.umaBan).replace(/\s/g,'');
    if (!/^[1-8]$/.test(wk) || !/^\d+$/.test(ub)) continue;
    const umaBan = parseInt(ub);
    // 馬番は縦ブロックでrowspan結合され全行に繰り返される→同じ馬番の初出＝馬の先頭行、以降は下段(性齢/父母)。
    // ※以前は名前リンクのclass/hrefで先頭行判定していたが、一部CORSプロキシがhref/classを書き換えると
    //   全行で名前リンクが消え「0頭」になっていた。馬番ベースなら書き換えに強い。
    if (isNaN(umaBan) || seenUmaBan.has(umaBan)) continue;
    seenUmaBan.add(umaBan);   // 初出で即登録＝以降の同馬番(下段)行は必ずスキップ（父母名を馬名と誤認しない）
    const wakuBan = wk;
    const horseName = _linkTxt(row, col.umaName) || _txt(row, col.umaName).split(' ')[0];
    if (!horseName || horseName.length < 2 || /^\d+$/.test(horseName) || /^(牡|牝|騸|セン|セ)\d/.test(horseName)) continue;
    // ブロック収集：以降、馬番が同じ連続行（次の馬番になったら終了）
    const block = [row];
    for (let rj = ri+1; rj < grid.length; rj++) { const nr = grid[rj]; if (!nr || _txt(nr, col.umaBan).replace(/\s/g,'') !== ub) break; block.push(nr); }
    const b = k => block[k] || null;
    const debaLineage = ((row[col.umaName]?.querySelector?.('a')?.getAttribute?.('href')||'').match(/k_lineageLoginCode=(\d+)/)||['',''])[1];

    // 騎手：先頭行の騎手・調教師列（1行目＝騎手名。所属カッコ・印を除去）
    const jkA = row[col.jockey]?.querySelector?.('a');
    let jockey = ((jkA?.textContent) || _txt(row, col.jockey)).replace(/[（(][^）)]*[）)]/g,'').replace(/^[△▲☆★◇◆○◎▽▼]+/,'').replace(/\s/g,'').trim();

    // 性齢：ブロック2行目のcol.umaName（例「牡7」「セン7」）。騸馬は「セン」の2文字表記
    let sexAge = ''; { const m = _txt(b(1), col.umaName).match(/(牡|牝|騸|セン|セ)\s*(\d{1,2})/); if (m) sexAge = m[1] + m[2]; }

    // 斤量(負担重量)：ブロック2行目の騎手・調教師列の先頭数値（例「57.0 0-1-0-1」→57.0）
    let kinryo = ''; { const m = _txt(b(1), col.jockey).match(/(\d{2}(?:\.\d)?)/); if (m && +m[1] >= 40 && +m[1] <= 75) kinryo = m[1]; }

    // 調教師：ブロック3行目の騎手・調教師列（例「國澤輝（高知）」）。所属除去・数値/戦績形式は拒否
    let trainer = ''; { const trA = b(2)?.[col.jockey]?.querySelector?.('a');
      trainer = ((trA?.textContent) || _txt(b(2), col.jockey)).replace(/[（(][^）)]*[）)]/g,'').replace(/\s/g,'').trim();
      if (/[全左右場距]\d|\d-\d|^\d/.test(trainer)) trainer = ''; }

    // オッズ・人気：先頭行のオッズ列（例「17.3 (6人気)」）
    let odds='', ninki=''; { const ow = _txt(row, col.oddsW).replace(/\s/g,'');
      const om = ow.match(/(\d{1,4}\.\d)/); if (om) odds = om[1];
      const nm = ow.match(/[(（](\d+)人気[)）]/); if (nm) ninki = nm[1]; }
    // 馬体重：ブロック内オッズ列に妥当な体重(300〜700・任意の増減)が出た時だけ。無ければ空欄（オッズ混入防止）
    let weight=''; for (const br of block) { const m = _txt(br, col.oddsW).replace(/\s/g,'').match(/(\d{3,4})([(（][+\-]?\d+[)）])?/); if (m && +m[1] >= 300 && +m[1] <= 700) { weight = m[1] + (m[2]||''); break; } }

    const savedKey  = `${babaCode}_${raceDate}_${raceNo}_${umaBan}`;
    const savedPace = getSavedHorsePace(savedKey);
    horses.push({
      chakujun:'', wakuBan, umaBan, horseName, belong:'', sexAge, kinryo,
      jockey, trainer, weight, ninki, odds, time:'', diff:'', agari3f:'', corner:'',
      lineageLoginCode: debaLineage,
      first3f:         savedPace?.first3f         || '',
      paceType:        savedPace?.paceType        || '',
      paceTypeAuto:    savedPace?.paceTypeAuto    || '',
      paceDevAuto:     savedPace?.paceDevAuto     ?? null,
      mukaeShoumen:    savedPace?.mukaeShoumen    || '',
      shoumenStraight: savedPace?.shoumenStraight || '',
      _isDebaTable: true,
    });
  }
  if (!horses.length) return null;
  const raceKey   = `race_${babaCode}_${raceDate}_${raceNo}`;
  const savedRace = getSavedRacePace(raceKey);
  return {
    raceInfo: {
      raceDate, raceNo, babaCode, raceName, distance, raceClass, trackCond,
      first3f:       savedRace?.first3f       || '',
      first3fSource: savedRace?.first3fSource || '',
      agari4f:       savedRace?.agari4f       || '',
      agari3f_race:  savedRace?.agari3f_race  || '',
      paceType:     savedRace?.paceType     || '',
      manualPace:   !!(savedRace?.paceType),
      memo:         savedRace?.memo         || '',
      _isDebaTable: true,
    },
    horses,
  };
}

async function fetchDebaTableRace(raceDate, raceNo, babaCode) {
  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/DebaTable?k_raceDate=${encodeURIComponent(raceDate)}&k_raceNo=${raceNo}&k_babaCode=${babaCode}`;
  try {
    const html = await fetchHtmlWithProxy(url, 12000);
    const parsed = parseDebaTable(html, raceDate, raceNo, babaCode);
    if (parsed && parsed.horses.length > 0) return parsed;
  } catch(e) { _kvSwallow('fetchDebaTableRace', e); }
  return null;
}

async function fetchDebaTableSingle(raceDate, raceNo, babaCode) {
  const newDate = raceDate.replace(/-/g,'/');
  if (!_kvViewerDateAllowed(newDate)) { alert(_KV_PAST_HIDDEN_MSG); return; }
  if (newDate !== currentDate || babaCode !== currentBaba) { allRacesData = {}; clearRaceTabs(); }
  currentDate = newDate; currentBaba = babaCode;
  showLoading(true); hideError();
  const result = await fetchDebaTableRace(currentDate, raceNo, babaCode);
  showLoading(false);
  if (!result) { showError(`DebaTable ${raceNo}R の出馬表取得に失敗しました（CORSプロキシが全滅している可能性があります）`); return; }
  _sanDeep(result);
  if (allRacesData[raceNo]) result.horses = mergeHorseData(allRacesData[raceNo].horses, result.horses);
  allRacesData[raceNo] = result;
  addRaceTab(raceNo); switchRaceTab(raceNo);
  switchPage('deban');
}

function parseRaceMarkTable(html, raceDate, raceNo, babaCode) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let raceName = `第${raceNo}レース`, distance = '', raceClass = '', trackCond = '';
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g,' ');
  for (const pat of [/[ダ芝障][右左内外]?\s*\d{3,4}\s*[mMｍ]/,/[ダ芝障][ーート]?\s*\d{3,4}\s*[mMｍ]/,/\d{3,4}\s*[mMｍ]/]) {
    const m = bodyText.match(pat); if (m) { distance = m[0].replace(/\s/g,''); break; }
  }
  for (const pat of [/馬場状態\s*[：:]\s*(良|稍重|重|不良)/,/馬場\s*[：:]\s*(良|稍重|重|不良)/,/状態\s*[：:]\s*(良|稍重|重|不良)/,/[\[(（](良|稍重|重|不良)[）)\]]/,/\s(良|稍重|重|不良)\s/,/(良|稍重|重|不良)/]) {
    const m = bodyText.match(pat); if (m && m[1]) { trackCond = m[1]; break; }
  }
  // レース名取得（NG_NAMESはサイト名等を除外）
  const NG = ['地方競馬情報サイト','競馬情報','出馬表','競走成績','RaceMarkTable','keiba.go.jp'];
  for (const tag of ['h2','h3','h4','h1']) {
    for (const el of doc.querySelectorAll(tag)) {
      const t = el.textContent.replace(/\s+/g,' ').trim();
      if (t.length > 1 && t.length < 60 && !NG.some(ng => t.includes(ng)) && !/^\d+R/.test(t)) { raceName = t; break; }
    }
    if (raceName !== `第${raceNo}レース`) break;
  }
  if (raceName === `第${raceNo}レース`) {
    const tt = doc.querySelector('title')?.textContent.replace(/\s+/g,' ').trim() || '';
    if (!NG.some(ng => tt === ng) && tt.length > 1 && tt.length < 60) raceName = tt;
  }
  // クラス判定はレース名確定後にレース名のみを対象に行う（bodyText全体だとナビの「重賞」に誤マッチ）
  raceClass = detectRaceClass(raceName);
  if (!raceClass) {
    // レース名で取れない場合、h1〜h4 見出し要素のみ試す
    for (const tag of ['h1','h2','h3','h4']) {
      for (const el of doc.querySelectorAll(tag)) {
        const t = el.textContent.replace(/\s+/g,' ').trim();
        if (t.length >= 2 && t.length <= 60) { const c = detectRaceClass(t); if (c) { raceClass = c; break; } }
      }
      if (raceClass) break;
    }
  }
  // テーブル選択（rowspan展開後のグリッドで検出）
  const tables = doc.querySelectorAll('table');
  let bestTable = null, maxRows = 0;
  for (const tbl of tables) {
    const g = expandTableGrid(tbl);
    let cnt = 0;
    for (const row of g) {
      if (row.length < 5) continue;
      const t0=row[0]?.textContent||'', t1=row[1]?.textContent||'', t2=row[2]?.textContent||'';
      const patA = /^\s*[1-8]\s*$/.test(t0) && /^\s*\d+\s*$/.test(t1);
      const patB = /^\s*\d{1,2}\s*$/.test(t0) && /^\s*[1-8]\s*$/.test(t1) && /^\s*\d+\s*$/.test(t2);
      if (patA || patB) cnt++;
    }
    if (cnt > maxRows) { maxRows = cnt; bestTable = tbl; }
  }
  if (!bestTable || maxRows === 0) return null;
  // rowspan展開グリッド
  const raceGrid = expandTableGrid(bestTable);
  const hTexts = (raceGrid[0]||[]).map(cell => (cell?.textContent||'').replace(/\s+/g,''));
  const hasChakujun = hTexts.some(t => /^着順$/.test(t));
  const col = { chakujun:-1, waku:0, umaBan:1, umaName:2, belong:3, sexAge:4, kinryo:5, jockey:6, trainer:7, weight:8, time:9, diff:10, agari3f:11, corner:12, ninki:13, odds:14 };
  if (hasChakujun) { col.chakujun=0;col.waku=1;col.umaBan=2;col.umaName=3;col.belong=4;col.sexAge=5;col.kinryo=6;col.jockey=7;col.trainer=8;col.weight=9;col.time=10;col.diff=11;col.agari3f=12;col.corner=13;col.ninki=14;col.odds=15; }
  if (hTexts.length >= 5) hTexts.forEach((t,i) => {
    if (/^着順$/.test(t)) col.chakujun=i;
    else if (/^枠$/.test(t)) col.waku=i;
    else if (/^馬番$/.test(t)) col.umaBan=i;
    else if (/^馬名$/.test(t)) col.umaName=i;
    else if (/所属/.test(t)&&i<=5) col.belong=i;
    else if (/性齢/.test(t)) col.sexAge=i;
    else if (/斤量|負担/.test(t)) col.kinryo=i;
    else if (/騎手/.test(t)) col.jockey=i;
    else if (/調教師/.test(t)) col.trainer=i;
    else if (/馬体重|体重/.test(t)) col.weight=i;
    else if (/タイム/.test(t)) col.time=i;
    else if (/^差$|^着差$/.test(t)) col.diff=i;
    else if (/上がり|後3F/.test(t)) col.agari3f=i;
    else if (/コーナー|通過/.test(t)) col.corner=i;
    else if (/人気/.test(t)) col.ninki=i;
    else if (/単勝|オッズ/.test(t)) col.odds=i;
  });
  // ── 上がりタイム自動抽出 ──────────────────────────────────────
  let autoAgari3f = '';
  let autoAgari4f = '';
  // ── パターン0（最優先）: 「上がりタイム」専用テーブル ──
  // keiba.go.jp 成績ページ下部: ヘッダー行=[空,4F,3F] / データ行=[上がりタイム,51.1,38.9]
  for (const _tbl0 of doc.querySelectorAll('table')) {
    const _t0 = _tbl0.textContent.replace(/\s+/g,' ').trim();
    if (!/上がりタイム/.test(_t0)) continue;
    for (const _row0 of _tbl0.querySelectorAll('tr')) {
      const _cells0 = Array.from(_row0.querySelectorAll('th,td'));
      const _rowTxts = _cells0.map(c => c.textContent.replace(/\s+/g,''));
      if (!_rowTxts.some(t => /上がりタイム/.test(t))) continue;
      // ヘッダー行から4F/3Fの列インデックスを取得
      const _hRow = _tbl0.querySelector('tr');
      const _hdrs = _hRow ? Array.from(_hRow.querySelectorAll('th,td')).map(c=>c.textContent.replace(/\s+/g,'')) : [];
      const _c4f = _hdrs.findIndex(h => /^4F$/.test(h));
      const _c3f = _hdrs.findIndex(h => /^3F$/.test(h));
      if (_c4f >= 0 && _c4f < _cells0.length) { const _v=_cells0[_c4f].textContent.replace(/\s+/g,''); if(/^\d{2,3}\.\d$/.test(_v)) autoAgari4f=_v; }
      if (_c3f >= 0 && _c3f < _cells0.length) { const _v=_cells0[_c3f].textContent.replace(/\s+/g,''); if(/^\d{2}\.\d$/.test(_v)) autoAgari3f=_v; }
      // ヘッダー列取得できない場合: 数値セルを順番に拾う
      if (!autoAgari4f || !autoAgari3f) {
        const _agariIdx = _rowTxts.findIndex(t => /上がりタイム/.test(t));
        const _vals = _cells0.filter((_,i)=>i!==_agariIdx).map(c=>c.textContent.replace(/\s+/g,'')).filter(v=>/^\d{2,3}\.\d$/.test(v));
        if (!autoAgari4f && _vals[0] && parseFloat(_vals[0])>=44 && parseFloat(_vals[0])<=65) autoAgari4f=_vals[0];
        if (!autoAgari3f && _vals[1] && parseFloat(_vals[1])>=33 && parseFloat(_vals[1])<=45) autoAgari3f=_vals[1];
        if (!autoAgari3f && _vals[0] && parseFloat(_vals[0])>=33 && parseFloat(_vals[0])<=45) autoAgari3f=_vals[0];
      }
      if (autoAgari3f || autoAgari4f) break;
    }
    if (autoAgari3f || autoAgari4f) break;
  }
  // ── パターン1: ラベル正規表現 ──
  if (!autoAgari3f) { for (const _p of [/(?:後3F|上がり3F|上り3F|上がり3ハロン)[\s\uff1a:＝=]*(\d{2}\.\d)/,/後3ハロン[\s\uff1a:＝=]*(\d{2}\.\d)/]) { const _m=bodyText.match(_p); if(_m){autoAgari3f=_m[1];break;} } }
  if (!autoAgari4f) { for (const _p of [/(?:後4F|上がり4F|上り4F|上がり4ハロン)[\s\uff1a:＝=]*(\d{2,3}\.\d)/,/後4ハロン[\s\uff1a:＝=]*(\d{2,3}\.\d)/]) { const _m=bodyText.match(_p); if(_m){autoAgari4f=_m[1];break;} } }
  // ── パターン2: ラップテーブルから後ろ3・4区間の合計 ──
  if (!autoAgari3f) {
    for (const _tbl2 of doc.querySelectorAll('table')) {
      const _txt2 = _tbl2.textContent.replace(/\s+/g,' ');
      if (!/ラップ|Lap|lap|通過/.test(_txt2) && !/\d+\.\d.*\d+\.\d.*\d+\.\d/.test(_txt2)) continue;
      const _nums2 = _txt2.match(/(\d{2}\.\d)/g); if (!_nums2||_nums2.length<3) continue;
      const _fl2 = _nums2.map(parseFloat).filter(v=>v>=10&&v<=20);
      if (_fl2.length>=3) {
        const _a3=_fl2.slice(-3).reduce((s,v)=>s+v,0).toFixed(1);
        const _a4=_fl2.length>=4?_fl2.slice(-4).reduce((s,v)=>s+v,0).toFixed(1):'';
        if (parseFloat(_a3)>=33&&parseFloat(_a3)<=45) autoAgari3f=_a3;
        if (!autoAgari4f&&_a4&&parseFloat(_a4)>=44&&parseFloat(_a4)<=65) autoAgari4f=_a4;
        if (autoAgari3f) break;
      }
    }
  }
  const horses = [];
  const seenUmaBanR = new Set();
  for (const row of raceGrid) {
    if (row.length < 5) continue;
    const get = (idx) => (idx<0||idx>=row.length)?'':(row[idx]?.textContent||'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();
    const getLink = (idx) => { if(idx<0||idx>=row.length)return''; const a=row[idx]?.querySelector?.('a'); return a?a.textContent.replace(/\s+/g,'').trim():''; };
    const getHref = (idx) => { if(idx<0||idx>=row.length)return''; const a=row[idx]?.querySelector?.('a'); return a?a.getAttribute('href')||'':''; };
    if (!/^\s*[1-8]\s*$/.test(get(col.waku))) continue;
    if (!/^\s*\d+\s*$/.test(get(col.umaBan))) continue;
    const wakuBan = get(col.waku).replace(/\s/g,'');
    const umaBan = parseInt(get(col.umaBan)); if (isNaN(umaBan)) continue;
    if (seenUmaBanR.has(umaBan)) continue;
    seenUmaBanR.add(umaBan);
    const horseName = getLink(col.umaName)||get(col.umaName).split(' ')[0];
    if (!horseName||horseName.length<2||/^\d+$/.test(horseName)) continue;
    // 馬コード（lineageLoginCode）をhrefから抽出
    const horseHref = getHref(col.umaName);
    const lineageMatch = horseHref.match(/k_lineageLoginCode=(\d+)/);
    const lineageLoginCode = lineageMatch ? lineageMatch[1] : '';
    const belong = get(col.belong);
    const sexAge = get(col.sexAge);
    const kinryo = (get(col.kinryo).match(/(\d+\.?\d*)/)||['',''])[1];
    let jockey = getLink(col.jockey)||get(col.jockey);
    jockey = jockey.replace(/[（(][^）)]*[）)]/g,'').replace(/^[△▲☆★◇◆○◎▽▼]+/,'').replace(/\s/g,'').trim();
    let trainer = getLink(col.trainer)||get(col.trainer);
    trainer = trainer.replace(/[（(][^）)]*[）)]/g,'').replace(/\s/g,'').trim();
    const weightRaw = get(col.weight).replace(/\s/g,'');
    const weight = (weightRaw.match(/(\d{3,4}[(\（][+\-]?\d+[)\）]?)/) || [,''])[1] || weightRaw;
    const chakujun = col.chakujun>=0 ? get(col.chakujun).replace(/\s/g,'') : '';
    const ninki = get(col.ninki).replace(/\s/g,'');
    const oddsRaw = get(col.odds).replace(/\s/g,'').replace('倍','');
    const odds = (oddsRaw.match(/(\d+\.?\d*)/)||['',''])[1];
    const time=get(col.time).replace(/\s/g,''), diff=get(col.diff).replace(/\s/g,'');
    const agari3f=get(col.agari3f).replace(/\s/g,''), corner=get(col.corner).replace(/\s/g,'');
    const savedKey = `${babaCode}_${raceDate}_${raceNo}_${umaBan}`;
    const savedPace = getSavedHorsePace(savedKey);
    horses.push({ chakujun, wakuBan, umaBan, horseName, belong, sexAge, kinryo, jockey, trainer, weight, ninki, odds, time, diff, agari3f, corner,
      lineageLoginCode,
      first3f: savedPace?.first3f||'', paceType: savedPace?.paceType||'', paceTypeAuto: savedPace?.paceTypeAuto||'', paceDevAuto: savedPace?.paceDevAuto??null, mukaeShoumen: savedPace?.mukaeShoumen||'', shoumenStraight: savedPace?.shoumenStraight||'' });
  }
  // 除外・取消馬の前走タイム誤読対策: 距離から算出した現実的最短タイムを下回る馬のデータをクリア
  // keiba.go.jpの除外馬行は列ズレが発生し、人気→着順、前走タイム→タイム として誤読される
  {
    const _toSec=t=>{const m=t&&t.match(/(\d+):(\d+\.\d+)/);return m?(+m[1]*60+parseFloat(m[2])):0;};
    const _distM=parseInt((distance.match(/(\d{3,4})/)||[])[1])||0;
    if(_distM>0){
      const _minSec=_distM/1000*60; // 距離ごとの物理的最短（1000mあたり60秒 = 1400mなら1:24未満が除外対象）
      horses.forEach(h=>{if(h.time&&_toSec(h.time)<_minSec){h.time='';h.agari3f='';h.chakujun='';h.diff='';}});
    }
  }
  const savedRace = getSavedRacePace(`race_${babaCode}_${raceDate}_${raceNo}`);
  // パターン3: 着順1位の馬のagari3fをフォールバック
  if (!autoAgari3f) {
    const winner = horses.find(h => h.chakujun === '1');
    if (winner && winner.agari3f && /^\d{2}\.\d$/.test(winner.agari3f)) { autoAgari3f = winner.agari3f; }
  }
  // ── コーナー通過順位表（cornerPassTable）から近接度グループを抽出（表示専用・大玉③）──
  // 例: "3,5,2-9,(4,7),(6,8),1" の丸括弧内＝ほぼ同時通過。1着馬毎行の corner（ハイフン区切り順位）とは別データで、
  // 展開リプレイに「このコーナーでどの馬が団子だったか」の視覚的ヒントを足すためだけに使う。予想ロジックには使わない。
  const cornerGroups = {}; // { '1': [[4,7],[6,8]], '2': [...], ... }（キー=角番号・値=同時通過グループの馬番配列）
  const cpTbl = doc.querySelector('table.cornerPassTable');
  if (cpTbl) {
    const zh = s => s.replace(/[０-９（），]/g, c => '0123456789(),'['０１２３４５６７８９（），'.indexOf(c)]);
    for (const tr of cpTbl.querySelectorAll('tr')) {
      const cells = Array.from(tr.querySelectorAll('th,td')).map(c => c.textContent.replace(/\s+/g,''));
      if (cells.length < 2) continue;
      const stageM = zh(cells[0]).match(/^([1-4])/);
      if (!stageM) continue;
      const passStr = zh(cells[1]);
      const groups = [];
      passStr.replace(/\(([0-9,]+)\)/g, (_, g) => { const nums = g.split(',').map(n => parseInt(n)).filter(n => !isNaN(n)); if (nums.length >= 2) groups.push(nums); return ''; });
      if (groups.length) cornerGroups[stageM[1]] = groups;
    }
  }
  return { raceInfo: { raceDate, raceNo, babaCode, raceName, distance, raceClass, trackCond,
    first3f: savedRace?.first3f||'', first3fSource: savedRace?.first3fSource||'', agari4f: savedRace?.agari4f||autoAgari4f||'',
    agari3f_race: savedRace?.agari3f_race||autoAgari3f||'',
    paceType: savedRace?.paceType||'', manualPace: !!(savedRace?.paceType), memo: savedRace?.memo||'',
    cornerGroups }, horses };
}

function mergeHorseData(oldH, newH) {
  return newH.map(nh => {
    const oh = oldH.find(o => o.umaBan === nh.umaBan);
    if (oh) { nh.first3f=oh.first3f||nh.first3f; nh.paceType=oh.paceType||nh.paceType; nh.mukaeShoumen=oh.mukaeShoumen||nh.mukaeShoumen; nh.shoumenStraight=oh.shoumenStraight||nh.shoumenStraight; nh.postComment=oh.postComment||nh.postComment; }
    return nh;
  });
}

function clearRaceTabs() {
  document.getElementById('race-tabs').innerHTML='';
  const section=document.getElementById('race-tabs-section');
  section.classList.add('hidden'); section.classList.remove('sidebar-mode');
  const area=document.getElementById('race-content-area');
  area.classList.remove('sidebar-mode'); area.innerHTML='';
  const bar=document.getElementById('race-summary-bar');
  if(bar) bar.classList.remove('visible');
}
function addRaceTab(raceNo) {
  const tabsEl=document.getElementById('race-tabs'), section=document.getElementById('race-tabs-section');
  if (tabsEl.querySelector(`[data-race-no="${raceNo}"]`)) return;
  const btn=document.createElement('button'); btn.className='race-tab'; btn.dataset.raceNo=raceNo;
  const d=allRacesData[raceNo];
  const cls=d?.raceInfo?.raceClass||''; const dist=String(d?.raceInfo?.distance||'').replace(/[^\d]/g,'');
  btn.innerHTML=`${raceNo}R${cls?`<span class="race-tab-sub">${cls}</span>`:''}${dist?`<span class="race-tab-sub">${dist}m</span>`:''}`;
  btn.onclick=()=>switchRaceTab(raceNo);
  const before=Array.from(tabsEl.querySelectorAll('.race-tab')).find(b=>parseInt(b.dataset.raceNo)>raceNo);
  before?tabsEl.insertBefore(btn,before):tabsEl.appendChild(btn);
  section.classList.remove('hidden'); section.classList.add('sidebar-mode');
  document.getElementById('race-content-area').classList.add('sidebar-mode');
}
function rebuildAllTabs() { document.getElementById('race-tabs').innerHTML=''; Object.keys(allRacesData).map(Number).sort((a,b)=>a-b).forEach(addRaceTab); try{_kvDecorateRaceTabs();}catch(e){ _kvSwallow('rebuildAllTabs', e); } }
function switchRaceTab(raceNo) {
  currentRaceNo=raceNo;
  // 当日は、開いたレースと次レースだけを非同期で最新化する。全12Rの一斉取得は行わない。
  if (currentDate === _kvTodaySlash() && currentBaba === '31') {
    _kvRefreshTodayPriorityRaces(currentDate, currentBaba, raceNo).catch(e => console.warn('[today priority refresh]', e));
  }
  document.querySelectorAll('.race-tab').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.raceNo)===raceNo));
  _kvSyncRaceHash(raceNo);
  const area=document.getElementById('race-content-area');
  area.querySelectorAll('[data-race-section]').forEach(el=>el.style.display='none');
  const existing=document.getElementById(`race-section-${raceNo}`);
  if(existing){
    existing.style.display='';
    _updateCockpitRaceStatus(raceNo);
    updateRaceSummaryBar(raceNo);
    try{renderDebanBias();}catch(e){ _kvSwallow('switchRaceTab', e); }
    // 「AI予想」タブが表示中のレースに戻ってきた場合、共有DOM(AI予想ランキング)を
    // 他レースの枠へ移動済みのままにしないよう、このレース向けに再配置し直す
    // （移動済みだと表示が空白になるため）。renderPredictionPanelは再計算のみで
    // 予測ロジック自体は変更しない。
    try {
      const yv = document.getElementById(`view-yoso-${raceNo}`);
      if (yv && yv.style.display !== 'none') renderPredictionPanel(raceNo);
    } catch(e){ _kvSwallow('switchRaceTab#2', e); }
    return;
  }
  renderRaceContent(raceNo);
  _updateCockpitRaceStatus(raceNo);
  updateRaceSummaryBar(raceNo);
  try{renderDebanBias();}catch(e){ _kvSwallow('switchRaceTab#3', e); }
  // 新規レースは、直近このセッションで選んでいたサブタブがあればそれを復元する
  // （出馬表以外を見ていた場合、レースを進めるたびにタブを叩き直さずに済む）。
  if (_kvLastViewTab && _kvLastViewTab !== 'deban') {
    try {
      const btn = document.getElementById(`tab-btn-${_kvLastViewTab}-${raceNo}`);
      if (btn && getComputedStyle(btn).display !== 'none') switchViewTab(raceNo, _kvLastViewTab);
    } catch(e){ _kvSwallow('switchRaceTab#4', e); }
  }
}

// レース切替時にURLハッシュを更新（replace＝レース切替では履歴を積まない。
// 戻るボタンはページ単位の遷移に対応し、URLは常に現在のレースを指す＝共有・リロード用）
function _kvSyncRaceHash(raceNo) {
  try {
    if (!_navReady || _kvNavFromPop) return;
    if (_currentPage !== 'deban') return;
    if (typeof currentDate === 'undefined' || !currentDate || currentBaba !== '31') return;
    // 現在の履歴エントリが「別の日付」のものならreplaceしない
    // （日付切替時にrestoreFromSaved→switchRaceTabが先に走ると、前の日付のエントリを
    //   上書きしてしまい日付間の「戻る」が壊れるため。新しい日付のURLは直後の
    //   switchPage('deban')のpushStateが正しく積む）
    const _st = history.state;
    if (_st && _st.kvDate && _st.kvDate !== currentDate) return;
    history.replaceState({ kvPage: 'deban', kvDate: currentDate, kvRace: raceNo }, '', _kvHashFor(currentDate, raceNo));
  } catch(e) { _kvSwallow('_kvSyncRaceHash', e); }
}

function renderRaceContent(raceNo) {
  const data=allRacesData[raceNo]; if(!data)return;
  const {raceInfo,horses}=data;
  const area=document.getElementById('race-content-area');
  // ラッパーdivを作成（初回のみ。switchRaceTabで表示/非表示切り替え）
  const section=document.createElement('div');
  section.id=`race-section-${raceNo}`;
  section.dataset.raceSection='1';
  area.appendChild(section);
  const hCard=document.createElement('div'); hCard.className='race-header-card';
  const _movieUrl = buildMovieUrl(raceInfo.raceDate, raceNo, raceInfo.babaCode);
  const _hasMovie  = !!_movieUrl;
  const _hasReplay = horses.some(h => String(h.corner || '').indexOf('-') >= 0) && horses.some(h => parseInt(h.chakujun) >= 1);
  const _raceTime = (() => { try { return _kvGetRaceTime(raceInfo.raceDate, raceNo); } catch(e) { return null; } })();
  hCard.innerHTML=`
    <div class="cockpit-race-heading">
      <div class="cockpit-race-copy">
        <h2 class="race-name"><span class="cockpit-race-no">${raceNo}R</span> ${escapeHTML(raceInfo.raceName) || `第${raceNo}レース`}</h2>
        <div class="race-meta cockpit-race-meta">
          ${raceInfo.distance ? distanceBadgeHtml(raceInfo.distance) : ''}
          <span><i class="fas fa-horse"></i> ${horses.length}頭</span>
          ${raceInfo.trackCond?`<span class="track-cond-badge track-cond-${trackCondClass(raceInfo.trackCond)}"><i class="fas fa-cloud-rain"></i> ${escapeHTML(raceInfo.trackCond)}</span>`:''}
          ${raceInfo.raceClass?`<span class="race-class-badge ${raceClassCssClass(raceInfo.raceClass)}">${escapeHTML(raceInfo.raceClass)}</span>`:''}
          ${raceInfo._isDebaFallback
            ? `<span class="cockpit-provisional"><i class="fas fa-clock"></i> 結果取得待ち</span>`
            : raceInfo._isDebaTable
              ? `<span class="cockpit-provisional"><i class="fas fa-clock"></i> 発走前</span>` : ''}
        </div>
      </div>
      <div class="cockpit-race-time">
        <strong>${_raceTime ? `${_raceTime}発走` : '発走時刻未定'}</strong>
        ${_raceTime ? `<span class="race-countdown" data-cd-date="${raceInfo.raceDate}" data-cd-time="${_raceTime}" style="display:none"></span>` : ''}
        <div class="cockpit-race-actions">
          ${_hasReplay ? `<button class="btn-replay btn-sm" onclick="openRaceReplay(${raceNo})"><i class="fas fa-play"></i> 展開</button>` : ''}
          ${_hasMovie ? `<button id="movie-btn-${raceNo}" class="btn btn-movie btn-sm" onclick="toggleMoviePanel(${raceNo})"><i class="fas fa-video"></i> 映像</button>` : ''}
        </div>
      </div>
    </div>
    <!-- クイックスタッツ帯 -->
    <div class="race-quick-stats">
      <div class="rqs-item">
        <span class="rqs-label">1着タイム</span>
        <span class="rqs-val rqs-empty" id="rqs-time-${raceNo}">—</span>
      </div>
      <div class="rqs-item">
        <span class="rqs-label">前半3F</span>
        <span class="rqs-val rqs-empty" id="rqs-f3-${raceNo}">—</span>
      </div>
      <div class="rqs-item">
        <span class="rqs-label">上がり3F</span>
        <span class="rqs-val rqs-empty" id="rqs-ag-${raceNo}">—</span>
      </div>
      <div class="rqs-item">
        <span class="rqs-label">前後半差</span>
        <span class="rqs-val rqs-empty" id="rqs-diff-${raceNo}">—</span>
      </div>
      <div class="rqs-item">
        <span class="rqs-label">ペース</span>
        <span class="rqs-val rqs-empty" id="rqs-pace-${raceNo}">—</span>
      </div>
      <div class="rqs-item" title="前半3Fのクラス×馬場×距離基準との差。ハイ=−1.0秒以下（差し台頭）／スロー=+0.3秒以上（前残り）：1,212Rの結果統計由来">
        <span class="rqs-label">基準比</span>
        <span class="rqs-val rqs-empty" id="rqs-dev-${raceNo}">—</span>
      </div>
    </div>
    ${_hasMovie ? `
    <div id="movie-panel-${raceNo}" class="movie-panel" data-url="${_movieUrl}">
      <div class="movie-panel-head">
        <span><i class="fas fa-film"></i> ${raceInfo.raceDate} ${raceNo}R 映像</span>
        <span style="display:flex;align-items:center;gap:12px">
          <a href="${_movieUrl}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> 別タブで開く</a>
          <button class="movie-close-btn" onclick="toggleMoviePanel(${raceNo})" title="閉じる">✕</button>
        </span>
      </div>
      <div class="movie-iframe-wrap">
        <!-- iframe はボタン押下時に遅延挿入 -->
      </div>
    </div>` : ''}
    
    <!-- 管理者入力エリア（閲覧モードでは非表示） -->
    <div class="admin-input-wrap" id="admin-wrap-${raceNo}">
      <div class="admin-input-toggle-header" onclick="toggleAdminInputWrap(${raceNo})">
        <span><i class="fas fa-sliders-h" style="margin-right:6px;font-size:12px;"></i>📝 ペース入力エリア</span>
        <span class="admin-input-toggle-icon" id="admin-toggle-icon-${raceNo}">▾</span>
      </div>
      <div class="admin-input-body">

    <!-- ★ 改良版ペースパネル -->
    <div class="pace-panel" id="pace-panel-${raceNo}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h3 class="pace-panel-title" style="margin:0"><i class="fas fa-tachometer-alt"></i> レース全体ペース</h3>
        <div id="track-bias-inline-${raceNo}" style="flex:1;min-width:0;"></div>
      </div>

      <!-- 決着時計 + 前後半差 + ペース表示行 -->
      <div style="display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <!-- 決着時計カード -->
        <div style="background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;border-radius:10px;padding:10px 16px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:100px;">
          <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">決着時計</div>
          <div id="finish-time-${raceNo}" style="font-size:20px;font-weight:800;font-family:monospace;color:#fbbf24;">—</div>
          <div style="font-size:9px;color:#64748b;margin-top:1px;">1着タイム</div>
        </div>
        <!-- 入力フォームカード -->
        <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 14px;flex:1;min-width:280px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <div class="pace-input-group">
              <label style="font-size:10px;color:#6b7280;font-weight:700;letter-spacing:.04em;">前半3F（秒） <span id="first3f-source-${raceNo}">${_first3fSourceBadgeHtml(raceInfo.first3fSource, raceInfo.first3f)}</span></label>
              <input type="text" inputmode="decimal" id="race-first3f-${raceNo}" class="pace-input" placeholder="36.5" value="${raceInfo.first3f ? parseFloat(raceInfo.first3f).toFixed(1) : ''}" oninput="onRaceFirst3fInput(this,${raceNo})" onblur="onRaceFirst3fBlur(this,${raceNo})">
            </div>
            <div class="pace-input-group">
              <label style="font-size:10px;color:#6b7280;font-weight:700;letter-spacing:.04em;">上がり3F（秒）</label>
              <input type="text" inputmode="decimal" id="race-agari3f-${raceNo}" class="pace-input pace-input--agari" placeholder="37.5" value="${raceInfo.agari3f_race ? parseFloat(raceInfo.agari3f_race).toFixed(1) : ''}" oninput="onRaceAgari3fInput(this,${raceNo})" onblur="onRaceAgari3fBlur(this,${raceNo})">
            </div>
            <div class="pace-input-group">
              <label style="font-size:10px;color:#6b7280;font-weight:700;letter-spacing:.04em;">上がり4F（秒）</label>
              <input type="text" inputmode="decimal" id="race-agari4f-${raceNo}" class="pace-input pace-input--agari" placeholder="49.0" value="${raceInfo.agari4f ? parseFloat(raceInfo.agari4f).toFixed(1) : ''}" oninput="onRaceAgari4fInput(this,${raceNo})" onblur="onRaceAgari4fBlur(this,${raceNo})">
            </div>
          </div>
        </div>
        <!-- 前後半差 + ペース判定カード -->
        <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;min-width:140px;justify-content:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#6b7280;white-space:nowrap;">前後半差</span>
            <span id="pace-diff-badge-${raceNo}" style="font-size:18px;font-weight:800;font-family:monospace;color:#6b7280;">—</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#6b7280;white-space:nowrap;">ペース</span>
            <div id="pace-badge-${raceNo}" class="pace-badge ${getPaceBadgeClass(raceInfo.paceType)}">${raceInfo.paceType||'－'}</div>
            ${raceInfo.manualPace?'<span style="font-size:9px;background:#fef3c7;color:#92400e;border-radius:8px;padding:1px 6px;font-weight:700;">手動中</span>':''}
          </div>
        </div>
        <!-- 手動設定 -->
        <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;justify-content:center;">
          <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:2px;">手動設定</div>
          <div class="pace-btns" style="display:flex;gap:4px;">
            <button class="pace-btn pace-btn-high ${raceInfo.paceType==='ハイ'?'active':''}" onclick="setPace(${raceNo},'ハイ')">ハイ</button>
            <button class="pace-btn pace-btn-mid ${raceInfo.paceType==='ミドル'?'active':''}" onclick="setPace(${raceNo},'ミドル')">ミドル</button>
            <button class="pace-btn pace-btn-slow ${raceInfo.paceType==='スロー'?'active':''}" onclick="setPace(${raceNo},'スロー')">スロー</button>
            <button class="pace-btn pace-btn-reset" onclick="clearManualPace(${raceNo})" title="自動計算に戻す" style="font-size:13px;">↩</button>
          </div>
        </div>
      </div>

      <!-- ラップタイム（改良デザイン） -->
      <div class="lap-section-new" id="lap-section-wrap-${raceNo}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <i class="fas fa-stopwatch" style="color:#7c3aed;font-size:13px;"></i>
          <span style="font-size:12px;font-weight:700;color:#374151;">ラップタイム</span>
          <span style="font-size:11px;color:#9ca3af;" id="lap-seg-note-${raceNo}">${getLapSegNote(raceInfo.distance)}</span>
        </div>
        <div id="lap-inputs-${raceNo}"><span style="font-size:12px;color:#9ca3af">距離情報読み込み中...</span></div>
      </div>

      <!-- 馬別ペース分布チャート -->
      <div id="pace-dist-${raceNo}" class="pace-dist-wrap" style="display:none;"></div>

      <div class="pace-memo-row" style="margin-top:12px">
        <label style="font-size:11px;color:#6b7280;font-weight:700;">メモ</label>
        <input type="text" id="race-memo-${raceNo}" class="form-input" placeholder="展開メモなど..." value="${raceInfo.memo||''}">
      </div>
      <div class="pace-save-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="btn btn-secondary btn-sm" onclick="saveOneRace(${raceNo})" style="background:#1a56a0;color:#fff;border:none;"><i class="fas fa-save"></i> ${raceNo}R だけ保存</button>
        <button class="btn btn-primary btn-sm" onclick="saveAllData()"><i class="fas fa-save"></i> この日の全データを保存</button>
        <span id="save-status" class="save-status"></span>
      </div>
    </div>

    <!-- 折りたたみ式サブパネル群 -->
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">

      <!-- 過去基準値（折りたたみ） -->
      <div class="collapsible-panel" id="bench-collapse-${raceNo}">
        <button class="collapse-btn" onclick="toggleCollapse('bench',${raceNo})">
          <span><i class="fas fa-chart-line" style="color:#15803d"></i> 過去基準値（${raceInfo.distance||'—'}）</span>
          <i class="fas fa-chevron-down collapse-icon" id="bench-icon-${raceNo}"></i>
        </button>
        <div class="collapse-body" id="bench-body-${raceNo}" style="display:none;">
          <div id="class-bench-${raceNo}" class="class-bench-wrap" style="margin-top:0;padding-top:10px;"></div>
        </div>
      </div>

      <!-- 馬場差・基準時計（折りたたみ） -->
      <div class="collapsible-panel" id="bias-collapse-${raceNo}">
        <button class="collapse-btn" onclick="toggleCollapse('bias',${raceNo})">
          <span><i class="fas fa-thermometer-half" style="color:#0369a1"></i> 馬場差・基準時計</span>
          <i class="fas fa-chevron-down collapse-icon" id="bias-icon-${raceNo}"></i>
        </button>
        <div class="collapse-body" id="bias-body-${raceNo}" style="display:none;">
          <div id="track-bias-panel-${raceNo}" style="padding-top:10px;"></div>
        </div>
      </div>

    </div>
      </div><!-- /admin-input-body -->
    </div><!-- /admin-input-wrap -->`;
  section.appendChild(hCard);
  const pickDock=document.createElement('div');
  pickDock.id=`cockpit-picks-${raceNo}`;
  pickDock.className='cockpit-picks';
  pickDock.setAttribute('aria-label', 'AI注目馬');
  pickDock.innerHTML=`
    <div class="cockpit-pick is-loading"><span class="cockpit-mark">◎</span><span>保存済みのAI本命を確認中</span></div>
    <div class="cockpit-pick is-loading"><span class="cockpit-mark is-second">○</span><span>保存済みの○▲△を確認中</span></div>
    <div class="cockpit-pick is-loading"><span class="cockpit-mark is-value">—</span><span>T10期待値記録を確認中</span></div>`;
  section.appendChild(pickDock);
  const tSec=document.createElement('div'); tSec.className='deban-section cockpit-race-panel';
  tSec.innerHTML=`
    <!-- タブバー：position:relative で右側コントロールを絶対配置（見た目はクラスで定義＝ダーク上書き対応） -->
    <div id="kv-tabbar-${raceNo}"
         style="position:relative;background:#f8fafc;border-bottom:2px solid #e2e8f0;height:44px;width:100%;box-sizing:border-box;overflow:hidden;">
      <!-- 左：タブボタン群（padding-rightでボタン領域を確保） -->
      <div class="kv-vtabs" role="tablist" aria-label="レース情報" onkeydown="onRaceTabKeydown(event,${raceNo})">
        <button id="tab-btn-deban-${raceNo}" class="kv-vtab on" data-view="deban" role="tab" aria-selected="true" aria-controls="view-deban-${raceNo}" tabindex="0"
                onclick="switchViewTab(${raceNo},'deban')">
          <i class="fas fa-table"></i>
          <span>出馬表</span>
        </button>
        <button id="tab-btn-yoso-${raceNo}" class="kv-vtab" data-view="yoso" role="tab" aria-selected="false" aria-controls="view-yoso-${raceNo}" tabindex="-1"
                onclick="switchViewTab(${raceNo},'yoso')">
          <i class="fas fa-star"></i>
          <span>AI予想</span>
        </button>
        <button id="tab-btn-odds-${raceNo}" class="kv-vtab" data-view="odds" role="tab" aria-selected="false" aria-controls="view-odds-${raceNo}" tabindex="-1"
                onclick="switchViewTab(${raceNo},'odds')">
          <i class="fas fa-chart-line"></i>
          <span>オッズ</span>
        </button>
        <button id="tab-btn-ability-${raceNo}" class="kv-vtab" role="tab" aria-selected="false" aria-controls="view-ability-${raceNo}" tabindex="-1" data-view="ability" onclick="switchViewTab(${raceNo},'ability')"><i class="fas fa-columns"></i><span>馬比較</span></button>
        <button id="tab-btn-kekka-${raceNo}" class="kv-vtab" role="tab" aria-selected="false" aria-controls="view-kekka-${raceNo}" tabindex="-1" data-view="kekka" disabled onclick="switchViewTab(${raceNo},'kekka')"><i class="fas fa-flag-checkered"></i><span>結果</span></button>
      </div>
      <!-- 右：コメント操作 — 絶対配置で右端に固定 -->
      <div id="deban-controls-${raceNo}" class="kv-vctrl">
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#374151;cursor:pointer;user-select:none;font-weight:600;white-space:nowrap;">
          <input type="checkbox" id="comment-visible-cb-${raceNo}"
                 onchange="toggleCommentVisible(this.checked,${raceNo})"
                 ${_commentVisible?'checked':''}
                 style="width:13px;height:13px;cursor:pointer;accent-color:#1a56a0;">
          <span>コメント表示</span>
        </label>
        <button id="comment-btn-${raceNo}" class="admin-only"
                onclick="fetchAndApplyComments(${raceNo})"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:linear-gradient(135deg,#1a56a0,#1e40af);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;box-shadow:0 1px 3px rgba(26,86,160,.3);letter-spacing:.3px;">
          <i class="fas fa-comment-dots"></i>コメント取得
        </button>
      </div>
    </div>

    <!-- 出馬表ビュー -->
    <div id="view-deban-${raceNo}" role="tabpanel" aria-labelledby="tab-btn-deban-${raceNo}">
      <!-- 展開予想・乗り替わり診断（2026-07-11：予想AIタブから出馬表タブへ移設。馬柱表より上に配置） -->
      <div id="deban-extra-${raceNo}" style="padding:0 8px 8px;"></div>
      <div class="split-view-wrap">
        <div class="split-table-area">
          <div class="table-wrapper">
            <div style="display:flex;justify-content:flex-end;gap:8px;padding:6px 8px 4px;">
              <button type="button" onclick="openCommentSheet(${raceNo})" class="btn btn-secondary btn-sm viewer-ok" title="出走馬全頭の最新コメント10件を一覧表示・PDF/画像で保存">💬 コメント一覧</button>
              <button type="button" id="odds-btn-${raceNo}" onclick="fetchLiveOddsBtn(${raceNo})" class="btn btn-secondary btn-sm viewer-ok" title="公式サイトから単勝オッズ・馬体重を取得（開催日は5分毎に自動更新・このボタンで今すぐ最新化）">💹 オッズ取得</button><span class="odds-auto-note" id="odds-auto-${raceNo}"></span>
              <button type="button" id="deban-mode-btn-${raceNo}" onclick="toggleDebanMode(${raceNo})" class="btn btn-secondary btn-sm admin-only" title="レース前の出馬表と、結果・記録入力用の表を切り替え">📝 記録表示へ</button>
            </div>
            <table class="deban-table" id="deban-table-${raceNo}">
              <thead><tr id="thead-row-${raceNo}">
                <th class="col-chakujun sortable" role="button" tabindex="0" aria-sort="none" onclick="sortTable(${raceNo},'chakujun')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sortTable(${raceNo},'chakujun')}" title="着順でソート">着順</th>
                <th class="col-waku sortable" role="button" tabindex="0" aria-sort="none" onclick="sortTable(${raceNo},'waku')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sortTable(${raceNo},'waku')}" title="枠番でソート">枠</th>
                <th class="col-ninki sortable" role="button" tabindex="0" aria-sort="none" onclick="sortTable(${raceNo},'ninki')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sortTable(${raceNo},'ninki')}" title="人気でソート">人気</th>
                <th class="col-umano sortable" role="button" tabindex="0" aria-sort="none" onclick="sortTable(${raceNo},'umaBan')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sortTable(${raceNo},'umaBan')}" title="馬番でソート">馬番</th>
                <th class="col-ai" title="AI独自の評価による印（予想AIタブと同一）">AI印</th>
                <th class="col-mymark" title="自分の印（タップで◎○▲△☆✕を切替・✎でメモ・この端末に保存）">マイ印</th>
                <th class="col-umaname">馬名</th>
                <th class="col-recent" title="直近5走の着順（左が最新）。クリックで能力表タブへ">近5走</th>
                <th class="col-belong">所属</th>
                <th class="col-sexage">性齢</th>
                <th class="col-kinryo sortable" role="button" tabindex="0" aria-sort="none" onclick="sortTable(${raceNo},'kinryo')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sortTable(${raceNo},'kinryo')}" title="斤量でソート">斤量</th>
                <th class="col-jockey">騎手</th>
                <th class="col-trainer">調教師</th>
                <th class="col-weight sortable" role="button" tabindex="0" aria-sort="none" onclick="sortTable(${raceNo},'weight')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();sortTable(${raceNo},'weight')}" title="馬体重でソート">馬体重</th>
                <th class="col-odds">オッズ</th>
                <th class="col-aiscore" title="予想AI総合スコアとフィールド内順位">AIスコア</th>
                <th class="col-time sortable"     onclick="sortTable(${raceNo},'time')"     title="タイムでソート">タイム</th>
                <th class="col-agari3f sortable"  onclick="sortTable(${raceNo},'agari3f')"  title="上がり3Fでソート">上がり3F</th>
                <th class="col-corner sortable" onclick="sortTable(${raceNo},'corner')" title="コーナー通過順でソート（先頭から）">コーナー</th>
                <th class="col-3f sortable"       onclick="sortTable(${raceNo},'first3f')"  title="前半3Fでソート">前半3F</th>
                <th class="col-pace">ペース</th>
                <th class="col-mukae">向正面</th>
                <th class="col-straight">直線</th>
              </tr></thead>
              <tbody id="tbody-${raceNo}"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 結果ビュー（着順・位置取り・払戻金） -->
    <div id="view-kekka-${raceNo}" style="display:none;padding:10px 12px 12px;">
      <div id="kekka-panel-${raceNo}">
        <div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> 読み込み中...</div>
      </div>
    </div>

    <!-- 能力表ビュー（過去5走） -->
    <div id="view-ability-${raceNo}" style="display:none;padding:10px 12px 8px;">
      <!-- PDF/画像ダウンロードバー -->
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:8px;">
        <button onclick="exportAbilityPDF(${raceNo})"
          id="pdf-btn-${raceNo}"
          style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;box-shadow:0 1px 4px rgba(185,28,28,.3);">
          <i class="fas fa-file-pdf"></i>PDFで保存
        </button>
        <button onclick="exportAbilityImage(${raceNo})"
          id="img-btn-${raceNo}"
          style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:linear-gradient(135deg,#059669,#047857);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;box-shadow:0 1px 4px rgba(5,150,105,.3);">
          <i class="fas fa-image"></i>画像で保存
        </button>
      </div>
      <!-- 能力表本体（PDF撮影対象） -->
      <div id="ability-table-${raceNo}">
        <div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> 読み込み中...</div>
      </div>
    </div>

    <!-- AI予想ビュー：AI予想ランキング＋狙い目/穴馬/買い得チェック/スコア解説（全員に表示）＋管理者詳細（旧予想AIパネル・折りたたみ初期閉・管理者のみ） -->
    <div id="view-yoso-${raceNo}" role="tabpanel" aria-labelledby="tab-btn-yoso-${raceNo}" style="display:none;padding:12px 14px 12px;">
      <div id="cockpit-ai-panel-${raceNo}" class="cockpit-ai-panel" aria-live="polite">
        <div class="cockpit-panel-empty"><i class="fas fa-spinner fa-spin"></i> AI判断を整理しています</div>
      </div>
      <details class="cockpit-ai-details">
        <summary><i class="fas fa-microscope"></i> 詳しい予想根拠・期待値を見る</summary>
        <div class="cockpit-ai-details-body">
          <div id="kvx-yoso-slot-${raceNo}" class="kvx-yoso-slot">
            <div id="kvx-yoso-empty-${raceNo}" class="kvx-yoso-empty" hidden>AI予想を表示できません</div>
          </div>
          <div id="yoso-public-extra-${raceNo}" class="yoso-public-extra"></div>
        </div>
      </details>
      <details id="yoso-admin-detail-${raceNo}" class="yoso-admin-detail admin-only">
        <summary>管理者詳細（AI予想の内部パネル・EV／穴馬／検証）</summary>
        <div id="yoso-panel-${raceNo}">
          <div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> 読み込み中...</div>
        </div>
      </details>
    </div>

    <!-- オッズビュー -->
    <div id="view-odds-${raceNo}" role="tabpanel" aria-labelledby="tab-btn-odds-${raceNo}" hidden style="display:none;padding:12px 14px 12px;">
      <div id="odds-panel-${raceNo}" class="cockpit-odds-panel">
        <div class="cockpit-panel-empty"><i class="fas fa-spinner fa-spin"></i> オッズを整理しています</div>
      </div>
    </div>`;
  section.appendChild(tSec);
  // 着順1位から表示（着順未設定馬は末尾に馬番順）
  const sortedHorses=[...horses].sort((a,b)=>{
    const ca=parseInt(a.chakujun)||999,cb=parseInt(b.chakujun)||999;
    return ca!==cb?ca-cb:(parseInt(a.umaBan)||0)-(parseInt(b.umaBan)||0);
  });
  renderHorseRows(raceNo, sortedHorses);
  // 保存済みの軽量予想があれば、全履歴（約15万件）を展開する前に先行表示する。
  setTimeout(() => _ensureAiInsightsModule().then(async () => {
    // 端末キャッシュは通信を待たずに先行表示する。
    if (window.kvAiRenderCachedPrediction?.(raceNo)) return;
    if (window.kvAiHydrateServerDay) await window.kvAiHydrateServerDay(raceInfo.raceDate);
    if (window.kvAiRenderCachedPrediction?.(raceNo)) return;
    if (_kvRaceHasResult(raceNo)) kvRefreshPrediction(raceNo,{ retrospective:true });
    else _kvRenderAiOnDemandState(raceNo);
  }).catch(error => {
    console.warn('[ai cache hydrate]', error);
    _kvRenderAiLoadErrorState(raceNo);
  }), 0);
  updateRacePace(raceNo);
  renderPaceDistChart(raceNo);
  renderLapInputs(raceNo, raceInfo.distance, raceInfo.lapTimes || null);
  _updateTrackBiasInline(raceNo);  // ペースパネル内インライン馬場差
  // 決着時計を1着馬から自動設定
  _updateFinishTime(raceNo);
  // 近5走と馬比較は、全履歴より先にこのレースの出走馬だけを索引読込する。
  if (!_idbFullReady) {
    _ensureRaceHorseHistory(raceNo).catch(e => console.warn('[race horse history]', e));
  }
  // 全履歴がすでにメモリへ載っている端末だけ、重い分析パネルも描画する。
  // 通常閲覧では約15万件の全履歴を自動展開しない。保存済みAIは上の軽量モジュールで
  // 先に表示し、端末での再計算は利用者が明示した時だけ kvRefreshPrediction() が行う。
  if (_idbFullReady && typeof window.computeYosoScored === 'function') {
    _renderRaceHistoryPanels(raceNo);
  }
  setTimeout(() => renderOddsPanel(raceNo), 0);
  _updateCockpitRaceStatus(raceNo);
  // コメントが保存済みなら再描画（レース移動後も維持）
  if (data.horses.some(h => h.postComment)) {
    _renderCommentsInTable(raceNo);
    // ボタン状態も更新
    const matched = data.horses.filter(h => h.postComment).length;
    const btn = document.getElementById(`comment-btn-${raceNo}`);
    if (btn && matched > 0) {
      btn.innerHTML = `<i class="fas fa-check-circle"></i> コメント取得済み（${matched}頭）`;
      btn.style.background = '#16a34a';
    }
    // チェックボックスの状態に合わせて表示切替
    if (!_commentVisible) _hideCommentRows(raceNo);
  }
}

function _renderRaceHistoryPanels(raceNo) {
  // 各処理を別タスクに分散し、全履歴展開直後のメインスレッド占有を抑える。
  setTimeout(() => renderClassDistBenchmark(raceNo), 0);
  setTimeout(() => renderTrackBiasPanel(raceNo), 0);
  setTimeout(() => renderDebanExtra(raceNo), 0);
  setTimeout(() => renderCockpitSummary(raceNo), 0);
  setTimeout(() => renderOddsPanel(raceNo), 0);
  setTimeout(() => {
    if (window.kvAiScheduleDayPrecompute) window.kvAiScheduleDayPrecompute(allRacesData[raceNo]?.raceInfo?.raceDate);
  }, 0);
}

function _cockpitDateLabel(raw) {
  const m = String(raw || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  const dow = ['日曜','月曜','火曜','水曜','木曜','金曜','土曜'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${dow}`;
}

/** サンプル上部の「馬場／オッズ時刻」を、選択中レースの実データへ同期する。 */
function _updateCockpitRaceStatus(raceNo) {
  const data = allRacesData[raceNo];
  if (!data) return;
  const info = data.raceInfo || {};
  const dateEl = document.getElementById('cockpit-today-label');
  if (dateEl) dateEl.textContent = _cockpitDateLabel(info.raceDate);
  const trackEl = document.getElementById('cockpit-global-track');
  if (trackEl) trackEl.innerHTML = `<i class="fas fa-cloud-rain"></i> ${escapeHTML(info.trackCond || info.track_cond || '—')}`;
  const oddsEl = document.getElementById('cockpit-global-odds');
  if (oddsEl) {
    let label = '未取得';
    const observedAt = data._liveOddsObservedAt || data._savedOddsObservedAt;
    if (observedAt) {
      const t = new Date(observedAt);
      if (!isNaN(t.getTime())) {
        const age = Math.max(0, Math.floor((Date.now() - t.getTime()) / 60000));
        const source = data._liveOddsObservedAt ? '' : '・保存';
        label = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}${source}${age >= 10 ? '・古い' : ''}`;
      }
    } else if ((data.horses || []).some(h => parseFloat(h.odds) > 0)) label = '保存値';
    oddsEl.innerHTML = `<i class="fas fa-sync-alt"></i> オッズ ${label}`;
  }
}

function _cockpitReasonFor(scoredHorse) {
  if (!scoredHorse) return '評価データなし';
  const factors = [
    ['近走上向き', scoredHorse.trendMod], ['距離適性', scoredHorse.distMod], ['馬場適性', scoredHorse.condMod],
    ['先行力', scoredHorse.cornMod], ['騎手・厩舎', scoredHorse.comboMod], ['末脚', scoredHorse.agariMod],
    ['展開適性', scoredHorse.paceCtxMod], ['クラス適性', scoredHorse.classMod], ['ローテ', scoredHorse.rotMod]
  ].filter(x => Number(x[1]) > 0.15).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (factors.length) return factors.slice(0, 2).map(x => x[0]).join('・');
  return scoredHorse.baseScore != null ? '基礎走力を評価' : '総合評価上位';
}

/** 管理者の前向き記録だけに、馬連評価差モデルの固定結果を表示する。 */
function _cockpitUmarenDistortionHtml(raceNo,scored) {
  if (typeof isAdminMode !== 'function' || !isAdminMode() || !window.KvUmarenDistortionShadow) return '';
  const data=allRacesData[raceNo], state=window.KvUmarenDistortionShadow.getState(data?.raceInfo?.raceDate,raceNo);
  if (!state?.t10 && !state?.t5) return '';
  const byUma=new Map((scored || []).map(row => [parseInt(row?.horse?.umaBan,10),row?.horse]));
  const axis=state.t5?.axis ?? state.t10?.selected;
  const axisHorse=byUma.get(Number(axis));
  const axisLabel=axis ? `${axis}番 ${axisHorse?.horseName || state.t5?.axisRow?.name || state.t10?.rows?.find(row => row.u === axis)?.name || ''}`.trim() : '';
  if (state.t5) {
    if (!state.t5.trigger) {
      return `<div class="cockpit-value-note"><span class="cockpit-rank-mark">馬連</span><span><strong>馬連評価差・今回は対象外</strong><br><span style="color:var(--kc-muted)">5分前の全組合せを確認しましたが、基準を満たす評価差はありません</span></span><small>前向き検証中</small></div>`;
    }
    const tickets=(state.t5.tickets || []).map(ticket => {
      const partner=byUma.get(Number(ticket.partner));
      return `${ticket.combo.join('-')}（${partner?.horseName || ticket.partnerName || ''}・${Number(ticket.odds).toFixed(1)}倍・2,500円換算）`;
    }).join(' / ');
    return `<div class="cockpit-value-note"><span class="cockpit-rank-mark">馬連</span><span><strong>馬連評価差・検証候補</strong> 軸 ${escapeHTML(axisLabel)}<br><span style="color:var(--kc-muted)">${escapeHTML(tickets)}</span></span><small>計5,000円換算・前向き検証中</small></div>`;
  }
  if (state.t10?.selected) {
    return `<div class="cockpit-value-note"><span class="cockpit-rank-mark">馬連</span><span><strong>回収率型の軸を10分前に固定</strong> ${escapeHTML(axisLabel)}<br><span style="color:var(--kc-muted)">5分前の馬連評価差を待っています</span></span><small>前向き検証中</small></div>`;
  }
  return `<div class="cockpit-value-note"><span class="cockpit-rank-mark">馬連</span><span><strong>回収率型の軸なし</strong><br><span style="color:var(--kc-muted)">10分前の条件に合う馬がいませんでした</span></span><small>前向き検証中</small></div>`;
}

/** 能力印と期待値を混ぜず、◎○▲△××と検証中のT10価値候補を分けて描画する。 */
function renderCockpitSummary(raceNo) {
  const dock = document.getElementById(`cockpit-picks-${raceNo}`);
  const panel = document.getElementById(`cockpit-ai-panel-${raceNo}`);
  if (!dock && !panel) return;
  let result = null;
  try { result = computeYosoScored(raceNo, null); } catch(e) { console.warn('[cockpit summary]', e); }
  const scored = (result?.scored || []).filter(s => s && s.horse && s.totalScore != null);
  if (!scored.length) {
    const empty = '<div class="cockpit-panel-empty"><i class="fas fa-info-circle"></i> 過去走データが揃うとAI注目馬を表示します</div>';
    if (dock) dock.innerHTML = empty;
    if (panel) panel.innerHTML = empty;
    return;
  }
  let longshotPanelHtml = '';
  try { if (typeof buildLongshotCockpitHtml === 'function') longshotPanelHtml = buildLongshotCockpitHtml(raceNo, scored); }
  catch(e) { console.warn('[cockpit longshot]', e); }
  // 単体テストや旧キャッシュから呼ばれた場合も、予想本体を止めない安全なフォールバック。
  const roleFor = typeof _cockpitOpponentRole === 'function' ? _cockpitOpponentRole
    : (_rows, _s, idx) => idx === 0 ? { label:'相手軸', detail:'能力評価2位' } : idx === 1 ? { label:'展開補完', detail:'上位候補を補完' } : { label:'押さえ', detail:'能力上位' };
  const marketGapHtmlFor = typeof _cockpitMarketGapHtml === 'function' ? _cockpitMarketGapHtml : () => '';
  const buyLineHtmlFor = typeof _cockpitBuyLineHtml === 'function' ? _cockpitBuyLineHtml : () => '';

  // 印は市場人気で上書きせず、オッズ非依存の能力スコア順を一貫して使う。
  const main = scored[0] || null;
  const opponents = scored.slice(1, 4);
  let value = null, valueMeta = null, valueShadow = null, valueResearchOnly = false;
  // 新モデルは管理者の前向き検証だけに表示する。能力印の順序や公開の買い判断は変更しない。
  if (!value && typeof isAdminMode === 'function' && isAdminMode() &&
      typeof window.kvComputeT10ValueShadow === 'function') {
    try {
      valueShadow = window.kvComputeT10ValueShadow(raceNo, scored);
      const c = valueShadow?.candidate;
      if (c) {
        value = scored.find(s => parseInt(s.horse?.umaBan) === parseInt(c.uma)) || null;
        if (value) { valueMeta = c; valueResearchOnly = true; }
      }
    } catch(e) { console.warn('[cockpit value shadow]', e); }
  }
  const picks = {
    main: { mark:'◎', kind:'main', s:main, note: main ? `能力1位・${_cockpitReasonFor(main)}` : '能力評価なし' },
    value: { mark:value ? 'EV' : '—', kind:'value', s:value, note: value
      ? (valueResearchOnly
        ? `価値スコア ${Number(valueMeta?.ev || 0) >= 0 ? '+' : ''}${Number(valueMeta?.ev || 0).toFixed(2)}（未校正）・購入判定未提供`
        : `期待値指数 ${Number(valueMeta?.evCal || 0).toFixed(2)}`)
      : '期待値モデル未認定・購入判定未提供' }
  };
  const cardHtml = p => {
    if (!p.s) return `<div class="cockpit-pick is-empty"><span class="cockpit-mark is-${p.kind}">${p.mark}</span><div class="cockpit-pick-copy"><strong>${p.kind === 'value' ? '判定未提供' : '候補なし'}</strong><small>${p.note}</small></div><span class="cockpit-odds">—</span></div>`;
    const h = p.s.horse, odds = parseFloat(h.odds), ninki = parseInt(h.ninki);
    const market = `${Number.isFinite(ninki) ? ninki + '人気 ' : ''}${Number.isFinite(odds) ? odds.toFixed(1) : '—'}`;
    return `<button type="button" class="cockpit-pick is-${p.kind}" onclick="switchViewTab(${raceNo},'yoso')">
      <span class="cockpit-mark is-${p.kind}">${p.mark}</span>
      <span class="cockpit-pick-copy"><strong>${escapeHTML(h.umaBan || '—')}番 ${escapeHTML(h.horseName) || '—'}</strong><small>${escapeHTML(p.note)}</small></span>
      <span class="cockpit-odds">${escapeHTML(market)}</span>
    </button>`;
  };
  const opponentHtml = opponents.length ? `<button type="button" class="cockpit-pick is-opponents" onclick="switchViewTab(${raceNo},'yoso')">
    <span class="cockpit-mark is-second">○</span>
    <span class="cockpit-opponent-list"><span class="cockpit-opponent-head">相手候補・役割</span>${opponents.map((s, idx) => {
      const h = s.horse, mark = ['○','▲','△'][idx], odds = parseFloat(h.odds), ninki = parseInt(h.ninki);
      const market = `${Number.isFinite(ninki) ? ninki + '人気' : '人気—'}${Number.isFinite(odds) ? ' ' + odds.toFixed(1) : ''}`;
      const role = roleFor(scored, s, idx);
      return `<span class="cockpit-opponent-line"><span class="cockpit-opponent-mark">${mark}</span><b>${escapeHTML(h.umaBan || '—')}番 ${escapeHTML(h.horseName) || '—'}<span class="cockpit-opponent-role" title="${escapeHTML(role.detail)}">${escapeHTML(role.label)}</span></b><small>${escapeHTML(market)}</small></span>`;
    }).join('')}</span>
  </button>` : '<div class="cockpit-pick is-empty"><span class="cockpit-mark is-second">○</span><div class="cockpit-pick-copy"><strong>相手候補なし</strong><small>○▲△を判定できません</small></div></div>';
  const scoreGap = main && scored[1] ? Number(main.totalScore) - Number(scored[1].totalScore) : 0;
  const oddsReady = scored.filter(s => parseFloat(s.horse?.odds) > 0).length;
  const calibrated = typeof window !== 'undefined' && window.kvAiGetCalibratedConfidence
    ? window.kvAiGetCalibratedConfidence(main?.horse?.ninki) : null;
  const confidence = calibrated?.label || (scoreGap >= 4 && oddsReady >= Math.ceil(scored.length * .7) ? '高' : scoreGap >= 2 ? '中' : '慎重');
  const confidenceCls = calibrated?.className || (confidence === '高' ? 'high' : confidence === '中' ? 'mid' : 'low');
  const risks = [];
  if (scoreGap < 2) risks.push('上位評価が接近');
  if (main && parseFloat(main.horse?.odds) > 0 && parseFloat(main.horse.odds) < 2) risks.push('本命に人気集中');
  if (!oddsReady) risks.push('オッズ未取得');
  if (valueResearchOnly) risks.push('期待値モデルは前向き検証中');
  else if (!value) risks.push('期待値モデル未認定');
  if (!risks.length) risks.push('大きな不安材料なし');
  const action = valueResearchOnly ? '期待値候補あり（検証中）・購入判定未提供' : value ? '単勝の期待値候補あり' : '購入判定未提供';
  const confidenceEvidence = calibrated
    ? `<b>◎1着 ${(calibrated.winRate * 100).toFixed(1)}%・3着内 ${(calibrated.top3Rate * 100).toFixed(1)}%</b>（${escapeHTML(calibrated.band)} n=${calibrated.n}）<br>` : '';
  const confidenceTitle = calibrated ? '同人気帯実績' : '能力順位差の暫定信頼度';
  const decisionHtml = `<div class="cockpit-decision"><span class="decision-chip is-${confidenceCls}" title="${escapeHTML(calibrated?.source || 'スコア差による暫定判定')}"><i class="fas ${calibrated ? 'fa-chart-bar' : 'fa-shield-alt'}"></i> ${confidenceTitle} ${confidence}</span><span class="decision-action"><i class="fas fa-gavel"></i> ${escapeHTML(action)}</span><span class="decision-risk">${confidenceEvidence}<b>不安材料:</b> ${escapeHTML(risks.join('・'))}</span><button type="button" class="btn btn-secondary btn-sm viewer-ok" onclick="switchViewTab(${raceNo},'yoso')">全印を見る</button></div>`;
  if (dock) dock.innerHTML = cardHtml(picks.main) + opponentHtml + cardHtml(picks.value) + decisionHtml;

  if (panel) {
    const fullMarks = ['◎', '○', '▲', '△', '×', '×'];
    const rankTones = ['main', 'second', 'third', 'fourth', 'fifth', 'fifth'];
    const marked = scored.slice(0, fullMarks.length);
    const rows = marked.map((s, idx) => {
      const h = s.horse, mark = fullMarks[idx], tone = rankTones[idx];
      const odds = parseFloat(h.odds), ninki = parseInt(h.ninki);
      const market = `${Number.isFinite(ninki) ? ninki + '人気' : '人気—'} ${Number.isFinite(odds) ? odds.toFixed(1) : '—'}`;
      const isValue = s === value;
      const reason = isValue
        ? (valueResearchOnly ? '能力確率に対してT10単勝価格が高い（前向き検証中）' : '校正勝率に対して単勝オッズが高い')
        : _cockpitReasonFor(s);
      const icon = idx === 0 ? 'fa-chart-line' : isValue ? 'fa-bullseye' : idx === 1 ? 'fa-route' : 'fa-layer-group';
      const valueBadge = isValue ? `<span class="cockpit-value-badge">EV ${valueResearchOnly ? '検証候補' : '妙味'}</span>` : '';
      const marketGap = marketGapHtmlFor(scored, s, idx + 1);
      const role = idx > 0 && idx < 4 ? roleFor(scored, s, idx - 1) : null;
      const roleBadge = role ? `<span class="cockpit-opponent-role" title="${escapeHTML(role.detail)}">${escapeHTML(role.label)}</span>` : '';
      return `<tr class="cockpit-rank-row is-${tone}">
        <td><div class="cockpit-horse"><span class="cockpit-rank-mark">${mark}</span><span class="cockpit-uma">${escapeHTML(h.umaBan || '—')}</span><span><b>${escapeHTML(h.horseName) || '—'}</b><small>能力AI ${idx + 1}位${valueBadge}${roleBadge}</small></span></div></td>
        <td class="cockpit-market">${escapeHTML(market)}${marketGap}</td>
        <td><i class="fas ${icon}"></i> ${escapeHTML(reason)}</td>
      </tr>`;
    }).join('');
    let valueNote = '';
    if (value && !marked.includes(value)) {
      const h = value.horse, idx = scored.indexOf(value) + 1;
      const odds = parseFloat(h.odds), ninki = parseInt(h.ninki);
      const market = `${Number.isFinite(ninki) ? ninki + '人気' : '人気—'}・${Number.isFinite(odds) ? odds.toFixed(1) + '倍' : 'オッズ—'}`;
      const reason = valueResearchOnly ? '能力確率に対してT10単勝価格が高い（前向き検証中・購入推奨ではありません）' : '校正勝率に対して単勝オッズが高い';
      valueNote = `<div class="cockpit-value-note"><span class="cockpit-rank-mark">EV</span><span><strong>${valueResearchOnly ? '価格評価の検証候補' : '期待値候補'}</strong> ${escapeHTML(h.umaBan || '—')}番 ${escapeHTML(h.horseName) || '—'}<br><span style="color:var(--kc-muted)">${escapeHTML(reason)}</span></span><small>能力AI ${idx}位・${escapeHTML(market)}</small></div>`;
    }
    const buyLine = buyLineHtmlFor(valueShadow, valueMeta);
    const umarenDistortion = _cockpitUmarenDistortionHtml(raceNo,scored);
    panel.innerHTML = `<div class="cockpit-panel-head"><div><h3>能力予想</h3><p>◎○▲△はオッズを見ない能力順。市場との差と相手の役割を後から重ねています</p></div><span>全印 ${marked.length}頭</span></div>
      ${longshotPanelHtml}<div class="table-wrapper"><table class="cockpit-table"><thead><tr><th>印・馬</th><th>市場・評価差</th><th>判断材料</th></tr></thead><tbody>${rows}</tbody></table></div>${umarenDistortion}${buyLine}${valueNote}`;
  }
}

function _kvOddsRaceStartMs(data, raceNo, historyRows) {
  const date = String(data?.raceInfo?.raceDate || currentDate || '').replace(/-/g, '/');
  const fromRace = typeof _kvGetRaceTime === 'function'
    ? _kvGetRaceTime(date, raceNo, data?.raceInfo?.babaCode || currentBaba) : '';
  const fromHistory = (historyRows || []).map(row => row?.post_time).find(Boolean) || '';
  const match = String(fromRace || fromHistory).match(/(\d{1,2}):(\d{2})/);
  const dm = date.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match || !dm) return null;
  const iso = `${dm[1]}-${String(dm[2]).padStart(2,'0')}-${String(dm[3]).padStart(2,'0')}T${String(match[1]).padStart(2,'0')}:${match[2]}:00+09:00`;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : null;
}

function _kvOddsMinutesToPost(row, raceStartMs) {
  const rawSaved = row?.minutes_to_post;
  const saved = rawSaved == null || rawSaved === '' ? NaN : Number(rawSaved);
  if (Number.isFinite(saved)) return saved;
  const captured = new Date(row?.captured_at || '').getTime();
  return Number.isFinite(raceStartMs) && Number.isFinite(captured)
    ? Math.round((raceStartMs - captured) / 60000) : null;
}

/** 指定区分に最も近い保存値を返す。古い記録はcaptured_atから発走何分前かを補完する。 */
function _kvPickOddsCheckpoint(rows, umaBan, targetMinutes, raceStartMs) {
  const tolerance = targetMinutes === 30 ? 6 : 4;
  return (rows || []).filter(row => parseInt(row?.uma_ban) === parseInt(umaBan) && parseFloat(row?.odds) > 0)
    .map(row => ({ row, delta:Math.abs(_kvOddsMinutesToPost(row, raceStartMs) - targetMinutes) }))
    .filter(item => Number.isFinite(item.delta) && item.delta <= tolerance)
    .sort((a, b) => a.delta - b.delta || new Date(b.row.captured_at || 0) - new Date(a.row.captured_at || 0))[0]?.row || null;
}

function _kvOddsCheckpointHtml(row, label) {
  const odds = parseFloat(row?.odds);
  if (!Number.isFinite(odds)) return `<span class="odds-checkpoint is-missing"><strong>—</strong><small>${label || '記録なし'}</small></span>`;
  const captured = new Date(row?.captured_at || '');
  const time = !isNaN(captured.getTime())
    ? captured.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', hour12:false }) : label;
  return `<span class="odds-checkpoint"><strong>${odds.toFixed(1)}</strong><small>${escapeHTML(time || label || '')}</small></span>`;
}

/** 30分前・10分前・5分前・確定の単勝を、保存スナップショットと公式結果から一覧化する。 */
async function renderOddsPanel(raceNo) {
  const panel = document.getElementById(`odds-panel-${raceNo}`);
  const data = allRacesData[raceNo];
  if (!panel || !data) return;
  const renderKey = `${Date.now()}-${Math.random()}`;
  panel.dataset.oddsRenderKey = renderKey;
  panel.innerHTML = _kvAsyncStateHtml('data', 'オッズ履歴を取得中', '30分前・10分前・5分前・確定を整理しています');
  let rankMap = new Map();
  try {
    if (!_idbFullReady) throw new Error('history-not-ready');
    const scored = computeYosoScored(raceNo, null)?.scored || [];
    rankMap = new Map(scored.filter(s => s?.horse).map((s, i) => [s.horse.horseName, i + 1]));
  } catch(e) { _kvSwallow('renderOddsPanel', e); }
  const horses = [...(data.horses || [])].sort((a, b) => {
    const ao = parseFloat(a.odds), bo = parseFloat(b.odds);
    return (Number.isFinite(ao) ? ao : 99999) - (Number.isFinite(bo) ? bo : 99999) || (parseInt(a.umaBan) || 0) - (parseInt(b.umaBan) || 0);
  });
  let history = [];
  let historyLoadFailed = false;
  try { history = await fetchRaceOddsHistory(data.raceInfo?.raceDate || currentDate, raceNo); }
  catch (e) {
    historyLoadFailed = true;
    console.warn('[odds checkpoints]', e);
  }
  if (!panel.isConnected || panel.dataset.oddsRenderKey !== renderKey) return;
  const latestSavedOddsMs = history.reduce((latest, row) => {
    const ms = new Date(row?.captured_at || '').getTime();
    return Number.isFinite(ms) ? Math.max(latest, ms) : latest;
  }, 0);
  data._savedOddsObservedAt = latestSavedOddsMs ? new Date(latestSavedOddsMs).toISOString() : '';
  _updateCockpitRaceStatus(raceNo);
  const raceStartMs = _kvOddsRaceStartMs(data, raceNo, history);
  const hasResult = _kvRaceHasResult(raceNo);
  const valid = horses.filter(h => parseFloat(h.odds) > 0).length;
  const observed = data._liveOddsObservedAt ? new Date(data._liveOddsObservedAt) : null;
  const observedOk = observed && !isNaN(observed.getTime());
  const ageMin = observedOk ? Math.max(0, Math.floor((Date.now() - observed.getTime()) / 60000)) : null;
  const stale = ageMin != null && ageMin >= 10;
  const freshness = hasResult
    ? `<span class="odds-freshness is-saved"><i class="fas fa-flag-checkered"></i> 結果確定</span>`
    : observedOk
    ? `<span class="odds-freshness${stale ? ' is-stale' : ''}"><i class="fas ${stale ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${stale ? `${ageMin}分前・要更新` : ageMin === 0 ? '最新' : `${ageMin}分前`}</span>`
    : `<span class="odds-freshness is-saved"><i class="fas fa-database"></i> ${valid ? '保存値' : '未取得'}</span>`;
  const rows = horses.map(h => {
    const odds = parseFloat(h.odds), ninki = parseInt(h.ninki), aiRank = rankMap.get(h.horseName);
    const ai = aiRank === 1 ? '◎' : aiRank === 2 ? '○' : aiRank === 3 ? '▲' : '';
    const t30 = _kvPickOddsCheckpoint(history, h.umaBan, 30, raceStartMs);
    const t10 = _kvPickOddsCheckpoint(history, h.umaBan, 10, raceStartMs);
    const t5 = _kvPickOddsCheckpoint(history, h.umaBan, 5, raceStartMs);
    const finalRow = hasResult && Number.isFinite(odds) ? { odds, captured_at:'', ninki } : null;
    return `<tr><td><span class="cockpit-uma">${escapeHTML(h.umaBan || '—')}</span></td><td><b>${ai} ${escapeHTML(h.horseName) || '—'}</b></td><td>${Number.isFinite(ninki) ? ninki + '人気' : '—'}</td><td>${_kvOddsCheckpointHtml(t30, '記録なし')}</td><td>${_kvOddsCheckpointHtml(t10, '記録なし')}</td><td>${_kvOddsCheckpointHtml(t5, '記録なし')}</td><td>${_kvOddsCheckpointHtml(finalRow, hasResult ? '公式確定' : '未確定')}</td><td>${aiRank ? `AI ${aiRank}位` : '—'}</td></tr>`;
  }).join('');
  const warning = historyLoadFailed
    ? `<div class="odds-warning"><i class="fas fa-exclamation-triangle"></i> 保存オッズの取得に失敗しました。<button type="button" class="btn btn-secondary viewer-ok" onclick="renderOddsPanel(${raceNo})"><i class="fas fa-redo"></i> 再試行</button></div>`
    : stale && !hasResult ? `<div class="odds-warning"><i class="fas fa-exclamation-triangle"></i> 最新取得は${ageMin}分前です。購入判断の前に更新してください。</div>`
    : (!history.length ? '<div class="odds-warning"><i class="fas fa-info-circle"></i> 時点別の保存オッズがありません。記録のない欄は「—」で表示します。</div>' : '');
  panel.innerHTML = `<div class="cockpit-panel-head"><div><h3>単勝オッズ推移</h3><p>30分前・10分前・5分前・確定を同じ行で比較（保存 ${history.length}件）</p></div><span style="display:flex;align-items:center;gap:7px">${freshness}<button type="button" class="btn btn-secondary viewer-ok" onclick="fetchLiveOddsBtn(${raceNo})"><i class="fas fa-sync-alt"></i> 最新に更新</button></span></div>${warning}
    <div class="table-wrapper"><table class="cockpit-table cockpit-odds-table"><thead><tr><th>馬番</th><th>馬名</th><th>人気</th><th>30分前</th><th>10分前</th><th>5分前</th><th>確定</th><th>AI</th></tr></thead><tbody>${rows || '<tr><td colspan="8">出走馬データがありません</td></tr>'}</tbody></table></div>`;
}

/**
 * 出馬表タブ内・展開予想＋乗り替わり診断（2026-07-11：予想AIタブから移設）。
 * どちらも自己完結関数（allRacesData[raceNo]から直接計算）のためscored不要で呼べる。
 */
function renderDebanExtra(raceNo) {
  const el = document.getElementById(`deban-extra-${raceNo}`);
  if (!el) return;
  let html = '';
  try { html += buildPaceFormationHtml(raceNo); } catch(e) { console.warn('[buildPaceFormationHtml]', e); }
  try { html += buildJockeyChangeDiag(raceNo); } catch(e) { console.warn('[buildJockeyChangeDiag]', e); }
  // 中継映像(パドック/レース)ジャンプ — modules/race-video.js(映像インデックスがある日だけ表示)
  try { if (window.buildRaceVideoHtml) html += buildRaceVideoHtml(raceNo); } catch(e) { console.warn('[buildRaceVideoHtml]', e); }
  el.innerHTML = html;
}

/**
 * 馬名セル用：距離適性スコアバッジ（S/A/B/C）
 * horseName: 馬名, curDist: 現在レースの距離
 */

async function fetchLiveOdds(raceNo, options) {
  const verifiedOnly = !!(options && options.verifiedOnly);
  const data = allRacesData[raceNo];
  if (!data) throw new Error('レースデータなし');
  const d = data.raceInfo.raceDate, baba = data.raceInfo.babaCode || currentBaba || '31';
  const requestNonce = Date.now();
  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/OddsTanFuku?k_raceDate=${encodeURIComponent(d)}&k_raceNo=${raceNo}&k_babaCode=${baba}&kv_ts=${requestNonce}`;
  const html = await fetchHtmlWithProxy(url, 14000, { firstPartyOnly:verifiedOnly });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = [...doc.querySelectorAll('table')].find(t => t.textContent.includes('単勝オッズ'));
  if (!table) throw new Error('オッズ未発売');
  const previousOdds = new Map(data.horses.map(h => [parseInt(h.umaBan), parseFloat(h.odds)]));
  const previousObservedAt = data._liveOddsObservedAt || null;
  // 取得途中で本体を書き換えると、新旧オッズが混在したまま「最新」扱いになる。
  // 全出走馬の馬番が揃うまで一時Mapに保持し、検証後に一括反映する。
  const pending = new Map();
  for (const tr of [...table.querySelectorAll('tr')].slice(1)) {
    const c = [...tr.querySelectorAll('td,th')].map(x => (x.textContent || '').trim());
    if (c.length < 8) continue;
    const uma = parseInt(c[1]);
    if (isNaN(uma)) continue;
    if (pending.has(uma)) continue;
    const h = data.horses.find(x => parseInt(x.umaBan) === uma);
    if (!h) continue;
    const odds = parseFloat(c[3]);
    if (!isNaN(odds) && odds > 0) {
      const wt = (c[7] || '').split(/\s/)[0];
      pending.set(uma, { odds, weight:wt && /^\d{3}/.test(wt) ? _sanDeep(wt) : '' });
    }
  }
  const expectedUma = data.horses.map(h => parseInt(h.umaBan)).filter(Number.isFinite);
  const hit = pending.size;
  if (hit !== expectedUma.length || expectedUma.some(uma => !pending.has(uma))) {
    throw new Error(`オッズ取得不完全（${hit}/${expectedUma.length}頭）`);
  }
  for (const h of data.horses) {
    const uma = parseInt(h.umaBan), next = pending.get(uma), prev = previousOdds.get(uma);
    h.odds = String(next.odds);
    if (next.weight) h.weight = next.weight;
    if (Number.isFinite(prev) && prev > 0) {
      const pct = ((next.odds - prev) / prev) * 100;
      h._oddsMove = { previous:prev, current:next.odds, percent:pct, direction:next.odds < prev ? 'shorter' : next.odds > prev ? 'longer' : 'flat' };
    }
  }
  const _byOdds = data.horses.filter(h => parseFloat(h.odds) > 0).sort((a, b) => parseFloat(a.odds) - parseFloat(b.odds));
  _byOdds.forEach((h, i) => { h.ninki = String(i + 1); });
  if (hit > 0) {
    // 相手shadowは「いま取得した公式オッズ」だけを前向き評価へ使う。保存値や朝オッズを
    // T10市場と誤認しないよう、race objectへ取得元・観測時刻・取得頭数を別メタとして残す。
    data._liveOddsObservedAt = new Date().toISOString();
    data._previousOddsObservedAt = previousObservedAt;
    data._liveOddsSource = verifiedOnly ? 'first_party_worker:keiba.go.jp/OddsTanFuku' : 'display_fallback:keiba.go.jp/OddsTanFuku';
    data._liveOddsVerified = verifiedOnly;
    data._liveOddsRunnerCount = hit;
    data._liveOddsRequestNonce = requestNonce;
  }
  return hit;
}

/** 公式の馬連複ページから全組合せを一括取得する。前向き検証では自前Worker経由だけを採用する。 */
async function fetchLiveUmarenOdds(raceNo, options) {
  const verifiedOnly = !!(options && options.verifiedOnly);
  const data = allRacesData[raceNo];
  if (!data || !Array.isArray(data.horses)) throw new Error('レースデータなし');
  const d = data.raceInfo.raceDate, baba = data.raceInfo.babaCode || currentBaba || '31';
  const requestNonce = Date.now();
  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/OddsUmLenFuku?k_raceDate=${encodeURIComponent(d)}&k_raceNo=${raceNo}&k_babaCode=${baba}&kv_ts=${requestNonce}`;
  const html = await fetchHtmlWithProxy(url, 14000, { firstPartyOnly:verifiedOnly });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pending = new Map();
  for (const tr of doc.querySelectorAll('table.odd_ranking_table tr')) {
    const cells = [...tr.querySelectorAll('td,th')].map(cell => (cell.textContent || '').trim());
    if (cells.length < 2) continue;
    const match = cells[0].match(/^(\d{1,2})\s*[-－]\s*(\d{1,2})$/);
    const odds = parseFloat(String(cells[1]).replace(/,/g,''));
    if (!match || !Number.isFinite(odds) || odds <= 0) continue;
    const first = parseInt(match[1],10), second = parseInt(match[2],10);
    const low = Math.min(first,second), high = Math.max(first,second), key = `${low}-${high}`;
    if (low === high || pending.has(key)) throw new Error('馬連オッズの組合せ重複');
    pending.set(key, { first:low, second:high, odds });
  }
  const runners = data.horses.map(h => parseInt(h.umaBan,10)).filter(Number.isFinite).sort((a,b) => a-b);
  if (new Set(runners).size !== data.horses.length) throw new Error('出走馬集合が不正');
  const expected = [];
  for (let left=0; left<runners.length; left++) {
    for (let right=left+1; right<runners.length; right++) expected.push(`${runners[left]}-${runners[right]}`);
  }
  if (pending.size !== expected.length || expected.some(key => !pending.has(key))) {
    throw new Error(`馬連オッズ取得不完全（${pending.size}/${expected.length}組）`);
  }
  const rows = [...pending.values()].sort((a,b) => a.first-b.first || a.second-b.second);
  data._liveUmarenOdds = rows;
  data._liveUmarenObservedAt = new Date().toISOString();
  data._liveUmarenSource = verifiedOnly
    ? 'first_party_worker:keiba.go.jp/OddsUmLenFuku'
    : 'display_fallback:keiba.go.jp/OddsUmLenFuku';
  data._liveUmarenVerified = verifiedOnly;
  data._liveUmarenRequestNonce = requestNonce;
  data._liveUmarenPairCount = rows.length;
  return rows;
}

async function fetchLiveOddsBtn(raceNo) {
  const btn = document.getElementById(`odds-btn-${raceNo}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '💹 取得中...'; }
  try {
    const n = await fetchLiveOdds(raceNo);
    const historyKey = `${allRacesData[raceNo]?.raceInfo?.raceDate || currentDate}__${raceNo}`;
    delete _oddsHistCache[historyKey]; // 時点別オッズも次の描画で再取得する
    renderHorseRows(raceNo, allRacesData[raceNo].horses);
    renderCockpitSummary(raceNo);
    renderOddsPanel(raceNo);
    _updateCockpitRaceStatus(raceNo);
    // 表を再構築するとコメント行が消えるので、保存済みコメントを再描画（オッズ取得でコメントが消えるバグ修正）
    if (allRacesData[raceNo]?.horses.some(h => h.postComment)) _renderCommentsInTable(raceNo);
    if (btn) btn.innerHTML = `💹 更新済（${n}頭）`;
    _kvOddsAutoLast[raceNo] = Date.now();   // 手動取得も5分カウントに含める（直後の自動再取得を防ぐ）
    _kvSetOddsAutoNote(raceNo, '手動更新');
  } catch(e) {
    if (btn) btn.innerHTML = '💹 未発売/取得失敗';
    console.warn('[odds]', raceNo, e);
  } finally {
    if (btn) { btn.disabled = false; setTimeout(() => { const b = document.getElementById(`odds-btn-${raceNo}`); if (b) b.innerHTML = '💹 オッズ取得'; }, 5000); }
  }
}

// オッズ自動更新・発走カウントダウン
const _kvOddsAutoLast = {};   // raceNo -> 最終取得時刻(ms)。手動取得も共有
const _kvOddsAutoBusy = {};   // 通信中は多重取得を防ぐ。失敗は成功時刻として記録しない。
let _kvTickersStarted = false;
function _kvStartTickers() {
  if (_kvTickersStarted) return;
  _kvTickersStarted = true;
  setInterval(_kvTickCountdown, 15000);
  setInterval(_kvTickOddsAuto, 30000);
  setInterval(_kvTickOpponentShadowCapture, 30000);
  setInterval(_kvTickUmarenDistortionCapture, 30000);
  setTimeout(_kvTickCountdown, 500);
  setTimeout(_kvTickOpponentShadowCapture, 2500);
  setTimeout(_kvTickUmarenDistortionCapture, 7500);
}
function _kvTodaySlash() {
  const t = new Date();
  return `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')}`;
}
function _kvPostDate(dateSlash, hhmm) {
  try {
    const m = String(hhmm||'').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(String(dateSlash).replace(/\//g,'-') + 'T00:00:00');
    if (isNaN(d)) return null;
    d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
    return d;
  } catch(e) { return null; }
}
function _kvTickCountdown() {
  document.querySelectorAll('.race-countdown').forEach(el => {
    const dt = _kvPostDate(el.dataset.cdDate, el.dataset.cdTime);
    if (!dt) { el.style.display = 'none'; return; }
    const mins = (dt - Date.now()) / 60000;
    el.classList.remove('cd-soon','cd-imminent','cd-done');
    if (mins > 180 || mins < -20) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (mins <= 0) { el.classList.add('cd-done'); el.textContent = '発走済み'; return; }
    const mm = Math.ceil(mins);
    if (mm <= 3)       { el.classList.add('cd-imminent'); el.textContent = `🏇 まもなく発走（あと${mm}分）`; }
    else if (mm <= 10) { el.classList.add('cd-soon');     el.textContent = `⏱ 発走まで あと${mm}分`; }
    else if (mm < 60)  { el.textContent = `発走まで ${mm}分`; }
    else               { el.textContent = `発走まで ${Math.floor(mm/60)}時間${mm%60}分`; }
  });
}
function _kvSetOddsAutoNote(raceNo, how) {
  const note = document.getElementById(`odds-auto-${raceNo}`);
  if (note) note.textContent = `🔄 ${how} ${new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}（5分毎に自動更新）`;
  _updateCockpitRaceStatus(raceNo);
}
// レース確定後の「確定取り直し」を1レース1回だけ行った記録（重複フェッチ防止）
const _kvSettledFetched = {};
let _kvOpponentCaptureBusy = false;
const _kvOpponentCaptureRetryAt = {};
let _kvUmarenCaptureBusy = false;
const _kvUmarenCaptureRetryAt = {};

function _kvUmarenCaptureSlot(minutesBeforeStart) {
  const minutes = Number(minutesBeforeStart);
  if (Number.isFinite(minutes) && minutes >= 10 && minutes <= 10.9) return 't10';
  if (Number.isFinite(minutes) && minutes >= 5 && minutes <= 5.9) return 't5';
  return null;
}

/** T10で軸を固定し、T5で公式馬連全組合せを取得して前向き判定を保存する。 */
async function _kvTickUmarenDistortionCapture() {
  // 2026-08-06 畳んだ: 馬連の期待値路線は検証で閉じた。パリミュチュエルで埋めるべき量は
  // log(1/(1-控除率))=0.294 nats だが、確定オッズの板に対する我々のエッジは全体で+0.0083、
  // レース前に見分けられる最良の層でも+0.029(必要量の9.7%)しかない=桁が2つ足りない。
  // 到達できない仮説の前向き記録を止める。研究の全数値は
  // ドキュメント\高知競馬ビューア改善\research\umaren-asof\README.md
  // 🔑戻し方 = window.KV_UMAREN_DISTORTION_SHADOW = true の1行(モデル本体は無傷で残してある)
  if (window.KV_UMAREN_DISTORTION_SHADOW !== true) return;
  if (_kvUmarenCaptureBusy || typeof isAdminMode !== 'function' || !isAdminMode() ||
      typeof _currentPage === 'undefined' || _currentPage !== 'deban' ||
      String(currentBaba || '') !== '31' || currentDate !== _kvTodaySlash()) return;
  const candidates = Object.keys(allRacesData || {}).map(Number).filter(Number.isFinite).map(raceNo => {
    const data = allRacesData[raceNo];
    if (!data?.raceInfo || data.raceInfo.raceDate !== currentDate || !Array.isArray(data.horses)) return null;
    const timing = _aiPredictionTimeMeta(currentDate,raceNo);
    const slot = timing && _kvUmarenCaptureSlot(timing.minutesBeforeStart);
    return slot ? { raceNo,data,timing,slot } : null;
  }).filter(Boolean).sort((a,b) => Number(a.timing.minutesBeforeStart)-Number(b.timing.minutesBeforeStart));
  if (!candidates.length) return;
  try {
    await Promise.all([_ensureRaceIntelligence(),_ensureVnextPartnerShadowModule(),_ensureUmarenDistortionShadowModule()]);
  } catch (error) { console.warn('[umaren distortion modules]',error); return; }
  if (typeof computeYosoScored !== 'function' || !window.KvUmarenDistortionShadow) return;
  const target = candidates.find(candidate => {
    const state = window.KvUmarenDistortionShadow.getState(candidate.data.raceInfo.raceDate,candidate.raceNo);
    if (candidate.slot === 't10' && state.t10) return false;
    if (candidate.slot === 't5' && (!state.t10?.selected || state.t5)) return false;
    return Date.now() >= Number(_kvUmarenCaptureRetryAt[`${candidate.raceNo}|${candidate.slot}`] || 0);
  });
  if (!target) return;
  const retryKey = `${target.raceNo}|${target.slot}`;
  _kvUmarenCaptureRetryAt[retryKey] = Date.now() + 25000;
  _kvUmarenCaptureBusy = true;
  try {
    const computed = computeYosoScored(target.raceNo,null);
    if (!computed || !Array.isArray(computed.scored)) throw new Error('能力AIを計算できません');
    let result;
    if (target.slot === 't10') {
      const fetched = await fetchLiveOdds(target.raceNo,{ verifiedOnly:true });
      if (fetched !== target.data.horses.length) throw new Error('T10単勝オッズが不完全です');
      result = window.KvUmarenDistortionShadow.captureT10({
        raceDate:target.data.raceInfo.raceDate,raceNo:target.raceNo,scored:computed.scored,timing:target.timing,
        market:{ source:target.data._liveOddsSource,
          requestedAt:new Date(Number(target.data._liveOddsRequestNonce)).toISOString(),
          observedAt:target.data._liveOddsObservedAt,
          rows:target.data.horses.map(h => ({ u:parseInt(h.umaBan,10),odds:Number(h.odds) })) },
      });
    } else {
      const rows = await fetchLiveUmarenOdds(target.raceNo,{ verifiedOnly:true });
      result = window.KvUmarenDistortionShadow.captureT5({
        raceDate:target.data.raceInfo.raceDate,raceNo:target.raceNo,scored:computed.scored,timing:target.timing,
        market:{ source:target.data._liveUmarenSource,
          requestedAt:new Date(Number(target.data._liveUmarenRequestNonce)).toISOString(),
          observedAt:target.data._liveUmarenObservedAt,rows },
      });
    }
    if (!result?.saved && result?.reason !== 'DUPLICATE') console.warn('[umaren distortion capture]',target.slot,result);
    if (Number(currentRaceNo) === target.raceNo) renderCockpitSummary(target.raceNo);
  } catch (error) {
    console.warn('[umaren distortion capture]',target.slot,error);
  } finally {
    _kvUmarenCaptureBusy = false;
  }
}

function _kvOpponentCaptureSlot(minutesBeforeStart) {
  const m = Number(minutesBeforeStart);
  if (Number.isFinite(m) && m >= 10 && m <= 10.9) return 't10';
  if (Number.isFinite(m) && m >= 14.5 && m <= 15.5) return 't15';
  return null;
}

async function _kvTickOpponentShadowCapture() {
  // 管理者端末でも、対象時刻でないのに全履歴とAI解析を起動しない。
  // T15/T10の保存窓に入ったレースがある時だけ、下の重い準備へ進む。
  if (typeof _currentPage === 'undefined' || _currentPage !== 'deban' ||
      String(currentBaba || '') !== '31' || currentDate !== _kvTodaySlash()) return;
  const hasCaptureWindow = Object.keys(allRacesData || {}).map(Number).filter(Number.isFinite).some(raceNo => {
    const data = allRacesData[raceNo];
    if (!data?.raceInfo || data.raceInfo.raceDate !== currentDate) return false;
    const tm = _aiPredictionTimeMeta(currentDate, raceNo);
    return !!(tm && _kvOpponentCaptureSlot(tm.minutesBeforeStart));
  });
  if (!hasCaptureWindow) return;
  if (typeof isAdminMode === 'function' && isAdminMode() &&
      (typeof computeYosoScored !== 'function' || typeof kvPersistT10DecisionLedger !== 'function')) {
    try { await _ensureRaceIntelligence(); } catch (e) { return; }
  }
  if (typeof computeYosoScored !== 'function') return;
  const opponentOn = typeof opponentShadowEnabled === 'function' && opponentShadowEnabled();
  const valueOn = typeof kvCaptureT10ValueShadow === 'function' && typeof isAdminMode === 'function' && isAdminMode();
  if (_kvOpponentCaptureBusy || (!opponentOn && !valueOn)) return;
  if (String(currentBaba || '') !== '31' || currentDate !== _kvTodaySlash()) return;
  if (opponentOn && (typeof computeOpponentShadow !== 'function' ||
      typeof recordForwardOpponentShadowSnapshot !== 'function')) return;
  const candidates = Object.keys(allRacesData).map(Number).filter(Number.isFinite).map(raceNo => {
    const data = allRacesData[raceNo];
    if (!data || !data.raceInfo || data.raceInfo.raceDate !== currentDate || !Array.isArray(data.horses)) return null;
    const tm = _aiPredictionTimeMeta(currentDate, raceNo);
    const slot = tm && _kvOpponentCaptureSlot(tm.minutesBeforeStart);
    return slot ? { raceNo, data, tm, slot } : null;
  }).filter(Boolean).sort((a,b) => Number(a.tm.minutesBeforeStart) - Number(b.tm.minutesBeforeStart));

  const target = candidates.find(c => {
    if (!opponentOn && c.slot !== 't10') return false;
    const audit = typeof getOpponentShadowCaptureAudit === 'function'
      ? getOpponentShadowCaptureAudit(currentDate, c.raceNo, c.slot) : null;
    const retryKey = `${currentDate}|${c.raceNo}|${c.slot}`;
    return !(audit && audit.saved) && Number(audit && audit.attemptCount || 0) < 6 &&
      Date.now() >= Number(_kvOpponentCaptureRetryAt[retryKey] || 0);
  });
  if (!target) return;

  const retryKey = `${currentDate}|${target.raceNo}|${target.slot}`;
  _kvOpponentCaptureRetryAt[retryKey] = Date.now() + 30000;
  _kvOpponentCaptureBusy = true;
  let outcome = { saved:false, reason:'UNKNOWN' };
  try {
    // 前向き検証は自前Worker経由だけを採用し、第三者proxyのキャッシュを公式T10と誤認しない。
    const fetched = await fetchLiveOdds(target.raceNo, { verifiedOnly:true });
    _kvOddsAutoLast[target.raceNo] = Date.now();
    if (fetched !== target.data.horses.length) {
      outcome = { saved:false, reason:'INCOMPLETE_OFFICIAL_ODDS', fetchedRunnerCount:fetched };
    } else {
      const computed = computeYosoScored(target.raceNo, null);
      if (!computed || !Array.isArray(computed.scored)) {
        outcome = { saved:false, reason:'SCORING_UNAVAILABLE', fetchedRunnerCount:fetched };
      } else {
        if (opponentOn) {
          const shadow = computeOpponentShadow(target.raceNo, computed.scored);
          if (!shadow) {
            outcome = { saved:false, reason:'MODEL_GATE_REJECTED', fetchedRunnerCount:fetched };
          } else {
            const recorded = recordForwardOpponentShadowSnapshot(target.raceNo, shadow);
            outcome = { ...recorded, saved:recorded.saved || recorded.reason === 'DUPLICATE',
              fetchedRunnerCount:fetched };
          }
        }
        if (typeof kvCaptureVnextPartnerShadow === 'function') {
          try { kvCaptureVnextPartnerShadow(target.raceNo, computed.scored); }
          catch (e) { console.warn('[vnextPartnerShadow capture]', e); }
        }
        if (typeof kvCaptureEraDriftShadow === 'function') {
          try { kvCaptureEraDriftShadow(target.raceNo, computed.scored); }
          catch (e) { console.warn('[eraDriftShadow capture]', e); }
        }
        // 予想AI v3（MLの再ランク）。⛔印は変えない。新旧の◎○▲を並べて記録するだけ。
        _kvLoadLibrary('viewerAiV3Shadow')
          .then(() => window.kvCaptureViewerAiV3(target.raceNo, computed.scored))
          .catch(e => console.warn('[viewerAiV3 capture]', e));
        if (typeof kvCaptureVnextMarketBlendShadow === 'function') {
          try { kvCaptureVnextMarketBlendShadow(target.raceNo, computed.scored); }
          catch (e) { console.warn('[vnextMarketBlendShadow capture]', e); }
        }
        if (typeof kvCaptureT10ValueShadow === 'function') {
          try {
            const valueRecorded = kvCaptureT10ValueShadow(target.raceNo, computed.scored, { deferServer:target.slot === 't10' });
            if (!opponentOn) outcome = { ...valueRecorded,
              saved:valueRecorded.saved || valueRecorded.reason === 'DUPLICATE', fetchedRunnerCount:fetched };
          }
          catch (e) { console.warn('[valueT10Shadow capture]', e); }
        }
        if (target.slot === 't10' && typeof kvPersistT10DecisionLedger === 'function') {
          const unified = await kvPersistT10DecisionLedger(target.raceNo, computed.scored);
          outcome = { ...unified, serverSaved:unified.saved,
            saved:unified.saved && unified.status !== 'incomplete', fetchedRunnerCount:fetched };
        }
      }
    }
  } catch (e) {
    outcome = { saved:false, reason:'OFFICIAL_ODDS_FETCH_FAILED' };
  } finally {
    try {
      if (typeof recordOpponentShadowCaptureAudit === 'function') {
        recordOpponentShadowCaptureAudit(target.raceNo, target.slot, target.tm, outcome);
      }
    } catch (e) { console.warn('[opponentShadowCaptureAudit]', e); }
    _kvOpponentCaptureBusy = false;
  }
}

async function _kvTickOddsAuto() {
  try {
    if (typeof _currentPage === 'undefined' || _currentPage !== 'deban') return;
    if (!currentRaceNo || !allRacesData[currentRaceNo]) return;
    const data = allRacesData[currentRaceNo];
    const d = data.raceInfo.raceDate;
    if (d !== _kvTodaySlash()) return;                        // 当日のみ
    const t = (typeof _kvGetRaceTime === 'function') ? _kvGetRaceTime(d, currentRaceNo) : null;
    const post = t ? _kvPostDate(d, t) : null;
    const raceNo = currentRaceNo;
    let mins = null;
    if (post) {
      mins = (post - Date.now()) / 60000;
      if (mins > 240) return;                                 // 4時間より前は何もしない
    }

    // ── 発走2分後〜30分後：確定結果を1回だけ取り直す（着順・確定オッズ・馬場状態を
    //    朝の事前予報値から実際の値へ補正。track_cond等の事後変化に対応）──
    if (mins != null && mins <= -2 && mins >= -30 && !_kvSettledFetched[raceNo]) {
      _kvSettledFetched[raceNo] = 'loading';
      try {
        const result = await fetchOneRace(d, raceNo, data.raceInfo.babaCode || currentBaba || '31');
        if (raceNo === currentRaceNo && allRacesData[raceNo] && result && result.horses && result.horses.length) {
          const prev = allRacesData[raceNo];
          if(prev)result.horses=mergeHorseData(prev.horses,result.horses);
          if (prev.raceInfo) {
            result.raceInfo.memo = prev.raceInfo.memo || result.raceInfo.memo;
            result.raceInfo.paceType = prev.raceInfo.paceType || result.raceInfo.paceType;
            _mergeFirst3fInfo(prev.raceInfo, result.raceInfo);
            if (String(prev.raceInfo.agari4f || '').trim()) result.raceInfo.agari4f = prev.raceInfo.agari4f;
            if (String(prev.raceInfo.agari3f_race || '').trim()) result.raceInfo.agari3f_race = prev.raceInfo.agari3f_race;
            if (prev.raceInfo.lapTimes && prev.raceInfo.lapTimes.some(v => v != null)) result.raceInfo.lapTimes = prev.raceInfo.lapTimes;
          }
          _sanDeep(result);
          allRacesData[raceNo] = result;
          // switchRaceTabは描画済みセクションをキャッシュ再利用するため、先に古い
          // セクションを破棄してから呼ばないと馬場状態などが再描画されない
          document.getElementById(`race-section-${raceNo}`)?.remove();
          if (currentRaceNo === raceNo) switchRaceTab(raceNo);
          try { renderPredictionPanel(raceNo); } catch(e) { _kvSwallow('_kvTickOddsAuto', e); }
          _kvSetOddsAutoNote(raceNo, '結果を確定取得');
          _kvSettledFetched[raceNo] = true;
        } else {
          delete _kvSettledFetched[raceNo];
        }
      } catch(e) { delete _kvSettledFetched[raceNo]; console.warn('[settle fetch]', raceNo, e); }
      return;   // この回はここまで（確定取得と通常オッズ更新を同時に行わない）
    }
    if (mins != null && (mins < -30 || mins > 240)) return;    // 発走30分後より先は何もしない

    const last = _kvOddsAutoLast[currentRaceNo] || 0;
    if (_kvOddsAutoBusy[raceNo] || Date.now() - last < 5 * 60 * 1000) return; // 5分間隔
    _kvOddsAutoBusy[raceNo] = true;
    let n;
    try {
      n = await fetchLiveOdds(raceNo);
      _kvOddsAutoLast[raceNo] = Date.now();
    } finally {
      delete _kvOddsAutoBusy[raceNo];
    }
    if (raceNo !== currentRaceNo || !allRacesData[raceNo]) return;  // 取得中にレース移動したら描画しない
    if (n > 0) {
      renderHorseRows(raceNo, allRacesData[raceNo].horses);
      if (allRacesData[raceNo].horses.some(h => h.postComment)) { try { _renderCommentsInTable(raceNo); } catch(e) { _kvSwallow('_kvTickOddsAuto#2', e); } }
      try { renderPredictionPanel(raceNo); } catch(e) { _kvSwallow('_kvTickOddsAuto#3', e); }      // オッズ変化でAI印・EVも見直す
      try { renderCockpitSummary(raceNo); renderOddsPanel(raceNo); _updateCockpitRaceStatus(raceNo); } catch(e) { _kvSwallow('_kvTickOddsAuto#4', e); }
      _kvSetOddsAutoNote(raceNo, '自動更新');
    }
  } catch(e) { /* 未発売・プロキシ失敗などは静かに次回へ */ }
}

/** 出馬表モード切替：レース前（AI印・オッズ・スコア）⇔ 記録（タイム・前半3F・ペース等の入力列） */
function setDebanMode(raceNo, pre) {
  const t = document.getElementById(`deban-table-${raceNo}`);
  if (!t) return;
  t.classList.toggle('deban-pre', !!pre);
  if (allRacesData[raceNo]) allRacesData[raceNo]._debanPre = !!pre;
  const btn = document.getElementById(`deban-mode-btn-${raceNo}`);
  if (btn) btn.innerHTML = pre ? '📝 記録表示へ' : '🏇 出馬表表示へ';
}
function toggleDebanMode(raceNo) {
  const t = document.getElementById(`deban-table-${raceNo}`);
  if (t) setDebanMode(raceNo, !t.classList.contains('deban-pre'));
}

// ══════════════ マイ印・注目馬メモ（2026-07-10）══════════════
// 自分の印（◎○▲△☆✕）とメモをレース×馬番ごとに端末保存（localStorage）。
// AI印とは独立した「自分の予想」列。プルダウンで印を選択、✎でメモ編集。閲覧者も操作可。
const KV_MYMARKS_KEY = 'kv_myMarks_v1';
const KV_MARK_OPTS = ['', '◎', '○', '▲', '△', '☆', '✕'];
function _kvMarksRead() { try { return JSON.parse(localStorage.getItem(KV_MYMARKS_KEY) || '{}'); } catch (e) { return {}; } }
function _kvMarksWrite(all) { try { localStorage.setItem(KV_MYMARKS_KEY, JSON.stringify(all)); } catch (e) { _kvSwallow('_kvMarksWrite', e); } }
function kvGetMyMark(raceDate, raceNo, umaBan) {
  const rec = _kvMarksRead()[`${raceDate}_${raceNo}`];
  return (rec && rec[umaBan]) ? rec[umaBan] : { m: '', memo: '' };
}
function _kvSetMyMark(raceDate, raceNo, umaBan, patch) {
  const all = _kvMarksRead();
  const rk = `${raceDate}_${raceNo}`;
  const rec = all[rk] = all[rk] || {};
  const cur = rec[umaBan] = Object.assign({ m: '', memo: '' }, rec[umaBan] || {}, patch);
  if (!cur.m && !cur.memo) { delete rec[umaBan]; if (!Object.keys(rec).length) delete all[rk]; }
  _kvMarksWrite(all);
  return cur;
}
function _kvMarkEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
/** マイ印セルのHTML（PC行・スマホカード共用）。プルダウンで印を選択・✎でメモ。 */
function kvMyMarkHtml(raceDate, raceNo, umaBan, compact) {
  const v = kvGetMyMark(raceDate, raceNo, umaBan);
  const markCls = v.m ? ` kv-mymark--${'◎○▲△☆✕'.indexOf(v.m)}` : '';
  const opts = KV_MARK_OPTS.map(o => `<option value="${o}" ${o === v.m ? 'selected' : ''}>${o || '－'}</option>`).join('');
  const sel = `<select class="kv-mymark${markCls}${v.m ? ' set' : ''}" data-rn="${raceNo}" data-uma="${umaBan}"
    title="自分の印を選ぶ（◎○▲△☆✕）" onchange="kvSetMyMarkSel(${raceNo},${umaBan},this.value)">${opts}</select>`;
  const memoBtn = compact && !v.memo ? '' :
    `<button type="button" class="kv-mymemo${v.memo ? ' has-memo' : ''}" data-rn="${raceNo}" data-uma="${umaBan}"
       title="${v.memo ? _kvMarkEsc(v.memo) : 'この馬にメモを残す'}" onclick="kvEditMyMemo(event,${raceNo},${umaBan})">${v.memo ? '📝' : '✎'}</button>`;
  return `<span class="kv-mymark-wrap">${sel}${memoBtn}</span>`;
}
function _kvRefreshMarkCells(raceNo, umaBan) {
  const d = allRacesData[raceNo]; if (!d) return;
  const raceDate = d.raceInfo?.raceDate || '';
  document.querySelectorAll(`.kv-mymark-wrap`).forEach(wrap => {
    const b = wrap.querySelector('.kv-mymark');
    if (!b || parseInt(b.dataset.rn) !== raceNo || parseInt(b.dataset.uma) !== umaBan) return;
    const compact = !!wrap.closest('.kv-sp-row');
    wrap.outerHTML = kvMyMarkHtml(raceDate, raceNo, umaBan, compact);
  });
}
function kvSetMyMarkSel(raceNo, umaBan, val) {
  const d = allRacesData[raceNo]; if (!d) return;
  const raceDate = d.raceInfo?.raceDate || '';
  _kvSetMyMark(raceDate, raceNo, umaBan, { m: val });
  _kvRefreshMarkCells(raceNo, umaBan);
}
function kvEditMyMemo(ev, raceNo, umaBan) {
  ev.stopPropagation();
  const d = allRacesData[raceNo]; if (!d) return;
  const raceDate = d.raceInfo?.raceDate || '';
  const horse = d.horses.find(h => parseInt(h.umaBan) === parseInt(umaBan));
  const cur = kvGetMyMark(raceDate, raceNo, umaBan);
  const memo = prompt(`${horse ? horse.horseName : `馬番${umaBan}`} のメモ（空で削除）`, cur.memo || '');
  if (memo === null) return;
  _kvSetMyMark(raceDate, raceNo, umaBan, { memo: memo.trim() });
  _kvRefreshMarkCells(raceNo, umaBan);
}

// ══════════════ 近5走インライン展開（2026-07-10）══════════════
// 出馬表の近5走チップをタップすると、その馬の直近5走の詳細（能力表のエッセンス）を
// 行のすぐ下に展開する。もう一度タップで閉じる。「出馬表と能力表を1つに」の要望対応。
function kvToggleHist(ev, raceNo, umaBan, horseName) {
  ev.stopPropagation();
  const src = ev.currentTarget.closest('tr');
  if (!src) return;
  // 既に開いていれば閉じる（PC行・スマホ行のどちらから開いても同じ展開行を共有）
  const existId = `kv-hist-${raceNo}-${umaBan}`;
  const exist = document.getElementById(existId);
  if (exist) { exist.remove(); return; }
  const d = allRacesData[raceNo]; if (!d) return;
  const hist = getHorseHistoryBefore(horseName, d.raceInfo?.raceDate || '', parseInt(raceNo)).slice(0, 5);
  const rows = hist.map(h => {
    const ch = parseInt(h.chakujun);
    const chBadge = isNaN(ch) ? '－' : `<span class="chakujun-badge ${chakujunClass(h.chakujun)}">${ch}</span>`;
    return `<tr>
      <td>${escapeHTML((h.raceDate || '').slice(2))}</td>
      <td>${escapeHTML(h.raceNo)}R</td>
      <td>${escapeHTML(h.raceClass || h._raceClass) || '－'}</td>
      <td>${String(h.distance || '').replace(/[^\d]/g, '') || '－'}m</td>
      <td>${escapeHTML(h.trackCond) || '－'}</td>
      <td>${chBadge}</td>
      <td>${escapeHTML(h.time) || '－'}</td>
      <td>${escapeHTML(h.agari3f) || '－'}</td>
      <td>${escapeHTML(h.corner) || '－'}</td>
      <td>${escapeHTML(h.jockey) || '－'}</td>
    </tr>`;
  }).join('');
  const tr = document.createElement('tr');
  tr.className = 'kv-hist-row';
  tr.id = existId;
  tr.innerHTML = `<td colspan="22">
    <div class="kv-hist-title">🐴 ${escapeHTML(horseName)} の近5走
      <button type="button" class="kv-hist-jump" onclick="switchViewTab(${raceNo},'ability')">全頭の能力表を見る →</button>
    </div>
    ${hist.length ? `<div style="overflow-x:auto"><table class="kv-hist-tbl">
      <thead><tr><th>日付</th><th>R</th><th>クラス</th><th>距離</th><th>馬場</th><th>着順</th><th>タイム</th><th>上がり3F</th><th>通過</th><th>騎手</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : '<p style="font-size:12px;color:#94a3b8;margin:0">高知での出走記録がまだありません（初出走）</p>'}
  </td>`;
  // スマホカード行（horse-rowの次のkv-sp-row）の後に挿入＝PC/スマホどちらでも直下に出る
  const anchor = src.classList.contains('kv-sp-row') ? src : (src.nextElementSibling?.classList.contains('kv-sp-row') ? src.nextElementSibling : src);
  anchor.after(tr);
}

const KV_FAVORITE_KEY = 'kv_favorite_horses_v1';
function kvFavoriteHorses() {
  try {
    const rows = JSON.parse(localStorage.getItem(KV_FAVORITE_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(x => x && typeof x.name === 'string').slice(0, 50) : [];
  } catch(e) { return []; }
}
function kvIsFavoriteHorse(name) { return kvFavoriteHorses().some(x => x.name === name); }
function kvFavoriteButtonHtml(name, compact) {
  const on = kvIsFavoriteHorse(name), esc = jsAttrEsc(name);
  return `<button type="button" class="kv-fav-btn${on ? ' is-on' : ''}" data-favorite-horse="${escapeHTML(name)}" onclick="event.stopPropagation();kvToggleFavoriteHorse('${esc}')" aria-label="${on ? 'お気に入りから外す' : 'お気に入りに追加'}" title="${on ? 'お気に入りから外す' : 'お気に入りに追加'}">${on ? '♥' : '♡'}</button>`;
}
function kvToggleFavoriteHorse(name) {
  const rows = kvFavoriteHorses(), idx = rows.findIndex(x => x.name === name);
  if (idx >= 0) rows.splice(idx, 1); else rows.unshift({ name, addedAt: new Date().toISOString() });
  try { localStorage.setItem(KV_FAVORITE_KEY, JSON.stringify(rows.slice(0, 50))); } catch(e) { _kvSwallow('kvToggleFavoriteHorse', e); }
  document.querySelectorAll('[data-favorite-horse]').forEach(btn => {
    if (btn.dataset.favoriteHorse !== name) return;
    const on = idx < 0; btn.classList.toggle('is-on', on); btn.textContent = on ? '♥' : '♡';
    const label = on ? 'お気に入りから外す' : 'お気に入りに追加';
    btn.setAttribute('aria-label', label); btn.title = label;
  });
  renderFavoriteHorsesPanel();
}
function kvOpenFavoriteHistory(name) {
  switchPage('search');
  const input = document.getElementById('xs-input');
  if (input) { input.value = name; input.focus(); }
  if (typeof kvCrossSearch === 'function') kvCrossSearch();
}
function kvOpenFavoriteRace(raceNo) {
  switchPage('deban');
  if (allRacesData[raceNo]) switchRaceTab(Number(raceNo));
}
function renderNextRaceHomeCard() {
  const card = document.getElementById('next-race-home-card'), body = document.getElementById('next-race-home-body');
  if (!card || !body) return;
  const entries = Object.entries(allRacesData || {}).map(([raceNo,data]) => ({ raceNo:Number(raceNo), data }))
    .filter(x => x.data?.horses?.length).sort((a,b) => a.raceNo - b.raceNo);
  const next = entries.find(x => !x.data.horses.some(h => /^\d+$/.test(String(h.chakujun || '')))) || entries[0];
  if (!next) { card.classList.add('hidden'); return; }
  const info = next.data.raceInfo || {}, observed = Date.parse(next.data._liveOddsObservedAt || '');
  const age = Number.isFinite(observed) ? Math.max(0, Math.round((Date.now() - observed) / 60000)) : null;
  const oddsState = age == null ? 'オッズ未取得' : age <= 5 ? `オッズ${age}分前` : `オッズが古い（${age}分前）`;
  const aiState = next.data._raceHistoryReady || _idbFullReady ? '能力評価を表示可能' : '能力データ準備中';
  body.innerHTML = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="race-badge">${next.raceNo}R</span><div style="flex:1;min-width:180px"><strong>${escapeHTML(info.raceName || `${next.raceNo}R`)}</strong><div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHTML(info.postTime || info.hassouTime || '発走時刻—')}・${escapeHTML(info.distance || '')} ${escapeHTML(info.trackCond || '')}</div><div style="font-size:11px;color:${age != null && age > 5 ? '#d97706' : '#0f766e'};margin-top:3px">${oddsState}・${aiState}</div></div><button type="button" class="btn btn-primary viewer-ok" onclick="kvOpenFavoriteRace(${next.raceNo})">判断画面へ</button></div>`;
  card.classList.remove('hidden');
}
function renderFavoriteHorsesPanel() {
  const el = document.getElementById('favorite-horses-list'); if (!el) return;
  const rows = kvFavoriteHorses();
  renderNextRaceHomeCard();
  if (!rows.length) { el.innerHTML = '<p class="kv-favorite-empty">出馬表の♡を押すと、ここにウォッチ中の馬を表示します。</p>'; return; }
  const todayStarts = new Map();
  Object.entries(allRacesData || {}).forEach(([raceNo,data]) => (data?.horses || []).forEach(h => {
    if (!h.horseName || todayStarts.has(h.horseName)) return;
    const odds = parseFloat(h.odds), post = data.raceInfo?.postTime || data.raceInfo?.hassouTime || '';
    todayStarts.set(h.horseName, { raceNo:Number(raceNo), odds:Number.isFinite(odds) ? odds : null, post });
  }));
  el.innerHTML = rows.map(x => {
    const start = todayStarts.get(x.name);
    const live = start ? `<span style="font-size:11px;color:#0f766e;font-weight:700">本日${start.raceNo}R${start.post ? ` ${escapeHTML(start.post)}` : ''}${start.odds ? `・単勝${start.odds.toFixed(1)}倍` : ''}</span><button type="button" class="btn btn-primary btn-sm viewer-ok" onclick="kvOpenFavoriteRace(${start.raceNo})">レースへ</button>` : '';
    return `<div class="kv-favorite-item"><span style="color:#e11d48">♥</span><strong>${escapeHTML(x.name)}</strong>${live}<button type="button" class="btn btn-secondary btn-sm viewer-ok" onclick="kvOpenFavoriteHistory('${jsAttrEsc(x.name)}')"><i class="fas fa-history"></i> 履歴</button><button type="button" class="kv-fav-btn is-on" data-favorite-horse="${escapeHTML(x.name)}" onclick="kvToggleFavoriteHorse('${jsAttrEsc(x.name)}')" aria-label="お気に入りから外す">♥</button></div>`;
  }).join('');
}

function renderHorseRows(raceNo, horses) {
  const tbody=document.getElementById(`tbody-${raceNo}`); if(!tbody)return;
  const _isAdminView = (typeof isAdminMode === 'function' && isAdminMode());
  const _historyReady = _idbFullReady || !!allRacesData[raceNo]?._raceHistoryReady;
  const _historyError = !_historyReady && !!allRacesData[raceNo]?._raceHistoryError;
  const _aiReady = _idbFullReady;
  const _cy = (_aiReady && typeof computeYosoScored === 'function') ? computeYosoScored(raceNo, null) : null;
  if (_cy && typeof recordForwardRankingSnapshot === 'function') {
    try { recordForwardRankingSnapshot(raceNo, _cy); } catch (e) { console.warn('[aiPredictionSnapshot hook]', e); }
  }
  if (_cy && window.kvAiCachePrediction) {
    try { window.kvAiCachePrediction(raceNo, _cy); } catch (e) { console.warn('[aiPrecalc hook]', e); }
  }
  if (_cy && typeof computeOpponentShadow === 'function' && typeof recordForwardOpponentShadowSnapshot === 'function') {
    try {
      const _opShadow = computeOpponentShadow(raceNo, _cy.scored);
      if (_opShadow) recordForwardOpponentShadowSnapshot(raceNo, _opShadow);
    } catch (e) { console.warn('[opponentShadowSnapshot hook]', e); }
  }
  if (_cy && (typeof window.kvCaptureVnextPartnerShadow === 'function' ||
      typeof window.kvCaptureVnextMarketBlendShadow === 'function')) {
    const _partnerCaptureDate = String(allRacesData[raceNo]?.raceInfo?.raceDate || '');
    const _partnerCaptureScored = _cy.scored;
    const _partnerTokens = renderHorseRows._partnerTokens || (renderHorseRows._partnerTokens = {});
    const _partnerCaptureToken = _partnerTokens[raceNo] = (_partnerTokens[raceNo] || 0) + 1;
    const _capturePartnerShadows = () => {
      if (_partnerTokens[raceNo] !== _partnerCaptureToken ||
          String(allRacesData[raceNo]?.raceInfo?.raceDate || '') !== _partnerCaptureDate) return;
      if (typeof window.kvCaptureVnextPartnerShadow === 'function') {
        try { window.kvCaptureVnextPartnerShadow(raceNo, _partnerCaptureScored); }
        catch (e) { console.warn('[vnextPartnerShadow hook]', e); }
      }
      if (typeof window.kvCaptureVnextMarketBlendShadow === 'function') {
        try { window.kvCaptureVnextMarketBlendShadow(raceNo, _partnerCaptureScored); }
        catch (e) { console.warn('[vnextMarketBlendShadow hook]', e); }
      }
    };
    if (typeof _kvScheduleIdle === 'function') _kvScheduleIdle(_capturePartnerShadows, 1600);
    else setTimeout(_capturePartnerShadows, 0);
  }
  if (_cy && typeof window.kvCaptureEraDriftShadow === 'function') {
    try { window.kvCaptureEraDriftShadow(raceNo, _cy.scored); }
    catch (e) { console.warn('[eraDriftShadow hook]', e); }
  }
  if (_cy && window.KvProbabilityCalibration?.captureForward) {
    try { window.KvProbabilityCalibration.captureForward(raceNo, _cy.scored); }
    catch (e) { console.warn('[probabilityCalibration hook]', e); }
  }
  if (_cy && typeof window.kvCaptureT10ValueShadow === 'function') {
    try { window.kvCaptureT10ValueShadow(raceNo, _cy.scored); }
    catch (e) { console.warn('[valueT10Shadow hook]', e); }
  }
  const _AI_MARKS = ['◎', '○', '▲', '△', '×', '×'];
  const _aiMap = {};
  if (_cy) {
    _cy.scored.forEach((s, i) => {
      _aiMap[s.horse.horseName] = { mark: _AI_MARKS[i] || '', rank: s.totalScore != null ? i + 1 : null, score: s.totalScore };
    });
  }
  // 全行を一括innerHTML（12回のappendChildを1回に削減）
  tbody.innerHTML=horses.map(horse=>{
    const waku=parseInt(horse.wakuBan)||Math.ceil(horse.umaBan/2);
    const wCls=`waku-${Math.min(Math.max(waku,1),8)}`;
    const mukaeCls=horse.mukaeShoumen?` pos-val-${posClass(horse.mukaeShoumen,'mukaeShoumen')}`:'';
    const strCls=horse.shoumenStraight?` pos-val-${posClass(horse.shoumenStraight,'shoumenStraight')}`:'';
    const _ai=_aiMap[horse.horseName]||{mark:'',rank:null,score:null};
    const _aiCls=_ai.rank==null?'ai-rx':_ai.rank<=4?`ai-r${_ai.rank}`:'ai-rx';
    const _oddsV=parseFloat(horse.odds);
    // 近5走チップ（PC表の列とスマホカード行の両方で使用）
    const _rfHtml=(()=>{
      if (_historyError) return `<button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation();kvRetryRaceHorseHistory(${raceNo})" title="対象馬の履歴取得を再試行します"><i class="fas fa-redo"></i> 履歴再試行</button>`;
      if (!_historyReady) return '<span class="rf-none"><i class="fas fa-spinner fa-spin"></i> 履歴準備中</span>';
      const _rf=getHorseHistoryBefore(horse.horseName,allRacesData[raceNo]?.raceInfo?.raceDate||'',parseInt(raceNo)).slice(0,5);
      if(!_rf.length) return '<span class="rf-none">初出走</span>';
      return _rf.map(h=>{
        const ch=parseInt(h.chakujun);
        const cls=isNaN(ch)?'rf-x':ch===1?'rf-1':ch===2?'rf-2':ch===3?'rf-3':'rf-o';
        const tip=`${h.raceDate||''} ${h.raceClass||''} ${h.distance||''} ${isNaN(ch)?'':ch+'着'}`.trim();
        return `<span class="rf-chip ${cls}" title="${escapeHTML(tip)}">${isNaN(ch)?'－':ch}</span>`;
      }).join('');
    })();
    // 外部由来(スクレイピング/入力)文字列の表示・属性エスケープ（jsAttrEsc=onclick内JS文字列用・escapeHTML=通常表示/属性用）
    const _nameEsc=jsAttrEsc(horse.horseName);
    const _nameHtml=escapeHTML(horse.horseName);
    const _jockeyHtml=escapeHTML(horse.jockey||'');
    const _trainerHtml=escapeHTML(horse.trainer||'');
    const _belongHtml=escapeHTML(horse.belong||'');
    const _sexAgeHtml=escapeHTML(horse.sexAge||'');
    const _timeHtml=escapeHTML(horse.time||'');
    const _agari3fHtml=escapeHTML(horse.agari3f||'');
    const _cornerHtml=escapeHTML(horse.corner||'');
    const _first3fHtml=escapeHTML(horse.first3f||'');
    const _paceTypeHtml=escapeHTML(horse.paceType||'');
    // 手入力が無い馬は、同じ距離×クラス×馬場の基準と比べた自動判定を「推定」印付きで出す。
    // 手入力(paceType)には触れない。保存済みの値が無ければその場で判定する（同梱の基準表が
    // あるので、全履歴を展開していない端末でも出る＝開く画面の順番に依存しない）。
    let _paceAuto = '', _paceAutoDev = null;
    if (!horse.paceType) {
      if (horse.paceTypeAuto) { _paceAuto = String(horse.paceTypeAuto); _paceAutoDev = horse.paceDevAuto; }
      else if (horse.first3f) {
        const _ri = allRacesData[raceNo]?.raceInfo;
        const _pr = getHorsePaceLabel(horse.first3f, _ri?.distance, _ri?.raceClass, _ri?.trackCond);
        if (_pr) { _paceAuto = _pr.label; _paceAutoDev = _pr.z; }
      }
    }
    const _paceAutoHtml = _paceAuto
      ? `<span class="pace-auto ${getPaceDotClass(_paceAuto)}" title="${escapeHTML(`同じ距離・クラス・馬場の基準と比べた推定です（基準との差 ${_paceAutoDev != null ? (_paceAutoDev > 0 ? '+' : '') + _paceAutoDev : '—'}σ）`)}">${escapeHTML(_paceAuto)}</span>`
      : '';
    const _raced=/^\d+$/.test(String(horse.chakujun));
    return `<tr class="horse-row">
      <td class="col-chakujun">${horse.chakujun?`<span class="chakujun-badge ${chakujunClass(horse.chakujun)}">${horse.chakujun}</span>`:'<span class="data-empty">—</span>'}</td>
      <td class="col-waku"><span class="waku-badge ${wCls}">${horse.wakuBan}</span></td>
      <td class="col-ninki">${horse.ninki?ninkiBadge(horse.ninki):'－'}</td>
      <td class="col-umano"><span class="umano-badge">${horse.umaBan}</span></td>
      <td class="col-ai">${_ai.mark?`<span class="ai-mark ${_aiCls}">${_ai.mark}</span>`:'<span class="data-empty">—</span>'}</td>
      <td class="col-mymark">${kvMyMarkHtml(allRacesData[raceNo]?.raceInfo?.raceDate||'',raceNo,horse.umaBan,false)}</td>
      <td class="col-umaname">${kvFavoriteButtonHtml(horse.horseName,false)}<span class="horse-name horse-name-link" onclick="openHorseModal('${_nameEsc}',${raceNo})"><i class="fas fa-history horse-hist-icon"></i>${_nameHtml}</span></td>
      <td class="col-recent" title="クリックで近5走の詳細をこの場に展開" onclick="kvToggleHist(event,${raceNo},${horse.umaBan},'${_nameEsc}')">${_rfHtml}</td>
      <td class="col-belong">${_belongHtml||'－'}</td>
      <td class="col-sexage">${_sexAgeHtml||'－'}</td>
      <td class="col-kinryo">${horse.kinryo||'－'}</td>
      <td class="col-jockey">${_jockeyHtml||'－'}</td>
      <td class="col-trainer">${_trainerHtml||'－'}</td>
      <td class="col-weight">${horse.weight||'－'}</td>
      <td class="col-odds">${(!isNaN(_oddsV)&&_oddsV>0)?_oddsV.toFixed(1):'<span class="data-empty">—</span>'}</td>
      <td class="col-aiscore">${_ai.score!=null?`<span class="ai-rank-chip">${_ai.rank}位</span> ${_ai.score.toFixed(1)}`:'<span class="data-empty">—</span>'}</td>
      <td class="col-time">${_timeHtml||'<span class="data-empty">—</span>'}</td>
      <td class="col-agari3f">${_agari3fHtml||'<span class="data-empty">—</span>'}</td>
      <td class="col-corner">${horse.corner?`<span class="corner-text">${_cornerHtml}</span>`:'<span class="data-empty">—</span>'}</td>
      <td class="col-3f"><div class="threef-cell admin-only"><input type="number" class="threef-input" value="${_first3fHtml}" step="0.1" min="30" max="60" placeholder="--.-" oninput="onHorse3FInput(this,${raceNo},${horse.umaBan})"><span class="threef-unit">秒</span></div><span class="viewer-only vw-val">${horse.first3f?_first3fHtml+'秒':'—'}</span></td>
      <td class="col-pace"><div class="horse-pace-cell admin-only"><select class="pace-select" onchange="onHorsePaceChange(this,${raceNo},${horse.umaBan})"><option value="">－</option><option value="ハイ" ${horse.paceType==='ハイ'?'selected':''}>ハイ</option><option value="ミドル" ${horse.paceType==='ミドル'?'selected':''}>ミドル</option><option value="スロー" ${horse.paceType==='スロー'?'selected':''}>スロー</option></select><span class="pace-dot ${getPaceDotClass(horse.paceType)}"></span>${_paceAutoHtml}</div><span class="viewer-only vw-val">${_paceTypeHtml||_paceAutoHtml||'—'}</span></td>
      <td class="col-mukae${mukaeCls}"><select class="pos-select admin-only" onchange="onHorsePosChange(this,${raceNo},${horse.umaBan},'mukaeShoumen')" tabindex="0"><option value="">－</option><option value="最内" ${horse.mukaeShoumen==='最内'?'selected':''}>最内</option><option value="内" ${horse.mukaeShoumen==='内'?'selected':''}>内</option><option value="外2" ${horse.mukaeShoumen==='外2'?'selected':''}>外2</option><option value="外3" ${horse.mukaeShoumen==='外3'?'selected':''}>外3</option><option value="大外" ${horse.mukaeShoumen==='大外'?'selected':''}>大外</option></select><span class="viewer-only vw-val">${horse.mukaeShoumen||'—'}</span></td>
      <td class="col-straight${strCls}"><select class="pos-select admin-only" onchange="onHorsePosChange(this,${raceNo},${horse.umaBan},'shoumenStraight')" tabindex="0"><option value="">－</option><option value="内" ${horse.shoumenStraight==='内'?'selected':''}>内</option><option value="中" ${horse.shoumenStraight==='中'?'selected':''}>中</option><option value="外" ${horse.shoumenStraight==='外'?'selected':''}>外</option></select><span class="viewer-only vw-val">${horse.shoumenStraight||'—'}</span></td>
    </tr>
    <tr class="kv-sp-row">
      <td colspan="22">
        <div class="spr-l1">
          ${(_raced && _isAdminView)?`<span class="chakujun-badge ${chakujunClass(horse.chakujun)}">${horse.chakujun}</span>`:`<span class="waku-badge ${wCls}">${horse.wakuBan}</span>`}
          <span class="umano-badge">${horse.umaBan}</span>
          ${_ai.mark?`<span class="ai-mark ${_aiCls}">${_ai.mark}</span>`:''}
          ${kvMyMarkHtml(allRacesData[raceNo]?.raceInfo?.raceDate||'',raceNo,horse.umaBan,true)}
          ${kvFavoriteButtonHtml(horse.horseName,true)}
          <span class="spr-name" onclick="openHorseModal('${_nameEsc}',${raceNo})">${_nameHtml}</span>
          ${(!isNaN(_oddsV)&&_oddsV>0)?`<span class="spr-odds">${_oddsV.toFixed(1)}<small>倍</small></span>`:''}
          ${horse.ninki?ninkiBadge(horse.ninki):''}
        </div>
        <div class="spr-l2">
          <span><b>${_jockeyHtml||'－'}</b>${horse.kinryo?` ${horse.kinryo}`:''}</span>
          <span>${_sexAgeHtml}${horse.weight?` ${horse.weight}`:''}</span>
          ${!_raced&&_ai.score!=null?`<span class="spr-score">AI ${_ai.rank}位 ${_ai.score.toFixed(1)}</span>`:''}
        </div>
        ${(_raced && _isAdminView)?`<div class="spr-l3 spr-result">
          ${horse.time?`<span>タイム <b>${_timeHtml}</b></span>`:''}
          ${horse.agari3f?`<span>上がり ${_agari3fHtml}</span>`:''}
          ${horse.corner?`<span>通過 ${_cornerHtml}</span>`:''}
          ${horse.first3f?`<span>前半 ${_first3fHtml}</span>`:''}
          ${horse.paceType?`<span class="spr-pace">${_paceTypeHtml}</span>`:''}
        </div>`:`<div class="spr-l3" onclick="kvToggleHist(event,${raceNo},${horse.umaBan},'${_nameEsc}')">${_rfHtml}</div>`}
        <details class="spr-more"><summary>詳しい情報を開く</summary><div class="spr-more-grid"><span>厩舎<b>${_trainerHtml||'—'}</b></span><span>所属<b>${_belongHtml||'—'}</b></span><span>性齢・斤量<b>${_sexAgeHtml||'—'} ${escapeHTML(horse.kinryo||'—')}</b></span><span>馬体重<b>${escapeHTML(horse.weight||'—')}</b></span></div></details>
      </td>
    </tr>`;
  }).join('');
  // 初期モード：閲覧者は常にレース前ビュー（近5走・AI印が見える簡易表示）。
  //   結果は独立した「結果」タブへ移したので、閲覧者の出馬表は結果ありでも記録列を出さない。
  //   管理者は従来どおり結果ありレースは記録ビュー（入力用）で開く。手動切替は記憶される。
  const _isAdmin = (typeof isAdminMode === 'function' && isAdminMode());
  const _hasResults = horses.some(h => /^\d+$/.test(String(h.chakujun)));
  const _preDefault = allRacesData[raceNo]?._debanPre ?? (_isAdmin ? !_hasResults : true);
  setDebanMode(raceNo, _preDefault);
  // 結果タブの表示可否（結果ありレースのみ）
  try { _kvSyncKekkaTab(raceNo, _hasResults); } catch (e) { _kvSwallow('_rfHtml', e); }
  _restoreCommentRows(raceNo);
}

// ── ソート状態管理 ──────────────────────────────────────────
const _sortState = {}; // { raceNo: { key, dir } }

function sortTable(raceNo, key) {
  const data = allRacesData[raceNo]; if(!data) return;

  // 現在のソート状態を取得・切り替え
  const prev = _sortState[raceNo] || { key: null, dir: 'asc' };
  const dir  = (prev.key === key && prev.dir === 'asc') ? 'desc' : 'asc';
  _sortState[raceNo] = { key, dir };

  // ヘッダーのアイコン更新
  const thead = document.getElementById(`thead-row-${raceNo}`);
  if (thead) {
    thead.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sort-asc','sort-desc');
      th.setAttribute('aria-sort','none');
      if (th.getAttribute('onclick') && th.getAttribute('onclick').includes(`'${key}'`)) {
        th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
      }
    });
  }

  // ソート用の値抽出ヘルパー
  function getSortVal(horse, k) {
    switch(k) {
      case 'chakujun': {
        const n = parseInt(horse.chakujun);
        // 着順なし（出走前）は最後尾に
        return isNaN(n) ? (dir==='asc' ? 9999 : -1) : n;
      }
      case 'waku':    return parseInt(horse.wakuBan) || 99;
      case 'ninki':   return parseInt(horse.ninki)   || 99;
      case 'umaBan':  return parseInt(horse.umaBan)  || 99;
      case 'kinryo':  return parseFloat(horse.kinryo)|| 99;
      case 'weight': {
        // 「506(-6)」形式から数値部分だけ取る
        const m = (horse.weight||'').match(/^(\d+)/);
        return m ? parseInt(m[1]) : (dir==='asc' ? 9999 : -1);
      }
      case 'time': {
        // 「1:23.8」形式 → 秒に変換
        const tm = (horse.time||'').match(/(\d+):(\d+\.\d+)/);
        if (tm) return parseInt(tm[1])*60 + parseFloat(tm[2]);
        return dir==='asc' ? 9999 : -1;
      }
      case 'agari3f': {
        const v = parseFloat(horse.agari3f);
        return isNaN(v) ? (dir==='asc' ? 9999 : -1) : v;
      }
      case 'first3f': {
        const v = parseFloat(horse.first3f);
        return isNaN(v) ? (dir==='asc' ? 9999 : -1) : v;
      }
      case 'corner': {
        // 「1-1-1-2」形式の最初の数字（1コーナー通過順）でソート
        const m = (horse.corner||'').match(/^(\d+)/);
        return m ? parseInt(m[1]) : (dir==='asc' ? 9999 : -1);
      }
      default: return 0;
    }
  }

  // ソート実行（元配列は変更せず、コピーをソート）
  const sorted = [...data.horses].sort((a, b) => {
    const va = getSortVal(a, key);
    const vb = getSortVal(b, key);
    return dir === 'asc' ? va - vb : vb - va;
  });

  // tbody を再描画（allRacesDataは変更しない）
  const tbody = document.getElementById(`tbody-${raceNo}`);
  if (!tbody) return;
  tbody.innerHTML = '';
  renderHorseRows(raceNo, sorted);
  // コメントが保存済みなら再描画
  if (data.horses.some(h => h.postComment)) {
    _renderCommentsInTable(raceNo);
  }
}

function posClass(val, field) {
  if (field==='mukaeShoumen') return {'最内':'uchi0','内':'uchi1','外2':'soto2','外3':'soto3','大外':'soto4'}[val]||'';
  return {'内':'straight-uchi','中':'straight-naka','外':'straight-soto'}[val]||'';
}
function chakujunClass(c) { const n=parseInt(c); return n===1?'chakujun-1':n===2?'chakujun-2':n===3?'chakujun-3':''; }
function ninkiBadge(ninki) { const n=parseInt(ninki); if(n===1)return`<span class="ninki-badge ninki-1">${ninki}</span>`; if(n===2)return`<span class="ninki-badge ninki-2">${ninki}</span>`; if(n===3)return`<span class="ninki-badge ninki-3">${ninki}</span>`; return`<span class="ninki-badge">${ninki}</span>`; }

function onHorse3FInput(input, raceNo, umaBan) {
  const data=allRacesData[raceNo]; if(!data)return;
  const horse=data.horses.find(h=>h.umaBan===umaBan); if(!horse)return;
  horse.first3f=input.value;
}
function onHorsePaceChange(select, raceNo, umaBan) {
  const data=allRacesData[raceNo]; if(!data)return;
  const horse=data.horses.find(h=>h.umaBan===umaBan); if(!horse)return;
  horse.paceType=select.value;
  const dot=select.parentElement.querySelector('.pace-dot'); if(dot)dot.className=`pace-dot ${getPaceDotClass(select.value)}`;
  renderPaceDistChart(raceNo);
}

function _wakuBg(w) {
  const m={1:'#e5e7eb',2:'#1e40af',3:'#dc2626',4:'#2563eb',5:'#ca8a04',6:'#16a34a',7:'#ea580c',8:'#7f1d1d'};
  return m[Math.min(Math.max(parseInt(w)||1,1),8)]||'#6b7280';
}
function _wakuFg(w) { return (parseInt(w)===1||parseInt(w)===5)?'#333':'#fff'; }

function renderPaceDistChart(raceNo) {
  const wrap = document.getElementById(`pace-dist-${raceNo}`);
  if (!wrap) return;
  const data = allRacesData[raceNo];
  if (!data) return;

  const horses = data.horses;
  const groups = {'ハイ':[],'ミドル':[],'スロー':[],'':[]};
  horses.forEach(h => { const p=h.paceType||''; (groups[p]!==undefined?groups[p]:groups['']).push(h); });

  const entered = groups['ハイ'].length + groups['ミドル'].length + groups['スロー'].length;
  if (!entered) { wrap.style.display='none'; return; }
  wrap.style.display='block';

  const total = horses.length;
  const pct = n => total>0 ? Math.round(n/total*100) : 0;

  const seg = (cls, arr, label) => {
    if (!arr.length) return '';
    const p=pct(arr.length);
    return `<div class="pace-dist-seg pd-seg-${cls}" style="width:${p}%" title="${label} ${arr.length}頭 (${p}%)">${p>=14?arr.length+'頭':''}</div>`;
  };

  const numsHtml = (arr) => arr.map(h=>{
    const wku=parseInt(h.wakuBan)||Math.ceil((parseInt(h.umaBan)||1)/2);
    return `<span class="pace-dist-unum" style="background:${_wakuBg(wku)};color:${_wakuFg(wku)}" title="${h.horseName}">${h.umaBan}</span>`;
  }).join('');

  const row = (color, dotCls, label, arr) => arr.length===0?'': `
    <div class="pace-dist-item">
      <span class="pace-dist-dot" style="background:${color}"></span>
      <span class="pace-dist-group-label" style="color:${color}">${label} ${arr.length}頭</span>
      <div class="pace-dist-nums">${numsHtml(arr)}</div>
    </div>`;

  wrap.innerHTML = `
    <div class="pace-dist-title"><i class="fas fa-chart-bar" style="color:#6366f1"></i> 馬別ペース分布 <span style="font-size:10px;color:#9ca3af;font-weight:400;">（${entered}/${total}頭入力済み）</span></div>
    <div class="pace-dist-bar">
      ${seg('high',groups['ハイ'],'ハイ')}
      ${seg('mid',groups['ミドル'],'ミドル')}
      ${seg('slow',groups['スロー'],'スロー')}
      ${seg('none',groups[''],'未入力')}
    </div>
    <div class="pace-dist-legend">
      ${row('#dc2626','pd-high','ハイ',groups['ハイ'])}
      ${row('#d97706','pd-mid','ミドル',groups['ミドル'])}
      ${row('#2563eb','pd-slow','スロー',groups['スロー'])}
      ${groups[''].length?`<div class="pace-dist-item"><span class="pace-dist-dot" style="background:#cbd5e1"></span><span class="pace-dist-group-label" style="color:#94a3b8">未入力 ${groups[''].length}頭</span></div>`:''}
    </div>`;
}
function onHorsePosChange(select, raceNo, umaBan, field) {
  const data=allRacesData[raceNo]; if(!data)return;
  const horse=data.horses.find(h=>h.umaBan===umaBan); if(!horse)return;
  horse[field]=select.value;
  const td=select.closest('td'); if(td){td.className=td.className.replace(/\s*pos-val-\S+/g,''); if(select.value)td.classList.add(`pos-val-${posClass(select.value,field)}`);}
}

/**
 * ペースパネル内のインライン馬場差表示を更新
 */
function _updateTrackBiasInline(raceNo) {
  const el = document.getElementById(`track-bias-inline-${raceNo}`);
  if (!el) return;
  const biasInfo = calcDayTrackBias();
  const dayBias  = biasInfo.median;
  if (dayBias == null || biasInfo.count === 0) {
    el.innerHTML = '';
    return;
  }
  const sign  = dayBias > 0 ? '+' : '';
  const clr   = dayBias < -0.3 ? '#dc2626' : dayBias > 0.3 ? '#7c3aed' : '#16a34a';
  const bg    = dayBias < -0.3 ? '#fee2e2' : dayBias > 0.3 ? '#ede9fe' : '#d1fae5';
  const label = dayBias < -0.3 ? '速い馬場' : dayBias > 0.3 ? '重い馬場' : '標準馬場';
  // 良馬場比較（このレースの基準差）
  const data = allRacesData[raceNo];
  let stdDiff = null;
  if (data) {
    const dist = getDistNum(data.raceInfo.distance);
    const effCls = getEffectiveClass(data.raceInfo.raceClass);
    const stdTime = (dist && effCls && STANDARD_TIMES[dist]?.[effCls]) || null;
    const top3 = (data.horses || [])
      .map(h => ({ chaku: parseInt(h.chakujun)||999, time: raceTimeToSec(h.time) }))
      .filter(h => h.chaku >= 1 && h.chaku <= 3 && h.time != null)
      .sort((a,b) => a.chaku - b.chaku).slice(0, 3);
    const top3avg = top3.length === 3 ? top3.reduce((s,h) => s + h.time, 0) / 3 : null;
    const center = typeof _raceBiasCenter === 'function' ? _raceBiasCenter(top3).center : top3avg;
    if (stdTime != null && center != null) stdDiff = +(center - stdTime).toFixed(2);
  }
  const stdDiffHtml = stdDiff !== null ? (()=>{
    const s2 = stdDiff > 0 ? '+' : '';
    const c2 = stdDiff < -0.9 ? '#dc2626' : stdDiff < -0.3 ? '#ea580c' : stdDiff > 0.6 ? '#7c3aed' : '#16a34a';
    const bg2 = stdDiff < -0.9 ? '#fecaca' : stdDiff < -0.3 ? '#fed7aa' : stdDiff > 0.6 ? '#ddd6fe' : '#bbf7d0';
    return `<span style="width:1px;height:16px;background:#cbd5e1;display:inline-block;margin:0 2px"></span><span style="font-size:10px;color:#6b7280;font-weight:600;">良比</span><span style="font-size:13px;font-weight:800;font-family:monospace;color:${c2};background:${bg2};padding:1px 5px;border-radius:4px">${s2}${stdDiff.toFixed(2)}秒</span>`;
  })() : '';
  el.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:6px;background:${bg};border:1px solid ${clr}30;border-radius:8px;padding:4px 10px;">
      <i class="fas fa-thermometer-half" style="color:${clr};font-size:11px;"></i>
      <span style="font-size:10px;color:#6b7280;font-weight:600;">当日馬場差</span>
      <span style="font-size:14px;font-weight:800;font-family:monospace;color:${clr};">${sign}${dayBias.toFixed(2)}秒</span>
      <span style="font-size:10px;font-weight:700;color:${clr};">${label}</span>
      <span style="font-size:9px;color:#9ca3af;">(${biasInfo.count}R)</span>
      ${stdDiffHtml}
    </div>`;
}

/**
 * 決着時計を1着馬から自動取得して表示し、1300/1400m等の前半3Fを補完する。
 */
function _updateFinishTime(raceNo) {
  const data = allRacesData[raceNo]; if (!data) return;
  const winner = data.horses.find(h => String(h.chakujun) === '1');
  const el = document.getElementById(`finish-time-${raceNo}`);
  if (el) {
    if (winner && winner.time) { el.textContent = winner.time; el.style.color = '#fbbf24'; }
    else { el.textContent = '—'; el.style.color = '#475569'; }
  }
  const rqsTime = document.getElementById(`rqs-time-${raceNo}`);
  if (rqsTime) {
    if (winner && winner.time) { rqsTime.textContent = winner.time; rqsTime.className = 'rqs-val'; }
    else { rqsTime.textContent = '—'; rqsTime.className = 'rqs-val rqs-empty'; }
  }
  _applyFirst3fAutofillToRace(raceNo, { replaceAuto:true });
}

function _updateRqsStrip(raceNo, f3, ag3, pace) {
  const _set = (id, val, paceClass) => {
    const el = document.getElementById(id);
    if (!el) return;
    // 数値のみNaN判定（ペース等の文字列は isNaN('スロー')=true で弾かれていたのを修正）
    const ok = val != null && val !== '' && !(typeof val === 'number' && isNaN(val));
    if (ok) {
      el.textContent = typeof val === 'number' ? val.toFixed(1) : val;
      el.className = 'rqs-val' + (paceClass ? ' ' + paceClass : '');
    } else {
      el.textContent = '—'; el.className = 'rqs-val rqs-empty';
    }
  };
  _set(`rqs-f3-${raceNo}`, f3);
  _set(`rqs-ag-${raceNo}`, ag3);
  if (!isNaN(f3) && !isNaN(ag3)) {
    const diff = f3 - ag3;
    const el = document.getElementById(`rqs-diff-${raceNo}`);
    if (el) { el.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1); el.className = 'rqs-val' + (diff < 0 ? ' rqs-pace-high' : diff > 1 ? ' rqs-pace-slow' : ' rqs-pace-mid'); }
  } else {
    const el = document.getElementById(`rqs-diff-${raceNo}`);
    if (el) { el.textContent = '—'; el.className = 'rqs-val rqs-empty'; }
  }
  const paceClass = pace === 'ハイ' ? 'rqs-pace-high' : pace === 'スロー' ? 'rqs-pace-slow' : pace === 'ミドル' ? 'rqs-pace-mid' : '';
  _set(`rqs-pace-${raceNo}`, pace || null, paceClass);
  // 基準比（クラス×馬場×距離平均との差）＋自動ペースラベル（既存ペース欄とは独立表示）
  const _devEl = document.getElementById(`rqs-dev-${raceNo}`);
  const _ri = allRacesData[raceNo]?.raceInfo;
  if (_devEl && _ri) {
    const r = (typeof getPaceDevLabel === 'function') ? getPaceDevLabel(_ri.distance, _ri.raceClass, _ri.trackCond, f3) : null;
    if (r) {
      _devEl.textContent = `${r.dev > 0 ? '+' : ''}${r.dev.toFixed(1)} ${r.label}`;
      _devEl.className = 'rqs-val ' + (r.label === 'ハイ' ? 'rqs-pace-high' : r.label === 'スロー' ? 'rqs-pace-slow' : 'rqs-pace-mid');
    } else {
      _devEl.textContent = '—'; _devEl.className = 'rqs-val rqs-empty';
    }
  }
}

/**
 * 前後半差バッジを更新
 * 前後半差 = 前半3F - 上がり3F
 * -2.0以下 → ハイ、-1.0〜-2.0 → ミドル、-1.0より大きい → スロー（の目安）
 */
function _updatePaceDiffBadge(raceNo, f3, agari3f) {
  const el = document.getElementById(`pace-diff-badge-${raceNo}`); if (!el) return;
  if (!isNaN(f3) && !isNaN(agari3f)) {
    const diff = +(f3 - agari3f).toFixed(1);
    const sign = diff > 0 ? '+' : '';
    let clr;
    if (diff <= -2.0) clr = '#dc2626';       // ハイ
    else if (diff <= -0.5) clr = '#d97706';  // ミドル
    else clr = '#2563eb';                    // スロー
    el.textContent = `${sign}${diff}秒`;
    el.style.color = clr;
  } else {
    el.textContent = '—';
    el.style.color = '#6b7280';
  }
}

function updateRacePace(raceNo) {
  const f3Input  = document.getElementById(`race-first3f-${raceNo}`);
  const ag3Input = document.getElementById(`race-agari3f-${raceNo}`);
  const badge    = document.getElementById(`pace-badge-${raceNo}`);
  if (!f3Input || !badge) return;
  const data = allRacesData[raceNo]; if (!data) return;

  const f3  = parseFloat(f3Input.value);
  const ag3 = parseFloat(ag3Input?.value);

  // 前後半差バッジ更新
  _updatePaceDiffBadge(raceNo, f3, ag3);

  if (isNaN(f3)) {
    data.raceInfo.first3f = '';
    if (!data.raceInfo.manualPace) {
      // 前半3Fが無い古いレース（2014〜2021年）でも、保存済みの自動ペースラベルがあれば
      // 「－」ではなくそれを出す（2026-08-04）。backfillPaceLabels が同条件の基準と比べて
      // 付けた値で、15,416レース中14,925レースに入っている。
      // ⛔ data.raceInfo.paceType には入れない。保存時にサーバーへ書かれて手入力と
      //    区別が付かなくなるため、表示だけに使う。
      const _saved = lsRead()[`race_31_${data.raceInfo.raceDate}_${raceNo}`];
      const _auto = _saved?.paceTypeAuto || '';
      if (_auto) {
        badge.textContent = _auto;
        badge.className = `pace-badge ${getPaceBadgeClass(_auto)} is-estimated`;
        badge.title = '前半3Fが記録されていないため、同じ距離・クラス・馬場の基準と比べて推定した値です';
      } else {
        badge.textContent = '－'; badge.className = 'pace-badge pace-none'; badge.title = '';
      }
      data.raceInfo.paceType = '';
    }
    return;
  }
  data.raceInfo.first3f = String(f3);
  if (data.raceInfo.manualPace) return;

  // ① 前後半差ベースのペース判定を優先
  let pace = null;
  if (!isNaN(ag3)) {
    const diff = f3 - ag3;
    if (diff <= -2.0) pace = 'ハイ';
    else if (diff <= -0.5) pace = 'ミドル';
    else pace = 'スロー';
  } else {
    // ② 前半3Fのみの場合は距離ベース
    pace = calcPaceFromDistance(f3, data.raceInfo.distance);
  }

  if (pace) {
    badge.textContent = pace;
    badge.className = `pace-badge ${getPaceBadgeClass(pace)}`;
    data.raceInfo.paceType = pace;
    document.querySelectorAll('#race-content-area .pace-btn').forEach(b => b.classList.toggle('active', b.textContent.trim() === pace));
  }
  // クイックスタッツ帯を更新
  _updateRqsStrip(raceNo, f3, ag3, pace || data.raceInfo.paceType);
  if (raceNo === currentRaceNo) updateRaceSummaryBar(raceNo);
}

function setPace(raceNo, pace) {
  _syncRacePaceUi(raceNo, pace, true);
}

function clearManualPace(raceNo) {
  const data = allRacesData[raceNo];
  if (data) { data.raceInfo.manualPace = false; data.raceInfo.paceType = ''; }
  updateRacePace(raceNo);
}

function calcPaceFromDistance(f3, distStr) {
  if (!distStr) return null;
  const m = distStr.match(/(\d+)/); if (!m) return null;
  const d = parseInt(m[1]);
  const s = {
    800:{slow:35.0,high:33.5}, 1000:{slow:36.5,high:35.0},
    1300:{slow:38.0,high:36.5}, 1400:{slow:38.5,high:37.0},
    1600:{slow:39.0,high:37.5}, 1900:{slow:40.5,high:39.0},
    2100:{slow:41.5,high:40.0}, 2400:{slow:42.5,high:41.0},
  };
  const nearest = Object.keys(s).map(Number).sort((a,b) => Math.abs(a-d) - Math.abs(b-d))[0];
  const std = s[nearest];
  return f3 >= std.slow ? 'スロー' : f3 <= std.high ? 'ハイ' : 'ミドル';
}

// ============================================================
// 折りたたみパネル制御
// ============================================================
const _openedCollapse = {}; // { 'bench_1': true, ... }

function toggleAdminInputWrap(raceNo) {
  const wrap = document.getElementById(`admin-wrap-${raceNo}`);
  if (!wrap) return;
  const icon = document.getElementById(`admin-toggle-icon-${raceNo}`);
  const collapsed = wrap.classList.toggle('collapsed');
  if (icon) icon.textContent = collapsed ? '▸' : '▾';
}

function toggleCollapse(type, raceNo) {
  const key  = `${type}_${raceNo}`;
  const body = document.getElementById(`${type}-body-${raceNo}`);
  const icon = document.getElementById(`${type}-icon-${raceNo}`);
  if (!body) return;
  const isOpen = _openedCollapse[key];
  if (isOpen) {
    body.style.display = 'none';
    if (icon) { icon.style.transform = ''; }
    _openedCollapse[key] = false;
  } else {
    body.style.display = 'block';
    if (icon) { icon.style.transform = 'rotate(180deg)'; }
    _openedCollapse[key] = true;
  }
}

// ============================================================
// タブ切替（出馬表 / 能力表）
// ============================================================
function onRaceTabKeydown(event, raceNo) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  const tabs = ['deban','yoso','odds','ability','kekka']
    .map(view => document.getElementById(`tab-btn-${view}-${raceNo}`))
    .filter(button => button && !button.disabled && getComputedStyle(button).display !== 'none');
  if (!tabs.length) return;
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].focus();
  switchViewTab(raceNo, tabs[next].dataset.view);
}

/**
 * 共有・端末の事前計算がない時にだけ表示する軽量な待機状態。
 * 自動で全履歴を展開せず、利用者が必要な時だけ最新計算を選べるようにする。
 */
function _kvRenderAiOnDemandState(raceNo) {
  const dock = document.getElementById(`cockpit-picks-${raceNo}`);
  const panel = document.getElementById(`cockpit-ai-panel-${raceNo}`);
  const action = `<button type="button" class="btn btn-primary btn-sm viewer-ok" onclick="kvRefreshPrediction(${raceNo})"><i class="fas fa-bolt"></i> 端末データで最新計算</button>`;
  const html = `<div class="cockpit-panel-empty"><i class="fas fa-database"></i><strong style="display:block;margin:5px 0 2px">保存済みAI予想がありません</strong><span style="display:block;margin-bottom:10px">必要な場合だけ全履歴を読み込み、最新の印を計算します</span>${action}</div>`;
  if (panel) { panel.innerHTML = html; if (dock) dock.innerHTML = ''; }
  else if (dock) dock.innerHTML = html;
}

function _kvRenderAiLoadErrorState(raceNo) {
  const dock = document.getElementById(`cockpit-picks-${raceNo}`);
  const panel = document.getElementById(`cockpit-ai-panel-${raceNo}`);
  const html = `<div class="kv-async-state is-error" data-state="error" role="alert" aria-live="assertive"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i><span><strong>保存済みAI予想を確認できませんでした</strong><small>共有キャッシュに接続できません。端末データで計算できます</small></span><button type="button" class="btn btn-primary btn-sm" onclick="kvRefreshPrediction(${raceNo})"><i class="fas fa-bolt"></i> 端末データで計算</button></div>`;
  if (panel) { panel.innerHTML = html; if (dock) dock.innerHTML = ''; }
  else if (dock) dock.innerHTML = html;
}

function _kvRaceHasResult(raceNo) {
  return !!allRacesData[raceNo]?.horses?.some(h => /^\d+$/.test(String(h.chakujun || '')));
}
const _kvPredictionRefreshJobs = new Map();
async function kvRefreshPrediction(raceNo, options) {
  if (_kvPredictionRefreshJobs.has(raceNo)) return _kvPredictionRefreshJobs.get(raceNo);
  const job = _kvRefreshPredictionNow(raceNo,options).finally(()=>_kvPredictionRefreshJobs.delete(raceNo));
  _kvPredictionRefreshJobs.set(raceNo,job); return job;
}
async function _kvRefreshPredictionNow(raceNo, options) {
  const target = document.getElementById(`cockpit-ai-panel-${raceNo}`);
  const dock = document.getElementById(`cockpit-picks-${raceNo}`);
  const retrospective=!!options?.retrospective || _kvRaceHasResult(raceNo);
  const loading = _kvAsyncStateHtml('ai', retrospective?'過去レースを現在AIで再計算中':'AI予想を最新計算中', '端末の過去データを準備しています');
  if (target) { target.innerHTML=loading; if(dock)dock.innerHTML=''; } else if(dock)dock.innerHTML=loading;
  try {
    await _ensureRaceIntelligence();
    const data = allRacesData[raceNo];
    if (!data || !document.getElementById(`race-section-${raceNo}`)) return;
    const freshHorses = [...data.horses].sort((a,b) => {
      const ca=parseInt(a.chakujun)||999, cb=parseInt(b.chakujun)||999;
      return ca!==cb ? ca-cb : (parseInt(a.umaBan)||0)-(parseInt(b.umaBan)||0);
    });
    renderHorseRows(raceNo, freshHorses);
    _renderRaceHistoryPanels(raceNo);
    if (retrospective && window.kvAiCachePrediction) {
      const computed=computeYosoScored(raceNo,null);
      window.kvAiCachePrediction(raceNo,computed,{ retrospective:true });
      if (!window.kvAiRenderCachedPrediction?.(raceNo)) renderPredictionPanel(raceNo);
    } else renderPredictionPanel(raceNo);
  } catch (e) {
    const errorHtml = _kvAsyncStateHtml('error', 'AI計算に失敗しました', '端末の過去データを準備できませんでした', `kvRefreshPrediction(${raceNo})`);
    if (target) { target.innerHTML=errorHtml; if(dock)dock.innerHTML=''; } else if(dock)dock.innerHTML=errorHtml;
  }
}

async function switchViewTab(raceNo, view) {
  const debanView   = document.getElementById(`view-deban-${raceNo}`);
  const kekkaView   = document.getElementById(`view-kekka-${raceNo}`);
  const abilityView = document.getElementById(`view-ability-${raceNo}`);
  const yosoView    = document.getElementById(`view-yoso-${raceNo}`);
  const oddsView    = document.getElementById(`view-odds-${raceNo}`);
  const debanBtn    = document.getElementById(`tab-btn-deban-${raceNo}`);
  const kekkaBtn    = document.getElementById(`tab-btn-kekka-${raceNo}`);
  const abilityBtn  = document.getElementById(`tab-btn-ability-${raceNo}`);
  const yosoBtn     = document.getElementById(`tab-btn-yoso-${raceNo}`);
  const oddsBtn     = document.getElementById(`tab-btn-odds-${raceNo}`);
  const debanCtrl   = document.getElementById(`deban-controls-${raceNo}`);
  if (!debanView || !abilityView) return;
  _kvLastViewTab = view; // 直近選択のサブタブを記憶（新規レース表示時にswitchRaceTab/renderRaceContentから復元）

  [debanView, kekkaView, abilityView, yosoView, oddsView].forEach(v => { if (v) v.style.display = 'none'; });
  [debanBtn, kekkaBtn, abilityBtn, yosoBtn, oddsBtn].forEach(b => { if (b) b.classList.remove('on'); });
  const tabMap = {
    deban:[debanBtn,debanView], yoso:[yosoBtn,yosoView], odds:[oddsBtn,oddsView],
    ability:[abilityBtn,abilityView], kekka:[kekkaBtn,kekkaView]
  };
  Object.values(tabMap).forEach(([button,panel]) => {
    if (button) { button.setAttribute('aria-selected','false'); button.tabIndex = -1; }
    if (panel) panel.hidden = true;
  });
  if (tabMap[view]) {
    const [button,panel] = tabMap[view];
    if (button) { button.setAttribute('aria-selected','true'); button.tabIndex = 0; }
    if (panel) panel.hidden = false;
  }
  if (debanCtrl) debanCtrl.style.display = 'none';
  if (view === 'deban') {
    debanView.style.display = '';
    if (debanBtn) debanBtn.classList.add('on');
    if (debanCtrl) debanCtrl.style.display = 'flex';
  } else if (view === 'kekka') {
    if (kekkaView) kekkaView.style.display = '';
    if (kekkaBtn) kekkaBtn.classList.add('on');
    const target = document.getElementById(`kekka-panel-${raceNo}`);
    if (target) target.innerHTML = _kvAsyncStateHtml('ai', '結果とAI印を照合中', '確定着順とレース前の評価を計算しています');
    try { await _ensureRaceIntelligence(); } catch (e) { if (target) target.innerHTML = _kvAsyncStateHtml('error','結果表示に失敗しました','通信状態を確認して再試行してください',`switchViewTab(${raceNo},'kekka')`); return; }
    renderResultView(raceNo);
  } else if (view === 'ability') {
    abilityView.style.display = '';
    if (abilityBtn) abilityBtn.classList.add('on');
    const target = document.getElementById(`ability-table-${raceNo}`);
    if (target) target.innerHTML = _kvAsyncStateHtml('data', '出走馬の履歴を取得中', `${allRacesData[raceNo]?.horses?.length || 0}頭分だけを優先して準備しています`);
    // 能力表は共通の日付計算・馬タグ機能を使うため、遅延モジュールも明示的に準備する。
    // 全15万件の展開は待たず、出走馬の履歴だけを先に準備する。
    try { await Promise.all([_ensureAiAnalysisModule(), _ensureRaceHorseHistory(raceNo)]); }
    catch (e) { if (target) target.innerHTML = _kvAsyncStateHtml('error','馬比較の取得に失敗しました','対象馬の履歴を取得できませんでした',`switchViewTab(${raceNo},'ability')`); return; }
    renderAbilityTable(raceNo);
  } else if (view === 'yoso') {
    if (yosoView) yosoView.style.display = '';
    if (yosoBtn) yosoBtn.classList.add('on');
    const target = document.getElementById(`cockpit-ai-panel-${raceNo}`);
    let showedCached = false;
    try {
      await _ensureAiInsightsModule();
      showedCached = !!window.kvAiRenderCachedPrediction?.(raceNo);
      if (!showedCached && window.kvAiHydrateServerDay) {
        await window.kvAiHydrateServerDay(allRacesData[raceNo]?.raceInfo?.raceDate);
        showedCached = !!window.kvAiRenderCachedPrediction?.(raceNo);
      }
    } catch (e) {
      console.warn('[ai cache hydrate]', e);
      _kvRenderAiLoadErrorState(raceNo);
      return;
    }
    // 共有／端末の事前計算が表示できた時は、それを即時表示の正本とする。
    // 保存済み予想を見せた直後に全15万件を自動展開すると体感速度を失うため、ここでは待たない。
    if (showedCached) return;
    if (_idbFullReady && typeof window.computeYosoScored === 'function') {
      if (yosoView && yosoView.style.display === 'none') return;
      renderPredictionPanel(raceNo);
      return;
    }
    if (_kvRaceHasResult(raceNo)) { await kvRefreshPrediction(raceNo,{ retrospective:true }); return; }
    _kvRenderAiOnDemandState(raceNo);
  } else if (view === 'odds') {
    if (oddsView) oddsView.style.display = '';
    if (oddsBtn) oddsBtn.classList.add('on');
    renderOddsPanel(raceNo);
  }
}

/** 結果タブの表示可否を同期（結果ありレースのみタブを出す） */
function _kvSyncKekkaTab(raceNo, hasResults) {
  const btn = document.getElementById(`tab-btn-kekka-${raceNo}`);
  if (btn) {
    btn.style.display = '';
    btn.disabled = !hasResults;
    btn.title = hasResults ? '確定結果を見る' : '結果確定後に表示します';
  }
}

// ══════════════ 結果ビュー（着順・位置取り・払戻金）2026-07-10 ══════════════
// 出馬表から記録列を分離し、閲覧者にも見やすい「結果」タブへ集約。
// 着順表＋コーナー位置取り表＋楽天払戻金（オンデマンド取得・読み取り専用＝閲覧者可）。
const _kvDayPayouts = {}; // 日付→{raceNo:[entries]} キャッシュ（1日1回の取得を共有）

function _kvWakuCls(h) { return `waku-${Math.min(Math.max(parseInt(h.wakuBan) || Math.ceil((parseInt(h.umaBan) || 1) / 2), 1), 8)}`; }

function renderResultView(raceNo) {
  const container = document.getElementById(`kekka-panel-${raceNo}`);
  const d = allRacesData[raceNo];
  if (!container || !d) return;
  const { raceInfo, horses } = d;
  const finished = horses.filter(h => /^\d+$/.test(String(h.chakujun)));
  if (finished.length < 2) {
    container.innerHTML = '<p style="text-align:center;padding:24px;color:#9ca3af;font-size:13px">まだ結果が確定していません。</p>';
    return;
  }
  const sorted = [...finished].sort((a, b) => parseInt(a.chakujun) - parseInt(b.chakujun));
  const scratched = horses.filter(h => !/^\d+$/.test(String(h.chakujun)) && h.horseName);
  const _esc = s => jsAttrEsc(s);   // onclick内JS文字列用（属性突破・スクリプト注入対策）
  const _hasReplay = finished.some(h => String(h.corner || '').indexOf('-') >= 0);

  // ── AI印との答え合わせ（既存の共通コアcomputeYosoScoredをそのまま使用・二重計算なし・印の算出方法は不変）──
  const _rvAiMarkMap = {};
  try {
    const _rvScored = (typeof computeYosoScored === 'function') ? computeYosoScored(raceNo, null).scored : null;
    const _RV_MARKS = ['◎', '○', '▲', '△', '×', '×'];
    if (_rvScored) _rvScored.forEach((s, i) => { if (s.totalScore != null) _rvAiMarkMap[s.horse.horseName] = _RV_MARKS[i] || ''; });
  } catch (e) { _kvSwallow('renderResultView', e); }
  const _rvMarkColor = { '◎': '#dc2626', '○': '#2563eb', '▲': '#d97706', '△': '#d97706', '×': '#6b7280' };
  const _rvHitCell = (chaku, mark) => {
    if (!mark) return '<span class="data-empty">—</span>';
    const hit1 = chaku === 1 && mark === '◎';
    const hit3 = chaku <= 3 && (mark === '◎' || mark === '○' || mark === '▲');
    return `<span style="font-weight:900;font-size:13px;color:${_rvMarkColor[mark] || '#6b7280'}">${escapeHTML(mark)}</span>${hit1 ? '<span style="margin-left:3px;font-size:9px;color:#dc2626;font-weight:800">的中</span>' : hit3 ? '<span style="margin-left:3px;font-size:9px;color:#16a34a;font-weight:800">絡み</span>' : ''}`;
  };

  // ── ① 着順テーブル（最大5着まで表示・残りは折りたたみ）──
  const _resRow = h => `<tr>
      <td class="kr-chaku"><span class="chakujun-badge ${chakujunClass(h.chakujun)}">${parseInt(h.chakujun)}</span></td>
      <td><span class="waku-badge ${_kvWakuCls(h)}">${h.wakuBan || ''}</span></td>
      <td class="kr-uma">${h.umaBan || '—'}</td>
      <td class="kr-name"><span class="horse-name-link" onclick="openHorseModal('${_esc(h.horseName)}',${raceNo})">${escapeHTML(h.horseName) || '—'}</span></td>
      <td style="text-align:center" title="AI予想の印（出馬表・AI予想タブと同一）とレース後の着順を照合">${_rvHitCell(parseInt(h.chakujun), _rvAiMarkMap[h.horseName])}</td>
      <td class="kr-jockey">${escapeHTML(h.jockey) || '—'}</td>
      <td class="kr-time">${escapeHTML(h.time) || '—'}</td>
      <td class="kr-diff">${escapeHTML(h.diff)}</td>
      <td>${escapeHTML(h.agari3f) || '—'}</td>
      <td>${escapeHTML(h.first3f) || '—'}</td>
      <td class="kr-pass">${escapeHTML(h.corner) || '—'}</td>
    </tr>`;
  const _scrRow = h => `<tr style="opacity:.5">
      <td class="kr-chaku" style="font-size:10px">${escapeHTML(h.chakujun) || '除外'}</td>
      <td><span class="waku-badge ${_kvWakuCls(h)}">${h.wakuBan || ''}</span></td>
      <td class="kr-uma">${h.umaBan || '—'}</td>
      <td class="kr-name">${escapeHTML(h.horseName) || '—'}</td>
      <td colspan="7"></td>
    </tr>`;
  const top5Rows = sorted.slice(0, 5).map(_resRow).join('');
  const restRows = sorted.slice(5).map(_resRow).join('') + scratched.map(_scrRow).join('');
  const restCount = sorted.slice(5).length + scratched.length;
  const resultTable = `<div class="table-wrapper" style="overflow-x:auto">
    <table class="kr-table">
      <thead><tr>
        <th>着</th><th>枠</th><th>馬番</th><th style="text-align:left">馬名</th><th title="AI予想の印（出馬表・AI予想タブと同一）とレース後の着順を照合">AI印</th><th style="text-align:left">騎手</th>
        <th>タイム</th><th>着差</th><th>上3F</th><th>前3F</th><th>通過</th>
      </tr></thead>
      <tbody>${top5Rows}</tbody>
      ${restRows ? `<tbody id="kr-rest-${raceNo}" style="display:none">${restRows}</tbody>` : ''}
    </table>
  </div>
  ${restCount ? `<button type="button" class="kr-more-btn" data-label="残り${restCount}頭を表示（6着以下）" onclick="_kvToggleResultRest(${raceNo},this)"><i class="fas fa-chevron-down"></i> 残り${restCount}頭を表示（6着以下）</button>` : ''}`;

  // ── ② 位置取り表（コーナー通過順位・1着赤/2着青/3着黄で数字を色分け）──
  const maxC = Math.max(0, ...sorted.map(h => String(h.corner || '').split('-').filter(Boolean).length));
  let posTable = '';
  if (maxC >= 1) {
    const cLabels = maxC >= 4 ? ['1角', '2角', '3角', '4角'] : maxC === 3 ? ['1角', '2角', '3角'] : maxC === 2 ? ['3角', '4角'] : ['4角'];
    const posCls = ch => ch === 1 ? 'kr-pos-1' : ch === 2 ? 'kr-pos-2' : ch === 3 ? 'kr-pos-3' : '';
    const posRows = sorted.map(h => {
      const parts = String(h.corner || '').split('-').filter(Boolean);
      const cls = posCls(parseInt(h.chakujun));
      const cells = [];
      for (let i = 0; i < maxC; i++) {
        const p = parseInt(parts[i]);
        cells.push(`<td class="${cls}">${!isNaN(p) ? p : '—'}</td>`);
      }
      return `<tr>
        <td><span class="waku-badge ${_kvWakuCls(h)}">${h.wakuBan || ''}</span></td>
        <td class="kr-uma">${h.umaBan || ''}</td>
        <td class="kr-name" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(h.horseName) || '—'}</td>
        ${cells.join('')}
        <td class="kr-chaku"><span class="chakujun-badge ${chakujunClass(h.chakujun)}" style="min-width:18px;height:18px;font-size:10px">${parseInt(h.chakujun)}</span></td>
      </tr>`;
    }).join('');
    posTable = `<div class="kr-section-title">🏇 位置取り（コーナー通過順）
        ${_hasReplay ? `<button type="button" class="kr-replay-btn" onclick="openRaceReplay(${raceNo})"><i class="fas fa-play"></i> 展開を再生</button>` : ''}
      </div>
      <div class="table-wrapper" style="overflow-x:auto">
        <table class="kr-table kr-pos-table">
          <thead><tr><th>枠</th><th>馬番</th><th style="text-align:left">馬名</th>${cLabels.map(l => `<th>${l}</th>`).join('')}<th>着</th></tr></thead>
          <tbody>${posRows}</tbody>
        </table>
      </div>
      <div class="kr-legend">数字＝各コーナーでの前からの通過順位。<b class="kr-pos-1">1着</b>・<b class="kr-pos-2">2着</b>・<b class="kr-pos-3">3着</b>馬の数字を色分け。</div>`;
  }

  // ── ③ 払戻金 ──
  const payoutHtml = `<div class="kr-section-title">💰 払戻金</div><div id="kr-payout-${raceNo}">${_kvPayoutInner(raceNo)}</div>`;

  container.innerHTML = resultTable + posTable + payoutHtml;
}

/** 結果テーブルの6着以下を開閉 */
function _kvToggleResultRest(raceNo, btn) {
  const tb = document.getElementById(`kr-rest-${raceNo}`);
  if (!tb) return;
  const hidden = tb.style.display === 'none';
  tb.style.display = hidden ? '' : 'none';
  btn.innerHTML = hidden
    ? '<i class="fas fa-chevron-up"></i> 折りたたむ'
    : `<i class="fas fa-chevron-down"></i> ${btn.dataset.label}`;
}

/** 払戻金の内側HTML（キャッシュがあれば表示・なければ取得ボタン） */
function _kvPayoutInner(raceNo) {
  const d = allRacesData[raceNo]; if (!d) return '';
  const date = d.raceInfo?.raceDate || '';
  const dayCache = _kvDayPayouts[date];
  if (dayCache === 'loading') return '<p class="kr-hint"><i class="fas fa-spinner fa-spin"></i> 取得中…</p>';
  if (dayCache && dayCache[raceNo]) return _kvPayoutTable(dayCache[raceNo]);
  if (dayCache && !dayCache[raceNo]) return '<p class="kr-hint">この日の払戻データは見つかりませんでした（未確定の可能性）。</p>';
  return `<button type="button" class="kr-payout-btn viewer-ok" onclick="kvFetchPayouts(${raceNo})"><i class="fas fa-yen-sign"></i> 払戻金を取得（楽天）</button>
    <p class="kr-hint">単勝・複勝・馬連・馬単・ワイド・3連複・3連単などの払戻金を表示します。</p>`;
}

/** 払戻エントリ配列→テーブルHTML */
function _kvPayoutTable(entries) {
  if (!entries || !entries.length) return '<p class="kr-hint">払戻データがありません。</p>';
  const order = ['単勝', '複勝', '枠複', '枠単', '馬複', '馬連', '馬単', 'ワイド', '三連複', '3連複', '三連単', '3連単'];
  const disp = { '馬複': '馬連' };
  const sorted = [...entries].sort((a, b) => {
    const ia = order.indexOf(a.type), ib = order.indexOf(b.type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const rows = sorted.map(e => `<div class="kr-pay-row">
      <span class="kr-pay-type">${escapeHTML(disp[e.type] || e.type)}</span>
      <span class="kr-pay-combo">${escapeHTML(e.combo)}</span>
      <span class="kr-pay-yen">¥${(e.yen || 0).toLocaleString('en-US')}</span>
      <span class="kr-pay-nin">${escapeHTML(e.ninki)}</span>
    </div>`).join('');
  return `<div class="kr-pay-grid">${rows}</div>`;
}

/** 楽天から払戻金を取得（読み取り専用＝閲覧者も可）。当日分を一括取得して全レースで共有。 */
async function kvFetchPayouts(raceNo) {
  const d = allRacesData[raceNo]; if (!d) return;
  const date = d.raceInfo?.raceDate || '';
  const box = document.getElementById(`kr-payout-${raceNo}`);
  _kvDayPayouts[date] = 'loading';
  if (box) box.innerHTML = _kvPayoutInner(raceNo);
  let res = {};
  try { res = await fetchRakutenDividendsForDay(date); } catch (e) { console.warn('[payout]', e); }
  _kvDayPayouts[date] = res || {};
  // 表示中の全レースの払戻ブロックを更新（同じ日なので使い回せる）
  Object.keys(allRacesData).forEach(rn => {
    const b = document.getElementById(`kr-payout-${rn}`);
    if (b) b.innerHTML = _kvPayoutInner(rn);
  });
}

// ============================================================
// D: レースサマリーバー更新
// ============================================================
function updateRaceSummaryBar(raceNo) {
  const bar = document.getElementById('race-summary-bar');
  if (!bar) return;
  const data = allRacesData[raceNo];
  if (!data) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  const ri = data.raceInfo;
  const rsbRace = document.getElementById('rsb-race');
  if (rsbRace) rsbRace.textContent = `${raceNo}R`;
  const f3fVal = document.getElementById(`race-first3f-${raceNo}`)?.value || ri.first3f || '';
  const agariVal = document.getElementById(`race-agari3f-${raceNo}`)?.value || ri.agari3f_race || '';
  const dist = String(ri.distance || '').replace(/[^\d]/g, '');
  const badge = document.getElementById(`pace-badge-${raceNo}`);
  const paceText = badge ? badge.textContent.trim() : (ri.paceType || '');
  const rsbPace = document.getElementById('rsb-pace');
  if (rsbPace) {
    rsbPace.textContent = paceText || '—';
    rsbPace.className = 'rsb-val' + (paceText === 'ハイ' ? ' rsb-pace-H' : paceText === 'スロー' ? ' rsb-pace-S' : paceText === 'ミドル' ? ' rsb-pace-M' : '');
  }
  const rsbF3f = document.getElementById('rsb-f3f');
  if (rsbF3f) rsbF3f.textContent = f3fVal ? parseFloat(f3fVal).toFixed(1) : '—';
  const rsbAgari = document.getElementById('rsb-agari');
  if (rsbAgari) rsbAgari.textContent = agariVal ? parseFloat(agariVal).toFixed(1) : '—';
  const rsbDist = document.getElementById('rsb-dist');
  if (rsbDist) rsbDist.textContent = dist ? `${dist}m` : '—';
  const rsbCond = document.getElementById('rsb-cond');
  if (rsbCond) rsbCond.textContent = ri.trackCond || '—';
}

// ============================================================
// C: カードビュー
// ============================================================
// ============================================================
// F: 分割パネル（出馬表右側の指数ランキング）
// ============================================================
// ============================================================
// 能力表 距離フィルター / 日付ハイライト制御
// ============================================================
function setAbilityFilter(raceNo, type, value) {
  if (!renderAbilityTable._distFilter) renderAbilityTable._distFilter = {};
  if (!renderAbilityTable._dateFilter) renderAbilityTable._dateFilter = {};
  if (type === 'dist') renderAbilityTable._distFilter[raceNo] = value;
  if (type === 'date') renderAbilityTable._dateFilter[raceNo] = value || '';
  if (!renderAbilityTable._visibleCount) renderAbilityTable._visibleCount = {};
  renderAbilityTable._visibleCount[raceNo] = 4;
  renderAbilityTable(raceNo);
}

function showMoreAbilityHorses(raceNo) {
  if (!renderAbilityTable._visibleCount) renderAbilityTable._visibleCount = {};
  const total = allRacesData[raceNo]?.horses?.length || 0;
  renderAbilityTable._visibleCount[raceNo] = Math.min(total, Number(renderAbilityTable._visibleCount[raceNo] || 4) + 4);
  renderAbilityTable(raceNo);
}

// ============================================================
// ランキングパネル（指数ランキング + AI印）
// ============================================================
function renderRankingPanel(raceNo, subTab) {
  const container = document.getElementById(`ranking-panel-${raceNo}`);
  if (!container) return;
  const data = allRacesData[raceNo];
  if (!data) { container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:24px">データなし</p>'; return; }

  const active = subTab || container._subTab || 'recent';
  container._subTab = active;

  const { raceInfo, horses } = data;
  const raceDist = String(raceInfo.distance || '').replace(/[^\d]/g, '');
  const raceBaba = raceInfo.babaCode || '';

  // SI色分け: [background, color]
  const siC = v => v==null ? ['transparent','#9ca3af'] : v>=75 ? ['#fed7aa','#92400e'] : v>=65 ? ['#fef3c7','#78350f'] : v>=55 ? ['#fffbeb','#451a03'] : ['transparent','#374151'];

  // 各馬データ収集
  const horseData = horses.map(horse => {
    const hist = getHorseHistoryBefore(horse.horseName, raceInfo.raceDate, raceNo);
    // 近5走SI
    const recent5 = [];
    for (const h of hist.slice(0, 5)) {
      const bias = getDayBiasForDateAndDist(h.babaCode, h.raceDate, h.distance, h.raceNo);
      const avgF3 = getRaceAvgF3(h.babaCode, h.raceDate, h.raceNo);
      const pAdj = calcPaceAdj(parseFloat(h.first3f), avgF3);
      const si = calcSpeedIndex(h.time, h.distance, h.raceClass, h.trackCond, bias, h.kinryo, pAdj);
      recent5.push(si);
    }
    const siVals = recent5.filter(s => s != null);
    const avgSI = siVals.length ? siVals.reduce((a,b)=>a+b,0)/siVals.length : null;
    const maxSI = siVals.length ? Math.max(...siVals) : null;

    // 当該距離（直近2年のみ集計・2026-07-11：古すぎる好走が最高値を占有し続けるのを防ぐ）
    const RANKING_LOOKBACK_DAYS = 730;
    const distH = hist.filter(h => String(h.distance||'').replace(/[^\d]/g,'')===raceDist && h.chakujun && h.time && dateDiffDays(raceInfo.raceDate, h.raceDate) <= RANKING_LOOKBACK_DAYS);
    const distC = distH.map(h=>parseInt(h.chakujun)).filter(c=>c>0&&c<99);
    const distSIPairs = distH.map(h => ({ si: calcSpeedIndex(h.time,h.distance,h.raceClass,h.trackCond,getDayBiasForDateAndDist(h.babaCode,h.raceDate,h.distance,h.raceNo),h.kinryo,null), date: h.raceDate })).filter(p=>p.si!=null);
    let distMax = null, distMaxDate = null;
    if (distSIPairs.length) { const _b = distSIPairs.reduce((a,b)=>b.si>a.si?b:a); distMax = _b.si; distMaxDate = _b.date; }
    const dn = distC.length;
    const dStr = dn ? `${distC.filter(c=>c===1).length}.${distC.filter(c=>c===2).length}.${distC.filter(c=>c===3).length}.${dn-distC.filter(c=>c<=3).length}` : '—';

    // 当該コース（同競馬場+距離・直近2年のみ集計）
    const crsH = hist.filter(h => h.babaCode===raceBaba && String(h.distance||'').replace(/[^\d]/g,'')===raceDist && h.chakujun && h.time && dateDiffDays(raceInfo.raceDate, h.raceDate) <= RANKING_LOOKBACK_DAYS);
    const crsC = crsH.map(h=>parseInt(h.chakujun)).filter(c=>c>0&&c<99);
    const crsSIPairs = crsH.map(h => ({ si: calcSpeedIndex(h.time,h.distance,h.raceClass,h.trackCond,getDayBiasForDateAndDist(h.babaCode,h.raceDate,h.distance,h.raceNo),h.kinryo,null), date: h.raceDate })).filter(p=>p.si!=null);
    let crsMax = null, crsMaxDate = null;
    if (crsSIPairs.length) { const _b = crsSIPairs.reduce((a,b)=>b.si>a.si?b:a); crsMax = _b.si; crsMaxDate = _b.date; }
    const cn = crsC.length;
    const cStr = cn ? `${crsC.filter(c=>c===1).length}.${crsC.filter(c=>c===2).length}.${crsC.filter(c=>c===3).length}.${cn-crsC.filter(c=>c<=3).length}` : '—';

    return { horse, recent5, siVals, avgSI, maxSI, distMax, distMaxDate, dn, distC, dStr, crsMax, crsMaxDate, cn, crsC, cStr };
  });

  // SI印（近5走SIの加重平均でランク付け・出馬表/AI予想タブのAI印とは別計算）
  const MARKS = ['◎','○','▲','△','△'];
  const MCOL  = { '◎':'#dc2626','○':'#2563eb','▲':'#d97706','△':'#9ca3af' };
  const aiScored = horseData.map(hd => {
    let base = null;
    if (hd.siVals.length) {
      const w = hd.siVals.map((_,i)=>Math.pow(0.75,i));
      base = hd.siVals.reduce((s,v,i)=>s+v*w[i],0)/w.reduce((a,b)=>a+b,0);
    }
    return { umaBan: hd.horse.umaBan, base };
  }).sort((a,b)=>(b.base??-999)-(a.base??-999));
  const markMap = new Map(aiScored.filter(s=>s.base!=null).slice(0,5).map((s,i)=>[s.umaBan,MARKS[i]||'']));

  // サブタブ
  const TABS = [['recent','近走平均'],['max','最高値'],['dist','当該距離'],['course','当該コース']];
  const tabBar = TABS.map(([id,lbl])=>
    `<button onclick="renderRankingPanel(${raceNo},'${id}')" style="padding:7px 14px;border:none;border-bottom:2px solid ${active===id?'#16a34a':'transparent'};background:transparent;color:${active===id?'#16a34a':'#64748b'};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap">${lbl}</button>`
  ).join('');

  // 共通列ヘッダー
  const commonHead = `<th style="padding:6px 4px;text-align:center;color:#6b7280;font-size:10px;white-space:nowrap" title="このタブの基準（左の指数列）で並べた順位">順位</th><th style="padding:6px 4px;text-align:center;color:#6b7280;font-size:10px" title="枠番">枠</th><th style="padding:6px 4px;text-align:center;color:#6b7280;font-size:10px" title="馬番">馬番</th><th style="padding:6px 4px;text-align:center;color:#6b7280;font-size:10px" title="近5走SIの加重平均に基づく参考の印（出馬表・AI予想タブのAI印とは別の計算です）">SI印</th><th style="padding:6px 8px;text-align:left;color:#6b7280;font-size:10px">馬名</th>`;

  // 共通行プレフィックス
  const rowPfx = (hd, idx) => {
    const wn = Math.min(Math.max(parseInt(hd.horse.wakuBan)||1,1),8);
    const mark = markMap.get(hd.horse.umaBan)||'';
    return `<td style="padding:5px 4px;text-align:center;font-weight:700;color:#6b7280;font-size:11px">${idx+1}位</td>
      <td style="padding:5px 4px;text-align:center"><span class="waku-badge waku-${wn}" style="font-size:10px;width:18px;height:18px">${hd.horse.wakuBan||'—'}</span></td>
      <td style="padding:5px 4px;text-align:center;font-weight:700;font-size:12px">${hd.horse.umaBan||'—'}</td>
      <td style="padding:5px 4px;text-align:center;font-size:15px;font-weight:900;color:${MCOL[mark]||'#9ca3af'}">${mark||'—'}</td>
      <td style="padding:5px 8px;font-weight:600;white-space:nowrap;font-size:12px">${escapeHTML(hd.horse.horseName)}</td>`;
  };

  // 勝率セル
  const rateCell = (v, [t1,t2]) => v==null
    ? `<td style="padding:5px 6px;text-align:center;color:#9ca3af;font-size:12px">—</td>`
    : `<td style="padding:5px 6px;text-align:center;background:${v>=t2?'#fecaca':v>=t1?'#fef3c7':'transparent'};font-weight:700;color:${v>=t2?'#dc2626':v>=t1?'#d97706':'#374151'};font-size:12px">${v}%</td>`;

  let body = '';

  if (active === 'recent' || active === 'max') {
    const key = active==='recent' ? 'avgSI' : 'maxSI';
    const lbl = active==='recent' ? '近5走平均' : '最高値';
    const sorted = [...horseData].sort((a,b)=>(b[key]??-999)-(a[key]??-999));
    const vals = sorted.map(h=>h[key]).filter(v=>v!=null);
    const avg = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
    body = `
      ${avg!=null?`<div style="margin-bottom:8px;font-size:12px;color:#6b7280">全出走馬の${lbl} <span style="color:#d97706;font-weight:800;font-size:14px">${avg}</span></div>`:''}
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">${commonHead}
          <th style="padding:6px 8px;text-align:center;color:#16a34a;font-size:11px;white-space:nowrap" title="${active==='recent'?'直近5走のSI平均（新しい走ほど重みを大きく加重）':'直近5走の中の最高SI'}">${lbl}</th>
          ${['前走','2走前','3走前','4走前','5走前'].map(l=>`<th style="padding:6px 4px;text-align:center;color:#6b7280;font-size:10px" title="その走のSI（走破タイムを距離・馬場・斤量で点数化した指数）">${l}</th>`).join('')}
        </tr></thead>
        <tbody>${sorted.map((hd,idx)=>{
          const v = hd[key]; const [mb,mc]=siC(v);
          const cells=[0,1,2,3,4].map(i=>{const [bg,col]=siC(hd.recent5[i]);return`<td style="padding:5px 4px;text-align:center;background:${bg};color:${col};font-weight:${hd.recent5[i]!=null?700:400};font-size:12px">${hd.recent5[i]!=null?Math.round(hd.recent5[i]):'—'}</td>`;}).join('');
          return `<tr style="border-bottom:1px solid #f1f5f9">${rowPfx(hd,idx)}<td style="padding:5px 8px;text-align:center;background:${mb};color:${mc};font-weight:800;font-size:14px">${v!=null?Math.round(v):'—'}</td>${cells}</tr>`;
        }).join('')}</tbody>
      </table></div>`;

  } else {
    const isCrs = active==='course';
    const maxKey = isCrs?'crsMax':'distMax';
    const maxDateKey = isCrs?'crsMaxDate':'distMaxDate';
    const nKey   = isCrs?'cn':'dn';
    const cKey   = isCrs?'crsC':'distC';
    const sKey   = isCrs?'cStr':'dStr';
    const lbl    = isCrs?`高知${raceDist}m`:`${raceDist}m`;
    const sorted = [...horseData].sort((a,b)=>(b[maxKey]??-999)-(a[maxKey]??-999));
    const vals = sorted.map(h=>h[maxKey]).filter(v=>v!=null);
    const avg = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
    body = `
      ${avg!=null?`<div style="margin-bottom:8px;font-size:12px;color:#6b7280">全出走馬の${lbl} 最高値の平均 <span style="color:#d97706;font-weight:800;font-size:14px">${avg}</span></div>`:''}
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">${commonHead}
          <th style="padding:6px 8px;text-align:center;color:#16a34a;font-size:11px;white-space:nowrap" title="直近2年・${lbl}戦の自己ベストSI（走破タイムを距離・馬場・斤量で点数化した指数）">${lbl}<br>最高指数</th>
          <th style="padding:6px 6px;text-align:center;color:#6b7280;font-size:10px" title="直近2年・${lbl}戦の着度数（1着.2着.3着.着外）">着度数</th>
          <th style="padding:6px 6px;text-align:center;color:#6b7280;font-size:10px" title="直近2年・${lbl}戦での1着率">勝率</th>
          <th style="padding:6px 6px;text-align:center;color:#6b7280;font-size:10px" title="直近2年・${lbl}戦での2着以内率">連対率</th>
          <th style="padding:6px 6px;text-align:center;color:#6b7280;font-size:10px" title="直近2年・${lbl}戦での3着以内率">複勝率</th>
        </tr></thead>
        <tbody>${sorted.map((hd,idx)=>{
          const mx=hd[maxKey]; const [mb,mc]=siC(mx);
          const mxDate=hd[maxDateKey];
          const n=hd[nKey]; const ch=hd[cKey];
          const wr=n?Math.round(ch.filter(c=>c===1).length/n*100):null;
          const pr=n?Math.round(ch.filter(c=>c<=2).length/n*100):null;
          const sr=n?Math.round(ch.filter(c=>c<=3).length/n*100):null;
          return `<tr style="border-bottom:1px solid #f1f5f9">${rowPfx(hd,idx)}
            <td style="padding:5px 8px;text-align:center;background:${mb};color:${mc};font-weight:800;font-size:14px">${mx!=null?Math.round(mx):'未経験'}${mxDate?`<br><span style="font-size:9px;font-weight:400;color:#94a3b8">${mxDate.slice(2).replace(/\//g,'/')}</span>`:''}</td>
            <td style="padding:5px 6px;text-align:center;font-size:11px;color:#6b7280">${hd[sKey]}</td>
            ${rateCell(wr,[20,40])}${rateCell(pr,[35,60])}${rateCell(sr,[50,75])}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  container.innerHTML = `<div role="note" style="margin-bottom:8px;padding:7px 10px;border-radius:7px;background:var(--kc-surface-2,rgba(22,163,74,.08));color:var(--kc-muted,var(--text-muted,#64748b));font-size:11px;line-height:1.5"><strong style="color:var(--kc-positive,#15803d)">走力SI比較</strong> — この表の「SI印」は過去走の走破指数だけによる参考順位です。AI予想タブの「AI印」とは別の計算です。</div><div style="border-bottom:1px solid var(--kc-border,#e2e8f0);margin-bottom:12px;display:flex;overflow-x:auto">${tabBar}</div>${body}`;
}

// ============================================================
// 能力表（過去5走＋展開）レンダリング — カードスタイル
// ============================================================
function renderAbilityTable(raceNo) {
  const container = document.getElementById(`ability-table-${raceNo}`);
  if (!container) return;
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;">データなし</div>';
    return;
  }

  const isDark = document.body.classList.contains('dark-mode');

  // 当日馬場差を取得
  const biasInfo = calcDayTrackBias();
  const dayBias  = biasInfo.median; // 秒数（マイナスが速い馬場）

  // ─── ヘルパー ───────────────────────────────────────────────
  // 馬身→秒換算（地方競馬：1馬身≒0.2秒）
  const marginToSec = s => {
    if (!s || s === '0') return 0;
    const t = String(s).trim();
    if (t === 'ハナ') return 0.1;
    if (t === 'クビ') return 0.15;
    if (t === '1/2' || t === '½') return 0.1;
    if (t === '3/4' || t === '¾') return 0.15;
    // "1.1/2" → 1 + 0.1 = 1.1 馬身
    const mixed = t.match(/^(\d+)[\.\・](\d+)\/(\d+)$/);
    if (mixed) return (parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])) * 0.2;
    // "1/2" 形式
    const frac = t.match(/^(\d+)\/(\d+)$/);
    if (frac) return (parseInt(frac[1]) / parseInt(frac[2])) * 0.2;
    // 純粋な数字
    const n = parseFloat(t);
    if (!isNaN(n)) return n * 0.2;
    return null;
  };

  // 枠番カラー
  const WBG = w => ({'1':'#fff','2':'#111','3':'#c00','4':'#1a5ab8','5':'#e8c800','6':'#18a020','7':'#f05a00','8':'#c080c8'})[String(Math.min(Math.max(parseInt(w)||1,1),8))]||'#888';
  const WFG = w => [1,5,8].includes(parseInt(w)||1)?'#222':'#fff';
  const WBD = w => (parseInt(w)||1)===1?'1px solid #aaa':'none';

  // 着順カラー
  const CHAKU_BG = c => { const n=parseInt(c); return n===1?'#f59e0b':n===2?'#94a3b8':n===3?'#cd7c32':'#e2e8f0'; };
  const CHAKU_FG = c => parseInt(c)<=3?'#fff':'#374151';

  // ペースカラー
  const PACE_BG = p => p==='ハイ'?'#fee2e2':p==='ミドル'?'#fef3c7':p==='スロー'?'#dbeafe':'#f1f5f9';
  const PACE_FG = p => p==='ハイ'?'#dc2626':p==='ミドル'?'#b45309':p==='スロー'?'#1d4ed8':'#9ca3af';

  // ポジションカラー・ラベル
  const POS_BG    = pos => pos==='uchi0'||pos==='uchi1'?'#dbeafe':pos==='soto2'?'#fef9c3':pos==='soto3'?'#ffedd5':pos==='soto4'?'#fee2e2':'#f1f5f9';
  const POS_FG    = pos => pos==='uchi0'||pos==='uchi1'?'#1d4ed8':pos==='soto2'?'#a16207':pos==='soto3'?'#c2410c':pos==='soto4'?'#b91c1c':'#64748b';
  const POS_LABEL = pos => ({'uchi0':'内','uchi1':'内2','soto2':'外','soto3':'外2','soto4':'大外','straight-uchi':'内','straight-naka':'中','straight-soto':'外'})[pos]||pos||'';

  // タイムを秒換算
  const timeToSec2 = t => {
    if (!t) return Infinity;
    const c = String(t).split(':');
    if (c.length === 2) return parseInt(c[0]) * 60 + parseFloat(c[1]);
    const p = String(t).split('.');
    if (p.length === 3) return parseInt(p[0]) * 60 + parseInt(p[1]) + parseInt(p[2]) * 0.1;
    if (p.length === 2) { const s = parseInt(p[0]); return s >= 60 ? s * 60 + parseFloat(p[1]) : s + parseFloat('0.' + p[1]); }
    return Infinity;
  };

  // 通過順HTML生成（高知競馬スタイル：角ボックス、最終コーナーを青ハイライト）
  // クラスベース（ダークモード対応のため。インライン色は上書きから漏れる）
  const cornerHTML = cornerStr => {
    if (!cornerStr) return '<span class="pass-none">—</span>';
    const raw = String(cornerStr).trim();
    // "-"または空白区切りで分割し数字のみ抽出
    const parts = raw.split(/[\-\s]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
    if (!parts.length) return `<span class="pass-raw">${raw}</span>`;
    const boxes = parts.map((c, ci) => `<span class="pass-box${ci === parts.length - 1 ? ' pass-box--last' : ''}">${c}</span>`);
    const sep = `<span class="pass-sep">›</span>`;
    return `<div style="display:inline-flex;align-items:center;gap:1px;">${boxes.join(sep)}</div>`;
  };

  // ─── 過去走カラー定義（5走まで表示、6走以降は展開） ──────────
  const PAST_COLORS = ['#2563eb','#4f46e5','#7c3aed','#9333ea','#0e7490'];
  const PAST_LABELS = ['前走','2走前','3走前','4走前','5走前'];
  const EXTRA_COLORS = ['#0369a1','#0f766e','#047857','#1d4ed8','#6d28d9','#7e22ce'];
  const EXTRA_LABELS = ['6走前','7走前','8走前','9走前','10走前','11走前'];

  // ─── 同レース1着タイム取得（IDBキャッシュから） ─────────────
  // 馬キーは `${babaCode}_${raceDate}_${raceNo}_${umaBan}` 形式なので、umaBan候補を
  // 直接lookupすればO(全件数)の毎回フルスキャンを避けられる（馬ごと×過去走ごとに
  // 呼ばれるため、全件走査だと出走馬数×表示走数×全レコード数で著しく重くなる）。
  if (!window._winnerTimeCache) window._winnerTimeCache = {};
  const getWinnerTime = (babaCode, raceDate, raceNo) => {
    const cacheKey = `${babaCode}_${raceDate}_${raceNo}`;
    if (window._winnerTimeCache[cacheKey] !== undefined) return window._winnerTimeCache[cacheKey];
    const lsData = lsRead();
    let result = null;
    for (let uma = 1; uma <= 20; uma++) {
      const v = lsData[`${babaCode}_${raceDate}_${raceNo}_${uma}`];
      if (v && v.type === 'horse' && String(v.chakujun) === '1' && v.time) { result = v.time; break; }
    }
    window._winnerTimeCache[cacheKey] = result;
    return result;
  };

  // 馬比較だけ別実装を持つと、馬場傾向ページ・AI・馬モーダルで値がずれる。
  // 2026-07-26以降は監査済みの共通計算へ必ず委譲する。
  const getDayBiasForDate = (babaCode, raceDate, excludeRaceNo) => window.getDayBiasForDate(babaCode, raceDate, excludeRaceNo);

  // ─── 馬場差バッジHTML生成（ヘッダー背景色に合わせた視認性優先デザイン） ─
  const makeBiasLabel = (bias) => {
    if (bias == null) return '';
    const sign = bias > 0 ? '+' : '';
    // 速い(-)=水色バッジ・濃紺文字 / 重い(+)=薄橙バッジ・茶文字 / 標準=白20%バッジ・白文字
    const bg  = bias < -0.3 ? 'rgba(186,230,253,.9)' : bias > 0.3 ? 'rgba(253,186,116,.9)' : 'rgba(255,255,255,.22)';
    const clr = bias < -0.3 ? '#0c4a6e'               : bias > 0.3 ? '#7c2d12'              : '#fff';
    return `<span style="font-size:9px;font-weight:800;color:${clr};background:${bg};border-radius:3px;padding:1px 5px;flex-shrink:0;letter-spacing:.3px;">${sign}${bias.toFixed(2)}秒</span>`;
  };

  // ─── 展開状態管理（馬番ごと、raceNoスコープ） ─────────────────
  if (!renderAbilityTable._expandedMap) renderAbilityTable._expandedMap = {};
  const _expMap = renderAbilityTable._expandedMap;
  if (!_expMap[raceNo]) _expMap[raceNo] = {};

  // ─── 距離フィルター / 日付ハイライト状態 ──────────────────────
  if (!renderAbilityTable._distFilter) renderAbilityTable._distFilter = {};
  if (!renderAbilityTable._dateFilter) renderAbilityTable._dateFilter = {};
  const selDist = renderAbilityTable._distFilter[raceNo] ?? null;
  const selDate = renderAbilityTable._dateFilter[raceNo] || '';
  if (!renderAbilityTable._visibleCount) renderAbilityTable._visibleCount = {};
  const visibleCount = Math.min(data.horses.length, Number(renderAbilityTable._visibleCount[raceNo] || 4));
  const visibleHorses = data.horses.slice(0, visibleCount);

  // レンダリングスコープの過去成績キャッシュ（同馬の二重呼び出しを防ぐ）
  // 表示中レースより後の結果は「過去成績」に含めない（未来の結果混入バグ対策）
  const _rHistCache = new Map();
  const _getHist = n => { if (!_rHistCache.has(n)) _rHistCache.set(n, getHorseHistoryBefore(n, data.raceInfo.raceDate, raceNo)); return _rHistCache.get(n); };

  // 全馬の過去走から距離一覧収集（フィルターチップ用）
  const allDistNums = [...new Set(
    data.horses.flatMap(horse =>
      _getHist(horse.horseName).map(h => getDistNum(h.distance)).filter(Boolean)
    )
  )].sort((a, b) => a - b);

  // ─── 各馬の行HTML ────────────────────────────────────────────
  const rows = visibleHorses.map(horse => {
    const allHist      = _getHist(horse.horseName);
    const filteredHist = selDist ? allHist.filter(h => getDistNum(h.distance) === selDist) : allHist;
    const isExpanded   = !!_expMap[raceNo][horse.umaBan];
    const hist         = isExpanded ? filteredHist : filteredHist.slice(0, 5);
    const extraCount   = filteredHist.length - 5; // 5走以降の件数
    const hasDateMatch = selDate ? allHist.some(h => h.raceDate.replace(/\//g, '-') === selDate) : false;
    const waku = Math.min(Math.max(parseInt(horse.wakuBan) || Math.ceil((parseInt(horse.umaBan)||1) / 2), 1), 8);

    // タイム変換
    const timeSecs = hist.map(r => timeToSec2(r.time));

    // ─── 近走指数サマリー（最大10走） ────────────────────────
    const _calcIdx = r => {
      const rDist   = getDistNum(r.distance);
      const dBiasM  = getDayBiasByDist(r.babaCode, r.raceDate, r.raceNo);
      const bias    = (rDist != null && dBiasM[rDist] != null)
        ? dBiasM[rDist]
        : getDayBiasForDate(r.babaCode, r.raceDate, r.raceNo) ?? (r.fromOfficial ? estimateBiasFromCond(r.distance, r.raceClass, r.trackCond) : null);
      const avgF3 = getRaceAvgF3(r.babaCode, r.raceDate, r.raceNo);
      const pAdj  = calcPaceAdj(parseFloat(r.first3f), avgF3);
      return calcSpeedIndex(r.time, r.distance, r.raceClass, r.trackCond, bias, r.kinryo, pAdj);
    };
    // 高知限定（babaCode='31'）のみ指数計算対象
    const _recentIdxList = allHist.filter(r => r.babaCode === '31').slice(0, 10).map(_calcIdx).filter(v => v != null);
    const _idxAvg3 = _recentIdxList.length
      ? Math.round(_recentIdxList.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, _recentIdxList.length))
      : null;
    const _idxBest = _recentIdxList.length ? Math.max(..._recentIdxList) : null;
    const _mkTrend = list => {
      if (list.length < 2) return '';
      const diff = list[0] - list[Math.min(2, list.length - 1)];
      return diff >= 3
        ? '<span style="color:#16a34a;font-weight:900;font-size:11px;">↑</span>'
        : diff <= -3
          ? '<span style="color:#dc2626;font-weight:900;font-size:11px;">↓</span>'
          : '<span style="color:#6b7280;font-weight:700;font-size:11px;">→</span>';
    };
    const _idxTrend = _mkTrend(_recentIdxList);

    // ─── 同距離 近走指数サマリー ──────────────────────────────
    const _curDist = getDistNum(data.raceInfo?.distance || '');
    const _sdIdxList = _curDist
      ? allHist.filter(r => r.babaCode === '31' && getDistNum(r.distance) === _curDist).slice(0, 10).map(_calcIdx).filter(v => v != null)
      : [];
    const _sdAvg3  = _sdIdxList.length
      ? Math.round(_sdIdxList.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, _sdIdxList.length))
      : null;
    const _sdBest  = _sdIdxList.length ? Math.max(..._sdIdxList) : null;
    const _sdTrend = _mkTrend(_sdIdxList);

    const _mkIdxRow = (label, avg3, trend, best, labelColor) => {
      const avgBg  = isDark
        ? (avg3 >= 55 ? '#2d1a4a' : avg3 >= 50 ? '#2d0000' : avg3 >= 45 ? '#00122a' : '#0d1520')
        : (avg3 >= 55 ? '#ede9fe' : avg3 >= 50 ? '#fee2e2' : avg3 >= 45 ? '#dbeafe' : '#f1f5f9');
      const avgClr = avg3 >= 55 ? '#a78bfa' : avg3 >= 50 ? '#f87171' : avg3 >= 45 ? '#60a5fa' : (isDark?'#c8d8ec':'#374151');
      const bstClr = best >= 55 ? '#a78bfa' : best >= 50 ? '#f87171' : best >= 45 ? '#60a5fa' : (isDark?'#8fa3be':'#374151');
      return `<div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap;">
        <span style="font-size:7.5px;color:${labelColor};font-weight:700;flex-shrink:0;">${label}</span>
        <span style="font-size:10px;font-weight:900;color:${avgClr};background:${avgBg};border-radius:3px;padding:0 4px;">${avg3}</span>
        ${trend}
        <span style="font-size:7.5px;color:#94a3b8;margin-left:2px;">最高</span>
        <span style="font-size:10px;font-weight:700;color:${bstClr};">${best}</span>
      </div>`;
    };
    const _idxSummaryHtml = _idxAvg3 != null ? (() => {
      const rows = [_mkIdxRow('近走', _idxAvg3, _idxTrend, _idxBest, '#94a3b8')];
      if (_sdAvg3 != null) rows.push(_mkIdxRow('同距離', _sdAvg3, _sdTrend, _sdBest, '#a78bfa'));
      return `<div style="border-top:1px solid ${isDark?'#1e3048':'#e2e8f0'};padding-top:3px;margin-top:2px;display:flex;flex-direction:column;gap:2px;">${rows.join('')}</div>`;
    })() : '';

    // ─── 過去走カード（5走 or 全展開） ────────────────────────
    const cards = hist.map((r, i) => {
      const accentClr = i < 5 ? PAST_COLORS[i] : EXTRA_COLORS[i - 5];
      const label     = i < 5 ? PAST_LABELS[i]  : EXTRA_LABELS[i - 5];

      if (!r) return `
        <div style="flex:1;min-width:130px;max-width:172px;border:1.5px dashed ${isDark?'#1e3048':'#dde3ef'};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${isDark?'#0d1520':'#f8fafc'};padding:12px 6px;gap:3px;">
          <span style="font-size:9px;font-weight:700;color:${accentClr};opacity:.5;">${label}</span>
          <span style="font-size:9px;color:#cbd5e1;">記録なし</span>
        </div>`;

      const chaku    = parseInt(r.chakujun) || 999;
      const f3v      = parseFloat(r.first3f);
      const agv      = parseFloat(r.agari3f);
      const tv       = r.time   || '';
      const tSec     = timeSecs[i];
      const horseOwnPace = r.paceType || '';     // 馬自身のペース（出馬表で入力）
      const racePace     = r.paceTypeRace || ''; // レース全体のペース
      const pace         = horseOwnPace || racePace; // 後方互換用
      const wt       = r.weight || '';   // 馬体重
      const kr       = r.kinryo || '';   // 斤量
      const diff     = r.diff   || '';   // 1着差（原データ）
      const mukae    = r.mukaeShoumen  || '';  // 向正面ポジション
      const str      = r.shoumenStraight || ''; // 直線ポジション
      const corner   = r.corner || '';   // 通過順
      const rWaku    = r.wakuBan || '';  // 枠番
      const rJockey  = r.jockey || '';   // 騎手
      const rTrainer = r.trainer|| '';   // 厩舎
      const rTrackCond = r.trackCond || ''; // 馬場状態（② 行で引き続き使用）
      const isWin    = chaku === 1;

      // 乗り替わり判定（当日騎手 vs 過去走騎手）
      const currentJockey = horse.jockey || '';
      const isJockeyChange = rJockey && currentJockey && rJockey !== currentJockey;

      // 距離別馬場差（同距離のレース中央値、なければ全距離平均）
      const _rDist      = getDistNum(r.distance);
      const _dBiasM     = getDayBiasByDist(r.babaCode, r.raceDate, r.raceNo);
      const perRaceBias = (_rDist != null && _dBiasM[_rDist] != null)
        ? _dBiasM[_rDist]
        : getDayBiasForDate(r.babaCode, r.raceDate, r.raceNo) ?? (r.fromOfficial ? estimateBiasFromCond(r.distance, r.raceClass, r.trackCond) : null);

      // 馬場差 + 斤量補正 + ペース補正タイム
      let corrStr = '';
      const biasForCorr = perRaceBias != null ? perRaceBias : dayBias;
      const weightAdj   = calcWeightAdj(kr, getDistNum(r.distance));
      const raceAvgF3   = getRaceAvgF3(r.babaCode, r.raceDate, r.raceNo);
      const paceAdj     = calcPaceAdj(f3v, raceAvgF3);
      if (tSec !== Infinity && biasForCorr != null) {
        const ct  = tSec - biasForCorr - weightAdj + paceAdj;
        const cm  = Math.floor(ct / 60);
        const cs  = (ct - cm * 60).toFixed(1);
        corrStr   = `${cm}:${cs.padStart(4, '0')}`;
      }
      // 高知以外は指数算出しない（バイアス基準が異なるため）
      const isKochi   = r.babaCode === '31';
      const speedIdx  = isKochi ? calcSpeedIndex(tv, r.distance, r.raceClass, rTrackCond, biasForCorr, kr, paceAdj) : null;
      const raceAvgAg = isKochi ? getRaceAvgAgari3f(r.babaCode, r.raceDate, r.raceNo) : null;
      const agariIdx  = isKochi ? calcAgariIndex(agv, raceAvgAg) : null;
      // 各馬の前半区間タイム（走破−上がり3F）と基準比dev（負=ハイ/正=スロー）。高知のみ。
      const frontSec = isKochi ? calcFrontSectional(tv, r.agari3f) : null;
      // 前半基準の全履歴集計は重いため、別のAI処理でキャッシュ済みの場合だけ表示する。
      // 馬比較を開いた操作を起点に15万件を同期走査しない。
      const frontDev = (frontSec != null && window._frontBaseCache)
        ? getFrontDev(r.raceDate, r.distance, r.raceClass, rTrackCond, frontSec) : null;
      const _fdevClr = frontDev == null ? '' : frontDev <= -0.4 ? (isDark?'#f87171':'#dc2626') : frontDev >= 0.4 ? (isDark?'#60a5fa':'#1d4ed8') : (isDark?'#8fa3be':'#94a3b8');
      const _fdevTxt = frontDev == null ? '' : `${frontDev > 0 ? '+' : ''}${frontDev.toFixed(1)}`;
      // 他場の場合は場名タグを表示
      const venueName = !isKochi && r.babaCode ? getBabaName(r.babaCode) : '';

      // 着順別カード背景色（1着=金、2着=淡青、3着=淡ピンク）
      const cardBg = isDark
        ? (isWin ? 'linear-gradient(160deg,#1a1200,#252000)' : chaku===2 ? 'linear-gradient(160deg,#000a18,#001228)' : chaku===3 ? 'linear-gradient(160deg,#1a0010,#220018)' : '#0d1520')
        : (isWin ? 'linear-gradient(160deg,#fffbeb,#fef9c3)' : chaku===2 ? 'linear-gradient(160deg,#eff6ff,#dbeafe)' : chaku===3 ? 'linear-gradient(160deg,#fff0f6,#fce7f3)' : '#fff');
      const cardBorder = isDark
        ? (isWin ? '#b45309' : chaku===2 ? '#1d4ed8' : chaku===3 ? '#9d174d' : '#1e3048')
        : (isWin ? '#f59e0b' : chaku===2 ? '#93c5fd' : chaku===3 ? '#f9a8d4' : '#e2e8f0');

      // 1着差 → 同レースの1着タイムとの差（秒）で表示
      let diffDisp = '';
      if (chaku !== 1 && tSec !== Infinity) {
        const winnerTimeStr = getWinnerTime(r.babaCode, r.raceDate, r.raceNo);
        if (winnerTimeStr) {
          const winnerSec = timeToSec2(winnerTimeStr);
          if (winnerSec !== Infinity && winnerSec < tSec) {
            const gap = (tSec - winnerSec).toFixed(1);
            diffDisp = `<span style="font-size:10px;color:#475569;font-weight:600;margin-left:3px;">[${gap}]</span>`;
          }
        } else if (diff) {
          // IDBに1着タイムがない場合は原データをそのまま表示
          diffDisp = `<span style="font-size:10px;color:#9ca3af;font-weight:600;margin-left:4px;">(${diff})</span>`;
        }
      }

      const isCardDateMatch = selDate ? r.raceDate.replace(/\//g, '-') === selDate : false;

      return `
      <div class="ability-past-card" style="flex:1;min-width:148px;max-width:185px;border:1.5px solid ${isCardDateMatch?'#f59e0b':cardBorder};border-top:3px solid ${accentClr};border-radius:8px;overflow:hidden;background:${cardBg};display:flex;flex-direction:column;box-shadow:${isCardDateMatch?'0 0 0 2px #fbbf24,0 2px 8px rgba(245,158,11,.4)':'0 1px 3px rgba(0,0,0,.05)'};">
      ${isCardDateMatch ? `<div style="background:${isDark?'#252000':'#fef9c3'};text-align:center;font-size:9px;font-weight:800;color:#b45309;padding:1px 0;letter-spacing:.5px;">◀ ${r.raceDate} ▶</div>` : ''}

        <!-- ① ヘッダー：ラベル + 他場タグ + レース固有馬場差 + 日付 -->
        <div style="background:${accentClr};padding:3px 8px;display:flex;align-items:center;gap:4px;">
          <span style="font-size:10px;font-weight:800;color:#fff;flex-shrink:0;">${label}</span>
          ${venueName ? `<span style="font-size:9px;font-weight:800;background:rgba(0,0,0,.35);color:#fde68a;border-radius:3px;padding:0 5px;white-space:nowrap;flex-shrink:0;">${venueName}</span>` : makeBiasLabel(perRaceBias)}
          <span style="font-size:9px;color:rgba(255,255,255,.75);margin-left:auto;white-space:nowrap;">${r.raceDate || '—'}</span>
        </div>

        <!-- ② クラス / 距離 / 枠番+馬番 / 馬場 -->
        <div style="padding:4px 8px 0;display:flex;align-items:center;gap:3px;flex-wrap:wrap;">
          ${r.raceClass ? `<span class="race-class-badge ${raceClassCssClass(r.raceClass)}" style="font-size:8px;padding:0 5px;line-height:17px;">${escapeHTML(r.raceClass)}</span>` : ''}
          ${r.distance  ? `<span style="font-size:10px;font-weight:700;color:${isDark?'#c8d8ec':'#334155'};">${escapeHTML(r.distance)}</span>` : ''}
          ${rWaku ? `<span style="display:inline-flex;align-items:center;gap:2px;background:${isDark?'#0d1520':'#f1f5f9'};border:1px solid ${isDark?'#1e3048':'#e2e8f0'};border-radius:3px;padding:0 4px;height:17px;flex-shrink:0;">
            <span style="background:${WBG(rWaku)};color:${WFG(rWaku)};border:${WBD(rWaku)};font-size:9px;font-weight:800;min-width:14px;height:14px;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;">${rWaku}</span>
            <span style="font-size:9px;font-weight:700;color:${isDark?'#c8d8ec':'#374151'};">${r.umaBan||''}番</span>
          </span>` : ''}
          ${r.trackCond ? `<span style="font-size:9px;color:${isDark?'#8fa3be':'#6b7280'};font-weight:600;">${escapeHTML(r.trackCond)}</span>` : ''}
        </div>

        <!-- ③ 着順 + タイム + 1着差 + ペース -->
        <div style="padding:4px 8px 3px;display:flex;align-items:center;gap:5px;">
          ${chaku < 999
            ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:4px;background:${CHAKU_BG(chaku)};color:${CHAKU_FG(chaku)};font-size:14px;font-weight:900;flex-shrink:0;">${chaku}着</span>`
            : `<span style="font-size:12px;color:#9ca3af;flex-shrink:0;">—</span>`}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:baseline;gap:0;flex-wrap:nowrap;">
              <span style="font-size:14px;font-family:monospace;font-weight:900;color:${isDark?'#e2e8f0':'#0f172a'};line-height:1;white-space:nowrap;">${tv || '—'}</span>
              ${diffDisp}
            </div>
          </div>
          ${(horseOwnPace || racePace) ? `<div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;gap:1px;">
            <span style="font-size:9px;font-weight:800;padding:1px 6px;border-radius:8px;background:${PACE_BG(horseOwnPace||racePace)};color:${PACE_FG(horseOwnPace||racePace)};white-space:nowrap;">${horseOwnPace||'—'}</span>
            ${racePace ? `<span style="font-size:8px;color:#9ca3af;white-space:nowrap;text-align:right;">R:${racePace}</span>` : ''}
          </div>` : ''}
        </div>

        <!-- ④ 騎手 + 厩舎（横並び）+ 斤量 + 馬体重 -->
        <div style="padding:2px 8px 4px;border-bottom:1px solid ${isDark?'#1e3048':'#f0f4fa'};display:flex;align-items:center;gap:2px;flex-wrap:nowrap;">
          <div style="flex:1;min-width:0;overflow:hidden;display:flex;align-items:baseline;gap:2px;">
            <span style="font-size:10px;font-weight:700;color:${isDark?'#c8d8ec':'#1e3a5f'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0;" title="${escapeHTML(rJockey)}">${escapeHTML(rJockey)||'—'}</span>
            ${rTrainer?`<span style="font-size:8px;color:${isDark?'#8fa3be':'#64748b'};font-weight:600;white-space:nowrap;flex-shrink:0;" title="${escapeHTML(rTrainer)}">厩${escapeHTML(rTrainer)}</span>`:''}
          </div>
          ${isJockeyChange?`<span style="font-size:8px;font-weight:800;background:#dc2626;color:#fff;border-radius:3px;padding:0 4px;height:15px;display:inline-flex;align-items:center;flex-shrink:0;white-space:nowrap;">乗替</span>`:''}
          <span style="font-size:10px;font-weight:700;color:${isDark?'#c8d8ec':'#374151'};white-space:nowrap;flex-shrink:0;">${kr||'—'}</span>
          <span style="font-size:10px;font-weight:600;color:${isDark?'#8fa3be':'#475569'};white-space:nowrap;flex-shrink:0;">${fmtWeightDiff(wt)}</span>
        </div>

        <!-- ⑤ 前半（馬自身の走破−上がり3F、基準比dev付き）/ 前3F / 後3F -->
        <div style="display:grid;grid-template-columns:${frontSec != null ? '1fr 1fr 1fr' : '1fr 1fr'};gap:3px;padding:4px 8px 4px;">
          ${frontSec != null ? `<div style="background:${isDark?'#0d1520':'#f1f5f9'};border-radius:4px;padding:3px 2px;text-align:center;" title="この馬自身の前半区間タイム（走破−上がり3F）。下段は基準比：−=速い(ハイ)/＋=遅い(スロー)">
            <div style="font-size:7px;color:${isDark?'#8fa3be':'#64748b'};font-weight:700;">前半</div>
            <div style="font-size:13px;font-family:monospace;font-weight:800;color:${isDark?'#c8d8ec':'#334155'};">${frontSec.toFixed(1)}</div>
            ${_fdevTxt ? `<div style="font-size:8px;font-family:monospace;font-weight:800;color:${_fdevClr};line-height:1;">${_fdevTxt}</div>` : ''}
          </div>` : ''}
          <div style="background:${isDark?'#001228':'#eff6ff'};border-radius:4px;padding:3px 2px;text-align:center;">
            <div style="font-size:7px;color:${isDark?'#60a5fa':'#3b82f6'};font-weight:700;">前3F</div>
            <div style="font-size:13px;font-family:monospace;font-weight:800;color:${isDark?'#93c5fd':'#1d4ed8'};">${!isNaN(f3v) ? f3v.toFixed(1) : '—'}</div>
          </div>
          <div style="background:${isDark?'#180800':'#fff7ed'};border-radius:4px;padding:3px 2px;text-align:center;">
            <div style="font-size:7px;color:${isDark?'#f97316':'#ea580c'};font-weight:700;">後3F</div>
            <div style="font-size:13px;font-family:monospace;font-weight:800;color:${isDark?'#fb923c':'#c2410c'};">${!isNaN(agv) ? agv.toFixed(1) : '—'}</div>
          </div>
        </div>

        <!-- ⑥ 向正面 + 直線ポジション -->
        ${(mukae || str) ? `
        <div style="padding:0 8px 3px;display:flex;align-items:center;gap:3px;flex-wrap:wrap;">
          ${mukae ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${POS_BG(mukae)};color:${POS_FG(mukae)};white-space:nowrap;">向:${POS_LABEL(mukae)}</span>` : ''}
          ${str   ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${POS_BG(str)};color:${POS_FG(str)};white-space:nowrap;">直:${POS_LABEL(str)}</span>` : ''}
        </div>` : ''}

        <!-- ⑦ 通過順 -->
        <div style="padding:0 8px 5px;display:flex;align-items:center;gap:4px;">
          <span style="font-size:8px;font-weight:700;color:#94a3b8;white-space:nowrap;flex-shrink:0;">通過</span>
          ${corner ? cornerHTML(corner) : `<span style="font-size:10px;color:#cbd5e1;">—</span>`}
        </div>

        <!-- ⑧ 補正タイム + タイム指数 + 上がり3F指数 -->
        ${(corrStr || speedIdx != null || agariIdx != null) ? `
        <div style="border-top:1px solid ${isDark?'#1e3048':'#f0f4fa'};padding:3px 8px 4px;display:flex;align-items:center;gap:3px;flex-wrap:wrap;">
          ${corrStr ? `<span style="font-size:8px;color:#94a3b8;flex-shrink:0;">補正</span>
          <span style="font-size:11px;font-family:monospace;font-weight:800;color:${isDark?'#38bdf8':'#0369a1'};">${corrStr}</span>` : ''}
          <span style="margin-left:auto;display:flex;gap:3px;align-items:center;">
            ${speedIdx != null ? speedIndexBadgeHtml(speedIdx) : ''}
            ${agariIdx != null ? agariIndexBadgeHtml(agariIdx) : ''}
          </span>
        </div>` : ''}

      </div>`;
    }).join('');

    // ─── 馬名固定パネル + 4走カード横並び ──────────────────────
    return `
    <div style="border-bottom:1.5px solid ${isDark?'#1e3048':'#e9eef6'};padding:6px 0 4px;">
      <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:nowrap;overflow-x:auto;padding:2px 2px 4px;-webkit-overflow-scrolling:touch;">

        <!-- 馬名固定セル -->
        ${(() => {
          // 乗り替わり判定（前走騎手 vs 当日騎手）
          const latestJockey = hist.length > 0 ? (hist[0].jockey || '') : '';
          const todayJockey  = horse.jockey || '';
          const isChangeMain = latestJockey && todayJockey && latestJockey !== todayJockey;
          // 厩舎名：過去走データから取得（なければhorse.trainerをフォールバック）
          const trainerName  = (hist.length > 0 && hist[0].trainer) ? hist[0].trainer : (horse.trainer || '');
          return `
          <div style="flex-shrink:0;width:106px;background:${hasDateMatch?'#fefce8':(isDark?'#0d1520':'#f8fafc')};border:1.5px solid ${hasDateMatch?'#f59e0b':(isDark?'#1e3048':'#dde3ef')};border-left:4px solid ${hasDateMatch?'#f59e0b':PAST_COLORS[0]};border-radius:8px;padding:6px 7px 5px;display:flex;flex-direction:column;gap:3px;">
            <!-- 枠番 + 馬番 + 乗替バッジ -->
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="background:${WBG(waku)};color:${WFG(waku)};border:${WBD(waku)};min-width:20px;height:20px;border-radius:3px;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${waku}</span>
              <span style="font-size:12px;font-weight:800;color:${isDark?'#8fa3be':'#475569'};">${horse.umaBan}番</span>
              ${isChangeMain ? `<span style="font-size:8px;font-weight:800;background:#dc2626;color:#fff;border-radius:3px;padding:0 4px;height:15px;display:inline-flex;align-items:center;flex-shrink:0;white-space:nowrap;">乗替</span>` : ''}
            </div>
            <!-- 馬名 -->
            <div style="font-size:11px;font-weight:900;color:${isDark?'#e2e8f0':'#0f172a'};line-height:1.3;word-break:keep-all;">${escapeHTML(horse.horseName)}</div>
            <!-- 性齢（馬名と同じ値なら非表示） -->
            ${(horse.sexAge && horse.sexAge !== horse.horseName) ? `<div style="font-size:9px;color:${isDark?'#8fa3be':'#64748b'};font-weight:600;">${escapeHTML(horse.sexAge)}</div>` : ''}
            <!-- 騎手 / 厩舎（横並び） -->
            <div style="display:flex;align-items:center;gap:3px;border-top:1px solid ${isDark?'#1e3048':'#e2e8f0'};padding-top:3px;">
              <div style="font-size:9px;color:${isDark?'#c8d8ec':'#374151'};font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;" title="${escapeHTML(todayJockey)}">${escapeHTML(todayJockey) || '—'}</div>
              ${trainerName ? `<div style="font-size:8px;color:${isDark?'#8fa3be':'#64748b'};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;" title="${escapeHTML(trainerName)}">厩 ${escapeHTML(trainerName)}</div>` : ''}
            </div>
            <!-- 近走指数サマリー -->
            ${_idxSummaryHtml}
            <!-- 記録件数 -->
            <div style="font-size:8px;color:#94a3b8;">${selDist ? `${filteredHist.length}走(全${allHist.length})` : `${allHist.length}走記録`}</div>
            <!-- 特徴タグ -->
            <div class="horse-tag-badges" data-horse="${escapeHTML(horse.horseName)}" style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px;">
              ${horseTagBadgesHtml(horse.horseName)}
            </div>
            <button class="admin-only" onclick="event.stopPropagation();showHorseNoteEditor('${jsAttrEsc(horse.horseName)}',this)" style="margin-top:2px;font-size:8px;padding:1px 5px;border-radius:3px;border:1px solid ${isDark?'#1e3048':'#cbd5e1'};background:${isDark?'#0d1520':'#f8fafc'};color:${isDark?'#8fa3be':'#64748b'};cursor:pointer;width:100%;">+特徴</button>
          </div>`;
        })()}

        <!-- 過去走カード（5走＋展開分） -->
        ${cards}

        <!-- 展開ボタン（6走以降がある場合） -->
        ${(!isExpanded && extraCount > 0) ? `
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:44px;padding:0 2px;">
          <button
            onclick="(function(){if(!renderAbilityTable._expandedMap)renderAbilityTable._expandedMap={};var m=renderAbilityTable._expandedMap;if(!m[${raceNo}])m[${raceNo}]={};m[${raceNo}][${horse.umaBan}]=true;renderAbilityTable(${raceNo});})()"
            style="writing-mode:vertical-rl;text-orientation:mixed;background:linear-gradient(180deg,#0ea5e9,#0369a1);color:#fff;border:none;border-radius:8px;padding:12px 6px;font-size:10px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(3,105,161,.3);letter-spacing:.5px;line-height:1.4;min-height:60px;"
            title="クリックで${extraCount}走分を展開">
            +${extraCount}走
          </button>
        </div>` : ''}

        <!-- 折りたたみボタン（展開中の場合） -->
        ${isExpanded ? `
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:40px;padding:0 2px;position:sticky;right:0;z-index:3;background:${isDark?'#0a0f1e':'#fff'};box-shadow:-5px 0 10px rgba(0,0,0,.1);">
          <button
            onclick="(function(){var m=renderAbilityTable._expandedMap;if(m&&m[${raceNo}])delete m[${raceNo}][${horse.umaBan}];renderAbilityTable(${raceNo});})()"
            style="writing-mode:vertical-rl;text-orientation:mixed;background:linear-gradient(180deg,#64748b,#475569);color:#fff;border:none;border-radius:8px;padding:12px 5px;font-size:10px;font-weight:800;cursor:pointer;line-height:1.4;min-height:60px;box-shadow:0 2px 6px rgba(71,85,105,.35);letter-spacing:.5px;"
            title="折りたたむ">
            ◀折れ
          </button>
        </div>` : ''}

      </div>
    </div>`;
  }).join('');

  // ─── 当日馬場差インフォバー ─────────────────────────────────
  const biasBar = dayBias != null ? (() => {
    const sign = dayBias > 0 ? '+' : '';
    const clr  = dayBias < -0.3 ? '#dc2626' : dayBias > 0.3 ? '#7c3aed' : '#16a34a';
    const bg   = dayBias < -0.3 ? '#fee2e2' : dayBias > 0.3 ? '#ede9fe' : '#d1fae5';
    const label= dayBias < -0.3 ? '🏎️ 速い馬場' : dayBias > 0.3 ? '🐌 重い馬場' : '✅ 標準馬場';
    return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;background:${bg};border:1px solid ${clr}33;border-radius:8px;padding:5px 12px;margin-bottom:10px;">
      <span style="font-size:11px;font-weight:800;color:${clr};">${label}</span>
      <span style="font-size:12px;font-family:monospace;font-weight:900;color:${clr};">${sign}${dayBias.toFixed(2)}秒</span>
      <span style="font-size:10px;color:#6b7280;">(${biasInfo.count}R 中央値)</span>
      <span style="font-size:9px;color:#94a3b8;">補正タイム = タイム − 馬場差</span>
    </div>`;
  })() : '';

  // ─── テーブルヘッダー行 ────────────────────────────────────
  const headerRow = `
  <div style="display:flex;gap:6px;align-items:center;padding:0 2px 4px;flex-wrap:nowrap;overflow-x:auto;border-bottom:2px solid ${isDark?'#1e3048':'#c8d6e8'};margin-bottom:4px;">
    <div style="flex-shrink:0;width:106px;"></div>
    ${PAST_COLORS.map((clr, i) => `
      <div style="flex:1;min-width:148px;max-width:185px;display:flex;align-items:center;justify-content:center;gap:3px;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${clr};flex-shrink:0;"></span>
        <span style="font-size:11px;font-weight:800;color:${clr};">${PAST_LABELS[i]}</span>
      </div>`).join('')}
  </div>`;

  // ─── フィルターツールバー ─────────────────────────────────────
  const filterToolbar = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;background:${isDark?'#0d1520':'#f8fafc'};border:1px solid ${isDark?'#1e3048':'#e2e8f0'};border-radius:8px;padding:6px 10px;">
    <span style="font-size:11px;font-weight:700;color:${isDark?'#c8d8ec':'#374151'};flex-shrink:0;">距離：</span>
    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${
      [null, ...allDistNums].map(d => {
        const isActive = d === null ? selDist === null : d === selDist;
        const label = d === null ? '全' : d + 'm';
        return `<button onclick="setAbilityFilter(${raceNo},'dist',${d===null?'null':d})" style="font-size:11px;font-weight:${isActive?'800':'600'};padding:2px 9px;border-radius:12px;border:1.5px solid ${isActive?'#7c3aed':'#e2e8f0'};background:${isActive?'#7c3aed':'#fff'};color:${isActive?'#fff':'#374151'};cursor:pointer;">${label}</button>`;
      }).join('')
    }</div>
    <span style="font-size:11px;font-weight:700;color:#374151;flex-shrink:0;margin-left:6px;">日付HL：</span>
    <input type="date" value="${selDate}" onchange="setAbilityFilter(${raceNo},'date',this.value)" style="font-size:11px;padding:2px 6px;border:1.5px solid #e2e8f0;border-radius:6px;color:#374151;background:#fff;">
    ${selDate ? `<button onclick="setAbilityFilter(${raceNo},'date','')" style="font-size:11px;padding:2px 7px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#94a3b8;cursor:pointer;">✕</button>` : ''}
  </div>`;

  container.innerHTML = `
  ${filterToolbar}
  ${biasBar}
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
    ${headerRow}
    <div style="display:flex;flex-direction:column;gap:0;">
      ${rows}
    </div>
  </div>
  ${visibleCount < data.horses.length ? `<button type="button" class="btn btn-secondary" onclick="showMoreAbilityHorses(${raceNo})" style="width:100%;margin-top:8px"><i class="fas fa-chevron-down"></i> 次の${Math.min(4, data.horses.length - visibleCount)}頭を表示（${visibleCount}/${data.horses.length}頭）</button>` : ''}
  <div style="font-size:10px;color:#9ca3af;margin-top:8px;padding:0 4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
    <i class="fas fa-info-circle"></i>
    <span>保存済みの高知競馬成績のみ表示。</span>
    <span><b style="color:#dc2626;">乗替</b>=当日騎手と異なる場合。</span>
    <span>補正タイム=タイム−馬場差−斤量補正(基準55kg)。</span>
    <span>通過順の<b style="color:#1a56a0;background:#e8edf5;padding:0 4px;border-radius:3px;">青ボックス</b>=最終コーナー。</span>
  </div>`;
}

// ============================================================
// 能力表 PDF / 画像エクスポート
// ============================================================

/**
 * 能力表を画像キャプチャして返す共通処理
 */
async function _captureAbilityCanvas(raceNo) {
  await ensureCaptureLibs(false);
  const target = document.getElementById(`ability-table-${raceNo}`);
  if (!target) throw new Error('能力表が見つかりません');

  // ボタン行は撮影対象外なので一時的に隠す
  const btnArea = target.closest('#view-ability-' + raceNo)?.querySelector('[id^="pdf-btn-"]')?.parentElement;
  if (btnArea) btnArea.style.visibility = 'hidden';

  try {
    const canvas = await html2canvas(target, {
      scale: 2,            // 高解像度
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollY: -window.scrollY,
    });
    return canvas;
  } finally {
    if (btnArea) btnArea.style.visibility = '';
  }
}

/**
 * 能力表を PDF でダウンロード
 */
async function exportAbilityPDF(raceNo) {
  const btn = document.getElementById(`pdf-btn-${raceNo}`);
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }

  try {
    await ensureCaptureLibs(true);
    const canvas  = await _captureAbilityCanvas(raceNo);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const { jsPDF } = window.jspdf;
    // 横向き A4 (mm): 297 × 210
    const pdf    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pgW    = pdf.internal.pageSize.getWidth();
    const pgH    = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableW = pgW - margin * 2;
    const usableH = pgH - margin * 2;

    const imgW = canvas.width;
    const imgH = canvas.height;
    const ratio = Math.min(usableW / imgW, usableH / imgH);
    const drawW = imgW * ratio;
    const drawH = imgH * ratio;
    const offsetX = margin + (usableW - drawW) / 2;
    const offsetY = margin;

    // タイトル
    const raceData = allRacesData[raceNo];
    const title = raceData
      ? `${raceData.raceInfo.raceDate || ''} ${raceData.raceInfo.raceName || raceNo + 'R'} 能力表`
      : `${raceNo}R 能力表`;

    pdf.setFontSize(10);
    pdf.setTextColor(60, 60, 60);
    pdf.text(title, margin, margin - 2);
    pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH);

    const fileName = `ability_${raceNo}R_${(raceData?.raceInfo?.raceDate || '').replace(/\//g, '')}.pdf`;
    pdf.save(fileName);

    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> 保存完了'; btn.style.background = 'linear-gradient(135deg,#16a34a,#15803d)'; }
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; btn.style.background = ''; }
    }, 2500);
  } catch (e) {
    console.error('[exportAbilityPDF]', e);
    alert('PDF生成に失敗しました: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
  }
}

/**
 * 能力表を PNG 画像でダウンロード
 */
async function exportAbilityImage(raceNo) {
  const btn = document.getElementById(`img-btn-${raceNo}`);
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }

  try {
    const canvas = await _captureAbilityCanvas(raceNo);
    const link   = document.createElement('a');
    const raceData = allRacesData[raceNo];
    link.download = `ability_${raceNo}R_${(raceData?.raceInfo?.raceDate || '').replace(/\//g, '')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> 保存完了'; btn.style.background = 'linear-gradient(135deg,#0284c7,#0369a1)'; }
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; btn.style.background = ''; }
    }, 2500);
  } catch (e) {
    console.error('[exportAbilityImage]', e);
    alert('画像生成に失敗しました: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
  }
}

// ============================================================
// 出走馬コメント一覧シート（全頭×最新10件 → PDF/画像）
// 注: シート内はエクスポート成果物のため意図的に固定ライト配色の
// インラインstyle（ダークモードでも白背景でキャプチャする）。
// ============================================================

/** コメント一覧モーダルを開く */
function openCommentSheet(raceNo) {
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) { alert('レースデータがありません'); return; }
  const { raceInfo, horses } = data;

  const WBG2 = w => ({'1':'#fff','2':'#111','3':'#c00','4':'#1a5ab8','5':'#e8c800','6':'#18a020','7':'#f05a00','8':'#c080c8'})[String(Math.min(Math.max(parseInt(w)||1,1),8))]||'#888';
  const WFG2 = w => [1,5,8].includes(parseInt(w)||1)?'#222':'#fff';

  const sorted = [...horses].sort((a,b)=>(parseInt(a.umaBan)||99)-(parseInt(b.umaBan)||99));
  const cards = sorted.map(h => {
    const waku = Math.min(Math.max(parseInt(h.wakuBan) || Math.ceil((parseInt(h.umaBan)||1)/2), 1), 8);
    const hist = getHorseHistory(h.horseName).filter(x => x.postComment && String(x.postComment).trim()).slice(0, 10);
    const lines = hist.length ? hist.map(x => {
      const ch = parseInt(x.chakujun);
      const chBadge = !isNaN(ch)
        ? `<span style="display:inline-block;width:22px;text-align:center;border-radius:3px;font-weight:800;font-size:10px;line-height:16px;background:${ch===1?'#f59e0b':ch===2?'#94a3b8':ch===3?'#cd7c32':'#e2e8f0'};color:${ch<=3?'#fff':'#475569'};">${ch}</span>`
        : '<span style="display:inline-block;width:22px;text-align:center;font-size:10px;color:#9ca3af;line-height:16px;">—</span>';
      const rWk = Math.min(Math.max(parseInt(x.wakuBan) || Math.ceil((parseInt(x.umaBan)||1)/2), 1), 8);
      const rUma = x.umaBan || '';
      // 各列は固定幅（flex-shrink:0）＝着順バッジが縦に揃う。枠馬番・騎手はその過去走のもの。
      return `<div style="display:flex;align-items:flex-start;gap:5px;padding:2.5px 0;border-bottom:1px dashed #eef2f7;">
        <span style="width:58px;font-size:9.5px;color:#64748b;white-space:nowrap;font-family:monospace;flex-shrink:0;padding-top:1px;">${x.raceDate||''}</span>
        <span style="width:40px;flex-shrink:0;display:inline-flex;align-items:center;gap:2px;padding-top:1px;">
          <span style="background:${WBG2(rWk)};color:${WFG2(rWk)};border:${rWk===1?'1px solid #bbb':'none'};width:14px;height:14px;border-radius:2px;font-size:9px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${rWk}</span>
          <span style="font-size:9px;font-weight:700;color:#475569;">${rUma}</span>
        </span>
        <span style="width:52px;flex-shrink:0;font-size:9px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-top:1px;" title="${x.jockey||''}">${x.jockey||'—'}</span>
        <span style="width:74px;flex-shrink:0;font-size:9px;color:#94a3b8;white-space:nowrap;padding-top:1px;">${x.raceClass||''}${x.distance?` ${x.distance}`:''}</span>
        ${chBadge}
        <span style="flex:1;font-size:11px;color:#1e293b;line-height:1.45;">${escapeHTML(String(x.postComment).trim())}</span>
      </div>`;
    }).join('') : '<div style="font-size:11px;color:#9ca3af;padding:4px 0;">保存済みコメントなし</div>';
    return `<div class="cmt-sheet-card" style="border:1px solid #dde3ef;border-radius:8px;margin-bottom:8px;overflow:hidden;background:#fff;">
      <div style="display:flex;align-items:center;gap:7px;background:#f1f5f9;border-bottom:1px solid #dde3ef;padding:4px 10px;">
        <span style="background:${WBG2(waku)};color:${WFG2(waku)};border:${waku===1?'1px solid #aaa':'none'};min-width:19px;height:19px;border-radius:3px;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;">${waku}</span>
        <span style="font-size:12px;font-weight:800;color:#475569;">${h.umaBan}番</span>
        <span style="font-size:13.5px;font-weight:900;color:#0f172a;">${escapeHTML(h.horseName)}</span>
        ${h.jockey?`<span style="font-size:10.5px;color:#64748b;">${escapeHTML(h.jockey)}</span>`:''}
        <span style="margin-left:auto;font-size:9px;color:#94a3b8;">コメント${hist.length}件</span>
      </div>
      <div style="padding:4px 10px 6px;">${lines}</div>
    </div>`;
  }).join('');

  const title = `${raceInfo.raceDate||''} ${raceNo}R ${raceInfo.raceName||''}（${raceInfo.distance||''}・${raceInfo.raceClass||''}）`;
  let overlay = document.getElementById('comment-sheet-overlay');
  if (overlay) closeCommentSheet();
  overlay = document.createElement('div');
  overlay.id = 'comment-sheet-overlay';
  // ダークモードは [style*="background:#fff"] 属性セレクタで!important上書きするため、
  // シート表示中のみdark-modeクラスを外す（エクスポート成果物は常にライト配色で撮る）。
  overlay._wasDark = document.body.classList.contains('dark-mode');
  if (overlay._wasDark) document.body.classList.remove('dark-mode');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.55);overflow-y:auto;padding:20px 10px;';
  overlay.innerHTML = `
    <div style="max-width:860px;margin:0 auto;">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px;position:sticky;top:0;z-index:1;">
        <button type="button" id="cmt-pdf-btn" onclick="exportCommentPDF(${raceNo})" style="padding:7px 16px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);"><i class="fas fa-file-pdf"></i> PDFで保存</button>
        <button type="button" id="cmt-img-btn" onclick="exportCommentImage(${raceNo})" style="padding:7px 16px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);"><i class="fas fa-image"></i> 画像で保存</button>
        <button type="button" id="cmt-x-btn" onclick="exportCommentImageX(${raceNo})" title="Xの圧縮で文字が潰れないよう大きな文字で撮影し、必ず4枚以内に分割して保存（1ポストにそのまま添付可）" style="padding:7px 16px;background:linear-gradient(135deg,#0f172a,#334155);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);">𝕏 X用に分割保存（4枚以内）</button>
        <button type="button" onclick="closeCommentSheet()" style="padding:7px 16px;background:#475569;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);"><i class="fas fa-times"></i> 閉じる</button>
      </div>
      <div id="comment-sheet-${raceNo}" style="background:#fff;border-radius:10px;padding:14px 16px;box-shadow:0 4px 24px rgba(0,0,0,.35);">
        <div style="display:flex;align-items:baseline;gap:8px;border-bottom:2px solid #1a56a0;padding-bottom:6px;margin-bottom:10px;">
          <span style="font-size:15px;font-weight:900;color:#0f172a;">💬 出走馬コメント一覧</span>
          <span style="font-size:11.5px;font-weight:700;color:#475569;">${title}</span>
          <span style="margin-left:auto;font-size:9px;color:#94a3b8;">各馬最新10件・高知競馬ビューア</span>
        </div>
        ${cards}
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeCommentSheet(); });
  document.body.appendChild(overlay);
}

/** コメント一覧モーダルを閉じる（開く時に外したdark-modeクラスを復元） */
function closeCommentSheet() {
  const ov = document.getElementById('comment-sheet-overlay');
  if (!ov) return;
  if (ov._wasDark) document.body.classList.add('dark-mode');
  ov.remove();
}

/** コメントシートをキャプチャ（共通） */
async function _captureCommentCanvas(raceNo, scale) {
  await ensureCaptureLibs(false);
  const target = document.getElementById(`comment-sheet-${raceNo}`);
  if (!target) throw new Error('コメント一覧が見つかりません');
  const canvas = await html2canvas(target, { scale: scale || 2, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollY: -window.scrollY });
  return { canvas, target };
}

/** 馬カード境界で改ページ/分割位置を計算（canvas px の [y0,y1] 配列を返す）
 *  「カードiを含めると1ページが溢れる」ならカードiの頭で切る先読み方式。
 *  1カードがページ超えの場合のみハードスライス。 */
function _commentPageSlices(canvas, target, pageHpx) {
  const tTop = target.getBoundingClientRect().top;
  const pxRatio = canvas.width / target.offsetWidth;
  const breaks = [...target.querySelectorAll('.cmt-sheet-card')].map(el => (el.getBoundingClientRect().top - tTop) * pxRatio);
  const cuts = [0];
  let cur = 0;
  for (let i = 0; i < breaks.length; i++) {
    const cardEnd = (i + 1 < breaks.length) ? breaks[i + 1] : canvas.height;
    if (cardEnd - cur > pageHpx && breaks[i] > cur) { cuts.push(breaks[i]); cur = breaks[i]; }
  }
  const slices = [];
  for (let i = 0; i < cuts.length; i++) {
    let y = cuts[i];
    const end = (i + 1 < cuts.length) ? cuts[i + 1] : canvas.height;
    while (end - y > pageHpx) { slices.push([y, y + pageHpx]); y += pageHpx; }
    if (end - y > 4) slices.push([y, end]);
  }
  return slices;
}

/** 馬カードの上端オフセット配列（canvas px）＝分割候補の境界。先頭は0（ヘッダ含む）、末尾はcanvas.height。 */
function _commentCardBounds(canvas, target) {
  const tTop = target.getBoundingClientRect().top;
  const pxRatio = canvas.width / target.offsetWidth;
  const tops = [...target.querySelectorAll('.cmt-sheet-card')].map(el => (el.getBoundingClientRect().top - tTop) * pxRatio);
  if (!tops.length) return [0, canvas.height];
  tops[0] = 0;                       // 1枚目にヘッダを含める
  return tops.concat(canvas.height); // カードn個 → 境界n+1個
}

/** カード境界だけで k枚以下に「各ページ高さが最も揃う」ように分割（最大ページ高を二分探索で最小化）。 */
function _balancedSlices(bounds, k) {
  const m = bounds.length - 1;                 // カード数
  if (m <= 0) return [[0, bounds[bounds.length - 1]]];
  const h = i => bounds[i + 1] - bounds[i];
  const feasible = H => {                       // 最大ページ高Hで何ページ必要か（≤kならOK）
    let pages = 1, cur = 0;
    for (let i = 0; i < m; i++) {
      const ci = h(i);
      if (cur > 0 && cur + ci > H) { pages++; cur = ci; } else cur += ci;
      if (pages > k) return false;
    }
    return true;
  };
  let lo = 0; for (let i = 0; i < m; i++) lo = Math.max(lo, h(i)); // 1カードは分割不可＝下限
  let hi = bounds[m] - bounds[0];
  for (let it = 0; it < 45; it++) { const mid = (lo + hi) / 2; if (feasible(mid)) hi = mid; else lo = mid; }
  const H = hi;
  const slices = []; let s = 0, cur = 0;
  for (let i = 0; i < m; i++) {
    const ci = h(i);
    if (cur > 0 && cur + ci > H) { slices.push([bounds[s], bounds[i]]); s = i; cur = ci; } else cur += ci;
  }
  slices.push([bounds[s], bounds[m]]);
  return slices;
}

/** コメント一覧をPDF保存（A4縦・馬カード境界で改ページ） */
async function exportCommentPDF(raceNo) {
  const btn = document.getElementById('cmt-pdf-btn');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }
  try {
    await ensureCaptureLibs(true);
    const { canvas, target } = await _captureCommentCanvas(raceNo);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 8;
    const usableW = pdf.internal.pageSize.getWidth() - margin * 2;
    const usableH = pdf.internal.pageSize.getHeight() - margin * 2;
    const mmRatio = usableW / canvas.width;                  // canvas px → mm
    const pageHpx = usableH / mmRatio;                       // 1ページに入るcanvas高
    const slices = _commentPageSlices(canvas, target, pageHpx);
    slices.forEach(([y0, y1], i) => {
      const h = y1 - y0;
      const c2 = document.createElement('canvas');
      c2.width = canvas.width; c2.height = h;
      c2.getContext('2d').drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
      if (i > 0) pdf.addPage();
      pdf.addImage(c2.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, usableW, h * mmRatio);
    });
    const rd = (allRacesData[raceNo]?.raceInfo?.raceDate || '').replace(/\//g, '');
    pdf.save(`comments_${raceNo}R_${rd}.pdf`);
    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> 保存完了'; setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 2500); }
  } catch (e) {
    console.error('[exportCommentPDF]', e);
    alert('PDF生成に失敗しました: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

/** コメント一覧をX(Twitter)用に分割PNG保存。
 *  Xは長い画像を強制縮小＋JPEG再圧縮するため縦長1枚だと文字が潰れる。
 *  対策：シートを狭幅(640px)に組み替えて文字を相対的に大きくし、scale3で撮って
 *  馬カード境界で4:5比率（X表示に最適）の画像に分割する。Xには4枚まで添付可。 */
async function exportCommentImageX(raceNo) {
  const btn = document.getElementById('cmt-x-btn');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }
  const target = document.getElementById(`comment-sheet-${raceNo}`);
  const origW = target ? target.style.width : '';
  try {
    if (!target) throw new Error('コメント一覧が見つかりません');
    target.style.width = '640px';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // reflow待ち
    const { canvas } = await _captureCommentCanvas(raceNo, 3);
    // まず4:5（幅:高）でXのタイムライン表示に最適な枚数を試し、Xの添付上限4枚を
    // 超える時だけ「4枚均等分割」に切り替える（1枚が縦長になるが文字解像度は不変＝潰れない）。
    let slices = _commentPageSlices(canvas, target, canvas.width * 1.25);
    if (slices.length > 4) slices = _balancedSlices(_commentCardBounds(canvas, target), 4);
    const rd = (allRacesData[raceNo]?.raceInfo?.raceDate || '').replace(/\//g, '');
    let i = 0;
    for (const [y0, y1] of slices) {
      const h = y1 - y0;
      const c2 = document.createElement('canvas');
      c2.width = canvas.width; c2.height = h;
      const ctx = c2.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c2.width, c2.height);
      ctx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
      const link = document.createElement('a');
      link.download = `comments_${raceNo}R_${rd}_x${++i}.png`;
      link.href = c2.toDataURL('image/png');
      link.click();
      await new Promise(r => setTimeout(r, 350)); // 連続DLブロック回避
    }
    if (btn) { btn.innerHTML = `<i class="fas fa-check"></i> ${slices.length}枚保存`; setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 3000); }
  } catch (e) {
    console.error('[exportCommentImageX]', e);
    alert('X用画像の生成に失敗しました: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  } finally {
    if (target) { target.style.width = origW; }
  }
}

/** コメント一覧をPNG画像保存（縦長1枚） */
async function exportCommentImage(raceNo) {
  const btn = document.getElementById('cmt-img-btn');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }
  try {
    const { canvas } = await _captureCommentCanvas(raceNo);
    const link = document.createElement('a');
    const rd = (allRacesData[raceNo]?.raceInfo?.raceDate || '').replace(/\//g, '');
    link.download = `comments_${raceNo}R_${rd}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> 保存完了'; setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 2500); }
  } catch (e) {
    console.error('[exportCommentImage]', e);
    alert('画像生成に失敗しました: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

// ============================================================
// ラップタイム入力ユーティリティ
// ============================================================

/**
 * 距離文字列から区間ラベル配列を返す
 * 例: "1300m" → ["1F","2F","3F","4F","5F","6F"] (200m×6区間+ゴール)
 * 実際には各200m区間のラップ秒数を入力してもらう
 * 高知競馬の主要距離に合わせたラベル付け
 */
/** 高知の距離ごとの区間の切り方（各区間の「終わりの地点(m)」）。
 *  ⛔以前は `Math.round(距離/200)` の200m均等割りだった。それだと
 *    ・1300m → 7区間で「200m…1400m」と、**先頭の半ハロン(100m)が消えて距離を超えるラベル**になる
 *    ・1900m → `Math.min(d,1800)` で打ち切られ、末尾の300mが表示されない
 *  ⛔端数の置き場所は距離で違う。**推測せず実測どおりに固定する**（2026-07-28に、ユーザーの
 *    ラップ表259レースと、既にビューアへ手入力済みの130レースの実物で確認。両者は完全一致）:
 *    ・1300m = 100m + 200m×6   （先頭が半ハロン。表の「0.5F」列。例 6.9秒）
 *    ・1900m = 200m×8 + 300m   （末尾が1ハロン半。表の「9F」が約20秒＝300m相当）
 *  区間数はどの距離も従来と同数なので、**保存済み lapTimes の並びはずれない**。 */
const LAP_SEG_ENDS = {
  800:  [200, 400, 600, 800],
  1300: [100, 300, 500, 700, 900, 1100, 1300],
  1400: [200, 400, 600, 800, 1000, 1200, 1400],
  1600: [200, 400, 600, 800, 1000, 1200, 1400, 1600],
  1800: [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800],
  1900: [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1900],
};

function getLapSegments(distStr) {
  if (!distStr) return [];
  const m = distStr.match(/(\d+)/); if (!m) return [];
  const d = parseInt(m[1]);
  if (!(d > 0)) return [];
  // ⛔未確認の距離は「200mずつ・端数は最後の区間にまとめる」で描く。高知の実施距離は上表で尽きている。
  let ends = LAP_SEG_ENDS[d];
  if (!ends) {
    ends = [];
    for (let x = 200; x + 200 <= d; x += 200) ends.push(x);
    ends.push(d);
  }
  return ends.map((end, i) => ({ label: `${end}m`, meters: end - (i ? ends[i - 1] : 0) }));
}

/** ラップ欄の見出しに出す「区間の切り方」の一言。
 *  ⛔固定文言にしない。端数の置き場所が距離で違うので「200m区間ごと」と書くと事実と違う
 *    （1300m=最初が100m / 1900m=最後が300m）。LAP_SEG_ENDS から毎回作る。 */
function getLapSegNote(distStr) {
  const segs = getLapSegments(distStr);
  if (!segs.length) return '';
  if (segs[0].meters !== 200) return `（最初が${segs[0].meters}m・以降200mごと）`;
  const last = segs[segs.length - 1];
  if (last.meters !== 200) return `（200mごと・最後が${last.meters}m）`;
  return '（200mごと）';
}

/** サイト同梱のユーザー手計測ラップ（data/kochi-user-laps.js）を引く。
 *  ⛔**DBに値があるレースでは絶対に使わない**。呼び出し側で「空のときだけ」に限定している。
 *  ⛔ここは表示を埋めるだけでDBには書かない。管理者が保存を押したときに初めてDBへ入る。 */
function userLapsFor(dateStr, raceNo) {
  const t = window.KOCHI_USER_LAPS && window.KOCHI_USER_LAPS.laps;
  if (!t || !dateStr) return null;
  const day = t[String(dateStr).replace(/-/g, '/')];
  if (!day) return null;
  const a = day[String(parseInt(raceNo, 10))];
  return (Array.isArray(a) && a.some(v => v != null)) ? a.slice() : null;
}

/** ラップ入力UIをレンダリング（raceNo, distStr, 保存済みラップ配列） — 改良デザイン */
function renderLapInputs(raceNo, distStr, savedLaps) {
  const container = document.getElementById(`lap-inputs-${raceNo}`);
  if (!container) return;
  const segs = getLapSegments(distStr);
  // 距離が後から届く経路があるので、見出しの「区間の切り方」もここで追随させる
  const noteEl = document.getElementById(`lap-seg-note-${raceNo}`);
  if (noteEl) noteEl.textContent = getLapSegNote(distStr);
  if (!segs.length) { container.innerHTML = '<span style="font-size:12px;color:#9ca3af">距離情報がないため入力できません</span>'; return; }

  // 区間ごとのカラーグラデーション（スタートから後半へ）
  const segColors = [
    {bg:'#ede9fe',border:'#8b5cf6',text:'#4c1d95',dot:'#7c3aed'},
    {bg:'#e0e7ff',border:'#6366f1',text:'#312e81',dot:'#4f46e5'},
    {bg:'#dbeafe',border:'#3b82f6',text:'#1e3a8a',dot:'#2563eb'},
    {bg:'#d1fae5',border:'#10b981',text:'#064e3b',dot:'#059669'},
    {bg:'#fef3c7',border:'#f59e0b',text:'#78350f',dot:'#d97706'},
    {bg:'#fee2e2',border:'#ef4444',text:'#7f1d1d',dot:'#dc2626'},
    {bg:'#fce7f3',border:'#ec4899',text:'#831843',dot:'#db2777'},
    {bg:'#f0fdf4',border:'#22c55e',text:'#14532d',dot:'#16a34a'},
    {bg:'#fff7ed',border:'#fb923c',text:'#7c2d12',dot:'#ea580c'},
  ];

  const segHtml = segs.map((seg, i) => {
    const savedVal = (savedLaps && savedLaps[i] != null) ? savedLaps[i] : '';
    const c = segColors[i % segColors.length];
    return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;position:relative;">
      <div style="display:flex;align-items:center;gap:3px;">
        <span style="width:7px;height:7px;border-radius:50%;background:${c.dot};display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:9px;color:${c.text};font-weight:800;white-space:nowrap;letter-spacing:.03em;">${seg.label}</span>
      </div>
      <input type="text" inputmode="decimal" id="lap-${raceNo}-${i}" placeholder="--.-" class="admin-only"
        value="${savedVal != null && savedVal !== '' ? parseFloat(savedVal).toFixed(1) : ''}"
        oninput="onLapInput(${raceNo})"
        style="width:56px;padding:6px 4px;border:2px solid ${c.border};border-radius:8px;font-size:13px;font-weight:700;text-align:center;font-family:monospace;color:${c.text};background:${c.bg};transition:box-shadow .15s,border-color .15s;outline:none;"
        onfocus="this.style.boxShadow='0 0 0 3px ${c.dot}40';this.style.borderColor='${c.dot}';"
        onblur="if(this.value&&!isNaN(parseFloat(this.value)))this.value=parseFloat(this.value).toFixed(1);this.style.boxShadow='';this.style.borderColor='${c.border}';">
      <span class="viewer-only lap-val${savedVal === '' ? ' lap-val--none' : ''}">${savedVal === '' ? '—' : parseFloat(savedVal).toFixed(1)}</span>
      <span id="lap-cumul-${raceNo}-${i}" style="font-size:8px;color:${c.dot};font-weight:800;white-space:nowrap;min-height:12px;text-align:center;"></span>
    </div>
    ${i < segs.length - 1 ? `<div style="flex-shrink:0;align-self:center;padding-top:14px;color:#c4b5fd;font-size:16px;line-height:1;opacity:0.5;">›</div>` : ''}`;
  }).join('');

  container.innerHTML = `
  <div style="display:flex;flex-direction:row;flex-wrap:nowrap;align-items:flex-start;gap:3px;padding:4px 2px 2px;overflow-x:auto;width:100%;scrollbar-width:thin;scrollbar-color:#c4b5fd transparent;">
    ${segHtml}
    <div id="lap-total-${raceNo}" style="flex-shrink:0;align-self:center;margin-left:10px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:800;font-family:monospace;white-space:nowrap;box-shadow:0 3px 10px rgba(124,58,237,.3);text-align:center;min-width:80px;">
      <div style="font-size:8px;opacity:0.8;margin-bottom:2px;letter-spacing:.05em;">合 計</div>
      <div id="lap-total-value-${raceNo}">--.-秒</div>
    </div>
  </div>`;

  if (savedLaps && savedLaps.some(v => v != null)) onLapInput(raceNo);
}

/** ラップ入力時の累積タイム計算 */
function onLapInput(raceNo) {
  const data = allRacesData[raceNo]; if (!data) return;
  const distStr = data.raceInfo.distance || '';
  const segs = getLapSegments(distStr);
  const vals = segs.map((_, i) => {
    const v = parseFloat(document.getElementById(`lap-${raceNo}-${i}`)?.value);
    return isNaN(v) ? null : v;
  });

  // メモリに保存
  data.raceInfo.lapTimes = vals;

  // 累積タイム更新
  let cumul = 0;
  vals.forEach((v, i) => {
    const el = document.getElementById(`lap-cumul-${raceNo}-${i}`);
    if (!el) return;
    if (v != null) {
      cumul += v;
      el.textContent = cumul.toFixed(1) + '秒';
    } else {
      el.textContent = '';
    }
  });

  // 合計バッジ
  const filled = vals.filter(v => v != null);
  const totalEl    = document.getElementById(`lap-total-${raceNo}`);
  const totalValEl = document.getElementById(`lap-total-value-${raceNo}`);
  if (totalEl) {
    if (filled.length === segs.length) {
      const total = vals.reduce((a, b) => a + b, 0);
      if (totalValEl) totalValEl.textContent = `${total.toFixed(1)}秒`;
      else totalEl.innerHTML = `<div style="font-size:8px;opacity:.8;margin-bottom:2px;">合 計</div><div>${total.toFixed(1)}秒</div>`;
      totalEl.style.background = 'linear-gradient(135deg,#16a34a,#15803d)';
      totalEl.style.boxShadow   = '0 3px 10px rgba(22,163,74,.35)';
    } else if (filled.length > 0) {
      const partial = filled.reduce((a, b) => a + b, 0);
      if (totalValEl) totalValEl.textContent = `${partial.toFixed(1)}秒`;
      else totalEl.innerHTML = `<div style="font-size:8px;opacity:.8;margin-bottom:2px;">${filled.length}/${segs.length}区間</div><div>${partial.toFixed(1)}秒</div>`;
      totalEl.style.background = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
      totalEl.style.boxShadow   = '0 3px 10px rgba(124,58,237,.3)';
    } else {
      if (totalValEl) totalValEl.textContent = '--.-秒';
      else totalEl.innerHTML = `<div style="font-size:8px;opacity:.8;margin-bottom:2px;">合 計</div><div>--.-秒</div>`;
      totalEl.style.background = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
      totalEl.style.boxShadow   = '0 3px 10px rgba(124,58,237,.3)';
    }
  }

  // 最初の3区間（=前半3F=600m）が揃ったら前半3Fを自動入力
  // 1300m/1900m等200m非倍数距離はスキップ
  if (segs.length >= 3) {
    const distNum = getDistNum(data.raceInfo.distance);
    if (distNum && distNum % 200 === 0) {
      const first3 = vals.slice(0, 3);
      if (first3.every(v => v !== null)) {
        const f3sum = first3.reduce((a, b) => a + b, 0);
        const f3Input = document.getElementById(`race-first3f-${raceNo}`);
        const info = data.raceInfo || {};
        const hasProtectedValue = String(info.first3f || f3Input?.value || '').trim()
          && !_isAutoFirst3fSource(info.first3fSource);
        if (f3Input && !hasProtectedValue && f3Input.value !== f3sum.toFixed(1)) {
          f3Input.value = f3sum.toFixed(1);
          info.first3f = f3sum.toFixed(1);
          info.first3fSource = FIRST3F_SOURCE.LAP_SUM;
          updateRacePace(raceNo);
          _updateFirst3fSourceBadge(raceNo);
        }
      }
    }
  }
}

// ── DB ヘルパー ──
// ============================================================
// Supabase 設定
// ============================================================
const SUPABASE_URL = 'https://jcrcftvrsgmsewwdkqha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcmNmdHZyc2dtc2V3d2RrcWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MDY0NjgsImV4cCI6MjA5NjM4MjQ2OH0.UED2rJNsuTPqofrhhNhQ2RM0NKc2eJ6qHllfbnebMe0';
const SUPABASE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
};
window.kvSupabaseReadConfig = () => ({ url:SUPABASE_URL, headers:SUPABASE_HEADERS });

// ============================================================
// オッズ推移（keiba_odds_snapshots・表示専用）
// 馬モーダル・AI予想タブの両方から利用する共通ヘルパー。
// computeYosoScored等の予想ロジックは一切参照・変更しない独立関数。
// ============================================================
const _oddsHistCache = {};  // race_date__race_no をキーに1レース分をまとめて1回だけ取得
function fetchRaceOddsHistory(raceDateSlash, raceNo) {
  const key = `${raceDateSlash}__${raceNo}`;
  if (_oddsHistCache[key]) return _oddsHistCache[key];
  // Supabase RESTの既定最大行数（通常1,000件）で途中欠落しないよう、1レース分をページ取得する。
  // 取得失敗時は従来どおり表示を省略し、予想計算・保存処理には影響させない。
  const p = (async () => {
    const pageSize = 1000;
    const allRows = [];
    for (let offset = 0; ; offset += pageSize) {
      const url = `${SUPABASE_URL}/rest/v1/keiba_odds_snapshots?select=captured_at,uma_ban,odds,ninki,minutes_to_post,post_time`
        + `&race_date=eq.${encodeURIComponent(raceDateSlash)}&race_no=eq.${encodeURIComponent(raceNo)}`
        + `&order=captured_at.asc,uma_ban.asc&limit=${pageSize}&offset=${offset}`;
      let rows;
      try {
        const response = await fetch(url, { headers: SUPABASE_HEADERS, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`オッズ履歴 HTTP ${response.status}`);
        rows = await response.json();
      } catch (error) {
        throw error;
      }
      if (!Array.isArray(rows)) throw new Error('オッズ履歴の応答形式が不正です');
      allRows.push(...rows);
      if (rows.length < pageSize) return allRows;
    }
  })();
  const retryable = p.catch(error => { delete _oddsHistCache[key]; throw error; });
  _oddsHistCache[key] = retryable;
  return retryable;
}
function destroyHorseOddsHistoryChart() {
  if (!window._hmOddsHistoryChart) return;
  try { window._hmOddsHistoryChart.destroy(); } catch (_) { _kvSwallow('destroyHorseOddsHistoryChart', _); }
  window._hmOddsHistoryChart = null;
}
function oddsMoveBadgeHtml(hist) {
  // 表示専用・事実の記述のみ（門別の逆/恵バッジと同じ「価値判断語なし」方針）
  if (!hist || hist.length < 2) return '';
  const first = hist[0].odds, last = hist[hist.length - 1].odds;
  if (!first || !last) return '';
  const ratio = last / first;
  if (ratio <= 0.7) return ` <span class="hm-odds-move down" title="捕捉開始時点から現在までにオッズが${first}→${last}倍に変動">↓変動</span>`;
  if (ratio >= 1.4) return ` <span class="hm-odds-move up" title="捕捉開始時点から現在までにオッズが${first}→${last}倍に変動">↑変動</span>`;
  return '';
}
async function renderHorseOddsHistory(containerId, raceDateSlash, raceNo, umaBan, horseName) {
  if (!document.getElementById(containerId)) return;
  let rows;
  try { rows = (await fetchRaceOddsHistory(raceDateSlash, raceNo)).filter(r => String(r.uma_ban) === String(umaBan)); }
  catch (_) { return; }
  if (rows.length < 2) return;  // データ不足時は無表示
  // モーダルが別馬に切り替わっていたら描画しない（openHorseModalの再入によるレースコンディション対策）
  const titleEl = document.getElementById('horse-modal-title');
  if (titleEl && titleEl.textContent !== `🐴 ${horseName} の過去成績`) return;
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="hm-odds-box">
    <div class="hm-odds-hd">📈 オッズ推移（このレース）${oddsMoveBadgeHtml(rows)}</div>
    <div class="hm-odds-chart-wrap"><canvas id="hm-odds-canvas-${raceNo}-${umaBan}"></canvas></div>
    <div class="hm-odds-note">単勝オッズの推移を表示しています。購入判断には使用していません。</div>
  </div>`;
  // ensureChartJs は ai-analysis.js にしか無い（上の _bnRenderChart と同じ理由でこちらを使う）
  _kvLoadLibrary('chart').then(() => {
    const canvas = document.getElementById(`hm-odds-canvas-${raceNo}-${umaBan}`);
    if (!canvas || !window.Chart) return;
    const labels = rows.map(r => new Date(r.captured_at).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'}));
    destroyHorseOddsHistoryChart();
    window._hmOddsHistoryChart = new Chart(canvas, { type: 'line',
      data: { labels, datasets: [{ label: `${horseName} 単勝オッズ`, data: rows.map(r => r.odds),
        borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', borderWidth: 2, fill: true, tension: .25, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: '倍', font: { size: 10 } } }, x: { ticks: { font: { size: 9 }, maxRotation: 45 } } } }
    });
  }).catch(e => _kvSwallow('renderHorseOddsHistory:chart', e));
}

// Cloudflare Worker書込。Tokenは管理者セッション中だけ保持する。
const WORKER_URL = 'https://keiba-proxydeploy.maguronagareboshi.workers.dev';
function getWriteToken() { return sessionStorage.getItem('kv_write_token') || localStorage.getItem('kv_write_token') || ''; }

async function apiCheckWriteAccess() {
  const token = getWriteToken();
  if (!token) { const e = new Error('管理者認証がありません。再ログインしてください'); e.status = 401; throw e; }
  let res;
  try {
    res = await fetch(`${WORKER_URL}/auth/check`, { method:'GET', headers:{'X-Write-Token':token}, signal:AbortSignal.timeout(10000) });
  } catch (cause) { throw new Error('保存サーバーの認証確認に失敗しました。通信状態を確認してください', { cause }); }
  if (!res.ok) { const e = new Error(res.status === 401 ? '保存権限の有効期限が切れています。再ログインしてください' : `保存サーバーの認証確認に失敗しました（HTTP ${res.status}）`); e.status = res.status; throw e; }
  return true;
}

/** Supabase REST API：upsert（INSERT OR UPDATE）— Worker 経由で書き込み */
async function apiUpsert(table, id, payload) {
  const token = getWriteToken();
  if (!token) throw new Error('管理者認証がありません');
  const body = { ...payload, id };
  let res;
  try {
    res = await fetch(`${WORKER_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Write-Token': token,
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    throw new Error(`${table}/${id} の通信に失敗しました`, { cause });
  }
  const raw = await res.text();
  if (!res.ok) throw new Error(`${table}/${id} の保存に失敗しました（HTTP ${res.status}）${raw ? `: ${raw.slice(0, 240)}` : ''}`);
  return raw ? (() => { try { return JSON.parse(raw); } catch (_) { return raw; } })() : true;
}

/** 1レースと全出走馬をDBトランザクションで保存する。RPC未導入時は成功扱いにしない。 */
async function apiSaveRaceBundle(raceId, raceRow, horseRows) {
  const token = getWriteToken();
  if (!token) throw new Error('管理者認証がありません');
  const expected = (horseRows || []).map(row => parseInt(row.uma_ban, 10)).filter(Number.isFinite).sort((a,b) => a-b);
  if (!expected.length || new Set(expected).size !== expected.length) throw new Error('出走馬の馬番集合が不正です');
  let res;
  try {
    res = await fetch(`${WORKER_URL}/rpc/save-keiba-race-bundle`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Write-Token':token},
      body:JSON.stringify({ race_id:raceId, race:raceRow, horses:horseRows, expected_uma_ban:expected }), signal:AbortSignal.timeout(20000),
    });
  } catch (cause) { throw new Error('保存サーバーとの通信に失敗しました', { cause }); }
  const raw = await res.text();
  if (!res.ok) { const e = new Error(`レース一括保存に失敗しました（HTTP ${res.status}）${raw ? `: ${raw.slice(0, 240)}` : ''}`); e.status = res.status; throw e; }
  let result = null;
  try { result = raw ? JSON.parse(raw) : null; } catch (_) { _kvSwallow('apiSaveRaceBundle', _); }
  const saved = Number(result?.saved_horses ?? result?.[0]?.saved_horses);
  if (!Number.isFinite(saved) || saved !== expected.length) throw new Error(`保存頭数が一致しません（予定${expected.length}頭／保存${Number.isFinite(saved) ? saved : '不明'}頭）`);
  return { savedHorses:saved, result };
}

// ============================================================
// IndexedDB ストレージ層（容量制限なし・通常数百MB〜GB単位）
// LocalStorage の代替として使用。同期APIに見せかけた
// 非同期キャッシュ（_idbCache）を内部で保持する。
// ============================================================
let _idbCache = null;       // メモリキャッシュ（起動後は常に最新）
let _horseHistCache = new Map(); // getHorseHistory 結果キャッシュ（idbPut/Delete時にクリア）
let _idbReady = false;      // キャッシュロード完了フラグ
let _idb = null;            // IDBDatabase インスタンス
let _idbFullReady = false;  // AI・分析用の全履歴をメモリへ展開済み
let _idbFullLoadPromise = null;
let _idbTotalCount = 0;     // 軽量起動時も完全同期の鮮度判定に使う実レコード数
const _idbLoadedDays = new Set();
let _horseKeyIndex = null;  // Map<horseName, Set<key>> — getHorseHistory 高速化用索引
let _raceDayIndex = null;   // Map<baba|date, Map<raceNo,{raceKey,raceVal,horseKeys}>> — 出馬表復元用
let _savedGroupsDirty = true; // buildSavedGroups 再計算フラグ
let _cacheInvalidateTimer = null; // idbPut キャッシュ無効化デバウンス用

const IDB_NAME    = 'keibaviewer';
const IDB_VERSION = 2;
const IDB_STORE   = 'kv';
const IDB_HORSE_INDEX = 'horseName';
const _raceHorseHistoryPromises = new Map();

function _raceDayIndexEntry(baba, date, raceNo, create) {
  if (!baba || !date || !Number.isFinite(Number(raceNo))) return null;
  if (!_raceDayIndex) {
    if (!create) return null;
    _raceDayIndex = new Map();
  }
  const dayKey = `${baba}|${date}`;
  let day = _raceDayIndex.get(dayKey);
  if (!day && create) { day = new Map(); _raceDayIndex.set(dayKey, day); }
  if (!day) return null;
  const rn = Number(raceNo);
  let entry = day.get(rn);
  if (!entry && create) {
    entry = { raceKey: '', raceVal: null, horseKeys: new Set() };
    day.set(rn, entry);
  }
  return entry || null;
}

/** 同期メモリキャッシュ用の2索引を1レコードずつ更新する。 */
function _indexStoredEntry(key, val) {
  if (!val || typeof val !== 'object') return;
  if (val.type === 'horse' && val.horseName) {
    if (!_horseKeyIndex) _horseKeyIndex = new Map();
    if (!_horseKeyIndex.has(val.horseName)) _horseKeyIndex.set(val.horseName, new Set());
    _horseKeyIndex.get(val.horseName).add(key);
  }
  if (val.type === 'race') {
    const entry = _raceDayIndexEntry(val.baba_code, val.race_date, val.race_no, true);
    if (entry) { entry.raceKey = key; entry.raceVal = val; }
    return;
  }
  if (val.type !== 'horse' || key.startsWith('offi_')) return;
  const parts = String(key).split('_');
  if (parts.length < 4) return;
  const entry = _raceDayIndexEntry(val.baba_code || parts[0], val.race_date || parts[1], val.race_no || parseInt(parts[2]), true);
  if (entry) entry.horseKeys.add(key);
}

function _unindexStoredEntry(key, val) {
  if (!val || typeof val !== 'object') return;
  if (val.type === 'horse' && val.horseName && _horseKeyIndex) {
    const set = _horseKeyIndex.get(val.horseName);
    set?.delete(key);
    if (set && !set.size) _horseKeyIndex.delete(val.horseName);
  }
  let baba = val.baba_code, date = val.race_date, rn = val.race_no;
  if (val.type === 'horse' && !key.startsWith('offi_') && (!baba || !date || !rn)) {
    const parts = String(key).split('_');
    baba = baba || parts[0]; date = date || parts[1]; rn = rn || parseInt(parts[2]);
  }
  const entry = _raceDayIndexEntry(baba, date, rn, false);
  if (!entry) return;
  if (val.type === 'race') { entry.raceKey = ''; entry.raceVal = null; }
  else if (val.type === 'horse') entry.horseKeys.delete(key);
  if (!entry.raceVal && !entry.horseKeys.size && _raceDayIndex) {
    const dayKey = `${baba}|${date}`, day = _raceDayIndex.get(dayKey);
    day?.delete(Number(rn));
    if (day && !day.size) _raceDayIndex.delete(dayKey);
  }
}

function _rebuildStoredIndexes(data) {
  _horseKeyIndex = new Map();
  _raceDayIndex = new Map();
  for (const [key, val] of Object.entries(data || {})) _indexStoredEntry(key, val);
}

function _idbPrefixRange(prefix) {
  return IDBKeyRange.bound(prefix, prefix + '\uffff');
}

function _idbStartupDate() {
  if (window._kvDeepLink?.date) return window._kvDeepLink.date;
  if (KV_IS_SIM) {
    try {
      const d = new URLSearchParams(location.search).get('date');
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(d || '')) return d;
    } catch (e) { _kvSwallow('_idbStartupDate', e); }
  }
  return _kvTodayYmd();
}

function _mergeIDBCachePairs(pairs) {
  if (!_idbCache) _idbCache = {};
  let vnextDirty = false;
  for (const [key, valRaw] of pairs || []) {
    if (key == null || valRaw == null) continue;
    const val = _sanDeep(valRaw);
    const old = _idbCache[key];
    if (old) _unindexStoredEntry(key, old);
    _idbCache[key] = val;
    _indexStoredEntry(key, val);
    if (val && (val.type === 'horse' || val.type === 'race')) vnextDirty = true;
  }
  _savedGroupsDirty = true;
  if (vnextDirty && window.kvResetVnextPartnerLiveIndex) window.kvResetVnextPartnerLiveIndex();
}

async function _readIDBPrefix(prefix) {
  await _idbFlushWrites();   // 溜めた書き込みを先に反映してから読む（読み書きの整合性）
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readonly');
  const store = tx.objectStore(IDB_STORE);
  const range = _idbPrefixRange(prefix);
  const reqValue = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
  const [keys, values] = await Promise.all([
    reqValue(store.getAllKeys(range)), reqValue(store.getAll(range)),
  ]);
  return keys.map((key, i) => [key, values[i]]);
}

/** 指定日のレース・馬・払戻だけをメモリへ展開する。 */
async function _ensureDayCacheLoaded(baba, date) {
  const dayKey = `${baba}|${date}`;
  if (_idbFullReady || _idbLoadedDays.has(dayKey)) return;
  const chunks = await Promise.all([
    _readIDBPrefix(`race_${baba}_${date}_`),
    _readIDBPrefix(`${baba}_${date}_`),
    _readIDBPrefix(`payout_${baba}_${date}_`),
    _readIDBPrefix(`aiPrecalc_v2|${baba}|${String(date).replace(/\D/g,'')}|`),
  ]);
  chunks.forEach(_mergeIDBCachePairs);
  _idbLoadedDays.add(dayKey);
}

/** AI・分析が必要になった時だけ、全履歴を一度だけメモリへ展開する。 */
async function _ensureFullIDBCache() {
  if (_idbFullReady) return _idbCache;
  if (_idbFullLoadPromise) return _idbFullLoadPromise;
  _idbFullLoadPromise = (async () => {
    await _idbFlushWrites();   // 溜めた書き込みを先に反映（未反映のまま全置換すると取りこぼす）
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const reqValue = req => new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
    const [keys, values] = await Promise.all([
      reqValue(store.getAllKeys()), reqValue(store.getAll()),
    ]);
    const result = {};
    for (let i = 0; i < keys.length; i++) result[keys[i]] = _sanDeep(values[i]);
    _idbCache = result;
    _idbTotalCount = keys.length;
    _rebuildStoredIndexes(result);
    _savedGroupsDirty = true;
    _horseHistCache.clear();
    if (window.kvResetVnextPartnerLiveIndex) window.kvResetVnextPartnerLiveIndex();
    _idbFullReady = true;
    console.log(`[IDB] AI・分析用の全履歴を準備 ${keys.length}件`);
    // 前半3Fが無い古いレース（2014〜2021年の約11,000本）のペースラベルは、先頭の前半区間から
    // 逆算する getFrontPaceLabel でしか付かず、これは馬行がメモリに載っている必要がある。
    // 通常の起動時（レースだけが載っている状態）では付けられないので、全履歴が揃ったこの1回だけ
    // 付け直す（2026-08-04）。値が変わらない行は backfill 側が書き込みを飛ばす。
    if (!window._kvPaceLabelsFullPassDone) {
      window._kvPaceLabelsFullPassDone = true;
      _kvScheduleIdle(() => {
        try {
          // ⛔基準表を捨ててから計算する。getRaceLeadFrontBench() は window._leadFrontBench に
          //   結果を溜め込むが、この無効化はどこにも書かれていなかった（idbPut のキャッシュ破棄
          //   リストにも入っていない）。そのため「レースしか載っていない起動直後」に一度空で
          //   計算されると、その空の表が使われ続け、古いレースのラベルが永久に付かなかった。
          window._leadFrontBench = null;
          window._f3BenchCache = null;
          window._horseF3Bench = null;
          const n = backfillPaceLabels();
          if (n > 0) console.log(`[paceLabels] 全履歴が揃ったので古いレースにも付与: ${n}件`);
          // 馬ごとの自動ペースも同じ理由でここでしか付けられない（基準表に全期間の馬が要る）
          backfillHorsePaceLabels();
        } catch (e) { _kvSwallow('paceLabels:fullPass', e); }
      }, 1200);
    }
    return result;
  })().catch(e => {
    _idbFullLoadPromise = null;
    console.warn('[IDB] 全履歴の準備に失敗:', e);
    throw e;
  });
  return _idbFullLoadPromise;
}

/** 馬名索引から必要な馬だけを読み、全履歴getAll（約15万件）を避ける。 */
async function _readIndexedHorsePairs(names) {
  await _idbFlushWrites();   // 溜めた書き込みを先に反映してから読む（読み書きの整合性）
  const db = await openIDB(), tx = db.transaction(IDB_STORE, 'readonly'), store = tx.objectStore(IDB_STORE);
  if (!store.indexNames.contains(IDB_HORSE_INDEX)) return [];
  const idx = store.index(IDB_HORSE_INDEX);
  const read = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result || []); req.onerror = e => reject(e.target.error); });
  const chunks = await Promise.all([...new Set(names.filter(Boolean))].map(async name => {
    const range = IDBKeyRange.only(name);
    const [keys, values] = await Promise.all([read(idx.getAllKeys(range)), read(idx.getAll(range))]);
    return keys.map((key, i) => [key, values[i]]);
  }));
  return chunks.flat();
}

async function _fetchKochiHorseNames(names) {
  const unique = [...new Set(names.map(x => String(x || '').trim()).filter(Boolean))];
  if (!unique.length) return [];
  const url = new URL(`${SUPABASE_URL}/rest/v1/keiba_horses`);
  url.searchParams.set('select', '*'); url.searchParams.set('baba_code', 'eq.31');
  const quoted = unique.map(n => `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  url.searchParams.set('horse_name', `in.(${quoted})`);
  url.searchParams.set('order', 'race_date.desc'); url.searchParams.set('limit', '3000');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;
  let res;
  try {
    res = await fetch(url, { headers: SUPABASE_HEADERS, ...(controller ? { signal:controller.signal } : {}) });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`馬履歴 HTTP ${res.status}`);
  const rows = await res.json(); return Array.isArray(rows) ? rows : [];
}

/** 現在レースの出走馬だけをIndexedDB→不足時Supabaseの順で準備する。 */
function _ensureRaceHorseHistory(raceNo) {
  const data = allRacesData[raceNo];
  if (!data?.horses?.length || data._raceHistoryReady || _idbFullReady) return Promise.resolve();
  const key = `${data.raceInfo?.raceDate || currentDate}|${raceNo}`;
  if (_raceHorseHistoryPromises.has(key)) return _raceHorseHistoryPromises.get(key);
  const p = (async () => {
    delete data._raceHistoryError;
    const names = data.horses.map(h => h.horseName).filter(Boolean);
    const localPairs = await _readIndexedHorsePairs(names);
    if (localPairs.length) { _mergeIDBCachePairs(localPairs); _horseHistCache.clear(); }
    const date = data.raceInfo?.raceDate || currentDate;
    const sparse = names.filter(n => getHorseHistoryBefore(n, date, raceNo).length < 2);
    if (sparse.length) {
      const rows = await _fetchKochiHorseNames(sparse);
      if (rows.length) await _putHorseRowsBatch(rows, true);
    }
    data._raceHistoryReady = true;
    const fresh = [...data.horses].sort((a,b) => (parseInt(a.chakujun)||999)-(parseInt(b.chakujun)||999) || (parseInt(a.umaBan)||0)-(parseInt(b.umaBan)||0));
    renderHorseRows(raceNo, fresh);
  })().catch(e => {
    _raceHorseHistoryPromises.delete(key);
    data._raceHistoryError = String(e?.name === 'AbortError' ? 'timeout' : (e?.message || e));
    const fresh = [...data.horses].sort((a,b) => (parseInt(a.chakujun)||999)-(parseInt(b.chakujun)||999) || (parseInt(a.umaBan)||0)-(parseInt(b.umaBan)||0));
    renderHorseRows(raceNo, fresh);
    throw e;
  });
  _raceHorseHistoryPromises.set(key, p); return p;
}

function kvRetryRaceHorseHistory(raceNo) {
  const data = allRacesData[raceNo];
  if (!data) return;
  const key = `${data.raceInfo?.raceDate || currentDate}|${raceNo}`;
  _raceHorseHistoryPromises.delete(key);
  delete data._raceHistoryReady;
  delete data._raceHistoryError;
  renderHorseRows(raceNo, data.horses || []);
  _ensureRaceHorseHistory(raceNo).catch(e => console.warn('[race horse history retry]', e));
}

/** IndexedDB を開く（初回のみ） */
function openIDB() {
  return new Promise((resolve, reject) => {
    if (_idb) { resolve(_idb); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      const store = db.objectStoreNames.contains(IDB_STORE)
        ? e.target.transaction.objectStore(IDB_STORE)
        : db.createObjectStore(IDB_STORE); // keyPath なし・外部キー使用
      if (!store.indexNames.contains(IDB_HORSE_INDEX)) store.createIndex(IDB_HORSE_INDEX, 'horseName', { unique:false });
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror   = e => reject(e.target.error);
  });
}

/** IDB からレース一覧＋表示対象日のデータだけを先に読み込む。
 *  全履歴は _ensureFullIDBCache() でAI・分析を使う時にだけ展開する。 */
async function loadIDBCache() {
  if (_idbReady) return;
  try {
    await _idbFlushWrites();
    const db    = await openIDB();
    const tx    = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const result = {};
    const requestValue = req => new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e.target.error);
    });
    const startupDate = _idbStartupDate();
    const ranges = [
      _idbPrefixRange('race_'),
      _idbPrefixRange(`31_${startupDate}_`),
      _idbPrefixRange(`payout_31_${startupDate}_`),
      _idbPrefixRange(`aiPrecalc_v2|31|${String(startupDate).replace(/\D/g,'')}|`),
    ];
    const chunkPromises = ranges.map(async range => {
      const [keys, values] = await Promise.all([
        requestValue(store.getAllKeys(range)), requestValue(store.getAll(range)),
      ]);
      return { keys, values };
    });
    const exactKeys = ['ml_weights_31', 'offset_model_31'];
    const exactPromises = exactKeys.map(k => requestValue(store.get(k)));
    const countPromise = requestValue(store.count());
    const chunks = await Promise.all(chunkPromises);
    chunks.forEach(({ keys, values }) => {
      for (let i = 0; i < keys.length; i++) result[keys[i]] = _sanDeep(values[i]);
    });
    const exactValues = await Promise.all(exactPromises);
    exactKeys.forEach((k, i) => {
      const v = exactValues[i];
      if (v != null && !Array.isArray(v)) result[k] = _sanDeep(v);
    });
    _idbTotalCount = Number(await countPromise) || 0;

    // LocalStorage 旧データを IndexedDB へ移行（初回のみ）
    const lsRaw = localStorage.getItem('keibaviewer_data');
    if (lsRaw) {
      try {
        const lsObj = JSON.parse(lsRaw);
        const txW = db.transaction(IDB_STORE, 'readwrite');
        const stW = txW.objectStore(IDB_STORE);
        let migrateCount = 0;
        for (const [k, v] of Object.entries(lsObj)) {
          if (!result[k]) {
            _sanDeep(v); stW.put(v, k); migrateCount++;
            if (v?.type !== 'horse' || k.startsWith(`31_${startupDate}_`)) result[k] = v;
          }
        }
        await new Promise(r => { txW.oncomplete = r; txW.onerror = r; });
        if (migrateCount > 0) {
          _idbTotalCount += migrateCount;
          console.log(`[IDB] LocalStorageから${migrateCount}件を移行しました`);
          localStorage.removeItem('keibaviewer_data'); // 移行後は削除
        }
      } catch(e) { console.warn('[IDB] LS移行エラー:', e); }
    }

    _idbCache  = result;
    _idbReady  = true;
    _idbLoadedDays.add(`31|${startupDate}`);
    // 開催日索引と、先行読込した当日馬だけの馬名索引を構築する。
    _rebuildStoredIndexes(result);
    _savedGroupsDirty = true;
    console.log(`[IDB] 開催日先行ロード ${Object.keys(result).length}/${_idbTotalCount}件`);
  } catch(e) {
    console.warn('[IDB] 読み込み失敗、フォールバックで空オブジェクトを使用:', e);
    _idbCache = {};
    _idbReady = true;
    _idbFullReady = true;
  }
}

/** キー1件を IDB に書き込む（非同期・ノーウェイト） */
/**
 * XSS対策：外部由来データの文字列から < > を除去する（深い走査・in-place）。
 * 馬名・騎手名・レース名等に山括弧が正規に含まれることはないため、
 * タグ注入だけを潰して他は素通しする。描画側の innerHTML は152箇所あり
 * 全てをエスケープするのは非現実的なので、データの入口
 * （idbPut・_idbBulkPut・起動時ロード・ライブ取得・コメント取得・公式履歴）で必ず通す。
 */
function _sanDeep(v) {
  if (typeof v === 'string') return (v.indexOf('<') < 0 && v.indexOf('>') < 0) ? v : v.replace(/[<>]/g, '');
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = _sanDeep(v[i]); return v; }
  for (const k in v) v[k] = _sanDeep(v[k]);
  return v;
}

function idbPut(key, val) {
  val = _sanDeep(val);
  if (!_idbCache) _idbCache = {};
  const old = _idbCache[key];
  if (old) _unindexStoredEntry(key, old);
  _idbCache[key] = val; // メモリキャッシュを即時更新
  _indexStoredEntry(key, val);
  if (val && (val.type === 'horse' || val.type === 'race')) window._kvHistoryRevision = Number(window._kvHistoryRevision || 0) + 1;
  if (val && (val.type === 'official' || String(key).startsWith('official_'))) {
    window._kvOfficialHistoryRevision = Number(window._kvOfficialHistoryRevision || 0) + 1;
  }
  _savedGroupsDirty = true;
  if (val && (val.type === 'horse' || val.type === 'race') && window.kvResetVnextPartnerLiveIndex) {
    window.kvResetVnextPartnerLiveIndex();
  }
  // 馬場差キャッシュを無効化（デバウンス：連続書き込み時は1回だけ実行）
  if (!_cacheInvalidateTimer) {
    _cacheInvalidateTimer = setTimeout(() => {
      _cacheInvalidateTimer = null;
      _horseHistCache.clear();
      if (renderAbilityTable._dayBiasCache) renderAbilityTable._dayBiasCache = {};
      window._dayBiasCache = {};
      window._dayBiasRowsCache = {};
      window._dayBiasMetaCache = {};
      window._dayCondBiasCache = {};
      window._dayBiasDistCache = {};
      window._dayTrackCondCache = {};
      window._raceAvgF3Cache = {};
      window._raceAvgAgariCache = {};
      window._dayRaceDataCache = {};
      window._winnerTimeCache = {};
      window._comboStatsCache = null;
      window._comboStatsAllCache = null;
      window._horseBiasCache = {};
      window._f3BenchCache = null;
      window._evMapsCache = null;
      window._asOfComboCache = null;
      window._asOfAgariCache = null;
      window._asOfF3BenchCache = null;
    }, 150);
  }
  _idbEnqueueWrite(key, val);
}

/** キー1件を IDB から削除する（非同期・ノーウェイト） */
function idbDelete(key) {
  let _old = null;
  if (_idbCache) {
    _old = _idbCache[key];
    if (_old) _unindexStoredEntry(key, _old);
    delete _idbCache[key];
  }
  if (_old && (_old.type === 'horse' || _old.type === 'race')) window._kvHistoryRevision = Number(window._kvHistoryRevision || 0) + 1;
  if (_old && (_old.type === 'official' || String(key).startsWith('official_'))) {
    window._kvOfficialHistoryRevision = Number(window._kvOfficialHistoryRevision || 0) + 1;
  }
  _savedGroupsDirty = true;
  if (_old && (_old.type === 'horse' || _old.type === 'race') && window.kvResetVnextPartnerLiveIndex) {
    window.kvResetVnextPartnerLiveIndex();
  }
  window._comboStatsCache = null;
  window._comboStatsAllCache = null;
  window._evMapsCache = null;
  window._asOfComboCache = null;
  window._asOfAgariCache = null;
  window._asOfF3BenchCache = null;
  _idbEnqueueWrite(key, null);
}

// ── IDB書き込みのまとめ（2026-08-04 導入）────────────────────────────────
// idbPut / idbDelete は1件ごとに readwrite トランザクションを作っていた。ペースラベル補完
// (backfillPaceLabels 約4,200件 + backfillPaceType 約3,300件) のような連続書き込みでは
// 7,500件のトランザクションが並び、後から作られた readonly がその全部の後ろに詰まる。
// そのせいで「AI・分析用の全履歴」を読むだけで **82秒** 待たされていた（2026-08-04 実測）。
// メモリキャッシュ(_idbCache)は idbPut の先頭で同期更新済みなので、IDBへの反映だけを
// 短時間まとめて1トランザクションで流す。読む前には必ず _idbFlushWrites() で吐き出す。
const _IDB_WRITE_BATCH_MAX = 500;      // 1トランザクションに詰める上限
let _idbWriteQueue = [];               // [key, val] （val===null は削除）。順序を保つ
let _idbWriteScheduled = false;
let _idbWriteInFlight = Promise.resolve();

function _idbEnqueueWrite(key, val) {
  _idbWriteQueue.push([key, val]);
  if (_idbWriteQueue.length >= _IDB_WRITE_BATCH_MAX) { _idbFlushWrites(); return; }
  // ⛔setTimeout ではなく queueMicrotask。まとめたいのは「ひと続きの同期処理の中の書き込み」
  //   だけで、次のタスクまで持ち越すとページ離脱で取りこぼす（2026-08-04 に実測で500件失った）。
  //   同期ループが終わった直後に流れるので、1件ずつ書いていた頃と同じ速さでIDBへ向かう。
  if (!_idbWriteScheduled) {
    _idbWriteScheduled = true;
    queueMicrotask(() => { _idbWriteScheduled = false; _idbFlushWrites(); });
  }
}

/** 溜まっている書き込みを1トランザクションで流す。IDBを読む前に必ず待つこと。 */
function _idbFlushWrites() {
  if (!_idbWriteQueue.length) return _idbWriteInFlight;
  const batch = _idbWriteQueue;
  _idbWriteQueue = [];
  const prev = _idbWriteInFlight;
  _idbWriteInFlight = prev.catch(() => {}).then(() => openIDB()).then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    for (const [key, val] of batch) {
      if (val === null) store.delete(key); else store.put(val, key);
    }
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error || new Error('IDB一括書き込み失敗'));
  })).catch(e => _kvSwallow('_idbFlushWrites', e));
  return _idbWriteInFlight;
}
window._idbFlushWrites = _idbFlushWrites;
// タブを離れる時に取りこぼさない（1件ずつ書いていた頃と同じ耐性を保つ）
window.addEventListener('pagehide', () => { try { _idbFlushWrites(); } catch (e) { _kvSwallow('pagehide:flush', e); } });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { try { _idbFlushWrites(); } catch (e) { _kvSwallow('visibilitychange:flush', e); } }
});

/** 旧API互換：同期的に見えるが内部はメモリキャッシュを参照 */
function lsWrite(key, val) { idbPut(key, val); }
function lsRead()          { return _idbCache || {}; }

// ============================================================
// バックアップ：全データのエクスポート／インポート
// （Supabase事故・IDB消失時の復元手段。ローカル完結でサーバーには送信しない）
// ============================================================
function exportAllData() {
  const data = lsRead();
  const keys = Object.keys(data);
  if (!keys.length) { alert('保存データがまだ読み込まれていません'); return; }
  // Phase2背景読み込み中は過去データが揃っていない＝不完全なバックアップになる
  if (_bgLoadActive) {
    const cont = confirm('過去データの背景読み込みがまだ完了していません。\nこのままエクスポートすると直近データのみの不完全なバックアップになります。\n\n続行しますか？（キャンセル推奨：読込完了後に再実行）');
    if (!cont) return;
  }
  const payload = {
    app: 'keiba-viewer',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: keys.length,
    entries: data,
  };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `keiba-viewer-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  const el = document.getElementById('backup-status');
  if (el) el.textContent = `${keys.length}件（${(json.length/1024/1024).toFixed(1)}MB）をダウンロードしました`;
}

async function importBackupFile(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ''; // 同じファイルを再選択できるようにリセット
  if (!file) return;
  const statusEl = document.getElementById('backup-status');
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch(e) { alert('JSONの解析に失敗しました: ' + e.message); return; }
  if (!payload || payload.app !== 'keiba-viewer' || !payload.entries || typeof payload.entries !== 'object') {
    alert('このファイルは高知競馬ビューアのバックアップ形式ではありません');
    return;
  }
  const entries = payload.entries;
  const cache = lsRead();
  const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
  let added = 0, updated = 0, skipped = 0;
  const toWrite = {};
  for (const k of Object.keys(entries)) {
    if (UNSAFE.has(k)) continue;
    const v = entries[k];
    if (v === null || typeof v !== 'object') continue;
    const ex = cache[k];
    if (!ex) { toWrite[k] = v; added++; }
    else if (JSON.stringify(ex) === JSON.stringify(v)) { skipped++; }
    else { toWrite[k] = v; updated++; }
  }
  if (!added && !updated) {
    alert(`取り込む差分がありません（${skipped}件すべて既存データと同一です）`);
    return;
  }
  const ok = confirm(
    `バックアップから復元します：\n・新規 ${added}件\n・上書き ${updated}件\n・変化なし ${skipped}件（スキップ）\n\n※このブラウザの保存領域のみに書き込みます（Supabaseには送信されません）`
  );
  if (!ok) return;
  if (statusEl) statusEl.textContent = '取り込み中...';
  try {
    await _idbBulkPut(toWrite);
    if (statusEl) statusEl.textContent = `復元完了：新規${added}件・上書き${updated}件`;
    renderSavedList();
  } catch(e) {
    alert('復元中にエラーが発生しました: ' + e.message);
    if (statusEl) statusEl.textContent = '';
  }
}

/** 複数キーを1トランザクションでIDBへ書き込み、各種キャッシュを一括更新
 *  （idbPutはキー毎にトランザクションを張るため、数千件規模の復元はこちらを使う） */
async function _idbBulkPut(obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  for (const k of keys) _sanDeep(obj[k]);
  const db = await openIDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    for (const k of keys) store.put(obj[k], k);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error || new Error('IDB書き込み失敗'));
  });
  if (!_idbCache) _idbCache = {};
  for (const k of keys) {
    if (_idbCache[k]) _unindexStoredEntry(k, _idbCache[k]);
    _idbCache[k] = obj[k];
    _indexStoredEntry(k, obj[k]);
  }
  if (keys.some(k => obj[k]?.type === 'horse' || obj[k]?.type === 'race')) {
    window._kvHistoryRevision = Number(window._kvHistoryRevision || 0) + 1;
  }
  if (keys.some(k => obj[k]?.type === 'official' || String(k).startsWith('official_'))) {
    window._kvOfficialHistoryRevision = Number(window._kvOfficialHistoryRevision || 0) + 1;
  }
  _savedGroupsDirty = true;
  _horseHistCache.clear();
  if (typeof renderAbilityTable === 'function' && renderAbilityTable._dayBiasCache) renderAbilityTable._dayBiasCache = {};
  window._dayBiasCache = {};
  window._dayBiasRowsCache = {};
  window._dayBiasMetaCache = {};
  window._dayCondBiasCache = {};
  window._dayBiasDistCache = {};
  window._dayTrackCondCache = {};
  window._raceAvgF3Cache = {};
  window._raceAvgAgariCache = {};
  window._dayRaceDataCache = {};
  window._winnerTimeCache = {};
  window._comboStatsCache = null;
  window._comboStatsAllCache = null;
  window._horseBiasCache = {};
  window._f3BenchCache = null;
  window._evMapsCache = null;
  window._asOfComboCache = null;
  window._asOfAgariCache = null;
  window._asOfF3BenchCache = null;
}

// ============================================================
// 起動時：API → IndexedDB へ全データをページング同期
// ============================================================
const _IDB_PAGE = 1000;          // 1ページあたり取得件数
let _bgLoadActive = false;       // 背景読み込み中フラグ
const _KV_FULL_SYNC_META_KEY = 'kv_full_sync_meta_v1';
const _KV_FULL_SYNC_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 日常更新はupdated_at差分、全走査は月1回だけ

/** Supabase の1ページ分を取得（高知のみ・日付降順）。
 *  深いoffsetの並列取得はサーバー側で一時的な500を返すことがある（2026-07-15実測: 全157ページ中
 *  offset=22000/24000で500→旧実装はこれを「データ終端」と誤認し2024年以前の全馬データを取り漏らしていた）。
 *  一時エラーはバックオフ付きでリトライする。全リトライ失敗時のみnull（＝呼び出し元で「失敗」として扱う）。 */
async function _fetchKochiPage(table, offset, limit = _IDB_PAGE, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&baba_code=eq.31&order=race_date.desc&limit=${limit}&offset=${offset}`,
        { headers: SUPABASE_HEADERS }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) return rows;
      }
    } catch(e) { _kvSwallow('_fetchKochiPage', e); }
    if (attempt >= retries) return null;
    await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));   // 0.6s → 1.2s → 2.4s
  }
}

/** 直接リンクの日付を最優先で取得する小さいクエリ。新着1000件の走査完了を待たない。 */
async function _fetchKochiDay(table, date, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
      url.searchParams.set('select', '*'); url.searchParams.set('baba_code', 'eq.31');
      url.searchParams.set('race_date', `eq.${date}`); url.searchParams.set('order', 'race_no.asc'); url.searchParams.set('limit', '500');
      const res = await fetch(url, { headers: SUPABASE_HEADERS });
      if (res.ok) { const rows = await res.json(); if (Array.isArray(rows)) return rows; }
    } catch(e) { _kvSwallow('_fetchKochiDay', e); }
    if (attempt >= retries) return null;
    await new Promise(r => setTimeout(r, 350 * Math.pow(2, attempt)));
  }
}

/**
 * 既存キャッシュ値と新しい値の中身が同じかを判定（savedAtは除く）。
 * 同じなら idbPut（＝IndexedDB書き込みトランザクション）自体を省略し、
 * 変化していない大多数の行を毎回再取得・再書き込みする無駄を避ける。
 */
function _rowUnchanged(existing, fresh) {
  if (!existing) return false;
  for (const k in fresh) {
    if (k === 'savedAt') continue;
    if (k === 'lapTimes') { if (JSON.stringify(existing.lapTimes) !== JSON.stringify(fresh.lapTimes)) return false; continue; }
    if (existing[k] !== fresh[k]) return false;
  }
  return true;
}

/** レース行を IDB キャッシュへ書き込む */
function _putRaceRow(row) {
  const key = `race_${row.baba_code}_${row.race_date}_${row.race_no}`;
  let lapTimesArr = null;
  try { if (row.lap_times) lapTimesArr = JSON.parse(row.lap_times); } catch(e) { _kvSwallow('_putRaceRow', e); }
  // ⛔サーバーにラップが無いレースだけ、同梱のユーザー手計測ラップで埋める(2026-07-28)。
  //   DBに1つでも値があるレースには触らない=手入力を潰さない。
  if (!lapTimesArr || !lapTimesArr.some(v => v != null)) {
    lapTimesArr = userLapsFor(row.race_date, row.race_no) || lapTimesArr;
  }
  const _existing = _idbCache && _idbCache[key];
  const _serverHasFirst3f = String(row.first3f || '').trim() !== '';
  const _first3f = _serverHasFirst3f ? row.first3f : (_existing?.first3f || '');
  const _first3fSource = _serverHasFirst3f ? (row.first3f_source || '') : (_existing?.first3fSource || _existing?.first3f_source || '');
  // ⛔ローカルで計算した値をサーバー行で消さない（2026-08-04）。
  //   paceTypeAuto / paceDevAuto は keiba_races に列が存在しない純ローカル値。ここで引き継がないと
  //   Phase1の直近1,000件取り直しと差分同期のたびに消え、backfillPaceLabels は Phase2 完走時
  //   （＝30日に1回）しか走らないため復活しなかった。実測: 4,281レース → 再読込後 3,509レース。
  //   paceType は「サーバーに値があればサーバー優先／空ならローカルを残す」= first3f と同じ方針。
  const _paceType = String(row.pace_type || '').trim() !== '' ? row.pace_type : (_existing?.paceType || _existing?.pace_type || '');
  const _newVal = {
    type:'race', race_date:row.race_date, race_no:row.race_no, baba_code:row.baba_code,
    race_name:row.race_name||'', distance:row.distance||'', race_class:row.race_class||'',
    track_cond:row.track_cond||'', first3f:_first3f, first3fSource:_first3fSource, agari4f:row.agari4f||'',
    agari3f_race:row.agari3f_race||'', paceType:_paceType, memo:row.memo||'',
    lap_times:row.lap_times||'', lapTimes:lapTimesArr,
    _apiSaved:true,
    savedAt:new Date(row.updated_at||row.created_at||Date.now()).toISOString()
  };
  // 自動ペースラベルは完全にローカル専用（手入力の paceType とは別フィールド）。値がある時だけ引き継ぐ。
  if (_existing?.paceTypeAuto != null) _newVal.paceTypeAuto = _existing.paceTypeAuto;
  if (_existing?.paceDevAuto  != null) _newVal.paceDevAuto  = _existing.paceDevAuto;
  if (_rowUnchanged(_existing, _newVal)) return;
  idbPut(key, _newVal);
}

function _horseRowKV(row) {
  const key = `${row.baba_code}_${row.race_date}_${row.race_no}_${row.uma_ban}`;
  const _existing = _idbCache && _idbCache[key];
  const _newVal = {
    type:'horse', race_date:row.race_date, race_no:row.race_no, baba_code:row.baba_code,
    chakujun:row.chakujun||'', wakuBan:row.waku_ban||'', horseName:row.horse_name||'',
    belong:row.belong||'', sexAge:row.sex_age||'', kinryo:row.kinryo||'',
    jockey:row.jockey||'', trainer:row.trainer||'', weight:row.weight||'',
    ninki:row.ninki||'', odds:row.odds||'', time:row.time||'', diff:row.diff||'',
    agari3f:row.agari3f||'', corner:row.corner||'', first3f:row.first3f||'',
    paceType:row.pace_type||'', mukaeShoumen:row.mukae_shoumen||'',
    shoumenStraight:row.shoumen_straight||'', postComment:row.post_comment||'',
    lineageLoginCode:row.lineage_login_code||'',
    savedAt:new Date(row.updated_at||row.created_at||Date.now()).toISOString()
  };
  // ⛔レース側と同じ理由でローカル計算値を引き継ぐ（2026-08-04）。keiba_horses に
  //   paceTypeAuto / paceDevAuto の列は無いので、ここで拾わないと同期のたびに黙って消える。
  if (_existing?.paceTypeAuto != null) _newVal.paceTypeAuto = _existing.paceTypeAuto;
  if (_existing?.paceDevAuto  != null) _newVal.paceDevAuto  = _existing.paceDevAuto;
  return [key, _newVal];
}

/** 馬行を IDB キャッシュへ書き込む */
function _putHorseRow(row) {
  const [key, _newVal] = _horseRowKV(row);
  const _existing = _idbCache && _idbCache[key];
  if (_rowUnchanged(_existing, _newVal)) return;
  idbPut(key, _newVal);
}

/** Supabaseの馬1ページを1トランザクションで保存。hydrate=falseなら未表示の過去馬をメモリへ載せない。 */
async function _putHorseRowsBatch(rows, hydrate) {
  if (!Array.isArray(rows) || !rows.length) return;
  await _idbFlushWrites();   // 個別書き込みとの順序を保つ
  const pairs = rows.map(_horseRowKV);
  pairs.forEach(([, v]) => _sanDeep(v));
  const db = await openIDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    pairs.forEach(([key, val]) => store.put(val, key));
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error || new Error('馬データ一括保存失敗'));
  });
  window._kvHistoryRevision = Number(window._kvHistoryRevision || 0) + 1;
  const warmPairs = pairs.filter(([key]) => hydrate || _idbFullReady || Object.prototype.hasOwnProperty.call(_idbCache || {}, key));
  if (warmPairs.length) _mergeIDBCachePairs(warmPairs);
  _idbTotalCount = Math.max(_idbTotalCount, Object.keys(_idbCache || {}).length);
  _horseHistCache.clear();
}

/** Phase2用: idカーソル方式で1ページ取得（keyset pagination・リトライ付き）。
 *  offset方式は深いページほどPostgres側の走査が重く、データが15万行に育った現在は
 *  サーバーが500を多発する（2026-07-15実測: 全ページ再取得中に500×156回）。idはPK（索引済み）
 *  なのでカーソル方式なら深さに関係なく1ページ0.2秒前後・サーバー負荷も一定で軽い。 */
async function _fetchKochiPageAfter(table, afterId, limit = _IDB_PAGE, retries = 3) {
  const cursor = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&baba_code=eq.31&order=id.asc&limit=${limit}${cursor}`,
        { headers: SUPABASE_HEADERS }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) return rows;
      }
    } catch(e) { _kvSwallow('_fetchKochiPageAfter', e); }
    if (attempt >= retries) return null;
    await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));   // 0.6s → 1.2s → 2.4s
  }
}

/** テーブル全体をidカーソルで順次取得（背景用）。
 *  【2026-07-15修正】旧実装（offsetページング×4並列）は
 *   (1) 取得失敗(null)を「データ終端」と同一視して静かに完了扱い→途中の500エラー1発で
 *       古いデータが丸ごと欠落（馬場差ー等の症状の根本原因）、
 *   (2) 同一バッチ内の失敗ページ以降が保存され中抜け（歯抜け）も発生、
 *   (3) 深いoffsetのクエリ自体がサーバー500の温床、という三重の問題があった。
 *  現実装はidカーソルの直列取得で(3)を根絶し、失敗は「終端」と区別して
 *  {incomplete:true, nextCursor} を返す（呼び出し元が失敗地点から再開できる）。 */
async function _fetchTablePaged(table, afterId, onRows, onProgress) {
  let cursor = afterId || null, total = 0;
  while (true) {
    const rows = await _fetchKochiPageAfter(table, cursor);
    if (!rows) {
      console.warn(`[fetchPaged] ${table} cursor=${cursor || '(先頭)'} の取得に失敗（リトライ超過）。ここで打ち切り＝以降のデータは未取得`);
      return { total, incomplete: true, nextCursor: cursor };
    }
    if (!rows.length) break;                       // 真のデータ終端
    await onRows(rows); total += rows.length;
    cursor = rows[rows.length - 1].id;
    if (onProgress) onProgress(total);
    if (rows.length < _IDB_PAGE) break;            // 真のデータ終端（端数ページ）
    // 1000行の変換・IndexedDB投入後にメインスレッドを一度返し、操作の引っ掛かりを抑える
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { total, incomplete: false, nextCursor: null };
}

/** updated_at + id の複合カーソルで変更行だけを同期する。 */
async function _fetchTableUpdatedAfter(table, sinceIso, onRows) {
  let updated = sinceIso, id = '', total = 0, newest = sinceIso;
  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set('select','*'); url.searchParams.set('baba_code','eq.31');
    url.searchParams.set('order','updated_at.asc,id.asc'); url.searchParams.set('limit',String(_IDB_PAGE));
    if (id) url.searchParams.set('or', `(updated_at.gt.${updated},and(updated_at.eq.${updated},id.gt.${id}))`);
    else url.searchParams.set('updated_at', `gt.${updated}`);
    const res = await fetch(url.toString(), { headers:SUPABASE_HEADERS });
    if (!res.ok) throw new Error(`${table} 差分同期 HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    await onRows(rows); total += rows.length;
    const last = rows[rows.length - 1]; updated = String(last.updated_at || updated); id = String(last.id || '');
    if (Date.parse(updated) > Date.parse(newest)) newest = updated;
    if (rows.length < _IDB_PAGE) break;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { total, newest };
}

/** 他端末で削除された行をローカルにも反映する。月次全走査だけでは削除を検知できない。 */
async function _fetchDeletionTombstones(sinceIso) {
  let deleted = sinceIso, seq = 0, total = 0, newest = sinceIso;
  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/keiba_delete_tombstones`);
    url.searchParams.set('select','seq,entity,record_id,deleted_at');
    url.searchParams.set('baba_code','eq.31');
    url.searchParams.set('order','deleted_at.asc,seq.asc');
    url.searchParams.set('limit',String(_IDB_PAGE));
    if (seq) url.searchParams.set('or', `(deleted_at.gt.${deleted},and(deleted_at.eq.${deleted},seq.gt.${seq}))`);
    else url.searchParams.set('deleted_at', `gt.${deleted}`);
    const res = await fetch(url.toString(), { headers:SUPABASE_HEADERS });
    if (!res.ok) throw new Error(`削除差分同期 HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      const key = row.entity === 'race' ? `race_${row.record_id}` : String(row.record_id || '');
      if (key) idbDelete(key);
    }
    total += rows.length;
    const last = rows[rows.length - 1]; deleted = String(last.deleted_at || deleted); seq = Number(last.seq || 0);
    if (Date.parse(deleted) > Date.parse(newest)) newest = deleted;
    if (rows.length < _IDB_PAGE) break;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { total, newest };
}

async function _runIncrementalSync(meta) {
  const since = meta?.serverUpdatedAt || (meta?.at ? new Date(meta.at).toISOString() : null);
  if (!since) return meta;
  const [races,horses,deletions] = await Promise.all([
    _fetchTableUpdatedAfter('keiba_races', since, rows => rows.forEach(_putRaceRow)),
    _fetchTableUpdatedAfter('keiba_horses', since, rows => _putHorseRowsBatch(rows, false)),
    _fetchDeletionTombstones(since),
  ]);
  const newest = [since,races.newest,horses.newest,deletions.newest].sort((a,b) => Date.parse(b) - Date.parse(a))[0];
  const next = { ...meta, lastIncrementalAt:Date.now(), serverUpdatedAt:newest,
    lastIncrementalRows:{ races:races.total, horses:horses.total, deletions:deletions.total } };
  localStorage.setItem(_KV_FULL_SYNC_META_KEY, JSON.stringify(next));
  if (races.total || horses.total || deletions.total) { loadSavedData(); _refreshSavedDebounced(); }
  return next;
}

/** 日別設定（メモ・内外バイアス）を取得 */
async function _loadDaySettings() {
  try {
    // PostgRESTは既定で1000行キャップがあり無指定だと将来無症状に欠落しうるため、limitを明示（現状は数百行程度・大きめの安全マージン）
    const dsRes = await fetch(`${SUPABASE_URL}/rest/v1/keiba_day_settings?select=*&limit=5000`, { headers: SUPABASE_HEADERS });
    if (dsRes.ok) {
      const dsRows = await dsRes.json();
      if (Array.isArray(dsRows)) {
        dsRows.forEach(row => {
          idbPut(`daySettings_${row.baba_code}_${row.race_date}`, {
            type: 'daySettings', memo: row.memo || '', innerOuterBias: row.inner_outer_bias || '',
          });
        });
        console.log(`[initDB] 日別設定 ${dsRows.length}件取得`);
      }
    }
  } catch(e) { console.warn('[initDB] keiba_day_settings 取得失敗:', e); }
}

/** 背景読み込み状態をUIに表示（保存データバッジ横） */
function _setBgLoadIndicator(active) {
  _bgLoadActive = active;
  const badge = document.getElementById('saved-total-badge');
  if (!badge) return;
  let hint = document.getElementById('saved-bg-hint');
  if (active) {
    if (!hint) {
      hint = document.createElement('span');
      hint.id = 'saved-bg-hint';
      hint.style.cssText = 'margin-left:8px;font-size:11px;color:#7c3aed;font-weight:600';
      badge.insertAdjacentElement('afterend', hint);
    }
    hint.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 過去データ読込中…';
  } else if (hint) {
    hint.remove();
  }
}

// 保存リスト再描画のデバウンス（背景読み込み中の頻繁な再描画を抑制）
let _savedRefreshTimer = null;
function _refreshSavedDebounced() {
  if (_savedRefreshTimer) return;
  _savedRefreshTimer = setTimeout(() => {
    _savedRefreshTimer = null;
    try { loadSavedData(); } catch(e) { _kvSwallow('_refreshSavedDebounced', e); }
  }, 800);
}

async function initDB() {
  // まず IndexedDB キャッシュをロード（LocalStorage 移行も含む）
  await loadIDBCache();
  const _cacheSizeAtStart = _idbTotalCount || Object.keys(_idbCache || {}).length;

  // ── 高知以外（babaCode≠'31'）のキャッシュを削除 ──
  if (_idbCache) {
    const _nonKochiKeys = Object.keys(_idbCache).filter(k => {
      if (k.startsWith('race_')) {
        const p = k.split('_'); return p[1] !== '31';
      }
      if (k.startsWith('offi_') || k.startsWith('daySettings_') || k.startsWith('horseNote_') || k.startsWith('official_')) return false;
      const p = k.split('_');
      return p.length >= 4 && p[0] !== '31' && /^\d{8}$/.test(p[1]);
    });
    for (const k of _nonKochiKeys) {
      idbDelete(k);
    }
    if (_nonKochiKeys.length > 0) console.log(`[initDB] 非高知データ ${_nonKochiKeys.length}件を削除`);
  }

  // スマホ表示プレビュー（?sim=1のiframe内）：親ウィンドウが同期済みのローカルIDBを
  // そのまま使い、サーバー同期（Phase1/2）を二重に走らせない
  if (KV_IS_SIM) {
    loadSavedData();
    if (typeof initAnalysisDateSelect === 'function') initAnalysisDateSelect();
    setTimeout(() => { try { _simRestoreState(); } catch (e) { _kvSwallow('initDB', e); } }, 0);
    _kvScheduleIdle(() => loadWeeklySchedule(), 2500);
    return;
  }

  // ── ローカルキャッシュを通信より先に表示 ──
  // Phase1の通信を待たず、保存済み出馬表があれば即座に操作可能にする。
  // 通信結果は後から同じ索引へマージし、表示データの鮮度だけを更新する。
  let _openedCachedDeepLink = false;
  try {
    loadSavedData();
    if (window._kvDeepLink) {
      _openedCachedDeepLink = await _kvTryDeepLink();
    } else {
      const _today = _kvTodayYmd();
      const _todayIndex = _raceDayIndex?.get(`31|${_today}`);
      const _hasCachedToday = !!(_todayIndex && [..._todayIndex.values()].some(entry => entry.raceVal));
      if (_hasCachedToday) await kvTodayMode();
    }
  } catch (e) {
    console.warn('[initDB] ローカル先行表示に失敗:', e);
  }

  // キャッシュにない直接リンク／本日の開催日は、全体の新着ページより小さい日付指定クエリを先行。
  const _priorityDate = window._kvDeepLink?.date || _kvTodayYmd();
  if (!_openedCachedDeepLink) {
    _kvSetRouteState('data', '出馬表データを取得中', `${_priorityDate} の開催データを優先して読み込んでいます`);
    try {
      const [dayRaces, dayHorses] = await Promise.all([
        _fetchKochiDay('keiba_races', _priorityDate),
        _fetchKochiDay('keiba_horses', _priorityDate),
      ]);
      if (dayRaces) dayRaces.forEach(_putRaceRow);
      if (dayHorses) await _putHorseRowsBatch(dayHorses, true);
      loadSavedData();
      const opened = window._kvDeepLink ? await _kvTryDeepLink() : (dayRaces?.length ? await kvTodayMode().then(() => true) : false);
      if (opened || dayRaces?.length) _kvSetRouteState(null);
      else if (window._kvDeepLink) _kvSetRouteState('error', '出馬表の取得に失敗しました', '通信状態を確認して再試行してください');
    } catch(e) {
      console.warn('[initDB] 対象日先行取得失敗:', e);
      if (window._kvDeepLink) _kvSetRouteState('error', '出馬表の取得に失敗しました', '通信状態を確認して再試行してください');
    }
  }

  // ── 段階的読み込み ──────────────────────────────────────
  // Phase 1: 直近データ（レース/馬の先頭1ページ＋日別設定）を取得して即描画。
  // Phase 2: 残りの古いデータを背景で並列取得し、揃い次第リストを更新。
  // 古い（数年前の）データは即時に必要ないため後回しにして初期表示を高速化する。
  let p1RaceDone = false, p1HorseDone = false;
  try {
    const [race0, horse0] = await Promise.all([
      _fetchKochiPage('keiba_races', 0),
      _fetchKochiPage('keiba_horses', 0),
      _loadDaySettings(),
    ]);
    if (race0)  { race0.forEach(_putRaceRow); if (race0.length < _IDB_PAGE) p1RaceDone = true; }
    if (horse0) { await _putHorseRowsBatch(horse0, true); if (horse0.length < _IDB_PAGE) p1HorseDone = true; }
    console.log(`[initDB] Phase1 直近取得 レース:${race0?.length||0}件 馬:${horse0?.length||0}件`);
  } catch(e) {
    console.warn('[initDB] Phase1 同期失敗（オフライン？）:', e);
  }

  // ── Phase 1 完了 → 即描画（アプリが操作可能に） ──
  loadSavedData();
  if(typeof initAnalysisDateSelect==='function') initAnalysisDateSelect();
  // ディープリンクがあればそちらを優先（本日モードより先。データ未到着ならPhase2後に再試行）
  setTimeout(async () => {
    try {
      if (window._kvDeepLink) { await _kvTryDeepLink(); }
      else if (!_openedCachedDeepLink) { await kvTodayMode(); }
    } catch (e) { console.warn('[kvTodayMode/deepLink]', e); }
  }, 0);

  // 補完は全履歴同期の要否と切り離す。従来はfresh判定や別タブの同期ロックで処理ごと飛ばされていた。
  _kvScheduleIdle(() => {
    try { backfillFirst3fFrom1400m(); } catch(e) { console.warn('[backfillF3 phase1]', e); }
    // 馬ごとの自動ペースは Phase1 で取り直した直近1,000件から消えるので、ここで付け直す
    // （2026-08-04 実測: 再読込のたび 17,620頭 → 16,937頭 に欠けていた）。
    // 保存済みの基準表を使うので全履歴の展開は要らない。
    try { backfillHorsePaceLabels(); } catch(e) { _kvSwallow('horsePace:phase1', e); }
  }, 600);

  // 全履歴同期は約90MBになるため、完全同期済みキャッシュが新しければ省略する。
  // 直近1000件は上のPhase1で毎回更新するので、当日データの鮮度は落とさない。
  let _fullSyncMeta = null;
  try { _fullSyncMeta = JSON.parse(localStorage.getItem(_KV_FULL_SYNC_META_KEY) || 'null'); } catch(e) { _kvSwallow('initDB#2', e); }
  const _fullSyncFresh = !!(
    _fullSyncMeta?.at && _fullSyncMeta?.cacheSize > 0 &&
    Date.now() - _fullSyncMeta.at < _KV_FULL_SYNC_MAX_AGE &&
    _cacheSizeAtStart >= _fullSyncMeta.cacheSize * 0.9
  );
  if (_fullSyncFresh) {
    console.log(`[initDB] Phase2 省略（全履歴同期から${Math.round((Date.now() - _fullSyncMeta.at) / 60000)}分）`);
    _kvScheduleIdle(async () => {
      try {
        await Promise.all([loadWeeklySchedule(), _runIncrementalSync(_fullSyncMeta)]);
        backfillFirst3fFrom1400m();
        // 自動ペースラベルはここでも付ける（2026-08-04）。Phase1と差分同期で取り直した
        // 新しいレースには付いていないが、従来は Phase2 完走時（＝30日に1回）しか
        // 走らなかったため、それまでラベルが欠けたままだった。値が変わらない行は
        // backfill 側が書き込みを飛ばすので、毎回走らせても実質ただの走査で済む。
        backfillPaceLabels(); backfillPaceType();
      }
      catch(e) { console.warn('[initDB] 差分同期失敗:', e); }
    }, 2500);
    return;
  }

  // ── Phase 2: 残りを最初の描画後に取得（UIと当日レース取得を優先） ──
  _kvScheduleIdle(async () => {
    // 先に軽い週間予定を表示し、その後で大きい全履歴同期へ進む
    try { await loadWeeklySchedule(); } catch(e) { console.warn('[weekly schedule]', e); }
    const _runOwnedFullSync = async () => {
    _setBgLoadIndicator(true);
    try {
      // 途中失敗(incomplete)時は失敗地点(nextCursor)から1回だけ自動再開する
      // （最初から再取得は約90MBの再ダウンロードになるため、失敗地点からの再開に限定）
      const _pagedWithResume = async (table, onRows, onProgress) => {
        let r = await _fetchTablePaged(table, null, onRows, onProgress);
        if (r.incomplete) {
          console.warn(`[initDB] ${table} が cursor=${r.nextCursor || '(先頭)'} で不完全。10秒後に失敗地点から再開します`);
          await new Promise(res => setTimeout(res, 10000));
          const r2 = await _fetchTablePaged(table, r.nextCursor, onRows, onProgress);
          r = { total: r.total + r2.total, incomplete: r2.incomplete, nextCursor: r2.nextCursor };
        }
        return r;
      };
      let _anyIncomplete = false, _raceRows = 0, _horseRows = 0;
      if (!p1RaceDone) {
        const rr = await _pagedWithResume('keiba_races', rows => rows.forEach(_putRaceRow));
        _raceRows = rr.total;
        if (rr.incomplete) _anyIncomplete = true;
      }
      if (!p1HorseDone) {
        const hr = await _pagedWithResume('keiba_horses',
          rows => _putHorseRowsBatch(rows, false),
          () => _refreshSavedDebounced());
        _horseRows = hr.total;
        if (hr.incomplete) _anyIncomplete = true;
      }
      if (_anyIncomplete) {
        // 「常に完了と報告する」旧動作が症状（過去データの無症状欠落）の温床だったため、不完全は明示する
        console.warn('[initDB] Phase2 背景読み込みが不完全なまま終了（一部の過去データ未取得）。ページ再読み込みで再試行されます');
        const _st = document.getElementById('save-status');
        if (_st) _st.textContent = '⚠️ 過去データの取得が一部失敗しました。ページを再読み込みすると再試行します';
      } else {
        console.log('[initDB] Phase2 背景読み込み完了');
        try {
          localStorage.setItem(_KV_FULL_SYNC_META_KEY, JSON.stringify({
            at: Date.now(),
            cacheSize: Object.keys(_idbCache || {}).length,
            // 全走査中に更新された行を取りこぼさないよう5分重ねて次回差分同期する。
            serverUpdatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            manifest: { raceRows:_raceRows, horseRows:_horseRows, schema:2 },
          }));
        } catch(e) { _kvSwallow('_pagedWithResume', e); }
      }
    } catch(e) {
      console.warn('[initDB] Phase2 背景読み込み失敗:', e);
    }
    _setBgLoadIndicator(false);
    loadSavedData();
    if(typeof initAnalysisDateSelect==='function') initAnalysisDateSelect();
    try { if (window._kvDeepLink) await _kvTryDeepLink(); } catch(e) { _kvSwallow('_pagedWithResume#2', e); }
    const _bfCount = backfillFirst3fFrom1400m();
    try { backfillPaceLabels(); backfillPaceType(); } catch(e) { console.warn('[paceLabels]', e); }
    if (_bfCount > 0 && typeof renderTrackTrend === 'function') {
      try { renderTrackTrend(); } catch(e) { _kvSwallow('_pagedWithResume#3', e); }
    }
    };

    if (navigator.locks?.request) {
      const didRun = await navigator.locks.request('kochi-full-history-sync-v1', { ifAvailable:true }, async lock => {
        if (!lock) return false;
        await _runOwnedFullSync();
        return true;
      });
      if (!didRun) console.log('[initDB] Phase2 省略（別タブが全履歴を同期中）');
    } else {
      await _runOwnedFullSync();
    }
  }, 5000);
}

/** 管理者が古い修正も含めて全履歴を取り直したい時の明示操作。 */
function forceHistoricalResync() {
  if (!isAdminMode()) return;
  if (!confirm('過去データを全件再同期しますか？\n通信量が大きいため、必要な場合だけ実行してください。')) return;
  localStorage.removeItem(_KV_FULL_SYNC_META_KEY);
  location.reload();
}

async function saveAllData() {
  // ── モーダル要素取得 ──
  const overlay  = document.getElementById('save-modal-overlay');
  const progBar  = document.getElementById('save-progress-bar');
  const raceList = document.getElementById('save-race-list');
  const stepText = document.getElementById('save-modal-step-text');
  const footer   = document.getElementById('save-modal-footer');
  const st       = document.getElementById('save-status');

  try { await apiCheckWriteAccess(); }
  catch (e) {
    console.error('[saveAllData] 保存権限の確認失敗:', e);
    if (st) st.textContent = `❌ ${e.message || e}`;
    if (e.status === 401) {
      sessionStorage.removeItem('kv_write_token'); localStorage.removeItem('kv_write_token');
      applyModeUI(); openAdminLogin();
      const err = document.getElementById('admin-login-error');
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
    }
    return;
  }

  // ── 対象レースをソート ──
  const raceEntries = Object.entries(allRacesData).map(([k,v])=>({rn:parseInt(k),data:v})).sort((a,b)=>a.rn-b.rn);
  const total = raceEntries.length;
  if (total === 0) { if(st)st.textContent='⚠ 保存するデータがありません'; return; }

  // ── モーダルを初期化して表示 ──
  raceList.innerHTML = raceEntries.map(({rn,data})=>{
    const _isDeba = !!(data.raceInfo?._isDebaTable);
    const hCount = data.horses ? (_isDeba ? data.horses.length : data.horses.filter(h=>h.first3f||h.paceType||h.mukaeShoumen||h.shoumenStraight||h.chakujun).length) : 0;
    return `<div class="save-race-item waiting" id="save-item-${rn}">
      <span class="item-icon">⏳</span>
      <span class="item-label">${rn}R ${data.raceInfo?.raceName||''}</span>
      <span class="item-horses">${hCount}頭</span>
    </div>`;
  }).join('');
  progBar.style.width = '0%';
  stepText.textContent = `0 / ${total} レース完了`;
  footer.textContent = 'しばらくお待ちください';
  overlay.style.display = 'flex';

  let rc=0, hc=0, errCount=0, skipped=0, firstError='';
  for (const {rn, data} of raceEntries) {
    const info = data.raceInfo;
    const item = document.getElementById(`save-item-${rn}`);

    // 馬0頭のレースは保存しない（パース不具合でレース情報だけ残ると復元時に「0頭」表示になる元）
    if (!data.horses || !data.horses.length) {
      skipped++;
      if (item) { item.className='save-race-item'; const ic=item.querySelector('.item-icon'); if(ic)ic.textContent='⚠'; const hl=item.querySelector('.item-horses'); if(hl)hl.textContent='0頭・スキップ'; }
      continue;
    }

    // 進行中に変更
    if (item) { item.className='save-race-item saving'; item.querySelector('.item-icon').textContent='🔄'; }
    stepText.textContent = `${rn}R を保存中...`;

    try {
      // 入力値を最新化
      const memoEl=document.getElementById(`race-memo-${rn}`); if(memoEl)info.memo=memoEl.value;
      const agari4fEl=document.getElementById(`race-agari4f-${rn}`); if(agari4fEl)info.agari4f=agari4fEl.value;
      const agari3fEl=document.getElementById(`race-agari3f-${rn}`); if(agari3fEl)info.agari3f_race=agari3fEl.value;
      _autofillFirst3fInData(data);
      // ラップタイム（onLapInput で info.lapTimes に入っている）
      const lapTimesJson = (info.lapTimes && info.lapTimes.some(v=>v!=null)) ? JSON.stringify(info.lapTimes) : '';

      const raceId=`race_${currentBaba}_${currentDate}_${rn}`;
      const raceRow={race_date:currentDate,race_no:rn,baba_code:currentBaba,race_name:info.raceName||'',distance:info.distance||'',race_class:info.raceClass||'',track_cond:info.trackCond||'',first3f:info.first3f||'',first3f_source:info.first3fSource||'',agari4f:info.agari4f||'',agari3f_race:info.agari3f_race||'',pace_type:info.paceType||'',memo:info.memo||'',lap_times:lapTimesJson};
      const horseRows = [];
      const localHorses = [];
      let raceHc = 0;
      const isDebaRace = !!(info._isDebaTable);
      for (const horse of (data.horses||[])) {
        if(!isDebaRace && !(horse.first3f||horse.paceType||horse.mukaeShoumen||horse.shoumenStraight||horse.chakujun||horse.postComment))continue;
        const horseId=`${currentBaba}_${currentDate}_${rn}_${horse.umaBan}`;
        const horseRow={race_date:currentDate,race_no:rn,baba_code:currentBaba,uma_ban:horse.umaBan,waku_ban:horse.wakuBan||'',horse_name:horse.horseName||'',belong:horse.belong||'',sex_age:horse.sexAge||'',kinryo:horse.kinryo||'',jockey:horse.jockey||'',trainer:horse.trainer||'',weight:horse.weight||'',chakujun:horse.chakujun||'',ninki:horse.ninki||'',odds:horse.odds||'',time:horse.time||'',diff:horse.diff||'',agari3f:horse.agari3f||'',corner:horse.corner||'',first3f:horse.first3f||'',pace_type:horse.paceType||'',mukae_shoumen:horse.mukaeShoumen||'',shoumen_straight:horse.shoumenStraight||'',post_comment:horse.postComment||'',lineage_login_code:horse.lineageLoginCode||''};
        horseRows.push(horseRow);
        localHorses.push([horseId,{type:'horse',chakujun:horseRow.chakujun,wakuBan:horseRow.waku_ban,horseName:horseRow.horse_name,belong:horseRow.belong,sexAge:horseRow.sex_age,kinryo:horseRow.kinryo,jockey:horseRow.jockey,trainer:horseRow.trainer,weight:horseRow.weight,ninki:horseRow.ninki,odds:horseRow.odds,time:horseRow.time,diff:horseRow.diff,agari3f:horseRow.agari3f,corner:horseRow.corner,first3f:horseRow.first3f,paceType:horseRow.pace_type,mukaeShoumen:horseRow.mukae_shoumen,shoumenStraight:horseRow.shoumen_straight,postComment:horse.postComment||'',lineageLoginCode:horse.lineageLoginCode||'',savedAt:new Date().toISOString()}]);
        raceHc++;
      }
      const saved=await apiSaveRaceBundle(raceId,raceRow,horseRows);_applyFirst3fSaveResult(saved,raceRow,info,rn);
      lsWrite(raceId,{type:'race',...raceRow,first3fSource:info.first3fSource||'',paceType:info.paceType||'',lapTimes:info.lapTimes||null,_apiSaved:true,savedAt:new Date().toISOString()});
      localHorses.forEach(([horseId,row]) => lsWrite(horseId,row));
      rc++; hc += raceHc;

      // 完了に変更
      if (item) {
        item.className='save-race-item done';
        item.querySelector('.item-icon').textContent='✅';
        item.querySelector('.item-horses').textContent=`${raceHc}頭 保存`;
      }
    } catch(e) {
      errCount++;
      const msg = e?.message || String(e);
      if (!firstError) firstError = msg;
      console.error(`[saveAllData] ${rn}R 保存失敗:`, e);
      if (item) { item.className='save-race-item error'; item.querySelector('.item-icon').textContent='❌'; item.querySelector('.item-horses').textContent=`失敗 HTTP ${e?.status || '通信'}`; item.title=msg; }
    }

    // プログレスバーと進捗テキスト更新
    const done = raceEntries.indexOf(raceEntries.find(r=>r.rn===rn)) + 1;
    progBar.style.width = `${Math.round((done/total)*100)}%`;
    stepText.textContent = `${done} / ${total} レース完了`;
    footer.textContent = `${hc}頭のデータを処理済み`;
  }

  // ── 完了 ──
  const hasErr = errCount > 0;
  stepText.innerHTML = hasErr
    ? `<span style="color:#b91c1c"><i class="fas fa-exclamation-triangle"></i> 一部エラーあり（${errCount}レース失敗）</span>`
    : `<span style="color:#15803d"><i class="fas fa-check-circle"></i> 保存完了！</span>`;
  document.querySelector('.save-modal-title').innerHTML = hasErr
    ? '<i class="fas fa-exclamation-triangle" style="color:#e84040"></i> 保存完了（一部エラー）'
    : '<i class="fas fa-check-circle" style="color:#16a34a"></i> 保存完了！';
  footer.innerHTML = `<strong>${rc}レース・${hc}頭</strong> をサーバーに保存しました${firstError ? `<div style="color:#b91c1c;text-align:left;margin-top:6px">原因: ${escapeHTML(firstError)}</div>` : ''}`;
  progBar.style.width = '100%';

  // save-statusにも反映
  if (st) { st.textContent = hasErr ? `⚠ ${rc}R保存（${errCount}件失敗）` : `✅ ${rc}レース・${hc}頭を保存`; }

  if (!hasErr) setTimeout(() => { overlay.style.display = 'none'; if (st) setTimeout(()=>{ st.textContent=''; }, 3000); }, 2000);

  loadSavedData();
  if(typeof initAnalysisDateSelect==='function') initAnalysisDateSelect();
}

// ============================================================
// 月間一括取得＆保存（管理者）
// 指定月の全開催日・全レースを再取得（成績＝単勝オッズ・人気込み）＋コメント取得してSupabase保存。
// 古いレースはオッズ抽出前に保存されオッズ欠落 → 再取得で埋まる。データ量が多いため月単位で回す。
// ============================================================
let _bulkCancel = false;
const _bulkSleep = ms => new Promise(r => setTimeout(r, ms));

/** 1レース分（parsed）を直接Supabase＋IDBへ保存（グローバルに依存しないヘッドレス版）。戻り値=保存頭数 */
async function _saveRaceDirect(date, baba, rn, parsed) {
  const info = parsed.raceInfo || {};
  _autofillFirst3fInData(parsed);
  // ペース(前後半差)が未設定でも first3f＋上がり3F があれば計算して保存に含める
  if (!info.paceType) { const p = paceFromDiff(info.first3f, info.agari3f_race); if (p) info.paceType = p; }
  const raceId = `race_${baba}_${date}_${rn}`;
  const raceRow = { race_date:date, race_no:rn, baba_code:baba, race_name:info.raceName||'', distance:info.distance||'', race_class:info.raceClass||'', track_cond:info.trackCond||'', first3f:info.first3f||'', first3f_source:info.first3fSource||'', agari4f:info.agari4f||'', agari3f_race:info.agari3f_race||'', pace_type:info.paceType||'', memo:info.memo||'', lap_times:'' };
  const horseRows = [];
  const localHorses = [];
  let hc = 0;
  for (const h of (parsed.horses||[])) {
    if (h.umaBan == null) continue;
    const horseId = `${baba}_${date}_${rn}_${h.umaBan}`;
    const horseRow = { race_date:date, race_no:rn, baba_code:baba, uma_ban:h.umaBan, waku_ban:h.wakuBan||'', horse_name:h.horseName||'', belong:h.belong||'', sex_age:h.sexAge||'', kinryo:h.kinryo||'', jockey:h.jockey||'', trainer:h.trainer||'', weight:h.weight||'', chakujun:h.chakujun||'', ninki:h.ninki||'', odds:h.odds||'', time:h.time||'', diff:h.diff||'', agari3f:h.agari3f||'', corner:h.corner||'', first3f:h.first3f||'', pace_type:h.paceType||'', mukae_shoumen:h.mukaeShoumen||'', shoumen_straight:h.shoumenStraight||'', post_comment:h.postComment||'', lineage_login_code:h.lineageLoginCode||'' };
    horseRows.push(horseRow);
    localHorses.push([horseId, { type:'horse', chakujun:horseRow.chakujun, wakuBan:horseRow.waku_ban, horseName:horseRow.horse_name, belong:horseRow.belong, sexAge:horseRow.sex_age, kinryo:horseRow.kinryo, jockey:horseRow.jockey, trainer:horseRow.trainer, weight:horseRow.weight, ninki:horseRow.ninki, odds:horseRow.odds, time:horseRow.time, diff:horseRow.diff, agari3f:horseRow.agari3f, corner:horseRow.corner, first3f:horseRow.first3f, paceType:horseRow.pace_type, mukaeShoumen:horseRow.mukae_shoumen, shoumenStraight:horseRow.shoumen_straight, postComment:h.postComment||'', lineageLoginCode:h.lineageLoginCode||'', savedAt:new Date().toISOString() }]);
    hc++;
  }
  const saved=await apiSaveRaceBundle(raceId,raceRow,horseRows);_applyFirst3fSaveResult(saved,raceRow,info);
  lsWrite(raceId, { type:'race', ...raceRow, first3fSource:info.first3fSource||'', paceType:info.paceType||'', lapTimes:null, _apiSaved:true, savedAt:new Date().toISOString() });
  localHorses.forEach(([horseId, row]) => lsWrite(horseId, row));
  return hc;
}

/**
 * 払戻ページ(RefundMoneyList)から日別の勝ち馬・複勝馬の単勝/複勝オッズを取得。
 * 古いレースは成績ページの単勝オッズ列が空になるため、勝ち馬オッズはここから復元する。
 * 戻り値: { raceNo: { win:{umaBan:odds}, place:{umaBan:odds} } }
 */
async function _fetchRefundOddsDay(date) {
  const out = {};
  let html;
  try { html = await fetchHtmlWithProxy(`https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RefundMoneyList?k_raceDate=${encodeURIComponent(date)}&k_babaCode=31`, 15000); }
  catch(e) { return out; }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const heads = [...doc.querySelectorAll('h1,h2,h3,h4')].map(e => e.textContent.replace(/\s+/g, '')).filter(t => /^\d{1,2}R/.test(t)).map(t => parseInt(t));
  const tables = [...doc.querySelectorAll('table')];
  let raceIdx = -1;
  for (const t of tables) {
    const first = (t.querySelector('th,td')?.textContent || '').replace(/\s+/g, '');
    if (first === '着順') { raceIdx++; continue; }
    if (first !== '単勝') continue;
    const rno = heads[raceIdx];
    if (rno == null) continue;
    const rec = out[rno] || { win: {}, place: {} };
    let mode = '';
    for (const tr of [...t.querySelectorAll('tr')]) {
      const c = [...tr.querySelectorAll('th,td')].map(x => (x.textContent || '').replace(/\s+/g, ''));
      if (!c.length) continue;
      if (c[0]) mode = c[0];
      if (mode !== '単勝' && mode !== '複勝') continue;
      if (!/^\d+$/.test(c[1] || '')) continue;
      const uma = parseInt(c[1]);
      const pay = parseFloat((c[2] || '').replace(/[円,]/g, ''));
      if (!(pay > 0)) continue;
      const odds = +(pay / 100).toFixed(1);
      if (mode === '単勝') rec.win[uma] = odds; else rec.place[uma] = odds;
    }
    out[rno] = rec;
  }
  return out;
}

/**
 * 楽天競馬のオッズ(単勝/複勝)ページから全馬の単勝オッズを取得する。
 * keiba.go.jpは約5か月でオッズを消すが、楽天は数年前まで全馬分を保持しているため、
 * 古いレースの「勝ち馬以外」も含めた全馬オッズ復元に使う（払戻ベースの生存者バイアス回避）。
 * RACEID = 日付(YYYYMMDD 8桁) + 馬場31 + "000000" + レース番号(2桁ゼロ埋め) = 18桁。
 * 表の各行で「複勝オッズ範囲(例 2.9-7.8)」列を目印に、その直前セルを単勝、cells[1]を馬番とする。
 * この構造は本体テーブル・単勝オッズ順テーブルの両方で一致する。
 * 戻り値: { umaBan(数値): 単勝オッズ(数値), ... }（失敗時は空オブジェクト）
 */
async function _fetchRakutenOddsRace(date, rn) {
  const out = {};
  const ymd = String(date).replace(/[^0-9]/g, '');   // "2025/05/10" -> "20250510"
  if (ymd.length !== 8) return out;
  const raceId = `${ymd}31000000${String(rn).padStart(2, '0')}`;
  let html;
  try { html = await fetchHtmlWithProxy(`https://keiba.rakuten.co.jp/odds/tanfuku/RACEID/${raceId}`, 15000); }
  catch(e) { return out; }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const RANGE = /^\d+(?:\.\d)?[-–]\d+(?:\.\d)?$/;   // 複勝オッズ範囲 "2.9-7.8"（下限=上限も可）
  const ODD   = /^\d{1,4}\.\d$/;                    // 単勝オッズ "34.8"
  for (const tr of doc.querySelectorAll('tr')) {
    const cells = [...tr.querySelectorAll('th,td')].map(x => (x.textContent || '').replace(/\s+/g, ''));
    if (cells.length < 4) continue;
    const j = cells.findIndex(c => RANGE.test(c));   // 複勝レンジ列を探す
    if (j < 2) continue;                             // その前に馬番と単勝が要る
    const tan = cells[j - 1];                        // レンジ直前＝単勝オッズ
    if (!ODD.test(tan)) continue;
    let uma = parseInt(cells[1], 10);               // 本体表・順位表とも cells[1] が馬番
    if (!(uma >= 1 && uma <= 18) || String(uma) !== cells[1]) {
      // 念のためのフォールバック：単勝列より前の最後の純整数(1-18)を馬番とみなす
      uma = NaN;
      for (let k = j - 2; k >= 0; k--) { const v = parseInt(cells[k], 10); if (String(v) === cells[k] && v >= 1 && v <= 18) { uma = v; break; } }
    }
    if (!(uma >= 1 && uma <= 18)) continue;
    const o = parseFloat(tan);
    if (o >= 1 && out[uma] == null) out[uma] = o;
  }
  return out;
}

/**
 * 楽天競馬の「払戻金」ページから、指定日の全レース分の払戻を1回のfetchで取得する。
 * URLはRACEIDに日付を含むが、レース番号部分はどれを指定しても同じ日の11-12R全部が
 * 1ページに載る（構造: <h3 class="headline">…{n}R…</h3> の後に払戻テーブルが続く）。
 * 戻り値: { [raceNo]: [{type:'単勝'|'複勝'|'馬単'|'ワイド'|'枠複'|'三連複'|'枠単'|'三連単'|'馬複',
 *                       combo:'7-9'（馬番のハイフン区切り文字列・単勝等は単独）, yen:数値, ninki:'2番人気'}, ...] }
 * 「総票数」以降の投票数内訳テーブル（同じth/td構造）は誤パース防止のため各レース毎に切り捨てる。
 */
async function fetchRakutenDividendsForDay(date) {
  const out = {};
  const ymd = String(date).replace(/[^0-9]/g, '');
  if (ymd.length !== 8) return out;
  const raceId = `${ymd}31000000${'01'}`;  // レース番号部分はダミーでも当日全レース分が返る
  let html;
  try { html = await fetchHtmlWithProxy(`https://keiba.rakuten.co.jp/race_dividend/list/RACEID/${raceId}`, 15000); }
  catch (e) { return out; }
  const parts = html.split(/<h3 class="headline"><span>■<\/span>(\d+)R/);
  for (let i = 1; i < parts.length; i += 2) {
    const rno = parseInt(parts[i]);
    let block = parts[i + 1] || '';
    const cut = block.indexOf('総票数');
    if (cut > 0) block = block.slice(0, cut);
    const entries = [];
    const re = /<th scope="row">([^<]+)<\/th>\s*<td class="number"[^>]*>([\s\S]*?)<\/td>\s*<td class="money"[^>]*>([\s\S]*?)<\/td>\s*<td class="rank"[^>]*>([\s\S]*?)<\/td>/g;
    let m;
    while ((m = re.exec(block))) {
      const typ = m[1].trim();
      const nums = m[2].split(/<br\s*\/?>/).map(s => s.trim()).filter(Boolean);
      const moneys = m[3].split(/<br\s*\/?>/).map(s => s.trim()).filter(Boolean);
      const ranks = m[4].split(/<br\s*\/?>/).map(s => s.trim()).filter(Boolean);
      for (let j = 0; j < nums.length; j++) {
        const yen = parseInt((moneys[j] || '').replace(/[^\d]/g, ''), 10);
        if (!yen) continue;
        entries.push({ type: typ, combo: nums[j], yen, ninki: ranks[j] || '' });
      }
    }
    if (entries.length) out[rno] = entries;
  }
  return out;
}

/**
 * 既に保存済みの高知レースのうち「オッズ欠損のある馬」を楽天オッズで一括補完する（管理者専用）。
 * keiba.go.jpのオッズ保持期限切れで空欄になった過去レースを、再取得せずオッズだけ埋め直す。
 */
async function backfillOddsFromRakuten() {
  if (!isAdminMode()) { alert('オッズ補完は管理者のみ可能です。'); return; }
  const btn = document.getElementById('rakuten-odds-btn');
  const cancelBtn = document.getElementById('bulk-cancel-btn');
  _bulkCancel = false;
  if (btn) btn.disabled = true;
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  _proxyHealth.forEach(h => { h.blockedUntil = 0; });
  try {
    const lsData = lsRead();
    // 高知(31)の保存済みレース一覧
    const races = Object.entries(lsData)
      .filter(([k, v]) => (v.type === 'race' || k.startsWith('race_')) && v.baba_code === '31' && v.race_date && v.race_no != null)
      .map(([k, v]) => ({ date: v.race_date, rn: v.race_no }));
    // オッズ欠損を1頭でも含むレースだけを対象に（欠損頭数も把握）
    const targets = [];
    for (const r of races) {
      const prefix = `31_${r.date}_${r.rn}_`;
      const horses = Object.entries(lsData).filter(([k, v]) => v.type === 'horse' && k.startsWith(prefix));
      if (!horses.length) continue;
      const missing = horses.filter(([k, v]) => !(parseFloat(v.odds) > 0));
      if (missing.length) targets.push({ ...r, horses });
    }
    if (!targets.length) { _bulkLog('✅ オッズ欠損のある高知レースはありません。'); return; }
    // 新しい順（date+rn）に並べて、直近から埋める
    targets.sort((a, b) => (b.date + String(b.rn).padStart(2, '0')).localeCompare(a.date + String(a.rn).padStart(2, '0')));
    let filled = 0, doneRaces = 0, hitRaces = 0, err = 0;
    for (let i = 0; i < targets.length && !_bulkCancel; i++) {
      const t = targets[i];
      _bulkLog(`<i class="fas fa-download"></i> 楽天オッズ補完 ${t.date} ${t.rn}R …<br><span style="font-size:11px;color:#6b7280">進捗 ${i + 1}/${targets.length}R／補完 ${filled}頭（${hitRaces}R更新）・エラー${err}</span>`);
      let rk = {}; try { rk = await _fetchRakutenOddsRace(t.date, t.rn); } catch(e) { err++; }
      let raceFilled = 0;
      if (Object.keys(rk).length) {
        for (const [k, v] of t.horses) {
          const uma = parseInt(k.split('_').pop(), 10);
          if (!(parseFloat(v.odds) > 0) && rk[uma] > 0) {
            const newOdds = String(rk[uma]);
            try { await apiUpsert('keiba_horses', k, { odds: newOdds }); } catch(e) { _kvSwallow('backfillOddsFromRakuten', e); }
            v.odds = newOdds;
            lsWrite(k, v);
            filled++; raceFilled++;
          }
        }
      }
      if (raceFilled) hitRaces++;
      doneRaces++;
      await _bulkSleep(250);
    }
    _savedGroupsDirty = true;
    loadSavedData();
    _bulkLog(`${_bulkCancel ? '⏹ 中止しました。' : '✅ 完了！'} 欠損 ${targets.length}レースを確認し <b>${filled}頭のオッズ</b>を楽天から補完しました（${hitRaces}レース更新${err ? `／エラー${err}` : ''}）。`);
  } finally {
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }
}

/**
 * 払戻ページ(RefundMoneyList)から日別・全馬券種の配当と当たり組合せを取得する。
 * keiba.go.jpの払戻はオッズと違い古いレースでも保持されるため、連系ROI検証の配当源に使える。
 * ページ構造は1レース=3テーブル：着順 / 単勝〜馬連複 / 馬連単〜三連単（UTF-8・券種ラベルそのまま）。
 * 戻り値: { raceNo: { tan, fuku:[], umaren, umatan, wide:[], san3, san3tan } }
 *   各値は { combo:[馬番…], pay:配当円 }（単勝/複勝は uma:馬番）。
 */
async function _fetchRefundPayoutsDay(date) {
  const out = {};
  let html;
  try { html = await fetchHtmlWithProxy(`https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RefundMoneyList?k_raceDate=${encodeURIComponent(date)}&k_babaCode=31`, 15000); }
  catch(e) { return out; }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const heads = [...doc.querySelectorAll('h1,h2,h3,h4')].map(e => e.textContent.replace(/\s+/g, '')).filter(t => /^\d{1,2}R/.test(t)).map(t => parseInt(t));
  const tables = [...doc.querySelectorAll('table')];
  const parseCombo = s => (s || '').split(/[\-－~〜]/).map(x => parseInt(x)).filter(n => !isNaN(n));
  const parsePay = s => { const n = parseFloat((s || '').replace(/[円,]/g, '')); return n > 0 ? n : null; };
  let raceIdx = -1;
  for (const t of tables) {
    const first = (t.querySelector('th,td')?.textContent || '').replace(/\s+/g, '');
    if (first === '着順') { raceIdx++; continue; }
    if (first !== '単勝' && first !== '馬連単') continue; // 払戻テーブルは単勝始まり(左)か馬連単始まり(右)
    const rno = heads[raceIdx];
    if (rno == null) continue;
    const rec = out[rno] || { wide: [] };
    let mode = '';
    for (const tr of [...t.querySelectorAll('tr')]) {
      const c = [...tr.querySelectorAll('th,td')].map(x => (x.textContent || '').replace(/\s+/g, ''));
      if (!c.length) continue;
      if (c[0]) mode = c[0];
      const pay = parsePay(c[2]);
      if (pay == null) continue;
      const combo = c[1] || '';
      if (mode === '単勝') {
        const item = { uma: parseInt(combo), pay };
        if (!rec.tan) rec.tan = item;
        else if (Array.isArray(rec.tan)) rec.tan.push(item);
        else rec.tan = [rec.tan, item];
      }
      else if (mode === '複勝') (rec.fuku = rec.fuku || []).push({ uma: parseInt(combo), pay });
      else if (mode === '馬連複') rec.umaren = { combo: parseCombo(combo), pay };
      else if (mode === '馬連単') rec.umatan = { combo: parseCombo(combo), pay };
      else if (mode === 'ワイド') rec.wide.push({ combo: parseCombo(combo), pay });
      else if (mode === '三連複') rec.san3 = { combo: parseCombo(combo), pay };
      else if (mode === '三連単') rec.san3tan = { combo: parseCombo(combo), pay };
      // 枠連複/枠単は枠番なので採用しない
    }
    out[rno] = rec;
  }
  return out;
}

/**
 * 保存済みの高知レース日について、全馬券種の配当をまとめて取得しローカルに保存する（管理者専用）。
 * 連系ROI検証(②)用のデータ収集。payoutレコードはローカルのみ（配当は検証用途でSupabase同期不要）。
 * キー: payout_31_{date}_{rno}
 */
async function backfillPayouts() {
  if (!isAdminMode()) { alert('配当バックフィルは管理者のみ可能です。'); return; }
  const btn = document.getElementById('payout-backfill-btn');
  const cancelBtn = document.getElementById('bulk-cancel-btn');
  _bulkCancel = false;
  if (btn) btn.disabled = true;
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  _proxyHealth.forEach(h => { h.blockedUntil = 0; });
  try {
    const lsData = lsRead();
    // 高知の保存済みレース日を収集（配当未取得の日を優先）
    const dateHas = {};   // date -> 既にpayout保存済みのレース数
    const dateRaces = {}; // date -> 保存済みレース数
    for (const [k, v] of Object.entries(lsData)) {
      if ((v.type === 'race' || k.startsWith('race_')) && v.baba_code === '31' && v.race_date) {
        dateRaces[v.race_date] = (dateRaces[v.race_date] || 0) + 1;
      } else if (v.type === 'payout' && v.baba_code === '31' && v.race_date) {
        dateHas[v.race_date] = (dateHas[v.race_date] || 0) + 1;
      }
    }
    // まだ全レース分の配当が揃っていない日だけ対象に
    const dates = Object.keys(dateRaces).filter(d => (dateHas[d] || 0) < dateRaces[d]).sort((a, b) => b.localeCompare(a));
    if (!dates.length) { _bulkLog('✅ 未取得の配当はありません（全日取得済み）。'); return; }
    let doneDays = 0, savedR = 0, err = 0;
    for (let i = 0; i < dates.length && !_bulkCancel; i++) {
      const date = dates[i];
      _bulkLog(`<i class="fas fa-coins"></i> 配当取得 ${date} …<br><span style="font-size:11px;color:#6b7280">進捗 ${i + 1}/${dates.length}日／保存 ${savedR}R・エラー${err}</span>`);
      let day = {};
      try { day = await _fetchRefundPayoutsDay(date); } catch(e) { err++; }
      const rnos = Object.keys(day);
      if (!rnos.length) err++;
      for (const rno of rnos) {
        lsWrite(`payout_31_${date}_${rno}`, { type: 'payout', race_date: date, race_no: parseInt(rno), baba_code: '31', ...day[rno], savedAt: new Date().toISOString() });
        savedR++;
      }
      doneDays++;
      await _bulkSleep(200);
    }
    _bulkLog(`${_bulkCancel ? '⏹ 中止しました。' : '✅ 完了！'} ${doneDays}日・<b>${savedR}レースの配当</b>を保存しました${err ? `／取得できなかった日 ${err}` : ''}。`);
  } finally {
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }
}

function _bulkLog(html) { const el = document.getElementById('bulk-progress'); if (el) el.innerHTML = html; }

// 月間一括取得（入口）：#bulk-monthの月を1つ処理
async function bulkFetchMonth() {
  if (!isAdminMode()) { alert('月間一括取得は管理者のみ可能です。'); return; }
  const ym = document.getElementById('bulk-month')?.value; // "2025-12"
  if (!ym) { alert('年月を選択してください。'); return; }
  const [y, m] = ym.split('-').map(Number);
  return _bulkFetchRun([{ y, m }], `${y}年${m}月`);
}

// 年間一括取得（入口）：#bulk-monthの年の1〜12月を処理（データが増えると騎手×厩舎・乗替・基準タイムが安定）
async function bulkFetchYear() {
  if (!isAdminMode()) { alert('一括取得は管理者のみ可能です。'); return; }
  const ym = document.getElementById('bulk-month')?.value;
  if (!ym) { alert('年月を選択してください（その年の1〜12月を取得します）。'); return; }
  const y = parseInt(ym.split('-')[0]);
  if (!confirm(`${y}年の1〜12月をまとめて取得します。\n開催日の確認だけで数分、全体で数十分かかることがあります。\n（途中で「中止」できます）続行しますか？`)) return;
  const months = [];
  for (let m = 1; m <= 12; m++) months.push({ y, m });
  return _bulkFetchRun(months, `${y}年（1〜12月）`);
}

// 共通処理：月リストの全開催日・全レースを再取得＆保存（月・年で共有）
async function _bulkFetchRun(monthsList, label) {
  const withComments = document.getElementById('bulk-comments')?.checked;
  const startBtn = document.getElementById('bulk-start-btn');
  const yearBtn = document.getElementById('bulk-year-btn');
  const cancelBtn = document.getElementById('bulk-cancel-btn');
  _bulkCancel = false;
  if (startBtn) startBtn.disabled = true;
  if (yearBtn) yearBtn.disabled = true;
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  _proxyHealth.forEach(h => { h.blockedUntil = 0; });

  try {
    // ① 開催日を探す（各日をRaceListで軽量プローブ・全月ぶん）
    const raceDays = [];
    for (let mi = 0; mi < monthsList.length && !_bulkCancel; mi++) {
      const { y, m } = monthsList[mi];
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let d = 1; d <= daysInMonth && !_bulkCancel; d++) {
        const date = `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}`;
        _bulkLog(`<i class="fas fa-spinner fa-spin"></i> 開催日を確認中… ${y}/${m}/${d}（開催 ${raceDays.length}日発見）`);
        let chk; try { chk = await checkRaceListExists(date, '31'); } catch(e) { chk = { exists:null }; }
        if (chk.exists) raceDays.push({ date, raceNos: chk.raceNos });
        await _bulkSleep(150);
      }
    }
    if (_bulkCancel) { _bulkLog(`中止しました（開催日確認まで）。`); return; }
    if (!raceDays.length) { _bulkLog(`${label}に高知の開催は見つかりませんでした。`); return; }

    // ② 各開催日・各レースを再取得＆保存
    // 日ごとに速い/遅いの主因＝楽天オッズ補完：keiba.go.jpのオッズが残る直近日はスキップ(速い)、
    // オッズが消えた古い日は全レースで楽天フェッチ(遅い)。→ 日内レースを並列化(同時3本)して吸収。
    let savedR = 0, savedH = 0, cmt = 0, err = 0, rkTotal = 0;
    const totalRaces = raceDays.reduce((s, d) => s + d.raceNos.length, 0);
    let processed = 0;
    const _CONC = 3;
    for (let i = 0; i < raceDays.length && !_bulkCancel; i++) {
      const { date, raceNos } = raceDays[i];
      // その日の払戻オッズを1回だけ取得（古いレースの単勝オッズ空欄を勝ち馬分だけ復元）
      let refund = {}; try { refund = await _fetchRefundOddsDay(date); } catch(e) { _kvSwallow('_bulkFetchRun', e); }
      const _procOne = async (rn, j) => {
        if (_bulkCancel) return;
        if (j > 0) await _bulkSleep(180 * j);   // バッチ内の同時発火を少しずらす（バースト抑制）
        processed++;
        _bulkLog(`<i class="fas fa-download"></i> ${label} ${date} 取得中…<br><span style="font-size:11px;color:#6b7280">進捗 ${processed}/${totalRaces}R（${i+1}/${raceDays.length}日）／保存 ${savedR}R ${savedH}頭・コメント${cmt}件・<b>楽天補完${rkTotal}R</b>・エラー${err}</span>`);
        try {
          const parsed = await fetchOneRace(date, rn, '31');
          if (!parsed || !parsed.horses || !parsed.horses.length) { err++; return; }
          const _needOdds = parsed.horses.some(h => !(parseFloat(h.odds) > 0));
          if (_needOdds) rkTotal++;   // ← この日が遅い＝ここが増える（診断表示）
          // コメントは2024/03開始。それ以前はページ不在＝取得を試みると全プロキシ空振りで
          // 毎レース数秒空費するため、古い日付は取得自体をスキップする（古い月の遅さの主因を解消）。
          const _wantCmt = withComments && date >= KV_COMMENT_START;
          const [rk, cr] = await Promise.all([
            _needOdds ? _fetchRakutenOddsRace(date, rn).catch(() => ({})) : Promise.resolve({}),
            _wantCmt ? fetchPostRaceComments(date, rn, parsed.horses.map(h => h.horseName)).catch(() => null) : Promise.resolve(null),
          ]);
          if (rk && Object.keys(rk).length) parsed.horses.forEach(h => { const u = parseInt(h.umaBan); if (!(parseFloat(h.odds) > 0) && rk[u] > 0) h.odds = String(rk[u]); });
          const rf = refund[rn];
          if (rf) parsed.horses.forEach(h => { const u = parseInt(h.umaBan); if (!(parseFloat(h.odds) > 0) && rf.win[u] > 0) h.odds = String(rf.win[u]); });
          if (cr && cr.map) { let n=0; parsed.horses.forEach(h => { if (cr.map[h.horseName]) { h.postComment = cr.map[h.horseName]; n++; } }); cmt += n; }
          const hc = await _saveRaceDirect(date, '31', rn, parsed);
          savedR++; savedH += hc;
        } catch(e) { err++; console.warn('[bulk]', date, rn, e); }
      };
      // 日内レースを CONC 本ずつ並列処理
      for (let bi = 0; bi < raceNos.length && !_bulkCancel; bi += _CONC) {
        await Promise.all(raceNos.slice(bi, bi + _CONC).map((rn, j) => _procOne(rn, j)));
        await _bulkSleep(120);
      }
    }
    // first3f・ペース自動補完（今回保存分に効く）＋基準タイム系のキャッシュ無効化（データ増を反映）
    try { backfillPaceLabels(); backfillPaceType(); } catch(e) { _kvSwallow('_procOne', e); }
    window._f3BenchCache = null; window._leadFrontBench = null; window._frontBaseCache = null; window._comboStatsCache = null; window._jcMapsCache = null; window._evMapsCache = null; window._asOfComboCache = null; window._asOfAgariCache = null; window._asOfF3BenchCache = null;
    loadSavedData();
    if (typeof initAnalysisDateSelect === 'function') initAnalysisDateSelect();
    _bulkLog(`${_bulkCancel ? '⏹ 中止しました。' : '✅ 完了！'} ${label}：<b>${savedR}レース・${savedH}頭</b>を保存${withComments?`（コメント${cmt}件）`:''}${err?`／エラー${err}`:''}`);
  } finally {
    if (startBtn) startBtn.disabled = false;
    if (yearBtn) yearBtn.disabled = false;
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }
}
function bulkCancel() { _bulkCancel = true; _bulkLog('⏳ 中止処理中…現在のレース完了後に停止します。'); }

// ── 乗り替わり分析の土台（フィルタ非依存なので履歴が変わるまで使い回す）──
// 【2026-08-04】全履歴(約17万件)の2周と馬ごとの時系列ソートは、年/厩舎/騎手/ファイナルの
// どれを選んでも同じ結果になる。renderJockeyChangeAnalysis はこれを毎回やり直していたため、
// 画面を開くたび・フィルタを変えるたびに0.7〜1.1秒メインスレッドが止まっていた。
// 無効化の鍵は _kvHistoryRevision（馬/レース行の追加・削除で増える）と、
// 部分キャッシュから全履歴へ切り替わる _idbFullReady の2つ。
function _jcScanHistory() {
  const rev = `${Number(window._kvHistoryRevision || 0)}|${_idbFullReady ? 1 : 0}`;
  if (window._jcScanCache && window._jcScanCache.rev === rev) return window._jcScanCache;
  const store = lsRead();
  // ファイナルレース（race_nameに「ファイナル」を含む）の日R集合
  const finalSet = new Set();
  for (const k of Object.keys(store)) { if (!k.startsWith('race_31_')) continue; const r = store[k]; if (/ファイナル/.test(r.race_name || '')) finalSet.add(`${r.race_date}_${parseInt(r.race_no)}`); }
  const runs = {}, trAll = {}, years = new Set();
  for (const k of Object.keys(store)) {
    const p = k.split('_'); if (p.length !== 4 || p[0] !== '31') continue;
    const v = store[k]; if (!v || v.type !== 'horse') continue;
    const ch = parseInt(v.chakujun); if (isNaN(ch)) continue;
    const jk = (v.jockey || '').trim(); if (!jk) continue;
    const tr = (v.trainer || '').trim();
    const rno = parseInt(p[2]);
    const yr = String(p[1]).slice(0, 4); if (/^\d{4}$/.test(yr)) years.add(yr);
    if (tr) trAll[tr] = (trAll[tr] || 0) + 1;   // 厩舎の総騎乗（高知所属判定用・全期間）
    (runs[v.horseName] = runs[v.horseName] || []).push({ d: p[1], rno, jk, ch, tr, fin: finalSet.has(`${p[1]}_${rno}`) });
  }
  for (const n of Object.keys(runs)) runs[n].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.rno - b.rno);
  window._jcScanCache = { rev, finalSet, runs, trAll, years };
  return window._jcScanCache;
}

// ── 乗り替わり分析（前走から騎手が替わった全レースを集計） ──
// 「誰に乗せ替えたら来る/危険か（乗替先ランキング）」＋「A→Bペア別」。表示専用・分析ページ。
function renderJockeyChangeAnalysis() {
  const body = document.getElementById('jockey-change-body');
  if (!body) return;
  const yf = document.getElementById('jc-year')?.value || '';       // '' = 全期間 / 'YYYY' / 'L3'(過去3年) / 'L5'(過去5年)
  const tf = document.getElementById('jc-trainer')?.value || '';    // '' = 全厩舎 / 厩舎名
  const jf = document.getElementById('jc-jockey')?.value || '';     // '' = 全騎手 / 騎手名（選ぶと厩舎別ビュー）
  const finalOnly = !!document.getElementById('jc-final')?.checked;  // ファイナルレースのみ
  const _curY = new Date().getFullYear();
  const _isRange = yf === 'L3' || yf === 'L5';                        // 複数年レンジ
  const inYear = d => {
    if (!yf) return true;
    const y = +String(d).slice(0, 4);
    if (yf === 'L3') return y >= _curY - 2;   // 過去3年
    if (yf === 'L5') return y >= _curY - 4;   // 過去5年
    return String(d).slice(0, 4) === yf;
  };
  const yfLabel = yf === 'L3' ? '過去3年' : yf === 'L5' ? '過去5年' : yf ? yf + '年' : '';
  // 全履歴の走査（約17万件×2周）と馬ごとの時系列ソートは、年/厩舎/騎手/ファイナルの
  // どれを変えても結果が同じ。毎回やり直していたのが、この画面を開くたび・フィルタを
  // 変えるたびに0.7〜1.1秒固まっていた原因だったため、履歴が変わるまで使い回す。
  const { finalSet, runs, trAll, years } = _jcScanHistory();
  const isFinal = (d, rno) => finalSet.has(`${d}_${rno}`);
  const jkAll = {}, trainers = {}, trJk = {}, jkAllCnt = {}, jfTr = {};
  // 集計はすべて件数の足し上げ（順序に依存しない）ので、store の代わりに runs を回しても同値。
  for (const rs of Object.values(runs)) {
    for (const r of rs) {
      if (!(inYear(r.d) && (!finalOnly || r.fin))) continue;
      const jk = r.jk, tr = r.tr, ch = r.ch;
      (jkAll[jk] = jkAll[jk] || { n: 0, f: 0 }); jkAll[jk].n++; if (ch <= 3) jkAll[jk].f++;
      if (tr) jkAllCnt[jk] = (jkAllCnt[jk] || 0) + 1;   // 騎手ドロップダウン用（高知所属騎乗数）
      if (tr) { trainers[tr] = (trainers[tr] || 0) + 1;
        if (tr === tf) { (trJk[jk] = trJk[jk] || { n: 0, f: 0, w: 0 }); trJk[jk].n++; if (ch <= 3) trJk[jk].f++; if (ch === 1) trJk[jk].w++; }
        // 騎手別ビュー：選択騎手の厩舎別「全体」成績
        if (jf && jk === jf) { (jfTr[tr] = jfTr[tr] || { n: 0, f: 0, w: 0 }); jfTr[tr].n++; if (ch <= 3) jfTr[tr].f++; if (ch === 1) jfTr[tr].w++; } }
    }
  }
  // 年・厩舎ドロップダウンを初回に自動生成
  const ysel = document.getElementById('jc-year');
  if (ysel && ysel.options.length <= 1 && years.size) {
    const cur = ysel.value;
    ysel.innerHTML = '<option value="">全期間</option><option value="L3">過去3年</option><option value="L5">過去5年</option>' + [...years].sort((a, b) => b - a).map(y => `<option value="${y}">${y}年</option>`).join('');
    ysel.value = cur;
  }
  const tsel = document.getElementById('jc-trainer');
  if (tsel && Object.keys(trAll).length) {
    // 年/ファイナルが変わったら再生成：高知所属(総騎乗30件+)かつ「その条件で騎乗データがある」厩舎のみ
    const popKey = yf + '|' + (finalOnly ? 'F' : '');
    if (tsel._popKey !== popKey) {
      tsel._popKey = popKey;
      const cur = tsel.value;
      const list = Object.keys(trAll).filter(t => trAll[t] >= 30 && (trainers[t] || 0) >= 1)
        .sort((a, b) => (trainers[b] || 0) - (trainers[a] || 0));
      tsel.innerHTML = '<option value="">全厩舎（高知）</option>' + list.map(t => `<option value="${t}">${t}</option>`).join('');
      tsel.value = list.includes(cur) ? cur : '';
      // 選択中の厩舎がこの年に無い→'' にリセットされたら、正しい表示で再描画
      if (cur && tsel.value !== cur) { renderJockeyChangeAnalysis(); return; }
    }
  }
  // 騎手ドロップダウン（高知所属30騎乗+・騎乗数順）
  const jsel = document.getElementById('jc-jockey');
  if (jsel && Object.keys(jkAllCnt).length) {
    const popKeyJ = yf + '|' + (finalOnly ? 'F' : '');
    if (jsel._popKey !== popKeyJ) {
      jsel._popKey = popKeyJ;
      const cur = jsel.value;
      const list = Object.keys(jkAllCnt).filter(j => jkAllCnt[j] >= 30).sort((a, b) => jkAllCnt[b] - jkAllCnt[a]);
      jsel.innerHTML = '<option value="">全騎手（高知）</option>' + list.map(j => `<option value="${j}">${j}</option>`).join('');
      jsel.value = list.includes(cur) ? cur : '';
      if (cur && jsel.value !== cur) { renderJockeyChangeAnalysis(); return; }
    }
  }
  // runs は _jcScanHistory() 内で馬ごとに時系列ソート済み
  const byB = {}, pair = {}, sameB = {}, jkTr = {}, jfSrcTr = {};   // sameB＝同騎手継続の基準／jkTr＝騎手×厩舎／jfSrcTr＝選択騎手の厩舎別・乗せ替え元
  const chgTot = { n: 0, f: 0 }, contTot = { n: 0, f: 0 };
  for (const n of Object.keys(runs)) {
    const rs = runs[n];
    for (let i = 1; i < rs.length; i++) {
      const A = rs[i - 1].jk, B = rs[i].jk; if (!A || !B) continue;
      if (!inYear(rs[i].d)) continue;
      if (finalOnly && !rs[i].fin) continue;   // ファイナルレースのみ（当該走B）
      const tr = rs[i].tr;
      const hit = rs[i].ch <= 3;
      // 騎手×厩舎の継続/乗替（乗替先騎手のツールチップ用・厩舎フィルタ前に全厩舎ぶん集計）
      if (tr) {
        (jkTr[B] = jkTr[B] || {}); (jkTr[B][tr] = jkTr[B][tr] || { cn: 0, cf: 0, gn: 0, gf: 0 });
        if (A === B) { jkTr[B][tr].cn++; if (hit) jkTr[B][tr].cf++; } else { jkTr[B][tr].gn++; if (hit) jkTr[B][tr].gf++; }
        // 騎手別ビュー：選択騎手へ「乗り替わった」時の乗せ替え元（厩舎別）
        if (jf && B === jf && A !== B) { (jfSrcTr[tr] = jfSrcTr[tr] || {}); (jfSrcTr[tr][A] = jfSrcTr[tr][A] || { n: 0, f: 0, w: 0 }); jfSrcTr[tr][A].n++; if (hit) jfSrcTr[tr][A].f++; if (rs[i].ch === 1) jfSrcTr[tr][A].w++; }
      }
      if (tf && tr !== tf) continue;     // 表示集計は当該走の厩舎で限定
      if (A === B) {   // 継続（乗り替わりなし）
        (sameB[B] = sameB[B] || { n: 0, f: 0 }); sameB[B].n++; if (hit) sameB[B].f++;
        contTot.n++; if (hit) contTot.f++;
      } else {          // 乗り替わり
        (byB[B] = byB[B] || { n: 0, f: 0, w: 0 }); byB[B].n++; if (hit) byB[B].f++; if (rs[i].ch === 1) byB[B].w++;
        const pk = A + ' → ' + B; (pair[pk] = pair[pk] || { n: 0, f: 0, w: 0 }); pair[pk].n++; if (hit) pair[pk].f++; if (rs[i].ch === 1) pair[pk].w++;
        chgTot.n++; if (hit) chgTot.f++;
      }
    }
  }
  const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : 0;
  // 乗替先騎手のツールチップ：この騎手がどの厩舎で継続/乗替が良いか（各上位3厩舎・n≥3）
  const jkTip = B => {
    const tm = jkTr[B]; if (!tm) return '';
    const top = (getN, getF) => Object.entries(tm).filter(([t, v]) => getN(v) >= 3)
      .map(([t, v]) => ({ t, f: pct(getF(v), getN(v)), n: getN(v) })).sort((a, b) => b.f - a.f)
      .slice(0, 3).map(x => `${x.t}${x.f}%(${x.n})`).join('  ');
    const c = top(v => v.cn, v => v.cf), g = top(v => v.gn, v => v.gf);
    return `【${B}】継続が良い厩舎: ${c || '—'}\n乗替が良い厩舎: ${g || '—'}`;
  };
  // 乗替 vs 継続 の全体比較バー（乗り替わりなしの基準）
  const _chgF = pct(chgTot.f, chgTot.n), _contF = pct(contTot.f, contTot.n);
  const _sumDiff = +(_chgF - _contF).toFixed(1);
  const summaryBar = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
    <div class="jc-sum jc-sum--b"><div class="jc-sum-label">乗り替わり</div><div class="jc-sum-val">${_chgF}%<span class="jc-sum-sub">複勝・${chgTot.n.toLocaleString()}件</span></div></div>
    <div class="jc-sum jc-sum--g"><div class="jc-sum-label">継続（同騎手・乗替なし）</div><div class="jc-sum-val">${_contF}%<span class="jc-sum-sub">複勝・${contTot.n.toLocaleString()}件</span></div></div>
    <div class="jc-sum" style="min-width:120px"><div class="jc-sum-label">差（乗替−継続）</div><div style="font-size:16px;font-weight:800" class="${_sumDiff > 0 ? 'jc-hot' : _sumDiff < 0 ? 'jc-cold' : ''}">${_sumDiff > 0 ? '+' : ''}${_sumDiff}pt</div></div>
  </div>`;
  const cls = v => v >= 45 ? 'jc-hot' : v < 20 ? 'jc-cold' : '';
  const dcls = v => v > 0 ? 'jc-hot' : v < 0 ? 'jc-cold' : '';
  const wcls = v => v >= 25 ? 'jc-hot' : v < 8 ? 'jc-cold' : '';   // 勝率(1着率)用の色分け
  const pairTbl = arr => arr.map(r => `<tr>
    <td>${r.pk}</td><td style="text-align:right">${r.win}%</td>
    <td class="${cls(r.fuku)}" style="text-align:right;font-weight:800">${r.fuku}%</td>
    <td style="text-align:right;color:#94a3b8">${r.n}</td></tr>`).join('');
  const _minPair = tf ? 2 : (_isRange ? 15 : yf ? 8 : 20);
  const pairRows = Object.entries(pair).filter(([k, v]) => v.n >= _minPair)
    .map(([pk, v]) => ({ pk, n: v.n, fuku: pct(v.f, v.n), win: pct(v.w || 0, v.n) })).sort((a, b) => b.fuku - a.fuku);
  const _pairHead = '<thead><tr><th style="text-align:left">乗せ替え</th><th style="text-align:right">勝率</th><th style="text-align:right">複勝</th><th style="text-align:right">件数</th></tr></thead>';
  const _pairPanels = `
    <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="font-size:13px;font-weight:800;color:#16a34a;margin-bottom:4px">🔥 熱い乗替ペア（A→B・n≥${_minPair}・上位15）</div>
        <div class="table-wrapper"><table class="deban-table jc-tbl jc-tw-pair">
          ${_pairHead}
          <tbody>${pairTbl(pairRows.slice(0, 15)) || '<tr><td colspan="4" style="color:#9ca3af">該当なし</td></tr>'}</tbody></table></div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:4px">⚠️ 危険な乗替ペア（A→B・n≥${_minPair}・下位15）</div>
        <div class="table-wrapper"><table class="deban-table jc-tbl jc-tw-pair">
          ${_pairHead}
          <tbody>${pairTbl(pairRows.slice(-15).reverse()) || '<tr><td colspan="4" style="color:#9ca3af">該当なし</td></tr>'}</tbody></table></div>
      </div>
    </div>`;

  if (jf) {
    // ── 騎手別ビュー：この騎手の厩舎別成績（継続 vs 乗り替わり）──
    const jkm = jkTr[jf] || {};
    let jChgN = 0, jChgF = 0, jContN = 0, jContF = 0;
    Object.values(jkm).forEach(m => { jChgN += m.gn; jChgF += m.gf; jContN += m.cn; jContF += m.cf; });
    const jChg = pct(jChgF, jChgN), jCont = pct(jContF, jContN), jDiff = +(jChg - jCont).toFixed(1);
    const jSummary = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <div class="jc-sum jc-sum--b"><div class="jc-sum-label">この騎手へ乗り替わり</div><div class="jc-sum-val">${jChg}%<span class="jc-sum-sub">複勝・${jChgN.toLocaleString()}件</span></div></div>
      <div class="jc-sum jc-sum--g"><div class="jc-sum-label">継続（前走から続投）</div><div class="jc-sum-val">${jCont}%<span class="jc-sum-sub">複勝・${jContN.toLocaleString()}件</span></div></div>
      <div class="jc-sum" style="min-width:120px"><div class="jc-sum-label">差（乗替−継続）</div><div style="font-size:16px;font-weight:800" class="${jDiff > 0 ? 'jc-hot' : jDiff < 0 ? 'jc-cold' : ''}">${jDiff > 0 ? '+' : ''}${jDiff}pt</div></div>
    </div>`;
    const jRows = Object.keys(jfTr).map(tr => {
      const t = jfTr[tr], m = jkm[tr] || { cn: 0, cf: 0, gn: 0, gf: 0 };
      const chg = m.gn ? pct(m.gf, m.gn) : null, cont = m.cn ? pct(m.cf, m.cn) : null;
      return { tr, n: t.n, allF: pct(t.f, t.n), win: pct(t.w, t.n), chg, chgN: m.gn, cont, contN: m.cn, diff: (chg != null && cont != null) ? +(chg - cont).toFixed(1) : null };
    }).filter(r => r.n >= 3).sort((a, b) => b.n - a.n);
    const jTbl = jRows.map((r, i) => {
      const st = jfSrcTr[r.tr] || {};
      const srcs = Object.keys(st).filter(A => st[A].n >= 2).map(A => ({ A, n: st[A].n, fuku: pct(st[A].f, st[A].n), win: pct(st[A].w, st[A].n) })).sort((a, b) => b.fuku - a.fuku || b.n - a.n);
      const verdict = (r.chg != null && r.cont != null)
        ? (r.diff >= 5 ? `<b class="jc-hot">乗り替わり時に好走傾向</b>（乗替${r.chg}% ＞ 継続${r.cont}%）` : r.diff <= -5 ? `<b class="jc-cold">継続騎乗時に好走傾向</b>（継続${r.cont}% ＞ 乗替${r.chg}%）` : `ほぼ互角（乗替${r.chg}%・継続${r.cont}%）`)
        : (r.chg != null ? `乗替のみ ${r.chg}%（継続データなし）` : r.cont != null ? `継続のみ ${r.cont}%（乗替データなし）` : '—');
      const srcHtml = `<div class="jc-verdict">${r.tr}での判定：${verdict}</div>`
        + (srcs.length
          ? `<div style="font-size:11px;font-weight:800;color:#64748b;margin-bottom:4px">誰から ${jf} に乗り替わると良い／悪いか（複勝率の高い順・n≥2）</div>` + srcs.map(s => `<div class="jc-src-item"><span class="jc-src-pair">${s.A} → <b>${jf}</b></span><span class="jc-src-meta">勝率${s.win}%</span><span class="${cls(s.fuku)}" style="font-weight:800">複勝${s.fuku}%</span><span class="jc-src-meta">${s.n}件</span></div>`).join('')
          : '<div style="color:#9ca3af;font-size:11px">n≥2の乗せ替え元がありません（この厩舎はサンプル不足）</div>');
      return `<tr class="jc-jkrow" onclick="var d=document.getElementById('jcjf-${i}');if(d){d.classList.toggle('hidden');this.classList.toggle('jc-open')}">
        <td style="font-weight:700"><span class="jc-caret">▸</span>${r.tr}</td>
        <td class="${wcls(r.win)}" style="text-align:right">${r.win}%</td>
        <td class="${cls(r.allF)}" style="text-align:right;font-weight:800">${r.allF}%</td>
        <td class="${cls(r.chg)}" style="text-align:right">${r.chg != null ? r.chg + '%' : '—'}</td>
        <td class="${cls(r.cont)}" style="text-align:right">${r.cont != null ? r.cont + '%' : '—'}</td>
        <td class="${dcls(r.diff)}" style="text-align:right;font-weight:700">${r.diff != null ? (r.diff > 0 ? '+' : '') + r.diff : '—'}</td>
        <td style="text-align:right;color:#64748b">${r.n}<span style="color:#b0bccd">·${r.chgN || 0}·${r.contN || 0}</span></td></tr>
        <tr id="jcjf-${i}" class="hidden"><td colspan="7" class="jc-srccell">${srcHtml}</td></tr>`;
    }).join('');
    const _mp = _isRange ? 4 : yf ? 3 : 5;
    const jfPairRows = Object.entries(pair).filter(([pk, v]) => v.n >= _mp && pk.endsWith(' → ' + jf))
      .map(([pk, v]) => ({ pk: pk.split(' → ')[0] + ' → ' + jf, n: v.n, fuku: pct(v.f, v.n), win: pct(v.w || 0, v.n) })).sort((a, b) => b.fuku - a.fuku);
    const jfPairTbl = arr => arr.map(r => `<tr><td>${r.pk}</td><td style="text-align:right">${r.win}%</td><td class="${cls(r.fuku)}" style="text-align:right;font-weight:800">${r.fuku}%</td><td style="text-align:right;color:#94a3b8">${r.n}</td></tr>`).join('');
    const jfPairPanels = `<div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:12px">
      <div><div style="font-size:13px;font-weight:800;color:#16a34a;margin-bottom:4px">🔥 ${jf} への熱い乗せ替え元（全厩舎・n≥${_mp}・上位12）</div>
        <div class="table-wrapper"><table class="deban-table jc-tbl jc-tw-pair">${_pairHead}<tbody>${jfPairTbl(jfPairRows.slice(0, 12)) || '<tr><td colspan="4" style="color:#9ca3af">該当なし</td></tr>'}</tbody></table></div></div>
      <div><div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:4px">⚠️ ${jf} への危険な乗せ替え元（全厩舎・n≥${_mp}・下位12）</div>
        <div class="table-wrapper"><table class="deban-table jc-tbl jc-tw-pair">${_pairHead}<tbody>${jfPairTbl(jfPairRows.slice(-12).reverse()) || '<tr><td colspan="4" style="color:#9ca3af">該当なし</td></tr>'}</tbody></table></div></div>
    </div>`;
    const jTot = Object.values(jfTr).reduce((s, v) => s + v.n, 0);
    body.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">騎手「<b style="color:#0891b2">${jf}</b>」${yfLabel ? '・' + yfLabel : ''}：全騎乗(高知) ${jTot.toLocaleString()} 件・この騎手へ乗替 ${jChgN.toLocaleString()} 件・継続 ${jContN.toLocaleString()} 件</div>
      ${jSummary}
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
        <div style="flex:1;min-width:320px">
          <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:4px">🏇 ${jf} の厩舎別成績（騎乗数の多い順）</div>
          <div style="font-size:10.5px;color:#0891b2;margin-bottom:4px">▸ 厩舎をタップすると「継続 vs 乗り替わり」の判定＋乗せ替え元が開きます</div>
          <div class="table-wrapper" style="max-height:460px;overflow-y:auto"><table class="deban-table jc-tbl">
            <thead><tr><th style="text-align:left">厩舎</th><th style="text-align:right" title="この厩舎の馬に乗った時の勝率">勝率</th><th style="text-align:right">複勝</th><th style="text-align:right" title="別の騎手からこの騎手へ乗せ替えた時">乗替時</th><th style="text-align:right" title="前走から継続した時">継続時</th><th style="text-align:right" title="乗替−継続">差</th><th style="text-align:right" title="全体·乗替·継続">件数</th></tr></thead>
            <tbody>${jTbl || '<tr><td colspan="7" style="color:#9ca3af">この条件では騎乗データが不足しています</td></tr>'}</tbody>
          </table></div>
        </div>
        ${jfPairPanels}
      </div>
      <p style="font-size:10.5px;color:#9ca3af;margin-top:8px;line-height:1.6">※${jf}が各厩舎の馬に乗った時の成績。<b>乗替時</b>＝別の騎手からこの騎手へ替わった時、<b>継続時</b>＝前走から続けて乗った時。差が＋なら乗り替わり時、−なら継続騎乗時の好走率が高いという能力材料です。価格を含む購入判断ではありません。</p>`;
  } else if (tf) {
    // ── 厩舎ビュー：この厩舎の騎手別成績＋乗替パターン ──
    const mainJk = Object.entries(trJk).sort((a, b) => b[1].n - a[1].n)[0]?.[0];
    // 1件でもあれば表示（元の騎乗データ）。全体＋乗替時／継続時の内訳を出す。起用数順＝主戦が上。
    const _sn = n => `<span style="font-size:9px;color:#94a3b8;margin-left:3px">${n}</span>`;
    const jkRows = Object.entries(trJk).filter(([k, v]) => v.n >= 1)
      .map(([J, v]) => {
        const s = (jkTr[J] && jkTr[J][tf]) ? jkTr[J][tf] : { cn: 0, cf: 0, gn: 0, gf: 0 };
        return { J, n: v.n, allF: pct(v.f, v.n), win: pct(v.w || 0, v.n), chg: s.gn ? pct(s.gf, s.gn) : null, chgN: s.gn, cont: s.cn ? pct(s.cf, s.cn) : null, contN: s.cn };
      })
      .sort((a, b) => b.n - a.n);
    const jkTbl = jkRows.map((r, i) => {
      // この騎手への乗せ替え元の内訳（○○→この騎手・この厩舎内・複勝率順）
      const srcs = Object.entries(pair).filter(([pk, v]) => v.n >= 2 && pk.endsWith(' → ' + r.J))
        .map(([pk, v]) => ({ A: pk.split(' → ')[0], n: v.n, fuku: pct(v.f, v.n), win: pct(v.w || 0, v.n) }))
        .sort((a, b) => b.fuku - a.fuku || b.n - a.n);   // 複勝率の高い順＝上が良い/下が悪い（1件ノイズは除外）
      const srcHtml = srcs.length
        ? `<div style="font-size:11px;font-weight:800;color:#64748b;margin-bottom:4px">誰から ${r.J} に乗り替わると好走率が高い／低いか（複勝率順・n≥2）</div>`
          + srcs.map(s => `<div class="jc-src-item"><span class="jc-src-pair">${s.A} → <b>${r.J}</b></span><span class="jc-src-meta">勝率${s.win}%</span><span class="${cls(s.fuku)}" style="font-weight:800">複勝${s.fuku}%</span><span class="jc-src-meta">${s.n}件</span></div>`).join('')
        : '<div style="color:#9ca3af;font-size:11px">n≥2の乗せ替え元がありません（この厩舎はサンプル不足）</div>';
      return `<tr class="jc-jkrow" onclick="var d=document.getElementById('jcsrc-${i}');if(d){d.classList.toggle('hidden');this.classList.toggle('jc-open')}">
      <td style="font-weight:700"><span class="jc-caret">▸</span>${r.J}${r.J === mainJk ? ' <span style="font-size:9px;font-weight:800;background:#7c3aed;color:#fff;border-radius:3px;padding:0 4px">主戦</span>' : ''}</td>
      <td class="${wcls(r.win)}" style="text-align:right">${r.win}%</td>
      <td class="${cls(r.allF)}" style="text-align:right;font-weight:800">${r.allF}%</td>
      <td class="${cls(r.chg)}" style="text-align:right">${r.chg != null ? r.chg + '%' : '—'}</td>
      <td class="${cls(r.cont)}" style="text-align:right">${r.cont != null ? r.cont + '%' : '—'}</td>
      <td style="text-align:right;color:#64748b">${r.n}<span style="color:#b0bccd">·${r.chgN || 0}·${r.contN || 0}</span></td></tr>
      <tr id="jcsrc-${i}" class="hidden"><td colspan="6" class="jc-srccell">${srcHtml}</td></tr>`;
    }).join('');
    const trTot = Object.values(trJk).reduce((s, v) => s + v.n, 0);
    body.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">厩舎「<b style="color:#7c3aed">${tf}</b>」${yfLabel ? '・' + yfLabel : ''}：全騎乗 ${trTot.toLocaleString()} 件・乗替 ${chgTot.n.toLocaleString()} 件・継続 ${contTot.n.toLocaleString()} 件</div>
      ${summaryBar}
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
        <div style="flex:1;min-width:320px">
          <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:4px">👤 この厩舎の騎手別成績（起用数順／<span style="color:#7c3aed">主戦</span>＝最多起用）</div>
          <div style="font-size:10.5px;color:#0891b2;margin-bottom:4px">▸ 騎手をタップすると「誰からこの騎手に乗り替わった時が良いか」の内訳が開きます</div>
          <div class="table-wrapper" style="max-height:420px;overflow-y:auto">
            <table class="deban-table jc-tbl jc-tw-name">
              <thead><tr><th style="text-align:left">騎手</th><th style="text-align:right" title="この厩舎の馬に乗った時の勝率（1着率）">勝率</th><th style="text-align:right" title="この厩舎の馬に乗った時の複勝率">複勝</th><th style="text-align:right" title="この厩舎がこの騎手に乗せ替えた時の複勝率">乗替時</th><th style="text-align:right" title="この騎手が前走から継続した時の複勝率">継続時</th><th style="text-align:right" title="件数＝全体·乗替·継続の騎乗数">件数</th></tr></thead>
              <tbody>${jkTbl || '<tr><td colspan="6" style="color:#9ca3af">データ不足</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        ${_pairPanels}
      </div>
      <p style="font-size:10.5px;color:#9ca3af;margin-top:8px;line-height:1.6">※複勝／勝率＝この厩舎の馬にその騎手が乗った時（3着内率／1着率）。乗替時＝この厩舎が別の騎手からこの騎手へ乗せ替えた時、継続時＝同じ騎手が続けて乗った時。<b>騎手タップで乗せ替え元（誰→この騎手）ごとの成績</b>が見られます＝「前の騎手が悪かったのか、この騎手と合わないのか」の切り分けに。</p>`;
  } else {
    // ── 全厩舎ビュー：乗替先ランキング＋ペア ──
    const _minDest = _isRange ? 25 : yf ? 15 : 30;
    const destRows = Object.entries(byB).filter(([k, v]) => v.n >= _minDest)
      .map(([B, v]) => { const cont = sameB[B] ? pct(sameB[B].f, sameB[B].n) : null; const chg = pct(v.f, v.n); return { B, n: v.n, chg, win: pct(v.w || 0, v.n), cont, contN: sameB[B] ? sameB[B].n : 0, diff: cont != null ? +(chg - cont).toFixed(1) : null }; })
      .sort((a, b) => b.n - a.n);
    const _minSrcN = _isRange ? 3 : yf ? 2 : 3;
    const destTbl = destRows.map((r, i) => {
      // この騎手への乗せ替え元の内訳（○○→この騎手・全厩舎・複勝率順）
      const srcs = Object.entries(pair).filter(([pk, v]) => v.n >= _minSrcN && pk.endsWith(' → ' + r.B))
        .map(([pk, v]) => ({ A: pk.split(' → ')[0], n: v.n, fuku: pct(v.f, v.n), win: pct(v.w || 0, v.n) }))
        .sort((a, b) => b.fuku - a.fuku || b.n - a.n).slice(0, 20);
      const srcHtml = (srcs.length
        ? `<div style="font-size:11px;font-weight:800;color:#64748b;margin-bottom:4px">誰から ${r.B} に乗り替わると好走率が高い／低いか（n≥${_minSrcN}・複勝率順）</div>`
          + srcs.map(s => `<div class="jc-src-item"><span class="jc-src-pair">${s.A} → <b>${r.B}</b></span><span class="jc-src-meta">勝率${s.win}%</span><span class="${cls(s.fuku)}" style="font-weight:800">複勝${s.fuku}%</span><span class="jc-src-meta">${s.n}件</span></div>`).join('')
        : `<div style="color:#9ca3af;font-size:11px">n≥${_minSrcN}の乗せ替え元データがありません</div>`)
        + `<div class="jc-src-meta" style="margin-top:6px;white-space:pre-line">${jkTip(r.B)}</div>`;
      return `<tr class="jc-jkrow" onclick="var d=document.getElementById('jcdst-${i}');if(d){d.classList.toggle('hidden');this.classList.toggle('jc-open')}">
      <td style="font-weight:700"><span class="jc-caret">▸</span>${r.B}</td>
      <td class="${wcls(r.win)}" style="text-align:right">${r.win}%</td>
      <td class="${cls(r.chg)}" style="text-align:right;font-weight:800">${r.chg}%</td>
      <td class="${cls(r.cont)}" style="text-align:right">${r.cont != null ? r.cont + '%' : '—'}</td>
      <td class="${dcls(r.diff)}" style="text-align:right;font-weight:700">${r.diff != null ? (r.diff > 0 ? '+' : '') + r.diff : '—'}</td>
      <td style="text-align:right;color:#94a3b8">${r.n}/${r.contN}</td></tr>
      <tr id="jcdst-${i}" class="hidden"><td colspan="6" class="jc-srccell">${srcHtml}</td></tr>`;
    }).join('');
    body.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">対象：乗り替わり ${chgTot.n.toLocaleString()} 件／継続 ${contTot.n.toLocaleString()} 件（前走との比較）</div>
      ${summaryBar}
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
        <div style="flex:1;min-width:320px">
          <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:4px">🏇 乗替先ランキング（この騎手に乗せ替えた時・n≥${_minDest}・騎乗数の多い順）</div>
          <div style="font-size:10.5px;color:#0891b2;margin-bottom:4px">▸ 騎手をタップすると「誰からこの騎手に乗り替わった時が良いか」の内訳が開きます</div>
          <div class="table-wrapper" style="max-height:420px;overflow-y:auto">
            <table class="deban-table jc-tbl jc-tw-name">
              <thead><tr><th style="text-align:left">乗替先騎手</th><th style="text-align:right" title="この騎手に乗せ替えた時の勝率（1着率）">乗替勝率</th><th style="text-align:right">乗替複勝</th><th style="text-align:right">継続複勝</th><th style="text-align:right">差</th><th style="text-align:right" title="乗替件数/継続件数">件数</th></tr></thead>
              <tbody>${destTbl}</tbody>
            </table>
          </div>
        </div>
        ${_pairPanels}
      </div>
      <p style="font-size:10.5px;color:#9ca3af;margin-top:8px;line-height:1.6">※乗替複勝＝この騎手に乗せ替えた時／継続複勝＝この騎手が前走から継続した時（乗り替わりなし）／差＝乗替−継続（＋＝乗せ替えた方が良い＝勝負気配）。件数は「乗替/継続」。<b>騎手タップで乗せ替え元（誰→この騎手）の内訳と、継続/乗替が良い厩舎</b>が見られます。厩舎を選ぶとその厩舎の主戦・相性が見られます。</p>`;
  }
}

// ── 乗替/継続の集計マップ（出馬表の乗り替わり診断＆分析パネル共用・キャッシュ付き）──
// 返す：byB=乗替先別{n,f}／sameB=同騎手継続別{n,f}／pair=A→B別／jkTr=騎手×厩舎の継続/乗替。
function _buildJcMaps(yf, finalOnly) {
  const ck = `${yf || ''}|${finalOnly ? 'F' : ''}`;
  if (!window._jcMapsCache) window._jcMapsCache = {};
  if (window._jcMapsCache[ck]) return window._jcMapsCache[ck];
  const store = lsRead();
  const finalSet = new Set();
  for (const k of Object.keys(store)) { if (!k.startsWith('race_31_')) continue; const r = store[k]; if (/ファイナル/.test(r.race_name || '')) finalSet.add(`${r.race_date}_${parseInt(r.race_no)}`); }
  const inYear = d => !yf || String(d).slice(0, 4) === yf;
  const runs = {};
  for (const k of Object.keys(store)) {
    const p = k.split('_'); if (p.length !== 4 || p[0] !== '31') continue;
    const v = store[k]; if (!v || v.type !== 'horse') continue;
    const ch = parseInt(v.chakujun); if (isNaN(ch)) continue;
    const jk = (v.jockey || '').trim(); if (!jk) continue;
    (runs[v.horseName] = runs[v.horseName] || []).push({ d: p[1], rno: parseInt(p[2]), jk, ch, tr: (v.trainer || '').trim(), fin: finalSet.has(`${p[1]}_${parseInt(p[2])}`) });
  }
  for (const n of Object.keys(runs)) runs[n].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.rno - b.rno);
  const byB = {}, sameB = {}, pair = {}, jkTr = {};
  for (const n of Object.keys(runs)) { const rs = runs[n];
    for (let i = 1; i < rs.length; i++) {
      const A = rs[i - 1].jk, B = rs[i].jk; if (!A || !B) continue;
      if (!inYear(rs[i].d)) continue; if (finalOnly && !rs[i].fin) continue;
      const tr = rs[i].tr, hit = rs[i].ch <= 3;
      if (tr) { (jkTr[B] = jkTr[B] || {}); (jkTr[B][tr] = jkTr[B][tr] || { cn: 0, cf: 0, gn: 0, gf: 0 }); if (A === B) { jkTr[B][tr].cn++; if (hit) jkTr[B][tr].cf++; } else { jkTr[B][tr].gn++; if (hit) jkTr[B][tr].gf++; } }
      if (A === B) { (sameB[B] = sameB[B] || { n: 0, f: 0 }); sameB[B].n++; if (hit) sameB[B].f++; }
      else { (byB[B] = byB[B] || { n: 0, f: 0 }); byB[B].n++; if (hit) byB[B].f++; const pk = A + ' → ' + B; (pair[pk] = pair[pk] || { n: 0, f: 0 }); pair[pk].n++; if (hit) pair[pk].f++; }
    }
  }
  const res = { byB, sameB, pair, jkTr };
  window._jcMapsCache[ck] = res;
  return res;
}

// ── 🔄 乗り替わり診断（出馬表/予想パネル用）：各馬の前走→今走騎手の乗替/継続実績を表示 ──
// ファイナルレースならファイナル実績で判定（データ薄いjockeyは全レース実績にフォールバック）。
function buildJockeyChangeDiag(raceNo) {
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) return '';
  const { raceInfo, horses } = data;
  const isFinal = /ファイナル/.test(raceInfo.raceName || raceInfo.race_name || '');
  const allMaps = _buildJcMaps('', false);
  const finMaps = isFinal ? _buildJcMaps('', true) : null;
  const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : null;
  // ファイナル優先（n>=8）→薄ければ全レース。{f,n,src}を返す
  const pick = (fMap, aMap, key) => { const fv = finMaps && fMap[key]; if (fv && fv.n >= 8) return { f: pct(fv.f, fv.n), n: fv.n, src: 'F' }; const av = aMap[key]; return av ? { f: pct(av.f, av.n), n: av.n, src: 'A' } : null; };
  const _wk = h => Math.min(Math.max(parseInt(h.wakuBan) || Math.ceil((parseInt(h.umaBan) || 1) / 2), 1), 8);
  const WBG = w => ({ 1: '#fff', 2: '#111', 3: '#c00', 4: '#1a5ab8', 5: '#e8c800', 6: '#18a020', 7: '#f05a00', 8: '#c080c8' })[w] || '#888';
  const WFG = w => [1, 5, 8].includes(w) ? '#222' : '#fff';
  const cls = v => v == null ? '' : v >= 45 ? 'jc-hot' : v < 18 ? 'jc-cold' : '';

  let anyChange = false;
  const rows = horses.map(h => {
    const nowJk = (h.jockey || '').trim(); if (!nowJk) return null;
    const tr = (h.trainer || '').trim();
    const hist = getHorseHistoryBefore(h.horseName, raceInfo.raceDate, raceNo).filter(x => x.babaCode === '31');
    const prevJk = hist.length ? (hist[0].jockey || '').trim() : '';
    const waku = _wk(h);
    const nameCell = `<span style="background:${WBG(waku)};color:${WFG(waku)};${waku===1?'border:1px solid #bbb;':''}min-width:18px;height:18px;border-radius:3px;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${h.umaBan}</span> <b>${escapeHTML(h.horseName)}</b>`;
    if (!prevJk) return { kind: 'debut', nameCell };
    if (prevJk === nowJk) {
      const c = pick(finMaps ? finMaps.sameB : {}, allMaps.sameB, nowJk);
      return { kind: 'cont', nameCell, jk: nowJk, stat: c, verdict: c && c.f >= 50 ? 'good' : c && c.f < 18 ? 'bad' : 'mid' };
    }
    anyChange = true;
    const dst = pick(finMaps ? finMaps.byB : {}, allMaps.byB, nowJk);
    const pr = pick(finMaps ? finMaps.pair : {}, allMaps.pair, prevJk + ' → ' + nowJk);
    const cont = pick(finMaps ? finMaps.sameB : {}, allMaps.sameB, nowJk);
    const trS = allMaps.jkTr[nowJk] && allMaps.jkTr[nowJk][tr];
    const trF = trS && trS.gn >= 5 ? pct(trS.gf, trS.gn) : null;
    const primary = (pr && pr.n >= 5) ? pr : dst;   // A→Bペアが5件+あればそれ、なければ乗替先全体
    const pf = primary ? primary.f : null;
    const verdict = pf == null ? 'mid' : pf >= 45 ? 'good' : pf < 18 ? 'bad' : 'mid';
    return { kind: 'change', nameCell, prevJk, nowJk, dst, pr, cont, trF, primary, verdict };
  }).filter(Boolean);

  const vbadge = v => v === 'good' ? '<span style="color:#16a34a;font-weight:800">🔥買い</span>' : v === 'bad' ? '<span style="color:#dc2626;font-weight:800">⚠️危険</span>' : '<span style="color:#94a3b8">⚪標準</span>';
  const statTxt = s => s ? `<span class="${cls(s.f)}" style="font-weight:800">${s.f}%</span><span style="font-size:9px;color:#94a3b8">(${s.n}${s.src === 'F' ? 'F' : ''})</span>` : '—';

  const tbody = rows.map(r => {
    if (r.kind === 'debut') return `<tr><td style="text-align:left">${r.nameCell}</td><td style="text-align:left;color:#9ca3af">高知初騎乗/履歴なし</td><td style="text-align:left">—</td><td style="text-align:center">—</td></tr>`;
    if (r.kind === 'cont') return `<tr><td style="text-align:left">${r.nameCell}</td><td style="text-align:left"><span style="font-size:10px;color:#64748b">継続</span> ${escapeHTML(r.jk)}</td><td style="text-align:left">継続 ${statTxt(r.stat)}</td><td style="text-align:center">${vbadge(r.verdict)}</td></tr>`;
    const detail = `乗替時 ${statTxt(r.dst)}${r.pr && r.pr.n >= 5 ? ` ｜ この乗替 ${statTxt(r.pr)}` : ''}${r.trF != null ? ` ｜ 厩舎 <span class="${cls(r.trF)}" style="font-weight:700">${r.trF}%</span>` : ''}${r.cont ? ` ｜ 継続なら ${r.cont.f}%` : ''}`;
    return `<tr><td style="text-align:left">${r.nameCell}</td><td style="text-align:left"><span style="font-size:10px;color:#dc2626;font-weight:700">乗替</span> ${escapeHTML(r.prevJk)}<span style="color:#94a3b8">→</span>${escapeHTML(r.nowJk)}</td><td style="text-align:left;font-size:11px">${detail}</td><td style="text-align:center">${vbadge(r.verdict)}</td></tr>`;
  }).join('');

  return `
    <details class="pf-details">
      <summary class="pf-summary">🔄 乗り替わり診断<span class="pf-sm-tag" style="background:${isFinal ? '#ede9fe' : '#f1f5f9'};color:${isFinal ? '#6d28d9' : '#475569'}">${isFinal ? 'ファイナル実績' : '全レース実績'}</span></summary>
      <div class="pf-body">
        <div class="pf-hint">前走→今走の騎手を照合。乗替時＝乗替先の複勝率／この乗替＝A→Bペア(5件+)／厩舎＝この厩舎がこの騎手に乗替時。判定は複勝45%+で🔥・18%未満で⚠️。${isFinal ? '<b style="color:#6d28d9">ファイナルの実績で判定（薄い騎手は全レース＝(n)にFなし）</b>' : ''}</div>
        <div class="table-wrapper"><table class="deban-table" style="font-size:12px">
          <thead><tr><th style="text-align:left">馬</th><th style="text-align:left">騎手（前走→今走）</th><th style="text-align:left">実績</th><th style="text-align:center">判定</th></tr></thead>
          <tbody>${tbody}</tbody>
        </table></div>
      </div>
    </details>`;
}

function getSavedRacePace(key){const d=lsRead()[key];if(!d)return null;return{first3f:d.first3f||'',first3fSource:d.first3fSource||d.first3f_source||'',agari4f:d.agari4f||'',agari3f_race:d.agari3f_race||'',paceType:d.paceType||d.pace_type||'',memo:d.memo||''};}
function getSavedHorsePace(key){const d=lsRead()[key];if(!d)return null;return{first3f:d.first3f||'',paceType:d.paceType||d.pace_type||'',mukaeShoumen:d.mukaeShoumen||d.mukae_shoumen||'',shoumenStraight:d.shoumenStraight||d.shoumen_straight||''};}

// ── 保存済みリスト：全件グループ構築（共通データソース） ──
let _savedGroups = [];  // [{date,baba,races,ym}] 新→古順

function buildSavedGroups() {
  if (!_savedGroupsDirty) return;
  _savedGroupsDirty = false;
  // 通常は開催日索引からレース行だけを列挙する（全馬15万件のObject.entriesを避ける）。
  let entries = [];
  if (_raceDayIndex) {
    for (const day of _raceDayIndex.values()) {
      for (const entry of day.values()) {
        if (entry.raceVal) entries.push([entry.raceKey, entry.raceVal]);
      }
    }
  } else {
    entries = Object.entries(lsRead()).filter(([k,v]) => v.type === 'race' || k.startsWith('race_'));
  }
  const groupMap = {};
  entries.forEach(([key,data]) => {
    // 表示は前後半差paceType優先。first3f欠損で空なら基準比paceTypeAuto(前半区間フォールバック)で補完
    const pt = data.paceType || data.pace_type || data.paceTypeAuto || '';
    const gk = `${data.race_date}_${data.baba_code}`;
    if (!groupMap[gk]) groupMap[gk] = {date:data.race_date, baba:data.baba_code, races:[]};
    groupMap[gk].races.push({key, data:{...data, paceType:pt}});
  });
  _savedGroups = Object.values(groupMap)
    // 日付降順（新しい順）でソート
    .sort((a,b) => {
      const da = (a.date||'').replace(/\//g,'-');
      const db = (b.date||'').replace(/\//g,'-');
      return db.localeCompare(da);
    })
    .map(g => {
      // ym: "2026/05" 形式
      const ym = (g.date || '').slice(0, 7);
      return {...g, ym};
    });
}

function loadSavedData() {
  // 保存データページは管理者が開いた時にswitchPage側で描画する。
  // 起動時には開催日グループ自体も組み立てず、必要になった時だけ作る。
  if (typeof _currentPage === 'string' && _currentPage === 'saved') {
    buildSavedGroups();
    renderSavedList();
  }
}

// 年月折りたたみ開閉状態（key=ym, value=bool open）
const _savedMonthOpen = {};

function renderSavedList() {
  buildSavedGroups();
  const list = document.getElementById('saved-list'); if (!list) return;
  const badge = document.getElementById('saved-total-badge');
  const q = (document.getElementById('saved-search')?.value || '').trim().toLowerCase();
  const babaFilter = document.getElementById('saved-baba-filter')?.value || '';

  // 検索フィルタ
  const filtered = _savedGroups.filter(g => {
    if (babaFilter && g.baba !== babaFilter) return false;
    if (!q) return true;
    const babaName = getBabaName(g.baba).toLowerCase();
    return g.date.toLowerCase().includes(q) || babaName.includes(q) || g.baba.includes(q);
  });

  if (badge) badge.textContent = `${filtered.length} 日分`;

  if (!filtered.length) {
    list.innerHTML = q
      ? '<p class="no-data">「' + q + '」に一致するデータがありません</p>'
      : '<p class="no-data">保存済みデータはありません</p>';
    return;
  }

  // 年月ごとにグループ化
  const byYm = {};
  filtered.forEach(g => {
    if (!byYm[g.ym]) byYm[g.ym] = [];
    byYm[g.ym].push(g);
  });
  const ymKeys = Object.keys(byYm).sort((a,b) => b.localeCompare(a));

  // 初回は最新月だけ開く
  ymKeys.forEach(ym => {
    if (_savedMonthOpen[ym] === undefined) _savedMonthOpen[ym] = (ym === ymKeys[0]);
  });

  list.innerHTML = ymKeys.map(ym => {
    const isOpen = _savedMonthOpen[ym];
    const items = byYm[ym];
    const ymLabel = ym ? ym.replace('/','-') + '月' : '（不明）';
    const itemsHtml = items.map(g => buildSavedGroupHtml(g)).join('');
    return `<div class="saved-month-group" data-ym="${ym}">
      <button class="saved-month-header" onclick="toggleSavedMonth('${ym}')">
        <span class="saved-month-label"><i class="fas fa-calendar-alt"></i> ${ymLabel}</span>
        <span class="saved-month-count">${items.length}日分</span>
        <i class="fas fa-chevron-${isOpen?'up':'down'} saved-month-chevron"></i>
      </button>
      <div class="saved-month-body" ${isOpen?'':'style="display:none"'}>${itemsHtml}</div>
    </div>`;
  }).join('');
}

function _biasBadgeHtml(bias) {
  if (bias === null || bias === undefined) {
    return `<span style="font-size:11px;color:#9ca3af;background:#f3f4f6;padding:2px 7px;border-radius:10px;white-space:nowrap;font-weight:600">馬場差—</span>`;
  }
  const sign = bias < 0 ? '−' : '+';
  const abs  = Math.abs(bias).toFixed(2);
  const [col, bg] = bias < -0.05 ? ['#1d4ed8','#dbeafe'] : bias > 0.05 ? ['#dc2626','#fee2e2'] : ['#059669','#d1fae5'];
  return `<span style="font-size:11px;font-weight:700;color:${col};background:${bg};padding:2px 7px;border-radius:10px;white-space:nowrap">${sign}${abs}秒</span>`;
}

function buildSavedGroupHtml(g) {
  const tags = g.races
    .sort((a,b) => (a.data.race_no||0) - (b.data.race_no||0))
    .map(({data}) => {
      const pt = data.paceType || '';
      const pc = pt==='ハイ'?'high':pt==='ミドル'?'mid':pt==='スロー'?'slow':'none';
      const tip = `${data.race_name||''} ${data.first3f?'前半3F:'+data.first3f+'秒':''}`.trim();
      return `<span class="saved-race-tag pace-tag-${pc}" title="${tip}">${data.race_no}R${pt?'('+pt+')':''}</span>`;
    }).join('');
  const isS = g.races.some(r => r.data._apiSaved);
  const sb = `<span class="save-source-badge ${isS?'badge-server':'badge-local'}">${isS?'☁ サーバー':'💾 ローカル'}</span>`;
  const bias = getDayBiasForDate(g.baba, g.date);
  const biasBadge = _biasBadgeHtml(bias);
  return `<div class="saved-item saved-item-group">
    <div class="saved-item-header">
      <span class="saved-item-date">${g.date}</span>
      <span class="saved-item-baba">${getBabaName(g.baba)}</span>
      ${sb}
      ${biasBadge}
      <div class="saved-item-actions">
        <button class="saved-action-btn btn-restore" onclick="restoreFromSaved('${g.date}','${g.baba}')" title="保存済みから出走表を即時復元（通信なし）"><i class="fas fa-table"></i> 出走表</button>
        <button class="saved-action-btn btn-analyze" onclick="restoreSavedDay('${g.date}','${g.baba}')" title="保存済みデータで分析"><i class="fas fa-chart-bar"></i> 分析</button>
        <button class="saved-action-btn btn-reload" onclick="loadSavedDay('${g.date}','${g.baba}')" title="keiba.go.jpから再取得"><i class="fas fa-sync-alt"></i> 再取得</button>
        <button class="delete-btn" onclick="deleteSavedDay(event,'${g.date}','${g.baba}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    <div class="saved-race-tags">${tags}</div>
  </div>`;
}

/** daySettings: memo を Supabase 同期対象として管理 */
function getDaySettings(baba, date) {
  const lsData = lsRead();
  const ns = lsData[`daySettings_${baba}_${date}`];
  if (ns) return { memo: ns.memo || '' };
  // 旧形式 dayMemo_ から後方互換読み込み
  const old = lsData[`dayMemo_${baba}_${date}`];
  const memo = old ? (typeof old === 'object' ? old.val : old) || '' : '';
  return { memo };
}

function saveDaySettings(baba, date, { memo } = {}) {
  const cur = getDaySettings(baba, date);
  const next = { type: 'daySettings', memo: memo !== undefined ? memo : cur.memo };
  lsWrite(`daySettings_${baba}_${date}`, next);
  apiUpsert('keiba_day_settings', `${baba}_${date}`, {
    baba_code: baba, race_date: date, memo: next.memo,
  }).catch(() => {});
  renderTrackTrend();
}

// ── 🧠 学習重み（条件付きロジット）のライブ配布 ─────────────────
// 精度検証の5分割CVで二段基準（◎複勝4/5＋1着平均≧現行、ペア整合率4/5＋○▲複勝悪化なし）を
// 両方クリアしたときだけ、全データで学習した「実効倍率」（base係数=1に正規化した各補正の掛け率）を保存。
// レース内順位は Σ(w/sd)×x と同値なので、この形なら現行と同じスコア目盛りを保てる
// （信頼度バッジの閾値2.5/6や💰妙味帯の定義がそのまま使える）。
// 読み込み優先順：①ローカル再学習（管理者の精度検証で自動保存）→ ②daySettingsセンチネル行
// （keiba_day_settingsテーブル作成後に自動同期される将来経路）→ ③出荷時定数（デプロイで閲覧者に配布）。
// 【2026-07-05 採用】データ3,002R到達で精度検証を最終判定。二段目（📐印全体）が頑健に合格
// （○複勝55.4→57.4・勝ち馬捕捉66.5→68.6が5/5fold・ペア整合率4/5）、◎も平均改善（複勝71.0→71.8・
// 1着38.5→39.2）。V3・馬アンカーSIと同じ「一段目3/5＋二段目クリア」基準で採用。全データ学習の
// 実効倍率（base係数=1正規化）を転記。撤去は null に戻すだけ（従来の等倍和＝V3手動倍率に復帰）。
const KV_ML_WEIGHTS_DEFAULT = {
  fullAdopt: true, races: 3862, trainedAt: '2026-07-05',
  eff: { condNew: 0.107, distNew: 0.339, rotN: 1.219, clsN: 2.174, cornN: 1.671, trendN: 0.979,
    weightN: 2.129, agariN: 2.819, comboN: 5.269, marginN: 1.925, winStrN: 1.354,
    jockeyChgN: 0.239, takiN: 0.147, cornConsistN: -0.877 },
  tiers: { c1: 3.19, c2: 7.8, fukuTight: 60, fukuMid: 73, fukuStrong: 82.9, n: 3462 }
};
// 係数だけでなく「どこから読み込んだか」も同時に解決する。従来のgetMlLiveWeights()は
// payloadだけを返す互換APIとして残す。端末IDBの上書きが他端末との差を静かに生むため、
// 予想スナップショットとAI成績キャッシュでは必ずこのprovenanceも保存する。
function resolveMlLiveWeightsWithProvenance() {
  try {
    const ls = lsRead();
    const candidates = [
      { rec: ls['ml_weights_31'], source: 'device_override', sourceKey: 'ml_weights_31' },
      { rec: ls['daySettings_31_ml-weights'], source: 'server_sentinel', sourceKey: 'daySettings_31_ml-weights' },
    ];
    for (const c of candidates) {
      const rec = c.rec;
      if (!rec || !rec.memo) continue;
      const p = JSON.parse(rec.memo);
      if (p && p.fullAdopt && p.eff) return { payload: p, source: c.source, sourceKey: c.sourceKey };
    }
  } catch(e) { _kvSwallow('resolveMlLiveWeightsWithProvenance', e); }
  return { payload: KV_ML_WEIGHTS_DEFAULT, source: 'shipped_default', sourceKey: null };
}
function getMlLiveWeights() {
  return resolveMlLiveWeightsWithProvenance().payload;
}
function saveMlLiveWeights(payload) {
  const memo = JSON.stringify(payload);
  lsWrite('ml_weights_31', { type: 'mlWeights', memo });
  // keiba_day_settingsテーブルは現状Supabaseに未作成（upsertは無害に失敗）。作成すれば閲覧者へ自動配布になる。
  apiUpsert('keiba_day_settings', '31_ml-weights', { baba_code: '31', race_date: 'ml-weights', memo }).catch(() => {});
}

// ══════════════ ランキングモデルの版管理・前向き予想台帳（2026-07-17）══════════════
// 予想順位そのものは変更しない。現行totalScoreの「実際に解決された実効倍率」と計算契約を
// 決定論的fingerprintにし、モデル変更後の成績キャッシュ混在と事後再計算だけの評価を防ぐ。
const KV_RANKING_SCORE_CONTRACT_VERSION = 'totalScore-v1-20260713';
const KV_RANKING_FEATURE_PIPELINE_VERSION = 'kochi-live-features-v2-asof-20260719';
const KV_RANKING_MODEL_FAMILY = 'market-free-additive';
const KV_RANKING_EFF_KEYS = [
  'condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN',
  'marginN','winStrN','jockeyChgN','takiN','cornConsistN','rakuN','paceCtxN'
];
const AI_PREDICTION_SNAPSHOT_SCHEMA = 'ai_prediction_snapshot/v1';

function _aiStableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_aiStableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _aiStableStringify(v[k])).join(',') + '}';
}
// 同期キー生成用のFNV-1a 64bit。暗号用途ではなく、同一計算契約の識別用。
function _aiFingerprint(v) {
  const text = typeof v === 'string' ? v : _aiStableStringify(v);
  try {
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < text.length; i++) {
      h ^= BigInt(text.charCodeAt(i));
      h = BigInt.asUintN(64, h * 0x100000001b3n);
    }
    return h.toString(16).padStart(16, '0');
  } catch (e) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}
function buildRankingModelIdentity() {
  const resolved = resolveMlLiveWeightsWithProvenance();
  const p = resolved.payload || KV_ML_WEIGHTS_DEFAULT;
  const materializedEff = {};
  KV_RANKING_EFF_KEYS.forEach(k => {
    const raw = p.eff && p.eff[k] != null ? p.eff[k]
      : (typeof YOSO_FACTOR_SCALE !== 'undefined' && YOSO_FACTOR_SCALE[k] != null ? YOSO_FACTOR_SCALE[k] : 1);
    materializedEff[k] = Number(raw);
  });
  const contract = {
    family: KV_RANKING_MODEL_FAMILY,
    scoreContractVersion: KV_RANKING_SCORE_CONTRACT_VERSION,
    featurePipelineVersion: KV_RANKING_FEATURE_PIPELINE_VERSION,
    baseCoefficient: 1,
    relativeSI: '(baseScore-raceMean)*0.05',
    paceCornScaling: 'cornMod*paceFactor before relSI',
    jockeyChangePolicy: typeof KV_JOCKEY_CHANGE_POLICY === 'string' ? KV_JOCKEY_CHANGE_POLICY : 'disabled-until-asof-retrained',
    rounding: 'score-to-2dp after base sum, pace scaling and relSI',
    missingEffFallback: 'YOSO_FACTOR_SCALE then 1',
    sort: 'totalScore-desc; stable source order on exact tie',
    eff: materializedEff,
  };
  return {
    version: `ranking_${String(p.trainedAt || 'unknown').replace(/[^0-9A-Za-z]/g, '')}`,
    fingerprint: _aiFingerprint(contract),
    fingerprintAlgorithm: 'fnv1a64-utf16',
    family: contract.family,
    scoreContractVersion: contract.scoreContractVersion,
    featurePipelineVersion: contract.featurePipelineVersion,
    trainedAt: p.trainedAt || null,
    races: Number.isFinite(Number(p.races)) ? Number(p.races) : null,
    source: resolved.source,
    sourceKey: resolved.sourceKey,
    contract,
  };
}

function _aiPredictionTimeMeta(raceDate, raceNo, babaCode) {
  const today = (typeof _kvTodayYmd === 'function') ? _kvTodayYmd() : '';
  if (!raceDate || (today && raceDate < today)) return null;
  const hhmm = (typeof _kvGetRaceTime === 'function') ? _kvGetRaceTime(raceDate, raceNo, babaCode) : '';
  const post = hhmm && typeof _kvPostDate === 'function' ? _kvPostDate(raceDate, hhmm) : null;
  if (post && post.getTime() <= Date.now()) return null; // 発走後は「予想時点」として保存しない
  return {
    scheduledStartAt: post ? post.toISOString() : null,
    minutesBeforeStart: post ? +((post.getTime() - Date.now()) / 60000).toFixed(2) : null,
    timing: post ? 'verified_prestart' : 'unverified_prestart',
  };
}

// 現行ランキングの発走前receipt。過去再計算はここへ入れない。
function recordForwardRankingSnapshot(raceNo, computed) {
  try {
    if (typeof isAdminMode !== 'function' || !isAdminMode()) return { saved: false, reason: 'NOT_ADMIN' };
    const data = allRacesData[raceNo];
    if (!data || !data.raceInfo || !Array.isArray(data.horses)) return { saved: false, reason: 'NO_RACE' };
    const baba = String(data.raceInfo.babaCode || currentBaba || '31');
    const raceDate = data.raceInfo.raceDate || currentDate || '';
    if (baba !== '31' || currentDate !== raceDate) return { saved: false, reason: 'NOT_CURRENT_KOCHI' };
    const hasLoadedResult = data.horses.some(h => /^\d+$/.test(String(h.chakujun || '')));
    const hp = `${baba}_${raceDate}_${parseInt(raceNo)}_`;
    const hasSavedResult = Object.entries(lsRead()).some(([k, v]) => k.startsWith(hp) && v && v.type === 'horse' && /^\d+$/.test(String(v.chakujun || '')));
    if (hasLoadedResult || hasSavedResult) return { saved: false, reason: 'HAS_RESULT' };
    const tm = _aiPredictionTimeMeta(raceDate, raceNo);
    if (!tm) return { saved: false, reason: 'NOT_PRESTART' };
    const scored = computed && computed.scored;
    if (!Array.isArray(scored) || scored.length < 4) return { saved: false, reason: 'TOO_FEW_RUNNERS' };

    const model = buildRankingModelIdentity();
    const marks = ['◎','○','▲','△','×','×'];
    const runners = scored.map((s, idx) => ({
      u: parseInt(s.horse && s.horse.umaBan) || null,
      rank: s.totalScore == null ? null : idx + 1,
      mark: s.totalScore == null ? '' : (marks[idx] || ''),
      totalScore: s.totalScore == null ? null : Number(s.totalScore),
      x: [s.baseScore,s.condMod,s.distMod,s.rotMod,s.classMod,s._cornModRaw,s.cornMod,s.trendMod,
        s.weightMod,s.agariMod,s.comboMod,s.marginMod,s.winStrMod,s.jockeyChgMod,s.takiMod,
        s.cornConsistMod,s.rakuMod,s.paceCtxMod,s.relSIMod]
        .map(v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null),
    }));
    const runnerSetFingerprint = _aiFingerprint(runners.map(r => r.u).slice().sort((a,b) => (a||0)-(b||0)));
    const inputFingerprint = _aiFingerprint({ runnerSetFingerprint, runners });
    const dateKey = raceDate.replace(/\D/g, '');
    const key = `aiPred_v1|${baba}|${dateKey}|${String(parseInt(raceNo)).padStart(2,'0')}|${model.fingerprint}|${inputFingerprint}`;
    if (lsRead()[key]) return { saved: false, reason: 'DUPLICATE', key };

    const registryKey = `aiModelRegistry_v1|${model.fingerprint}`;
    if (!lsRead()[registryKey]) {
      lsWrite(registryKey, { type: 'aiModelRegistry', schemaVersion: 1, savedAt: new Date().toISOString(), model });
    }
    lsWrite(key, {
      type: 'aiPredictionSnapshot', schema: AI_PREDICTION_SNAPSHOT_SCHEMA, capturePolicy: 'distinct-input-prestart',
      babaCode: baba, raceDate, raceNo: parseInt(raceNo), capturedAt: new Date().toISOString(),
      scheduledStartAt: tm.scheduledStartAt, minutesBeforeStart: tm.minutesBeforeStart, timing: tm.timing,
      model: { version: model.version, fingerprint: model.fingerprint, source: model.source, sourceKey: model.sourceKey },
      runnerSetFingerprint, inputFingerprint, completeScores: runners.every(r => r.totalScore != null), runners,
    });
    return { saved: true, key };
  } catch (e) {
    console.warn('[aiPredictionSnapshot]', e);
    return { saved: false, reason: 'WRITE_ERROR' };
  }
}
function listForwardRankingSnapshots() {
  return Object.entries(lsRead()).filter(([,v]) => v && v.type === 'aiPredictionSnapshot')
    .map(([key,v]) => ({ key, ...v })).sort((a,b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
}

var KV_OPPONENT_SHADOW_DEFAULT = true;
try {
  if (typeof window.KV_OPPONENT_SHADOW_ENABLED !== 'boolean') {
    window.KV_OPPONENT_SHADOW_ENABLED = KV_OPPONENT_SHADOW_DEFAULT;
  }
} catch (e) { _kvSwallow('listForwardRankingSnapshots', e); }
const OPPONENT_SHADOW_RESULT_SCHEMA = 'opponent_shadow_result/v1';
const OPPONENT_SHADOW_SNAPSHOT_SCHEMA = 'opponent_shadow_snapshot/v1';
const _opponentShadowModels = new Map();
const _opponentShadowResultCache = new Map();
let _activeOpponentShadowModelId = null;

function opponentShadowEnabled() {
  try {
    return window.KV_OPPONENT_SHADOW_ENABLED === true &&
      typeof isAdminMode === 'function' && isAdminMode();
  } catch (e) { return false; }
}

function registerOpponentShadowModel(descriptor, predictor) {
  if (!descriptor || typeof descriptor !== 'object' || !descriptor.id || !descriptor.version) {
    throw new Error('opponent shadow descriptor requires id and version');
  }
  if (typeof predictor !== 'function') throw new Error('opponent shadow predictor must be a function');
  const id = String(descriptor.id);
  const contract = {
    id,
    version: String(descriptor.version),
    family: String(descriptor.family || 'opponent-ranking-shadow'),
    target: String(descriptor.target || 'anchor-conditioned-top3'),
    featurePipelineVersion: String(descriptor.featurePipelineVersion || 'unspecified'),
    marketInputs: Array.isArray(descriptor.marketInputs) ? descriptor.marketInputs.map(String).sort() : [],
    config: descriptor.config && typeof descriptor.config === 'object'
      ? JSON.parse(JSON.stringify(descriptor.config)) : {},
  };
  const model = { ...contract, fingerprint: _aiFingerprint(contract), status: 'shadow_unadopted' };
  _opponentShadowModels.set(id, { model, predictor });
  for (const k of _opponentShadowResultCache.keys()) if (k.startsWith(model.fingerprint + '|')) _opponentShadowResultCache.delete(k);
  if (descriptor.activate === true) _activeOpponentShadowModelId = id;
  return model;
}
function activateOpponentShadowModel(id) {
  const key = String(id || '');
  if (!_opponentShadowModels.has(key)) return false;
  _activeOpponentShadowModelId = key;
  return true;
}
function clearOpponentShadowModels() {
  _opponentShadowModels.clear();
  _opponentShadowResultCache.clear();
  _activeOpponentShadowModelId = null;
}
function getActiveOpponentShadowModel() {
  return _activeOpponentShadowModelId ? (_opponentShadowModels.get(_activeOpponentShadowModelId) || null) : null;
}

function _opponentShadowInput(raceNo, scored, options) {
  const data = allRacesData[raceNo];
  if (!data || !data.raceInfo || !Array.isArray(scored)) return null;
  const includeVnext = !!(options && options.includeVnext);
  const runners = scored.map((s, idx) => ({
    u: parseInt(s.horse && s.horse.umaBan) || null,
    name: String((s.horse && s.horse.horseName) || ''),
    currentRank: s.totalScore == null ? null : idx + 1,
    totalScore: s.totalScore == null ? null : Number(s.totalScore),
    odds: Number.isFinite(Number(s.horse && s.horse.odds)) && Number(s.horse.odds) > 0 ? Number(s.horse.odds) : null,
    ninki: Number.isFinite(Number(s.horse && s.horse.ninki)) && Number(s.horse.ninki) > 0 ? Number(s.horse.ninki) : null,
    aiProb: s.aiProb == null || !Number.isFinite(Number(s.aiProb)) ? null : Number(s.aiProb),
    marketProb: s.marketProb == null || !Number.isFinite(Number(s.marketProb)) ? null : Number(s.marketProb),
    isTransfer: s.isTransfer === true,
    isEstimatedScore: s.isEstimatedScore === true,
    vnextRaw: includeVnext && typeof window.kvVnextRawForScored === 'function'
      ? window.kvVnextRawForScored(raceNo, s) : undefined,
    x: {
      baseScore: s.baseScore, condMod: s.condMod, distMod: s.distMod, rotMod: s.rotMod,
      classMod: s.classMod, cornModRaw: s._cornModRaw, cornMod: s.cornMod, trendMod: s.trendMod,
      weightMod: s.weightMod, agariMod: s.agariMod, comboMod: s.comboMod, marginMod: s.marginMod,
      winStrMod: s.winStrMod, jockeyChgMod: s.jockeyChgMod, takiMod: s.takiMod,
      cornConsistMod: s.cornConsistMod, rakuMod: s.rakuMod, paceCtxMod: s.paceCtxMod,
      relSIMod: s.relSIMod,
    },
  }));
  const clean = JSON.parse(JSON.stringify({
    raceNo: parseInt(raceNo),
    raceInfo: {
      babaCode: String(data.raceInfo.babaCode || currentBaba || '31'),
      raceDate: String(data.raceInfo.raceDate || currentDate || ''),
      distance: String(data.raceInfo.distance || ''),
      raceClass: String(data.raceInfo.raceClass || data.raceInfo.race_class || ''),
      trackCond: String(data.raceInfo.trackCond || data.raceInfo.track_cond || ''),
    },
    market: {
      observedAt: data._liveOddsObservedAt || null,
      source: data._liveOddsSource || null,
      fetchedRunnerCount: Number.isFinite(Number(data._liveOddsRunnerCount)) ? Number(data._liveOddsRunnerCount) : null,
    },
    anchor: runners[0] || null,
    runners,
  }));
  try {
    Object.freeze(clean.raceInfo); Object.freeze(clean.market);
    clean.runners.forEach(r => { Object.freeze(r.x); if (r.vnextRaw) Object.freeze(r.vnextRaw); Object.freeze(r); });
    Object.freeze(clean.runners); if (clean.anchor) Object.freeze(clean.anchor); Object.freeze(clean);
  } catch (e) { _kvSwallow('_opponentShadowInput', e); }
  return clean;
}

function _normalizeOpponentShadowPicks(raw, role, byUma, used) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item0 of src) {
    const item = (item0 && typeof item0 === 'object') ? item0 : { u: item0 };
    const u = parseInt(item.u != null ? item.u : item.umaBan);
    const runner = byUma.get(u);
    if (!runner || used.has(u)) continue;
    used.add(u);
    const score = Number(item.score);
    const probability = Number(item.probability != null ? item.probability : item.prob);
    const reasons = (Array.isArray(item.reasons) ? item.reasons : (item.reason ? [item.reason] : []))
      .slice(0, 4).map(x => String(x).slice(0, 100));
    out.push({
      role, u, name: runner.name, currentRank: runner.currentRank,
      score: Number.isFinite(score) ? score : null,
      probability: Number.isFinite(probability) && probability >= 0 && probability <= 1 ? probability : null,
      reasons,
    });
    if (out.length >= 3) break;
  }
  return out;
}

function computeOpponentShadow(raceNo, scored, modelId) {
  if (!opponentShadowEnabled()) return null;
  const registered = modelId ? (_opponentShadowModels.get(String(modelId)) || null) : getActiveOpponentShadowModel();
  if (!registered) return null;
  const input = _opponentShadowInput(raceNo, scored, {
    includeVnext: registered.model?.config?.requiresVnextFeatures === true,
  });
  if (!input || !input.anchor || input.runners.length < 4) return null;
  const cfg = registered.model.config || {};
  const cutoff = Number(cfg.captureCutoffMinutes);
  if (Number.isFinite(cutoff) && cutoff > 0) {
    const tm = _aiPredictionTimeMeta(input.raceInfo.raceDate, raceNo);
    if (!tm || tm.timing !== 'verified_prestart' || !Number.isFinite(Number(tm.minutesBeforeStart)) ||
        Number(tm.minutesBeforeStart) < cutoff) return null;
  }
  if (cfg.requiresFreshMarket === true) {
    const observedMs = Date.parse(input.market && input.market.observedAt);
    const ageMinutes = (Date.now() - observedMs) / 60000;
    const maxAge = Number(cfg.maxMarketAgeMinutes);
    if (!Number.isFinite(observedMs) || !Number.isFinite(ageMinutes) || ageMinutes < -0.1 ||
        !Number.isFinite(maxAge) || ageMinutes > maxAge) return null;
  }
  // renderHorseRows（前向き保存）とrenderPredictionPanel（shadow表示）は同じ入力で連続して呼ばれる。
  // 入力fingerprint単位で結果を固定し、候補predictorの二重実行・状態依存で表示と保存がずれるのを防ぐ。
  const predictionInputFingerprint = _aiFingerprint(input);
  const cacheKey = `${registered.model.fingerprint}|${predictionInputFingerprint}`;
  if (_opponentShadowResultCache.has(cacheKey)) {
    return JSON.parse(JSON.stringify(_opponentShadowResultCache.get(cacheKey)));
  }
  try {
    const raw = registered.predictor(input) || {};
    const byUma = new Map(input.runners.map(r => [r.u, r]));
    const used = new Set([input.anchor.u]); // ◎自身を「相手」に混ぜない
    const mainlineRaw = raw.mainline || (raw.picks && raw.picks.mainline) || [];
    const longshotRaw = raw.longshot || (raw.picks && raw.picks.longshot) || [];
    const mainline = _normalizeOpponentShadowPicks(mainlineRaw, 'mainline', byUma, used);
    const longshot = _normalizeOpponentShadowPicks(longshotRaw, 'longshot', byUma, used);
    const result = {
      schema: OPPONENT_SHADOW_RESULT_SCHEMA,
      status: 'shadow_unadopted', exactEv: false,
      predictionInputFingerprint,
      model: registered.model,
      target: registered.model.target,
      anchor: { u: input.anchor.u, name: input.anchor.name, currentRank: input.anchor.currentRank },
      inputDiagnostics: {
        runnerCount: input.runners.length,
        transferCount: input.runners.filter(r => r.isTransfer).length,
        estimatedScoreCount: input.runners.filter(r => r.isEstimatedScore).length,
        missingVnextFeatureCount: registered.model?.config?.requiresVnextFeatures === true
          ? input.runners.filter(r => !r.vnextRaw).length : 0,
      },
      baselineMainline: input.runners.filter(r => r.u !== input.anchor.u).slice(0, 2)
        .map(r => ({ u: r.u, name: r.name, currentRank: r.currentRank })),
      marketMeta: input.market,
      mainline, longshot,
    };
    _opponentShadowResultCache.set(cacheKey, JSON.parse(JSON.stringify(result)));
    return JSON.parse(JSON.stringify(result));
  } catch (e) {
    console.warn('[opponentShadow]', e);
    return null;
  }
}

function recordForwardOpponentShadowSnapshot(raceNo, shadow) {
  try {
    if (!opponentShadowEnabled()) return { saved: false, reason: 'NOT_ENABLED_OR_ADMIN' };
    if (!shadow || shadow.schema !== OPPONENT_SHADOW_RESULT_SCHEMA) return { saved: false, reason: 'NO_SHADOW' };
    const data = allRacesData[raceNo];
    if (!data || !data.raceInfo || !Array.isArray(data.horses)) return { saved: false, reason: 'NO_RACE' };
    const baba = String(data.raceInfo.babaCode || currentBaba || '31');
    const raceDate = data.raceInfo.raceDate || currentDate || '';
    if (baba !== '31' || currentDate !== raceDate) return { saved: false, reason: 'NOT_CURRENT_KOCHI' };
    const hasLoadedResult = data.horses.some(h => /^\d+$/.test(String(h.chakujun || '')));
    const hp = `${baba}_${raceDate}_${parseInt(raceNo)}_`;
    const hasSavedResult = Object.entries(lsRead()).some(([k, v]) => k.startsWith(hp) && v && v.type === 'horse' && /^\d+$/.test(String(v.chakujun || '')));
    if (hasLoadedResult || hasSavedResult) return { saved: false, reason: 'HAS_RESULT' };
    const tm = _aiPredictionTimeMeta(raceDate, raceNo);
    if (!tm) return { saved: false, reason: 'NOT_PRESTART' };
    const cfg = shadow.model && shadow.model.config && typeof shadow.model.config === 'object'
      ? shadow.model.config : {};
    const cutoff = Number(cfg.captureCutoffMinutes);
    if (Number.isFinite(cutoff) && cutoff > 0) {
      if (tm.timing !== 'verified_prestart' || !Number.isFinite(Number(tm.minutesBeforeStart))) {
        return { saved: false, reason: 'UNVERIFIED_START_TIME' };
      }
      if (Number(tm.minutesBeforeStart) < cutoff) return { saved: false, reason: 'TOO_LATE_FOR_MODEL_CUTOFF' };
    }
    if (cfg.requiresFreshMarket === true) {
      const observedMs = Date.parse(shadow.marketMeta && shadow.marketMeta.observedAt);
      const ageMinutes = (Date.now() - observedMs) / 60000;
      const maxAge = Number(cfg.maxMarketAgeMinutes);
      if (!Number.isFinite(observedMs) || !Number.isFinite(ageMinutes) || ageMinutes < -0.1 ||
          !Number.isFinite(maxAge) || ageMinutes > maxAge) {
        return { saved: false, reason: 'STALE_OR_UNVERIFIED_MARKET' };
      }
    }
    const requiredMainline = Number(cfg.requiredMainlinePicks);
    if (Number.isFinite(requiredMainline) && requiredMainline > 0 && shadow.mainline.length < requiredMainline) {
      return { saved: false, reason: 'INCOMPLETE_MODEL_PICKS' };
    }
    if (cfg.requiresCompleteBaseline === true) {
      const baselineRanks = (shadow.baselineMainline || []).map(p => Number(p.currentRank));
      if (baselineRanks.length < 2 || baselineRanks[0] !== 2 || baselineRanks[1] !== 3) {
        return { saved: false, reason: 'INCOMPLETE_CURRENT_BASELINE' };
      }
    }
    const rankingModel = buildRankingModelIdentity();
    const _marketRows = data.horses.map(h => ({
      u: parseInt(h.umaBan) || null,
      odds: Number.isFinite(Number(h.odds)) && Number(h.odds) > 0 ? Number(h.odds) : null,
      ninki: Number.isFinite(Number(h.ninki)) && Number(h.ninki) > 0 ? Number(h.ninki) : null,
    })).sort((a,b) => (a.u||0) - (b.u||0));
    const _rankedMarket = _marketRows.filter(r => r.odds != null)
      .slice().sort((a,b) => a.odds - b.odds || (a.u||0) - (b.u||0));
    const _oddsRank = new Map(_rankedMarket.map((r, i) => [r.u, i + 1]));
    const marketAtCapture = _marketRows.map(r => ({ ...r, oddsRank: _oddsRank.get(r.u) || null }));
    const pickData = {
      anchor: shadow.anchor.u,
      baselineMainline: (shadow.baselineMainline || []).map(p => ({ u: p.u, currentRank: p.currentRank })),
      mainline: shadow.mainline.map(p => ({ u: p.u, score: p.score, probability: p.probability, reasons: p.reasons.slice() })),
      longshot: shadow.longshot.map(p => ({ u: p.u, score: p.score, probability: p.probability, reasons: p.reasons.slice() })),
      inputDiagnostics: JSON.parse(JSON.stringify(shadow.inputDiagnostics || {})),
    };
    const inputFingerprint = _aiFingerprint({
      rankingModel: rankingModel.fingerprint, opponentModel: shadow.model.fingerprint,
      predictionInputFingerprint: shadow.predictionInputFingerprint || null, pickData, marketAtCapture,
    });
    const dateKey = raceDate.replace(/\D/g, '');
    const key = `aiOpponentShadow_v1|${baba}|${dateKey}|${String(parseInt(raceNo)).padStart(2,'0')}|${shadow.model.fingerprint}|${inputFingerprint}`;
    if (lsRead()[key]) return { saved: false, reason: 'DUPLICATE', key };
    const registryKey = `aiOpponentModelRegistry_v1|${shadow.model.fingerprint}`;
    if (!lsRead()[registryKey]) {
      lsWrite(registryKey, { type: 'aiOpponentModelRegistry', schemaVersion: 1, savedAt: new Date().toISOString(), model: JSON.parse(JSON.stringify(shadow.model)) });
    }
    lsWrite(key, {
      type: 'opponentShadowSnapshot', schema: OPPONENT_SHADOW_SNAPSHOT_SCHEMA,
      capturePolicy: cfg.requiresFreshMarket === true
        ? 'verified-live-market-at-or-before-model-cutoff' : 'prestart-market-free-shadow',
      status: 'shadow_unadopted', exactEv: false,
      babaCode: baba, raceDate, raceNo: parseInt(raceNo), capturedAt: new Date().toISOString(),
      scheduledStartAt: tm.scheduledStartAt, minutesBeforeStart: tm.minutesBeforeStart, timing: tm.timing,
      rankingModelFingerprint: rankingModel.fingerprint,
      opponentModel: { id: shadow.model.id, version: shadow.model.version, fingerprint: shadow.model.fingerprint,
        target: shadow.model.target, config: JSON.parse(JSON.stringify(shadow.model.config || {})) },
      predictionInputFingerprint: shadow.predictionInputFingerprint || null,
      inputFingerprint, ...pickData, marketObservedAt: shadow.marketMeta && shadow.marketMeta.observedAt || null,
      marketSource: shadow.marketMeta && shadow.marketMeta.source || null, marketAtCapture,
    });
    return { saved: true, key };
  } catch (e) {
    console.warn('[opponentShadowSnapshot]', e);
    return { saved: false, reason: 'WRITE_ERROR' };
  }
}
function listForwardOpponentShadowSnapshots() {
  return Object.entries(lsRead()).filter(([,v]) => v && v.type === 'opponentShadowSnapshot')
    .map(([key,v]) => ({ key, ...v })).sort((a,b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
}

const OPPONENT_SHADOW_CAPTURE_AUDIT_SCHEMA = 'opponent_shadow_capture_audit/v1';
function _opponentShadowCaptureAuditKey(raceDate, raceNo, slot) {
  return `aiOpponentCaptureAudit_v1|31|${String(raceDate || '').replace(/\D/g,'')}|${String(parseInt(raceNo)).padStart(2,'0')}|${String(slot || '')}`;
}
function getOpponentShadowCaptureAudit(raceDate, raceNo, slot) {
  return lsRead()[_opponentShadowCaptureAuditKey(raceDate, raceNo, slot)] || null;
}

function recordOpponentShadowCaptureAudit(raceNo, slot, timingMeta, outcome) {
  try {
    if (!opponentShadowEnabled()) return { saved:false, reason:'NOT_ENABLED_OR_ADMIN' };
    const data = allRacesData[raceNo];
    const raceDate = data && data.raceInfo && data.raceInfo.raceDate || currentDate || '';
    if (!data || String(data.raceInfo && data.raceInfo.babaCode || currentBaba || '') !== '31' ||
        raceDate !== currentDate || !['t10','t15'].includes(String(slot))) {
      return { saved:false, reason:'INVALID_AUDIT_SCOPE' };
    }
    const key = _opponentShadowCaptureAuditKey(raceDate, raceNo, slot);
    const prior = lsRead()[key] && typeof lsRead()[key] === 'object' ? lsRead()[key] : {};
    const active = getActiveOpponentShadowModel();
    const model = active && active.model || null;
    const ranking = buildRankingModelIdentity();
    const now = new Date().toISOString();
    const ok = !!(outcome && outcome.saved);
    const reason = ok ? 'SAVED' : String(outcome && outcome.reason || 'UNKNOWN').slice(0,80);
    const attemptsByReason = { ...(prior.attemptsByReason || {}) };
    attemptsByReason[reason] = Number(attemptsByReason[reason] || 0) + 1;
    const record = {
      type:'opponentShadowCaptureAudit', schema:OPPONENT_SHADOW_CAPTURE_AUDIT_SCHEMA,
      babaCode:'31', raceDate, raceNo:parseInt(raceNo), slot:String(slot),
      captureWindow:String(slot) === 't10' ? '10.00-10.90 minutes before start' : '14.50-15.50 minutes before start',
      firstAttemptAt:prior.firstAttemptAt || now, lastAttemptAt:now,
      attemptCount:Number(prior.attemptCount || 0) + 1, attemptsByReason,
      saved:!!(prior.saved || ok), lastReason:reason,
      snapshotKey:(outcome && outcome.key) || prior.snapshotKey || null,
      scheduledStartAt:timingMeta && timingMeta.scheduledStartAt || prior.scheduledStartAt || null,
      lastMinutesBeforeStart:timingMeta && Number.isFinite(Number(timingMeta.minutesBeforeStart))
        ? Number(timingMeta.minutesBeforeStart) : null,
      marketObservedAt:data._liveOddsObservedAt || null,
      marketSource:data._liveOddsSource || null,
      fetchedRunnerCount:Number.isFinite(Number(outcome && outcome.fetchedRunnerCount))
        ? Number(outcome.fetchedRunnerCount) : null,
      modelId:model && model.id || KV_FORWARD_OPPONENT_MODEL_ID,
      modelFingerprint:model && model.fingerprint || null,
      rankingModelFingerprint:ranking.fingerprint,
    };
    lsWrite(key, record);
    return { saved:true, key, audit:record };
  } catch (e) {
    console.warn('[recordOpponentShadowCaptureAudit]', e);
    return { saved:false, reason:'WRITE_ERROR' };
  }
}
function listOpponentShadowCaptureAudits() {
  return Object.entries(lsRead()).filter(([,v]) => v && v.type === 'opponentShadowCaptureAudit')
    .map(([key,v]) => ({ key, ...v })).sort((a,b) => String(a.lastAttemptAt).localeCompare(String(b.lastAttemptAt)));
}
function summarizeOpponentShadowCollection(raceDate, modelId) {
  const wantedDate = String(raceDate || currentDate || (typeof _kvTodaySlash === 'function' ? _kvTodaySlash() : ''));
  const wantedModelId = String(modelId || KV_FORWARD_OPPONENT_MODEL_ID);
  const rows = listOpponentShadowCaptureAudits().filter(r => r.raceDate === wantedDate && r.slot === 't10');
  const reasons = {};
  rows.forEach(r => { reasons[r.lastReason || 'UNKNOWN'] = Number(reasons[r.lastReason || 'UNKNOWN'] || 0) + 1; });
  const snapshots = listForwardOpponentShadowSnapshots().filter(s => s.raceDate === wantedDate &&
    s.opponentModel && s.opponentModel.id === wantedModelId);
  return { schema:'opponent_shadow_collection_summary/v1', raceDate:wantedDate, modelId:wantedModelId,
    t10Attempted:rows.length, t10Saved:rows.filter(r => r.saved).length,
    t10Failed:rows.filter(r => !r.saved).length, reasons, snapshots:snapshots.length,
    appMustRemainOpen:true };
}
function refreshOpponentShadowCollectionStatus(raceDate) {
  const el = document.getElementById('opponent-shadow-collection-status');
  const summary = summarizeOpponentShadowCollection(raceDate);
  const failures = Object.entries(summary.reasons || {}).filter(([reason]) => reason !== 'SAVED')
    .map(([reason,n]) => `${reason}:${n}`).join(' / ');
  if (el) el.textContent = `${summary.raceDate || '日付未選択'} T10保存 ${summary.t10Saved}/${summary.t10Attempted}` +
    (summary.t10Failed ? `・失敗 ${summary.t10Failed}${failures ? `（${failures}）` : ''}` : '') +
    `・snapshot ${summary.snapshots}`;
  return summary;
}

const KV_FORWARD_OPPONENT_MODEL_ID = 'kochi-t10-market-mainline-v1';
const KV_FORWARD_OPPONENT_MODEL_DESCRIPTOR = {
  id: KV_FORWARD_OPPONENT_MODEL_ID,
  version: '1.0.0',
  family: 'forward-market-mainline-shadow',
  target: 'actual-ui-anchor-conditioned-top3',
  featurePipelineVersion: 'live-odds-complete-v1',
  marketInputs: ['odds'],
  config: {
    captureCutoffMinutes: 10,
    requiresVerifiedStart: true,
    requiresFreshMarket: true,
    maxMarketAgeMinutes: 2,
    requiredMainlinePicks: 2,
    requiresCompleteBaseline: true,
    selection: 'lowest-live-win-odds-excluding-actual-ui-anchor; tie=umaBan-asc',
    baseline: 'actual-ui-current-rank-2-and-3',
    lateExclusionPolicy: 'exclude-whole-race-from-market-evaluation',
    longshot: 'disabled-until-forward-evidence',
    primaryMetric: 'both2-top3-given-actual-ui-anchor-top3',
    firstComparisonAtSettled: 200,
    continuationLimitSettled: 400,
  },
  activate: true,
};
function predictForwardT10MarketMainline(input) {
  if (!input || !Array.isArray(input.runners) || !input.anchor) return { mainline: [], longshot: [] };
  if (!input.market || input.market.source !== 'keiba.go.jp/OddsTanFuku' ||
      Number(input.market.fetchedRunnerCount) !== input.runners.length ||
      input.runners.some(r => !Number.isFinite(Number(r.odds)) || Number(r.odds) <= 0)) {
    return { mainline: [], longshot: [] };
  }
  const ranked = input.runners.filter(r => r.u !== input.anchor.u)
    .slice().sort((a,b) => Number(a.odds) - Number(b.odds) || (a.u||0) - (b.u||0));
  return {
    mainline: ranked.slice(0, 2).map((r, idx) => ({
      u: r.u, score: -Number(r.odds),
      reasons: [`単勝市場${idx + 1}位（◎除外）`, `単勝${Number(r.odds).toFixed(1)}倍`],
    })),
    longshot: [],
  };
}
registerOpponentShadowModel(KV_FORWARD_OPPONENT_MODEL_DESCRIPTOR, predictForwardT10MarketMainline);

function _opponentForwardResultStatus(row) {
  if (!row || typeof row !== 'object') return { settled: false, status: 'missing', top3: false };
  const finish = parseInt(row.chakujun);
  if (Number.isFinite(finish) && finish >= 1 && finish <= 20) {
    return { settled: true, status: 'finished', top3: finish <= 3, finish };
  }
  const text = `${row.chakujun || ''} ${row.diff || ''}`;
  if (/中止/.test(text)) return { settled: true, status: 'dnc', top3: false };
  if (/失格/.test(text)) return { settled: true, status: 'dq', top3: false };
  if (/取消/.test(text)) return { settled: true, status: 'withdrawn', top3: false };
  if (/除外/.test(text)) return { settled: true, status: 'excluded', top3: false };
  return { settled: false, status: 'pending', top3: false };
}
function _opponentForwardRate(n, d) { return d > 0 ? n / d : null; }

function evaluateForwardOpponentShadowSnapshots(modelId) {
  const wanted = String(modelId || KV_FORWARD_OPPONENT_MODEL_ID);
  const db = lsRead();
  const all = listForwardOpponentShadowSnapshots().filter(s => s.opponentModel && s.opponentModel.id === wanted);
  const modelFingerprints = [...new Set(all.map(s => String(s.opponentModel && s.opponentModel.fingerprint || '')))];
  const rankingFingerprints = [...new Set(all.map(s => String(s.rankingModelFingerprint || '')))];
  if (modelFingerprints.length > 1 || rankingFingerprints.length > 1) {
    return { schema:'opponent_shadow_forward_evaluation/v1', modelId:wanted,
      status:'fingerprint_selection_required', error:'MULTIPLE_MODEL_FINGERPRINTS',
      modelFingerprints, rankingFingerprints, counts:{ snapshots:all.length, selected:0, settled:0 },
      reviewGate:{ auditAtSettled:100, firstComparisonAtSettled:200, readyForAudit:false,
        primaryMetric:'both2Difference', readyForFirstComparison:false, productionEligible:false }, rows:[] };
  }
  const selected = new Map();
  let rejectedTiming = 0, rejectedMarketProvenance = 0;
  all.forEach(s => {
    const cfg = s.opponentModel.config || {};
    // 組み込み候補の評価規則はsnapshot内configを信頼せず、事前登録値を独立適用する。
    const cutoff = wanted === KV_FORWARD_OPPONENT_MODEL_ID ? 10 : (Number(cfg.captureCutoffMinutes) || 0);
    const mb = Number(s.minutesBeforeStart);
    if (s.timing !== 'verified_prestart' || !Number.isFinite(mb) || mb < cutoff) { rejectedTiming++; return; }
    if (wanted === KV_FORWARD_OPPONENT_MODEL_ID || cfg.requiresFreshMarket === true) {
      const capturedMs = Date.parse(s.capturedAt), observedMs = Date.parse(s.marketObservedAt);
      const ageMinutes = (capturedMs - observedMs) / 60000;
      if (s.marketSource !== 'keiba.go.jp/OddsTanFuku' || !Number.isFinite(capturedMs) ||
          !Number.isFinite(observedMs) || ageMinutes < -0.1 || ageMinutes > 2) {
        rejectedMarketProvenance++; return;
      }
    }
    const group = [s.babaCode,s.raceDate,s.raceNo,s.opponentModel.fingerprint,s.rankingModelFingerprint].join('|');
    const prev = selected.get(group);
    if (!prev || mb < Number(prev.minutesBeforeStart) ||
        (mb === Number(prev.minutesBeforeStart) && String(s.capturedAt) > String(prev.capturedAt))) selected.set(group, s);
  });

  const counts = { snapshots: all.length, selected: selected.size, settled: 0, pending: 0,
    lateExclusion: 0, invalid: 0, rejectedTiming, rejectedMarketProvenance };
  const acc = {
    anchorTop3: 0,
    conditional: 0,
    baselinePartner1Top3: 0, candidatePartner1Top3: 0,
    baselineAny2Top3: 0, candidateAny2Top3: 0,
    baselineBoth2Top3: 0, candidateBoth2Top3: 0,
  };
  const rows = [];
  selected.forEach(s => {
    const marketRows = Array.isArray(s.marketAtCapture) ? s.marketAtCapture : [];
    const universe = marketRows.map(r => parseInt(r.u)).filter(Boolean);
    const config = s.opponentModel?.config || {};
    const requiresMarket = wanted === KV_FORWARD_OPPONENT_MODEL_ID || config.requiresFreshMarket === true;
    const completeUniverse = universe.length === marketRows.length && new Set(universe).size === universe.length;
    const completeOdds = marketRows.every(r => Number.isFinite(Number(r.odds)) && Number(r.odds) > 0);
    if (!completeUniverse || (requiresMarket && !completeOdds)) { counts.invalid++; return; }
    const statuses = new Map();
    universe.forEach(u => {
      const key = `${s.babaCode}_${s.raceDate}_${parseInt(s.raceNo)}_${u}`;
      statuses.set(u, _opponentForwardResultStatus(db[key]));
    });
    if (!universe.length || [...statuses.values()].some(v => !v.settled)) { counts.pending++; return; }
    if ([...statuses.values()].some(v => v.status === 'withdrawn' || v.status === 'excluded')) {
      counts.lateExclusion++; return;
    }
    const baseline = (s.baselineMainline || []).map(p => parseInt(p.u)).filter(Boolean).slice(0,2);
    const candidate = (s.mainline || []).map(p => parseInt(p.u)).filter(Boolean).slice(0,2);
    const anchor = parseInt(s.anchor);
    const baselineRanks = (s.baselineMainline || []).map(p => Number(p.currentRank)).slice(0,2);
    const expectedMarketCandidate = marketRows.filter(r => parseInt(r.u) !== anchor && Number.isFinite(Number(r.odds)) && Number(r.odds) > 0)
      .slice().sort((a,b) => Number(a.odds) - Number(b.odds) || parseInt(a.u) - parseInt(b.u))
      .slice(0,2).map(r => parseInt(r.u));
    const requiresExactMarketTop2 = wanted === KV_FORWARD_OPPONENT_MODEL_ID;
    if (!anchor || baseline.length !== 2 || candidate.length !== 2 ||
        baselineRanks[0] !== 2 || baselineRanks[1] !== 3 ||
        new Set(candidate).size !== candidate.length || candidate.includes(anchor) ||
        (requiresExactMarketTop2 && candidate.join(',') !== expectedMarketCandidate.join(',')) ||
        !statuses.has(anchor) || baseline.some(u => !statuses.has(u)) || candidate.some(u => !statuses.has(u))) {
      counts.invalid++; return;
    }
    const top3 = u => !!(statuses.get(u) && statuses.get(u).top3);
    const anchorTop3 = top3(anchor);
    const b = baseline.map(top3), c = candidate.map(top3);
    counts.settled++;
    if (anchorTop3) {
      acc.anchorTop3++; acc.conditional++;
      if (b[0]) acc.baselinePartner1Top3++;
      if (c[0]) acc.candidatePartner1Top3++;
      if (b.some(Boolean)) acc.baselineAny2Top3++;
      if (c.some(Boolean)) acc.candidateAny2Top3++;
      if (b.every(Boolean)) acc.baselineBoth2Top3++;
      if (c.every(Boolean)) acc.candidateBoth2Top3++;
    }
    rows.push({ raceDate:s.raceDate, raceNo:s.raceNo, minutesBeforeStart:s.minutesBeforeStart,
      anchorTop3, baselinePartner1Top3:b[0], candidatePartner1Top3:c[0],
      baselineAny2Top3:b.some(Boolean), candidateAny2Top3:c.some(Boolean),
      baselineBoth2Top3:b.every(Boolean), candidateBoth2Top3:c.every(Boolean) });
  });
  const d = acc.conditional;
  const metrics = {
    anchorTop3Rate: _opponentForwardRate(acc.anchorTop3, counts.settled),
    baselinePartner1Top3GivenAnchor: _opponentForwardRate(acc.baselinePartner1Top3, d),
    candidatePartner1Top3GivenAnchor: _opponentForwardRate(acc.candidatePartner1Top3, d),
    baselineAny2Top3GivenAnchor: _opponentForwardRate(acc.baselineAny2Top3, d),
    candidateAny2Top3GivenAnchor: _opponentForwardRate(acc.candidateAny2Top3, d),
    baselineBoth2Top3GivenAnchor: _opponentForwardRate(acc.baselineBoth2Top3, d),
    candidateBoth2Top3GivenAnchor: _opponentForwardRate(acc.candidateBoth2Top3, d),
  };
  metrics.partner1Difference = metrics.candidatePartner1Top3GivenAnchor == null ? null
    : metrics.candidatePartner1Top3GivenAnchor - metrics.baselinePartner1Top3GivenAnchor;
  metrics.any2Difference = metrics.candidateAny2Top3GivenAnchor == null ? null
    : metrics.candidateAny2Top3GivenAnchor - metrics.baselineAny2Top3GivenAnchor;
  metrics.both2Difference = metrics.candidateBoth2Top3GivenAnchor == null ? null
    : metrics.candidateBoth2Top3GivenAnchor - metrics.baselineBoth2Top3GivenAnchor;
  const auditRows = (typeof listOpponentShadowCaptureAudits === 'function' ? listOpponentShadowCaptureAudits() : [])
    .filter(a => a.slot === 't10' && a.modelId === wanted &&
      (!modelFingerprints.length || a.modelFingerprint === modelFingerprints[0]) &&
      (!rankingFingerprints.length || a.rankingModelFingerprint === rankingFingerprints[0]));
  const auditReasons = {};
  auditRows.forEach(a => { auditReasons[a.lastReason || 'UNKNOWN'] = Number(auditReasons[a.lastReason || 'UNKNOWN'] || 0) + 1; });
  return { schema:'opponent_shadow_forward_evaluation/v1', modelId:wanted,
    policy:'closest verified snapshot with minutesBeforeStart >= model cutoff; late exclusion removes whole race',
    generatedAt:new Date().toISOString(), counts, conditionalDenominator:d, metrics,
    captureAudit:{ t10SlotsAttempted:auditRows.length, t10SlotsSaved:auditRows.filter(a=>a.saved).length,
      t10SlotsFailed:auditRows.filter(a=>!a.saved).length,
      attempts:auditRows.reduce((n,a)=>n+Number(a.attemptCount||0),0), lastReasonCounts:auditReasons,
      appMustRemainOpen:true },
    reviewGate:{ auditAtSettled:100, firstComparisonAtSettled:200, readyForAudit:counts.settled>=100,
      primaryMetric:'both2Difference', continueWithoutRuleChangeUntilSettled:400,
      readyForFirstComparison:counts.settled>=200, productionEligible:false }, rows };
}

// 旧市場アンカー／購入shadow実装は research/purchase-model-archive へ退避済み。
// ── 向正面 × 直線 組み合わせ好走率による SI 補正（日別） ──
// 同じ開催日・同じ競馬場の全馬を使い、その日のポジション有利不利を計算する
const _dayPosCache = new Map();

function getDayPosStats(babaCode, raceDate) {
  const ck = `${babaCode}_${raceDate}`;
  if (_dayPosCache.has(ck)) return _dayPosCache.get(ck);
  const lsData = lsRead();
  const combos = {};
  let totalWin = 0, totalAll = 0;
  for (const [key, v] of Object.entries(lsData)) {
    if (v.type !== 'horse') continue;
    if (!v.mukaeShoumen || !v.shoumenStraight) continue;
    const chaku = parseInt(v.chakujun);
    if (isNaN(chaku)) continue;
    // 同日・同競馬場のみ（offi_キーは除外）
    if (key.startsWith('offi_')) continue;
    const parts = key.split('_');
    if (parts[0] !== babaCode || parts[1] !== raceDate) continue;
    const combo = `${v.mukaeShoumen}__${v.shoumenStraight}`;
    if (!combos[combo]) combos[combo] = { win: 0, all: 0 };
    combos[combo].all++;
    if (chaku <= 3) { combos[combo].win++; totalWin++; }
    totalAll++;
  }
  const result = { combos, avgRate: totalAll >= 10 ? totalWin / totalAll : null };
  _dayPosCache.set(ck, result);
  return result;
}

/**
 * その日の向正面 × 直線 好走率と全体平均の差から SI 補正値を返す。
 * データが10走未満の日や3走未満のコンボはスキップ（0返却）。
 */
function getPositionAdvantage(babaCode, raceDate, mukaeShoumen, shoumenStraight) {
  if (!mukaeShoumen || !shoumenStraight) return 0;
  const stats = getDayPosStats(babaCode, raceDate);
  if (stats.avgRate === null) return 0; // その日の記録が少なすぎる
  const combo = `${mukaeShoumen}__${shoumenStraight}`;
  const c = stats.combos[combo];
  if (!c || c.all < 3) return 0;
  const comboRate = c.win / c.all;
  return Math.max(-2.0, Math.min(2.0, (stats.avgRate - comboRate) * 5));
}

// 指定日・競馬場の代表馬場状態を計算（グローバルキャッシュ付き）
// ※以前は無キャッシュで Object.values(lsData) を毎回全走査しており、
//   renderTrackTrend が「保存日数 × 全レコード数」でO(n²)的に重くなる主因だった。
// _buildDayRaceData と同じ direct-lookup 方式（race_${baba}_${date}_1〜16）に統一。
if (!window._dayTrackCondCache) window._dayTrackCondCache = {};
function getDayTrackCond(babaCode, raceDate) {
  const cacheKey = `${babaCode}_${raceDate}`;
  if (window._dayTrackCondCache[cacheKey] !== undefined) return window._dayTrackCondCache[cacheKey];
  const { raceInfoMap } = _buildDayRaceData(babaCode, raceDate);
  const counts = {};
  for (const v of raceInfoMap.values()) {
    const c = v.track_cond || v.trackCond || '';
    if (c) counts[c] = (counts[c] || 0) + 1;
  }
  let best = '', bestN = 0;
  for (const [c, n] of Object.entries(counts)) { if (n > bestN) { bestN = n; best = c; } }
  const result = best || null;
  window._dayTrackCondCache[cacheKey] = result;
  return result;
}


/** 前半3F基準表（クラス×馬場×距離の平均・n>=3セルのみ）を構築（キャッシュ付き） */
function getF3BenchTable() {
  if (window._f3BenchCache) return window._f3BenchCache;
  const CONDS = ['良', '稍重', '重', '不良'];
  const tmp = {};
  for (const v of Object.values(lsRead())) {
    if (v.type !== 'race' || v.baba_code !== '31' || !v.first3f) continue;
    const d = String(v.distance || '').replace(/[^\d]/g, '');
    if (!['1300', '1400', '1600'].includes(d)) continue;
    const cond = v.track_cond || '';
    if (!CONDS.includes(cond)) continue;
    const f = parseFloat(v.first3f);
    if (!isFinite(f) || f < 33 || f > 46) continue;
    const cls = getEffectiveClass(v.race_class || '');
    if (!cls) continue;
    const key = `${d}|${cls}|${cond}`;
    (tmp[key] = tmp[key] || []).push(f);
  }
  const t = {};
  for (const [k, a] of Object.entries(tmp)) if (a.length >= 3) t[k] = a.reduce((x, y) => x + y, 0) / a.length;
  window._f3BenchCache = t;
  return t;
}

// ── 時系列インデックス：前半3F基準表の未来情報混入対策（2026-07-10・コンボと同じ設計）──
// paceCtxN（展開文脈補正）は馬の過去走を「その過去走の時点で分かっていたペース基準」と比べる
// べきだが、getF3BenchTable()は全期間集計のため、3ヶ月前のレースを今日時点の基準(直近レース込み)
// で判定しており未来情報混入。distance×class×trackCond をキーに日付順の累積平均索引を構築する。
function _buildAsOfF3BenchIndex() {
  if (window._asOfF3BenchCache) return window._asOfF3BenchCache;
  const ls = lsRead();
  const CONDS = ['良', '稍重', '重', '不良'];
  const entries = [];
  for (const [k, v] of Object.entries(ls)) {
    if (v.type !== 'race' || v.baba_code !== '31' || !v.first3f) continue;
    const d = String(v.distance || '').replace(/[^\d]/g, '');
    if (!['1300', '1400', '1600'].includes(d)) continue;
    const cond = v.track_cond || ''; if (!CONDS.includes(cond)) continue;
    const f = parseFloat(v.first3f); if (!isFinite(f) || f < 33 || f > 46) continue;
    const cls = getEffectiveClass(v.race_class || ''); if (!cls) continue;
    const p = k.split('_');
    if (p.length < 4) continue;
    entries.push({ d: p[2], n: parseInt(p[3]), key: `${d}|${cls}|${cond}`, f });
  }
  entries.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.n - b.n);
  const perKey = new Map();
  const running = new Map();
  for (const e of entries) {
    const cur = running.get(e.key) || { sum: 0, n: 0 };
    const next = { sum: cur.sum + e.f, n: cur.n + 1 };
    running.set(e.key, next);
    let arr = perKey.get(e.key);
    if (!arr) { arr = []; perKey.set(e.key, arr); }
    arr.push({ d: e.d, n: e.n, sum: next.sum, cnt: next.n });
  }
  return (window._asOfF3BenchCache = { perKey });
}
/** 指定レースより厳密に前のdist×class×cond基準値（3件未満はnull・旧getF3BenchTableと同じ閾値）。 */
function getF3BenchAsOf(dist, cls, cond, raceDate, raceNo) {
  const arr = _buildAsOfF3BenchIndex().perKey.get(`${dist}|${cls}|${cond}`);
  if (!arr || !arr.length) return null;
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, e = arr[mid];
    if (e.d < raceDate || (e.d === raceDate && e.n < raceNo)) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (ans < 0) return null;
  const e = arr[ans];
  return e.cnt >= 3 ? e.sum / e.cnt : null;
}

/**
 * レースの前半3F基準比（dev）と自動ペースラベルを返す。
 * 閾値は1,212レースの結果統計から導出（2026-07-02）：
 *   ハイ＝基準比−1.0秒以下（後方勝ち23%・逃げ複勝57%に低下）
 *   スロー＝基準比+0.3秒以上（後方勝ち10%前後・逃げ複勝67-70%）
 */
function getPaceDevLabel(distance, raceClass, trackCond, first3f) {
  const d = String(distance || '').replace(/[^\d]/g, '');
  const f = parseFloat(first3f);
  if (!isFinite(f) || f < 33 || f > 46) return null;
  const cls = getEffectiveClass(raceClass || '');
  const b = getF3BenchTable()[`${d}|${cls}|${trackCond || ''}`];
  if (b == null) return null;
  const dev = +(f - b).toFixed(2);
  return { dev, label: dev <= -1.0 ? 'ハイ' : dev >= 0.3 ? 'スロー' : 'ミドル' };
}
/** getPaceDevLabelの未来情報を排除した版。raceDate/raceNoより厳密に前のデータだけで基準値を作る。
 *  paceCtxN（展開文脈補正）など「過去走を、その時点の情報だけで評価したい」用途で使う。 */
function getPaceDevLabelAsOf(distance, raceClass, trackCond, first3f, raceDate, raceNo) {
  const d = String(distance || '').replace(/[^\d]/g, '');
  const f = parseFloat(first3f);
  if (!isFinite(f) || f < 33 || f > 46) return null;
  const cls = getEffectiveClass(raceClass || '');
  const b = getF3BenchAsOf(d, cls, trackCond || '', raceDate, raceNo);
  if (b == null) return null;
  const dev = +(f - b).toFixed(2);
  return { dev, label: dev <= -1.0 ? 'ハイ' : dev >= 0.3 ? 'スロー' : 'ミドル' };
}

/**
 * 自動ペースラベルをレースレコードへ付与（paceTypeAuto / paceDevAuto）。
 * 手入力・既存の paceType には絶対に触れない（完全に別フィールド）。
 * 起動時に毎回再計算するので、基準表がデータ増加で動けばラベルも追従する。
 */
// first3f(テン3F)は区間タイム由来で古いレース等は欠損することがある。その場合の
// フォールバック＝先頭馬の前半区間タイム(走破−上がり3F の最小)を距離×クラス×馬場の基準と比較。
// テン3Fラベルとの一致率82.6%（4177R検証・2026-07-05）。これで区間タイム未取得のレースでも
// 各馬の走破/上がり3F(≒98.9%保有)から自動でペースが入る。基準はセッション内キャッシュ。
function getRaceLeadFrontBench() {
  if (window._leadFrontBench) return window._leadFrontBench;
  const store = lsRead();
  const raceInfo = {};
  for (const k of Object.keys(store)) if (k.startsWith('race_31_')) { const r = store[k]; raceInfo[`${r.race_date}_${parseInt(r.race_no)}`] = r; }
  const perRace = {};
  for (const k of Object.keys(store)) {
    const p = k.split('_'); if (p.length !== 4 || p[0] !== '31') continue;
    const v = store[k]; if (!v || v.type !== 'horse') continue;
    const fs = calcFrontSectional(v.time, v.agari3f); if (fs == null) continue;
    const rk = `${p[1]}_${parseInt(p[2])}`; (perRace[rk] = perRace[rk] || []).push(fs);
  }
  const agg = {};
  for (const rk of Object.keys(perRace)) {
    const ri = raceInfo[rk]; if (!ri) continue; const arr = perRace[rk]; if (arr.length < 4) continue;
    const d = getDistNum(ri.distance), c = getEffectiveClass(ri.race_class);
    if (!d || !c) continue;
    const key = `${d}|${c}|${ri.track_cond || ''}`;
    (agg[key] = agg[key] || []).push(Math.min(...arr));
  }
  const bench = {};
  for (const key of Object.keys(agg)) { const a = agg[key].sort((x, y) => x - y); if (a.length >= 8) bench[key] = a[Math.floor(a.length / 2)]; }
  window._leadFrontBench = bench;
  return bench;
}

/** first3f欠損レースのペース(ハイ/ミドル/スロー)を前半区間タイムから判定（srcで由来を区別）。 */
function getFrontPaceLabel(raceDate, raceNo, distance, raceClass, trackCond) {
  const d = getDistNum(distance), c = getEffectiveClass(raceClass);
  if (!d || !c) return null;
  const bench = getRaceLeadFrontBench()[`${d}|${c}|${trackCond || ''}`];
  if (bench == null) return null;
  const store = lsRead();
  let lead = Infinity;
  for (let u = 1; u <= 20; u++) { const v = store[`31_${raceDate}_${raceNo}_${u}`]; if (!v || v.type !== 'horse') continue; const fs = calcFrontSectional(v.time, v.agari3f); if (fs != null && fs < lead) lead = fs; }
  if (lead === Infinity) return null;
  const dev = +(lead - bench).toFixed(2);
  return { dev, label: dev <= -0.8 ? 'ハイ' : dev >= 0.5 ? 'スロー' : 'ミドル', src: 'front' };
}

// ══════════ 馬ごとの自動ペースラベル（2026-08-04 導入）══════════
// 「その馬がそのレースで速い前半を踏んだか」を、同じ距離×クラス×馬場の基準と比べて出す。
// ⛔クラスを混ぜてはいけない。実測(17,708頭・2025〜2026年)では 1300m良の前半3F中央値が
//   A 38.60 / B 39.40 / C1 39.50 / C2 39.60 / C3 40.20 と最大1.6秒違い、距離でも
//   1300m 40.20 → 1600m 41.30（+1.1秒）、馬場でも 良 40.20 → 不良 39.10（−1.1秒）ずれる。
// 判定はそのセルの標準偏差で割った z で行うので、閾値は自動的に条件ごとの秒数になる。
//   例) 1300m良のハイ境界: A 37.81秒 / C1 38.84秒 / C3 39.47秒
// 閾値±0.75σの根拠(実測): ハイ21.6%/ミドル54.8%/スロー23.6% に分かれ、複勝率は
//   44.4% / 31.6% / 15.3%（29pt差）、1角の相対位置も 0.32 / 0.54 / 0.77 と単調。
//   ±1.0σは分離が最大(32.7pt)だがミドルが69%を占めて見分けにくく、±0.5σは分離が26.4ptへ落ちる。
// ⛔手入力の paceType には触れない。完全に別フィールド（レース側の paceType/paceTypeAuto と同じ関係）。
const HORSE_PACE_MIN_N = 30;       // 基準を作るのに要る頭数（下回る条件は距離×馬場へ落とす）
const HORSE_PACE_Z_HIGH = -0.75;   // これ以下 → ハイ
const HORSE_PACE_Z_SLOW = 0.75;    // これ超   → スロー

const _HORSE_F3_BENCH_KEY = 'kv_horse_f3_bench_v1';

/** 基準表。全履歴が載っている時だけ作り直し、結果は localStorage に残す。
 *  ⛔残さないと、起動直後（レースと直近の馬しか載っていない状態）では基準を作れず、
 *    Phase1で取り直した馬にラベルを付け直せない。表は70セル程度なので数KBで収まる。 */
function getHorseF3BenchTable() {
  if (window._horseF3Bench) return window._horseF3Bench;
  if (!_idbFullReady) {
    // ①この端末で全履歴から作った表 → ②同梱の表（data/kochi-horse-f3-bench.js）
    // ⛔②が無いと「一度も分析画面を開いていない端末ではペースが出ない」という
    //   無言の不発になる（2026-08-04にユーザー環境で実際に起きた）。
    try {
      const saved = JSON.parse(localStorage.getItem(_HORSE_F3_BENCH_KEY) || 'null');
      if (saved && saved.cell && Object.keys(saved.cell).length) { window._horseF3Bench = saved; return saved; }
    } catch (e) { _kvSwallow('getHorseF3BenchTable:load', e); }
    if (window.KV_HORSE_F3_BENCH && window.KV_HORSE_F3_BENCH.cell) {
      window._horseF3Bench = window.KV_HORSE_F3_BENCH;
      return window._horseF3Bench;
    }
    return { cell: {}, fb: {} };     // 基準を作れない＝ラベルも付けない
  }
  const store = lsRead();
  const cell = {}, fb = {};
  for (const [, v] of Object.entries(store)) {
    if (!v || v.type !== 'horse' || v.baba_code !== '31' || !v.first3f) continue;
    const f = parseFloat(v.first3f);
    if (!isFinite(f) || f < 33 || f > 48) continue;
    const rr = store[`race_31_${v.race_date}_${v.race_no}`];
    if (!rr) continue;
    const d = String(rr.distance || '').replace(/[^\d]/g, '');
    const c = getEffectiveClass(rr.race_class || rr.raceClass || '');
    const cond = rr.track_cond || rr.trackCond || '';
    if (!d) continue;
    if (c) (cell[`${d}|${c}|${cond}`] = cell[`${d}|${c}|${cond}`] || []).push(f);
    (fb[`${d}|${cond}`] = fb[`${d}|${cond}`] || []).push(f);
  }
  const summarize = src => {
    const out = {};
    for (const [k, a] of Object.entries(src)) {
      if (a.length < HORSE_PACE_MIN_N) continue;
      a.sort((x, y) => x - y);
      const mid = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
      const mean = a.reduce((s, x) => s + x, 0) / a.length;
      const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / a.length);
      if (sd > 0.01) out[k] = { med: mid, sd, n: a.length };
    }
    return out;
  };
  const _computed = { cell: summarize(cell), fb: summarize(fb), at: Date.now() };
  // ⛔同期が終わる前に全履歴展開が起きると、少ない馬から貧弱な表ができる（2026-08-04に実測で
  //   55セル→2セルまで痩せた）。同梱の表より条件数が少ないなら採用も保存もしない。
  const _shipped = window.KV_HORSE_F3_BENCH;
  if (_shipped && _shipped.cell &&
      Object.keys(_computed.cell).length < Object.keys(_shipped.cell).length) {
    window._horseF3Bench = _shipped;
    return _shipped;
  }
  window._horseF3Bench = _computed;
  try { localStorage.setItem(_HORSE_F3_BENCH_KEY, JSON.stringify(_computed)); }
  catch (e) { _kvSwallow('getHorseF3BenchTable:save', e); }
  return _computed;
}

/** 馬1頭の前半3F → 同条件の基準と比べた {label, z, dev}。基準が無い条件では null。 */
function getHorsePaceLabel(first3f, distance, raceClass, trackCond) {
  const f = parseFloat(first3f);
  if (!isFinite(f) || f < 33 || f > 48) return null;
  const d = String(distance || '').replace(/[^\d]/g, '');
  if (!d) return null;
  const c = getEffectiveClass(raceClass || '');
  const t = getHorseF3BenchTable();
  const b = (c && t.cell[`${d}|${c}|${trackCond || ''}`]) || t.fb[`${d}|${trackCond || ''}`];
  if (!b) return null;
  const z = (f - b.med) / b.sd;
  return {
    z: +z.toFixed(2), dev: +(f - b.med).toFixed(2),
    label: z <= HORSE_PACE_Z_HIGH ? 'ハイ' : (z <= HORSE_PACE_Z_SLOW ? 'ミドル' : 'スロー'),
  };
}

/** 馬ごとの自動ペースを付ける。手入力(paceType)は読みも書きもしない。 */
function backfillHorsePaceLabels() {
  // 基準表が無い＝まだ一度も全履歴を展開していない端末。ここで無理に付けない。
  const t = getHorseF3BenchTable();
  if (!t || !Object.keys(t.cell).length) return 0;
  const store = lsRead();
  let n = 0;
  for (const [k, v] of Object.entries(store)) {
    if (!v || v.type !== 'horse' || v.baba_code !== '31' || !v.first3f) continue;
    const rr = store[`race_31_${v.race_date}_${v.race_no}`];
    if (!rr) continue;
    const r = getHorsePaceLabel(v.first3f, rr.distance, rr.race_class || rr.raceClass, rr.track_cond || rr.trackCond);
    if (!r) continue;
    if (v.paceTypeAuto === r.label && v.paceDevAuto === r.z) continue;   // 変化なし
    lsWrite(k, { ...v, paceTypeAuto: r.label, paceDevAuto: r.z });
    n++;
  }
  if (n > 0) console.log(`[horsePace] 馬ごとの自動ペースを ${n} 頭に付与/更新`);
  return n;
}

function backfillPaceLabels() {
  let n = 0;
  for (const [k, v] of Object.entries(lsRead())) {
    if (!k.startsWith('race_') || v.baba_code !== '31') continue;
    // 第一優先＝テン3F由来（従来）。無い場合は前半区間タイムでフォールバック算出。
    let r = v.first3f ? getPaceDevLabel(v.distance, v.race_class || v.raceClass, v.track_cond || v.trackCond, v.first3f) : null;
    if (!r) {
      const p = k.split('_');   // race_31_{date}_{rno}
      const rno = parseInt(p[3]);
      if (rno) r = getFrontPaceLabel(p[2], rno, v.distance, v.race_class || v.raceClass, v.track_cond || v.trackCond);
    }
    if (!r) continue;
    if (v.paceTypeAuto === r.label && v.paceDevAuto === r.dev) continue; // 変化なし
    lsWrite(k, { ...v, paceTypeAuto: r.label, paceDevAuto: r.dev });
    n++;
  }
  if (n > 0) console.log(`[paceLabels] 自動ペースラベル（基準比）を ${n} レースに付与/更新`);
  return n;
}

/** 前後半差(前半3F−上がり3F)からペース(ハイ/ミドル/スロー)を判定 */
function paceFromDiff(first3f, agari3f) {
  const f3 = parseFloat(first3f), ag = parseFloat(agari3f);
  if (isNaN(f3) || isNaN(ag)) return '';
  const diff = f3 - ag;
  return diff <= -2.0 ? 'ハイ' : diff <= -0.5 ? 'ミドル' : 'スロー';
}

/**
 * ペース(paceType)の自動補完：前半3F＋上がり3FがあるのにpaceTypeが空のレースを
 * 前後半差から計算して埋める（手入力済みpaceTypeは保持）。表示時のライブ計算に頼らず
 * 保存データにも持たせることで、一覧表示・分析でペースが一貫して見えるようにする。
 */
function backfillPaceType() {
  let n = 0;
  for (const [k, v] of Object.entries(lsRead())) {
    if (!k.startsWith('race_') || (v.baba_code || v.babaCode) !== '31') continue;
    if (v.pace_type || v.paceType) continue; // 既に値あり（手入力含む）→ 保持
    const pace = paceFromDiff(v.first3f, v.agari3f_race);
    if (!pace) continue;
    lsWrite(k, { ...v, pace_type: pace, paceType: pace });
    n++;
  }
  if (n > 0) console.log(`[paceType] 前後半差ペースを ${n} レースに付与`);
  return n;
}

/**
 * 前半3F基準表（クラス×馬場状態×距離）を保存データから自動計算して描画。
 * ページを開くたびに再計算するので、データが増えれば数値も自動で最新化される。
 */
function renderF3Averages() {
  const body = document.getElementById('f3avg-body');
  if (!body) return;
  const CONDS = ['良', '稍重', '重', '不良'];
  const CLS_ORDER = ['重賞', 'OP', 'A', 'B', 'C1', 'C2', 'C3', '3歳', '2歳'];
  const agg = { '1300': {}, '1400': {}, '1600': {} };
  let totalN = 0;
  let minDate = null, maxDate = null;   // 2026-07-11：集計に使われた実際の日付範囲を表示するため記録
  for (const v of Object.values(lsRead())) {
    if (v.type !== 'race' || v.baba_code !== '31' || !v.first3f) continue;
    const d = String(v.distance || '').replace(/[^\d]/g, '');
    if (!agg[d]) continue;
    const cond = v.track_cond || '';
    if (!CONDS.includes(cond)) continue;
    const f = parseFloat(v.first3f);
    if (!isFinite(f) || f < 33 || f > 46) continue;
    const cls = getEffectiveClass(v.race_class || '');
    if (!cls) continue;
    if (!agg[d][cls]) agg[d][cls] = {};
    if (!agg[d][cls][cond]) agg[d][cls][cond] = [];
    agg[d][cls][cond].push(f);
    totalN++;
    const rd = v.race_date || '';
    if (rd) { if (!minDate || rd < minDate) minDate = rd; if (!maxDate || rd > maxDate) maxDate = rd; }
  }
  const distSec = ['1300', '1400', '1600'].map(d => {
    const clsRows = CLS_ORDER.filter(c => agg[d][c]);
    if (!clsRows.length) return '';
    const rows = clsRows.map(cls => {
      const cells = CONDS.map(cond => {
        const a = agg[d][cls][cond];
        if (!a || !a.length) return '<td class="f3-thin">—</td>';
        const mean = (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
        return `<td class="${a.length < 5 ? 'f3-thin' : ''}">${mean}<span class="f3avg-n"> (${a.length})</span></td>`;
      }).join('');
      return `<tr><td class="f3-cls">${cls}</td>${cells}</tr>`;
    }).join('');
    return `<div class="f3avg-h">${d}m${d === '1600' ? ' <span class="f3avg-n">（4F目仮置き推定・±0.3秒）</span>' : ''}</div>
      <div style="overflow-x:auto"><table class="f3avg-table">
        <thead><tr><th style="text-align:left">クラス</th>${CONDS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }).join('');
  body.innerHTML = distSec + `<div class="f3avg-note">
    保存データから自動計算（現在 ${totalN}R${minDate && maxDate ? `・対象期間 ${minDate}〜${maxDate}` : ''}）。データが増えるたびに開くだけで最新の平均に更新されます。薄い表示＝5レース未満（参考値）。<br>
    前半3Fの由来：実測値＋自動補完（1400m＝決着タイム−上がり4F／1300m＝(決着タイム−上がり4F)で前半2.5Fを出し、残り100m分＝(上がり4F−上がり3F)÷2を加算／1600m＝決着タイム−上がり4F−4F目仮置き 良14.5〜不良13.5秒）。1600mは前半800mの内訳が計測されないため、稍重の逆転など±0.3秒程度の不確実性が残ります。</div>`;
}

// AI成績：保存済み確定レースを現在モデルで安全に再計算する。
function computeYosoScoredArchived(babaCode, raceDate, raceNo, horseKeys) {
  const lsData = lsRead();
  const raceVal = lsData[`race_${babaCode}_${raceDate}_${raceNo}`];
  if (!raceVal) return null;
  const hp = `${babaCode}_${raceDate}_${raceNo}_`;
  // AI成績の集計時は一覧構築で得たキーを再利用する。
  // 毎レース Object.entries(lsData) すると「全保存件数 × 対象レース数」の走査になり、
  // 全履歴を持つ端末では画面が長時間「集計中」のままになる。
  const horseEntries = Array.isArray(horseKeys)
    ? horseKeys.map(k => [k, lsData[k]]).filter(([, v]) => v && v.type === 'horse')
    : Object.entries(lsData).filter(([k, v]) => v.type === 'horse' && k.startsWith(hp));
  const horses = horseEntries
    .sort((a, b) => (parseInt(a[0].replace(hp, '')) || 0) - (parseInt(b[0].replace(hp, '')) || 0))
    .map(([k, v]) => {
      const umaBan = parseInt(k.replace(hp, ''));
      return { chakujun: v.chakujun || '', wakuBan: v.wakuBan || String(Math.ceil(umaBan / 2)), umaBan, horseName: v.horseName || `馬番${umaBan}`,
        belong: v.belong || '', sexAge: v.sexAge || '', kinryo: v.kinryo || '', jockey: v.jockey || '', trainer: v.trainer || '', weight: v.weight || '',
        ninki: v.ninki || '', odds: v.odds || '', time: v.time || '', diff: v.diff || '', agari3f: v.agari3f || '', corner: v.corner || '',
        first3f: v.first3f || '', paceType: v.paceType || '', paceTypeAuto: v.paceTypeAuto || '', paceDevAuto: v.paceDevAuto ?? null, mukaeShoumen: v.mukaeShoumen || '', shoumenStraight: v.shoumenStraight || '',
        postComment: v.postComment || '', lineageLoginCode: v.lineageLoginCode || '' };
    });
  if (!horses.length) return null;
  const raceInfo = { raceDate, raceNo, babaCode, raceName: raceVal.race_name || `第${raceNo}レース`, distance: raceVal.distance || '',
    raceClass: migrateRaceClass(raceVal.race_class || raceVal.raceClass || '', raceVal.race_name || ''),
    trackCond: raceVal.track_cond || raceVal.trackCond || '', first3f: raceVal.first3f || '', agari4f: raceVal.agari4f || '',
    agari3f_race: raceVal.agari3f_race || '', paceType: raceVal.paceType || raceVal.pace_type || '', memo: raceVal.memo || '' };
  const _saved = allRacesData[raceNo];              // 現在表示中の内容を退避
  allRacesData[raceNo] = { raceInfo, horses };       // 一時差し替え
  let result = null;
  try { result = computeYosoScored(raceNo, null); }  // 同期実行（途中でawait/setTimeoutを挟まない）
  finally {
    if (_saved === undefined) delete allRacesData[raceNo];
    else allRacesData[raceNo] = _saved;
  }                                                  // 必ず元に戻す
  return result;
}

const AI_SEISEKI_CACHE_SCHEMA = 'ai_seiseki_cache/v2';
const AI_SEISEKI_CACHE_PREFIX = 'aiSeisekiCache_v2';
const AI_SEISEKI_MARKS = ['◎', '○', '▲', '△', '×', '×'];  // computeYosoScored系と同一定義（値は変更しない）
const AI_SEISEKI_MAX_RACES = 600;                    // 直近約50開催日。画面内の再計算を有限時間に保つ
// complete-v3（2026-07-11凍結）から生成した軽量集計。年度別＝直近5年＋当年(7/11まで)。
// 生成元: 高知競馬ビューア改善/experiments/ranking_vnext/build_shipped_ai_seiseki_years.py
// legacy_v2_anchor.score_approx は現行AIの順位近似であり、実印・完全なlive scoreとは表示しない。
// 画面を開くだけでは重い過去再採点をせず、この監査済み参考値を即時表示する。
const AI_SEISEKI_SHIPPED = Object.freeze({
  schema: 'ai_seiseki_shipped_years/v1', rankingLabel: '現行AI近似順位',
  startDate: '2021/01/01', endDate: '2026/07/11', raceCount: 4210,
  excludedIncompleteScore: 2388, excludedInvalidTop3: 39,
  datasetSha256: '699f63e95dfa47f1fdc5f6ff0c0db8fa5d005f11c11a012a2df9e75b89bbc0ec',
  cumulative: { '◎': { n: 4210, win: 1775, top2: 2591, top3: 3077 }, '○': { n: 4210, win: 844, top2: 1784, top3: 2435 }, '▲': { n: 4210, win: 478, top2: 1169, top3: 1886 }, '△': { n: 4210, win: 306, top2: 837, top3: 1458 }, '×': { n: 8403, win: 424, top2: 1078, top3: 1986 } },
  byYear: {
    '2021': { raceCount: 786, startDate: '2021/01/01', endDate: '2021/12/31', excludedIncompleteScore: 463, excludedInvalidTop3: 10,
      agg: { '◎': { n: 786, win: 331, top2: 485, top3: 578 }, '○': { n: 786, win: 164, top2: 332, top3: 451 }, '▲': { n: 786, win: 88, top2: 219, top3: 354 }, '△': { n: 786, win: 51, top2: 158, top3: 278 }, '×': { n: 1572, win: 79, top2: 196, top3: 364 } } },
    '2022': { raceCount: 705, startDate: '2022/01/01', endDate: '2022/12/31', excludedIncompleteScore: 469, excludedInvalidTop3: 4,
      agg: { '◎': { n: 705, win: 311, top2: 449, top3: 521 }, '○': { n: 705, win: 126, top2: 288, top3: 409 }, '▲': { n: 705, win: 77, top2: 198, top3: 314 }, '△': { n: 705, win: 60, top2: 140, top3: 252 }, '×': { n: 1407, win: 65, top2: 171, top3: 321 } } },
    '2023': { raceCount: 702, startDate: '2023/01/01', endDate: '2023/12/31', excludedIncompleteScore: 474, excludedInvalidTop3: 7,
      agg: { '◎': { n: 702, win: 297, top2: 415, top3: 504 }, '○': { n: 702, win: 133, top2: 303, top3: 405 }, '▲': { n: 702, win: 75, top2: 172, top3: 296 }, '△': { n: 702, win: 54, top2: 151, top3: 240 }, '×': { n: 1403, win: 82, top2: 202, top3: 342 } } },
    '2024': { raceCount: 776, startDate: '2024/01/01', endDate: '2024/12/31', excludedIncompleteScore: 422, excludedInvalidTop3: 5,
      agg: { '◎': { n: 776, win: 316, top2: 475, top3: 574 }, '○': { n: 776, win: 171, top2: 342, top3: 474 }, '▲': { n: 776, win: 98, top2: 226, top3: 348 }, '△': { n: 776, win: 52, top2: 148, top3: 249 }, '×': { n: 1548, win: 76, top2: 192, top3: 357 } } },
    '2025': { raceCount: 779, startDate: '2025/01/01', endDate: '2025/12/31', excludedIncompleteScore: 374, excludedInvalidTop3: 9,
      agg: { '◎': { n: 779, win: 324, top2: 482, top3: 569 }, '○': { n: 779, win: 146, top2: 309, top3: 421 }, '▲': { n: 779, win: 90, top2: 238, top3: 375 }, '△': { n: 779, win: 60, top2: 145, top3: 259 }, '×': { n: 1552, win: 77, top2: 196, top3: 379 } } },
    '2026': { raceCount: 462, startDate: '2026/01/01', endDate: '2026/07/11', excludedIncompleteScore: 186, excludedInvalidTop3: 4,
      agg: { '◎': { n: 462, win: 196, top2: 285, top3: 331 }, '○': { n: 462, win: 104, top2: 210, top3: 275 }, '▲': { n: 462, win: 50, top2: 116, top3: 199 }, '△': { n: 462, win: 29, top2: 95, top3: 180 }, '×': { n: 921, win: 45, top2: 121, top3: 223 } } },
  },
});
let _aiSeisekiVisibleResult = null;
function _aiSeisekiEmptyAgg() {
  const byMark = {}; ['◎', '○', '▲', '△', '×'].forEach(m => byMark[m] = { n: 0, win: 0, top2: 0, top3: 0 });
  return byMark;
}
function _aiSeisekiCacheContext(model) {
  model = model || buildRankingModelIdentity();
  return { key: `${AI_SEISEKI_CACHE_PREFIX}|${model.fingerprint}`, model };
}
function _aiSeisekiReadCache(ctx) {
  try {
    const c = lsRead()[ctx.key];
    return c && c.schema === AI_SEISEKI_CACHE_SCHEMA && c.modelFingerprint === ctx.model.fingerprint ? c : null;
  } catch (e) { return null; }
}
function _aiSeisekiWriteCache(ctx, c) { lsWrite(ctx.key, c); }
// 高知(baba=31)・着順確定済み(1着馬あり・出走4頭以上)のレース一覧を日付昇順で構築（runYosoBacktestと同じ判定基準）
function _aiSeisekiListFinishedRaces() {
  const lsData = lsRead();
  const raceMap = {};
  for (const k in lsData) {
    const v = lsData[k];
    if (!v || v.type !== 'horse') continue;
    const parts = k.split('_');
    if (parts.length < 4 || parts[0] !== '31') continue;
    const raceNo = parseInt(parts[2]); if (isNaN(raceNo)) continue;
    const umaBan = parseInt(parts[3]);
    const key = parts[1] + '|' + raceNo;
    if (!raceMap[key]) raceMap[key] = { key, raceDate: parts[1], raceNo, hasWinner: false, n: 0, resultRows: [], horseKeys: [] };
    raceMap[key].horseKeys.push(k);
    raceMap[key].resultRows.push([isNaN(umaBan) ? null : umaBan, String(v.chakujun || '')]);
    const c = parseInt(v.chakujun);
    if (isNaN(c) || c < 1) continue;
    raceMap[key].n++;
    if (c === 1) raceMap[key].hasWinner = true;
  }
  const allFinished = Object.values(raceMap).filter(r => r.hasWinner && r.n >= 4)
    .sort((a, b) => a.raceDate === b.raceDate ? a.raceNo - b.raceNo : (a.raceDate < b.raceDate ? -1 : 1))
    .map(r => ({ key: r.key, raceDate: r.raceDate, raceNo: r.raceNo,
      horseKeys: r.horseKeys,
      resultSignature: _aiFingerprint(r.resultRows.sort((a,b) => (a[0]||0)-(b[0]||0))) }));
  const selected = allFinished.slice(-AI_SEISEKI_MAX_RACES);
  // 配列の列挙要素には含めず、画面の集計範囲表示だけに使う。
  Object.defineProperty(selected, 'totalAvailable', { value: allFinished.length, enumerable: false });
  return selected;
}
function _aiSeisekiMonthKey(dateSlash) { return dateSlash.slice(0, 7).replace('/', '-'); }  // "2026/07/13" → "2026-07"
// 直近最大AI_SEISEKI_MAX_RACES件を集計（差分マージ・分割実行でUIブロック回避）。
// 完了・部分失敗・致命的失敗のいずれでも必ずcbを呼び、画面を「集計中」のまま残さない。
function _aiSeisekiBuildOrUpdate(cb, onProgress) {
  const notify = info => { try { if (typeof onProgress === 'function') onProgress(info); } catch (e) { _kvSwallow('_aiSeisekiBuildOrUpdate', e); } };
  const model = buildRankingModelIdentity();
  const ctx = _aiSeisekiCacheContext(model);
  const cache = _aiSeisekiReadCache(ctx);
  const races = _aiSeisekiListFinishedRaces();
  const totalAvailable = Number(races.totalAvailable) || races.length;
  const raceSig = Object.fromEntries(races.map(r => [r.key, r.resultSignature]));
  let reusable = !!(cache && cache.byMonth && cache.cumulative && cache.processed);
  if (reusable) {
    // 同日後続レースは追加できる一方、既存結果の訂正・削除を検知したら全再構築する。
    reusable = Object.entries(cache.processed).every(([key, sig]) => raceSig[key] === sig);
  }
  let byMonth = reusable ? JSON.parse(JSON.stringify(cache.byMonth)) : {};
  let cumulative = reusable ? JSON.parse(JSON.stringify(cache.cumulative)) : _aiSeisekiEmptyAgg();
  let processed = reusable ? { ...cache.processed } : {};
  let failed = reusable && cache.failed ? { ...cache.failed } : {};
  const targets = races.filter(r => !processed[r.key] && failed[r.key] !== r.resultSignature);
  const inputDataFingerprint = _aiFingerprint(races.map(r => [r.key, r.resultSignature]));
  const firstDate = races[0]?.raceDate || '';
  const lastDate = races[races.length - 1]?.raceDate || '';
  const baseMeta = { totalAvailable, selectedRaceCount: races.length, targetCount: targets.length,
    reusedRaceCount: Object.keys(processed).length, firstDate, lastDate, maxRaces: AI_SEISEKI_MAX_RACES };
  let i = 0;
  let skipped = 0;
  const BATCH = 8;
  notify({ ...baseMeta, done: 0, total: targets.length });
  const finish = payload => {
    try { cb(payload); }
    catch (e) { console.error('[AI成績] 完了表示に失敗', e); }
  };
  function step() {
    try {
      targets.slice(i, i + BATCH).forEach(r => {
        try {
          const result = computeYosoScoredArchived('31', r.raceDate, r.raceNo, r.horseKeys);
          if (!result || !result.scored || !result.scored.length) throw new Error('予想スコアなし');
          const mk = _aiSeisekiMonthKey(r.raceDate);
          if (!byMonth[mk]) byMonth[mk] = _aiSeisekiEmptyAgg();
          result.scored.forEach((s, idx) => {
            if (s.totalScore == null) return;  // null馬に印なし（他画面と同じ規約）
            const mark = AI_SEISEKI_MARKS[idx]; if (!mark) return;
            const c = parseInt(s.horse.chakujun); if (isNaN(c) || c < 1) return;
            [byMonth[mk][mark], cumulative[mark]].forEach(a => {
              a.n++; if (c === 1) a.win++; if (c <= 2) a.top2++; if (c <= 3) a.top3++;
            });
          });
          processed[r.key] = r.resultSignature;
          delete failed[r.key];
        } catch (e) {
          skipped++;
          failed[r.key] = r.resultSignature;
          console.warn('[AI成績] レース集計をスキップ', r.key, e);
        }
      });
      i += BATCH;
      notify({ ...baseMeta, done: Math.min(i, targets.length), total: targets.length, skipped });
      if (i < targets.length) { setTimeout(step, 0); return; }

      const modelNow = buildRankingModelIdentity();
      const dataNow = _aiFingerprint(_aiSeisekiListFinishedRaces().map(r => [r.key, r.resultSignature]));
      const modelChanged = modelNow.fingerprint !== model.fingerprint;
      const dataChanged = dataNow !== inputDataFingerprint;
      if (modelChanged || dataChanged) {
        // 背景同期の完了まで自動再開を続けると、永遠に完了しない。今回は暫定値を表示し、
        // 次回表示時に安定した入力で再集計する（混在した結果はキャッシュへ保存しない）。
        window._aiSeisekiLastRestart = { at: new Date().toISOString(), action: 'deferred',
          modelBefore: model.fingerprint, modelAfter: modelNow.fingerprint,
          dataBefore: inputDataFingerprint, dataAfter: dataNow };
        finish({ byMonth, cumulative, model,
          error: modelChanged ? '集計中にAIモデルが更新されました。もう一度集計してください。' : '',
          meta: { ...baseMeta, skipped, dataChanged, modelChanged, cached: false } });
        return;
      }
      _aiSeisekiWriteCache(ctx, {
        type: 'aiSeisekiCache', schema: AI_SEISEKI_CACHE_SCHEMA, modelFingerprint: model.fingerprint,
        scoreContractVersion: model.scoreContractVersion, featurePipelineVersion: model.featurePipelineVersion,
        modelSource: model.source, modelSourceKey: model.sourceKey, processed, failed,
        finishedRaceCount: races.length, totalAvailableRaceCount: totalAvailable,
        scopeMaxRaces: AI_SEISEKI_MAX_RACES, byMonth, cumulative, builtAt: new Date().toISOString(),
      });
      finish({ byMonth, cumulative, model,
        meta: { ...baseMeta, skipped, dataChanged: false, modelChanged: false, cached: true } });
    } catch (e) {
      console.error('[AI成績] 集計を継続できません', e);
      finish({ byMonth, cumulative, model, error: e?.message || String(e),
        meta: { ...baseMeta, skipped, cached: false } });
    }
  }
  if (targets.length) step();
  else finish({ byMonth, cumulative, model,
    meta: { ...baseMeta, skipped: Object.keys(failed).length, dataChanged: false, modelChanged: false, cached: true } });
}
function _aiSeisekiInitialResult() {
  const model = buildRankingModelIdentity();
  const cache = _aiSeisekiReadCache(_aiSeisekiCacheContext(model));
  // 一度完了した端末集計は再計算せず即時利用する。旧仕様の全期間キャッシュは混ぜない。
  if (cache && cache.scopeMaxRaces === AI_SEISEKI_MAX_RACES && cache.byMonth && cache.cumulative) {
    const dates = Object.keys(cache.byMonth).sort();
    return { byMonth: cache.byMonth, cumulative: cache.cumulative, model,
      meta: { sourceKind: 'device_cache', selectedRaceCount: cache.finishedRaceCount || 0,
        totalAvailable: cache.totalAvailableRaceCount || cache.finishedRaceCount || 0,
        firstDate: dates[0] ? dates[0].replace('-', '/') + '/01' : '',
        lastDate: dates.length ? dates[dates.length - 1].replace('-', '/') : '',
        skipped: Object.keys(cache.failed || {}).length, cached: true } };
  }
  return { byMonth: {}, byYear: AI_SEISEKI_SHIPPED.byYear, cumulative: AI_SEISEKI_SHIPPED.cumulative, model: null,
    meta: { sourceKind: 'shipped_audit', selectedRaceCount: AI_SEISEKI_SHIPPED.raceCount,
      firstDate: AI_SEISEKI_SHIPPED.startDate, lastDate: AI_SEISEKI_SHIPPED.endDate,
      skipped: 0, cached: true } };
}

function _renderAiSeisekiResult(el, result, prevSel) {
  const byMonth = result.byMonth || {};
  const cumulative = result.cumulative || _aiSeisekiEmptyAgg();
  const model = result.model;
  const error = result.error || '';
  const meta = result.meta || {};
  const hasRows = Object.values(cumulative).some(a => a && a.n > 0);
  if (error && !hasRows) {
    el.innerHTML = `<div style="padding:12px 14px;border:1px solid #7f1d1d;background:#2a1118;border-radius:8px;color:#fecaca;font-size:13px;line-height:1.7">
      <strong>端末データで再集計できませんでした</strong><br>${escapeHTML(error)}<br>
      <button type="button" onclick="_aiSeisekiVisibleResult=null;renderAiSeisekiPage()" style="margin-top:10px;padding:7px 12px;border:1px solid #38bdf8;border-radius:6px;background:#0c4a6e;color:#e0f2fe;cursor:pointer">固定評価に戻る</button>
    </div>`;
    return;
  }
  // 期間の刻みは出所で変わる：配信の監査済み固定評価＝年度別、端末の再集計＝月別。
  const byYear = result.byYear || {};
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
  const periods = years.length
    ? years.map(y => ({ key: y, label: `${y}年`, agg: byYear[y].agg }))
    : months.map(m => ({ key: m, label: `${m.replace('-', '年')}月`, agg: byMonth[m] }));
  const periodMap = Object.fromEntries(periods.map(p => [p.key, p.agg]));
  const curSel = periodMap[prevSel] ? prevSel : 'cumulative';
  const periodOptions = ['<option value="cumulative">対象期間の累計</option>']
    .concat(periods.map(p => `<option value="${p.key}">${p.label}</option>`)).join('');
  const agg = curSel === 'cumulative' ? cumulative : (periodMap[curSel] || _aiSeisekiEmptyAgg());
  const pct = (num, den) => den > 0 ? (num / den * 100).toFixed(1) + '%' : '—';
  const rows = ['◎', '○', '▲', '△', '×'].map(mark => {
    const a = agg[mark] || { n: 0, win: 0, top2: 0, top3: 0 };
    return `<tr><td class="ais-mark">${mark}</td><td>${a.n}</td><td>${pct(a.win, a.n)}</td><td>${pct(a.top2, a.n)}</td><td>${pct(a.top3, a.n)}</td></tr>`;
  }).join('');
  const isShipped = meta.sourceKind === 'shipped_audit';
  const scope = isShipped
    ? `${AI_SEISEKI_SHIPPED.startDate}〜${AI_SEISEKI_SHIPPED.endDate}の${AI_SEISEKI_SHIPPED.raceCount}R`
    : `${escapeHTML(meta.firstDate || '')}〜${escapeHTML(meta.lastDate || '')}の直近${meta.selectedRaceCount || 0}R`;
  const totalNote = !isShipped && meta.totalAvailable > meta.selectedRaceCount ? `（保存済み全${meta.totalAvailable}Rから抽出）` : '';
  const warn = [
    error ? `⚠ ${escapeHTML(error)}` : '',
    meta.dataChanged ? '⚠ 過去データの同期中に内容が変わったため、今回は暫定値です。' : '',
    meta.skipped ? `⚠ データ不足または例外のある${meta.skipped}Rを除外しました。` : ''
  ].filter(Boolean).join('<br>');
  const controls = periods.length
    ? `<label>集計期間：<select id="aiseiseki-month-sel" onchange="renderAiSeisekiPage()">${periodOptions}</select></label>`
    : `<span style="font-size:12px;color:#bae6fd;font-weight:700">監査済み固定評価</span>`;
  // 年度別の一覧（各年を1行で見比べる）。年の刻みがある時だけ出す。
  const yearTable = years.length ? `
    <h3 class="ais-h3">年度別の成績</h3>
    <div style="overflow-x:auto"><table class="ais-table">
      <thead><tr><th>年</th><th>対象レース</th><th>◎1着率</th><th>◎複勝率</th><th>○複勝率</th><th>▲複勝率</th></tr></thead>
      <tbody>${years.map(y => {
        const v = byYear[y], a = v.agg || {};
        const h = m => a[m] || { n: 0, win: 0, top2: 0, top3: 0 };
        const partial = v.endDate && v.endDate < `${y}/12/31` ? `<span class="ais-partial">（${escapeHTML(v.endDate.slice(5))}まで）</span>` : '';
        return `<tr><td class="ais-year">${escapeHTML(y)}年${partial}</td><td>${v.raceCount || 0}</td>
          <td>${pct(h('◎').win, h('◎').n)}</td><td>${pct(h('◎').top3, h('◎').n)}</td>
          <td>${pct(h('○').top3, h('○').n)}</td><td>${pct(h('▲').top3, h('▲').n)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>` : '';
  const note = isShipped
    ? `<strong>集計範囲:</strong> ${scope}。完全な出走馬集合のうち、現行AI近似スコアが全頭揃い1〜3着が一意のレースです。スコア欠損${AI_SEISEKI_SHIPPED.excludedIncompleteScore}R・同着等${AI_SEISEKI_SHIPPED.excludedInvalidTop3}Rは除外しています（古い年ほど欠損が多く、対象レース数は実際の開催数より少なくなります）。${AI_SEISEKI_SHIPPED.endDate}以降は未集計です。<br>
       <strong>評価方法:</strong> ${AI_SEISEKI_SHIPPED.rankingLabel}による監査用の固定参考値です。当時表示した実印でも、端末の現在係数による完全な再計算でもありません。`
    : `<strong>集計範囲:</strong> ${scope}${totalNote}。この端末の現在AIを過去へ当てはめ直した参考値で、当時表示した実印ではありません。<br>
       集計モデル: <code>${escapeHTML(model?.fingerprint || '不明')}</code>／${escapeHTML(model?.source || '不明')}。`;
  el.innerHTML = `
    ${warn ? `<div style="margin-bottom:10px;padding:8px 10px;border:1px solid #854d0e;background:#2b2109;border-radius:7px;color:#fde68a;font-size:12px;line-height:1.6">${warn}</div>` : ''}
    <div class="ais-controls" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      ${controls}
      <button type="button" onclick="rebuildAiSeisekiFromDevice()" style="padding:6px 10px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#cbd5e1;font-size:11px;cursor:pointer" title="現在の端末データを最大${AI_SEISEKI_MAX_RACES}R再計算します。完了まで時間がかかる場合があります。">端末データで再集計</button>
    </div>
    <div style="overflow-x:auto"><table class="ais-table">
      <thead><tr><th>印</th><th>対象頭数</th><th>1着率</th><th>連対率</th><th>複勝率</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${yearTable}
    <div class="ais-note">${note}</div>
    <div id="ai-opponent-audit"></div>`;
  const sel = document.getElementById('aiseiseki-month-sel');
  if (sel) sel.value = curSel;
  if (window.kvAiRenderOpponentAudit) window.kvAiRenderOpponentAudit('ai-opponent-audit');
}

function renderAiSeisekiPage() {
  const el = document.getElementById('aiseiseki-body');
  if (!el) return;
  const prevSel = document.getElementById('aiseiseki-month-sel')?.value || 'cumulative';
  if (!_aiSeisekiVisibleResult) _aiSeisekiVisibleResult = _aiSeisekiInitialResult();
  _renderAiSeisekiResult(el, _aiSeisekiVisibleResult, prevSel);
}

// 重い過去再採点は明示操作時だけ実行する。ページを開くだけでは呼ばない。
function rebuildAiSeisekiFromDevice() {
  const el = document.getElementById('aiseiseki-body');
  if (!el) return;
  el.innerHTML = `<div id="aiseiseki-loading" style="padding:4px 0 2px">
    <div id="aiseiseki-progress-label" style="color:#94a3b8;font-size:13px;margin-bottom:8px">端末データの集計対象を確認中...</div>
    <div style="height:4px;background:#1e293b;border-radius:999px;overflow:hidden"><div id="aiseiseki-progress-bar" style="height:100%;width:4%;background:linear-gradient(90deg,#22d3ee,#8b5cf6);transition:width .18s"></div></div>
    <button type="button" onclick="renderAiSeisekiPage()" style="margin-top:12px;padding:6px 10px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#cbd5e1;font-size:11px;cursor:pointer">固定評価を表示</button>
  </div>`;
  const startBuild = () => _aiSeisekiBuildOrUpdate(result => {
    result.meta = { ...(result.meta || {}), sourceKind: 'device_live' };
    _aiSeisekiVisibleResult = result;
    renderAiSeisekiPage();
  }, progress => {
    const label = document.getElementById('aiseiseki-progress-label');
    const bar = document.getElementById('aiseiseki-progress-bar');
    if (!label || !bar) return;
    const total = Number(progress.total) || 0;
    const done = Math.min(Number(progress.done) || 0, total);
    const progressPct = total ? Math.round(done / total * 100) : 100;
    const reused = Number(progress.reusedRaceCount) || 0;
    label.textContent = total
      ? `端末データを再集計中 ${done}/${total}R${reused ? `（${reused}Rはキャッシュ済み）` : ''}`
      : '端末の保存済み集計を確認しています...';
    bar.style.width = `${Math.max(4, progressPct)}%`;
  });
  _ensureRaceIntelligence().then(startBuild).catch(() => {
    el.innerHTML = _kvAsyncStateHtml('error','端末データを再集計できません','過去データを準備できませんでした','rebuildAiSeisekiFromDevice()');
  });
}

function renderTrackTrend() {
  buildSavedGroups();
  const wrap = document.getElementById('track-trend-table');
  if (!wrap) return;
  const babaFilter = document.getElementById('track-trend-baba')?.value || '';
  let groups = (_savedGroups || []).filter(g => !babaFilter || g.baba === babaFilter);
  if (!groups.length) {
    wrap.innerHTML = '<p class="no-data">データがありません</p>';
    return;
  }
  // ── 表示期間で絞る（既定＝直近1年）──
  // 【2026-08-04】保存済みの全開催日（高知だけで1,349日）を一度に描くと1行あたり約20要素・
  // HTML約2.5MBになり、この画面を開くと4.4秒メインスレッドが止まっていた。
  // 古い日まで見たい時は「全期間」を選べば従来と同じ表になる。
  const _periodSel = document.getElementById('track-trend-period');
  const _periodDays = _periodSel ? (parseInt(_periodSel.value) || 0) : 365;
  const _totalDays = groups.length;
  if (_periodDays > 0) {
    const _today = _kvTodayYmd();
    const _inPeriod = groups.filter(g => dateDiffDays(_today, g.date) <= _periodDays);
    // 期間内が空（長く開いていない等）なら、空表にせず直近ぶんだけ出す
    groups = _inPeriod.length ? _inPeriod : groups.slice(0, 60);
  }
  const _shownNote = _totalDays > groups.length
    ? `<p style="font-size:11px;color:#6b7280;margin:0 0 8px">全${_totalDays.toLocaleString()}日のうち直近${groups.length.toLocaleString()}日を表示中（右上の期間で切り替え）</p>`
    : '';
  const lsData = lsRead();

  // 全グループのbias・condを事前計算
  const biasMetaArr = groups.map(g => getDayBiasMeta(g.baba, g.date));
  const biasArr = biasMetaArr.map(m => m.bias);
  const condArr  = groups.map(g => getDayTrackCond(g.baba, g.date));

  // 条件内比較（COND_STANDARDS基準との差）を事前計算
  const condBiasArr = groups.map((g, i) => getDayCondBias(g.baba, g.date, condArr[i]));
  // 馬アンカー方式（同一馬の自己比較）を事前計算
  const horseBiasArr = groups.map(g => getHorseAnchoredBias(g.baba, g.date));

  const rows = groups.map((g, idx) => {
    const bias = biasArr[idx];
    const biasMeta = biasMetaArr[idx];
    const cond = condArr[idx];
    const ds = getDaySettings(g.baba, g.date);
    const memoVal = (ds.memo || '').replace(/"/g, '&quot;');

    // 馬場差（良比較）＋距離別内訳
    let biasCell = `<span style="color:#9ca3af">—</span>`;
    if (bias !== null && bias !== undefined) {
      const sign = bias < 0 ? '−' : '+';
      const abs  = Math.abs(bias).toFixed(2);
      const col  = bias < -0.05 ? '#1d4ed8' : bias > 0.05 ? '#dc2626' : '#059669';
      const distEntries = Object.entries(biasMeta.byDist || {}).sort(([a],[b]) => +a - +b);
      const distHtml = distEntries.length >= 2
        ? `<div style="margin-top:3px;display:flex;gap:5px;justify-content:center;flex-wrap:wrap">${
            distEntries.map(([d, item]) => {
              if (item.bias == null) return `<span style="font-size:9px;color:#94a3b8" title="3R未満のため日全体値へフォールバック">${d}:—(n=${item.n})</span>`;
              const s = item.bias < 0 ? '−' : '+';
              const c = item.bias < -0.1 ? '#2563eb' : item.bias > 0.1 ? '#dc2626' : '#059669';
              return `<span style="font-size:9px;color:#64748b">${d}:<span style="color:${c};font-weight:700">${s}${Math.abs(item.bias).toFixed(1)}</span>(n=${item.n})</span>`;
            }).join('')
          }</div>`
        : '';
      const conf = biasMeta.confidence === 'high' ? '信頼高' : biasMeta.confidence === 'medium' ? '参考' : '暫定';
      const runaway = biasMeta.runawayAdjustedCount ? `・圧勝補正${biasMeta.runawayAdjustedCount}R` : '';
      biasCell = `<span style="font-weight:700;color:${col};font-size:13px">${sign}${abs}秒</span><div style="font-size:9px;color:#94a3b8">${conf}・n=${biasMeta.count}R${runaway}</div>${distHtml}`;
    }

    // 馬基準差（馬アンカー方式：同一馬の自己比較なのでメンバーの強弱に依存しない）
    const hb = horseBiasArr[idx];
    let horseBiasCell = `<span style="color:#cbd5e1;font-size:11px">—</span>`;
    if (hb && hb.bias !== null) {
      const hSign = hb.bias < 0 ? '−' : '+';
      const hAbs  = Math.abs(hb.bias).toFixed(2);
      const hCol  = hb.bias < -0.05 ? '#1d4ed8' : hb.bias > 0.05 ? '#dc2626' : '#059669';
      // 基準時計方式との乖離が大きい日＝メンバーに時計が引っ張られた疑い
      const gap = (bias !== null && bias !== undefined) ? Math.abs(hb.bias - bias) : 0;
      const warn = gap >= 0.8 ? `<div style="font-size:9px;color:#d97706;margin-top:2px">⚠基準時計と${gap.toFixed(1)}秒差</div>` : '';
      horseBiasCell = `<div class="hb-cell" onclick="toggleHorseBiasDetail('${g.baba}','${g.date}',this)" title="クリックで人気帯別の内訳（メンバー汚染チェック）"><span style="font-weight:700;color:${hCol};font-size:13px">${hSign}${hAbs}秒</span><div style="font-size:9px;color:#94a3b8;margin-top:1px">n=${hb.n}頭 ▾</div>${warn}</div>`;
    }

    // 条件内比較（条件別基準との差）
    const condDiff = condBiasArr[idx];
    let condCell2 = `<span style="color:#cbd5e1;font-size:11px">—</span>`;
    if (condDiff !== null) {
      const sign = condDiff < 0 ? '−' : '+';
      const abs  = Math.abs(condDiff).toFixed(2);
      const col  = condDiff < -0.1 ? '#0891b2' : condDiff > 0.1 ? '#9333ea' : '#059669';
      condCell2 = `<span style="font-weight:600;color:${col};font-size:12px">${sign}${abs}秒</span>`;
    }

    const condNames = Object.keys(biasMeta.conditions || {});
    const condLabel = condNames.length > 1 ? condNames.join('→') : cond;
    const condCell = condLabel
      ? `<span class="track-cond-badge track-cond-${trackCondClass(cond)}" style="padding:2px 8px;border-radius:8px;font-size:12px" title="${condNames.map(c=>`${c}:${biasMeta.conditions[c]}R`).join(' / ')}">${condLabel}</span>`
      : `<span style="color:#9ca3af">—</span>`;

    return `<tr class="tt-row" style="border-bottom:1px solid #f1f5f9">
      <td class="tt-date" style="padding:8px 10px;white-space:nowrap;font-weight:600;color:#1a1a2e">${g.date}</td>
      <td class="tt-baba" style="padding:8px 10px;white-space:nowrap;color:#374151">${getBabaName(g.baba)}</td>
      <td class="tt-cell" data-label="馬場状態" style="padding:8px 10px;text-align:center">${condCell}</td>
      <td class="tt-cell" data-label="時計馬場差" style="padding:8px 10px;text-align:center">${biasCell}</td>
      <td class="tt-cell" data-label="馬基準差" style="padding:8px 10px;text-align:center">${horseBiasCell}</td>
      <td class="tt-cell" data-label="条件内比較" style="padding:8px 10px;text-align:center">${condCell2}</td>
      <td class="tt-cell" data-label="レース数" style="padding:8px 4px;color:#6b7280;font-size:11px;text-align:center" title="基準計算に使えたレース数 / 保存レース数">${biasMeta.count}/${g.races.length}R</td>
      <td class="tt-memo" style="padding:8px 10px;min-width:160px">
        ${isAdminMode()
          ? `<input type="text" value="${memoVal}" placeholder="馬場傾向を入力..."
              onchange="saveDaySettings('${g.baba}','${g.date}',{memo:this.value})"
              style="width:100%;padding:5px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:12px;color:#374151;outline:none;background:#fff"
              onfocus="this.style.borderColor='#93c5fd'" onblur="this.style.borderColor='#e2e8f0'">`
          : (ds.memo ? `<span style="font-size:12px;color:#374151">${memoVal}</span>` : `<span style="font-size:11px;color:#cbd5e1">—</span>`)
        }
      </td>
    </tr>`;
  }).join('');

  // 2026-07-11：閲覧者もメモ以外は今まで通り見えるが、日付/競馬場/馬場状態/R数は幅を絞り、
  // 馬場傾向メモに横幅を回して長文でも折り返し表示できるようにする（テーブルは固定レイアウト化）。
  wrap.innerHTML = `${_shownNote}<table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">
    <colgroup>
      <col style="width:9%"><col style="width:7%"><col style="width:7%">
      <col style="width:13%"><col style="width:13%"><col style="width:11%">
      <col style="width:6%"><col style="width:34%">
    </colgroup>
    <thead>
      <tr style="background:#f4f6fa;font-size:11px;color:#6b7280;text-align:left">
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0">日付</th>
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0">競馬場</th>
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;text-align:center">馬場状態</th>
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;text-align:center">時計馬場差<br><span style="font-size:9px;font-weight:400;color:#9ca3af">良比較・展開補正なし</span></th>
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;text-align:center">馬基準差<br><span style="font-size:9px;font-weight:400;color:#9ca3af">同一馬の自己比較</span></th>
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;text-align:center">条件・年度内比較<br><span style="font-size:9px;font-weight:400;color:#9ca3af">同馬場＋近年水準との差</span></th>
        <th style="padding:8px 4px;border-bottom:2px solid #e2e8f0;text-align:center">R数</th>
        <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0">馬場傾向メモ${isAdminMode() ? '' : '<span style="font-size:9px;font-weight:400;color:#9ca3af">（閲覧のみ）</span>'}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  // 1400m ペース別 前残り傾向（同じ競馬場フィルタで連動）
  try { renderPaceBias1400(babaFilter); } catch(e) { console.warn('[paceBias1400]', e); }
}

/**
 * renderPaceBias1400(babaFilter)
 * 1400m戦を「馬場状態 × 前後半差ペース」で集計し、前残り/前つぶれ傾向を表示。
 * 前半3F＝1着タイム−上がり4F（backfill済み）、上がり3F＝レース上がり(1着馬基準)。
 */
/**
 * _collectPaceRaces(babaFilter, distNum)
 * 指定距離の戦を抽出し、馬場状態・前後半差・前残り指標を返す（馬名インデックスで高速化）。
 * renderPaceBias1400 と buildPaceBiasMatrix の共通基盤。
 * 【2026-07-10】旧名_collect1400PaceRacesは1400m固定だったため、総合スコア側のcornMod伸縮に
 * 1400m専用の行列を1300m/1600mへも誤って適用していた（buildPaceBiasMatrixに距離不問で1400mしか
 * 渡していなかった）。距離を引数化し、スコア側は現在レースの距離で行列を構築するよう修正。
 */
function _collectPaceRaces(babaFilter, distNum, asOfDate, asOfRaceNo) {
  const distStr = String(distNum || 1400);
  const all = lsRead();
  // 馬エントリを raceKey でグルーピング（1パス）
  const byRace = new Map();
  for (const [k, hv] of Object.entries(all)) {
    if (!hv || hv.type !== 'horse' || hv.fromOfficial) continue;
    if (babaFilter && hv.baba_code !== babaFilter) continue;
    const rk = `${hv.baba_code}_${hv.race_date}_${String(hv.race_no)}`;
    let arr = byRace.get(rk);
    if (!arr) { arr = []; byRace.set(rk, arr); }
    const c = parseInt(hv.chakujun);
    arr.push({ chaku: isNaN(c) ? 99 : c, corner: hv.corner || '' });
  }
  const fc = s => { const n = parseInt(String(s).split('-')[0]); return isNaN(n) ? null : n; };
  const races = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('race_')) continue;
    if (babaFilter && v.baba_code !== babaFilter) continue;
    if (String(v.distance || '').replace(/[^\d]/g, '') !== distStr) continue;
    const raceDate = String(v.race_date || v.raceDate || k.split('_')[2] || '');
    const raceNo = parseInt(v.race_no || v.raceNo || k.split('_')[3]) || 0;
    if (asOfDate && !(raceDate < asOfDate || (raceDate === asOfDate && raceNo < (parseInt(asOfRaceNo) || 0)))) {
      continue;
    }
    const f3 = parseFloat(v.first3f), a3 = parseFloat(v.agari3f_race);
    if (isNaN(f3) || isNaN(a3)) continue;
    const horses = byRace.get(`${v.baba_code}_${v.race_date}_${String(v.race_no)}`);
    if (!horses || horses.length < 5) continue;
    const field = horses.length;
    const winner = horses.find(h => h.chaku === 1);
    if (!winner || !winner.corner) continue;
    const wc1 = fc(winner.corner); if (wc1 == null) continue;
    const leader = horses.find(h => fc(h.corner) === 1);
    races.push({
      raceDate, raceNo,
      cond: v.track_cond || '',
      raceClass: v.race_class || v.raceClass || '',
      first3f: f3,
      diff: +(f3 - a3).toFixed(1),
      maeKecchaku: (wc1 / field) <= 0.33,
      leaderTop3: leader ? (leader.chaku <= 3) : null
    });
  }
  return races;
}

// 前後半差 → ペース区分（マイナス＝前が速い＝ハイ）
function _paceOfDiff(diff) { return diff <= -0.5 ? 'ハイ' : diff <= 0.5 ? '平均' : 'スロー'; }

/** 表示用ペース区分。固定の前後半差ではなく、距離×クラス×馬場のpace-v2基準を優先する。 */
function _paceOfRecordV2(r, distNum) {
  try {
    const api = window.KvPaceV2Shadow;
    const baseline = window.KOCHI_PACE_BASELINES_V2;
    const entry = api?.baselineEntry?.(baseline, distNum, r.raceClass, r.cond, 'live');
    const key = api?.classify?.(r.first3f, entry);
    if (key === 'high') return 'ハイ';
    if (key === 'slow') return 'スロー';
    if (key === 'middle') return '平均';
  } catch (e) { _kvSwallow('_paceOfRecordV2', e); }
  const effCls = getEffectiveClass(r.raceClass || '');
  const standard = getStandardF3(distNum, effCls, r.cond);
  if (standard != null && Number.isFinite(r.first3f)) {
    const dev = r.first3f - standard;
    return dev <= -0.4 ? 'ハイ' : dev >= 0.4 ? 'スロー' : '平均';
  }
  return _paceOfDiff(r.diff);
}

/**
 * buildPaceBiasMatrix(babaFilter, distNum)
 * 指定距離の戦から「馬場状態 × ペース」別の逃げ馬複勝率を集計。
 * getPaceBiasFactor 用。各区分で {N, fuku, rate} を保持。
 * 【2026-07-10】distNum省略時は1400固定（従来互換）。総合スコア側は必ず現在レースの距離を渡すこと。
 * サンプルが薄い距離はgetPaceBiasFactor側のN<20ガードでfactor=1に自動フォールバックする。
 * ※メモ化しない：backfillで first3f が後から増えても件数(キー数)は変わらず
 *   古い行列を返してしまうため。スキャンは軽量なので毎回構築する。
 */
function buildPaceBiasMatrix(babaFilter, distNum, asOfDate, asOfRaceNo, precollected) {
  const source = Array.isArray(precollected) ? precollected : _collectPaceRaces(babaFilter, distNum || 1400);
  const races = asOfDate ? source.filter(r =>
    r.raceDate < asOfDate || (r.raceDate === asOfDate && r.raceNo < (parseInt(asOfRaceNo) || 0))
  ) : source;
  const stat = rs => {
    const leaders = rs.filter(r => r.leaderTop3 != null);
    const fuku = leaders.filter(r => r.leaderTop3).length;
    return { N: leaders.length, fuku, rate: leaders.length ? fuku / leaders.length : null };
  };
  const CONDS = ['良', '稍重', '重', '不良'], PACES = ['ハイ', '平均', 'スロー'];
  const m = { overall: stat(races), byCond: {}, byPace: {}, byCondPace: {} };
  for (const c of CONDS) m.byCond[c] = stat(races.filter(r => r.cond === c));
  for (const p of PACES) m.byPace[p] = stat(races.filter(r => _paceOfDiff(r.diff) === p));
  for (const c of CONDS) {
    m.byCondPace[c] = {};
    for (const p of PACES) m.byCondPace[c][p] = stat(races.filter(r => r.cond === c && _paceOfDiff(r.diff) === p));
  }
  return m;
}

/**
 * predictRacePaceFromA4C(a4cArr, fieldSize)
 * 出走各馬の4コーナー平均通過順から先行馬数を数え、ハイ/平均/スローを予測。
 */
function predictRacePaceFromA4C(a4cArr, fieldSize) {
  const known = a4cArr.filter(v => v != null);
  if (known.length < 3 || !fieldSize) return '平均';
  const senkou = known.filter(v => v <= 3.5).length;
  const rate = senkou / fieldSize;
  return rate >= 0.45 ? 'ハイ' : rate >= 0.30 ? '平均' : 'スロー';
}

/**
 * getPaceBiasFactor(matrix, cond, pace)
 * 純粋なペース成分を取り出すため「その馬場の平均」を基準に正規化する。
 * → 平均ペースはほぼ係数1（無補正）、ハイ/スローの逸脱だけが脚質補正を伸縮。
 * 薄いセルは馬場平均へ収縮(shrinkage)。控えめにクランプ [0.8, 1.2]。1=無効。
 */
function getPaceBiasFactor(matrix, cond, pace) {
  if (!matrix || !matrix.overall || matrix.overall.N < 20) return 1;
  // 基準＝その馬場の平均複勝率（馬場データが薄ければ全体平均）
  const condCell = matrix.byCond?.[cond];
  const baseRate = (condCell && condCell.N >= 15 && condCell.rate != null)
    ? condCell.rate : matrix.overall.rate;
  if (baseRate == null) return 1;
  const cell = matrix.byCondPace?.[cond]?.[pace];
  if (!cell || cell.N < 1) return 1;
  const K = 8; // 収縮の強さ（このサンプル数まで馬場平均寄り）
  const effRate = (cell.fuku + baseRate * K) / (cell.N + K);
  const factor = effRate / baseRate;
  return Math.max(0.8, Math.min(1.2, +factor.toFixed(3)));
}

function renderPaceBias1400(babaFilter) {
  const wrap = document.getElementById('pace-bias-1400');
  if (!wrap) return;

  // ── 1400m戦を抽出して指標化（共通基盤・本ページは1400m専用のまま） ──
  const races = _collectPaceRaces(babaFilter, 1400);

  if (!races.length) {
    wrap.innerHTML = '<p class="no-data">1400m戦のデータがありません（上がり4Fが入力された1400m戦が必要です）</p>';
    return;
  }

  const paceOf = r => _paceOfRecordV2(r, 1400);
  const PACES = ['ハイ', '平均', 'スロー'];
  const CONDS = ['良', '稍重', '重', '不良'];
  const paceHint = { 'ハイ': '前が速い', '平均': '', 'スロー': '前が遅い' };

  // セル集計
  const agg = (rs) => {
    const N = rs.length;
    const leaders = rs.filter(r => r.leaderTop3 != null);
    const lf = leaders.filter(r => r.leaderTop3).length;
    const mae = rs.filter(r => r.maeKecchaku).length;
    return {
      N,
      fukuRate: leaders.length ? Math.round(100 * lf / leaders.length) : null,
      maeRate: N ? Math.round(100 * mae / N) : null,
    };
  };

  // 逃げ馬複勝率 → 色（緑=前残り / 赤=前つぶれ）。AI側と同じくN<20は参考値。
  const cellHtml = (rs) => {
    const a = agg(rs);
    if (!a.N) return `<td style="padding:7px 6px;text-align:center;color:#cbd5e1">—</td>`;
    const low = a.N < 20;
    const fr = a.fukuRate;
    let col = '#6b7280';
    if (!low && fr != null) col = fr >= 70 ? '#059669' : fr >= 55 ? '#d97706' : '#dc2626';
    const opacity = low ? '0.45' : '1';
    return `<td style="padding:7px 6px;text-align:center;opacity:${opacity}">
      <div style="font-size:15px;font-weight:800;color:${col}">${fr != null ? fr + '%' : '—'}</div>
      <div style="font-size:9.5px;color:#94a3b8;margin-top:1px">N=${a.N}・前${a.maeRate != null ? a.maeRate + '%' : '—'}</div>
    </td>`;
  };

  const headCells = PACES.map(p =>
    `<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;text-align:center;font-size:11px;color:#6b7280;white-space:nowrap">${p}<br><span style="font-size:9px;font-weight:400;color:#9ca3af">${paceHint[p] || '　'}</span></th>`
  ).join('');

  const condRows = CONDS.map(cond => {
    const rsC = races.filter(r => r.cond === cond);
    const badge = `<span class="track-cond-badge track-cond-${trackCondClass(cond)}" style="padding:2px 9px;border-radius:8px;font-size:12px">${cond}</span>`;
    const cells = PACES.map(p => cellHtml(rsC.filter(r => paceOf(r) === p))).join('');
    const totCell = cellHtml(rsC);
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:7px 10px;text-align:center;white-space:nowrap">${badge}</td>${cells}${totCell}</tr>`;
  }).join('');

  // 全体行
  const totCells = PACES.map(p => cellHtml(races.filter(r => paceOf(r) === p))).join('');
  const grandCell = cellHtml(races);
  const totalRow = `<tr style="border-top:2px solid #e2e8f0;background:#f8fafc">
    <td style="padding:8px 10px;text-align:center;font-weight:800;color:#1a1a2e">全体</td>${totCells}${grandCell}</tr>`;

  wrap.innerHTML = `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;min-width:520px">
      <thead><tr style="background:#f4f6fa">
        <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:center;font-size:11px;color:#6b7280">馬場状態</th>
        ${headCells}
        <th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;text-align:center;font-size:11px;color:#6b7280">全ペース</th>
      </tr></thead>
      <tbody>${condRows}${totalRow}</tbody>
    </table>
  </div>
  <p style="font-size:11px;color:#94a3b8;margin:10px 0 0;line-height:1.7">
    数値＝逃げ馬の複勝率（高い＝前残り）。「前◯◯%」＝前(逃げ・先行)で決着した割合。
    対象1400m戦：<strong>${races.length}R</strong>。
  </p>`;
}

function toggleSavedMonth(ym) {
  _savedMonthOpen[ym] = !_savedMonthOpen[ym];
  renderSavedList();
}

function toggleAllSavedMonths(open) {
  Object.keys(_savedMonthOpen).forEach(k => _savedMonthOpen[k] = open);
  // まだキャッシュにない年月も対象
  _savedGroups.forEach(g => _savedMonthOpen[g.ym] = open);
  renderSavedList();
}

async function restoreSavedDay(date, baba) {
  try { await _ensureRaceIntelligence(); } catch (e) { return; }
  if(typeof initAnalysisDateSelect==='function')initAnalysisDateSelect();
  const sel=document.getElementById('ana-date-select'); if(sel)sel.value=`${date}__${baba}`;
  if(typeof switchPage==='function')switchPage('bunseki');
  if(typeof renderAnalysis==='function')renderAnalysis();
}
function loadSavedDay(date, baba) {
  document.getElementById('race-date').value=date.replace(/\//g,'-');
  document.getElementById('baba-code').value=baba;
  fetchAllRaces();
}
// ── 出馬表タブ：保存済み開催日リスト（タップで即読込・保存データタブを経由しない） ──
function renderDebanDateList() {
  const el = document.getElementById('deban-date-list');
  if (!el) return;
  buildSavedGroups();
  const DOW = ['日','月','火','水','木','金','土'];
  // 閲覧者には公開範囲内（直近1か月＝_KV_VIEWER_PAST_DAYS 日以内）の開催日のみ表示
  const groups = (_savedGroups || []).filter(g => g.baba === '31' && _kvViewerDateAllowed(g.date));
  if (!groups.length) {
    el.innerHTML = (typeof isAdminMode === 'function' && isAdminMode())
      ? '<p style="color:#9ca3af;font-size:13px;line-height:1.8">保存済みの高知データがありません。<br>「検索」タブで開催日を取得すると、ここに一覧が出ます。</p>'
      : '<p style="color:#9ca3af;font-size:13px;line-height:1.8">表示できる出馬表がまだありません。<br>開催日が近づくとここに表示されます。</p>';
    return;
  }
  const byYm = {};
  groups.forEach(g => { (byYm[g.ym] = byYm[g.ym] || []).push(g); });
  const yms = Object.keys(byYm).sort((a, b) => b.localeCompare(a));
  el.innerHTML = yms.map(ym => {
    const monthLabel = ym.replace('/', '年') + '月';
    const items = byYm[ym].map(g => {
      const d = new Date(g.date.replace(/\//g, '-') + 'T00:00:00');
      const dow = isNaN(d) ? '' : DOW[d.getDay()];
      const md = g.date.slice(5);
      const hasResult = g.races.some(r => { const v = r.data; return v && (v.first3f || v.agari4f); });
      return `<button type="button" class="deban-date-item" onclick="restoreFromSaved('${g.date}','31')">
        <span class="ddi-date">${md}<small>(${dow})</small></span>
        <span class="ddi-count">${g.races.length}R</span>
        ${hasResult ? '<span class="ddi-tag">結果</span>' : ''}
        <i class="fas fa-chevron-right ddi-arrow"></i>
      </button>`;
    }).join('');
    return `<div class="ddi-month">${monthLabel}</div><div class="ddi-grid">${items}</div>`;
  }).join('');
}
function showDebanDateList() {
  allRacesData = {};
  if (typeof clearRaceTabs === 'function') clearRaceTabs();
  const area = document.getElementById('race-content-area'); if (area) area.innerHTML = '';
  document.getElementById('deban-date-list-card')?.classList.remove('hidden');
  document.getElementById('race-layout-wrap')?.classList.add('hidden');
  renderDebanDateList();
  window.scrollTo(0, 0);
}
function showDebanRaceView() {
  document.getElementById('deban-date-list-card')?.classList.add('hidden');
  document.getElementById('race-layout-wrap')?.classList.remove('hidden');
  try { renderDebanBias(); } catch (e) { _kvSwallow('showDebanRaceView', e); }
}

/** 本日の好走傾向：読込中の日の確定結果から馬場バイアス（前残り/内外/ペース）を出馬表内に自動表示。 */
function renderDebanBias() {
  const panel = document.getElementById('deban-bias-panel');
  if (!panel) return;
  const races = Object.values(allRacesData || {});
  const runners = [];
  const racePaces = [];
  races.forEach(rd => {
    const rno = rd.raceInfo && rd.raceInfo.raceNo;
    const racePace = rd.raceInfo && (rd.raceInfo.paceType || rd.raceInfo.pace_type);
    if (racePace && (rd.horses || []).some(h => Number.isFinite(parseInt(h.chakujun)) && parseInt(h.chakujun) > 0)) racePaces.push(racePace);
    (rd.horses || []).forEach(h => {
      const ch = parseInt(h.chakujun);
      if (isNaN(ch) || ch < 1) return;
      runners.push({ ch, mukae: h.mukaeShoumen || '', str: h.shoumenStraight || '', pace: h.paceType || '', c1: parseInt(String(h.corner || '').split('-')[0]), rno });
    });
  });
  const resRaces = new Set(runners.map(r => r.rno)).size;
  if (runners.length < 24 || resRaces < 4) {
    panel.className = 'dbias dbias--wait';
    panel.innerHTML = '<span class="dbias-wait-txt"><i class="fas fa-hourglass-half"></i> 本日の好走傾向は、4R以上の確定後に速報表示されます</span>';
    return;
  }
  const winners = runners.filter(r => r.ch <= 3);
  const wN = winners.length;
  const rate = (key, val) => { const tot = runners.filter(r => r[key] === val).length; if (!tot) return null; return { r: Math.round(100 * winners.filter(r => r[key] === val).length / tot), n: tot }; };
  // 前残り度（勝ち上位馬のうち1角3番手以内の割合）
  const frontVals = winners.map(r => r.c1).filter(c => !isNaN(c));
  const frontRate = frontVals.length ? Math.round(100 * frontVals.filter(c => c <= 3).length / frontVals.length) : null;
  // 内外バイアス（勝ち上位馬の向正面が内寄り or 外寄り）
  const innW = winners.filter(r => r.mukae === '最内' || r.mukae === '内').length;
  const outW = winners.filter(r => r.mukae === '外3' || r.mukae === '大外').length;
  const posN = winners.filter(r => r.mukae).length;
  // ペース基調は「馬ごとのペース入力」ではなく、1レースにつき1票で集計する。
  const paceCount = {}; racePaces.forEach(p => { paceCount[p] = (paceCount[p] || 0) + 1; });
  const topPace = Object.keys(paceCount).sort((a, b) => paceCount[b] - paceCount[a])[0];

  const chip = (label, val, tone) => `<span class="dbias-chip dbias-chip--${tone}">${label}<b>${val}</b></span>`;
  const chips = [];
  if (frontRate != null) chips.push(chip('前残り度 ', frontRate + '%', frontRate >= 60 ? 'hot' : frontRate <= 40 ? 'cool' : 'mid'));
  // 内外バイアスは直線（決着）位置の好走率で判定＝バーと一致させる
  const strRate = v => { const tot = runners.filter(r => r.str === v).length; return tot >= 8 ? Math.round(100 * winners.filter(r => r.str === v).length / tot) : null; };
  const inR = strRate('内'), otR = strRate('外');
  if (inR != null && otR != null) {
    const bias = inR > otR + 15 ? ['内有利', 'hot'] : otR > inR + 15 ? ['外有利', 'cool'] : ['内外フラット', 'mid'];
    chips.push(chip('', bias[0], bias[1]));
  }
  if (topPace) chips.push(chip('多くは ', topPace + 'ペース', topPace === 'スロー' ? 'hot' : topPace === 'ハイ' ? 'cool' : 'mid'));

  // 位置別 好走率バー（N≥4の最大値をハイライト・少数Nは淡色）
  const barRow = (title, key, vals) => {
    const cells = vals.map(v => ({ v, d: rate(key, v) })).filter(x => x.d);
    if (!cells.length) return '';
    const elig = cells.filter(c => c.d.n >= 8);
    const mx = elig.length ? Math.max(...elig.map(c => c.d.r)) : -1;
    return `<div class="dbias-bar"><span class="dbias-bar-label">${title}</span>${cells.map(c => `<span class="dbias-seg${(c.d.r === mx && c.d.n >= 8) ? ' dbias-seg--top' : ''}${c.d.n < 8 ? ' dbias-seg--low' : ''}" title="${c.v}：好走率${c.d.r}%・${c.d.n}頭">${c.v}<b>${c.d.r}</b></span>`).join('')}</div>`;
  };
  const bars = barRow('向正面', 'mukae', ['最内', '内', '外2', '外3', '大外'])
    + barRow('直線', 'str', ['内', '中', '外']);

  if (!chips.length && !bars.trim()) {
    panel.className = 'dbias dbias--wait';
    panel.innerHTML = '<span class="dbias-wait-txt"><i class="fas fa-info-circle"></i> この日は位置・ペースの入力がないため傾向を表示できません（分析タブで入力後に反映）</span>';
    return;
  }

  panel.className = 'dbias';
  panel.innerHTML =
    `<div class="dbias-head"><span class="dbias-title"><i class="fas fa-chart-simple"></i> 本日の好走傾向</span>` +
    `<span class="dbias-sub">${resRaces < 6 ? '速報・' : ''}${resRaces}R確定・${wN}好走</span>` +
    `<button class="dbias-more" onclick="_gotoAnaForDay()">詳しく分析 <i class="fas fa-arrow-right"></i></button></div>` +
    `<div class="dbias-chips">${chips.join('')}</div>` +
    `<div class="dbias-bars">${bars}</div>`;
}

/** 出馬表で読込中の日を、分析ページで開く（日付を自動選択して即描画）。 */
function _gotoAnaForDay() {
  const sel = document.getElementById('ana-date-select');
  if (sel && typeof currentDate !== 'undefined' && currentDate) {
    const want = `${currentDate}__${currentBaba}`;
    if (![...sel.options].some(o => o.value === want)) { try { initAnalysisDateSelect(); } catch (e) { _kvSwallow('_gotoAnaForDay', e); } }
    if ([...sel.options].some(o => o.value === want)) sel.value = want;
  }
  switchPage('bunseki');
  setTimeout(() => { try { renderAnalysis(); } catch (e) { _kvSwallow('_gotoAnaForDay#2', e); } }, 0);
}

async function restoreFromSaved(date, baba, silent) {
  if(!_kvViewerDateAllowed(date)){if(!silent)alert(_KV_PAST_HIDDEN_MSG);return;}
  await _ensureDayCacheLoaded(baba, date);
  const lsData=lsRead();
  const dayIndex = _raceDayIndex?.get(`${baba}|${date}`) || null;
  const raceEntries = dayIndex
    ? [...dayIndex.values()].filter(entry => entry.raceVal).map(entry => [entry.raceKey, entry.raceVal]).sort((a,b)=>(a[1].race_no||0)-(b[1].race_no||0))
    : Object.entries(lsData).filter(([,v])=>v.type==='race'&&v.race_date===date&&v.baba_code===baba).sort((a,b)=>(a[1].race_no||0)-(b[1].race_no||0));
  if(!raceEntries.length){if(!silent)alert('このデータには出走表情報が見つかりません。\n「再取得」でkeiba.go.jpから読み込んでください。');return;}
  if(date!==currentDate||baba!==currentBaba){allRacesData={};clearRaceTabs();}
  currentDate=date;currentBaba=baba;
  document.getElementById('race-date').value=date.replace(/\//g,'-');
  document.getElementById('baba-code').value=baba;
  let restoredCount=0;
  raceEntries.forEach(([,raceVal])=>{
    const rn=parseInt(raceVal.race_no); if(isNaN(rn))return;
    const hp=`${baba}_${date}_${rn}_`;
    const indexedKeys = dayIndex?.get(rn)?.horseKeys;
    const horseEntries = indexedKeys
      ? [...indexedKeys].map(k => [k, lsData[k]]).filter(([,v]) => v && v.type === 'horse')
      : Object.entries(lsData).filter(([k,v])=>v.type==='horse'&&k.startsWith(hp));
    const horses=horseEntries.sort((a,b)=>(parseInt(a[0].replace(hp,''))||0)-(parseInt(b[0].replace(hp,''))||0)).map(([k,v])=>{const umaBan=parseInt(k.replace(hp,''));return{chakujun:v.chakujun||'',wakuBan:v.wakuBan||String(Math.ceil(umaBan/2)),umaBan,horseName:v.horseName||`馬番${umaBan}`,belong:v.belong||'',sexAge:v.sexAge||'',kinryo:v.kinryo||'',jockey:v.jockey||'',trainer:v.trainer||'',weight:v.weight||'',ninki:v.ninki||'',odds:v.odds||'',time:v.time||'',diff:v.diff||'',agari3f:v.agari3f||'',corner:v.corner||'',first3f:v.first3f||'',paceType:v.paceType||'',paceTypeAuto:v.paceTypeAuto||'',paceDevAuto:v.paceDevAuto??null,mukaeShoumen:v.mukaeShoumen||'',shoumenStraight:v.shoumenStraight||'',postComment:v.postComment||'',lineageLoginCode:v.lineageLoginCode||''};});
    let _lapTimes = raceVal.lapTimes || null;
    if (!_lapTimes && raceVal.lap_times) { try { _lapTimes = JSON.parse(raceVal.lap_times); } catch(e){ _kvSwallow('restoreFromSaved', e); } }
    // ⛔保存データ側にも無いときだけ、同梱のユーザー手計測ラップで埋める(2026-07-28)。
    if (!_lapTimes || !_lapTimes.some(v => v != null)) _lapTimes = userLapsFor(date, rn) || _lapTimes;
    allRacesData[rn]={raceInfo:{raceDate:date,raceNo:rn,babaCode:baba,raceName:raceVal.race_name||`第${rn}レース`,distance:raceVal.distance||'',raceClass:migrateRaceClass(raceVal.race_class||raceVal.raceClass||'',raceVal.race_name||''),trackCond:raceVal.track_cond||raceVal.trackCond||'',first3f:raceVal.first3f||'',first3fSource:raceVal.first3fSource||raceVal.first3f_source||'',agari4f:raceVal.agari4f||'',agari3f_race:raceVal.agari3f_race||'',paceType:raceVal.paceType||raceVal.pace_type||'',memo:raceVal.memo||'',lapTimes:_lapTimes},horses};
    restoredCount++;
  });
  if(!restoredCount){showError('保存データからの復元に失敗しました');return;}
  rebuildAllTabs();
  const firstRn=Object.keys(allRacesData).map(Number).sort((a,b)=>a-b)[0];
  switchRaceTab(firstRn);
  const st=document.getElementById('save-status');
  if(st){st.textContent=`📂 ${restoredCount}レース分を復元しました（通信なし）`;setTimeout(()=>{st.textContent='';},4000);}
  if(typeof switchPage==='function')switchPage('deban');
  window.scrollTo(0,0);
  // 馬0頭で保存されたレース（パース不具合期にレース情報だけ保存された残骸）はライブ再取得で埋める
  const _emptyRns = Object.keys(allRacesData).map(Number).filter(rn => !allRacesData[rn].horses.length);
  if (_emptyRns.length) _refetchEmptyRaces(date, baba, _emptyRns);
  // 手動で当日カードを開いた時も、表示中レース＋次レースだけを最新化する。
  if (!silent) _kvRefreshTodayPriorityRaces(date, baba, currentRaceNo).catch(e => console.warn('[today priority refresh]', e));
  // 出馬表を開いたら、その日の出走馬の公式成績を共有DBから端末へ入れておく（管理者のみ・裏で実行）。
  _hydrateOfficialHistoriesForDay(date, baba)
    .then(n => { if (n) console.log(`[official history] ${n}頭ぶんを共有DBから取得しました`); })
    .catch(e => console.warn('[official history hydrate]', e));
}

// 保存に馬が無いレースをライブ再取得して差し替える（restoreFromSavedの補修）
async function _refetchEmptyRaces(date, baba, rns) {
  const st = document.getElementById('save-status');
  let fixed = 0;
  for (const rn of rns) {
    if (date !== currentDate || baba !== currentBaba) return;   // 別の日へ移ったら中止
    if (st) st.textContent = `🔄 ${rn}R は保存に馬がいないため再取得中…（${fixed}/${rns.length}）`;
    try {
      const parsed = await fetchOneRace(date, rn, baba);
      if (date !== currentDate || baba !== currentBaba) return;
      if (parsed && parsed.horses && parsed.horses.length) {
        _sanDeep(parsed);
        const prev = allRacesData[rn];   // 保存済みのメモ・ペース・ラップは保持し馬だけ差し替え
        if (prev && prev.raceInfo) {
          parsed.raceInfo.memo    = prev.raceInfo.memo    || parsed.raceInfo.memo;
          parsed.raceInfo.paceType= prev.raceInfo.paceType|| parsed.raceInfo.paceType;
          _mergeFirst3fInfo(prev.raceInfo, parsed.raceInfo);
          if (String(prev.raceInfo.agari4f || '').trim()) parsed.raceInfo.agari4f = prev.raceInfo.agari4f;
          if (String(prev.raceInfo.agari3f_race || '').trim()) parsed.raceInfo.agari3f_race = prev.raceInfo.agari3f_race;
          if (prev.raceInfo.lapTimes && prev.raceInfo.lapTimes.some(v=>v!=null)) parsed.raceInfo.lapTimes = prev.raceInfo.lapTimes;
        }
        allRacesData[rn] = parsed;
        addRaceTab(rn);
        // switchRaceTabは描画済みセクションをキャッシュ再利用するため、0頭で描画された
        // 古いセクションを破棄しないと再描画されない（＝データは埋まるのに画面は0頭のまま）。
        document.getElementById(`race-section-${rn}`)?.remove();
        if (currentRaceNo === rn) switchRaceTab(rn);   // 表示中のレースなら即再描画
        fixed++;
      }
    } catch(e) { _kvSwallow('_refetchEmptyRaces', e); }
  }
  if (st) { st.textContent = fixed ? `✅ 保存に馬が無かった ${fixed}レースを再取得しました` : ''; setTimeout(()=>{ if(st.textContent.startsWith('✅')) st.textContent=''; }, 4000); }
}

// 当日データの優先最新化：保存スナップショットを即表示した後、利用者が見ているレースと
// その次のレースだけをライブ再取得する。全12R一斉取得による通信・DOM更新の集中を避け、
// 他レースはタブを開いた時に同じ経路で更新する。レース単位でセッション中1回に限定する。
const _kvTodayRaceRefreshed = {};
async function _kvRefreshTodayPriorityRaces(date, baba, preferredRaceNo) {
  if (date !== _kvTodaySlash() || baba !== '31') return;
  const rns = Object.keys(allRacesData).map(Number).sort((a, b) => a - b);
  if (!rns.length) return;
  const primary = rns.includes(parseInt(preferredRaceNo)) ? parseInt(preferredRaceNo) : (_kvNextRaceNo() || rns[0]);
  const primaryIndex = Math.max(0, rns.indexOf(primary));
  const targets = [...new Set([primary, rns[primaryIndex + 1]].filter(Number.isFinite))]
    .filter(rn => !_kvTodayRaceRefreshed[`${date}_${baba}_${rn}`]);
  targets.forEach(rn => { _kvTodayRaceRefreshed[`${date}_${baba}_${rn}`] = true; });
  await Promise.all(targets.map(async rn => {
    try {
      const result = await fetchOneRace(date, rn, baba);
      if (date !== currentDate || baba !== currentBaba) {
        delete _kvTodayRaceRefreshed[`${date}_${baba}_${rn}`];
        return;
      }
      if (result && result.horses && result.horses.length) {
        const prev = allRacesData[rn];
        if(prev)result.horses=mergeHorseData(prev.horses,result.horses);
        if (prev && prev.raceInfo) {
          result.raceInfo.memo = prev.raceInfo.memo || result.raceInfo.memo;
          result.raceInfo.paceType = prev.raceInfo.paceType || result.raceInfo.paceType;
          _mergeFirst3fInfo(prev.raceInfo, result.raceInfo);
          if (String(prev.raceInfo.agari4f || '').trim()) result.raceInfo.agari4f = prev.raceInfo.agari4f;
          if (String(prev.raceInfo.agari3f_race || '').trim()) result.raceInfo.agari3f_race = prev.raceInfo.agari3f_race;
          if (prev.raceInfo.lapTimes && prev.raceInfo.lapTimes.some(v => v != null)) result.raceInfo.lapTimes = prev.raceInfo.lapTimes;
        }
        _sanDeep(result);
        allRacesData[rn] = result;
        document.getElementById(`race-section-${rn}`)?.remove();
        if (currentRaceNo === rn) switchRaceTab(rn);
        _kvOddsAutoLast[rn] = Date.now();
        _kvSetOddsAutoNote(rn, '自動更新');
        renderNextRaceHomeCard();
      } else {
        // fetchOneRaceは通信失敗をnullで返す場合がある。成功扱いを残さず次回再試行する。
        delete _kvTodayRaceRefreshed[`${date}_${baba}_${rn}`];
      }
    } catch (e) {
      delete _kvTodayRaceRefreshed[`${date}_${baba}_${rn}`];
      console.warn('[today priority refresh]', rn, e);
    }
  }));
}

async function deleteSavedDay(event, date, baba) {
  event.stopPropagation();
  if(!confirm(`${date} ${getBabaName(baba)} のデータを削除しますか？\n（サーバーからも完全削除されます）`))return;
  const lsData=lsRead(), raceKeys=[], horseKeys=[];
  Object.keys(lsData).forEach(k=>{const v=lsData[k];
    if(v.type==='race'&&v.race_date===date&&v.baba_code===baba)raceKeys.push(k);
    if(v.type==='horse'&&v.race_date===date&&v.baba_code===baba)horseKeys.push(k);
    if(!v.type&&k.startsWith(`race_${baba}_${date}_`))raceKeys.push(k);
    if(!v.type&&k.startsWith(`${baba}_${date}_`))horseKeys.push(k);
  });
  // 馬・レースを個別DELETEすると途中失敗時にサーバーだけ半端な状態になる。
  // DB関数内の1トランザクションで開催日全体を削除し、成功後だけ端末側を消す。
  try {
    const res = await fetch(`${WORKER_URL}/rpc/delete-keiba-day`, {
      method: 'POST',
      headers: {'Content-Type':'application/json','X-Write-Token':getWriteToken()},
      body: JSON.stringify({baba_code:baba, race_date:date}),
      signal:AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 240);
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
  } catch (e) {
    alert(`サーバー削除に失敗したため、端末データは残しました。\n${e.message || e}`);
    return;
  }
  // IndexedDB から削除（旧 localStorage.setItem は不使用）
  [...raceKeys,...horseKeys].forEach(k=>idbDelete(k));
  loadSavedData();
}

function showProgress(show){document.getElementById('progress-section').classList.toggle('hidden',!show);if(show)document.getElementById('progress-race-status').innerHTML='';}
function updateProgress(done,total,rn){document.getElementById('progress-bar').style.width=Math.round((done/total)*100)+'%';const wrap=document.getElementById('progress-bar-wrap');if(wrap){wrap.setAttribute('aria-valuemax',String(total));wrap.setAttribute('aria-valuenow',String(done));}document.getElementById('progress-count').textContent=`${done} / ${total}`;document.getElementById('progress-label').textContent=rn?`${rn}R を取得中...`:`完了（${Object.keys(allRacesData).length}R取得）`;}
function updateProgressStatus(rn,ok){const tag=document.createElement('span');tag.className=`progress-race-tag ${ok?'tag-ok':'tag-fail'}`;tag.textContent=`${rn}R`;document.getElementById('progress-race-status').appendChild(tag);}
function showLoading(show, kind, detail){
  const area=document.getElementById('loading'); if(!area)return;
  area.classList.toggle('hidden',!show);
  if(show){const body=document.getElementById('loading-state-body');if(body)body.outerHTML=_kvAsyncStateHtml(kind==='ai'?'ai':'data',kind==='ai'?'AI予想を計算中':'出馬表データを取得中',detail||(kind==='ai'?'過去走と当日の条件を統合しています':'公式サイトからレース情報を読み込んでいます')).replace('class="kv-async-state"', 'id="loading-state-body" class="kv-async-state"');}
}
function showError(msg, isCalendarHint){
  const el = document.getElementById('error-msg');
  if(el) el.textContent = msg;
  const area = document.getElementById('error-area');
  if(area) area.classList.remove('hidden');
  // カレンダーヒントがある場合はkeiba.go.jpのRaceListリンクを追加表示
  if(isCalendarHint && currentDate && currentBaba) {
    const hintEl = document.getElementById('error-hint');
    if(hintEl) {
      const encodedDate = encodeURIComponent(currentDate);
      const listUrl = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate=${encodedDate}&k_babaCode=${currentBaba}`;
      hintEl.innerHTML = `🔗 <a href="${listUrl}" target="_blank" rel="noopener" style="color:#1a56a0;font-weight:700">keiba.go.jp で開催情報を確認</a>`;
    }
  }
}
function hideError(){document.getElementById('error-area').classList.add('hidden');}
function getPaceBadgeClass(p){return p==='ハイ'?'pace-badge pace-high':p==='ミドル'?'pace-badge pace-mid':p==='スロー'?'pace-badge pace-slow':'pace-badge pace-none';}
function getPaceDotClass(p){return p==='ハイ'?'pace-dot-high':p==='ミドル'?'pace-dot-mid':p==='スロー'?'pace-dot-slow':'';}
function getBabaName(code){return{'31':'高知','01':'帯広','06':'盛岡','07':'水沢','09':'浦和','10':'船橋','11':'大井','12':'川崎','13':'金沢','14':'笠松','15':'名古屋','16':'園田','17':'姫路','19':'福山','21':'佐賀'}[code]||code;}

/** babaCode → keiba-lv-st.jp の track パラメータ名に変換 */
function getTrackName(code) {
  return {
    '31':'kouchi',  // 高知
    '01':'obihiro', // 帯広（ばんえい）
    '06':'morioka', // 盛岡
    '07':'mizusawa',// 水沢
    '09':'urawa',   // 浦和
    '10':'funabashi',// 船橋
    '11':'ooi',     // 大井
    '12':'kawasaki',// 川崎
    '13':'kanazawa',// 金沢
    '14':'kasamatsu',// 笠松
    '15':'nagoya',  // 名古屋
    '16':'sonoda',  // 園田
    '17':'himeji',  // 姫路
    '19':'fukuyama',// 福山
    '21':'saga'     // 佐賀
  }[code] || '';
}

/** レース映像URL を生成（keiba-lv-st.jp） */
function buildMovieUrl(raceDate, raceNo, babaCode) {
  const track = getTrackName(babaCode);
  if (!track || !raceDate) return '';
  // raceDate: "2026/05/23" → "20260523"
  const dateStr = raceDate.replace(/\//g, '');
  return `https://keiba-lv-st.jp/movie/player?date=${dateStr}&race=${raceNo}&track=${track}`;
}

/** 映像パネルの開閉トグル */
function toggleMoviePanel(raceNo) {
  const panel = document.getElementById(`movie-panel-${raceNo}`);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  // 開いたとき初回だけ iframe を生成
  if (isOpen && !panel.dataset.loaded) {
    panel.dataset.loaded = '1';
    const url = panel.dataset.url;
    const wrap = panel.querySelector('.movie-iframe-wrap');
    if (wrap && url) {
      wrap.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay; fullscreen"></iframe>`;
    }
  }
  // ボタンのテキストを更新
  const btn = document.getElementById(`movie-btn-${raceNo}`);
  if (btn) btn.innerHTML = isOpen
    ? '<i class="fas fa-times"></i> 映像を閉じる'
    : '<i class="fas fa-video"></i> レース映像';
}
function trackCondClass(cond){if(!cond)return'none';if(cond==='良')return'good';if(cond==='稍重')return'yaya';if(cond==='重')return'heavy';if(cond==='不良')return'bad';return'none';}
function normalizeWidth(s){return(s||'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));}
function detectRaceClass(rawText){
  const text=normalizeWidth(rawText||'');
  if(!text)return'';
  // 「N歳以上」は年齢限定戦ではない（3歳戦と混同しない）
  const seniorOpen=/(?<![0-9])[2-9]歳以上/.test(text);
  // 年齢クラス最優先（直前が数字でないこと）。「3歳C3以下」は3歳戦のまま。
  if(!seniorOpen){const ageM=text.match(/(?<![0-9])([23])歳/);if(ageM)return ageM[1]+'歳';}
  // 「◯級以下」はその級の枠組みとして扱う（B級以下=B / C級以下=C1）。
  // 「3歳以上B級以下」を年齢限定オープン(A)と誤判定しないよう、A扱いより先に見る。
  const kaigM=text.match(/(?<![A-Za-z])([ABC])([1-5])?級?以下/i);
  if(kaigM){const k=kaigM[1].toUpperCase();return k==='C'?'C'+(kaigM[2]||'1'):k;}
  // N歳以上はA級扱い（年齢限定オープン）
  if(seniorOpen)return'A';
  // 混合戦: 先頭（上位）クラスを返す
  if(/混合/.test(text)){if(/(?<![A-Za-z])A/i.test(text))return'A';if(/(?<![A-Za-z])B/i.test(text))return'B';const cM2=text.match(/(?<![A-Za-z])C([1-5])/i);if(cM2)return'C'+cM2[1];}
  // Cクラス（直前が英字でないこと）
  const cM=text.match(/(?<![A-Za-z])C([1-5])(?:[-－\d]*)/i);if(cM)return'C'+cM[1];
  // B級
  if(/(?<![A-Za-z])B[1-9]?(?:[-－]\d+)?(?![A-Za-z])/i.test(text))return'B';
  // A級
  if(/(?<![A-Za-z])A[1-9]?(?:[-－]\d+)?(?![A-Za-z])/i.test(text))return'A';
  // 重賞（年齢/C/B/Aで判定できなかった場合のみ）
  if(/重賞/.test(text))return'重賞';
  if(/オープン|Open|\bOP\b/i.test(text))return'OP';
  return'';
}
function migrateRaceClass(savedClass,raceName){
  if(!savedClass&&!raceName)return'';
  if(raceName){const f=detectRaceClass(raceName);if(f)return f;}
  const n=normalizeWidth(savedClass);if(n==='特別')return'';return savedClass;
}
function raceClassCssClass(cls){if(!cls)return'class-other';const n=normalizeWidth(cls);if(n==='重賞')return'class-gr';if(/^3歳/.test(n))return'class-3yo';if(/^2歳/.test(n))return'class-2yo';if(/^A/i.test(n))return'class-a';if(/^B/i.test(n))return'class-b';if(/^C1/i.test(n))return'class-c1';if(/^C2/i.test(n))return'class-c2';if(/^C3/i.test(n))return'class-c3';if(/^C[45]/i.test(n))return'class-c4';if(/^C/i.test(n))return'class-c1';return'class-other';}

// ============================================================
// ① 馬別過去成績ポップアップ（インライン版）
// ============================================================
function getHorseHistory(horseName) {
  if (_horseHistCache.has(horseName)) return _horseHistCache.get(horseName);
  const lsData=lsRead();
  let horseKeys;
  if (_horseKeyIndex) {
    const _idx = _horseKeyIndex.get(horseName);
    if (!_idx || !_idx.size) return [];
    horseKeys = [..._idx].map(k => [k, lsData[k]]).filter(([,v]) => v);
  } else {
    horseKeys = Object.entries(lsData).filter(([,v])=>v.type==='horse'&&v.horseName===horseName);
  }
  if(!horseKeys.length)return[];
  const all=horseKeys.map(([k,v])=>{
    let babaCode,raceDate,raceNo,umaBan;
    if(k.startsWith('offi_')){
      babaCode=v._babaCode||'';
      raceDate=v._raceDate||'';
      raceNo  =v._raceNo ||0;
      umaBan  =NaN;
    }else{
      const parts=k.split('_');
      babaCode=parts[0];
      raceDate=parts[1];
      raceNo  =parseInt(parts[2]);
      umaBan  =parseInt(parts[3]);
    }
    const raceVal=lsData[`race_${babaCode}_${raceDate}_${raceNo}`]||{};
    return{raceDate,raceNo,babaCode,raceName:raceVal.race_name||raceVal.raceName||`第${raceNo}レース`,distance:raceVal.distance||v._dist||'',raceClass:raceVal.race_class||raceVal.raceClass||'',_raceClass:v._raceClass||'',trackCond:raceVal.track_cond||raceVal.trackCond||v.trackCond||'',paceTypeRace:raceVal.paceType||raceVal.pace_type||'',chakujun:v.chakujun||'',wakuBan:v.waku_ban||v.wakuBan||'',umaBan:v.umaBan||umaBan,jockey:v.jockey||'',trainer:v.trainer||'',time:v.time||'',diff:v.diff||'',agari3f:v.agari3f||'',first3f:v.first3f||v.first_3f||'',paceType:v.pace_type||v.paceType||'',weight:v.weight||'',kinryo:v.kinryo||'',corner:v.corner||'',mukaeShoumen:v.mukae_shoumen||v.mukaeShoumen||'',shoumenStraight:v.shoumen_straight||v.shoumenStraight||'',postComment:v.postComment||v.post_comment||'',fromOfficial:v.fromOfficial||false,_isJra:v._isJra||false};
  });
  // ── PASS 1: 完全一致（babaCode+raceDate+raceNo）でローカルデータ優先 ──
  const deduped=new Map();
  for(const e of all){
    if(!e.raceDate||!e.babaCode) continue;
    const key=`${e.babaCode}_${e.raceDate}_${e.raceNo}`;
    const ex=deduped.get(key);
    if(!ex||(ex.fromOfficial&&!e.fromOfficial)) deduped.set(key,e);
  }
  // ── PASS 2: 前後1日以内・同raceNo の近似重複除去（offi_ 日付ずれ対策） ──
  // ローカル記録（fromOfficial=false）がある場合、同raceNoのoffi_エントリを除去する
  const _toNum=d=>parseInt((d||'').replace(/\//g,''),10)||0;
  const arr=[...deduped.values()];
  const localSet=new Set(arr.filter(e=>!e.fromOfficial).map(e=>`${e.babaCode}_${e.raceNo}`));
  const cleaned=arr.filter(e=>{
    if(!e.fromOfficial) return true; // ローカルは常に保持
    const sig=`${e.babaCode}_${e.raceNo}`;
    if(!localSet.has(sig)) return true; // 同babaCode+raceNoのローカルがなければ保持
    // ローカルと日付が1日以内ならoffi_は重複と判断して除去
    const eNum=_toNum(e.raceDate);
    return !arr.some(l=>!l.fromOfficial&&`${l.babaCode}_${l.raceNo}`===sig&&Math.abs(_toNum(l.raceDate)-eNum)<=1);
  });
  // ── PASS 3: 非offi_同士でも同raceNo+同タイム+1日差 → 後日エントリを除去（日付ズレ保存バグ対策） ──
  const cleaned3=cleaned.filter(e=>{
    if(e.fromOfficial||!e.time) return true;
    const eNum=_toNum(e.raceDate);
    const dup=cleaned.find(l=>l!==e&&!l.fromOfficial&&l.babaCode===e.babaCode&&l.raceNo===e.raceNo&&l.time===e.time&&Math.abs(_toNum(l.raceDate)-eNum)<=1);
    if(!dup) return true;
    return _toNum(e.raceDate)<=_toNum(dup.raceDate); // 早い日付を残す
  });
  const _result = cleaned3.sort((a,b)=>{const da=a.raceDate.replace(/\//g,''),db=b.raceDate.replace(/\//g,'');return db.localeCompare(da)||b.raceNo-a.raceNo;});
  _horseHistCache.set(horseName, _result);
  return _result;
}

/**
 * getHorseHistoryBefore(horseName, raceDate, raceNo)
 * getHorseHistory()の結果を「指定レースより前」だけに絞り込む。
 * 予想スコアや能力表など"その時点で分かっていたはずの情報だけ"を使うべき
 * 表示・計算は、必ず getHorseHistory() 直接ではなくこちらを使うこと
 * （そうしないと未来のレース結果が過去成績として混入するバグになる）。
 */
function getHorseHistoryBefore(horseName, raceDate, raceNo) {
  const hist = getHorseHistory(horseName);
  const rNo = parseInt(raceNo) || 0;
  return hist.filter(h =>
    h.raceDate < raceDate ||
    (h.raceDate === raceDate && parseInt(h.raceNo) < rNo)
  );
}

// ============================================================
// 距離バッジHTML生成
// ============================================================
/**
 * 距離を色付きバッジで表示
 *   〜1300m → 青（短距離）
 *   1400m   → 緑（マイル前後）
 *   1600m〜 → 赤（中長距離）
 */
function distanceBadgeHtml(distStr) {
  if (!distStr) return '';
  const m = distStr.match(/(\d+)/);
  if (!m) return `<span><i class="fas fa-road"></i> ${distStr}</span>`;
  const d = parseInt(m[1]);
  let bg, border, label;
  if (d <= 1300) {
    bg = '#1d4ed8'; border = '#1e40af'; label = '青（短距離）';
  } else if (d <= 1500) {
    bg = '#16a34a'; border = '#15803d'; label = '緑（中距離）';
  } else {
    bg = '#dc2626'; border = '#b91c1c'; label = '赤（長距離）';
  }
  return `<span style="background:${bg};color:#fff;border:1px solid ${border};border-radius:12px;padding:2px 10px;font-weight:700;font-size:12px;" title="${label}"><i class="fas fa-road" style="margin-right:3px;"></i>${distStr}</span>`;
}

// ============================================================
// レース1件単体保存
// ============================================================
/**
 * 現在表示中のレース1件だけを保存する
 */
async function saveOneRace(raceNo) {
  const data = allRacesData[raceNo];
  if (!data) { alert(`${raceNo}R のデータがありません`); return; }
  const st = document.getElementById('save-status');
  const btn = document.querySelector(`[onclick="saveOneRace(${raceNo})"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...'; }

  try {
    const info = data.raceInfo;
    // 入力値を最新化
    const memoEl = document.getElementById(`race-memo-${raceNo}`); if (memoEl) info.memo = memoEl.value;
    const agari4fEl = document.getElementById(`race-agari4f-${raceNo}`); if (agari4fEl) info.agari4f = agari4fEl.value;
    const agari3fEl = document.getElementById(`race-agari3f-${raceNo}`); if (agari3fEl) info.agari3f_race = agari3fEl.value;
    _autofillFirst3fInData(data);
    const lapTimesJson = (info.lapTimes && info.lapTimes.some(v => v != null)) ? JSON.stringify(info.lapTimes) : '';

    const raceId = `race_${currentBaba}_${currentDate}_${raceNo}`;
    const raceRow = { race_date: currentDate, race_no: raceNo, baba_code: currentBaba, race_name: info.raceName||'', distance: info.distance||'', race_class: info.raceClass||'', track_cond: info.trackCond||'', first3f: info.first3f||'', first3f_source: info.first3fSource||'', agari4f: info.agari4f||'', agari3f_race: info.agari3f_race||'', pace_type: info.paceType||'', memo: info.memo||'', lap_times: lapTimesJson };
    const horseRows = [];
    const localHorses = [];
    let hc = 0;
    const isDebaOne = !!(info._isDebaTable);
    for (const horse of (data.horses || [])) {
      if (!isDebaOne && !(horse.first3f || horse.paceType || horse.mukaeShoumen || horse.shoumenStraight || horse.chakujun || horse.postComment)) continue;
      const horseId = `${currentBaba}_${currentDate}_${raceNo}_${horse.umaBan}`;
      const horseRow = { race_date: currentDate, race_no: raceNo, baba_code: currentBaba, uma_ban: horse.umaBan, waku_ban: horse.wakuBan||'', horse_name: horse.horseName||'', belong: horse.belong||'', sex_age: horse.sexAge||'', kinryo: horse.kinryo||'', jockey: horse.jockey||'', trainer: horse.trainer||'', weight: horse.weight||'', chakujun: horse.chakujun||'', ninki: horse.ninki||'', odds: horse.odds||'', time: horse.time||'', diff: horse.diff||'', agari3f: horse.agari3f||'', corner: horse.corner||'', first3f: horse.first3f||'', pace_type: horse.paceType||'', mukae_shoumen: horse.mukaeShoumen||'', shoumen_straight: horse.shoumenStraight||'', post_comment: horse.postComment||'', lineage_login_code: horse.lineageLoginCode||'' };
      horseRows.push(horseRow);
      localHorses.push([horseId, { type:'horse', chakujun:horseRow.chakujun, wakuBan:horseRow.waku_ban, horseName:horseRow.horse_name, belong:horseRow.belong, sexAge:horseRow.sex_age, kinryo:horseRow.kinryo, jockey:horseRow.jockey, trainer:horseRow.trainer, weight:horseRow.weight, ninki:horseRow.ninki, odds:horseRow.odds, time:horseRow.time, diff:horseRow.diff, agari3f:horseRow.agari3f, corner:horseRow.corner, first3f:horseRow.first3f, paceType:horseRow.pace_type, mukaeShoumen:horseRow.mukae_shoumen, shoumenStraight:horseRow.shoumen_straight, postComment:horse.postComment||'', lineageLoginCode:horse.lineageLoginCode||'', savedAt:new Date().toISOString() }]);
      hc++;
    }
    const saved=await apiSaveRaceBundle(raceId,raceRow,horseRows);_applyFirst3fSaveResult(saved,raceRow,info,raceNo);
    lsWrite(raceId, { type:'race', ...raceRow, first3fSource:info.first3fSource||'', paceType: info.paceType||'', lapTimes: info.lapTimes||null, _apiSaved: true, savedAt: new Date().toISOString() });
    localHorses.forEach(([horseId, row]) => lsWrite(horseId, row));

    if (st) { st.textContent = `✅ ${raceNo}R 保存完了（${hc}頭）`; setTimeout(() => { st.textContent = ''; }, 3000); }
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-check-circle"></i> ${raceNo}R 保存済み`; btn.style.background = '#16a34a'; setTimeout(() => { btn.innerHTML = `<i class="fas fa-save"></i> ${raceNo}R だけ保存`; btn.style.background = '#1a56a0'; btn.disabled = false; }, 3000); }
  } catch(e) {
    console.error('[saveOneRace]', e);
    if (st) st.textContent = `❌ ${raceNo}R 保存失敗: ${e.message || e}`;
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-save"></i> ${raceNo}R だけ保存`; }
  }
}

// ============================================================
// 全レースコメント一括取得
// ============================================================
/**
 * 取得済み全レースのコメントをまとめて取得する
 * 各レース間に少し間隔を開けてCORSプロキシへの負荷を分散
 */
async function fetchAllComments() {
  if (!isAdminMode()) { alert('コメント一括取得は管理者のみ可能です。'); return; }
  const raceNos = Object.keys(allRacesData).map(Number).sort((a, b) => a - b);
  if (!raceNos.length) { alert('先にレースデータを取得してください。'); return; }

  const btn = document.querySelector('[onclick="fetchAllComments()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 取得中...'; }

  // 表示中の日付が2024/03（コメント開始）より前なら取得を試みても全レース空振りで遅いだけ。
  const _cmtDate = allRacesData[raceNos[0]]?.raceInfo?.raceDate || currentDate || '';
  if (_cmtDate && _cmtDate < KV_COMMENT_START) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-info-circle"></i> この日はコメント対象外（2024/03以降）'; btn.style.background = '#d97706';
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-comments"></i> 全レースコメント一括取得'; btn.style.background = '#0e7490'; }, 4000); }
    return;
  }

  let totalMatched = 0;
  let done = 0;
  for (const raceNo of raceNos) {
    const data = allRacesData[raceNo]; if (!data) { done++; continue; }
    const raceDate = data.raceInfo.raceDate || currentDate;
    const horseNames = data.horses.map(h => h.horseName);

    if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${raceNo}R 取得中... (${done}/${raceNos.length})`;

    try {
      const result = await fetchPostRaceComments(raceDate, raceNo, horseNames);
      if (!result.error) {
        let matched = 0;
        data.horses.forEach(horse => {
          const cleanName = (horse.horseName || '').replace(/[\s　]/g, '');
          for (const [k, v] of Object.entries(result.map)) {
            if (k.replace(/[\s　]/g, '') === cleanName) { horse.postComment = v; matched++; break; }
          }
        });
        totalMatched += matched;
        // 現在表示中のレースなら即DOM反映
        if (raceNo === currentRaceNo && matched > 0) {
          _renderCommentsInTable(raceNo);
          if (!_commentVisible) _hideCommentRows(raceNo);
          // ボタン更新
          const commentBtn = document.getElementById(`comment-btn-${raceNo}`);
          if (commentBtn && matched > 0) { commentBtn.innerHTML = `<i class="fas fa-check-circle"></i> コメント取得済み（${matched}頭）`; commentBtn.style.background = '#16a34a'; }
        }
      }
    } catch(e) { /* このレースは失敗、次へ */ }

    done++;
    // 連続リクエストによるレート制限回避のため少し待つ
    if (done < raceNos.length) await new Promise(r => setTimeout(r, 800));
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = totalMatched > 0
      ? `<i class="fas fa-check-circle"></i> 一括取得完了（${totalMatched}件）`
      : `<i class="fas fa-question-circle"></i> 一括取得完了（0件）`;
    btn.style.background = totalMatched > 0 ? '#16a34a' : '#d97706';
    setTimeout(() => { btn.innerHTML = '<i class="fas fa-comments"></i> 全レースコメント一括取得'; btn.style.background = '#0e7490'; btn.disabled = false; }, 5000);
  }
  // 現在表示中レースのコメント行を更新（表示/非表示状態に合わせる）
  if (currentRaceNo != null && allRacesData[currentRaceNo]?.horses.some(h => h.postComment)) {
    _renderCommentsInTable(currentRaceNo);
    if (!_commentVisible) _hideCommentRows(currentRaceNo);
  }
}

// ============================================================
// レース後コメント取得機能
// ============================================================

/** URLを生成: keiba.or.jp/?postracecomment=YYYYMMDDNN */
// keiba.or.jp のレース後コメント（postracecomment）は 2024/03 開始。それ以前は
// ページが存在せず、取得を試みると全プロキシ空振り→リトライ待機(最大9秒)を毎レース空費する
// （月間一括取得で古い月が極端に遅くなる主因）。この日付より前はコメント取得を丸ごとスキップする。
const KV_COMMENT_START = '2024/03/01';

function buildCommentUrl(raceDate, raceNo) {
  const dateStr = raceDate.replace(/\//g, ''); // "2026/06/21" → "20260621"
  const raceStr = String(raceNo).padStart(2, '0'); // 10 → "10"
  return `https://www.keiba.or.jp/?postracecomment=${dateStr}${raceStr}`;
}

/**
 * keiba.or.jp コメントページのDOM構造を直接解析して { 馬名: コメント } マップを返す
 *
 * 実際のHTML構造（DevToolsで確認済み）:
 *   <div id="the-content">
 *     <p>
 *       "1番 " <a>スマートビガー</a> " 岡騎手" <br> "相手が強かったです。"
 *       <br><br>
 *       "2番 " <a>タイムトゥパーティ</a> " 赤岡騎手" <br> "メンバーがだいぶ強くなってきました。"
 *       <br><br>
 *       "3番 " <a>ユミッチラブ</a> ...
 *     </p>
 *   </div>
 *
 * ※ 全馬が1つの <p> タグ内に <br><br> で区切られて並んでいる
 *
 * 解析戦略:
 *   1. the-content 内の全 <a> タグを走査
 *   2. <a> テキスト（馬名）が出馬表の馬名と完全一致するか確認
 *   3. 一致した <a> の次の兄弟ノードを順に走査
 *   4. 最初の <br> を越えた後の最初のテキストノードをコメントとして取得
 *   5. 次の <a> タグが来たら走査終了（次の馬の領域に入った）
 */
function parsePostRaceCommentDom(doc, horseNames) {
  const commentMap = {};
  const nameNorm = n => n.replace(/[\s　]/g, '');

  // the-content div を探す（なければ body 全体を対象）
  const container = doc.getElementById('the-content') || doc.body;
  if (!container) return commentMap;

  // container 内の全 <a> タグを取得
  const allATags = Array.from(container.querySelectorAll('a'));

  allATags.forEach(aTag => {
    const rawHorseName = aTag.textContent.trim();
    const normHorseName = nameNorm(rawHorseName);

    // 出馬表の馬名と完全一致確認
    const matchedName = horseNames.find(n => nameNorm(n) === normHorseName);
    if (!matchedName) return;

    // この <a> タグの次の兄弟ノードを順に走査して <br> 後のコメントを取得
    let comment = '';
    let passedBr = false; // 最初の <br> を通過したか
    let node = aTag.nextSibling;

    while (node) {
      // 次の <a> タグが来たら終了（次の馬の領域）
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') break;

      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        if (passedBr) break; // 2つ目の <br> で区切り → 次の馬の手前で終了
        passedBr = true;
        node = node.nextSibling;
        continue;
      }

      if (passedBr && node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent.trim();
        // コメント本文（空白や記号だけでない）
        if (txt && txt.length > 1) {
          comment += (comment ? ' ' : '') + txt;
        }
      }

      node = node.nextSibling;
    }

    if (comment) {
      commentMap[matchedName] = comment;
    }
  });

  return commentMap;
}

/**
 * コメント専用Worker経由でレース後コメントを取得し { 馬名: コメント } マップを返す
 */
async function fetchPostRaceComments(raceDate, raceNo, horseNames) {
  const url = buildCommentUrl(raceDate, raceNo);
  const rn = Number(raceNo);
  const raceId = `${String(raceDate || '').replace(/\D/g,'')}${String(rn).padStart(2,'0')}`;
  try {
    if (!/^\d{10}$/.test(raceId) || rn < 1 || rn > 12) throw new Error('invalid race');
    const res = await fetch(`${KOCHI_WORKER_ORIGIN}/postrace-comment?race=${raceId}`, {
      signal:AbortSignal.timeout(14000), cache:'no-store'
    });
    if (!res.ok) throw new Error(`comment HTTP ${res.status}`);
    const html = await res.text();
    if (!html || html.length < 100) return { map: {}, url, error: true, success: false };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const commentMap = parsePostRaceCommentDom(doc, horseNames || []);
    const container = doc.getElementById('the-content') || doc.body;
    const rawText = (container?.innerText || container?.textContent || '').substring(0, 2000);
    return { map: _sanDeep(commentMap), url, rawText: _sanDeep(rawText), success: true };
  } catch(e) {
    console.warn('[コメント取得] 専用経路失敗:', url, e);
    return { map: {}, url, error: true, success: false };
  }
}

/**
 * 出馬表の「コメント取得」ボタンから呼ばれるメイン関数
 * ① コメントを取得
 * ② allRacesData[raceNo].horses[i].postComment に保存
 * ③ 出馬表の馬名セルの下にコメントを表示（DOM更新）
 */
async function fetchAndApplyComments(raceNo) {
  const data = allRacesData[raceNo];
  if (!data) return;
  const { raceInfo, horses } = data;

  const btn = document.getElementById(`comment-btn-${raceNo}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 取得中...';
  }

  const raceDate = raceInfo.raceDate || currentDate || '';
  const horseNames = horses.map(h => h.horseName);
  const commentUrl = buildCommentUrl(raceDate, raceNo);

  try {
    const result = await fetchPostRaceComments(raceDate, raceNo, horseNames);

    if (result.error) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 取得失敗（再試行）';
      }
      // デバッグ用にコンソール出力
      console.warn('[コメント取得] 専用経路失敗:', commentUrl);
      alert(`公式コメント取得サーバーに接続できませんでした。\n時間をおいて再試行してください。\n\n直接確認: ${commentUrl}`);
      return;
    }

    const map = result.map;
    let matched = 0;

    // 馬名完全一致でコメントを保存・表示
    horses.forEach(horse => {
      const cleanName = (horse.horseName || '').replace(/\s/g, '');
      // mapのキー（スペース除去済み）と照合
      let comment = null;
      for (const [k, v] of Object.entries(map)) {
        if (k.replace(/\s/g,'') === cleanName) { comment = v; break; }
      }
      if (comment) {
        horse.postComment = comment;
        matched++;
        // ── lsWrite で永続化 ──
        // キー: {babaCode}_{raceDate}_{raceNo}_{umaBan}
        const babaCode = currentBaba || '31';
        const rDate = raceInfo.raceDate || currentDate || '';
        const uBan = horse.umaBan || horse.umaBan || '';
        if(rDate && uBan){
          const lsKey = `${babaCode}_${rDate}_${raceNo}_${uBan}`;
          const existing = lsRead()[lsKey] || {};
          lsWrite(lsKey, Object.assign({}, existing, {
            type: 'horse',
            horseName: horse.horseName || existing.horseName || '',
            postComment: comment,
          }));
        }
      }
    });

    // 出馬表DOM を更新（コメント表示）
    _renderCommentsInTable(raceNo);

    // ボタン更新
    if (btn) {
      btn.disabled = false;
      if (matched > 0) {
        btn.innerHTML = `<i class="fas fa-check-circle"></i> コメント取得済み（${matched}頭）`;
        btn.style.background = '#16a34a';
      } else {
        btn.innerHTML = '<i class="fas fa-question-circle"></i> コメント0件（再試行）';
        btn.style.background = '#d97706';
        // コメントが0件の場合はデバッグ情報を展開
        console.info('[コメント取得] 0件マッチ。生テキスト:\n' + result.rawText);
        if (confirm(`コメントがマッチしませんでした（${Object.keys(map).length}件取得）。\n\nデバッグ: コンソールに生テキストを出力しました。\nコメントページを直接確認しますか？`)) {
          window.open(commentUrl, '_blank');
        }
      }
    }

  } catch(e) {
    console.error('[コメント取得] エラー:', e);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> エラー（再試行）';
    }
  }
}

/**
 * 出馬表の各馬行の直後にコメント専用行（<tr colspan=18>）を挿入/更新
 * テーブルのレイアウトを崩さない独立行方式
 */
function _renderCommentsInTable(raceNo) {
  const data = allRacesData[raceNo]; if (!data) return;
  const tbody = document.getElementById(`tbody-${raceNo}`); if (!tbody) return;

  // 既存のコメント行をすべて削除してから再構築
  tbody.querySelectorAll('tr.horse-comment-row').forEach(r => r.remove());

  const horseRows = Array.from(tbody.querySelectorAll('tr.horse-row'));
  horseRows.forEach(tr => {
    const nameTd = tr.querySelector('.col-umaname');
    if (!nameTd) return;

    // テキストノードのみ結合して馬名を取得（アイコンを除外）
    const nameSpan = nameTd.querySelector('.horse-name');
    if (!nameSpan) return;
    const displayName = Array.from(nameSpan.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent)
      .join('').replace(/[\s\u3000]/g, '');

    const horse = data.horses.find(h => (h.horseName || '').replace(/[\s\u3000]/g, '') === displayName);
    if (!horse || !horse.postComment) return;

    const commentTr = document.createElement('tr');
    commentTr.className = 'horse-comment-row';
    commentTr.style.cssText = 'background:#f0fdff;border-bottom:1px solid #e0f2fe;';
    if (!_commentVisible) commentTr.style.display = 'none';
    const td = document.createElement('td');
    td.colSpan = tr.cells.length;
    td.style.cssText = 'padding:4px 12px 6px 48px;font-size:12px;color:#0e7490;line-height:1.5;white-space:normal;';
    td.textContent = `💬 ${horse.postComment}`;
    commentTr.appendChild(td);

    const anchor = tr.nextElementSibling?.classList.contains('kv-sp-row') ? tr.nextElementSibling : tr;
    anchor.insertAdjacentElement('afterend', commentTr);
  });
}

function _restoreCommentRows(raceNo) {
  const data = allRacesData[raceNo];
  if (!data?.horses?.some(h => h.postComment)) return;
  _renderCommentsInTable(raceNo);
  if (!_commentVisible) _hideCommentRows(raceNo);
}

/** コメント行を非表示にする（チェックボックスOFF時） */
function _hideCommentRows(raceNo) {
  const tbody = document.getElementById(`tbody-${raceNo}`);
  if (!tbody) return;
  tbody.querySelectorAll('tr.horse-comment-row').forEach(tr => {
    tr.style.display = 'none';
  });
}

/** コメント行を表示する（チェックボックスON時） */
function _showCommentRows(raceNo) {
  const tbody = document.getElementById(`tbody-${raceNo}`);
  if (!tbody) return;
  tbody.querySelectorAll('tr.horse-comment-row').forEach(tr => {
    tr.style.display = '';
  });
}

/**
 * チェックボックス変更ハンドラ
 * checked=true  → コメント行を表示
 * checked=false → コメント行を非表示
 */
function toggleCommentVisible(checked, raceNo) {
  _commentVisible = checked;
  if (checked) {
    _showCommentRows(raceNo);
  } else {
    _hideCommentRows(raceNo);
  }
}

// 馬モーダルの距離適性/馬場状態スコアカード：高知のみ⇔他場を含む全成績のトグル表示
function _hmToggleTrackScope(btn) {
  const card = btn.closest('.hm-stat-card');
  if (!card) return;
  const kochiEl = card.querySelector('.hm-scope-kochi');
  const allEl = card.querySelector('.hm-scope-all');
  if (!kochiEl || !allEl) return;
  const showingAll = allEl.style.display !== 'none';
  kochiEl.style.display = showingAll ? '' : 'none';
  allEl.style.display = showingAll ? 'none' : '';
  btn.textContent = showingAll ? '他場を含める' : '高知のみに戻す';
}

async function openHorseModal(horseName, raceNo) {
  // モーダル内の特徴タグ・画像保存は遅延モジュール側。開く操作を起点に確実に準備する。
  try { await _ensureRaceIntelligence(); } catch (e) { return; }
  // 表示中レースより後の結果は「過去成績」に含めない（未来の結果混入バグ対策）。
  // レース文脈が取れない場合（保存データ経由等）は従来通り全履歴を表示する。
  const _modalRaceData = allRacesData[raceNo||currentRaceNo];
  const _knownOfficialHistory=getHorseHistory(horseName);
  const history = _modalRaceData?.raceInfo?.raceDate
    ? getHorseHistoryBefore(horseName, _modalRaceData.raceInfo.raceDate, raceNo||currentRaceNo)
    : _knownOfficialHistory;
  const modal=document.getElementById('horse-modal'),title=document.getElementById('horse-modal-title'),content=document.getElementById('horse-modal-content');
  if(!modal||!title||!content)return;
  title.textContent=`🐴 ${horseName} の過去成績`;

  // 特徴タグをタイトル下に表示
  let _tagRow = document.getElementById('horse-modal-tag-row');
  if (!_tagRow) {
    _tagRow = document.createElement('div');
    _tagRow.id = 'horse-modal-tag-row';
    _tagRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 16px 2px;border-bottom:1px solid #e2e8f0;background:#f8fafc;';
    title.parentNode.insertBefore(_tagRow, title.nextSibling);
  }
  _tagRow.innerHTML = `
    <div class="horse-tag-badges" data-horse="${horseName.replace(/"/g,'&quot;')}" style="display:flex;flex-wrap:wrap;gap:3px;flex:1;">
      ${horseTagBadgesHtml(horseName)}
    </div>
    <button class="admin-only" onclick="showHorseNoteEditor('${jsAttrEsc(horseName)}',this)" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #cbd5e1;background:#fff;color:#64748b;cursor:pointer;white-space:nowrap;">+特徴</button>
  `;

  // lineageLoginCodeを取得（現在または過去のレースデータから探す）
  let lineageCode = '';
  // 現在表示レースから探す
  const curRaceData = _modalRaceData;
  if(curRaceData){
    const hh=curRaceData.horses.find(h=>(h.horseName||'').replace(/\s/g,'')===(horseName||'').replace(/\s/g,''));
    if(hh) lineageCode=hh.lineageLoginCode||'';
  }
  // なければlsReadから探す（horse型・official型キャッシュ両方を検索）
  const _lsAll = lsRead();
  if(!lineageCode){
    // ① horse型キャッシュから
    const foundHorse=Object.values(_lsAll).find(v=>v.type==='horse'&&v.horseName===horseName&&v.lineage_login_code);
    if(foundHorse) lineageCode=foundHorse.lineage_login_code||'';
  }
  if(!lineageCode){
    // ② official_*キャッシュから（馬名で検索）
    const hn = (horseName||'').replace(/\s/g,'');
    const foundOff=Object.values(_lsAll).find(v=>
      v.type==='official' && v.lineageCode &&
      (v.horseName||'').replace(/\s/g,'')===hn
    );
    if(foundOff) lineageCode=foundOff.lineageCode||'';
  }

  // ボタン設定
  const officialLink=document.getElementById('horse-official-link');
  const fetchBtn=document.getElementById('horse-fetch-btn');
  if(lineageCode){
    // lineageLoginCodeあり → 直リンク＋取得ボタン
    const officialUrl=`https://www.keiba.go.jp/KeibaWeb/DataRoom/HorseMarkInfo?k_lineageLoginCode=${lineageCode}`;
    if(officialLink){
      officialLink.href=officialUrl;
      officialLink.title=`keiba.go.jp 公式ページ（コード:${lineageCode}）`;
      officialLink.style.display='inline-flex';
    }
    if(fetchBtn){
      fetchBtn.style.display='inline-flex';
      fetchBtn.dataset.code=lineageCode;
      fetchBtn.dataset.horse=horseName;
    }
  } else {
    // lineageLoginCodeなし → 検索リンクのみ表示
    if(officialLink){
      const searchUrl=`https://www.keiba.go.jp/KeibaWeb/DataRoom/HorseMarkList?k_horseName=${encodeURIComponent(horseName)}`;
      officialLink.href=searchUrl;
      officialLink.title='keiba.go.jp 馬名検索（コード未取得）';
      officialLink.innerHTML='<i class="fas fa-search"></i> 公式検索';
      officialLink.style.display='inline-flex';
      officialLink.style.opacity='0.7';
    }
    if(fetchBtn) fetchBtn.style.display='none';
  }

  if(!history.length){
    content.innerHTML='<p class="hm-nodata">保存済みデータがありません。<br>レースを取得・保存すると履歴が蓄積されます。</p>';
    modal.classList.remove('hidden');
    if(content) content.scrollTop = 0;
    // 過去成績がなくてもキャッシュがあれば公式成績を自動表示
    if(lineageCode) {
      const cached2 = _lsAll[`official_${lineageCode}`];
      const cacheState2=getOfficialHistoryCacheState(cached2,currentDate,_knownOfficialHistory);
      if(cacheState2.usable && !cacheState2.shouldRefresh) {
        requestAnimationFrame(async () => {
          const baseline=await getKochiOfficialBaseline(lineageCode,parseDateStr(currentDate)).catch(()=>cached2.baseline||null);
          _renderOfficialSection({ races: cached2.races, basicInfo: cached2.basicInfo||{}, baseline, _saveToCache: false }, lineageCode, horseName);
          const fb2 = document.getElementById('horse-fetch-btn');
          if(fb2) { fb2.innerHTML = '<i class="fas fa-sync-alt"></i> 再取得'; fb2.title = `キャッシュ済み（${cached2.savedAt ? new Date(cached2.savedAt).toLocaleDateString('ja-JP') : '—'}）`; }
          if(content) content.scrollTop = 0;
        });
      } else if(cached2?.races?.length) {
        requestAnimationFrame(()=>{
          const fb2=document.getElementById('horse-fetch-btn');
          if(fb2?.dataset.code===lineageCode) fetchHorseMarkInfo();
        });
      }
    }
    return;
  }

  // ── ローカル保存成績（高知のみ。lsにはJRA成績が入らないため実質全件が高知） ──

  // ローテーション計算（最新2走分）
  const rotationHtml = (()=>{
    if(history.length < 2) return '';
    const latest = history[0], prev = history[1];
    const latestDate = new Date(latest.raceDate.replace(/\//g,'-'));
    const prevDate   = new Date(prev.raceDate.replace(/\//g,'-'));
    const diffDays = Math.round((latestDate - prevDate)/(1000*60*60*24));
    if(diffDays <= 0) return '';
    const chukuWks = Math.floor((diffDays-1)/7);
    const rotColor = diffDays <= 7 ? '#dc2626' : diffDays <= 14 ? '#d97706' : diffDays <= 28 ? '#16a34a' : '#6b7280';
    const rotLabel = diffDays <= 7 ? '連闘' : diffDays <= 14 ? '中1週' : diffDays <= 21 ? '中2週' : diffDays <= 28 ? '中3週' : `中${chukuWks}週`;
    return `<div class="hm-stat-card" style="border-color:${rotColor};min-width:130px;">
      <div class="hm-stat-label">🔄 ローテーション</div>
      <div class="hm-stat-value" style="color:${rotColor};font-size:16px">${rotLabel}</div>
      <div class="hm-stat-sub">${prev.raceDate}→ ${latest.raceDate}（${diffDays}日）</div>
    </div>`;
  })();

  // 高知限定履歴（2026-07-12：距離適性/馬場状態スコアが他場成績を含んでいたバグ修正。
  //   historyはgetHorseHistory経由でoffi_接頭辞の全国成績＝JRA/他地方競馬場も含むため、
  //   babaCode==='31'で絞り込む。他場成績はボタンで開閉表示する）
  const _hmHistKochi = history.filter(h => h.babaCode === '31');
  const _hmHasOtherTrack = history.some(h => h.babaCode !== '31');

  // 距離適性スコア（既定=高知のみ／トグルで他場込みに切替）
  const distScoreHtml = (()=>{
    const scoreLabel = r => {
      if(r>=0.6) return{label:'S',bg:'#7c3aed',fg:'#fff'};
      if(r>=0.4) return{label:'A',bg:'#1d4ed8',fg:'#fff'};
      if(r>=0.2) return{label:'B',bg:'#15803d',fg:'#fff'};
      return{label:'C',bg:'#6b7280',fg:'#fff'};
    };
    const curDistNum2 = getDistNum(allRacesData[raceNo||currentRaceNo]?.raceInfo?.distance||'');
    const buildRows = histList => {
      const distMap = {};
      histList.forEach(h=>{
        const distNum = getDistNum(h.distance); if(!distNum)return;
        const distKey = distNum + 'm';  // 正規化: "1300"/"1300m" → "1300m"
        if(!distMap[distKey]) distMap[distKey]={wins:0,places:0,runs:0,distNum};
        distMap[distKey].runs++;
        const c=parseInt(h.chakujun)||999;
        if(c<=3) distMap[distKey].places++;
        if(c===1) distMap[distKey].wins++;
      });
      const entries = Object.entries(distMap).sort((a,b)=>b[1].runs-a[1].runs);
      if(!entries.length) return '';
      return entries.map(([distKey,s])=>{
        const r = s.runs>0?s.places/s.runs:0;
        const sc=scoreLabel(r);
        const isCur = curDistNum2 && s.distNum === curDistNum2;
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;${isCur?'font-weight:700;background:#fef9c3;margin:0 -4px;padding:3px 4px;border-radius:4px':''}">
          <span style="background:${sc.bg};color:${sc.fg};font-weight:800;font-size:12px;padding:1px 7px;border-radius:10px;min-width:24px;text-align:center">${sc.label}</span>
          <span style="font-size:12px;min-width:54px">${distKey}</span>
          <span style="font-size:11px;color:#374151">${s.places}/${s.runs}走</span>
          <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round(r*100)}%;background:${sc.bg};border-radius:3px"></div></div>
          <span style="font-size:11px;color:#6b7280;min-width:28px;text-align:right">${Math.round(r*100)}%</span>
        </div>`;
      }).join('');
    };
    const rowsKochi = buildRows(_hmHistKochi);
    if(!rowsKochi && !_hmHasOtherTrack) return '';
    const rowsAll = _hmHasOtherTrack ? buildRows(history) : '';
    return `<div class="hm-stat-card" style="min-width:200px;flex:2">
      <div class="hm-stat-label" style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span>🎯 距離適性スコア（高知）</span>
        ${_hmHasOtherTrack?`<button type="button" onclick="_hmToggleTrackScope(this)" style="font-size:9px;padding:1px 6px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#64748b;cursor:pointer;white-space:nowrap;font-weight:600">他場を含める</button>`:''}
      </div>
      <div class="hm-scope-kochi" style="margin-top:4px">${rowsKochi || '<div style="font-size:11px;color:#9ca3af;padding:3px 0">高知での出走履歴なし</div>'}</div>
      ${_hmHasOtherTrack?`<div class="hm-scope-all" style="margin-top:4px;display:none">${rowsAll}</div>`:''}
    </div>`;
  })();

  // 馬場状態スコア（良/稍重/重/不良ごとの3着内率。今日の馬場状態をハイライト。既定=高知のみ）
  const trackScoreHtml = (()=>{
    const ORDER = ['良','稍重','重','不良'];
    const scoreLabel = r => {
      if(r>=0.6) return{label:'S',bg:'#7c3aed'};
      if(r>=0.4) return{label:'A',bg:'#1d4ed8'};
      if(r>=0.2) return{label:'B',bg:'#15803d'};
      return{label:'C',bg:'#6b7280'};
    };
    const curCond = (allRacesData[raceNo||currentRaceNo]?.raceInfo?.trackCond||'').trim();
    const buildRows = histList => {
      const tmap = {};
      histList.forEach(h=>{
        const t = (h.trackCond||'').trim(); if(!ORDER.includes(t)) return;
        if(!tmap[t]) tmap[t]={places:0,runs:0};
        tmap[t].runs++;
        if((parseInt(h.chakujun)||999)<=3) tmap[t].places++;
      });
      const entries = ORDER.filter(t=>tmap[t]);
      if(!entries.length) return '';
      return entries.map(t=>{
        const s = tmap[t];
        const r = s.runs>0?s.places/s.runs:0;
        const sc = scoreLabel(r);
        const isCur = curCond && t===curCond;
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;${isCur?'font-weight:700;background:#fef9c3;margin:0 -4px;padding:3px 4px;border-radius:4px':''}">
          <span style="background:${sc.bg};color:#fff;font-weight:800;font-size:12px;padding:1px 7px;border-radius:10px;min-width:24px;text-align:center">${sc.label}</span>
          <span style="font-size:12px;min-width:40px">${t}${isCur?'<span style="font-size:9px;color:#b45309">（本日）</span>':''}</span>
          <span style="font-size:11px;color:#374151">${s.places}/${s.runs}走</span>
          <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round(r*100)}%;background:${sc.bg};border-radius:3px"></div></div>
          <span style="font-size:11px;color:#6b7280;min-width:28px;text-align:right">${Math.round(r*100)}%</span>
        </div>`;
      }).join('');
    };
    const rowsKochi = buildRows(_hmHistKochi);
    if(!rowsKochi && !_hmHasOtherTrack) return '';
    const rowsAll = _hmHasOtherTrack ? buildRows(history) : '';
    return `<div class="hm-stat-card" style="min-width:200px;flex:2">
      <div class="hm-stat-label" style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span>🌧 馬場状態スコア（高知・3着内率）</span>
        ${_hmHasOtherTrack?`<button type="button" onclick="_hmToggleTrackScope(this)" style="font-size:9px;padding:1px 6px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#64748b;cursor:pointer;white-space:nowrap;font-weight:600">他場を含める</button>`:''}
      </div>
      <div class="hm-scope-kochi" style="margin-top:4px">${rowsKochi || '<div style="font-size:11px;color:#9ca3af;padding:3px 0">高知での出走履歴なし</div>'}</div>
      ${_hmHasOtherTrack?`<div class="hm-scope-all" style="margin-top:4px;display:none">${rowsAll}</div>`:''}
    </div>`;
  })();

  // 好走時馬体重（高知のみ = ローカル保存成績から）
  const _parseWeight = s => { const m=(s||'').match(/^(\d+)/); return m?parseInt(m[1]):NaN; };
  const weightDataLocal = history.map(h=>({w:_parseWeight(h.weight),c:parseInt(h.chakujun)||999,d:h.raceDate})).filter(e=>!isNaN(e.w)&&e.w>300&&e.w<700);
  const winWeightsLocal = weightDataLocal.filter(e=>e.c<=3).map(e=>e.w);
  const avgWinWeight = winWeightsLocal.length?(winWeightsLocal.reduce((s,v)=>s+v,0)/winWeightsLocal.length).toFixed(0):'—';

  // ── 過去成績テーブル（ローカル保存の高知成績） ──
  const cCls=c=>{const n=parseInt(c);return n===1?'chakujun-1':n===2?'chakujun-2':n===3?'chakujun-3':'';};
  const pKey=p=>p==='ハイ'?'high':p==='ミドル'?'mid':p==='スロー'?'slow':'none';
  const curData=allRacesData[raceNo||currentRaceNo];
  const curDist=curData?.raceInfo?.distance||'', curPace=curData?.raceInfo?.paceType||'';

  // コメント列表示フラグ（15走中1つでもコメントがあれば列を出す）
  const _hasComments = history.slice(0,15).some(h=>h.postComment&&String(h.postComment).trim());

  const histRows = history.slice(0,15).map((h,idx)=>{
    const chaku=parseInt(h.chakujun)||999, isWin=chaku<=3;
    const f3Val=parseFloat(h.first3f), agVal=parseFloat(h.agari3f);
    const horseOwnPace = h.paceType || '';      // 馬自身のペース
    const racePace2    = h.paceTypeRace || '';  // レース全体のペース
    const pace=horseOwnPace||racePace2;
    const sameDist=curDist&&h.distance===curDist&&h.babaCode==='31', samePace=curPace&&racePace2===curPace;
    const _hBias      = getDayBiasForDate(h.babaCode, h.raceDate, h.raceNo) ?? (h.fromOfficial ? estimateBiasFromCond(h.distance, h.raceClass, h.trackCond) : null);
    const _rAvgF3     = getRaceAvgF3(h.babaCode, h.raceDate, h.raceNo);
    const _paceAdj    = calcPaceAdj(f3Val, _rAvgF3);
    const _si         = calcSpeedIndex(h.time, h.distance, h.raceClass, h.trackCond, _hBias, h.kinryo, _paceAdj);
    const _siHtml     = _si != null ? speedIndexBadgeHtml(_si) : '<span style="color:#d1d5db;font-size:10px">—</span>';
    const _rAvgAgari  = getRaceAvgAgari3f(h.babaCode, h.raceDate, h.raceNo);
    const _agariIdx   = calcAgariIndex(agVal, _rAvgAgari);
    const _agariHtml  = _agariIdx != null ? agariIndexBadgeHtml(_agariIdx) : '<span style="color:#d1d5db;font-size:10px">—</span>';
    // 各馬の前半区間タイム（走破−上がり3F）＋基準比dev（負=ハイ/正=スロー）。高知のみ。
    const _frontSec = h.babaCode === '31' ? calcFrontSectional(h.time, h.agari3f) : null;
    const _frontDev = _frontSec != null ? getFrontDev(h.raceDate, h.distance, h.raceClass, h.trackCond, _frontSec) : null;
    const _fdClr = _frontDev == null ? '' : _frontDev <= -0.4 ? '#dc2626' : _frontDev >= 0.4 ? '#1d4ed8' : '#94a3b8';
    const _frontCell = _frontSec != null
      ? `${_frontSec.toFixed(1)}${_frontDev != null ? `<div style="font-size:8px;font-weight:800;color:${_fdClr};line-height:1.1">${_frontDev > 0 ? '+' : ''}${_frontDev.toFixed(1)}</div>` : ''}`
      : '—';
    let rotCell='—';
    if(idx < history.length-1){
      const cur2=new Date(h.raceDate.replace(/\//g,'-'));
      const prv2=new Date(history[idx+1].raceDate.replace(/\//g,'-'));
      const dd=Math.round((cur2-prv2)/(1000*60*60*24));
      if(dd>0){
        const rc=dd<=7?'#dc2626':dd<=14?'#d97706':dd<=28?'#16a34a':'#6b7280';
        const rl=dd<=7?'連闘':dd<=14?'中1週':dd<=21?'中2週':dd<=28?'中3週':`中${Math.floor((dd-1)/7)}週`;
        rotCell=`<span style="color:${rc};font-weight:700;font-size:11px">${rl}</span><span style="color:#9ca3af;font-size:10px;display:block">${dd}日</span>`;
      }
    }
    // コメントセル（コメントがある馬が1頭でもいれば全行に列を出す）
    const commentTxt = h.postComment ? String(h.postComment).trim() : '';
    const commentCell = !_hasComments ? '' : commentTxt
      ? `<td class="col-comment" style="font-size:9.5px;color:#0e7490;white-space:normal;line-height:1.4;padding:4px 4px;vertical-align:top"><i class="fas fa-comment-dots" style="margin-right:2px;opacity:.7"></i>${escapeHTML(commentTxt)}</td>`
      : `<td class="col-comment" style="color:#d1d5db;font-size:10px;text-align:center;vertical-align:middle">—</td>`;
    // パドック映像(自前クリップ)。索引に無い過去走は空セルのまま(modules/paddock-clips.js)
    const _pdkCell = (typeof paddockCellHtml === 'function')
      ? paddockCellHtml(h.raceDate, h.raceNo, h.umaBan, h.babaCode) : '<td class="col-paddock"></td>';
    return `<tr class="hm-row ${isWin?'hm-row-win':''}">
      ${_pdkCell}
      <td class="col-date" style="font-size:9.5px">${escapeHTML(h.raceDate)}</td>
      <td class="col-rname" style="text-align:left;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.raceName?escapeHTML(h.raceName):'—'}</td>
      <td class="col-cls"><span class="race-class-badge ${raceClassCssClass(h.raceClass)}" style="font-size:9px;padding:1px 4px">${escapeHTML(h.raceClass)||'—'}</span></td>
      <td class="col-dist ${sameDist?'hm-match-cell':''}" style="font-size:10px">${escapeHTML(h.distance)||'—'}</td>
      <td class="col-track" style="font-size:10px">${escapeHTML(h.trackCond)||'—'}</td>
      <td class="col-rank"><span class="chakujun-badge ${cCls(h.chakujun)}" style="font-size:11px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center">${chaku<900?chaku:'—'}</span></td>
      <td class="col-first3f" style="font-family:monospace;font-weight:700;font-size:10px">${!isNaN(f3Val)?f3Val.toFixed(1):'—'}</td>
      <td class="col-last3f" style="font-family:monospace;font-size:10px">${!isNaN(agVal)?agVal.toFixed(1):'—'}</td>
      <td class="col-front" style="font-family:monospace;font-size:10px;font-weight:700" title="この馬自身の前半区間タイム（走破−上がり3F）。下段は基準比：−=速い(ハイ)/＋=遅い(スロー)">${_frontCell}</td>
      <td class="col-time" style="font-family:monospace;font-size:10px">${escapeHTML(h.time)||'—'}</td>
      <td class="col-idx" style="text-align:center;">${_siHtml}</td>
      <td class="col-weight" style="font-size:10px">${fmtWeightDiff(h.weight)}</td>
      <td class="col-pace" style="line-height:1.4;padding:2px 3px;">
        <span class="pace-label pace-label-${pKey(horseOwnPace||racePace2)} ${samePace?'hm-pace-match':''}" style="font-size:9px;padding:1px 4px;display:inline-block;">${escapeHTML(horseOwnPace)||'—'}</span>
        ${racePace2?`<div style="font-size:8px;color:#9ca3af;margin-top:1px;">R:${escapeHTML(racePace2)}</div>`:''}
      </td>
      <td class="col-mid" style="font-size:10px">${escapeHTML(h.mukaeShoumen)||'—'}</td>
      <td class="col-str" style="font-size:10px">${escapeHTML(h.shoumenStraight)||'—'}</td>
      <td class="col-jockey" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(h.jockey)||'—'}</td>
      <td class="col-interval" style="font-size:9.5px;line-height:1.3">${rotCell}</td>
      ${commentCell}
    </tr>`;
  }).join('');

  const histTableHtml = `
  <div style="margin-top:10px">
    <div class="hm-hint" style="margin-bottom:4px"><i class="fas fa-info-circle"></i> <span class="hm-match-cell" style="display:inline;padding:1px 5px;border-radius:3px">黄色ハイライト</span>＝現在のレースと同条件（高知保存成績）</div>
    <div class="table-wrapper" style="max-height:260px;overflow-y:auto;overflow-x:auto">
      <table class="deban-table hm-table">
        <thead><tr>
          <th class="col-paddock" title="この日のこの馬のパドック映像">🐴</th>
          <th class="col-date">日付</th><th class="col-rname">レース名</th><th class="col-cls">クラス</th>
          <th class="col-dist">距離</th><th class="col-track">馬場</th><th class="col-rank">着順</th>
          <th class="col-first3f">前半3F</th><th class="col-last3f">上がり3F</th>
          <th class="col-front" style="line-height:1.3" title="走破タイム−上がり3F＝残り600m地点までの通過タイム">前半<br><span style="font-size:8px;font-weight:400;opacity:.75;">基準比</span></th>
          <th class="col-time">タイム</th>
          <th class="col-idx" style="text-align:center;min-width:40px;">指数</th>
          <th class="col-weight">馬体重</th><th class="col-pace" style="line-height:1.3;">馬P<br><span style="font-size:8px;font-weight:400;opacity:.75;">R:レース</span></th>
          <th class="col-mid">向正面</th><th class="col-str">直線</th>
          <th class="col-jockey">騎手</th><th class="col-interval">間隔</th>
          ${_hasComments?'<th class="col-comment">レース後コメント</th>':''}
        </tr></thead>
        <tbody>${histRows}</tbody>
      </table>
    </div>
  </div>`;

  // 統計カード（好走時馬体重・ローテーション・距離適性・馬場状態） ← モーダル最上部に表示
  const statCardsHtml = `<div class="hm-summary" style="margin-top:2px">
    ${winWeightsLocal.length?`<div class="hm-stat-card" style="border-color:#f59e0b"><div class="hm-stat-label">⚖️ 好走時平均馬体重</div><div class="hm-stat-value" style="color:#92400e">${avgWinWeight}kg</div><div class="hm-stat-sub">${winWeightsLocal.length}回の3着内平均（高知）</div></div>`:''}
    ${rotationHtml}
    ${distScoreHtml}
    ${trackScoreHtml}
  </div>`;

  // ── コメント全件一覧（件数切り替え付き） ──
  const allComments = history.filter(h=>h.postComment);
  const curRaceNo = raceNo != null ? raceNo : currentRaceNo;

  // コメントデータをwindowに保持（件数切り替え時に参照）
  const _commentDataKey = '_hmCmtData_' + horseName.replace(/[\s\u3000]/g,'_');
  window[_commentDataKey] = allComments.map(h=>({
    raceDate: h.raceDate||'', raceNo: h.raceNo||'', raceName: h.raceName||'', postComment: h.postComment||''
  }));

  // グローバルなコメントHTML生成関数（件数切り替えボタンのonclickから呼ぶ）
  window._buildCommentListHtml = function(dataKey, cnt) {
    var items = window[dataKey] || [];
    var sl = (parseInt(cnt) === 99) ? items : items.slice(0, parseInt(cnt)||10);
    if(!sl.length) return '<div style="font-size:12px;color:#9ca3af;padding:8px 4px"><i class="fas fa-comment-dots"></i> 保存済みコメントはありません</div>';
    return sl.map(function(h){
      return '<div class="hm-cmt">'
        + '<span class="hm-cmt-meta" style="font-size:10px;color:#0e7490;font-weight:700;white-space:nowrap"><i class="fas fa-comment-dots"></i> '
        + escapeHTML(h.raceDate) + (h.raceNo ? ' '+escapeHTML(String(h.raceNo))+'R' : '') + (h.raceName ? ' <span style="font-weight:400;color:#64748b">'+escapeHTML(h.raceName)+'</span>' : '') + '</span>'
        + '　' + escapeHTML(h.postComment)
        + '</div>';
    }).join('');
  };

  const commentCountOptions = [5, 10, 15, 30, 99];
  const _commentCountKey = '_hmCommentCount_' + horseName.replace(/[\s\u3000]/g,'_');
  const _initCount = parseInt(sessionStorage.getItem(_commentCountKey)||'5');
  const commentListId = 'hm-comment-list-' + horseName.replace(/[\s\u3000]/g,'_');

  const commentSectionHtml = `
  <div style="margin-top:10px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
      <div style="font-size:12px;font-weight:700;color:#0e7490"><i class="fas fa-comment-dots"></i> レース後コメント（${allComments.length}件保存）</div>
      ${allComments.length > 4 ? `<div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap;font-size:11px;color:#374151">
        表示件数：${commentCountOptions.map(n=>`<button
          id="cmt-btn-${n}-${commentListId}"
          onclick="_hmSwitchCommentCount('${commentListId}','${_commentDataKey}','${_commentCountKey}',${n},[5,10,15,30,99])"
          style="padding:2px 8px;border-radius:10px;border:1px solid #cbd5e1;cursor:pointer;font-size:11px;background:${_initCount===n?'#0e7490':'#fff'};color:${_initCount===n?'#fff':'#374151'}"
          >${n===99?'全件':n+'件'}</button>`).join('')}
      </div>` : ''}
    </div>
    <div id="${commentListId}">
      ${window._buildCommentListHtml(_commentDataKey, _initCount)}
    </div>
    ${!allComments.length ? `<div style="font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:6px;margin-top:4px"><i class="fas fa-info-circle"></i> 出馬表の「レース後コメント取得」ボタンを押すとここに蓄積されます</div>` : ''}
  </div>`;

  // 順序: 統計カード（好走時馬体重・距離/馬場適性等）→ レース後コメント → 過去成績テーブル
  content.innerHTML = `
    <div id="hm-top-anchor"></div>
    <div id="hm-odds-history-${raceNo||currentRaceNo}"></div>
    ${statCardsHtml}
    ${commentSectionHtml}
    <div id="horse-history-capture-area" style="background:#fff;border-radius:8px;padding:4px 0">
      ${histTableHtml}
    </div>
  `;
  modal.classList.remove('hidden');

  // ── 必ず先頭（統計カード）が見えるようにスクロールをリセット ──
  requestAnimationFrame(() => {
    const anchor = document.getElementById('hm-top-anchor');
    if(anchor) anchor.scrollIntoView({block:'start'});
    // モーダル自体のスクロールコンテナも先頭へ
    if(content) content.scrollTop = 0;
  });

  // ── 公式成績キャッシュが存在すれば自動表示（コメントの後に追加・スクロールなし） ──
  if(lineageCode) {
    const cached = _lsAll[`official_${lineageCode}`];
    const cacheState=getOfficialHistoryCacheState(cached,currentDate,_knownOfficialHistory);
    if(cacheState.usable && !cacheState.shouldRefresh) {
      requestAnimationFrame(async () => {
        const baseline=await getKochiOfficialBaseline(lineageCode,parseDateStr(currentDate)).catch(()=>cached.baseline||null);
        _renderOfficialSection({ races: cached.races, basicInfo: cached.basicInfo||{}, baseline, _saveToCache: false }, lineageCode, horseName);
        const fb = document.getElementById('horse-fetch-btn');
        if(fb) {
          fb.innerHTML = '<i class="fas fa-sync-alt"></i> 再取得';
          fb.title = `キャッシュ済み（${cached.savedAt ? new Date(cached.savedAt).toLocaleDateString('ja-JP') : '—'}）`;
        }
        // 公式成績追加後もスクロール位置を先頭に戻す
        if(content) content.scrollTop = 0;
      });
    } else {
      // キャッシュが無い/古い場合は自動で取りに行く。取得先は Worker で、
      // 共有DBに有ればそれが返り、無ければ公式から取って共有DBへ保存される。
      // 端末を替えても手動ボタンを押さずに公式成績が出るのはこの経路。
      requestAnimationFrame(()=>{
        const fb=document.getElementById('horse-fetch-btn');
        if(fb?.dataset.code===lineageCode) fetchHorseMarkInfo(true);
      });
    }
  }

  // ── オッズ推移チャート（Supabase keiba_odds_snapshots・表示専用・非同期）──
  if (curRaceData && curRaceData.raceInfo && curRaceData.raceInfo.raceDate) {
    const _oddsHh = curRaceData.horses.find(h=>(h.horseName||'').replace(/\s/g,'')===(horseName||'').replace(/\s/g,''));
    if (_oddsHh && _oddsHh.umaBan) {
      renderHorseOddsHistory(`hm-odds-history-${raceNo||currentRaceNo}`, curRaceData.raceInfo.raceDate, raceNo||currentRaceNo, _oddsHh.umaBan, horseName);
    }
  }
}
function closeHorseModal(){destroyHorseOddsHistoryChart();const m=document.getElementById('horse-modal');if(m)m.classList.add('hidden');}

// ===== horse-modal アクセシビリティ（Phase3-2b・キーボード操作のみ追補）=====
// 既存 openHorseModal / closeHorseModal・表示データ・過去成績の計算/取得経路には一切触れない。
// #horse-modal の hidden クラス遷移を1点で監視し、全ての開閉経路（✕/overlay/Escape）に対して
// フォーカス管理・スクロールロック・Tabトラップを付与する。listener は各1回だけ登録する。
(function hmA11y(){
  if (window.__hmA11yInit) return;   // 二重登録防止（renderのたびに増やさない）
  window.__hmA11yInit = true;
  var _trigger = null;        // 直近クリックで記録した「開いた起点」
  var _returnTarget = null;   // 閉じた時に戻すフォーカス先（このオープンの起点で確定）
  var _open = false;
  var _sx = 0, _sy = 0;
  var FOCUS_SEL = 'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]';   // summary＝AI内訳detailsもトラップ対象

  function modalEl(){ return document.getElementById('horse-modal'); }
  function dialogEl(){ var m = modalEl(); return m ? m.querySelector('.horse-modal') : null; }
  function isOpen(){ var m = modalEl(); return !!m && !m.classList.contains('hidden'); }
  function visible(el){
    if (!el || !el.isConnected || el.disabled) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }
  function focusables(){   // モーダル内の可視・タブ可能な要素（hidden/disabled/display:none/tabindex=-1 を除外）
    var d = dialogEl(); if (!d) return [];
    return Array.prototype.slice.call(d.querySelectorAll(FOCUS_SEL)).filter(function(el){
      if (el.getAttribute('tabindex') === '-1') return false;
      return visible(el);
    });
  }
  window.__hmFocusables = focusables;   // テスト用（実フィルタと同一の順序を参照させる）
  function naturallyFocusable(el){
    if (!el) return false;
    var t = el.tagName;
    if (t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return true;
    if ((t === 'A' || t === 'AREA') && el.hasAttribute('href')) return true;
    return el.hasAttribute('tabindex');
  }
  // クリック捕捉（capture・1回）：起点要素を記録。span等はtabindex=-1を付けて戻せるようにする（タブ順は変えない）。
  document.addEventListener('click', function(e){
    var t = (e.target && e.target.closest) ? e.target.closest('[data-kvx-detail],[onclick*="openHorseModal"]') : null;
    if (t){ if (!naturallyFocusable(t)) t.setAttribute('tabindex', '-1'); _trigger = t; }
  }, true);

  function lockScroll(){   // 背景スクロールを完全停止（overflow:hiddenは programmatic scroll を止められないため position:fixed 方式）
    _sx = window.scrollX; _sy = window.scrollY;
    var b = document.body;
    b.style.position = 'fixed'; b.style.top = (-_sy) + 'px'; b.style.left = (-_sx) + 'px'; b.style.width = '100%';
  }
  function unlockScroll(){
    var b = document.body;
    b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.width = '';
    window.scrollTo(_sx, _sy);   // 元のスクロール位置を維持
  }
  function returnFocus(){
    // focus は preventScroll で行い、unlockScroll が戻したスクロール位置を維持する（focusの自動スクロールを抑止）。
    if (visible(_returnTarget) && (naturallyFocusable(_returnTarget) || _returnTarget.getAttribute('tabindex') != null)){
      try { _returnTarget.focus({ preventScroll: true }); return; } catch(e){ _kvSwallow('returnFocus', e); }
    }
    // 起点が日付/レース変更で消えた等 → 安全な代替先（body へは無条件に当てない）
    var alt = document.querySelector('.header-nav-btn.active')
           || document.getElementById('kvx-toggle-btn')
           || document.querySelector('#kvx-deban-v2 [data-kvx-detail]')
           || document.querySelector('.header-nav-btn');
    if (visible(alt)){ try { alt.focus({ preventScroll: true }); return; } catch(e){ _kvSwallow('returnFocus#2', e); } }
    var region = document.getElementById('race-content-area') || document.querySelector('.app-main');
    if (region){ region.setAttribute('tabindex', '-1'); try { region.focus({ preventScroll: true }); } catch(e){ _kvSwallow('returnFocus#3', e); } }
  }
  function onOpen(){
    _open = true; _returnTarget = _trigger;   // このオープンの起点を確定
    lockScroll();
    if (typeof window.kvxOnModalOpen === 'function') { try { window.kvxOnModalOpen(_trigger); } catch(e){ _kvSwallow('onOpen', e); } }   // 【seam】kvx起点ならAI内訳を注入（管理者/flag/identityはkvx側で判定）
    var m = modalEl(), c = m ? m.querySelector('.horse-modal-close') : null;
    if (c){ try { c.focus({ preventScroll: true }); } catch(e){ _kvSwallow('onOpen#2', e); } }   // 開いたら閉じるボタンへフォーカス
  }
  function onClose(){ _open = false; unlockScroll(); returnFocus(); _returnTarget = null; if (typeof window.kvxOnModalClose === 'function') { try { window.kvxOnModalClose(); } catch(e){ _kvSwallow('onClose', e); } } }   // 【seam】内訳DOMを破棄

  // hidden クラス遷移を監視（✕/overlay/Escape すべてが最終的にここを通る）
  var mo = new MutationObserver(function(){
    var o = isOpen();
    if (o && !_open) onOpen();
    else if (!o && _open) onClose();
  });
  // Escape で閉じる / Tab トラップ（document keydown は1回だけ）
  document.addEventListener('keydown', function(e){
    if (!isOpen()) return;                                   // horse-modal が開いている時だけ介入
    if (e.key === 'Escape'){
      if (e.defaultPrevented || e.isComposing) return;      // 他ハンドラ処理済み / IME変換中は閉じない
      e.preventDefault();
      if (typeof closeHorseModal === 'function') closeHorseModal();   // 既存の閉じる経路（history不変）
      return;
    }
    if (e.key === 'Tab'){
      var f = focusables(), d = dialogEl();
      if (!f.length){ e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1], a = document.activeElement, inside = !!(d && d.contains(a));
      if (e.shiftKey){ if (a === first || !inside){ last.focus({ preventScroll: true }); e.preventDefault(); } }
      else { if (a === last || !inside){ first.focus({ preventScroll: true }); e.preventDefault(); } }
    }
  });
  function init(){ var m = modalEl(); if (m){ mo.observe(m, { attributes: true, attributeFilter: ['class'] }); if (isOpen() && !_open) onOpen(); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/**
 * _hmSwitchCommentCount — コメント表示件数切り替えボタン共通処理
 */
function _hmSwitchCommentCount(listId, dataKey, countKey, n, allNums) {
  sessionStorage.setItem(countKey, String(n));
  const el = document.getElementById(listId);
  if(el) el.innerHTML = (window._buildCommentListHtml||function(){return '';})(dataKey, n);
  // ボタンの選択状態を更新
  (allNums||[5,10,15,30,99]).forEach(function(x){
    const b = document.getElementById('cmt-btn-'+x+'-'+listId);
    if(b){ b.style.background=(x===n?'#0e7490':'#fff'); b.style.color=(x===n?'#fff':'#374151'); }
  });
}

// ============================================================
// 🔗 HorseMarkInfo 公式データ取得
// ============================================================
/**
 * parseHorseMarkInfoHtml(html)
 * keiba.go.jp HorseMarkInfoページのHTMLから過去成績テーブルを解析する
 * 戻り値: { basicInfo:{name,age,sex,trainer,owner,...}, races:[{raceDate,raceName,raceNo,course,dist,trackCond,chakujun,jockey,kinryo,time,agari3f,weight,prize,...}] }
 */
function parseHorseMarkInfoHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result = { basicInfo:{}, races:[] };

  // ── 基本情報テーブル（調教師・馬主・血統など） ──
  for(const tbl of doc.querySelectorAll('table')){
    const txt = tbl.textContent.replace(/\s+/g,' ');
    if(!/調教師|馬主|生産者/.test(txt)) continue;
    tbl.querySelectorAll('tr').forEach(tr=>{
      const cells=tr.querySelectorAll('th,td');
      if(cells.length<2) return;
      const k=cells[0].textContent.replace(/\s/g,'');
      const v=cells[1].textContent.replace(/\s+/g,' ').trim();
      if(/調教師/.test(k))        result.basicInfo.trainer=v;
      else if(/馬主/.test(k))     result.basicInfo.owner=v;
      else if(/生産者/.test(k))   result.basicInfo.breeder=v;
      else if(/性別|性齢/.test(k))result.basicInfo.sexAge=v;
      else if(/母の父/.test(k))   result.basicInfo.broodmareSire=v;
      else if(/^母$/.test(k))     result.basicInfo.dam=v;
      else if(/^父$/.test(k))     result.basicInfo.sire=v;
      else if(/毛色/.test(k))     result.basicInfo.color=v;
      else if(/所属/.test(k))     result.basicInfo.belong=v;
    });
    break;
  }

  // ── 過去成績テーブル ──
  // keiba.go.jp HorseMarkInfo の固定列構成（実測）:
  // 【天候・馬場が別セルパターン（現行）】
  // [0]年月日 [1]競馬場 [2]R [3]競走名 [4]格組 [5]距離
  // [6]天候 [7]馬場 [8]頭数 [9]枠 [10]馬番 [11]人気 [12]着順
  // [13]タイム [14]差 [15]上3F [16]体重 [17]騎手(所属)
  // [18]重量(斤量) [19]調教師 [20]取得賞金 [21]1着馬
  for(const tbl of doc.querySelectorAll('table')){
    const txt = tbl.textContent.replace(/\s+/g,' ');
    if(!/着順/.test(txt)||!/上3F|上り|上がり/.test(txt)) continue;

    const rows=Array.from(tbl.querySelectorAll('tr'));
    if(rows.length<2) continue;

    // ── ヘッダー行を解析してインデックスを確定 ──
    // keiba.go.jpでは「天候」「馬場」が別々の<th>になっているため、
    // colspan を考慮した実セルインデックスでマッピングする
    const hdrCells=Array.from(rows[0].querySelectorAll('th,td'));
    const ci={
      date:-1, course:-1, raceNo:-1, raceName:-1, raceClass:-1,
      dist:-1, tenki:-1, trackCond:-1,  // trackCond は天候・馬場が別セルの場合に使用
      headCount:-1, waku:-1, umaBan:-1,
      ninki:-1, chakujun:-1, time:-1, diff:-1, agari:-1,
      weight:-1, jockey:-1, kinryo:-1, trainer:-1, prize:-1, winner:-1
    };
    // colspan を展開して実際の列インデックスを計算する
    let colIdx=0;
    hdrCells.forEach(cell=>{
      const h=cell.textContent.replace(/[\s\u3000]/g,'');
      const span=parseInt(cell.getAttribute('colspan')||'1');
      if(/^年月日$/.test(h))                         ci.date=colIdx;
      else if(/^競馬場$/.test(h))                    ci.course=colIdx;
      else if(/^R$/.test(h))                         ci.raceNo=colIdx;
      else if(/競走名|レース名/.test(h))              ci.raceName=colIdx;
      else if(/格組|格付|クラス/.test(h))            ci.raceClass=colIdx;
      else if(/^距離$/.test(h))                      ci.dist=colIdx;
      // 「天候」単独セル（別セルパターン）
      else if(/^天候$/.test(h))                      ci.tenki=colIdx;
      // 「馬場」単独セル（別セルパターン）
      else if(/^馬場$/.test(h))                      ci.trackCond=colIdx;
      // 「天候・馬場」複合セル（colspan=2 の場合など）
      else if(/天候.*馬場|馬場.*天候/.test(h)){      ci.tenki=colIdx; if(span>=2) ci.trackCond=colIdx+1; }
      else if(/頭数/.test(h))                        ci.headCount=colIdx;
      else if(/^枠$/.test(h))                        ci.waku=colIdx;
      else if(/^馬番$/.test(h))                      ci.umaBan=colIdx;
      else if(/^人気$/.test(h))                      ci.ninki=colIdx;
      else if(/^着順$/.test(h))                      ci.chakujun=colIdx;
      else if(/タイム|時計/.test(h))                 ci.time=colIdx;
      else if(/^差$|^着差$/.test(h))                ci.diff=colIdx;
      else if(/上3F|上り3F|上がり3F|上り$/.test(h))  ci.agari=colIdx;
      else if(/体重/.test(h))                        ci.weight=colIdx;
      else if(/騎手/.test(h))                        ci.jockey=colIdx;
      else if(/重量|斤量/.test(h))                   ci.kinryo=colIdx;
      else if(/調教師/.test(h))                      ci.trainer=colIdx;
      else if(/取得賞金|賞金/.test(h))               ci.prize=colIdx;
      else if(/1着馬|着馬/.test(h))                  ci.winner=colIdx;
      colIdx += span; // colspan ぶん進める
    });
    const hdrColCount = colIdx; // ヘッダーの実質列数（colspan展開後）

    // ── 天候・馬場が別セルかを判定 ──
    // 「馬場」が独立ヘッダーとして検出された → 別セルパターン確定
    const separateTenkiBaba = ci.trackCond >= 0;

    // ── フォールバック固定インデックス ──
    // keiba.go.jp の実際のページ構成（天候と馬場が別セル）を基準にする:
    // [0]年月日 [1]競馬場 [2]R [3]競走名 [4]格組 [5]距離
    // [6]天候 [7]馬場 [8]頭数 [9]枠 [10]馬番 [11]人気
    // [12]着順 [13]タイム [14]差 [15]上3F [16]体重
    // [17]騎手 [18]斤量 [19]調教師 [20]取得賞金 [21]1着馬
    if(ci.date<0)      ci.date=0;
    if(ci.course<0)    ci.course=1;
    if(ci.raceNo<0)    ci.raceNo=2;
    if(ci.raceName<0)  ci.raceName=3;
    if(ci.raceClass<0) ci.raceClass=4;
    if(ci.dist<0)      ci.dist=5;
    if(ci.tenki<0)     ci.tenki=6;
    // trackCond: 別セルならヘッダー検出済み。未検出なら天候の直後(=7)をデフォルト
    if(ci.trackCond<0) ci.trackCond=7;
    // separateTenkiBaba が確定していない場合、データ行セル数で判断するためここでは仮設定
    // headCount 以降は別セルパターン（+1）を基準に設定
    if(ci.headCount<0) ci.headCount=8;
    if(ci.waku<0)      ci.waku=9;
    if(ci.umaBan<0)    ci.umaBan=10;
    if(ci.ninki<0)     ci.ninki=11;
    if(ci.chakujun<0)  ci.chakujun=12;
    if(ci.time<0)      ci.time=13;
    if(ci.diff<0)      ci.diff=14;
    if(ci.agari<0)     ci.agari=15;
    if(ci.weight<0)    ci.weight=16;
    if(ci.jockey<0)    ci.jockey=17;
    if(ci.kinryo<0)    ci.kinryo=18;
    if(ci.trainer<0)   ci.trainer=19;
    if(ci.prize<0)     ci.prize=20;
    if(ci.winner<0)    ci.winner=21;

    // データ行を解析
    for(let i=1;i<rows.length;i++){
      const cells=Array.from(rows[i].querySelectorAll('td'));
      if(cells.length<10) continue;

      // ── 天候・馬場セル数を動的に判定 ──
      // ヘッダーで trackCond が独立検出されていない場合、
      // データ行の実セル数 vs ヘッダーの展開済み列数を比較して判断する
      // ・データ行セル数 >= hdrColCount → 別セルパターン（天候+馬場が独立セル）
      // ・データ行セル数 < hdrColCount  → 複合セルパターン（ヘッダーcolspan=2がデータでは1セル）
      let effCi = ci; // デフォルトは別セルパターン(=フォールバック設定済み)
      if(!separateTenkiBaba){
        // ヘッダーが複合セル(colspan=2)パターンだった場合:
        // データ行のセル数がヘッダーの実質列数より少ない → 複合セル確定
        if(cells.length < hdrColCount){
          // 複合セルパターン: headCount以降を-1シフトダウン
          effCi = Object.assign({}, ci, {
            trackCond: -1,  // 存在しない（同一セル内に天候・馬場が入っている）
            headCount: ci.headCount-1,
            waku:      ci.waku-1,
            umaBan:    ci.umaBan-1,
            ninki:     ci.ninki-1,
            chakujun:  ci.chakujun-1,
            time:      ci.time-1,
            diff:      ci.diff-1,
            agari:     ci.agari-1,
            weight:    ci.weight-1,
            jockey:    ci.jockey-1,
            kinryo:    ci.kinryo-1,
            trainer:   ci.trainer-1,
            prize:     ci.prize-1,
            winner:    ci.winner-1,
          });
        }
      }

      const g=(k)=>{
        const idx=effCi[k];
        if(idx==null||idx<0||idx>=cells.length) return '';
        return cells[idx].textContent.replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();
      };

      const dateStr=g('date');
      if(!dateStr||!/\d{4}/.test(dateStr)) continue;

      // 天候と馬場を読む
      // 別セルパターン: ci.tenki=6(天候), ci.trackCond=7(馬場) を個別に読む
      // 複合セルパターン: ci.tenki=6 から「晴 稍重」を split して分割
      let tenki='', trackCond='';
      if(separateTenkiBaba || (cells.length >= hdrCells.length)){
        // 別セルパターン
        tenki     = g('tenki');
        trackCond = g('trackCond');
      } else {
        // 複合セルパターン
        const tenkiBabaRaw = g('tenki');
        const parts = tenkiBabaRaw.split(/\s+/);
        tenki     = parts[0]||'';
        trackCond = parts[1]||'';
      }

      // 着順から数字のみ抽出（「1着」→「1」、「中止」→「中止」等）
      const chakujunRaw=g('chakujun');
      const chakujunNum=chakujunRaw.replace(/[^\d]/g,'');

      // 体重：「550」のみ（増減は別セルがない場合もある）
      const weightRaw=g('weight');
      const weightNum=(weightRaw.match(/^(\d{3,4})/)||['',''])[1];

      // 騎手：「阿部基（高知）」→ 「阿部基」
      const jockeyRaw=g('jockey');
      const jockey=jockeyRaw.replace(/[（(][^）)]*[）)]/g,'').replace(/\s/g,'').trim();

      // 上がり3F：数値のみ
      const agariRaw=g('agari');
      const agariNum=(agariRaw.match(/(\d{2}\.\d)/)||['',''])[1];

      // 賞金：数字のみ（万円単位かそのまま）
      const prizeRaw=g('prize');
      const prizeNum=(prizeRaw.replace(/,/g,'').match(/(\d+)/)||['',''])[1];
      // 円→万円変換（6桁以上なら円単位と判断）
      const prizeMen=prizeNum?( parseInt(prizeNum)>=10000 ? (parseInt(prizeNum)/10000).toFixed(1) : prizeNum ):'';

      // クラス
      // keiba.go.jp の「格組」列は「3歳－6」「C2－3」のような形式で入る場合がある
      // → detectRaceClass で正規化し、空の場合はレース名から補完する
      const raceClassRaw = g('raceClass');
      const raceNameRaw  = g('raceName');
      // 「3歳」「2歳」「C1」等を正規化して取得
      const raceClassNorm = detectRaceClass(raceClassRaw) || detectRaceClass(raceNameRaw) || raceClassRaw;

      const raceEntry={
        raceDate:  dateStr,
        course:    g('course'),
        raceNo:    g('raceNo'),
        raceName:  raceNameRaw,
        raceClass: raceClassNorm,  // 正規化済み（'3歳','2歳','C1'等）
        raceClassRaw: raceClassRaw, // 元の値（デバッグ用）
        dist:      g('dist'),
        tenki,
        trackCond,
        headCount: g('headCount'),
        ninki:     g('ninki'),
        chakujun:  chakujunNum,
        time:      g('time'),
        diff:      g('diff'),
        agari3f:   agariNum,
        weight:    weightNum,
        jockey,
        kinryo:    g('kinryo'),
        trainer:   g('trainer'),
        prize:     prizeMen,
        winner:    g('winner'),
      };
      if(raceEntry.chakujun||raceEntry.time) result.races.push(raceEntry);
    }
    if(result.races.length) break;
  }
  return _sanDeep(result);
}

/**
 * _renderOfficialSection(parsed, code, horseName)
 * parseHorseMarkInfoHtml の結果をモーダルに描画する共通処理
 * fetchHorseMarkInfo / openHorseModal（キャッシュ自動表示）両方から呼ばれる
 */
function _renderOfficialSection(parsed, code, horseName) {
  const content=document.getElementById('horse-modal-content');
  if(!content) return;

  // 既存の公式データセクションを削除
  const old=document.getElementById('official-race-section');
  if(old) old.remove();
  document.getElementById('official-class-outlook')?.remove();

  if(!parsed.races.length){ 
    const noData=document.createElement('div');
    noData.id='official-race-section';
    noData.style.cssText='background:#fff8f0;border:1px solid #fbd38d;border-radius:8px;padding:12px 16px;margin-top:12px;font-size:13px;color:#92400e';
    noData.innerHTML='<i class="fas fa-exclamation-triangle"></i> 公式ページからの成績取得ができませんでした（ページ構造の変更またはCORS制限）';
    content.appendChild(noData);
    return;
  }

  // ── 表示中の開催日より前だけを使う ──
  // 過去のレースを開いた時に、その後に走った成績が混ざらないようにする。
  // キャッシュへは全走ぶんを保存したままにし、ここで絞るのは画面と集計だけ。
  const viewedDate=parseDateStr(currentDate)||new Date();
  const _viewCutoffMs=viewedDate.getTime();
  const viewRaces=parsed.races.filter(r=>{
    const ms=_officialHistoryDateMs(r?.raceDate);
    return !Number.isFinite(ms)||ms<_viewCutoffMs;
  });

  if(!viewRaces.length){
    _saveOfficialHistoryCache(parsed, code, horseName);
    const noPast=document.createElement('div');
    noPast.id='official-race-section';
    noPast.style.cssText='background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-top:12px;font-size:13px;color:#475569';
    noPast.innerHTML='<i class="fas fa-info-circle"></i> この開催日より前の公式成績はありません';
    content.appendChild(noPast);
    return;
  }

  // ── JRA除外: 高知・地方競馬の成績のみ使用 ──
  const _normCourse = s => (s||'').replace(/\s/g,'')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const isJRACourse = c => /^J[^\d]/.test(_normCourse(c));
  // JRAを除いた全成績・高知のみ成績
  const nonJRARaces = viewRaces.filter(r => !isJRACourse(r.course||''));
  const kochiRaces   = viewRaces.filter(r => {
    const cn = _normCourse(r.course||'');
    return !isJRACourse(r.course||'') && (cn.includes('高知') || cn === '');
  });

  // ── 高知成績の馬体重データ（グラフ用） ──
  const _parseW = s => { const m=(s||'').match(/^(\d+)/); return m?parseInt(m[1]):NaN; };
  const weightDataOfficial = kochiRaces.map(r=>({
    w: _parseW(r.weight),
    c: parseInt(r.chakujun)||999,
    d: r.raceDate
  })).filter(e=>!isNaN(e.w)&&e.w>300&&e.w<700);

  // ── 基本情報 ──
  const bi=parsed.basicInfo;
  const basicHtml=Object.keys(bi).length?`
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:12px">
      ${bi.sexAge?`<span style="background:#e0f0ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-weight:700">${escapeHTML(bi.sexAge)}</span>`:''}
      ${bi.trainer?`<span style="background:#f4f6fa;color:#374151;padding:2px 8px;border-radius:10px">調教師: ${escapeHTML(bi.trainer)}</span>`:''}
      ${bi.owner?`<span style="background:#f4f6fa;color:#374151;padding:2px 8px;border-radius:10px">馬主: ${escapeHTML(bi.owner)}</span>`:''}
      ${bi.sire?`<span style="background:#fef9c3;color:#713f12;padding:2px 8px;border-radius:10px">父: ${escapeHTML(bi.sire)}</span>`:''}
      ${bi.dam?`<span style="background:#fef9c3;color:#713f12;padding:2px 8px;border-radius:10px">母: ${escapeHTML(bi.dam)}</span>`:''}
      ${bi.broodmareSire?`<span style="background:#fef9c3;color:#713f12;padding:2px 8px;border-radius:10px">母父: ${escapeHTML(bi.broodmareSire)}</span>`:''}
    </div>`:'';

  // ── 閲覧中の開催日時点。公式在籍馬の基準額＋基準日後の本賞金で再現する ──
  const prizeSummary=calcHorsePrizeSummary(viewRaces,viewedDate,parsed.baseline);

  const prizeCardHtml = prizeSummary ? (()=>{
    const ec = prizeSummary.estimatedClass;
    const total = prizeSummary.totalPrize;
    const cycleProjection=calcNextBangumiCycleProjection(viewRaces,viewedDate,prizeSummary);
    const rules=prizeSummary.classRules;
    const curIdx=rules.findIndex(r=>r.cls===ec.cls);
    const nextClass=curIdx>0?rules[curIdx-1]:null;
    const remaining=nextClass?Math.max(0,nextClass.min-total+0.1):0;
    const rangeMin = ec.min;
    const rangeMax = nextClass ? nextClass.min : ec.min + 200;
    const progress = Math.min(100, Math.max(0, ((total - rangeMin) / Math.max(rangeMax - rangeMin, 1)) * 100));

    const borderLines=rules.map((r,idx)=>{
      const isCur = r.cls === ec.cls;
      const isAbove = idx < curIdx;
      const condLabel = r.max === Infinity
        ? `${r.min.toLocaleString()}万円超`
        : `${r.max.toLocaleString()}万円以下`;
      return `<div style="margin-bottom:4px;opacity:${isAbove?'0.40':'1'}">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:${isCur?'3px':'0'}">
          <span style="background:${r.bg};color:${r.fg};font-size:10px;font-weight:700;padding:1px 7px;border-radius:8px;min-width:38px;text-align:center">${r.label}</span>
          <span style="font-size:11px;color:#4b5563;flex:1">${condLabel}</span>
          ${isCur ? `<span style="font-size:10px;color:#dc2626;font-weight:800;white-space:nowrap">◀ 現在</span>` : ''}
        </div>
        ${isCur ? `<div style="background:#e5e7eb;border-radius:4px;height:5px;overflow:hidden;margin-left:44px">
          <div style="background:${r.bg};height:5px;width:${progress.toFixed(1)}%;border-radius:4px"></div>
        </div>` : ''}
      </div>`;
    }).join('');

    const nextCard = nextClass ? `
      <div style="background:linear-gradient(135deg,${nextClass.bg}15,${nextClass.bg}04);border:1.5px solid ${nextClass.bg};border-radius:8px;padding:10px 14px;min-width:155px;flex:1">
        <div style="font-size:10px;font-weight:700;color:${nextClass.bg};margin-bottom:3px">⬆️ 次クラス昇格まで</div>
        <div style="font-size:21px;font-weight:800;color:${nextClass.bg};line-height:1.1">${remaining.toFixed(1)}<span style="font-size:11px;font-weight:600">万円</span></div>
        <div style="font-size:10px;color:#6b7280;margin-bottom:5px">${nextClass.label}（${nextClass.max.toLocaleString()}万円以下）へ</div>
        <div style="background:#e5e7eb;border-radius:4px;height:7px;overflow:hidden">
          <div style="background:${ec.bg};height:7px;width:${progress.toFixed(1)}%;border-radius:4px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#9ca3af;margin-top:2px">
          <span>${rangeMin.toLocaleString()}万</span>
          <span style="font-weight:700">${progress.toFixed(0)}%</span>
          <span>${rangeMax.toLocaleString()}万</span>
        </div>
      </div>` : `
      <div style="background:#eff6ff;border:1.5px solid #1d4ed8;border-radius:8px;padding:10px 14px;min-width:155px;flex:1;text-align:center">
        <div style="font-size:22px;margin-bottom:2px">🏆</div>
        <div style="font-size:11px;font-weight:800;color:#1d4ed8">最高クラス A 到達</div>
        <div style="font-size:10px;color:#6b7280">1,100万円超達成</div>
      </div>`;

    const nextCycleCard = cycleProjection ? (()=>{
      const cp = cycleProjection;
      const tone = cp.isDemotion ? '#ea580c' : '#15803d';
      const bg = cp.isDemotion ? '#fff7ed' : '#f0fdf4';
      const status = cp.isLowestClass
        ? 'これより下の級区分はありません'
        : cp.isDemotion
          ? `現級維持まであと ${cp.retentionNeeded.toFixed(1)}万円`
          : `現級維持ラインを ${cp.retentionMargin.toFixed(1)}万円上回る`;
      return `<div data-next-cycle-projection="${cp.isDemotion?'demotion':'retain'}" style="background:${bg};border:1.5px solid ${tone};border-radius:8px;padding:10px 14px;min-width:190px;flex:1">
        <div style="font-size:10px;font-weight:700;color:${tone};margin-bottom:3px">🔄 次サイクル降級見込み</div>
        <div style="font-size:17px;font-weight:800;color:${tone};line-height:1.2">${cp.currentClass.label} → ${cp.projectedClass.label} <span style="font-size:11px">${cp.isDemotion?'降級見込み':'維持見込み'}</span></div>
        <div style="font-size:10px;color:#4b5563;margin-top:4px">9月起算・持越し ${cp.nextSummary.totalPrize.toFixed(1)}万円</div>
        ${cp.droppedPrize>0?`<div style="font-size:10px;color:#6b7280">起算日変更で対象外 ${cp.droppedPrize.toFixed(1)}万円</div>`:''}
        <div style="font-size:10px;font-weight:700;color:${tone};margin-top:3px">${status}</div>
        ${!cp.isComplete?`<div style="font-size:9px;color:#b45309;font-weight:700;margin-top:3px">⚠ 対象外期間の賞金欠損を含む暫定値</div>`:''}
        <div style="font-size:9px;color:#9ca3af;margin-top:3px">${/(?:3歳|3才|[牡牝騸セ]3)/.test(String(bi.sexAge||''))?'3歳馬は一般格編入時の参考値。':''}現時点の推定。残り開催の獲得賞金・編成判断で変動</div>
      </div>`;
    })() : '';

    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 16px;min-width:145px;flex:1">
        <div style="font-size:10px;font-weight:700;color:#15803d;letter-spacing:.04em">💰 番組賞金（${prizeSummary.baseline?'公式基準＋確定分':'再構成'}）</div>
        <div style="font-size:24px;font-weight:800;color:#15803d;line-height:1.2">${total.toFixed(1)}<span style="font-size:12px">万円</span></div>
        <div style="font-size:10px;color:#6b7280">${prizeSummary.baseline?`公式${prizeSummary.baseline.asOf.replace(/-/g,'/')}基準＋${prizeSummary.countedRaces}走`:`${prizeSummary.countedRaces}走対象`}</div>
        <div style="font-size:9px;color:#0369a1;margin-top:2px;font-weight:600">📅 ${prizeSummary.periodStart.toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric'})}以降</div>
        <div style="font-size:9px;color:#9ca3af">閲覧当日/未来除外・JRA本賞30%換算${prizeSummary.skippedRaces>0?` / 期間外${prizeSummary.skippedRaces}走除外`:''}</div>
        ${prizeSummary.missingPrizeRaces?`<div style="font-size:9px;color:#b45309;font-weight:700">⚠ 賞金欠損${prizeSummary.missingPrizeRaces}走は加算せず</div>`:''}
        ${prizeSummary.unresolvedJraRaces?`<div style="font-size:9px;color:#b45309;font-weight:700">⚠ JRA付加賞未分離${prizeSummary.unresolvedJraRaces}走は概算</div>`:''}
      </div>
      <div style="background:${ec.bg}18;border:1.5px solid ${ec.bg};border-radius:8px;padding:10px 16px;min-width:115px;flex:1">
        <div style="font-size:10px;font-weight:700;color:${ec.bg};letter-spacing:.04em">🏷️ 推定格付けクラス</div>
        <div style="font-size:30px;font-weight:800;color:${ec.bg};line-height:1.1">${ec.label}</div>
        <div style="font-size:10px;color:#6b7280">${ec.max===Infinity?ec.min+'万円超':ec.max+'万円以下'}</div>
      </div>
      ${nextCard}
      ${nextCycleCard}
      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:175px;flex:2">
        <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:5px">📊 格付けボーダーライン（令和${prizeSummary.fiscalYear-2018}年度）</div>
        ${borderLines}
        <div style="font-size:9px;color:#9ca3af;margin-top:4px;border-top:1px solid #e5e7eb;padding-top:3px">出典：高知競馬番組編成要領 6.(4)</div>
      </div>
    </div>
    ${prizeSummary.prizeDetails.length ? `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:10px;color:#374151">
      <div style="font-weight:700;margin-bottom:4px;color:#6b7280">🔍 換算明細（対象走のみ）</div>
      ${prizeSummary.prizeDetails.map(d=>`<div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid #f3f4f6;align-items:center;flex-wrap:wrap">
        <span style="min-width:78px;color:#9ca3af">${d.date}</span>
        <span style="min-width:24px;text-align:center">${escapeHTML(d.chakujun)}着</span>
        <span style="min-width:40px;color:#0369a1;font-size:9px">${escapeHTML(d.course)||'?'}</span>
        <span style="min-width:48px;color:#7c3aed;font-weight:700">${escapeHTML(d.raceClass)||'(空)'}</span>
        <span style="min-width:90px;color:#374151;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(d.raceName)||'(空)'}</span>
        ${d.rate!=null?`<span style="color:#6b7280">${d.rawPrize.toFixed(1)}万×<strong style="color:${d.rate<0.5?'#dc2626':d.rate<1?'#d97706':'#15803d'}">${(d.rate*100).toFixed(0)}%</strong></span>`:'<span style="color:#9ca3af">推定値</span>'}
        <span style="margin-left:auto;font-weight:700;color:#15803d">=&nbsp;${d.prize.toFixed(1)}万</span>
      </div>`).join('')}
    </div>` : ''}`;
  })() : '';

  // ── 公式成績テーブル（JRA含む全成績・JRA行はグレーアウト） ──
  const hasPrize = viewRaces.some(r=>r.prize&&r.prize!=='0');
  const hasWinner = viewRaces.some(r=>r.winner);
  const raceRows=viewRaces.slice(0,50).map(r=>{
    const c=parseInt(r.chakujun)||999;
    const isWin=c<=3;
    const cCls=c===1?'chakujun-1':c===2?'chakujun-2':c===3?'chakujun-3':'';
    const isJRA = isJRACourse(r.course||'');
    const tenkiHtml=r.tenki?`<span style="font-size:10px;color:#374151">${escapeHTML(r.tenki)}</span>`:'';
    const trackCondHtml=r.trackCond
      ?`<span class="track-cond-badge track-cond-${trackCondClass(r.trackCond)}" style="font-size:10px;padding:1px 5px;margin-left:2px">${escapeHTML(r.trackCond)}</span>`:'';
    const clsBadge=r.raceClass
      ?`<span class="race-class-badge ${raceClassCssClass(r.raceClass)}" style="font-size:10px;padding:1px 5px">${escapeHTML(r.raceClass)}</span>`:'—';
    const rowStyle = isJRA
      ? 'opacity:0.42;background:#f1f5f9'
      : isWin ? 'background:#fffbeb' : '';
    return`<tr style="${rowStyle}">
      <td style="font-size:11px;white-space:nowrap">${escapeHTML(r.raceDate)}</td>
      <td style="font-size:11px;text-align:left${isJRA?';color:#94a3b8':''}">${escapeHTML(r.course)||'—'}${isJRA?'<span style="font-size:9px;color:#94a3b8;margin-left:3px">JRA</span>':''}</td>
      <td style="font-size:11px">${escapeHTML(r.raceNo)||'—'}</td>
      <td style="font-size:11px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left">${escapeHTML(r.raceName)||'—'}</td>
      <td style="font-size:10px">${clsBadge}</td>
      <td style="font-size:11px">${escapeHTML(r.dist)||'—'}</td>
      <td style="font-size:11px;white-space:nowrap">${tenkiHtml}${trackCondHtml}</td>
      <td style="font-size:11px">${escapeHTML(r.headCount)||'—'}</td>
      <td style="font-size:11px">${escapeHTML(r.ninki)||'—'}</td>
      <td><span class="chakujun-badge ${cCls}" style="font-size:12px;min-width:22px;height:22px">${c<900?escapeHTML(r.chakujun):'—'}</span></td>
      <td style="font-family:monospace;font-size:11px">${escapeHTML(r.time)||'—'}</td>
      <td style="font-family:monospace;font-weight:800;color:#1d4ed8;font-size:13px">${escapeHTML(r.agari3f)||'—'}</td>
      <td style="font-size:11px">${r.weight?escapeHTML(r.weight)+'kg':'—'}</td>
      <td style="font-size:11px">${escapeHTML(r.jockey)||'—'}</td>
      <td style="font-size:11px">${escapeHTML(r.kinryo)||'—'}</td>
      ${hasPrize?`<td style="font-size:11px;color:#15803d;font-weight:700">${r.prize?escapeHTML(r.prize)+'万':'—'}</td>`:''}
      ${hasWinner?`<td style="font-size:11px;color:#6b7280;max-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(r.winner)||'—'}</td>`:''}
    </tr>`;
  }).join('');

  // ── 馬体重グラフ（高知の成績のみ） ──
  const officialWeightChartId = `official-weight-chart-${code}`;
  const officialWeightChartHtml = weightDataOfficial.length >= 2 ? `
  <div style="margin-top:14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:14px 16px">
    <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px;display:flex;align-items:center;gap:6px">
      <i class="fas fa-weight"></i> 馬体重推移グラフ（高知・公式成績）
      <span style="font-size:11px;font-weight:400;color:#6b7280">⭐=好走（3着内）</span>
    </div>
    <div style="font-size:10px;color:#9ca3af;margin-bottom:8px">${weightDataOfficial.length}走分のデータ（JRA除く高知のみ）</div>
    <div style="position:relative;height:180px;"><canvas id="${officialWeightChartId}"></canvas></div>
  </div>` : '';

  // ── セクション全体 ──
  // 表示/非表示トグルで本体を折りたたみ可能にする
  const sectionBodyId = `official-section-body-${code}`;
  const sectionToggleId = `official-section-toggle-${code}`;
  const outlookAnchor = document.getElementById('hm-top-anchor');
  const prizeAtTop = !!(outlookAnchor && prizeCardHtml);
  // 初期状態を sessionStorage で保持（デフォルト=表示）
  const _toggleKey = `_officialVisible_${code}`;
  const _initVisible = sessionStorage.getItem(_toggleKey) !== 'false';

  const section=document.createElement('div');
  section.id='official-race-section';
  section.innerHTML=`
  <div style="margin-top:14px;background:#f0f9ff;border:1.5px solid #7dd3fc;border-radius:10px;overflow:hidden">
    <!-- ヘッダー（クリックで折りたたみ） -->
    <div id="${sectionToggleId}" onclick="(function(){
      var body=document.getElementById('${sectionBodyId}');
      var isVis=body.style.display!=='none';
      body.style.display=isVis?'none':'block';
      sessionStorage.setItem('${_toggleKey}',String(!isVis));
      this.querySelector('.toggle-icon').textContent=isVis?'▶':'▼';
    }).call(this)"
    style="cursor:pointer;padding:12px 16px;display:flex;align-items:center;gap:8px;background:#f0f9ff;user-select:none">
      <i class="fas fa-globe" style="color:#0369a1"></i>
      <span style="font-size:13px;font-weight:700;color:#0369a1;flex:1">keiba.go.jp 公式成績（全${viewRaces.length}走 / 地方${nonJRARaces.length}走 / JRA${viewRaces.length-nonJRARaces.length}走）${parsed.races.length>viewRaces.length?`<span style="font-size:10px;font-weight:600;color:#6b7280;margin-left:4px">この開催日より後の${parsed.races.length-viewRaces.length}走は非表示</span>`:''}</span>
      <span style="font-size:11px;color:#6b7280">JRA成績はグレー表示・番組賞金へ30%換算</span>
      <span class="toggle-icon" style="font-size:12px;color:#0369a1;min-width:14px">${_initVisible?'▼':'▶'}</span>
    </div>
    <!-- 本体（折りたたみ対象） -->
    <div id="${sectionBodyId}" style="display:${_initVisible?'block':'none'};padding:0 16px 14px">
      ${basicHtml}
      ${prizeAtTop?'':prizeCardHtml}
      ${officialWeightChartHtml}
      <div style="overflow-x:auto;margin-top:10px">
        <table class="deban-table" style="font-size:12px;min-width:900px">
          <thead><tr style="background:#0369a1">
            <th>年月日</th><th>競馬場</th><th>R</th><th>競走名</th><th>格組</th>
            <th>距離</th><th>天候/馬場</th><th>頭数</th><th>人気</th><th>着順</th>
            <th>タイム</th><th style="color:#fde68a">上がり3F</th><th>体重</th>
            <th>騎手</th><th>斤量</th>
            ${hasPrize?'<th>取得賞金</th>':''}
            ${hasWinner?'<th>1着馬</th>':''}
          </tr></thead>
          <tbody>${raceRows}</tbody>
        </table>
      </div>
      <div style="font-size:10px;color:#9ca3af;margin-top:6px">JRA（グレー行）の取得賞金は番組賞金へ30%換算して格付け推定に算入します</div>
    </div>
  </div>`;
  if(prizeAtTop){
    const outlook=document.createElement('section');
    outlook.id='official-class-outlook';
    outlook.setAttribute('aria-label','現在級・昇降級見込み');
    outlook.innerHTML=prizeCardHtml;
    outlookAnchor.insertAdjacentElement('afterend',outlook);
  }
  content.appendChild(section);
  // スクロール位置は openHorseModal 側で制御するためここでは行わない

  // ── 馬体重グラフ描画（高知公式データ） ──
  if(weightDataOfficial.length >= 2){
    const drawOfficialWeightChart = () => requestAnimationFrame(()=>{
      const canvas = document.getElementById(officialWeightChartId);
      if(!canvas) return;
      const sortedW = [...weightDataOfficial].reverse();
      const labels = sortedW.map(e=>e.d);
      const vals   = sortedW.map(e=>e.w);
      const isWins = sortedW.map(e=>e.c<=3);
      if(window._hmOfficialWeightChart){ try{window._hmOfficialWeightChart.destroy();}catch(e){ _kvSwallow('drawOfficialWeightChart', e); } }
      window._hmOfficialWeightChart = new Chart(canvas,{
        type:'line',
        data:{
          labels,
          datasets:[{
            label:'馬体重（高知）',
            data:vals,
            borderColor:'#d97706',
            backgroundColor:'rgba(217,119,6,0.1)',
            borderWidth:2,
            fill:true,
            tension:0.3,
            pointRadius: vals.map((_,i)=>isWins[i]?9:5),
            pointBackgroundColor: vals.map((_,i)=>isWins[i]?'#f59e0b':'#fff'),
            pointBorderColor: vals.map((_,i)=>isWins[i]?'#b45309':'#d97706'),
            pointBorderWidth: vals.map((_,i)=>isWins[i]?3:2),
            pointStyle: vals.map((_,i)=>isWins[i]?'star':'circle'),
          }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{callbacks:{label:ctx=>{
              const i=ctx.dataIndex;
              return isWins[i]?` ⭐ ${ctx.parsed.y}kg（3着内）`:` ${ctx.parsed.y}kg`;
            }}}
          },
          scales:{
            y:{title:{display:true,text:'kg',font:{size:10}},ticks:{callback:v=>v+'kg'}},
            x:{ticks:{font:{size:10},maxRotation:30}}
          }
        }
      });
    });
    // ensureChartJs は ai-analysis.js にしか無いので、本体の _kvLoadLibrary を直接呼ぶ
    _kvLoadLibrary('chart').then(drawOfficialWeightChart).catch(e => _kvSwallow('drawOfficialWeightChart:chart', e));
  }

  // ── キャッシュ保存 ──
  _saveOfficialHistoryCache(parsed, code, horseName);
}

/** 端末に置く公式成績の上限。共有DBが正本なので、あふれた分は捨ててよい（開けば戻る）。 */
const OFFICIAL_HISTORY_LOCAL_MAX = 300;

/** 上限を超えたローカルの公式成績を古い順に捨てる。共有DBは触らない（ローカルIDBのみ）。 */
function _trimOfficialHistoryCache(limit = OFFICIAL_HISTORY_LOCAL_MAX) {
  const store = lsRead();
  const rows = Object.keys(store)
    .filter(k => k.startsWith('official_') && store[k]?.type === 'official')
    .map(k => ({ k, at: Date.parse(String(store[k]?.savedAt || '')) || 0 }));
  if (rows.length <= limit) return 0;
  rows.sort((a, b) => a.at - b.at);
  const drop = rows.slice(0, rows.length - limit);
  drop.forEach(r => idbDelete(r.k));
  return drop.length;
}

/**
 * 出馬表を開いた時に、その日の出走馬の公式成績を共有DBから端末へ入れておく（管理者のみ）。
 * 取得は Worker 経由なので、共有DBに無い馬はここで公式から取られ共有DBにも残る＝
 * 開催のたびに不足分だけが足されていく。閲覧者は馬を開いた時だけ個別に取る。
 */
async function _hydrateOfficialHistoriesForDay(date, baba) {
  if (baba !== '31') return 0;
  if (typeof isAdminMode !== 'function' || !isAdminMode()) return 0;
  const store = lsRead();
  const seen = new Set(), wanted = [];
  Object.values(allRacesData || {}).forEach(d => (d?.horses || []).forEach(h => {
    const code = String(h.lineageLoginCode || h.lineage_login_code || '').trim();
    if (!/^\d{8,14}$/.test(code) || seen.has(code)) return;
    seen.add(code);
    const state = getOfficialHistoryCacheState(store[`official_${code}`], date, null);
    if (state.usable && !state.shouldRefresh) return;   // 既に足りている馬は触らない
    wanted.push({ code, name: h.horseName || '' });
  }));
  if (!wanted.length) return 0;

  let got = 0;
  for (let i = 0; i < wanted.length; i += 3) {
    if (date !== currentDate || baba !== currentBaba) break;   // 別の日へ移ったら中止
    await Promise.all(wanted.slice(i, i + 3).map(async ({ code, name }) => {
      try {
        const fetched = await fetchOfficialHorseHistory(code, name);
        _saveOfficialHistoryCache({ races: fetched.races, basicInfo: fetched.basicInfo }, code, name);
        got++;
      } catch (_) { /* 公式に成績が無い馬・通信失敗は次回に回す */ }
    }));
    await new Promise(r => setTimeout(r, 250));
  }
  _trimOfficialHistoryCache();
  return got;
}

/**
 * 取得し直した公式成績を、既に持っている分へ足し込む。
 * 既存の走は消さない・入っている値は上書きしない（空欄だけ埋める）・
 * 走数が減る結果は取得の失敗とみなして既存を残す。Worker 側と同じ規則。
 */
function _mergeOfficialRaces(stored, fetched) {
  const older = Array.isArray(stored) ? stored : [];
  const newer = Array.isArray(fetched) ? fetched : [];
  // 壊れた既存データに足し込むと誤りが消せなくなるので、その時だけは総取り替えにする
  if(!older.length || !isOfficialHistoryCacheValid(older)) return newer;
  if(!newer.length) return older;
  const keyOf = r => [r?.raceDate, r?.course, r?.raceNo].join('|');
  const merged = new Map();
  older.forEach(r => merged.set(keyOf(r), {...r}));
  newer.forEach(r => {
    const kept = merged.get(keyOf(r));
    if(!kept) { merged.set(keyOf(r), {...r}); return; }
    Object.keys(r).forEach(f => {
      const had = kept[f];
      if(had === undefined || had === null || String(had).trim() === '') kept[f] = r[f];
    });
  });
  const out = [...merged.values()].sort((a,b)=>String(b.raceDate||'').localeCompare(String(a.raceDate||'')));
  return out.length >= older.length ? out : older;
}

/** 公式成績のローカルキャッシュ保存。表示は開催日で絞るが、保存は全走ぶんのまま。 */
function _saveOfficialHistoryCache(parsed, code, horseName) {
  if(!parsed || parsed._saveToCache === false) return;
  const prev = lsRead()[`official_${code}`];
  const hasBasic = parsed.basicInfo && Object.keys(parsed.basicInfo).length;
  lsWrite(`official_${code}`, {
    type: 'official',
    lineageCode: code,
    horseName: horseName || prev?.horseName || '',
    races: _mergeOfficialRaces(prev?.races, parsed.races),
    basicInfo: hasBasic ? parsed.basicInfo : (prev?.basicInfo || {}),
    baseline: parsed.baseline || prev?.baseline || null,
    savedAt: new Date().toISOString()
  });
}

/**
 * fetchHorseMarkInfo(auto)
 * モーダルのボタン、またはキャッシュが無い時の自動取得から呼ばれる。
 * @param {boolean} [auto] モーダルを開いた時の自動取得。失敗しても警告を出さない
 *   （公式に成績が無い馬でモーダルを開くたびに赤い箱が出るのを避けるため）
 */
async function fetchHorseMarkInfo(auto) {
  const btn=document.getElementById('horse-fetch-btn');
  if(!btn) return;
  const code=btn.dataset.code;
  const horseName=btn.dataset.horse;
  if(!code) return;

  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> 取得中...';
  btn.disabled=true;

  let parsed;
  try {
    const [fetched,baseline]=await Promise.all([fetchOfficialHorseHistory(code,horseName),getKochiOfficialBaseline(code,parseDateStr(currentDate)).catch(()=>null)]);
    const cached=lsRead()[`official_${code}`];
    // 表示も保存も「既存＋不足分」で揃える（取りこぼしのある取得で走が減らないように）
    parsed={races:_mergeOfficialRaces(cached?.races,fetched.races),basicInfo:Object.keys(fetched.basicInfo).length?fetched.basicInfo:(cached?.basicInfo||{}),baseline,_saveToCache:true};
    btn.innerHTML='<i class="fas fa-sync-alt"></i> 再取得';
  } catch(e) {
    btn.innerHTML='<i class="fas fa-database"></i> 公式成績を取得';
    const content=auto?null:document.getElementById('horse-modal-content');
    if(content){
      document.getElementById('official-fetch-error')?.remove();
      const error=document.createElement('div');
      error.id='official-fetch-error';
      error.style.cssText='background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px 14px;margin:8px 0;color:#9a3412;font-size:12px';
      error.innerHTML='<i class="fas fa-exclamation-triangle"></i> 公式成績を取得できませんでした。通信状態を確認して「公式成績を取得」を再度押してください。';
      const anchor=document.getElementById('hm-top-anchor');
      anchor?anchor.insertAdjacentElement('afterend',error):content.prepend(error);
    }
    btn.disabled=false;
    return;
  }
  btn.disabled=false;

  const content=document.getElementById('horse-modal-content');
  if(!content) return;
  document.getElementById('official-fetch-error')?.remove();
  _renderOfficialSection(parsed, code, horseName);
  // 馬を開くたびに1頭ぶん増えるので、ここでも端末の上限を効かせる（閲覧者はこの経路しか通らない）
  _trimOfficialHistoryCache();
}

// ============================================================
// 🐴 全馬一括公式成績取得
// ============================================================
/**
 * fetchAllHorsesOfficialData()
 * 現在表示中のレースの全馬のlineageLoginCodeから
 * keiba.go.jp公式成績を順次取得してキャッシュに保存する。
 * 取得済み馬（officialキャッシュあり）はスキップする。
 */
async function fetchAllHorsesOfficialData(silent = false) {
  // 現在のレース全馬を集める（全レース分）
  const allHorses = [];
  Object.entries(allRacesData).forEach(([rno, data]) => {
    if(!data || !data.horses) return;
    data.horses.forEach(h => {
      if(h.lineageLoginCode) {
        allHorses.push({ horseName: h.horseName, code: h.lineageLoginCode });
      }
    });
  });
  // 重複除去（lineageLoginCode単位）
  const unique = [];
  const seen = new Set();
  allHorses.forEach(h => {
    if(!seen.has(h.code)){ seen.add(h.code); unique.push(h); }
  });

  if(!unique.length){
    if(!silent) alert('lineageLoginCode（血統コード）が取得できている馬がいません。\n先にレースデータを取得・保存してください。');
    return;
  }
  try { await _kvLoadLibrary('adminHorse'); }
  catch (e) { if (!silent) alert('管理データ取得機能を読み込めませんでした'); return; }

  // 進捗表示バー作成
  const btn = document.getElementById('fetch-all-official-btn');
  const origLabel = btn ? btn.innerHTML : '';
  let progressBar = document.getElementById('fetch-all-progress-bar');
  if(!progressBar){
    progressBar = document.createElement('div');
    progressBar.id = 'fetch-all-progress-bar';
    progressBar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f3e8ff;border-bottom:2px solid #7c3aed;padding:8px 20px;font-size:13px;font-weight:700;color:#5b21b6;display:flex;align-items:center;gap:12px';
    document.body.prepend(progressBar);
  }

  const lsData = lsRead();
  let done = 0, skipped = 0, failed = 0, refreshed = 0;
  const total = unique.length;

  for(const { horseName, code } of unique) {
    // 取得済みでも古ければ更新する。存在だけでスキップすると、直近の獲得賞金が
    // 欠けたまま格付けを誤判定する。
    const cacheKey = `official_${code}`;
    const existingCache=lsData[cacheKey];
    const knownHistory=getHorseHistory(horseName);
    const cacheState=getOfficialHistoryCacheState(existingCache,currentDate,knownHistory);
    if(cacheState.usable && !cacheState.shouldRefresh){
      skipped++;
      done++;
      progressBar.innerHTML = `<i class="fas fa-horse-head" style="color:#7c3aed"></i> 公式成績一括取得中… ${done}/${total} 頭（スキップ:${skipped} 失敗:${failed}）`;
      continue;
    }

    progressBar.innerHTML = `<i class="fas fa-spinner fa-spin" style="color:#7c3aed"></i> 公式成績取得中: <strong>${horseName}</strong> (${done+1}/${total}) スキップ:${skipped}`;
    if(btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 取得中 ${done+1}/${total}`; }

    try {
      const parsed = await fetchOfficialHorseHistory(code, horseName, 15000);
      // 取得成功 → キャッシュ保存
      lsWrite(cacheKey, {
        type: 'official',
        lineageCode: code,
        horseName,
        races: parsed.races,
        basicInfo: parsed.basicInfo,
        savedAt: parsed.fetchedAt
      });
      // 予想AIが読む fromOfficial エントリも保存
      storeOfficialRacesAsHorseEntries(horseName, code, parsed.races);
      if(existingCache) refreshed++;
    } catch(e) {
      failed++;
    }

    done++;
    // プロキシ負荷軽減のため少し待機
    await new Promise(r => setTimeout(r, 1200));
  }

  // 完了
  if(btn) { btn.disabled = false; btn.innerHTML = origLabel; }
  const fetched=total-skipped-failed;
  progressBar.innerHTML = `<i class="fas fa-check-circle" style="color:#16a34a"></i> 取得完了！ ${total}頭中 新規:${fetched-refreshed}頭 更新:${refreshed}頭 スキップ:${skipped}頭 失敗:${failed}頭 <button onclick="document.getElementById('fetch-all-progress-bar').remove()" style="margin-left:16px;padding:2px 10px;border-radius:6px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-size:12px">閉じる</button>`;
}

/**
 * getOfficialCachedData(lineageCode)
 * lsRead から公式成績キャッシュを取得する
 */
function getOfficialCachedData(lineageCode) {
  if(!lineageCode) return null;
  const lsData = lsRead();
  return lsData[`official_${lineageCode}`] || null;
}

// ============================================================
// 💰 高知競馬 格付け・賞金計算
// ============================================================
/** 令和8年度高知競馬番組編成要領4（番組賞金）・6(4)（級区分）準拠。
 */

// 【PDF 6.(4) 正確な級区分ボーダー】
// min: このクラスになるための番組賞金下限（万円）= 上位クラスの上限
// max: このクラスの番組賞金上限（万円）
// 例) B = 700万円超 かつ 1100万円以下
const KOCHI_CLASS_RULES = [
  { cls:'A',    label:'A',    min:1100, max:Infinity, bg:'#1d4ed8', fg:'#fff' },
  { cls:'B',    label:'B',    min:700,  max:1100,     bg:'#15803d', fg:'#fff' },
  { cls:'C1',   label:'C1',   min:460,  max:700,      bg:'#ea580c', fg:'#fff' },
  { cls:'C2',   label:'C2',   min:300,  max:460,      bg:'#d97706', fg:'#fff' },
  { cls:'C3上', label:'C3上', min:200,  max:300,      bg:'#ca8a04', fg:'#fff' },
  { cls:'C3下', label:'C3下', min:0,    max:200,      bg:'#6b7280', fg:'#fff' },
];

// 収得賞金換算率（要領4(1)(イ)）。JRAの会場名は「J東京」等の表記を含む。
const KOCHI_CONVERSION_RATE_TABLE = [
  // ─── 30%グループ ───
  // JRA（keiba.go.jpは「J東京」「J中山」「J福島」「J阪神」「J京都」「J小倉」「J新潟」「J中京」「J函館」「J札幌」等）
  // → 先頭に「J」が付いていれば全てJRAと判定
  { courses:['J東京','J中山','J福島','J阪神','J京都','J小倉','J新潟','J中京','J函館','J札幌','J鹿児島','JRA','中央'], raceKw:[], rate:0.30 },
  // ダートグレード競走（競馬場問わず）
  { courses:[], raceKw:['ダートグレード','GI','GII','GIII','JpnI','JpnII','JpnIII','Jpn'], rate:0.30 },
  // 他場の2歳競走
  { courses:['佐賀','北海道','門別','岩手','盛岡','水沢','金沢','笠松','愛知','名古屋','弥富','兵庫','園田','姫路','川崎','大井','船橋','浦和'], raceKw:['2歳','2才'], rate:0.30 },

  // ─── 50%グループ（南関東）───
  { courses:['浦和','船橋','大井','川崎'], raceKw:[], rate:0.50 },

  // ─── 70%グループ（兵庫）───
  { courses:['兵庫','園田','姫路'], raceKw:[], rate:0.70 },

  // ─── 90%グループ ───
  { courses:['岩手','盛岡','水沢','金沢','笠松','愛知','名古屋','弥富','北海道','門別','佐賀'], raceKw:[], rate:0.90 },

  // ─── 100%（高知一般競走） ───
  { courses:['高知'], raceKw:[], rate:1.00 },
];

// 競馬場名とレース名から番組賞金への換算率を返す。
function getConversionRate(course, raceName) {
  // 全角→半角に正規化してから比較
  const normalize = s => (s||'').replace(/\s/g,'')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const c = normalize(course);
  const n = normalize(raceName);

  // ★ JRA判定: keiba.go.jpは「J東京」「J中山」「J福島」「Ｊ福島」等で記録
  //   半角/全角正規化後に先頭「J」+非数字 → JRA会場 → 30%
  if(/^J[^\d]/.test(c)) return 0.30;

  // 高知の「3歳以上／3歳上」は年齢限定ではなく一般競走。末尾が級・組の競走だけを年齢限定とする。
  if(c.includes('高知')){
    if(/[23](?:歳|才)(?:以上|上)/.test(n)) return 1.00;
    if(/2(?:歳|才)/.test(n)) return 0.10;
    if(/3(?:歳|才)/.test(n)) return 0.30;
    return 1.00;
  }

  for(const entry of KOCHI_CONVERSION_RATE_TABLE){
    // ① 競馬場条件: courses が空なら全場対象、そうでなければいずれかが部分一致
    const courseMatch = entry.courses.length === 0
      || entry.courses.some(k => c.includes(k));
    if(!courseMatch) continue;

    // ② レース名条件: raceKw が空なら無条件、そうでなければいずれかが部分一致
    const raceMatch = entry.raceKw.length === 0
      || entry.raceKw.some(k => n.includes(k));
    if(!raceMatch) continue;

    return entry.rate;
  }
  // 未定義の地方競馬はデフォルト90%
  return 0.90;
}

/**
 * 現在の開催日から番組賞金算出対象期間の開始日を求める
 * PDF 4.(1)(ア)：
 *   4月1日〜8月31日開催 → 2年前の4月1日から編成日まで
 *   9月1日〜3月31日開催 → 2年前の9月1日から編成日まで
 * @param {Date} [refDate=今日] - 基準日（省略時は今日）
 * @returns {Date} 算出対象期間の開始日
 */
function getKochiFiscalYear(refDate) {
  const d=refDate?new Date(refDate):new Date();
  return d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;
}

function getKochiClassRules(refDate) {
  const fy=getKochiFiscalYear(refDate);
  if(fy!==2025) return KOCHI_CLASS_RULES;
  const d=refDate?new Date(refDate):new Date();
  const c3floor=d>=new Date(2025,8,1)?200:180;
  return KOCHI_CLASS_RULES.map(r=>r.cls==='C1'?{...r,min:440}:r.cls==='C2'?{...r,max:440}:r.cls==='C3上'?{...r,min:c3floor}:r.cls==='C3下'?{...r,max:c3floor}:r);
}

function getBangumiPrizePeriodStart(refDate) {
  const d=refDate?new Date(refDate):new Date();
  const month=d.getMonth()+1, startYear=getKochiFiscalYear(d)-2;
  return new Date(startYear,month>=4&&month<=8?3:8,1);
}

/**
 * 日付文字列（YYYY/MM/DD 等）を Date に変換
 */
function parseDateStr(s) {
  if(!s) return null;
  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
}

/**
 * 公式成績から番組賞金を計算し格付けクラスを推定する
 *
 * 【重要】PDF 4.(1)(ア) の規定：
 *   番組賞金は「算出対象期間内」に収得した本賞金の合計
 *   → 年度と開催時期から起算日を決め、閲覧当日以降は除外
 *   ※通算累積ではなく「現在サイクルの対象期間内」のみ集計
 *
 * @param {Array} races - parseHorseMarkInfoHtml()のraces配列
 * @param {Date}  [refDate] - 基準日（省略時=今日）で対象期間を決定
 */
function calcHorsePrizeSummary(races, refDate, baseline) {
  if(!races||!races.length) return null;
  const cutoff=refDate?new Date(refDate):new Date(); cutoff.setHours(0,0,0,0);
  const periodStart=getBangumiPrizePeriodStart(cutoff), classRules=getKochiClassRules(cutoff);
  const baselineDate=parseDateStr(baseline?.asOf), baselineEffective=parseDateStr(baseline?.effectiveFrom);
  const useBaseline=Number.isFinite(Number(baseline?.prize))&&baselineDate&&baselineDate>=periodStart&&baselineDate<cutoff&&(!baselineEffective||baselineEffective<=cutoff);
  let totalPrize=useBaseline?Number(baseline.prize):0, countedRaces=0, skippedRaces=0, missingPrizeRaces=0, unresolvedJraRaces=0;
  const prizeDetails=[];

  races.forEach(r=>{
    const raceD=parseDateStr(r.raceDate), c=parseInt(r.chakujun)||999;
    if(!raceD||raceD<periodStart){skippedRaces++;return;}
    if(raceD>=cutoff||(useBaseline&&(baselineEffective?raceD<baselineEffective:raceD<=baselineDate))) return;
    const raw=Number.parseFloat(r.prize);
    if(!(raw>0)){if(c>=1&&c<=5)missingPrizeRaces++;return;}
    const course=String(r.course||'高知').replace(/[Ａ-Ｚａ-ｚ０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0));
    const isJRA=/^J[^\d]/.test(course.replace(/\s/g,''));
    const hasExtra=Number.isFinite(Number.parseFloat(r.additionalPrize)), extra=isJRA&&hasExtra?Number.parseFloat(r.additionalPrize):0;
    if(isJRA&&!hasExtra) unresolvedJraRaces++;
    const mainPrize=Math.max(0,raw-extra), rate=getConversionRate(course,[r.raceClass||'',r.raceName||''].join(' '));
    const prize=Math.floor(mainPrize*rate*10+1e-8)/10;
    if(prize<=0)return;
    totalPrize+=prize; countedRaces++;
    prizeDetails.push({date:r.raceDate,course:r.course||'高知',chakujun:c,prize,raceClass:r.raceClass||'',raceName:r.raceName||'',rawPrize:mainPrize,rate});
  });
  totalPrize=Math.round(totalPrize*10)/10;
  const estimatedClass=classRules.find(r=>totalPrize>r.min)||classRules[classRules.length-1];
  return {totalPrize,estimatedClass,prizeDetails,countedRaces,skippedRaces,missingPrizeRaces,unresolvedJraRaces,periodStart,classRules,fiscalYear:getKochiFiscalYear(cutoff),baseline:useBaseline?baseline:null,isComplete:missingPrizeRaces===0&&unresolvedJraRaces===0};
}

/** 令和8年度の9月起算日変更後について、確定済み賞金だけで降級を試算する。 */
function calcNextBangumiCycleProjection(races, refDate, currentSummary) {
  const d = refDate ? new Date(refDate) : new Date();
  const month = d.getMonth() + 1;
  // 公開済みの令和8年度要領で確定している4〜8月→9月の切替だけを予測する。
  if(d.getFullYear() !== 2026 || month < 4 || month > 8) return null;
  const current = currentSummary || calcHorsePrizeSummary(races, d);
  if(!current) return null;
  const nextCycleStart = new Date(2026, 8, 1);
  const nextPeriodStart = getBangumiPrizePeriodStart(nextCycleStart);
  // 現在級は公式基準額を優先しているため、次回だけ全履歴から再構成すると計算方式が混ざる。
  // 現在額から、新しい起算日（2024/09/01）より前の対象賞金だけを差し引いて持越額を出す。
  const droppedRaces = (Array.isArray(races) ? races : []).filter(r=>{
    const rd=parseDateStr(r.raceDate);
    return rd&&rd>=current.periodStart&&rd<nextPeriodStart;
  });
  const droppedSummary = droppedRaces.length
    ? calcHorsePrizeSummary(droppedRaces, new Date(2026, 7, 31))
    : {totalPrize:0,missingPrizeRaces:0,unresolvedJraRaces:0,isComplete:true};
  const droppedPrize = Math.round(Number(droppedSummary?.totalPrize||0)*10)/10;
  const nextTotal = Math.round(Math.max(0,current.totalPrize-droppedPrize)*10)/10;
  const nextRules = getKochiClassRules(nextCycleStart);
  const nextClass = nextRules.find(r=>nextTotal>r.min)||nextRules[nextRules.length-1];
  const nextSummary = {
    totalPrize:nextTotal, estimatedClass:nextClass, classRules:nextRules,
    periodStart:nextPeriodStart, fiscalYear:getKochiFiscalYear(nextCycleStart),
    missingPrizeRaces:Number(droppedSummary?.missingPrizeRaces||0),
    unresolvedJraRaces:Number(droppedSummary?.unresolvedJraRaces||0),
    isComplete:!!current.isComplete&&!!droppedSummary?.isComplete,
  };
  const currentIdx = current.classRules.findIndex(r=>r.cls===current.estimatedClass.cls);
  const projectedIdx = nextSummary.classRules.findIndex(r=>r.cls===nextSummary.estimatedClass.cls);
  const isDemotion = projectedIdx > currentIdx;
  const isLowestClass = currentIdx === current.classRules.length - 1;
  const tenth = n => Math.round(Math.max(0,n) * 10) / 10;
  return {
    nextCycleStart,
    currentClass: current.estimatedClass,
    projectedClass: nextSummary.estimatedClass,
    nextSummary,
    isDemotion,
    isLowestClass,
    isComplete:nextSummary.isComplete,
    droppedPrize: tenth(droppedPrize),
    retentionNeeded: isDemotion ? tenth(current.estimatedClass.min - nextSummary.totalPrize + 0.1) : 0,
    retentionMargin: !isDemotion && !isLowestClass ? tenth(nextSummary.totalPrize - current.estimatedClass.min) : 0,
  };
}

// ============================================================
// ★ 馬場差・基準時計パネル
// ============================================================

/** 斤量補正定数 */
const KINRYO_STD = 55;  // 基準斤量(kg) — 全比較の基準
const KINRYO_FACTOR = { 1300: 0.10, 1400: 0.12, 1600: 0.15 };  // 1kgあたり補正秒数

/**
 * 斤量補正値を返す（基準斤量との差 × 距離係数）
 * 戻り値: 補正秒数（正=重い斤量で遅くなった分, 負=軽い斤量で有利だった分）
 */
function calcWeightAdj(kinryo, distNum) {
  const kn = parseFloat(kinryo);
  if (!kn || !distNum) return 0;
  const factor = KINRYO_FACTOR[distNum] || 0;
  return (kn - KINRYO_STD) * factor;
}

const PACE_ADJ_FACTOR = 0.5;  // 前半3F偏差1秒 → 実効タイム0.5秒補正

/**
 * ペース補正値を返す（その馬の前半3F - レース内平均前半3F）× 係数
 * 正 = 前半ゆっくり（スロー展開の恩恵）→ 実効タイムを遅く補正
 * 負 = 前半速く（ハイペース消耗）→ 実効タイムを速く補正（ボーナス）
 */
function calcPaceAdj(horseF3, raceAvgF3) {
  const h = parseFloat(horseF3);
  const r = parseFloat(raceAvgF3);
  // 前3Fは20〜60秒の範囲が正常。範囲外は異常値（フォーマット不正等）として無視
  if (!isFinite(h) || !isFinite(r) || h < 20 || h > 60 || r < 20 || r > 60) return 0;
  return (h - r) * PACE_ADJ_FACTOR;
}

/**
 * 高知競馬 距離×クラス 基準時計テーブル（良馬場、秒換算）
 * 形式: STANDARD_TIMES[dist][cls] = 秒数
 */
const STANDARD_TIMES = {
  1300: {
    A:  timeToSec('1.24.9'),
    B:  timeToSec('1.25.4'),
    C1: timeToSec('1.25.8'),
    C2: timeToSec('1.26.7'),
    C3: timeToSec('1.27.4'),
  },
  1400: {
    A:  timeToSec('1.32.0'),
    B:  timeToSec('1.32.7'),
    C1: timeToSec('1.33.2'),
    C2: timeToSec('1.34.1'),
    C3: timeToSec('1.34.7'),
  },
  1600: {
    A:  timeToSec('1.47.4'),
    B:  timeToSec('1.48.6'),
    C1: timeToSec('1.49.1'),  // 修正: 旧1.48.3はBより速く逆転していた
    C2: timeToSec('1.49.7'),
    C3: timeToSec('1.50.3'),  // 修正: 旧1.49.2はC2より速く逆転していた
  },
};

/**
 * 条件別基準時計テーブル（距離×クラス×馬場状態、秒換算）
 * 形式: COND_STANDARDS[dist][cls][cond] = 秒数
 * 出典: 修正版_距離クラス馬場別_1-5着合算平均時計.xlsx（1〜5着合算平均）
 */
const COND_STANDARDS = {
  800: {
    C3: { '良': 50.7, '稍重': 50.5, '重': 51.0, '不良': 49.7 },
  },
  1300: {
    A:  { '良': 84.9, '稍重': 84.5, '重': 84.5, '不良': 83.2 },
    B:  { '良': 85.4, '稍重': 85.0, '重': 85.3, '不良': 83.7 },
    C1: { '良': 85.8, '稍重': 85.3, '重': 85.1, '不良': 83.9 },
    C2: { '良': 86.7, '稍重': 86.4, '重': 85.9, '不良': 84.8 },
    C3: { '良': 87.4, '稍重': 87.3, '重': 86.8, '不良': 85.3 },
  },
  1400: {
    A:  { '良': 92.0, '稍重': 92.3, '重': 91.6, '不良': 90.2 },
    B:  { '良': 92.7, '稍重': 92.7, '重': 92.1, '不良': 90.7 },
    C1: { '良': 93.2, '稍重': 92.8, '重': 92.5, '不良': 91.0 },
    C2: { '良': 94.1, '稍重': 93.7, '重': 93.4, '不良': 91.9 },
    C3: { '良': 94.7, '稍重': 94.0, '重': 93.8, '不良': 92.5 },
  },
  1600: {
    A:  { '良': 107.4, '稍重': 107.6, '重': 106.1, '不良': 105.1 },
    B:  { '良': 108.6, '稍重': 108.1, '重': 107.7, '不良': 106.0 },
    C1: { '良': 109.1, '稍重': 108.7, '重': 108.0, '不良': 106.4 },  // 修正: 良・重・不良でBより速い逆転を解消
    C2: { '良': 109.7, '稍重': 109.7, '重': 108.2, '不良': 106.5 },
    C3: { '良': 110.3, '稍重': 110.1, '重': 108.4, '不良': 107.1 },  // 修正: 良・稍重でC2より速い逆転を解消
  },
  1800: {
    B:  { '稍重': 121.3, '重': 123.3, '不良': 119.4 },
    C3: { '良': 123.0, '稍重': 122.8, '重': 121.9, '不良': 119.9 },
  },
  1900: {
    B:  { '良': 131.2, '稍重': 130.5, '不良': 126.0 },
    C3: { '良': 128.2, '稍重': 130.9, '重': 127.6, '不良': 127.1 },
  },
  2400: {
    C3: { '良': 169.7, '稍重': 168.4, '重': 164.5, '不良': 161.2 },
  },
};

/**
 * 前半3F基準タイム（秒）：距離×クラス×馬場状態
 * 出典: 2023〜2026年 高知競馬ラップ表 Excel（n≥3レース中央値）
 * '*' = 馬場状態不問フォールバック値
 */
const STANDARD_F3 = {
  1300: {
    C3:   { '良': 39.2, '稍重': 38.7, '重': 38.7, '不良': 38.1, '*': 38.7 },
    C2:   { '良': 38.5, '稍重': 38.8,              '不良': 38.5, '*': 38.5 },
    C1:   { '良': 38.4, '稍重': 37.8, '重': 38.7, '不良': 37.0, '*': 38.1 },
    B:    { '良': 38.2, '稍重': 38.6,              '不良': 37.3, '*': 38.2 },
    '3歳':{ '良': 39.6, '稍重': 39.9, '重': 39.2, '不良': 38.5, '*': 39.4 },
  },
  1400: {
    C3:   { '良': 39.7, '稍重': 39.4, '重': 38.9, '不良': 38.7, '*': 39.2 },
    C2:   { '良': 39.5, '稍重': 39.3, '重': 38.9, '不良': 38.2, '*': 39.1 },
    C1:   { '良': 39.0, '稍重': 38.8, '重': 38.8, '不良': 38.3, '*': 38.8 },
    B:    { '良': 38.9, '稍重': 38.8,              '不良': 38.1, '*': 38.8 },
    A:    { '良': 39.1, '稍重': 38.6, '重': 38.5, '不良': 38.3, '*': 38.6 },
    '3歳':{ '良': 40.6, '稍重': 39.6, '重': 39.5, '不良': 38.9, '*': 39.6 },
  },
  1600: {
    C3:   { '良': 40.3, '稍重': 40.4, '重': 40.2, '不良': 38.7, '*': 40.3 },
    C2:   { '良': 40.3, '稍重': 39.3, '重': 39.5, '不良': 38.4, '*': 39.4 },
    C1:   { '良': 40.3, '稍重': 39.5, '重': 38.8, '不良': 39.2, '*': 39.5 },
    B:    { '良': 40.7, '稍重': 39.8,              '不良': 39.1, '*': 39.8 },
    A:    { '良': 39.8,               '重': 39.1, '不良': 38.7, '*': 39.1 },
  },
};

/** 前半3F基準値を取得（条件→フォールバック→null） */
function getStandardF3(dist, cls, cond) {
  const d = STANDARD_F3[dist];
  if (!d) return null;
  const c = d[cls];
  if (!c) return null;
  if (cond && c[cond] != null) return c[cond];
  return c['*'] ?? null;
}

/** 前半3F偏差1秒 → 馬場差補正量（秒）*/
const PACE_BIAS_CORR_FACTOR = 0.5;

/** 調教師別成績データ（高知競馬 2016-2026 実績） */
const TRAINER_STATS = {
  '打越勇児':{wr:25.32,pr:54.57},'田中守':{wr:20.07,pr:46.17},'倉兼育康':{wr:16.23,pr:44.67},
  '雑賀正光':{wr:15.30,pr:41.10},'工藤真司':{wr:13.98,pr:38.69},'西川敏弘':{wr:12.82,pr:35.92},
  '目迫大輔':{wr:11.49,pr:34.35},'中西達也':{wr:10.92,pr:34.23},'宮川真衣':{wr:11.66,pr:33.42},
  '炭田健二':{wr:10.17,pr:30.81},'宮路洋一':{wr:9.33,pr:30.44},'松木啓助':{wr:9.24,pr:30.33},
  '別府真司':{wr:8.79,pr:28.72},'田中譲二':{wr:7.79,pr:26.68},'嬉勝則':{wr:7.81,pr:26.56},
  '川野勇馬':{wr:6.10,pr:25.83},'大関吉明':{wr:6.99,pr:25.60},'東原己俊':{wr:7.18,pr:25.31},
  '那俄性哲':{wr:6.71,pr:24.40},'宮川浩一':{wr:6.96,pr:23.55},'國澤輝幸':{wr:6.00,pr:23.43},
  '西山裕貴':{wr:5.31,pr:21.92},'細川忠義':{wr:6.08,pr:21.20},'胡本友晴':{wr:5.05,pr:20.00},
  '田中伸一':{wr:4.23,pr:17.02},'平和人':{wr:4.04,pr:16.18},'宗石大':{wr:1.56,pr:9.34},
  '雑賀秀介':{wr:0.38,pr:4.44}
};
function lookupTrainerStats(name) {
  if (!name) return null;
  const t = name.trim();
  if (TRAINER_STATS[t]) return TRAINER_STATS[t];
  const k = Object.keys(TRAINER_STATS).find(k => k.slice(0,3) === t.slice(0,3));
  return k ? TRAINER_STATS[k] : null;
}

/** 枠番別勝率データ（高知競馬 実績・距離×馬場状態×枠番） */
const DRAW_STATS = {
  800:{
    '不良':{1:9.76,2:18.29,3:17.28,4:12.05,5:6.45,6:8.05,7:9.89,8:15.96},
    '稍重':{1:26.32,2:10.81,3:7.89,4:13.51,5:10.26,6:13.89,7:13.16,8:4.65},
    '良':{1:11.32,2:9.26,3:11.54,4:11.11,5:10.34,6:9.43,7:15.62,8:15.15},
    '重':{1:19.23,2:0,3:0,4:0,5:0,6:0,7:0,8:0}
  },
  1300:{
    '不良':{1:8.94,2:9.97,3:9.61,4:9.90,5:9.26,6:8.42,7:10.52,8:11.00},
    '稍重':{1:8.85,2:10.23,3:8.26,4:9.66,5:8.50,6:9.46,7:10.74,8:11.48},
    '良':{1:10.01,2:12.23,3:10.59,4:8.56,5:8.67,6:9.54,7:10.10,8:10.20},
    '重':{1:8.20,2:7.64,3:10.29,4:8.20,5:8.95,6:9.91,7:11.19,8:11.39}
  },
  1400:{
    '不良':{1:8.67,2:9.53,3:9.54,4:9.08,5:8.96,6:10.35,7:10.13,8:11.28},
    '稍重':{1:9.37,2:10.81,3:11.68,4:9.72,5:8.83,6:9.66,7:9.38,8:10.62},
    '良':{1:8.97,2:8.78,3:11.86,4:10.09,5:10.34,6:8.66,7:10.11,8:10.91},
    '重':{1:7.71,2:8.54,3:9.93,4:10.45,5:10.12,6:9.08,7:10.20,8:11.78}
  },
  1600:{
    '不良':{1:11.84,2:11.30,3:13.70,4:8.11,5:10.79,6:13.01,7:8.41,8:11.28},
    '稍重':{1:11.91,2:12.59,3:12.23,4:13.17,5:13.72,6:8.16,7:8.59,8:11.00},
    '良':{1:13.83,2:14.68,3:13.51,4:10.00,5:13.89,6:6.56,7:9.44,8:9.18},
    '重':{1:12.86,2:11.19,3:9.71,4:12.41,5:9.65,6:10.48,7:10.73,8:10.45}
  },
  1900:{
    '不良':{5:6.06,6:10.53,7:7.32,8:9.30},
    '重':{5:16.13,6:6.25,7:12.12,8:5.88}
  }
};

/** 騎手別成績データ（高知競馬 2016-2026 実績） */
const JOCKEY_STATS = {"吉村智洋":{"all":{"wr":10.3,"pr":41.4,"n":29},"dist":{"1400":{"wr":18.2,"pr":36.4,"n":11},"1300":{"wr":0,"pr":40,"n":15}},"cond":{"不良":{"wr":0,"pr":0,"n":5},"重":{"wr":11.8,"pr":41.2,"n":17},"良":{"wr":0,"pr":57.1,"n":7}},"recent":{"wr":14.3,"pr":42.9,"n":14}},"松井伸也":{"all":{"wr":5.6,"pr":22.7,"n":321},"dist":{"1300":{"wr":7.1,"pr":22,"n":127},"1400":{"wr":4.4,"pr":23.3,"n":159},"1600":{"wr":5.7,"pr":22.9,"n":35}},"cond":{"不良":{"wr":0,"pr":29.3,"n":41},"重":{"wr":8.9,"pr":24.1,"n":79},"良":{"wr":4.9,"pr":23.8,"n":122},"稍重":{"wr":5.1,"pr":16.5,"n":79}},"recent":{"wr":5.8,"pr":21.5,"n":260}},"郷間勇太":{"all":{"wr":8.7,"pr":27.1,"n":5519},"dist":{"1300":{"wr":8.5,"pr":26.7,"n":2370},"1400":{"wr":9,"pr":27.2,"n":2461},"1600":{"wr":8.6,"pr":27.9,"n":688}},"cond":{"不良":{"wr":8.1,"pr":26.2,"n":1765},"重":{"wr":8.7,"pr":25.9,"n":1932},"良":{"wr":8.4,"pr":29.9,"n":864},"稍重":{"wr":10.1,"pr":28.6,"n":958}},"recent":{"wr":7.6,"pr":27.1,"n":1329}},"木村直輝":{"all":{"wr":4.2,"pr":16.8,"n":4371},"dist":{"1300":{"wr":4.6,"pr":17.6,"n":1971},"1400":{"wr":3.8,"pr":15.6,"n":1975},"1600":{"wr":4,"pr":18.4,"n":425}},"cond":{"不良":{"wr":3.8,"pr":16.9,"n":1483},"重":{"wr":4.9,"pr":16.9,"n":1339},"良":{"wr":3.3,"pr":17,"n":723},"稍重":{"wr":4.5,"pr":16.2,"n":826}},"recent":{"wr":3.6,"pr":15.7,"n":1179}},"林謙佑":{"all":{"wr":8.8,"pr":30.2,"n":5995},"dist":{"1300":{"wr":8.4,"pr":27.8,"n":2615},"1400":{"wr":9.4,"pr":32.3,"n":2640},"1600":{"wr":8.1,"pr":30.9,"n":740}},"cond":{"不良":{"wr":9.4,"pr":30.6,"n":1935},"重":{"wr":7.9,"pr":29.1,"n":2014},"良":{"wr":9.6,"pr":30.6,"n":1020},"稍重":{"wr":8.5,"pr":31.1,"n":1026}},"recent":{"wr":8.1,"pr":29.4,"n":1162}},"赤岡修次":{"all":{"wr":30.7,"pr":61.9,"n":5272},"dist":{"1300":{"wr":31.9,"pr":65,"n":2147},"1400":{"wr":29.7,"pr":60.5,"n":2356},"1600":{"wr":30.4,"pr":57.6,"n":769}},"cond":{"不良":{"wr":31.2,"pr":63.8,"n":1759},"重":{"wr":31.6,"pr":62.9,"n":1846},"良":{"wr":28.7,"pr":58.1,"n":728},"稍重":{"wr":29.5,"pr":59.1,"n":939}},"recent":{"wr":29.4,"pr":61.3,"n":954}},"仲原大生":{"all":{"wr":5.7,"pr":27.6,"n":123},"dist":{"1300":{"wr":7.1,"pr":28.6,"n":56},"1400":{"wr":4.1,"pr":26.5,"n":49},"1600":{"wr":0,"pr":27.8,"n":18}},"cond":{"不良":{"wr":0,"pr":26.7,"n":60},"重":{"wr":9.5,"pr":47.6,"n":21},"良":{"wr":37.5,"pr":37.5,"n":8},"稍重":{"wr":0,"pr":14.7,"n":34}},"recent":{"wr":5.8,"pr":28.1,"n":121}},"永森大智":{"all":{"wr":22.2,"pr":52.4,"n":6617},"dist":{"1300":{"wr":22.8,"pr":55.3,"n":2772},"1400":{"wr":21.4,"pr":49.9,"n":2908},"1600":{"wr":22.7,"pr":51.8,"n":937}},"cond":{"不良":{"wr":21.2,"pr":51.5,"n":2091},"重":{"wr":23.3,"pr":54.7,"n":2316},"良":{"wr":21.7,"pr":50.9,"n":1074},"稍重":{"wr":22,"pr":50.9,"n":1136}},"recent":{"wr":20.1,"pr":48.8,"n":1485}},"倉兼育康":{"all":{"wr":12.2,"pr":37.7,"n":4403},"dist":{"1300":{"wr":12.3,"pr":39.3,"n":1971},"1400":{"wr":11.5,"pr":35.2,"n":1938},"1600":{"wr":14.2,"pr":41.1,"n":494}},"cond":{"不良":{"wr":13.1,"pr":37.2,"n":1499},"重":{"wr":12.4,"pr":38.8,"n":1700},"良":{"wr":11.4,"pr":36.8,"n":562},"稍重":{"wr":10.1,"pr":36.6,"n":642}}},"山崎雅由":{"all":{"wr":7.4,"pr":26.8,"n":4952},"dist":{"1300":{"wr":8.4,"pr":27.2,"n":2213},"1400":{"wr":5.9,"pr":25.1,"n":2144},"1600":{"wr":9.4,"pr":31.8,"n":595}},"cond":{"不良":{"wr":7.6,"pr":27,"n":1566},"重":{"wr":7.1,"pr":26.2,"n":1620},"良":{"wr":8.1,"pr":27,"n":847},"稍重":{"wr":7.1,"pr":27.5,"n":919}},"recent":{"wr":8.1,"pr":29.8,"n":1522}},"中島龍也":{"all":{"wr":4,"pr":24.9,"n":503},"dist":{"1300":{"wr":4.9,"pr":28,"n":164},"1400":{"wr":3.5,"pr":19.7,"n":254},"1600":{"wr":3.5,"pr":34.1,"n":85}},"cond":{"不良":{"wr":3.5,"pr":29.6,"n":115},"重":{"wr":5.8,"pr":26.5,"n":155},"良":{"wr":2.4,"pr":19.5,"n":123},"稍重":{"wr":3.6,"pr":23.6,"n":110}},"recent":{"wr":5,"pr":24,"n":300}},"岩本怜":{"all":{"wr":4,"pr":12,"n":75},"dist":{"1300":{"wr":0,"pr":17.9,"n":28},"1400":{"wr":0,"pr":8.6,"n":35},"1600":{"wr":0,"pr":0,"n":12}},"cond":{"重":{"wr":0,"pr":10.5,"n":19},"良":{"wr":0,"pr":11.1,"n":18},"稍重":{"wr":5.6,"pr":13.9,"n":36}},"recent":{"wr":4.1,"pr":12.3,"n":73}},"葛山晃平":{"all":{"wr":2.6,"pr":23.4,"n":231},"dist":{"1300":{"wr":0,"pr":25.9,"n":81},"1400":{"wr":4.4,"pr":21.9,"n":114},"1600":{"wr":0,"pr":22.2,"n":36}},"cond":{"不良":{"wr":0,"pr":15.2,"n":46},"重":{"wr":2.5,"pr":22.8,"n":79},"良":{"wr":0,"pr":17.2,"n":29},"稍重":{"wr":2.6,"pr":31.2,"n":77}},"recent":{"wr":0,"pr":4.1,"n":49}},"近藤翔月":{"all":{"wr":8.6,"pr":23.7,"n":735},"dist":{"1300":{"wr":8,"pr":22.3,"n":274},"1400":{"wr":8,"pr":21.2,"n":312},"1600":{"wr":10.7,"pr":31.5,"n":149}},"cond":{"不良":{"wr":7.2,"pr":23.9,"n":180},"重":{"wr":7.7,"pr":21.9,"n":169},"良":{"wr":8.3,"pr":25.9,"n":205},"稍重":{"wr":11,"pr":22.7,"n":181}},"recent":{"wr":8.6,"pr":23.7,"n":735}},"上田将司":{"all":{"wr":6.8,"pr":26.5,"n":5077},"dist":{"1300":{"wr":6.4,"pr":25.9,"n":2394},"1400":{"wr":7.4,"pr":27.2,"n":2111},"1600":{"wr":5.9,"pr":26.6,"n":572}},"cond":{"不良":{"wr":6.4,"pr":25.7,"n":1635},"重":{"wr":6.4,"pr":26.3,"n":1918},"良":{"wr":7.8,"pr":29.3,"n":735},"稍重":{"wr":7.6,"pr":26,"n":789}},"recent":{"wr":6.7,"pr":25.8,"n":507}},"松本大輝":{"all":{"wr":14.3,"pr":35.7,"n":28},"dist":{"1400":{"wr":14.3,"pr":42.9,"n":21},"1300":{"wr":0,"pr":0,"n":5}},"cond":{"重":{"wr":0,"pr":41.7,"n":12},"稍重":{"wr":20,"pr":30,"n":10}},"recent":{"wr":9.1,"pr":36.4,"n":22}},"大澤誠志":{"all":{"wr":2.1,"pr":10.4,"n":4082},"dist":{"1300":{"wr":1.9,"pr":10.5,"n":2055},"1400":{"wr":2.3,"pr":10.2,"n":1669},"1600":{"wr":2.5,"pr":10.9,"n":358}},"cond":{"不良":{"wr":2.4,"pr":10.4,"n":1294},"重":{"wr":2.1,"pr":10.7,"n":1398},"良":{"wr":1,"pr":8.7,"n":667},"稍重":{"wr":2.6,"pr":11.5,"n":723}},"recent":{"wr":1.5,"pr":9.1,"n":957}},"沢田龍哉":{"all":{"wr":0,"pr":26.3,"n":19},"dist":{"1400":{"wr":0,"pr":41.7,"n":12},"1300":{"wr":0,"pr":0,"n":6}},"cond":{"良":{"wr":0,"pr":33.3,"n":12},"稍重":{"wr":0,"pr":0,"n":7}},"recent":{"wr":0,"pr":26.3,"n":19}},"塚本征吾":{"all":{"wr":8.3,"pr":30.6,"n":36},"dist":{"1400":{"wr":0,"pr":27.8,"n":18},"1300":{"wr":13.3,"pr":40,"n":15}},"cond":{"不良":{"wr":0,"pr":30,"n":10},"重":{"wr":0,"pr":16.7,"n":12},"良":{"wr":0,"pr":36.4,"n":11}},"recent":{"wr":8.6,"pr":31.4,"n":35}},"宮川実":{"all":{"wr":23.3,"pr":52.6,"n":5136},"dist":{"1300":{"wr":25,"pr":54.5,"n":2062},"1400":{"wr":21.8,"pr":51.5,"n":2339},"1600":{"wr":23,"pr":50.7,"n":735}},"cond":{"不良":{"wr":23.8,"pr":52.9,"n":1695},"重":{"wr":22.3,"pr":52,"n":1810},"良":{"wr":23,"pr":50.9,"n":812},"稍重":{"wr":24.7,"pr":54.9,"n":819}},"recent":{"wr":28,"pr":57.3,"n":810}},"佐原秀泰":{"all":{"wr":9.6,"pr":31.6,"n":5598},"dist":{"1300":{"wr":9.5,"pr":32.2,"n":2421},"1400":{"wr":9.8,"pr":30.8,"n":2460},"1600":{"wr":9.3,"pr":32.2,"n":717}},"cond":{"不良":{"wr":9.6,"pr":32.4,"n":1792},"重":{"wr":9.1,"pr":30.2,"n":2069},"良":{"wr":10.8,"pr":34.3,"n":784},"稍重":{"wr":10,"pr":31.1,"n":953}},"recent":{"wr":11.8,"pr":33.8,"n":876}},"岡遼太郎":{"all":{"wr":8.9,"pr":29.4,"n":2888},"dist":{"1300":{"wr":9.6,"pr":29.8,"n":1100},"1400":{"wr":8.5,"pr":29.5,"n":1404},"1600":{"wr":7.8,"pr":28.1,"n":384}},"cond":{"不良":{"wr":7.9,"pr":28.7,"n":895},"重":{"wr":8.4,"pr":26.4,"n":812},"良":{"wr":9.9,"pr":29.7,"n":535},"稍重":{"wr":9.9,"pr":34.1,"n":646}},"recent":{"wr":10.4,"pr":33,"n":1371}},"村上弘樹":{"all":{"wr":13,"pr":37.7,"n":154},"dist":{"1300":{"wr":11.9,"pr":35.8,"n":67},"1400":{"wr":14.9,"pr":38.8,"n":67},"1600":{"wr":10,"pr":40,"n":20}},"cond":{"不良":{"wr":9.4,"pr":35.9,"n":64},"重":{"wr":16.4,"pr":38.2,"n":55},"稍重":{"wr":14.3,"pr":40,"n":35}}},"西森将司":{"all":{"wr":2.8,"pr":15.4,"n":4687},"dist":{"1300":{"wr":2.5,"pr":15.4,"n":2358},"1400":{"wr":3.1,"pr":14.7,"n":1927},"1600":{"wr":3,"pr":18.7,"n":402}},"cond":{"不良":{"wr":3,"pr":15,"n":1478},"重":{"wr":2.8,"pr":16.4,"n":1743},"良":{"wr":2.2,"pr":13.7,"n":678},"稍重":{"wr":2.8,"pr":15.5,"n":788}},"recent":{"wr":1.9,"pr":14.5,"n":782}},"石本純也":{"all":{"wr":3.5,"pr":14.2,"n":3859},"dist":{"1300":{"wr":3.7,"pr":14.3,"n":2101},"1400":{"wr":3.3,"pr":13.7,"n":1490},"1600":{"wr":2.6,"pr":16,"n":268}},"cond":{"不良":{"wr":2.8,"pr":12.8,"n":1245},"重":{"wr":3.9,"pr":15.7,"n":1348},"良":{"wr":4,"pr":14.6,"n":603},"稍重":{"wr":3.5,"pr":13.4,"n":663}},"recent":{"wr":2.1,"pr":8.4,"n":681}},"妹尾浩一":{"all":{"wr":8,"pr":25.9,"n":4524},"dist":{"1300":{"wr":8.2,"pr":26.4,"n":2074},"1400":{"wr":7.8,"pr":24.9,"n":1931},"1600":{"wr":8.3,"pr":27.6,"n":519}},"cond":{"不良":{"wr":8.9,"pr":26.9,"n":1436},"重":{"wr":7.3,"pr":24.9,"n":1623},"良":{"wr":8.2,"pr":26.1,"n":674},"稍重":{"wr":7.7,"pr":25.9,"n":791}},"recent":{"wr":9.4,"pr":28.3,"n":1152}},"塚本直之":{"all":{"wr":0,"pr":7.3,"n":41},"dist":{"1300":{"wr":0,"pr":0,"n":13},"1400":{"wr":0,"pr":10,"n":20},"1600":{"wr":0,"pr":0,"n":8}},"cond":{"不良":{"wr":0,"pr":0,"n":17},"重":{"wr":0,"pr":0,"n":13},"稍重":{"wr":0,"pr":0,"n":11}},"recent":{"wr":0,"pr":7.3,"n":41}},"飛田愛斗":{"all":{"wr":0,"pr":30,"n":10},"dist":{"1400":{"wr":0,"pr":40,"n":5}},"cond":{"不良":{"wr":0,"pr":30,"n":10}},"recent":{"wr":0,"pr":0,"n":8}},"及川烈":{"all":{"wr":0,"pr":0,"n":28},"dist":{"1300":{"wr":0,"pr":0,"n":13},"1400":{"wr":0,"pr":0,"n":10},"1600":{"wr":0,"pr":0,"n":5}},"cond":{"良":{"wr":0,"pr":0,"n":16},"不良":{"wr":0,"pr":0,"n":10}},"recent":{"wr":0,"pr":0,"n":28}},"加藤翔馬":{"all":{"wr":8.2,"pr":26.1,"n":402},"dist":{"1300":{"wr":8.8,"pr":26.4,"n":159},"1400":{"wr":9.4,"pr":29.3,"n":191},"1600":{"wr":0,"pr":13.5,"n":52}},"cond":{"不良":{"wr":12.8,"pr":24.4,"n":78},"重":{"wr":5.8,"pr":22.1,"n":104},"良":{"wr":9.3,"pr":31.1,"n":151},"稍重":{"wr":4.3,"pr":23.2,"n":69}},"recent":{"wr":8.2,"pr":26,"n":400}},"阿部基嗣":{"all":{"wr":2.6,"pr":13.3,"n":1566},"dist":{"1300":{"wr":2.3,"pr":14.3,"n":607},"1400":{"wr":3.2,"pr":13.3,"n":750},"1600":{"wr":1,"pr":10,"n":209}},"cond":{"不良":{"wr":1.9,"pr":11.9,"n":469},"重":{"wr":2.9,"pr":14.3,"n":349},"良":{"wr":3.8,"pr":12.5,"n":368},"稍重":{"wr":1.8,"pr":14.7,"n":380}},"recent":{"wr":2.6,"pr":13.9,"n":1285}},"浜尚美":{"all":{"wr":5,"pr":18.1,"n":1087},"dist":{"1300":{"wr":6,"pr":19.5,"n":435},"1400":{"wr":4.4,"pr":17.6,"n":551},"1600":{"wr":4,"pr":14.9,"n":101}},"cond":{"不良":{"wr":3.7,"pr":16.6,"n":301},"重":{"wr":6.2,"pr":16.9,"n":307},"良":{"wr":7.1,"pr":21.3,"n":253},"稍重":{"wr":2.7,"pr":18.1,"n":226}},"recent":{"wr":6.9,"pr":22.4,"n":491}},"中島良美":{"all":{"wr":0,"pr":3.6,"n":56},"dist":{"1300":{"wr":0,"pr":6.9,"n":29},"1400":{"wr":0,"pr":0,"n":22},"1600":{"wr":0,"pr":0,"n":5}},"cond":{"不良":{"wr":0,"pr":0,"n":19},"重":{"wr":0,"pr":0,"n":11},"良":{"wr":0,"pr":0,"n":12},"稍重":{"wr":0,"pr":0,"n":14}},"recent":{"wr":0,"pr":3.8,"n":53}},"塚本雄大":{"all":{"wr":6.8,"pr":23.4,"n":4299},"dist":{"1300":{"wr":7.2,"pr":22.4,"n":2210},"1400":{"wr":6.8,"pr":24.6,"n":1747},"1600":{"wr":5,"pr":24.6,"n":342}},"cond":{"不良":{"wr":7.8,"pr":24.9,"n":1416},"重":{"wr":6.4,"pr":22.1,"n":1689},"良":{"wr":5,"pr":22.8,"n":501},"稍重":{"wr":7.4,"pr":24.2,"n":693}},"recent":{"wr":8.6,"pr":31.8,"n":151}},"田口貫太":{"all":{"wr":0,"pr":30,"n":10},"dist":{"1400":{"wr":0,"pr":33.3,"n":9}},"cond":{"重":{"wr":0,"pr":0,"n":5}},"recent":{"wr":0,"pr":28.6,"n":7}},"岡村卓弥":{"all":{"wr":9.2,"pr":32.2,"n":7144},"dist":{"1300":{"wr":9.3,"pr":32.2,"n":3151},"1400":{"wr":9.2,"pr":31,"n":3084},"1600":{"wr":8.6,"pr":36,"n":909}},"cond":{"不良":{"wr":7.9,"pr":29.5,"n":2315},"重":{"wr":9.6,"pr":33.1,"n":2448},"良":{"wr":9.5,"pr":33.8,"n":1159},"稍重":{"wr":10.6,"pr":33.6,"n":1222}},"recent":{"wr":9.9,"pr":32.2,"n":1523}},"小杉亮":{"all":{"wr":4.5,"pr":19.1,"n":157},"dist":{"1300":{"wr":4.8,"pr":24.2,"n":62},"1400":{"wr":5.1,"pr":14.1,"n":78},"1600":{"wr":0,"pr":23.5,"n":17}},"cond":{"不良":{"wr":3.8,"pr":23.1,"n":52},"重":{"wr":14.8,"pr":22.2,"n":27},"良":{"wr":0,"pr":15.2,"n":33},"稍重":{"wr":0,"pr":15.6,"n":45}},"recent":{"wr":4.5,"pr":19.1,"n":157}},"嬉勝則":{"all":{"wr":6,"pr":20.6,"n":3281},"dist":{"1300":{"wr":6.2,"pr":21.1,"n":1576},"1400":{"wr":6.1,"pr":20.4,"n":1384},"1600":{"wr":4.7,"pr":19,"n":321}},"cond":{"不良":{"wr":5.9,"pr":19.8,"n":1115},"重":{"wr":6.2,"pr":21,"n":1228},"良":{"wr":6,"pr":21.6,"n":450},"稍重":{"wr":5.5,"pr":20.5,"n":488}},"recent":{"wr":4.8,"pr":25.5,"n":208}},"山田義貴":{"all":{"wr":7.8,"pr":16.9,"n":77},"dist":{"1300":{"wr":0,"pr":16.7,"n":24},"1400":{"wr":9.3,"pr":18.6,"n":43},"1600":{"wr":0,"pr":0,"n":10}},"cond":{"不良":{"wr":13.6,"pr":22.7,"n":22},"重":{"wr":6.2,"pr":15.6,"n":32},"良":{"wr":0,"pr":0,"n":5},"稍重":{"wr":0,"pr":11.1,"n":18}},"recent":{"wr":7.8,"pr":16.9,"n":77}},"下原理":{"all":{"wr":12.7,"pr":45.5,"n":110},"dist":{"1300":{"wr":18.4,"pr":55.3,"n":38},"1400":{"wr":10.5,"pr":43.9,"n":57},"1600":{"wr":0,"pr":26.7,"n":15}},"cond":{"不良":{"wr":7.3,"pr":36.6,"n":41},"重":{"wr":16.1,"pr":51.6,"n":31},"良":{"wr":17.6,"pr":52.9,"n":17},"稍重":{"wr":14.3,"pr":47.6,"n":21}},"recent":{"wr":0,"pr":54.5,"n":11}},"城野慈尚":{"all":{"wr":6.8,"pr":20.8,"n":1298},"dist":{"1300":{"wr":7.6,"pr":22,"n":487},"1400":{"wr":6.8,"pr":21.6,"n":617},"1600":{"wr":4.6,"pr":15.5,"n":194}},"cond":{"不良":{"wr":7.8,"pr":20.8,"n":322},"重":{"wr":6.7,"pr":21.6,"n":282},"良":{"wr":7.4,"pr":22.1,"n":366},"稍重":{"wr":5.2,"pr":18.6,"n":328}},"recent":{"wr":6.8,"pr":20.8,"n":1298}},"畑中信司":{"all":{"wr":9.1,"pr":31.6,"n":2812},"dist":{"1300":{"wr":8.4,"pr":32.1,"n":1034},"1400":{"wr":8.8,"pr":30.9,"n":1338},"1600":{"wr":11.4,"pr":32.3,"n":440}},"cond":{"不良":{"wr":10.8,"pr":32.4,"n":911},"重":{"wr":7.9,"pr":30.6,"n":814},"良":{"wr":8.8,"pr":33.6,"n":456},"稍重":{"wr":8.4,"pr":30.3,"n":631}},"recent":{"wr":9.1,"pr":33.2,"n":1170}},"井上瑛太":{"all":{"wr":10.9,"pr":33.2,"n":2838},"dist":{"1300":{"wr":10.3,"pr":31.7,"n":1035},"1400":{"wr":10.7,"pr":32.8,"n":1395},"1600":{"wr":12.7,"pr":38.5,"n":408}},"cond":{"不良":{"wr":10.7,"pr":31.4,"n":821},"重":{"wr":11,"pr":32.1,"n":783},"良":{"wr":11.6,"pr":37.1,"n":550},"稍重":{"wr":10.2,"pr":33.6,"n":684}},"recent":{"wr":14.8,"pr":42,"n":1421}},"多田羅誠":{"all":{"wr":12.3,"pr":37.8,"n":4230},"dist":{"1300":{"wr":13.1,"pr":39.1,"n":1763},"1400":{"wr":11.5,"pr":36.3,"n":1890},"1600":{"wr":12.3,"pr":38.5,"n":577}},"cond":{"不良":{"wr":12.2,"pr":38,"n":1327},"重":{"wr":11.8,"pr":37.6,"n":1234},"良":{"wr":12.9,"pr":39,"n":792},"稍重":{"wr":12.4,"pr":36.6,"n":877}},"recent":{"wr":13.4,"pr":41.4,"n":1540}},"長尾翼玖":{"all":{"wr":6.2,"pr":21.2,"n":113},"dist":{"1300":{"wr":11.4,"pr":27.3,"n":44},"1400":{"wr":3.3,"pr":18.3,"n":60},"1600":{"wr":0,"pr":0,"n":9}},"cond":{"不良":{"wr":0,"pr":28.6,"n":21},"重":{"wr":12.9,"pr":22.6,"n":31},"良":{"wr":0,"pr":8.3,"n":24},"稍重":{"wr":5.4,"pr":24.3,"n":37}}},"吉原寛人":{"all":{"wr":28.5,"pr":62.1,"n":884},"dist":{"1300":{"wr":29.2,"pr":64.8,"n":233},"1400":{"wr":28.7,"pr":59.8,"n":463},"1600":{"wr":27.1,"pr":64.4,"n":188}},"cond":{"不良":{"wr":27.4,"pr":63.7,"n":179},"重":{"wr":27.7,"pr":59.1,"n":264},"良":{"wr":25.6,"pr":57.6,"n":262},"稍重":{"wr":35.2,"pr":71.5,"n":179}},"recent":{"wr":26.1,"pr":61.1,"n":532}},"岩橋勇二":{"all":{"wr":6.8,"pr":25.4,"n":59},"dist":{"1300":{"wr":9.5,"pr":19,"n":21},"1400":{"wr":7.7,"pr":38.5,"n":26},"1600":{"wr":0,"pr":0,"n":12}},"cond":{"良":{"wr":4.4,"pr":24.4,"n":45},"稍重":{"wr":18.2,"pr":27.3,"n":11}},"recent":{"wr":6.8,"pr":25.4,"n":59}},"高野誠毅":{"all":{"wr":0.9,"pr":9.8,"n":224},"dist":{"1300":{"wr":0,"pr":11.2,"n":80},"1400":{"wr":0,"pr":9,"n":122},"1600":{"wr":0,"pr":9.1,"n":22}},"cond":{"不良":{"wr":2,"pr":9.2,"n":98},"重":{"wr":0,"pr":10,"n":40},"良":{"wr":0,"pr":12.8,"n":39},"稍重":{"wr":0,"pr":8.5,"n":47}},"recent":{"wr":0,"pr":8.2,"n":97}},"所蛍":{"all":{"wr":2.2,"pr":18,"n":139},"dist":{"1300":{"wr":3.2,"pr":15.9,"n":63},"1400":{"wr":0,"pr":16.4,"n":61},"1600":{"wr":0,"pr":33.3,"n":15}},"cond":{"不良":{"wr":0,"pr":17.2,"n":58},"重":{"wr":0,"pr":19.1,"n":47},"稍重":{"wr":5.9,"pr":17.6,"n":34}}}};

/**
 * "M.SS.T" 形式 → 秒数（例: "1.34.1" → 94.1）
 */
function timeToSec(str) {
  if (!str) return null;
  // "1.34.1" → 1分34.1秒 = 94.1秒
  // "1:34.1" 形式にも対応
  const s = String(str).replace(':', '.');
  const parts = s.split('.');
  if (parts.length === 3) {
    // M.SS.T → 分.秒.1/10秒
    return parseInt(parts[0]) * 60 + parseFloat(parts[1] + '.' + parts[2]);
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str) || null;
}

// ── 日数差ヘルパー（d1 > d2、両方 YYYYMMDD or YYYY/MM/DD 文字列） ──
// 【2026-08-04 移設】元は ai-analysis.js にしか無く、同モジュールの遅延ロードを待たない経路
// （renderTrackTrend → getHorseAnchoredBias → _horseBiasDiffs、および 4899/4908行のランキング集計）
// から呼ぶと ReferenceError になっていた。_renderPageWithHistory の try{}catch{} が例外を
// 握り潰すため、馬場ページが「エラーも出ないまま真っ白」になる無言の故障だった。
// app-main.js は必ず先に読まれるのでここを唯一の定義とする（ai-analysis.js 側は削除済み・実装は同一）。
function dateDiffDays(d1str, d2str) {
  if (!d1str || !d2str) return 999;
  const norm = s => String(s).replace(/\//g, '');
  const n1 = norm(d1str), n2 = norm(d2str);
  if (n1.length < 8 || n2.length < 8) return 999;
  const p = s => new Date(s.slice(0,4), parseInt(s.slice(4,6))-1, parseInt(s.slice(6,8))).getTime();
  return Math.round((p(n1) - p(n2)) / 86400000);
}

/**
 * タイム文字列（"1:34.1" or "1.34.1"）→ 秒数
 * 競走成績の時計フォーマット対応
 */
function raceTimeToSec(str) {
  if (!str) return null;
  // "1:34.1" 形式
  const m1 = String(str).match(/^(\d+):(\d+\.\d+)$/);
  if (m1) return parseInt(m1[1]) * 60 + parseFloat(m1[2]);
  // "1.34.1" 形式
  const m2 = String(str).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (m2) return parseInt(m2[1]) * 60 + parseFloat(m2[2] + '.' + m2[3]);
  // そのまま秒数
  const v = parseFloat(str);
  return isNaN(v) ? null : v;
}

/**
 * 秒数 → "+0.0" 形式文字列（符号付き）
 */
function secToDiffStr(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const sign = sec > 0 ? '+' : '';
  return `${sign}${sec.toFixed(1)}`;
}

/**
 * 3歳戦かどうか判定（クラス名から）
 */
function is3yo(raceClass) {
  return /3歳/.test(raceClass || '');
}

/**
 * 2歳戦かどうか判定
 */
function is2yo(raceClass) {
  return /2歳/.test(raceClass || '');
}

/**
 * 実効クラスを取得（3歳→C3、それ以外はそのまま）
 * 基準時計テーブルのキーに合わせる
 */
function getEffectiveClass(raceClass) {
  if (!raceClass) return null;
  if (is3yo(raceClass) || is2yo(raceClass)) return 'C3'; // 3歳・2歳はC3基準
  // 混合戦のマッピング
  if (/AB混合/.test(raceClass)) return 'A';
  if (/C1C2混合/.test(raceClass)) return 'C1';
  if (/C2C3混合/.test(raceClass)) return 'C2';
  // 通常クラス
  if (/^A$/.test(raceClass)) return 'A';
  if (/^B$/.test(raceClass)) return 'B';
  if (/^C1$/.test(raceClass)) return 'C1';
  if (/^C2$/.test(raceClass)) return 'C2';
  if (/^C3$/.test(raceClass)) return 'C3';
  // 含む判定
  if (raceClass.includes('A')) return 'A';
  if (raceClass.includes('C3')) return 'C3';
  if (raceClass.includes('C2')) return 'C2';
  if (raceClass.includes('C1')) return 'C1';
  if (raceClass.includes('B')) return 'B';
  return null;
}

// 転入元クラスを数値ランクに変換（JRA上位は高知NAR基準より大幅に高く設定）
function getTransferOriginRank(raceClass) {
  if (!raceClass) return 3;
  const rc = String(raceClass);
  // JRA 重賞（GI/GII/GIII含む）
  if (/重賞|GI|GII|GIII/.test(rc)) return 9;
  // JRA オープン / 4勝クラス
  if (/オープン|OP|4勝/.test(rc)) return 8;
  // JRA 3勝クラス / 1600万下（高知A上位相当）
  if (/3勝|1600万/.test(rc)) return 7;
  // JRA 2勝クラス / 1000万下（高知A〜B相当）
  if (/2勝|1000万/.test(rc)) return 5.5;
  // JRA 1勝クラス / 500万下（高知B〜C1相当）
  if (/1勝|500万/.test(rc)) return 4;
  // JRA 未勝利（高知C1〜C2相当）
  if (/未勝利/.test(rc)) return 2.5;
  // JRA 新馬（高知C2〜C3相当）
  if (/新馬/.test(rc)) return 1.5;
  // NAR / 高知系クラス（A/B/C1/C2/C3）
  const ec = getEffectiveClass(rc);
  const NAR_RANK = { '重賞': 7, 'OP': 6, 'A': 5, 'B': 4, 'C1': 3, 'C2': 2, 'C3': 1 };
  if (ec && NAR_RANK[ec] != null) return NAR_RANK[ec];
  return 3; // 不明 → ニュートラル
}

/**
 * 距離文字列から数値を取得
 */
function getDistNum(distStr) {
  if (!distStr) return null;
  const m = String(distStr).match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

/**
 * 馬場状態文字列 → テーブルキー
 */

/** タイム指数バッジHTML（55+紫/50-54赤/45-49青/45未満黒） */
function speedIndexBadgeHtml(idx) {
  if (idx == null) return '';
  const bg  = idx >= 55 ? '#ede9fe' : idx >= 50 ? '#fee2e2' : idx >= 45 ? '#dbeafe' : '#f1f5f9';
  const clr = idx >= 55 ? '#7c3aed' : idx >= 50 ? '#dc2626' : idx >= 45 ? '#1d4ed8' : '#374151';
  return `<span style="font-size:11px;font-weight:900;color:${clr};background:${bg};border-radius:4px;padding:1px 6px;">${idx}</span>`;
}

/** 上がり3F指数バッジHTML（58+紫/50-57赤/43-49青/43未満黒） */
function agariIndexBadgeHtml(idx) {
  if (idx == null) return '';
  const bg  = idx >= 58 ? '#ede9fe' : idx >= 50 ? '#fee2e2' : idx >= 43 ? '#dbeafe' : '#f1f5f9';
  const clr = idx >= 58 ? '#7c3aed' : idx >= 50 ? '#dc2626' : idx >= 43 ? '#1d4ed8' : '#374151';
  return `<span style="font-size:10px;font-weight:800;color:${clr};background:${bg};border-radius:4px;padding:1px 5px;" title="上がり3F指数">末${idx}</span>`;
}

/**
 * レースの上がり3F平均を返す（キャッシュ付き）
 * 馬キーは `${babaCode}_${raceDate}_${raceNo}_${umaBan}` 形式なので、umaBan候補を
 * 直接lookupする（以前はObject.entries(lsData)を毎回全走査しており、馬×過去走ごとに
 * 呼ばれる関数のため出走馬数増加でO(全件数)の負荷が掛け算的に増えていた）。
 */
if (!window._raceAvgAgariCache) window._raceAvgAgariCache = {};
function getRaceAvgAgari3f(babaCode, raceDate, raceNo) {
  if (!babaCode || !raceDate || !raceNo) return null;
  const cacheKey = `${babaCode}_${raceDate}_${raceNo}`;
  if (window._raceAvgAgariCache[cacheKey] !== undefined) return window._raceAvgAgariCache[cacheKey];
  const lsData = lsRead();
  const vals = [];
  for (let uma = 1; uma <= 20; uma++) {
    const v = lsData[`${babaCode}_${raceDate}_${raceNo}_${uma}`];
    if (!v || v.type !== 'horse') continue;
    const ag = parseFloat(v.agari3f);
    if (isFinite(ag) && ag > 0) vals.push(ag);
  }
  const result = vals.length >= 2
    ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)
    : null;
  window._raceAvgAgariCache[cacheKey] = result;
  return result;
}

/** 上がり3F指数を計算（50=レース内平均、速い=高い）*/
function calcAgariIndex(horseAgari, raceAvgAgari) {
  const h = parseFloat(horseAgari);
  const r = parseFloat(raceAvgAgari);
  if (!isFinite(h) || !isFinite(r) || h <= 0 || r <= 0) return null;
  return Math.round(50 + (r - h) * (10 / 0.6));
}

/**
 * 公式データ向け馬場差推定: COND_STANDARDS[dist][cls][cond] - STANDARD_TIMES[dist][cls]
 * 実績dayBiasがない場合に馬場状態から近似値を求める
 * 良=0（補正なし）、それ以外はCOND_STANDARDSと良標準との差を返す
 */
function estimateBiasFromCond(dist, raceClass, trackCond) {
  if (!trackCond || trackCond === '良') return 0;
  const distNum = getDistNum(dist);
  const effCls  = getEffectiveClass(raceClass);
  if (!distNum || !effCls) return 0;
  const goodStd = STANDARD_TIMES[distNum]?.[effCls];
  const condStd = COND_STANDARDS[distNum]?.[effCls]?.[trackCond];
  if (goodStd == null || condStd == null) return 0;
  return +(condStd - goodStd).toFixed(2);
}

/** タイム指数を計算（50基準） 正=基準より速い / 対象外距離は null */
function calcSpeedIndex(horseTimeStr, dist, raceClass, _trackCond, dayBias, kinryo, paceAdj) {
  if (!horseTimeStr || dayBias == null) return null;
  const t = raceTimeToSec(horseTimeStr);
  if (!t) return null;
  const effCls  = getEffectiveClass(raceClass);
  const distNum = getDistNum(dist);
  if (!distNum || !effCls) return null;
  const standard = STANDARD_TIMES[distNum]?.[effCls];
  if (!standard) return null;
  const weightAdj = calcWeightAdj(kinryo, distNum);
  const t_adj = t - weightAdj + (paceAdj || 0);  // 斤量換算 + ペース補正済みタイム
  const diff = (standard + dayBias) - t_adj;
  return Math.round(50 + diff * (10 / (distNum / 1000)));
}

/**
 * レースの前半3F平均を返す（babaCode_raceDate_raceNo で特定、キャッシュ付き）
 * getRaceAvgAgari3f と同様、umaBan候補を直接lookupしてO(全件数)走査を回避する。
 */
if (!window._raceAvgF3Cache) window._raceAvgF3Cache = {};
function getRaceAvgF3(babaCode, raceDate, raceNo) {
  if (!babaCode || !raceDate || !raceNo) return null;
  const cacheKey = `${babaCode}_${raceDate}_${raceNo}`;
  if (window._raceAvgF3Cache[cacheKey] !== undefined) return window._raceAvgF3Cache[cacheKey];
  const lsData = lsRead();
  const f3vals = [];
  for (let uma = 1; uma <= 20; uma++) {
    const v = lsData[`${babaCode}_${raceDate}_${raceNo}_${uma}`];
    if (!v || v.type !== 'horse') continue;
    const f3 = parseFloat(v.first3f);
    if (isFinite(f3) && f3 >= 20 && f3 <= 60) f3vals.push(f3);
  }
  const result = f3vals.length >= 2
    ? +(f3vals.reduce((s, v) => s + v, 0) / f3vals.length).toFixed(2)
    : null;
  window._raceAvgF3Cache[cacheKey] = result;
  return result;
}

/**
 * 各馬の前半区間タイム（走破タイム − 上がり3F）＝残り600m地点までの通過タイム。
 * 1300m→700m地点 / 1400m→800m地点 / 1600m→1000m地点。手入力不要で全馬に出せる
 * （被覆率98.9%・レース内で4角位置と相関0.796を確認済み）。
 */
function calcFrontSectional(timeStr, agari3f) {
  const t = raceTimeToSec(timeStr);
  const a = parseFloat(agari3f);
  if (!t || !isFinite(a) || a < 30 || a > 60) return null;
  const f = t - a;
  return (f >= 30 && f <= 90) ? +f.toFixed(1) : null;
}

/**
 * 前半区間タイムの基準（距離×実効クラス×馬場の平均、n>=30）と当日補正（当日の平均偏差、n>=30）。
 * dev = 馬の前半 − (基準 + 当日補正)。負=基準より速い（ハイ）／正=遅い（スロー）。高知(31)のみ。
 * 検証済み（2026-07-04）：逃げ馬はdevが遅いほど粘る（複勝83.0→93.7%）・垂れた逃げ馬は平均−1.23秒。
 */
function _buildFrontBaseline() {
  if (window._frontBaseCache) return window._frontBaseCache;
  const lsData = lsRead();
  const raceInfo = {};
  for (const k of Object.keys(lsData)) {
    if (!k.startsWith('race_31_')) continue;
    const r = lsData[k];
    if (r) raceInfo[`${r.race_date}_${r.race_no}`] = r;
  }
  const agg = {}; const rows = [];
  for (const k of Object.keys(lsData)) {
    const p = k.split('_');
    if (p.length !== 4 || p[0] !== '31') continue;
    const v = lsData[k];
    if (!v || v.type !== 'horse') continue;
    const ri = raceInfo[`${p[1]}_${parseInt(p[2])}`];
    if (!ri) continue;
    const front = calcFrontSectional(v.time, v.agari3f);
    if (front == null) continue;
    const distNum = getDistNum(ri.distance), effCls = getEffectiveClass(ri.race_class);
    if (!distNum || !effCls) continue;
    const bk = `${distNum}_${effCls}_${ri.track_cond || '良'}`;
    if (!agg[bk]) agg[bk] = { n: 0, s: 0 };
    agg[bk].n++; agg[bk].s += front;
    rows.push({ d: p[1], bk, front });
  }
  const mean = {};
  for (const bk of Object.keys(agg)) if (agg[bk].n >= 30) mean[bk] = agg[bk].s / agg[bk].n;
  const day = {};
  for (const r of rows) {
    if (mean[r.bk] == null) continue;
    if (!day[r.d]) day[r.d] = { n: 0, s: 0 };
    day[r.d].n++; day[r.d].s += r.front - mean[r.bk];
  }
  const dayAdj = {};
  for (const d of Object.keys(day)) if (day[d].n >= 30) dayAdj[d] = day[d].s / day[d].n;
  window._frontBaseCache = { mean, dayAdj };
  return window._frontBaseCache;
}

/** 前半区間タイムの基準比偏差（秒）。負=速い（ハイ）／正=遅い（スロー）。算出不可はnull。 */
function getFrontDev(raceDate, dist, raceClass, trackCond, frontSec) {
  if (frontSec == null) return null;
  const distNum = getDistNum(dist), effCls = getEffectiveClass(raceClass);
  if (!distNum || !effCls) return null;
  const { mean, dayAdj } = _buildFrontBaseline();
  const m = mean[`${distNum}_${effCls}_${trackCond || '良'}`];
  if (m == null) return null;
  return +(frontSec - m - (dayAdj[raceDate] || 0)).toFixed(1);
}

// レースの勝ち幅（2着タイム − 1着タイム、秒）。キャッシュ付き。
if (!window._raceWinMarginCache) window._raceWinMarginCache = {};
function getRaceWinMargin(babaCode, raceDate, raceNo) {
  const ck = `${babaCode}_${raceDate}_${raceNo}`;
  if (window._raceWinMarginCache[ck] !== undefined) return window._raceWinMarginCache[ck];
  const ls = lsRead();
  let winT = null, secT = null;
  for (let u = 1; u <= 20; u++) {
    const v = ls[`${babaCode}_${raceDate}_${raceNo}_${u}`];
    if (!v || v.type !== 'horse') continue;
    const ch = parseInt(v.chakujun), t = raceTimeToSec(v.time);
    if (isNaN(ch) || t == null) continue;
    if (ch === 1) winT = t;
    else if (ch === 2 && (secT == null || t < secT)) secT = t;
  }
  const res = (winT != null && secT != null && secT >= winT) ? +(secT - winT).toFixed(2) : null;
  window._raceWinMarginCache[ck] = res;
  return res;
}

// 前走楽勝ボーナス：前走(高知)が勝利ならその勝ち幅からボーナス。楽勝(1.0秒+)=+5／快勝(0.5-1.0秒)=+2.5／他0。
// 検証(2026-07-05・全11,004R warm-eval)：SIを揃えても前走楽勝馬は勝率+12〜20pt（SIが楽勝＝タイムに余裕を
// 残した勝ちを過小評価）。CV二段クリア＝◎1着率39.2→39.6%(4/5fold)・整合率5/5維持・◎複勝○▲悪化なし。前走限定が最良。
function rakuShoBonus(prevKochiRun) {
  if (!prevKochiRun || parseInt(prevKochiRun.chakujun) !== 1) return 0;
  const wm = getRaceWinMargin('31', prevKochiRun.raceDate, prevKochiRun.raceNo);
  if (wm == null) return 0;
  return wm >= 1.0 ? 5 : wm >= 0.5 ? 2.5 : 0;
}

/**
 * _buildDayRaceData — 指定日・競馬場のレース/馬データを構築（キャッシュ付き）。
 * getDayBiasForDate / getDayBiasByDist / getDayCondBias が共有するキャッシュ。
 * race_${baba}_${date}_${no} / ${baba}_${date}_${no}_${uma} のキー規則を利用し、
 * レース番号1〜16・馬番1〜20を直接lookupする（Object.entries全走査は不要）。
 */
if (!window._dayRaceDataCache) window._dayRaceDataCache = {};
function _buildDayRaceData(babaCode, raceDate) {
  const cacheKey = `${babaCode}_${raceDate}`;
  if (window._dayRaceDataCache[cacheKey]) return window._dayRaceDataCache[cacheKey];
  const lsData = lsRead();
  const raceInfoMap = new Map();   // raceNo → raceInfo object
  const horsesByRace = new Map();  // raceNo → [horse objects]
  for (let rno = 1; rno <= 16; rno++) {
    const raceKey = `race_${babaCode}_${raceDate}_${rno}`;
    const raceVal = lsData[raceKey];
    if (raceVal && raceVal.type === 'race') raceInfoMap.set(rno, raceVal);
    const horses = [];
    for (let uma = 1; uma <= 20; uma++) {
      const hv = lsData[`${babaCode}_${raceDate}_${rno}_${uma}`];
      if (hv && hv.type === 'horse') horses.push(hv);
    }
    if (horses.length) horsesByRace.set(rno, horses);
  }
  const result = { raceInfoMap, horsesByRace };
  window._dayRaceDataCache[cacheKey] = result;
  return result;
}

/** 距離別馬場差優先ヘルパー（距離データなければ全体中央値にフォールバック） */
function getDayBiasForDateAndDist(babaCode, raceDate, distStr, excludeRaceNo) {
  const dist = getDistNum(distStr);
  if (dist) {
    const meta = getDayBiasMeta(babaCode, raceDate, excludeRaceNo);
    if (meta.byDist?.[dist]?.aiBias != null) return +meta.byDist[dist].aiBias.toFixed(2);
  }
  return getDayBiasForDate(babaCode, raceDate, excludeRaceNo);
}

/**
 * 同日馬場差の先読み監視（軽量ガード）。getDayBiasForDate/getHorseAnchoredBiasは
 * 指定日の全レースをレース番号無視で集計するため、呼び出し元が「予測対象レースと同じ日」の
 * バイアスを「未終了の後続レースを含む形」で使うと未来情報リークになる。
 * 安全基準は biasDate < predictionDate（過去に終了した馬の実績を振り返るだけなら安全）。
 * 違反時はconsole.errorで警告し、window._AUDIT_DAY_BIAS_STRICT=trueの時のみthrowする
 * （既定はfalseで非破壊・本番の挙動には影響しない）。
 */
function auditDayBias({ predictionDate, predictionRaceNo, biasDate, sourceMaxRaceNo, caller } = {}) {
  if (biasDate == null || predictionDate == null) return;
  let msg = null;
  if (biasDate > predictionDate) {
    msg = `[auditDayBias] 未来日リーク疑い: biasDate=${biasDate} > predictionDate=${predictionDate} (caller=${caller || '?'})`;
  } else if (biasDate === predictionDate && sourceMaxRaceNo != null && predictionRaceNo != null && sourceMaxRaceNo >= predictionRaceNo) {
    msg = `[auditDayBias] 同日後続レース混入疑い: biasDate=${biasDate} sourceMaxRaceNo=${sourceMaxRaceNo} >= predictionRaceNo=${predictionRaceNo} (caller=${caller || '?'})`;
  }
  if (msg) {
    console.error(msg);
    if (window._AUDIT_DAY_BIAS_STRICT) throw new Error(msg);
  }
}

/** auditDayBiasの3ユニットテスト（コンソールでwindow._testAuditDayBias()を実行） */
window._testAuditDayBias = function() {
  const results = [];
  const run = (name, fn) => {
    let threw = false;
    const prevStrict = window._AUDIT_DAY_BIAS_STRICT;
    window._AUDIT_DAY_BIAS_STRICT = true;
    try { fn(); } catch (e) { threw = true; } finally { window._AUDIT_DAY_BIAS_STRICT = prevStrict; }
    results.push({ name, threw });
  };
  // ① 過去日・その日の全レース使用 → 許可（throwしない）
  run('past-day-full-usage=allowed', () => auditDayBias({
    predictionDate: '2026/01/02', predictionRaceNo: 1,
    biasDate: '2026/01/01', sourceMaxRaceNo: 16, caller: 'test1',
  }));
  // ② 予測対象日・終了済みレースのみ使用 → 許可（sourceMaxRaceNo < predictionRaceNo）
  run('target-day-concluded-only=allowed', () => auditDayBias({
    predictionDate: '2026/01/02', predictionRaceNo: 4,
    biasDate: '2026/01/02', sourceMaxRaceNo: 3, caller: 'test2',
  }));
  // ③ 予測対象日・後続レース含む → 拒否（throwする）
  run('target-day-with-later-races=rejected', () => auditDayBias({
    predictionDate: '2026/01/02', predictionRaceNo: 4,
    biasDate: '2026/01/02', sourceMaxRaceNo: 16, caller: 'test3',
  }));
  const pass = results[0].threw === false && results[1].threw === false && results[2].threw === true;
  console.log('[_testAuditDayBias]', pass ? 'PASS' : 'FAIL', results);
  return { pass, results };
};

/**
 * 馬アンカー方式の当日馬場差（同一馬の自己比較）
 * その日の各出走馬のタイムを「同じ馬の直近の同距離走（参照日の馬場差で水準補正済み）」
 * と比較し、全馬の差の中央値を取る。基準時計方式（getDayBiasForDate）と違い、
 * その日に組まれたメンバーの強弱に引っ張られない。両者が大きくズレる日は
 * 「強い組に時計が引っ張られた日」のシグナル。
 * 戻り値: { bias, n } ｜ 参照できた馬が5頭未満なら bias:null
 */
if (!window._horseBiasCache) window._horseBiasCache = {};
/** 馬別の自己ベンチ比差分を収集（getHorseAnchoredBiasと人気帯別内訳の共通材料） */
function _horseBiasDiffs(babaCode, raceDate, excludeRaceNo) {
  const { raceInfoMap, horsesByRace } = _buildDayRaceData(babaCode, raceDate);
  const excluded = parseInt(excludeRaceNo) || 0;
  const REF_DAYS = 180; // 参照期間（この日数より古い自己ベンチは使わない）
  const rows = [];
  for (const [rno, raceInfo] of raceInfoMap) {
    if (excluded && Number(rno) === excluded) continue;
    if (is2yo(raceInfo.race_class || raceInfo.raceClass || '')) continue;
    const dist = getDistNum(raceInfo.distance);
    if (!dist) continue;
    for (const v of (horsesByRace.get(rno) || [])) {
      const t = raceTimeToSec(v.time);
      if (t == null || isNaN(parseInt(v.chakujun))) continue;
      const name = v.horseName || v.horse_name;
      if (!name) continue;
      // 同じ馬の当日より前・同場・同距離の走破時計（直近3走）を自己ベンチにする
      const refs = [];
      for (const h of getHorseHistory(name)) {
        if (h.babaCode !== babaCode) continue;
        if (!(h.raceDate < raceDate)) continue;
        if (dateDiffDays(raceDate, h.raceDate) > REF_DAYS) continue;
        if (getDistNum(h.distance) !== dist) continue;
        const rt = raceTimeToSec(h.time);
        if (rt == null) continue;
        const rb = getDayBiasForDate(babaCode, h.raceDate, h.raceNo);
        if (rb == null) continue;
        refs.push(rt - rb); // 参照日の馬場差を引いて水準を揃える
        if (refs.length >= 3) break;
      }
      if (!refs.length) continue;
      rows.push({ ninki: parseInt(v.ninki) || null, odds: parseFloat(v.odds) || null, diff: t - calcMedian(refs) });
    }
  }
  return rows;
}

function getHorseAnchoredBias(babaCode, raceDate, excludeRaceNo) {
  const excluded = parseInt(excludeRaceNo) || 0;
  const cacheKey = `${babaCode}_${raceDate}_${excluded || 'all'}`;
  if (window._horseBiasCache[cacheKey] !== undefined) return window._horseBiasCache[cacheKey];
  const diffs = _horseBiasDiffs(babaCode, raceDate, excluded).map(r => r.diff);
  // 外れ値除去（中央値から3秒超は大敗・展開崩れとして除外）
  let arr = diffs;
  if (arr.length >= 8) {
    const med = calcMedian([...arr]);
    const trimmed = arr.filter(d => Math.abs(d - med) <= 3.0);
    if (trimmed.length >= 5) arr = trimmed;
  }
  const result = arr.length >= 5
    ? { bias: +calcMedian(arr).toFixed(2), n: arr.length }
    : { bias: null, n: arr.length };
  window._horseBiasCache[cacheKey] = result;
  return result;
}

/** 馬基準差セルのクリックで人気帯別内訳（メンバー汚染チェック）を開閉 */
function toggleHorseBiasDetail(babaCode, raceDate, cellEl) {
  const existing = cellEl.querySelector('.hb-detail');
  if (existing) { existing.remove(); return; }
  const rows = _horseBiasDiffs(babaCode, raceDate);
  const med = a => a.length ? +calcMedian(a.map(r => r.diff)).toFixed(2) : null;
  const fmt = v => v == null ? '—' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + '秒';
  const buckets = [
    ['1〜3人気（強）',  rows.filter(r => r.ninki >= 1 && r.ninki <= 3)],
    ['4〜6人気（中）',  rows.filter(r => r.ninki >= 4 && r.ninki <= 6)],
    ['7人気〜（弱）',   rows.filter(r => r.ninki >= 7)],
    ['単勝20倍〜（最弱）', rows.filter(r => r.odds >= 20)],
  ];
  const box = document.createElement('div');
  box.className = 'hb-detail';
  box.innerHTML = buckets.map(([label, a]) =>
    `<div class="hb-detail-row"><span>${label}</span><b>${fmt(med(a))}</b><i>n=${a.length}</i></div>`
  ).join('') + `<div class="hb-detail-note">全階層が同程度に速い＝馬場が本物。弱い馬だけ平時並みなら、強いメンバーに時計が引っ張られた疑い。</div>`;
  cellEl.appendChild(box);
}

/** 指定日の距離別馬場差を計算 → {1300: -X, 1400: -Y, ...} */
if (!window._dayBiasDistCache) window._dayBiasDistCache = {};
function getDayBiasByDist(babaCode, raceDate, excludeRaceNo) {
  const excluded = parseInt(excludeRaceNo) || 0;
  const cacheKey = `${babaCode}_${raceDate}_${excluded || 'all'}`;
  if (window._dayBiasDistCache[cacheKey] !== undefined) return window._dayBiasDistCache[cacheKey];
  const result = {};
  for (const [dist, item] of Object.entries(getDayBiasMeta(babaCode, raceDate, excluded).byDist)) {
    if (item.aiBias != null) result[+dist] = +item.aiBias.toFixed(2);
  }
  window._dayBiasDistCache[cacheKey] = result;
  return result;
}

/** 指定日・馬場状態の条件内比較を計算（COND_STANDARDSとの差の中央値） */
if (!window._dayCondBiasCache) window._dayCondBiasCache = {};
function getDayCondBias(babaCode, raceDate, trackCond) {
  if (!babaCode || !raceDate) return null;
  const cacheKey = `${babaCode}_${raceDate}_v2`;
  if (window._dayCondBiasCache[cacheKey] !== undefined) return window._dayCondBiasCache[cacheKey];
  // 各レース自身の馬場状態を使う。多数派状態を全レースへ当てない。
  const diffs = _collectDayBiasRows(babaCode, raceDate).map(r => r.condDiff).filter(Number.isFinite);
  const raw = _trimmedBiasMedian(diffs);
  // 上位3頭/上位5頭の母集団差と、過去3年だけで求めた年度水準を表示上補正。
  const result = raw == null ? null : +(raw + TRACK_BIAS_TOP3_CENTER_SEC - getTrackBiasEraOffset(raceDate)).toFixed(2);
  window._dayCondBiasCache[cacheKey] = result;
  return result;
}

/**
 * あるレースの「基準差」を計算
 * 上位3頭平均タイム - 基準時計 (秒)
 * 戻り値: null (計算不可) or number
 */
function calcRaceStandardDiff(raceData) {
  if (!raceData) return null;
  const { raceInfo, horses } = raceData;
  const dist = getDistNum(raceInfo.distance);
  const effCls = getEffectiveClass(raceInfo.raceClass);
  if (!dist || !effCls) return null;
  const stdTime = STANDARD_TIMES[dist]?.[effCls];
  if (!stdTime) return null;
  // 上位3頭のタイムを取得（着順1〜3）
  const top3 = horses
    .map(h => ({ chaku: parseInt(h.chakujun) || 999, time: raceTimeToSec(h.time) }))
    .filter(h => h.chaku >= 1 && h.chaku <= 3 && h.time != null)
    .sort((a, b) => a.chaku - b.chaku)
    .slice(0, 3);
  if (top3.length < 3) return null; // 3頭揃わない場合は除外
  const center = typeof _raceBiasCenter === 'function'
    ? _raceBiasCenter(top3).center
    : top3.reduce((s, h) => s + h.time, 0) / top3.length;
  return center == null ? null : +(center - stdTime).toFixed(2);
}

/**
 * 中央値を計算
 */
function calcMedian(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)
    : sorted[mid];
}

/**
 * 当日馬場差を計算（全レースの基準差の中央値）
 * allRacesData を使用
 */
function calcDayTrackBias() {
  // 保存データがある日は馬場傾向ページ・AIと同じ共通計算を使う。
  if (currentBaba && currentDate) {
    const meta = getDayBiasMeta(currentBaba, currentDate);
    if (meta.count > 0) return {
      median:meta.bias, diffs:_collectDayBiasRows(currentBaba, currentDate).map(r => r.rawDiff),
      count:meta.count, confidence:meta.confidence,
      runawayAdjustedCount:meta.runawayAdjustedCount || 0,
      transferRunawayCount:meta.transferRunawayCount || 0,
    };
  }
  const diffs = [];
  for (const raceData of Object.values(allRacesData)) {
    if (is2yo(raceData.raceInfo?.raceClass)) continue;
    const d = calcRaceStandardDiff(raceData);
    if (d != null) diffs.push(d);
  }
  // 外れ値除去（中央値から2秒超は除外）
  if (diffs.length >= 4) {
    const med = calcMedian([...diffs]);
    const trimmed = diffs.filter(d => Math.abs(d - med) <= 2.0);
    if (trimmed.length >= 2) diffs.splice(0, diffs.length, ...trimmed);
  }
  return { median: calcMedian(diffs), diffs, count: diffs.length, confidence:diffs.length >= 6 ? 'high' : diffs.length >= 3 ? 'medium' : 'low' };
}

/**
 * renderTrackBiasPanel(raceNo)
 * レースヘッダーに基準差・当日馬場差・補正後差を表示
 */
function renderTrackBiasPanel(raceNo) {
  const container = document.getElementById(`track-bias-panel-${raceNo}`);
  if (!container) return;
  const raceData = allRacesData[raceNo];
  if (!raceData) return;
  const { raceInfo } = raceData;

  const dist = getDistNum(raceInfo.distance);
  const effCls = getEffectiveClass(raceInfo.raceClass);

  // 基準時計（良馬場換算）
  const stdTime = (dist && effCls && STANDARD_TIMES[dist]?.[effCls]) || null;
  // 上位3頭平均
  const top3 = (raceData.horses || [])
    .map(h => ({ chaku: parseInt(h.chakujun) || 999, time: raceTimeToSec(h.time), name: h.horseName }))
    .filter(h => h.chaku >= 1 && h.chaku <= 3 && h.time != null)
    .sort((a, b) => a.chaku - b.chaku)
    .slice(0, 3);
  const top3avg = top3.length === 3 ? top3.reduce((s, h) => s + h.time, 0) / 3 : null;
  const centerInfo = typeof _raceBiasCenter === 'function' ? _raceBiasCenter(top3) : null;
  const biasCenter = centerInfo?.center ?? top3avg;

  // 基準差（このレース）
  const stdDiff = (stdTime != null && biasCenter != null) ? +(biasCenter - stdTime).toFixed(2) : null;

  // 当日馬場差（全レースの中央値）
  const biasInfo = calcDayTrackBias();
  const dayBias  = biasInfo.median;
  const runawayDayNote = biasInfo.runawayAdjustedCount
    ? `<span style="font-size:9px;color:#b45309;margin-left:4px">圧勝補正${biasInfo.runawayAdjustedCount}R</span>` : '';

  // 補正後差
  const corrected = (stdDiff != null && dayBias != null) ? +(stdDiff - dayBias).toFixed(2) : null;

  // 表示する基準時計文字列（秒→M:SS.T形式）
  const secToDisp = (sec) => {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1);
    return `${m}:${s.padStart(4,'0')}`;
  };
  const diffColor = (v) => v == null ? '#6b7280' : v < -0.9 ? '#dc2626' : v < -0.3 ? '#ea580c' : v > 0.6 ? '#7c3aed' : '#16a34a';
  const diffBg    = (v) => v == null ? '#f4f6fa' : v < -0.9 ? '#fee2e2' : v < -0.3 ? '#ffedd5' : v > 0.6 ? '#ede9fe' : '#d1fae5';
  const diffLabel = (v) => v == null ? '—' : v < -0.9 ? '🔥 高評価' : v < -0.3 ? '👍 標準以上' : v > 0.6 ? '⚠️ やや低評価' : '✅ 標準';

  // 対象外レース判定
  const hasStdTable = dist && effCls && STANDARD_TIMES[dist]?.[effCls];
  const isDebaOnly  = raceInfo._isDebaTable || raceInfo._isDebaFallback; // レース前（タイムなし）
  const noResult    = top3.length < 3;

  // 3歳/2歳の表示補足
  const yoBadge = (is3yo(raceInfo.raceClass) || is2yo(raceInfo.raceClass))
    ? `<span style="font-size:10px;background:#7c3aed20;color:#6d28d9;border:1px solid #c4b5fd;border-radius:10px;padding:1px 8px;margin-left:6px;">C3基準で計算</span>`
    : '';
  const mixBadge = (/混合/.test(raceInfo.raceClass||''))
    ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;border-radius:10px;padding:1px 8px;margin-left:6px;">混合戦（暫定）</span>`
    : '';

  if (!hasStdTable) {
    // 対象外距離・クラス
    container.innerHTML = `
    <div style="background:#f8fafc;border:1.5px dashed #d1d5db;border-radius:10px;padding:10px 16px;color:#9ca3af;font-size:12px;display:flex;align-items:center;gap:8px">
      <i class="fas fa-info-circle"></i>
      <span>基準時計データなし（対象：1300m・1400m・1600m / A〜C3クラス）</span>
    </div>`;
    return;
  }

  if (isDebaOnly || noResult) {
    // 出馬表のみ or タイム揃わず → 当日馬場差のみ表示
    const biasStr  = dayBias != null ? secToDiffStr(dayBias) : '—';
    const biasClr  = dayBias != null ? diffColor(dayBias)    : '#6b7280';
    const biasBg   = dayBias != null ? diffBg(dayBias)       : '#f4f6fa';
    container.innerHTML = `
    <div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1.5px solid #bae6fd;border-radius:10px;padding:12px 16px">
      <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <i class="fas fa-thermometer-half"></i> 馬場差・基準時計
        ${yoBadge}${mixBadge}
        <span style="font-size:11px;font-weight:400;color:#6b7280">${effCls}クラス / ${raceInfo.distance} / ${raceInfo.trackCond||'馬場不明'}</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div style="background:#fff;border-radius:8px;padding:8px 14px;border:1px solid #e0f2fe;min-width:110px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:2px">基準時計</div>
          <div style="font-size:16px;font-weight:800;font-family:monospace;color:#0369a1">${secToDisp(stdTime)}</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 14px;border:1px solid #e0f2fe;min-width:110px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:2px">基準差</div>
          <div style="font-size:16px;font-weight:800;font-family:monospace;color:#9ca3af">—</div>
          <div style="font-size:10px;color:#9ca3af">${isDebaOnly ? 'レース前' : '3頭未揃'}</div>
        </div>
        <div style="background:${biasBg};border-radius:8px;padding:8px 14px;border:1px solid #e0f2fe;min-width:140px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:2px">当日馬場差 <span style="opacity:.7">(${biasInfo.count}R中央値)</span>${runawayDayNote}</div>
          <div style="font-size:18px;font-weight:800;font-family:monospace;color:${biasClr}">${biasStr}秒</div>
        </div>
        <div style="background:#f4f6fa;border-radius:8px;padding:8px 14px;border:1px solid #e2e8f0;min-width:110px;text-align:center">
          <div style="font-size:10px;color:#6b7280;margin-bottom:2px">補正後差</div>
          <div style="font-size:16px;font-weight:800;font-family:monospace;color:#9ca3af">—</div>
        </div>
      </div>
    </div>`;
    return;
  }

  // フル表示（タイムあり）
  const stdDiffStr   = secToDiffStr(stdDiff);
  const dayBiasStr   = dayBias != null ? secToDiffStr(dayBias) : '—';
  const correctedStr = secToDiffStr(corrected);
  const corrClr      = diffColor(corrected);
  const corrBg       = diffBg(corrected);

  container.innerHTML = `
  <div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1.5px solid #bae6fd;border-radius:10px;padding:12px 16px">
    <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <i class="fas fa-thermometer-half"></i> 馬場差・基準時計
      ${yoBadge}${mixBadge}
      <span style="font-size:11px;font-weight:400;color:#6b7280">${effCls}クラス / ${raceInfo.distance} / ${raceInfo.trackCond||'馬場不明'}</span>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <!-- 基準時計 -->
      <div style="background:#fff;border-radius:8px;padding:8px 14px;border:1px solid #bae6fd;min-width:110px;text-align:center">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px">基準時計（良）</div>
        <div style="font-size:16px;font-weight:800;font-family:monospace;color:#0369a1">${secToDisp(stdTime)}</div>
        <div style="font-size:9px;color:#9ca3af;margin-top:1px">${centerInfo?.runawayAdjusted ? '圧勝補正（2・3着平均）' : '上位3頭平均'}: ${secToDisp(biasCenter)}</div>
        ${centerInfo?.runawayAdjusted ? `<div style="font-size:9px;color:#b45309;margin-top:1px">1着差 ${centerInfo.winMargin.toFixed(1)}秒・勝ち馬を馬場基準から除外</div>` : ''}
      </div>
      <!-- 基準差 -->
      <div style="background:#fff;border-radius:8px;padding:8px 14px;border:1px solid #bae6fd;min-width:100px;text-align:center">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px">基準差</div>
        <div style="font-size:18px;font-weight:800;font-family:monospace;color:${diffColor(stdDiff)}">${stdDiffStr}秒</div>
        <div style="font-size:9px;color:#9ca3af;margin-top:1px">このレース</div>
      </div>
      <!-- 矢印 -->
      <div style="display:flex;align-items:center;color:#94a3b8;font-size:18px;padding-top:8px">→</div>
      <!-- 当日馬場差 -->
      <div style="background:${diffBg(dayBias)};border-radius:8px;padding:8px 14px;border:1px solid #bae6fd;min-width:140px;text-align:center">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px">当日馬場差 <span style="opacity:.7">(${biasInfo.count}R中央値)</span>${runawayDayNote}</div>
        <div style="font-size:18px;font-weight:800;font-family:monospace;color:${diffColor(dayBias)}">${dayBiasStr}秒</div>
        <div style="font-size:9px;color:#9ca3af;margin-top:1px">${dayBias!=null?(dayBias<0?'速い馬場':'時計かかる馬場'):''}</div>
      </div>
      <!-- 矢印 -->
      <div style="display:flex;align-items:center;color:#94a3b8;font-size:18px;padding-top:8px">=</div>
      <!-- 補正後差 -->
      <div style="background:${corrBg};border-radius:8px;padding:8px 14px;border:1.5px solid ${corrClr}40;min-width:140px;text-align:center">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px">補正後差</div>
        <div style="font-size:20px;font-weight:800;font-family:monospace;color:${corrClr}">${correctedStr}秒</div>
        <div style="font-size:10px;font-weight:700;color:${corrClr};margin-top:2px">${diffLabel(corrected)}</div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:11px;color:#64748b;padding:6px 10px;background:rgba(255,255,255,.6);border-radius:6px;line-height:1.7">
      📌 基準差=原則上位3頭平均−良馬場基準時計（1着が1.0秒以上離した場合は2・3着平均） ／ 当日馬場差=その日の基準差の中央値 ／ 補正後差=基準差−当日馬場差
    </div>
  </div>`;
}

// ============================================================
// ② クラス×距離別 基準3F統計（インライン版）
// ============================================================
// ============================================================
// 馬場状態別クラス×距離基準値
// ============================================================

/** 馬場状態を4グループに正規化 */
function normalizeTrackCond(cond) {
  if (!cond) return 'all';
  if (cond === '良')   return 'good';
  if (cond === '稍重') return 'yaya';
  if (cond === '重')   return 'heavy';
  if (cond === '不良') return 'bad';
  return 'all';
}
const TRACK_COND_LABELS = { all:'全馬場', good:'良', yaya:'稍重', heavy:'重', bad:'不良' };
const TRACK_COND_ORDER  = ['all','good','yaya','heavy','bad'];

function _makeStatBucket() {
  return {count:0,f3Sum:0,f3N:0,agariSum:0,agariN:0,winF3Sum:0,winF3N:0,winAgariSum:0,winAgariN:0};
}
function _calcStatBucket(s) {
  s.avgF3      = s.f3N      ? +(s.f3Sum/s.f3N).toFixed(2)       : null;
  s.avgAgari   = s.agariN   ? +(s.agariSum/s.agariN).toFixed(2)  : null;
  s.avgWinF3   = s.winF3N   ? +(s.winF3Sum/s.winF3N).toFixed(2)  : null;
  s.avgWinAgari= s.winAgariN? +(s.winAgariSum/s.winAgariN).toFixed(2):null;
}

/**
 * buildClassDistStats()
 * 戻り値: { "${cls}_${dist}": { cls, dist, byTrack:{ all:{...}, good:{...}, ... } } }
 */
function buildClassDistStats() {
  const lsData = lsRead();
  const stats  = {};

  Object.entries(lsData).filter(([k,v])=>v.type==='horse'&&!k.startsWith('offi_')).forEach(([k,v])=>{
    const parts = k.split('_');
    const babaCode=parts[0], raceDate=parts[1], raceNo=parseInt(parts[2]);
    if (isNaN(raceNo)) return;
    // O(1)直接キー引き（旧: Object.values(raceMap).find() = O(n)線形探索）
    const raceVal = lsData[`race_${babaCode}_${raceDate}_${raceNo}`];
    if (!raceVal) return;
    const cls  = raceVal.race_class||raceVal.raceClass||'';
    const dist = raceVal.distance||'';
    if (!cls||!dist) return;

    const trackGrp = normalizeTrackCond(raceVal.track_cond||raceVal.trackCond||'');
    const key = `${cls}_${dist}`;
    if (!stats[key]) {
      stats[key] = { cls, dist, byTrack:{} };
      TRACK_COND_ORDER.forEach(t=>{ stats[key].byTrack[t] = _makeStatBucket(); });
    }
    const f3    = parseFloat(v.first3f);
    const agari = parseFloat(v.agari3f);
    const chaku = parseInt(v.chakujun);
    const isWin = !isNaN(chaku) && chaku <= 3;

    // all バケット + 馬場別バケットの両方に積算
    const buckets = [stats[key].byTrack['all'], stats[key].byTrack[trackGrp]].filter(Boolean);
    buckets.forEach(b => {
      b.count++;
      if (!isNaN(f3))    { b.f3Sum+=f3;    b.f3N++;    }
      if (!isNaN(agari)) { b.agariSum+=agari; b.agariN++; }
      if (isWin) {
        if (!isNaN(f3))    { b.winF3Sum+=f3;    b.winF3N++;    }
        if (!isNaN(agari)) { b.winAgariSum+=agari; b.winAgariN++; }
      }
    });
  });

  Object.values(stats).forEach(s=>{
    TRACK_COND_ORDER.forEach(t=>{ if(s.byTrack[t]) _calcStatBucket(s.byTrack[t]); });
  });
  return stats;
}

/** 選択中の馬場タブ状態 { raceNo: trackGrp } */
const _benchTrackTab = {};

function renderClassDistBenchmark(raceNo) {
  const data = allRacesData[raceNo]; if (!data) return;
  const { raceClass, distance, trackCond } = data.raceInfo;
  if (!raceClass || !distance) return;
  const container = document.getElementById(`class-bench-${raceNo}`); if (!container) return;

  const stats = buildClassDistStats();
  const key   = `${raceClass}_${distance}`;
  const entry = stats[key];

  // 初期タブ：今日の馬場状態に合わせる（データがあれば）
  if (!_benchTrackTab[raceNo]) {
    const todayGrp = normalizeTrackCond(trackCond);
    const hasTodayData = entry && entry.byTrack[todayGrp] && entry.byTrack[todayGrp].count >= 2;
    _benchTrackTab[raceNo] = hasTodayData ? todayGrp : 'all';
  }
  _renderBenchContent(raceNo, raceClass, distance, entry, _benchTrackTab[raceNo]);
}

function switchBenchTab(raceNo, trackGrp) {
  _benchTrackTab[raceNo] = trackGrp;
  const data = allRacesData[raceNo]; if (!data) return;
  const { raceClass, distance } = data.raceInfo;
  const stats = buildClassDistStats();
  const entry = stats[`${raceClass}_${distance}`];
  _renderBenchContent(raceNo, raceClass, distance, entry, trackGrp);
}

function _renderBenchContent(raceNo, raceClass, distance, entry, activeTab) {
  const container = document.getElementById(`class-bench-${raceNo}`); if (!container) return;
  const curF3 = parseFloat(document.getElementById(`race-first3f-${raceNo}`)?.value);
  const curAg = parseFloat(document.getElementById(`race-agari3f-${raceNo}`)?.value);

  const diff = (val, ref) => {
    if (val==null||ref==null) return '';
    const d = +(val-ref).toFixed(2);
    if (d > 0.3)  return `<span class="bench-diff bench-diff-slow">+${d}</span>`;
    if (d < -0.3) return `<span class="bench-diff bench-diff-fast">${d}</span>`;
    return `<span class="bench-diff bench-diff-avg">±${Math.abs(d)}</span>`;
  };

  // 利用可能な馬場タブのみ表示（allは常に表示）
  const availTabs = TRACK_COND_ORDER.filter(t =>
    t === 'all' || (entry && entry.byTrack[t] && entry.byTrack[t].count > 0)
  );

  const tabsHtml = availTabs.map(t => {
    const cnt  = entry ? (entry.byTrack[t]?.count || 0) : 0;
    const isAct = t === activeTab;
    const tabCls= `bench-track-tab tab-${t}${isAct?' active':''}`;
    return `<button class="${tabCls}" onclick="switchBenchTab(${raceNo},'${t}')">${TRACK_COND_LABELS[t]}${cnt>0?`<span style="font-size:10px;opacity:.8;margin-left:3px">(${cnt}頭)</span>`:''}</button>`;
  }).join('');

  const s = entry ? entry.byTrack[activeTab] : null;
  let contentHtml;
  if (!s || s.count < 2) {
    const total = entry ? entry.byTrack['all'].count : 0;
    contentHtml = `<div class="bench-track-nodata"><i class="fas fa-info-circle"></i> ${TRACK_COND_LABELS[activeTab]}のデータ不足（${s?.count||0}件）${total>0?` ／ 全馬場合計 ${total}件`:''}</div>`;
  } else {
    contentHtml = `<div class="bench-items">
      <div class="bench-item"><span class="bench-label">前半3F（全体平均）</span><span class="bench-val">${s.avgF3!=null?s.avgF3+'秒':'—'}</span>${!isNaN(curF3)?diff(curF3,s.avgF3):''}</div>
      <div class="bench-item bench-item-win"><span class="bench-label">前半3F（好走平均）</span><span class="bench-val">${s.avgWinF3!=null?s.avgWinF3+'秒':'—'}</span>${!isNaN(curF3)?diff(curF3,s.avgWinF3):''}</div>
      <div class="bench-item"><span class="bench-label">上がり3F（全体平均）</span><span class="bench-val">${s.avgAgari!=null?s.avgAgari+'秒':'—'}</span>${!isNaN(curAg)?diff(curAg,s.avgAgari):''}</div>
      <div class="bench-item bench-item-win"><span class="bench-label">上がり3F（好走平均）</span><span class="bench-val">${s.avgWinAgari!=null?s.avgWinAgari+'秒':'—'}</span>${!isNaN(curAg)?diff(curAg,s.avgWinAgari):''}</div>
    </div>`;
  }

  container.innerHTML = `<div class="bench-panel">
    <div class="bench-title">
      <i class="fas fa-chart-line"></i>
      <span class="bench-class-badge ${raceClassCssClass(raceClass)}">${raceClass}</span>
      ${distance} 過去基準値
      <span class="bench-count">${s?.count||0}頭のデータ</span>
    </div>
    <div class="bench-track-tabs">${tabsHtml}</div>
    ${contentHtml}
  </div>`;
}
