import puppeteer from '@cloudflare/puppeteer';

/**
 * keiba-viewer Worker (keiba-proxydeploy) - 3 features in one
 *  1. GET ?url=...        HTML proxy (keiba.go.jp / keiba.rakuten.co.jp only, open CORS)
 *  2. POST/DELETE /rest/v1/...  Supabase write proxy (X-Write-Token required)
 *  3. cron (scheduled)    Kochi T10/T5 market checkpoints -> Supabase
 *
 * Env vars: SUPABASE_SERVICE_KEY / ADMIN_WRITE_TOKEN / CAPTURE_TOKEN
 * Cron: every minute, UTC 05-12 (= JST 14-21, covers Kochi's window):  * 5-12 * * *
 * Manual test: POST /capture with Authorization: Bearer <CAPTURE_TOKEN>
 * NOTE: this file is ASCII-only on purpose (dashboard clipboard paste mangles CJK).
 *       The post-time marker (hassou) is written as unicode escapes in the regex.
 */

const SUPABASE_URL = 'https://jcrcftvrsgmsewwdkqha.supabase.co';
const ALLOWED_TABLES = new Set(['keiba_races', 'keiba_horses', 'keiba_day_settings', 'keiba_odds_snapshots', 'keiba_market_checkpoints', 'keiba_ai_predictions', 'keiba_value_t10_ledger', 'keiba_official_histories']);
// Allowed browser origins for the write proxy (custom domain yukochi.com + legacy github.io).
const ALLOWED_ORIGINS = new Set([
  'https://yukochi.com',
  'https://www.yukochi.com',
  'https://maguronagareboshi-arch.github.io',
]);
const PROXY_HOSTS = new Set(['www.keiba.go.jp', 'keiba.rakuten.co.jp']);
const PROXY_PATHS = [
  '/KeibaWeb/TodayRaceInfo/',
  '/KeibaWeb/MonthlyConveneInfo/',
  '/search/race_detail',
];
const MAX_PROXY_BYTES = 2 * 1024 * 1024;

function adminToken(env) { return env.ADMIN_WRITE_TOKEN || ''; }
function captureToken(env) { return env.CAPTURE_TOKEN || ''; }
function bearer(request) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

function decodeHtmlText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}

function normalizePostraceCommentRaceId(value) {
  const match = String(value || '').match(/^(20\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), raceNo = Number(match[4]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  if (raceNo < 1 || raceNo > 12) return '';
  return match[0];
}

function horseHistoryColumnMap(table) {
  const rows = String(table || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const header = rows.find(row => /<th\b/i.test(row)
    && /\u5e74\u6708\u65e5/.test(row) && /\u7740\u9806/.test(row));
  if (!header) return null;
  const cells = header.match(/<th\b[\s\S]*?<\/th>/gi) || [];
  const map = {};
  let col = 0, weatherStart = -1, weatherSpan = 1, combinedWeatherHeader = false;
  for (const cell of cells) {
    const label = decodeHtmlText(cell).replace(/\s+/g, '');
    const spanMatch = cell.match(/\bcolspan\s*=\s*["']?(\d+)/i);
    const span = Math.max(1, Number(spanMatch && spanMatch[1]) || 1);
    const hasWeather = /\u5929\u5019/.test(label);
    const hasTrack = /\u99ac\u5834/.test(label);
    if (/^\u5e74\u6708\u65e5$/.test(label)) map.date = col;
    else if (/^\u7af6\u99ac\u5834$/.test(label)) map.course = col;
    else if (/^R$/i.test(label)) map.raceNo = col;
    else if (/\u7af6\u8d70\u540d|\u30ec\u30fc\u30b9\u540d/.test(label)) map.raceName = col;
    else if (/\u683c\u7d44|\u683c\u4ed8|\u30af\u30e9\u30b9/.test(label)) map.raceClass = col;
    else if (/^\u8ddd\u96e2$/.test(label)) map.dist = col;
    else if (hasWeather || hasTrack) {
      if (hasWeather) map.tenki = col;
      if (hasTrack) map.trackCond = col + (hasWeather && span >= 2 ? 1 : 0);
      if (hasWeather && hasTrack) {
        weatherStart = col;
        weatherSpan = span;
        combinedWeatherHeader = true;
      }
    }
    else if (/\u982d\u6570/.test(label)) map.headCount = col;
    else if (/^\u67a0$/.test(label)) map.waku = col;
    else if (/^\u99ac\u756a$/.test(label)) map.umaBan = col;
    else if (/^\u4eba\u6c17$/.test(label)) map.ninki = col;
    else if (/^\u7740\u9806$/.test(label)) map.chakujun = col;
    else if (/\u30bf\u30a4\u30e0|\u6642\u8a08/.test(label)) map.time = col;
    else if (/^\u5dee$|^\u7740\u5dee$/.test(label)) map.diff = col;
    else if (/\u4e0a3F|\u4e0a\u308a3F|\u4e0a\u304c\u308a3F|^\u4e0a\u308a$/.test(label)) map.agari = col;
    else if (/\u4f53\u91cd/.test(label)) map.weight = col;
    else if (/\u9a0e\u624b/.test(label)) map.jockey = col;
    else if (/\u91cd\u91cf|\u65a4\u91cf/.test(label)) map.kinryo = col;
    else if (/\u8abf\u6559\u5e2b/.test(label)) map.trainer = col;
    else if (/\u53ce\u5f97\u8cde\u91d1|\u53d6\u5f97\u8cde\u91d1|\u8cde\u91d1/.test(label)) map.prize = col;
    else if (/1\u7740\u99ac|\u7740\u99ac/.test(label)) map.winner = col;
    col += span;
  }
  const required = ['date','course','raceNo','raceName','dist','chakujun','time','agari','weight','jockey','kinryo','trainer','prize','winner'];
  if (!required.every(key => Number.isInteger(map[key]))) return null;
  return { map, width:col, weatherStart, weatherSpan, combinedWeatherHeader };
}

function isHorseHistoryRaceValid(race) {
  if (!race || !/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(String(race.raceDate || ''))) return false;
  const raceNo = Number(race.raceNo);
  if (!Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12) return false;
  if (!String(race.course || '').trim() || !String(race.raceName || '').trim()) return false;
  if (!/\d{3,4}/.test(String(race.dist || ''))) return false;
  if (race.chakujun && !/^\d{1,2}$/.test(String(race.chakujun))) return false;
  if (race.time && !/^\d+:\d{2}\.\d$/.test(String(race.time))) return false;
  if (race.agari3f && !/^\d{2}\.\d$/.test(String(race.agari3f))) return false;
  if (race.weight && !/^\d{3,4}$/.test(String(race.weight))) return false;
  if (race.kinryo && !/^\d{2}(?:\.\d)?$/.test(String(race.kinryo))) return false;
  if (race.prize && !/^(?:[-\uFF0D\u2212\u2014\u2015]|\d[\d,]*(?:\.\d+)?(?:\s*(?:\u5186|\u4e07\u5186))?)$/.test(String(race.prize))) return false;
  return true;
}

function isHorseHistoryCacheValid(races) {
  return Array.isArray(races) && races.length > 0
    && races.every(isHorseHistoryRaceValid)
    && races.some(race => /^\d+:\d{2}\.\d$/.test(String(race.time || '')));
}

function horseHistoryRaceKey(race) {
  return [race && race.raceDate, race && race.course, race && race.raceNo].join('|');
}

/* Merge a freshly fetched history into what is already stored.
 * Stored races are never dropped and stored values are never overwritten:
 * a re-fetch can only add missing races and fill blank fields. A fetch that
 * would shrink the history is treated as a bad read and ignored. A broken
 * stored row is replaced outright, so a bad value can never become permanent. */
function mergeHorseHistories(stored, fetched) {
  const older = Array.isArray(stored) ? stored : [];
  const newer = Array.isArray(fetched) ? fetched : [];
  if (!older.length || !isHorseHistoryCacheValid(older)) return newer;
  if (!newer.length) return older;

  const merged = new Map();
  for (const race of older) merged.set(horseHistoryRaceKey(race), Object.assign({}, race));
  for (const race of newer) {
    const key = horseHistoryRaceKey(race);
    const kept = merged.get(key);
    if (!kept) { merged.set(key, Object.assign({}, race)); continue; }
    for (const field of Object.keys(race)) {
      const had = kept[field];
      if (had === undefined || had === null || String(had).trim() === '') kept[field] = race[field];
    }
  }
  const out = [...merged.values()].sort((a, b) => String(b.raceDate || '').localeCompare(String(a.raceDate || '')));
  return out.length >= older.length ? out : older;
}

/* Header-driven HorseMarkInfo parser. The official page currently expands
 * its weather/track header to three data cells, including one blank cell. */
function parseHorseMarkInfo(html) {
  const tables = String(html || '').match(/<table\b[\s\S]*?<\/table>/gi) || [];
  const table = tables.find(t => /\u7740\u9806/.test(t) && /(\u4e0a3F|\u4e0a\u308a|\u4e0a\u304c\u308a)/.test(t));
  if (!table) return [];
  const columns = horseHistoryColumnMap(table);
  if (!columns) return [];
  const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  for (const row of rows) {
    const rawCells = row.match(/<td\b[\s\S]*?<\/td>/gi) || [];
    if (rawCells.length < 20) continue;
    const c = rawCells.map(decodeHtmlText);
    if (!/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(c[0] || '')) continue;
    const missing = Math.max(0, columns.width - c.length);
    const at = key => {
      let index = columns.map[key];
      if (!Number.isInteger(index)) return '';
      if (missing && columns.combinedWeatherHeader
        && index >= columns.weatherStart + columns.weatherSpan) index -= missing;
      return c[index] || '';
    };
    let tenki = at('tenki'), trackCond = at('trackCond');
    if (missing && columns.combinedWeatherHeader) {
      const parts = String(c[columns.weatherStart] || '').split(/\s+/);
      tenki = parts[0] || '';
      trackCond = parts[1] || '';
    }
    const finish = (at('chakujun').match(/\d+/) || [null])[0];
    const agari = (at('agari').match(/\d{2}\.\d/) || [''])[0];
    const parsed = {
      raceDate:at('date').replace(/-/g, '/'), course:at('course'), raceNo:at('raceNo'), raceName:at('raceName'),
      raceClass:at('raceClass'), raceClassRaw:at('raceClass'), dist:at('dist'), tenki, trackCond,
      headCount:at('headCount'), ninki:at('ninki'), chakujun:finish || '', time:at('time'), diff:at('diff'),
      agari3f:agari, weight:(at('weight').match(/^\d{3,4}/) || [''])[0],
      jockey:at('jockey').replace(/[\uff08(][^\uff09)]*[\uff09)]/g, '').replace(/\s/g, ''),
      kinryo:at('kinryo'), trainer:at('trainer'), prize:at('prize'), winner:at('winner'),
    };
    if (isHorseHistoryRaceValid(parsed)) out.push(parsed);
  }
  return out;
}

async function getSharedHorseHistory(env, lineage, horseName) {
  const query = SUPABASE_URL + '/rest/v1/keiba_official_histories?select=lineage_code,horse_name,races,fetched_at,source_sha256&lineage_code=eq.' + encodeURIComponent(lineage) + '&limit=1';
  const serviceHeaders = { 'apikey':env.SUPABASE_SERVICE_KEY, 'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY };
  let storedRow = null;
  try {
    const cached = await fetch(query, { headers:serviceHeaders });
    if (cached.ok) {
      const rows = await cached.json();
      const row = rows && rows[0];
      if (row && Array.isArray(row.races)) storedRow = row;
      const age = row ? Date.now() - Date.parse(row.fetched_at || 0) : Infinity;
      if (row && isHorseHistoryCacheValid(row.races) && age < 7 * 86400000) {
        return { ...row, cache:'server', persisted:true };
      }
    }
  } catch (_) {}

  const sourceUrl = 'https://www.keiba.go.jp/KeibaWeb/DataRoom/HorseMarkInfo?k_lineageLoginCode=' + encodeURIComponent(lineage);
  const upstream = await fetch(sourceUrl, { headers:{ 'User-Agent':UA }, signal:AbortSignal.timeout(12000) });
  if (!upstream.ok) throw new Error('official history HTTP ' + upstream.status);
  const html = await upstream.text();
  if (html.length > MAX_PROXY_BYTES) throw new Error('official history too large');
  const fresh = parseHorseMarkInfo(html);
  if (!fresh.length) throw new Error('official history parse failed');
  // Re-fetches add to the stored history; they never delete a race or blank a field.
  const races = mergeHorseHistories(storedRow && storedRow.races, fresh);
  const fetchedAt = new Date().toISOString();
  const sha = await sha256Hex(html);
  const record = { lineage_code:lineage,
    horse_name:String(horseName || (storedRow && storedRow.horse_name) || '').slice(0, 80),
    races, fetched_at:fetchedAt, source_sha256:sha, source_url:sourceUrl, updated_at:fetchedAt };
  let persisted = false;
  try {
    const saved = await fetch(SUPABASE_URL + '/rest/v1/keiba_official_histories', {
      method:'POST', headers:{...serviceHeaders, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(record),
    });
    persisted = saved.ok;
  } catch (_) {}
  return { lineage_code:lineage, horse_name:record.horse_name, races, fetched_at:fetchedAt,
    source_sha256:sha, cache:'official', persisted };
}

// Build CORS headers for the write proxy, echoing the request Origin when it is allow-listed.
function corsWrite(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://yukochi.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Write-Token, Prefer',
    'Vary': 'Origin',
  };
}
const CORS_ANY = { 'Access-Control-Allow-Origin': '*' };

const BABA = '31';               // Kochi
const CAPTURE_MINUTES = new Set([10, 5]); // Low-volume, model-required checkpoints only.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CLOUD_PRECOMPUTE_URL = 'https://yukochi.com/';
const CLOUD_PRECOMPUTE_RETRY_MS = 60 * 60 * 1000;

// Exact server-side port of kochi-umaren-distortion-shadow-v1.  Ability
// inputs are prepared before post time and contain no market information.
const UMAREN_MODEL_ID = 'kochi-umaren-distortion-shadow-v1';
const UMAREN_MODEL_FINGERPRINT = 'a6437e2b3c416b36';
const UMAREN_AXIS_RULE = Object.freeze({ oddsMin:8, oddsMax:50, evMin:0.5, marketRankMin:3, currentRankMax:5, vnextRankMax:3 });
const UMAREN_PAIR_RULE = Object.freeze({ calibrationAlpha:0.9173336186692329, oddsMax:50, evMin:0, gapMin:1, currentPartnerCount:2 });
const UMAREN_REFERENCE = Object.freeze({ raceYen:5000, perTicketYen:2500, tickets:2 });
const UMAREN_ADDITIVE = Object.freeze({
  features:['base','condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN','marginN','winStrN','takiN','cornConsistN','rakuN'],
  mean:[41.32801595491268,0.0020473612921104245,-0.07084211348685605,-0.19869143170747447,-0.00025725457913150854,-0.9749531770538747,-0.035359581578582405,-0.026176510941894205,-1.148061948884481,0.03340430712068965,-0.00000675293270177859,0.08164831584002123,0.013377238114837983,0.0031333607738218785,0.13458702064896755],
  sd:[9.946127386540878,0.7559050374959382,0.3830344803411909,0.39587899451602265,0.38527370268303895,1.3658917072854169,0.7534613600017239,0.09476023325628567,0.33615523158006205,0.5611413822096927,0.44853693809948136,0.17894687179303576,0.08858550879983638,0.6088507006405194,0.7024965324613972],
  w:[1.606183708761838,0.0273270585864609,0.027882738146400105,0.006245247732827066,0.15423734138248832,0.24575641323886596,0.1311015684275099,0.044403344615545015,0.11678458406458045,0.28802836589206543,0.04417364560887074,-0.03586296481417553,-0.0003007276171790805,-0.11390036426742269,0.07448651694374255],
});
const UMAREN_OFFSET = Object.freeze({
  features:['base','distNew','clsN','cornN','trendN','weightN','agariN','comboN','marginN','cornConsistN','rotTakiN'],
  mean:[41.32801595491268,-0.07084211348685605,-0.00025725457913150854,-0.9749531770538747,-0.035359581578582405,-0.026176510941894205,-1.148061948884481,0.03340430712068965,-0.00000675293270177859,0.0031333607738218785,-0.1853141935926545],
  sd:[9.946127386540878,0.3830344803411909,0.38527370268303895,1.3658917072854169,0.7534613600017239,0.09476023325628567,0.33615523158006205,0.5611413822096927,0.44853693809948136,0.6088507006405194,0.4106685206767861],
  w:[0.38517760144823615,-0.016054218219129533,0.0391511278280639,-0.034268446807129184,-0.001903264269807987,0.02703319236209095,0.02209957519840687,0.022646602643800137,-0.019540346760428123,-0.10017290243089289,-0.04434197027185414],
});

function cloudFinite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function cloudUma(value) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function cloudRound8(value) { return Math.round((Number(value) + Number.EPSILON) * 1e8) / 1e8; }
function cloudSameSet(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function cloudSoftmax(scores) {
  if (!Array.isArray(scores) || !scores.length || scores.some(value => !Number.isFinite(value))) return null;
  const maximum = Math.max(...scores), exponents = scores.map(value => Math.exp(value - maximum));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) && total > 0 ? exponents.map(value => value / total) : null;
}
function cloudStandardizedScore(raw, specification) {
  return specification.features.reduce((sum, name, index) => {
    const value = cloudFinite(raw[name]), clean = value == null ? 0 : value;
    return sum + ((clean - specification.mean[index]) / specification.sd[index]) * specification.w[index];
  }, 0);
}
function cloudFeatureMap(runner) {
  const x = runner && runner.x || {}, rot = cloudFinite(x.rotMod) ?? 0, taki = cloudFinite(x.takiMod) ?? 0;
  return { base:x.baseScore, condNew:x.condMod, distNew:x.distMod, rotN:x.rotMod, clsN:x.classMod,
    cornN:x.cornModRaw, trendN:x.trendMod, weightN:x.weightMod, agariN:x.agariMod,
    comboN:x.comboMod, marginN:x.marginMod, winStrN:x.winStrMod, takiN:x.takiMod,
    cornConsistN:x.cornConsistMod, rakuN:x.rakuMod, rotTakiN:rot + taki };
}
function validCloudInput(input) {
  return !!(input && input.schema === 'kochi_umaren_cloud_input/v1' && String(input.babaCode) === BABA &&
    input.modelId === UMAREN_MODEL_ID && input.modelFingerprint === UMAREN_MODEL_FINGERPRINT &&
    Array.isArray(input.runners) && input.runners.length >= 4);
}

function scoreCloudUmarenAxis(input, marketRows) {
  if (!validCloudInput(input)) return { ok:false, reason:'INVALID_CLOUD_INPUT', rows:[], candidate:null };
  const runners = input.runners.map(row => ({ u:cloudUma(row.u), name:String(row.name || ''),
    currentScore:cloudFinite(row.totalScore), vnextRank:Number(row.vnextRank), raw:cloudFeatureMap(row) }));
  const market = Array.isArray(marketRows) ? marketRows.map(row => ({ u:cloudUma(row.u ?? row.uma_ban), odds:cloudFinite(row.odds) })) : [];
  if (market.length !== runners.length) return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH', rows:[], candidate:null };
  if (runners.some(row => !row.u || row.currentScore == null || !Number.isInteger(row.vnextRank)) ||
      new Set(runners.map(row => row.u)).size !== runners.length) return { ok:false, reason:'INCOMPLETE_ABILITY_UNIVERSE', rows:[], candidate:null };
  const runnerSet = runners.map(row => row.u).sort((a,b) => a-b), marketSet = market.map(row => row.u).sort((a,b) => a-b);
  if (market.some(row => !row.u || row.odds == null || row.odds <= 0) || new Set(marketSet).size !== market.length ||
      !cloudSameSet(runnerSet, marketSet)) return { ok:false, reason:'INCOMPLETE_T10_MARKET', rows:[], candidate:null };
  const oddsByUma = new Map(market.map(row => [row.u,row.odds]));
  const currentOrder = runners.slice().sort((a,b) => b.currentScore-a.currentScore || a.u-b.u);
  const currentRank = new Map(currentOrder.map((row,index) => [row.u,index+1]));
  const marketOrder = market.slice().sort((a,b) => a.odds-b.odds || a.u-b.u);
  const marketRank = new Map(marketOrder.map((row,index) => [row.u,index+1]));
  const additiveScores = runners.map(row => cloudStandardizedScore(row.raw, UMAREN_ADDITIVE));
  const inverseTotal = market.reduce((sum,row) => sum + 1/row.odds,0);
  const offsetScores = runners.map(row => Math.log(Math.max((1/oddsByUma.get(row.u))/inverseTotal,1e-9)) + cloudStandardizedScore(row.raw, UMAREN_OFFSET));
  const pAdditive = cloudSoftmax(additiveScores), pOffset = cloudSoftmax(offsetScores);
  if (!pAdditive || !pOffset) return { ok:false, reason:'PROBABILITY_FAILURE', rows:[], candidate:null };
  const exactEv = new Map();
  const rows = runners.map((row,index) => {
    const probability=(pAdditive[index]+pOffset[index])/2, odds=oddsByUma.get(row.u), ev=probability*odds-1;
    exactEv.set(row.u,ev);
    let reason=null;
    if (!(odds >= UMAREN_AXIS_RULE.oddsMin && odds < UMAREN_AXIS_RULE.oddsMax)) reason='ODDS_OUT_OF_BAND';
    else if (marketRank.get(row.u) < UMAREN_AXIS_RULE.marketRankMin) reason='TOO_POPULAR';
    else if (currentRank.get(row.u) > UMAREN_AXIS_RULE.currentRankMax) reason='ABILITY_RANK_TOO_LOW';
    else if (row.vnextRank > UMAREN_AXIS_RULE.vnextRankMax) reason='VNEXT_RANK_TOO_LOW';
    else if (ev < UMAREN_AXIS_RULE.evMin) reason='EV_BELOW_THRESHOLD';
    return { u:row.u, name:row.name, odds:cloudRound8(odds), probability:cloudRound8(probability),
      pAdditive:cloudRound8(pAdditive[index]), pOffset:cloudRound8(pOffset[index]), ev:cloudRound8(ev),
      marketRank:marketRank.get(row.u), currentRank:currentRank.get(row.u), vnextRank:row.vnextRank,
      eligible:reason == null, reason };
  });
  const eligible=rows.filter(row => row.eligible).sort((a,b) => exactEv.get(b.u)-exactEv.get(a.u) || a.u-b.u);
  const candidate=eligible[0] || null;
  rows.forEach(row => { if (row.eligible && row !== candidate) row.reason='NOT_MAX_EV'; });
  return { ok:true, reason:candidate ? 'AXIS_SELECTED' : 'NO_AXIS', rows, candidate, runnerSet,
    modelId:UMAREN_MODEL_ID, modelFingerprint:UMAREN_MODEL_FINGERPRINT };
}

function cloudComboKey(first, second) { return [cloudUma(first),cloudUma(second)].sort((a,b) => a-b).join('-'); }
function scoreCloudUmarenPairs(axisSnapshot, input, pairRows) {
  if (!validCloudInput(input)) return { ok:false, reason:'INVALID_CLOUD_INPUT', trigger:false, tickets:[] };
  if (!axisSnapshot?.selected || !Array.isArray(axisSnapshot.rows)) return { ok:false, reason:'NO_T10_AXIS', trigger:false, tickets:[] };
  const currentSet=input.runners.map(row => cloudUma(row.u)).filter(Boolean).sort((a,b) => a-b);
  if (!cloudSameSet(currentSet,(axisSnapshot.runnerSet || []).slice().sort((a,b) => a-b))) return { ok:false, reason:'RUNNER_UNIVERSE_MISMATCH', trigger:false, tickets:[] };
  const board=new Map();
  for (const row of Array.isArray(pairRows) ? pairRows : []) {
    const first=cloudUma(row?.first ?? row?.combo?.[0]), second=cloudUma(row?.second ?? row?.combo?.[1]), odds=cloudFinite(row?.odds);
    if (!first || !second || first === second || odds == null || odds <= 0) return { ok:false, reason:'INVALID_T5_PAIR_MARKET', trigger:false, tickets:[] };
    const key=cloudComboKey(first,second); if (board.has(key)) return { ok:false, reason:'DUPLICATE_T5_PAIR', trigger:false, tickets:[] };
    board.set(key,{ first:Math.min(first,second), second:Math.max(first,second), odds });
  }
  const expected=[];
  for (let left=0;left<currentSet.length;left++) for (let right=left+1;right<currentSet.length;right++) expected.push(cloudComboKey(currentSet[left],currentSet[right]));
  if (board.size !== expected.length || expected.some(key => !board.has(key))) return { ok:false, reason:'INCOMPLETE_T5_PAIR_MARKET', trigger:false, tickets:[] };
  const probabilityByUma=new Map(axisSnapshot.rows.map(row => [cloudUma(row.u),cloudFinite(row.probability)]));
  if (currentSet.some(value => probabilityByUma.get(value) == null)) return { ok:false, reason:'INCOMPLETE_AXIS_PROBABILITIES', trigger:false, tickets:[] };
  const rawPair=new Map();
  for (const key of expected) { const [first,second]=key.split('-').map(Number),p1=probabilityByUma.get(first),p2=probabilityByUma.get(second); rawPair.set(key,(p1*p2/(1-p1))+(p2*p1/(1-p2))); }
  const rawTotal=[...rawPair.values()].reduce((sum,value) => sum+value,0);
  const powered=new Map([...rawPair].map(([key,value]) => [key,Math.pow(value/rawTotal,UMAREN_PAIR_RULE.calibrationAlpha)]));
  const poweredTotal=[...powered.values()].reduce((sum,value) => sum+value,0);
  const inverseTotal=[...board.values()].reduce((sum,row) => sum+1/row.odds,0), axis=cloudUma(axisSnapshot.selected), choices=[];
  for (const value of currentSet) {
    if (value === axis) continue;
    const key=cloudComboKey(axis,value), market=board.get(key), probability=powered.get(key)/poweredTotal;
    const marketProbability=(1/market.odds)/inverseTotal, ev=probability*market.odds-1, gap=probability/marketProbability;
    choices.push({ combo:[market.first,market.second], partner:value, odds:cloudRound8(market.odds), probability:cloudRound8(probability),
      marketProbability:cloudRound8(marketProbability), ev:cloudRound8(ev), gapRatio:cloudRound8(gap),
      eligible:market.odds <= UMAREN_PAIR_RULE.oddsMax && ev >= UMAREN_PAIR_RULE.evMin && gap >= UMAREN_PAIR_RULE.gapMin });
  }
  choices.sort((a,b) => b.ev-a.ev || b.gapRatio-a.gapRatio || a.partner-b.partner);
  const triggerChoice=choices.find(row => row.eligible) || null;
  const currentOrder=input.runners.map(row => ({ u:cloudUma(row.u), score:cloudFinite(row.totalScore), name:String(row.name || '') }))
    .filter(row => row.u !== axis).sort((a,b) => b.score-a.score || a.u-b.u).slice(0,UMAREN_PAIR_RULE.currentPartnerCount);
  const tickets=currentOrder.map(row => { const market=board.get(cloudComboKey(axis,row.u)); return { combo:[market.first,market.second], partner:row.u,
    partnerName:row.name, odds:cloudRound8(market.odds), referenceStakeYen:UMAREN_REFERENCE.perTicketYen }; });
  return { ok:true, reason:triggerChoice ? 'DISTORTION_TRIGGER' : 'NO_DISTORTION', trigger:!!triggerChoice, axis, choices,
    triggerChoice, partners:currentOrder.map(row => row.u), tickets:triggerChoice ? tickets : [],
    referenceBudgetYen:triggerChoice ? UMAREN_REFERENCE.raceYen : 0, modelId:UMAREN_MODEL_ID, modelFingerprint:UMAREN_MODEL_FINGERPRINT };
}

function jstNow() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return {
    dateStr: j.getUTCFullYear() + '/' + String(j.getUTCMonth() + 1).padStart(2, '0') + '/' + String(j.getUTCDate()).padStart(2, '0'),
    minutes: j.getUTCHours() * 60 + j.getUTCMinutes(),
  };
}

/* Parse OddsTanFuku HTML with regex (no DOMParser in Workers). */
function parseOddsHtml(html) {
  if (!html || html.indexOf('odd_popular_table_02') < 0) return null; // not on sale / no race
  const postM = html.match(/(\d{1,2}):(\d{2})\s*\u767a\u8d70/); // u767a u8d70 = hassou (post time)
  const postMinutes = postM ? (parseInt(postM[1]) * 60 + parseInt(postM[2])) : null;
  const postTime = postM ? postM[1] + ':' + postM[2] : null;

  const tbodyM = html.match(/odd_popular_table_02[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  const body = tbodyM ? tbodyM[1] : html;
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let tr;
  while ((tr = trRe.exec(body)) !== null) {
    const tds = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      tds.push(td[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
    if (tds.length < 4) continue;
    const uma = parseInt(tds[1]);
    const odds = parseFloat(tds[3]);
    const fukuLow = parseFloat((tds[4] || '').replace(/[^0-9.]/g, ''));
    if (isNaN(uma) || uma < 1 || uma > 20) continue;
    rows.push({ uma, odds: (!isNaN(odds) && odds > 0) ? odds : null, fukuLow: isNaN(fukuLow) ? null : fukuLow });
  }
  if (!rows.length) return null;
  return { postMinutes, postTime, rows };
}

/* Parse the official quinella board. Every possible pair must be present. */
function parseUmarenHtml(html, runners) {
  const expectedRunners = [...new Set((runners || []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 20))].sort((a,b) => a-b);
  if (expectedRunners.length < 2) return { ok:false, status:'RUNNER_SET_INVALID', rows:[] };
  const tables = String(html || '').match(/<table\b[^>]*class=["'][^"']*odd_ranking_table[^"']*["'][^>]*>[\s\S]*?<\/table>/gi) || [];
  const body = tables.length ? tables.join('') : String(html || '');
  const pairs = new Map();
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(body)) !== null) {
    const cells = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell;
    while ((cell = cellRe.exec(tr[1])) !== null) cells.push(decodeHtmlText(cell[1]));
    if (cells.length < 2) continue;
    const match = cells[0].match(/^(\d{1,2})\s*[-\u2010-\u2015\u2212\u30fb]\s*(\d{1,2})$/);
    const odds = Number(String(cells[1]).replace(/,/g, ''));
    if (!match || !Number.isFinite(odds) || odds <= 0) continue;
    const first = Number(match[1]), second = Number(match[2]);
    const low = Math.min(first, second), high = Math.max(first, second);
    const key = `${low}-${high}`;
    if (low === high || pairs.has(key)) return { ok:false, status:'PAIR_DUPLICATE', rows:[] };
    pairs.set(key, { first:low, second:high, odds });
  }
  const expected = [];
  for (let left = 0; left < expectedRunners.length; left++) {
    for (let right = left + 1; right < expectedRunners.length; right++) {
      expected.push(`${expectedRunners[left]}-${expectedRunners[right]}`);
    }
  }
  if (pairs.size !== expected.length || expected.some(key => !pairs.has(key))) {
    return { ok:false, status:'PAIR_SET_INCOMPLETE', rows:[], found:pairs.size, expected:expected.length };
  }
  return { ok:true, status:'CAPTURED', rows:[...pairs.values()].sort((a,b) => a.first-b.first || a.second-b.second) };
}

/* Collect only the exact T10/T5 Kochi checkpoints and bulk insert to Supabase. */
async function captureKochiOdds(env, runId) {
  const now = jstNow();
  const dateStr = now.dateStr, nowMin = now.minutes;
  const snapshots = [];
  const races = [];
  for (let rno = 1; rno <= 12; rno++) {
    let html, upstreamStatus = 0;
    try {
      const res = await fetch(
        'https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/OddsTanFuku?k_raceDate=' + encodeURIComponent(dateStr) + '&k_raceNo=' + rno + '&k_babaCode=' + BABA,
        { headers: { 'User-Agent': UA } }
      );
      upstreamStatus = res.status;
      if (!res.ok) {
        races.push({ race_no:rno, status:'HTTP_ERROR', upstream_status:res.status });
        continue;
      }
      html = await res.text();
    } catch (e) {
      races.push({ race_no:rno, status:'FETCH_ERROR', error:String(e && e.message || e).slice(0,160) });
      continue;
    }

    const parsed = parseOddsHtml(html);
    if (!parsed) {
      const looksLikeRacePage = /KeibaWeb|地方競馬|OddsTanFuku/i.test(html || '');
      races.push({ race_no:rno, status:looksLikeRacePage ? 'NOT_ON_SALE_OR_NO_RACE' : 'PARSE_ERROR', upstream_status:upstreamStatus });
      continue;
    }
    if (parsed.postMinutes == null) {
      races.push({ race_no:rno, status:'POST_TIME_MISSING', upstream_status:upstreamStatus, runners:parsed.rows.length });
      continue;
    }
    const mtp = parsed.postMinutes - nowMin; // minutes to post
    if (!CAPTURE_MINUTES.has(mtp)) {
      races.push({ race_no:rno, status:'OUTSIDE_CHECKPOINT', upstream_status:upstreamStatus, minutes_to_post:mtp, runners:parsed.rows.length });
      continue;
    }
    const rawSha256 = await sha256Hex(html);
    const raceAudit = { race_no:rno, status:'CAPTURED', upstream_status:upstreamStatus, minutes_to_post:mtp,
      post_time:parsed.postTime, runners:parsed.rows.length, raw_sha256:rawSha256 };
    races.push(raceAudit);

    const byOdds = parsed.rows.filter(r => r.odds != null).slice().sort((a, b) => a.odds - b.odds);
    const ninkiMap = {};
    byOdds.forEach((r, i) => { ninkiMap[r.uma] = i + 1; });
    raceAudit.market_rows = parsed.rows.map(r => ({
      u:r.uma, odds:r.odds, fuku_low:r.fukuLow, ninki:ninkiMap[r.uma] || null,
    }));

    if (mtp === 5) {
      let pairHtml = '', pairStatus = 0;
      try {
        const pairRes = await fetch(
          'https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/OddsUmLenFuku?k_raceDate=' + encodeURIComponent(dateStr) + '&k_raceNo=' + rno + '&k_babaCode=' + BABA,
          { headers:{ 'User-Agent':UA } }
        );
        pairStatus = pairRes.status;
        if (!pairRes.ok) {
          raceAudit.pair_status = 'HTTP_ERROR';
          raceAudit.pair_upstream_status = pairRes.status;
        } else {
          pairHtml = await pairRes.text();
          const pair = parseUmarenHtml(pairHtml, parsed.rows.map(row => row.uma));
          raceAudit.pair_status = pair.status;
          raceAudit.pair_upstream_status = pairRes.status;
          raceAudit.pair_rows = pair.rows;
          raceAudit.pair_count = pair.rows.length;
          raceAudit.pair_expected = pair.expected || pair.rows.length;
          raceAudit.pair_raw_sha256 = await sha256Hex(pairHtml);
        }
      } catch (e) {
        raceAudit.pair_status = 'FETCH_ERROR';
        raceAudit.pair_upstream_status = pairStatus;
        raceAudit.pair_error = String(e && e.message || e).slice(0,160);
      }
    }

    for (const r of parsed.rows) {
      snapshots.push({
        race_date: dateStr, race_no: rno, uma_ban: r.uma, baba_code:BABA,
        odds: r.odds, fuku_low: r.fukuLow, ninki: ninkiMap[r.uma] || null,
        minutes_to_post: mtp, post_time: parsed.postTime,
        capture_run_id:runId, source_transport:'first_party_worker', raw_sha256:rawSha256,
        snapshot_key:`${BABA}|${dateStr}|${rno}|${r.uma}|${mtp}`,
      });
    }
  }

  if (!snapshots.length) {
    const hardErrors = races.filter(r => ['HTTP_ERROR','FETCH_ERROR','PARSE_ERROR'].includes(r.status));
    return { captured:0, ok:hardErrors.length === 0, reason:hardErrors.length ? 'capture_errors' : 'outside_checkpoint_or_no_race', date:dateStr, races };
  }

  const res = await fetch(SUPABASE_URL + '/rest/v1/keiba_odds_snapshots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(snapshots),
  });
  const error = res.ok ? '' : (await res.text()).slice(0, 300);
  const pairErrors = races.filter(r => r.status === 'CAPTURED' && r.minutes_to_post === 5 && r.pair_status !== 'CAPTURED');
  return { captured:snapshots.length, capturedRaces:races.filter(r => r.status === 'CAPTURED').length,
    attemptedRaces:races.length, ok:res.ok && pairErrors.length === 0, status:res.status, error,
    pairErrors:pairErrors.length, date:dateStr, races };
}

async function recordMarketCheckpoints(env, captureResult) {
  const date = String(captureResult.date || '');
  const ymd = date.replace(/\D/g, '');
  const capturedAt = new Date().toISOString();
  const rows = (captureResult.races || []).filter(r => r.status === 'CAPTURED' && CAPTURE_MINUTES.has(r.minutes_to_post))
    .map(r => ({
      id:`market_${r.minutes_to_post === 10 ? 't10' : 't5'}_31_${ymd}_${String(r.race_no).padStart(2,'0')}`,
      baba_code:BABA, race_date:date, race_no:r.race_no,
      phase:r.minutes_to_post === 10 ? 't10' : 't5', captured_at:capturedAt,
      scheduled_post_at:r.post_time ? `${date.replace(/\//g,'-')}T${r.post_time}:00+09:00` : null,
      source_transport:'first_party_worker', single_raw_sha256:r.raw_sha256 || '',
      pair_raw_sha256:r.pair_raw_sha256 || '', runner_count:r.runners || null,
      pair_count:Array.isArray(r.pair_rows) ? r.pair_rows.length : 0,
      status:r.minutes_to_post === 5 ? (r.pair_status === 'CAPTURED' ? 'complete' : 'partial') : 'complete',
      payload:{ schema:'kochi_market_checkpoint/v1', capture_run_id:captureResult.runId || '',
        minutesBeforeStart:r.minutes_to_post,
        single:{ source:'first_party_worker:keiba.go.jp/OddsTanFuku', rows:r.market_rows || [] },
        umaren:r.minutes_to_post === 5 ? { source:'first_party_worker:keiba.go.jp/OddsUmLenFuku',
          status:r.pair_status || 'NOT_CAPTURED', rows:r.pair_rows || [], expected:r.pair_expected || 0 } : null },
    }));
  if (!rows.length) return { rows:0 };
  const res = await fetch(SUPABASE_URL + '/rest/v1/keiba_market_checkpoints', {
    method:'POST', headers:{
      'Content-Type':'application/json', 'apikey':env.SUPABASE_SERVICE_KEY,
      'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Prefer':'resolution=ignore-duplicates,return=minimal',
    }, body:JSON.stringify(rows),
  });
  if (!res.ok) throw new Error('market checkpoint save failed: ' + res.status + ' ' + (await res.text()).slice(0,200));
  return { rows:rows.length, complete:rows.filter(row => row.status === 'complete').length };
}

async function recordCaptureRun(env, row) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/keiba_capture_runs', {
    method:'POST',
    headers:{
      'Content-Type':'application/json', 'apikey':env.SUPABASE_SERVICE_KEY,
      'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Prefer':'resolution=merge-duplicates,return=minimal',
    },
    body:JSON.stringify(row),
  });
  if (!res.ok) throw new Error('capture run audit save failed: ' + res.status + ' ' + (await res.text()).slice(0,200));
}

/* Record the T10 denominator even when no administrator browser is open.
 * A later browser-side model snapshot upserts the same id from
 * model_unavailable to saved/no_bet. ignore-duplicates prevents this capture
 * audit from overwriting a model decision that arrived first. */
async function recordT10Coverage(env, captureResult) {
  const date = String(captureResult.date || '');
  const ymd = date.replace(/\D/g, '');
  const rows = (captureResult.races || []).filter(r => r.status === 'CAPTURED' && r.minutes_to_post === 10)
    .map(r => ({
      id:`t10_31_${ymd}_${String(r.race_no).padStart(2,'0')}`,
      baba_code:'31', race_date:date, race_no:r.race_no,
      scheduled_post_at:r.post_time ? `${date.replace(/\//g,'-')}T${r.post_time}:00+09:00` : null,
      status:'model_unavailable', transport:'first_party_worker', upstream_status:r.upstream_status,
      raw_sha256:r.raw_sha256 || '', runner_count:r.runners || null,
      payload:{ schema:'kochi_t10_decision_ledger/v1', capturePolicy:'server-denominator',
        capture:{ status:'odds_saved_at_t10', minutesBeforeStart:r.minutes_to_post,
          market:{ source:'first_party_worker:keiba.go.jp/OddsTanFuku', rows:r.market_rows || [] } },
        components:{
          ability:{ status:'model_unavailable', reason:'ADMIN_VIEWER_NOT_CAPTURED' },
          longshot:{ status:'model_unavailable', reason:'ADMIN_VIEWER_NOT_CAPTURED' },
          opponent:{ status:'model_unavailable', reason:'ADMIN_VIEWER_NOT_CAPTURED' },
          value:{ status:'model_unavailable', reason:'ADMIN_VIEWER_NOT_CAPTURED' },
        } },
    }));
  if (!rows.length) return { rows:0 };
  const res = await fetch(SUPABASE_URL + '/rest/v1/keiba_value_t10_ledger', {
    method:'POST', headers:{
      'Content-Type':'application/json', 'apikey':env.SUPABASE_SERVICE_KEY,
      'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Prefer':'resolution=ignore-duplicates,return=minimal',
    }, body:JSON.stringify(rows),
  });
  if (!res.ok) throw new Error('T10 coverage save failed: ' + res.status + ' ' + (await res.text()).slice(0,200));
  return { rows:rows.length };
}

async function supabaseServiceGet(env, path) {
  const response = await fetch(SUPABASE_URL + path, { headers:{
    'apikey':env.SUPABASE_SERVICE_KEY, 'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY,
  }});
  if (!response.ok) throw new Error('Supabase read failed: ' + response.status + ' ' + (await response.text()).slice(0,200));
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

function cloudStableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(cloudStableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + cloudStableStringify(value[key])).join(',') + '}';
}

function cloudFingerprint(value) {
  const text=typeof value === 'string' ? value : cloudStableStringify(value);
  let hash=0xcbf29ce484222325n;
  for (let i=0;i<text.length;i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64,hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16,'0');
}

function cloudRunnerSignature(race, horses) {
  const runners=horses.map(row => [
    Number.parseInt(row.uma_ban,10) || null, String(row.horse_name || ''), String(row.jockey || ''),
    String(row.trainer || ''), String(row.kinryo || ''), String(row.weight || ''), String(row.sex_age || ''),
  ]).sort((a,b) => (a[0] || 0) - (b[0] || 0));
  return cloudFingerprint({
    distance:String(race?.distance || ''), trackCond:String(race?.track_cond || ''),
    raceClass:String(race?.race_class || ''), runners,
  });
}

async function cloudPrecomputeNeed(env, date) {
  const horses = await supabaseServiceGet(env, '/rest/v1/keiba_horses?select=race_no,uma_ban,chakujun,horse_name,jockey,trainer,kinryo,weight,sex_age' +
    '&baba_code=eq.31&race_date=eq.' + encodeURIComponent(date) + '&order=race_no.asc,uma_ban.asc&limit=500');
  const races = await supabaseServiceGet(env, '/rest/v1/keiba_races?select=race_no,distance,track_cond,race_class' +
    '&baba_code=eq.31&race_date=eq.' + encodeURIComponent(date) + '&order=race_no.asc&limit=24');
  const raceByNo=new Map(races.map(row => [Number(row.race_no),row]));
  const byRace = new Map();
  for (const row of horses) {
    const raceNo=Number(row.race_no); if (!Number.isInteger(raceNo)) continue;
    if (!byRace.has(raceNo)) byRace.set(raceNo,[]);
    byRace.get(raceNo).push(row);
  }
  const eligible = [...byRace].filter(([,rows]) => rows.length >= 4 && !rows.some(row => /^\d+$/.test(String(row.chakujun || ''))));
  if (!eligible.length) return { needed:false, reason:'no_prestart_races', eligible:0 };

  const predictions = await supabaseServiceGet(env, '/rest/v1/keiba_ai_predictions?select=race_no,runner_signature,payload' +
    '&baba_code=eq.31&race_date=eq.' + encodeURIComponent(date) + '&order=computed_at.desc&limit=48');
  const fresh = new Set();
  for (const [raceNo,rows] of eligible) {
    const prediction=predictions.find(row => Number(row.race_no) === raceNo && validCloudInput(row?.payload?.umarenCloudInput));
    const signature=cloudRunnerSignature(raceByNo.get(raceNo),rows);
    if (prediction && prediction.runner_signature === signature) fresh.add(raceNo);
  }

  const ymd=date.replace(/\D/g,''), auditId=`precompute_31_${ymd}`;
  const audit=await supabaseServiceGet(env, '/rest/v1/keiba_capture_runs?select=status,finished_at,release_sha,details&id=eq.' + auditId + '&limit=1');
  const currentRelease=String(env.RELEASE_SHA || '');
  if (fresh.size === eligible.length && audit[0]?.status === 'success' &&
      (!currentRelease || String(audit[0]?.release_sha || '') === currentRelease)) {
    return { needed:false, reason:'fresh_inputs_available', eligible:eligible.length, fresh:fresh.size, auditId };
  }
  const lastMs=Date.parse(audit[0]?.finished_at || '');
  if (Number.isFinite(lastMs) && Date.now()-lastMs < CLOUD_PRECOMPUTE_RETRY_MS) {
    return { needed:false, reason:'retry_cooldown', eligible:eligible.length, fresh:fresh.size, auditId };
  }
  return { needed:true, reason:'missing_or_stale_inputs', eligible:eligible.length, fresh:fresh.size, auditId };
}

async function runCloudBrowserPrecompute(env, date) {
  if (!env.BROWSER || !env.ADMIN_WRITE_TOKEN || !env.SUPABASE_SERVICE_KEY) {
    return { attempted:false, reason:'browser_or_secret_unavailable' };
  }
  const need=await cloudPrecomputeNeed(env,date);
  if (!need.needed) return { attempted:false, ...need };
  const startedAt=new Date().toISOString();
  const auditBase={ id:need.auditId, started_at:startedAt, finished_at:startedAt, capture_date:date,
    baba_code:BABA, expected_races:need.eligible, attempted_races:0, captured_races:0, captured_rows:0,
    status:'failed', release_sha:env.RELEASE_SHA || '' };
  // Reserve the once-per-hour attempt before launching so overlapping cron
  // invocations cannot consume multiple browser sessions.
  await recordCaptureRun(env,{ ...auditBase, details:{ schema:'kochi_cloud_precompute_audit/v1', state:'running', need } });
  let browser=null;
  try {
    browser=await puppeteer.launch(env.BROWSER);
    const page=await browser.newPage();
    if (typeof page.emulateTimezone === 'function') await page.emulateTimezone('Asia/Tokyo');
    await page.evaluateOnNewDocument(token => {
      sessionStorage.setItem('kv_write_token', token);
      localStorage.removeItem('kv_write_token');
    }, env.ADMIN_WRITE_TOKEN);
    const target=CLOUD_PRECOMPUTE_URL + '?sim=1&date=' + encodeURIComponent(date) + '&cloud-precompute=1';
    await page.goto(target,{ waitUntil:'domcontentloaded', timeout:120000 });
    await page.waitForFunction(() => typeof window._ensureAiInsightsModule === 'function',{ timeout:60000 });
    await page.evaluate(() => window._ensureAiInsightsModule());
    await page.waitForFunction(() => typeof window.kvAiCloudPrecomputeDay === 'function',{ timeout:60000 });
    const result=await page.evaluate(wanted => window.kvAiCloudPrecomputeDay(wanted),date);
    const ok=!!result?.ok;
    const finishedAt=new Date().toISOString();
    await recordCaptureRun(env,{ ...auditBase, finished_at:finishedAt,
      attempted_races:Number(result?.eligible || 0), captured_races:Number(result?.published || 0),
      captured_rows:Number(result?.published || 0), status:ok ? 'success' : 'failed',
      details:{ schema:'kochi_cloud_precompute_audit/v1', state:ok ? 'complete' : 'incomplete', need, result } });
    return { attempted:true, ok, need, result };
  } catch (error) {
    const message=String(error?.message || error).slice(0,300), finishedAt=new Date().toISOString();
    await recordCaptureRun(env,{ ...auditBase, finished_at:finishedAt, status:'failed',
      details:{ schema:'kochi_cloud_precompute_audit/v1', state:'failed', need, error:message } }).catch(() => {});
    return { attempted:true, ok:false, need, error:message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function loadCloudInputs(env, date) {
  const rows = await supabaseServiceGet(env, '/rest/v1/keiba_ai_predictions?select=race_no,computed_at,payload' +
    '&baba_code=eq.31&race_date=eq.' + encodeURIComponent(date) + '&order=computed_at.desc&limit=48');
  const byRace = new Map();
  for (const row of rows) {
    const raceNo = Number(row.race_no), input = row?.payload?.umarenCloudInput;
    if (!Number.isInteger(raceNo) || byRace.has(raceNo) || !validCloudInput(input) || Number(input.raceNo) !== raceNo) continue;
    byRace.set(raceNo, input);
  }
  return byRace;
}

async function loadT10CloudSnapshots(env, date) {
  const rows = await supabaseServiceGet(env, '/rest/v1/keiba_value_t10_ledger?select=race_no,payload' +
    '&baba_code=eq.31&race_date=eq.' + encodeURIComponent(date) + '&id=like.umaren_t10_31_*&limit=24');
  const byRace = new Map();
  for (const row of rows) {
    const raceNo = Number(row.race_no), payload = row?.payload;
    if (Number.isInteger(raceNo) && payload?.schema === 'kochi_umaren_distortion_t10/v1' && payload.babaCode === BABA) byRace.set(raceNo,payload);
  }
  return byRace;
}

async function writeInferenceRows(env, rows) {
  if (!rows.length) return;
  const response = await fetch(SUPABASE_URL + '/rest/v1/keiba_value_t10_ledger', {
    method:'POST', headers:{ 'Content-Type':'application/json', 'apikey':env.SUPABASE_SERVICE_KEY,
      'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Prefer':'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify(rows),
  });
  if (!response.ok) throw new Error('cloud inference save failed: ' + response.status + ' ' + (await response.text()).slice(0,200));
}

async function runCloudUmarenInference(env, captureResult) {
  const date = String(captureResult.date || ''), ymd = date.replace(/\D/g,''), capturedAt = new Date().toISOString();
  const checkpoints = (captureResult.races || []).filter(row => row.status === 'CAPTURED' && CAPTURE_MINUTES.has(row.minutes_to_post));
  if (!checkpoints.length) return { attempted:0, saved:0, unavailable:0, failed:0, reasons:{} };
  const inputs = await loadCloudInputs(env,date), rows=[], reasons={};
  let unavailable=0, failed=0;
  if (checkpoints[0].minutes_to_post === 10) {
    for (const race of checkpoints) {
      const input=inputs.get(race.race_no);
      if (!input) { unavailable++; reasons.NO_CLOUD_INPUT=(reasons.NO_CLOUD_INPUT || 0)+1; continue; }
      const result=scoreCloudUmarenAxis(input,race.market_rows || []);
      if (!result.ok) { failed++; reasons[result.reason]=(reasons[result.reason] || 0)+1; continue; }
      const snapshot={ type:'umarenDistortionT10', schema:'kochi_umaren_distortion_t10/v1', status:'forward_shadow_only',
        execution:'cloud_worker', babaCode:BABA, raceDate:date, raceNo:race.race_no, capturedAt,
        scheduledStartAt:race.post_time ? `${date.replace(/\//g,'-')}T${race.post_time}:00+09:00` : null,
        minutesBeforeStart:10, market:{ source:'first_party_worker:keiba.go.jp/OddsTanFuku', observedAt:capturedAt, rows:race.market_rows || [] },
        runnerSet:result.runnerSet, model:{ id:UMAREN_MODEL_ID, fingerprint:UMAREN_MODEL_FINGERPRINT, axisRule:UMAREN_AXIS_RULE },
        rows:result.rows, selected:result.candidate?.u ?? null, selectionReason:result.reason,
        inputFingerprint:`${UMAREN_MODEL_FINGERPRINT}:${race.raw_sha256 || ''}` };
      rows.push({ id:`umaren_t10_31_${ymd}_${String(race.race_no).padStart(2,'0')}`, baba_code:BABA, race_date:date,
        race_no:race.race_no, scheduled_post_at:snapshot.scheduledStartAt, status:snapshot.selected ? 'axis' : 'no_axis',
        transport:'first_party_worker', raw_sha256:race.raw_sha256 || '', runner_count:snapshot.runnerSet.length,
        model_fingerprint:UMAREN_MODEL_FINGERPRINT, payload:snapshot });
    }
  } else {
    const t10ByRace=await loadT10CloudSnapshots(env,date);
    for (const race of checkpoints) {
      const input=inputs.get(race.race_no), t10=t10ByRace.get(race.race_no);
      if (!input) { unavailable++; reasons.NO_CLOUD_INPUT=(reasons.NO_CLOUD_INPUT || 0)+1; continue; }
      if (!t10) { unavailable++; reasons.NO_T10_SNAPSHOT=(reasons.NO_T10_SNAPSHOT || 0)+1; continue; }
      if (!t10.selected) { reasons.NO_T10_AXIS=(reasons.NO_T10_AXIS || 0)+1; continue; }
      const result=scoreCloudUmarenPairs(t10,input,race.pair_rows || []);
      if (!result.ok) { failed++; reasons[result.reason]=(reasons[result.reason] || 0)+1; continue; }
      const snapshot={ type:'umarenDistortionT5', schema:'kochi_umaren_distortion_t5/v1', status:'forward_shadow_only',
        execution:'cloud_worker', babaCode:BABA, raceDate:date, raceNo:race.race_no, capturedAt,
        scheduledStartAt:race.post_time ? `${date.replace(/\//g,'-')}T${race.post_time}:00+09:00` : null,
        minutesBeforeStart:5, market:{ source:'first_party_worker:keiba.go.jp/OddsUmLenFuku', observedAt:capturedAt, rows:race.pair_rows || [] },
        runnerSet:t10.runnerSet, model:{ id:UMAREN_MODEL_ID, fingerprint:UMAREN_MODEL_FINGERPRINT,
          pairRule:UMAREN_PAIR_RULE, referenceBudget:UMAREN_REFERENCE }, axis:t10.selected,
        axisRow:t10.rows.find(row => row.u === t10.selected) || null, trigger:result.trigger,
        triggerChoice:result.triggerChoice, tickets:result.tickets, choices:result.choices,
        referenceBudgetYen:result.referenceBudgetYen, selectionReason:result.reason,
        t10InputFingerprint:t10.inputFingerprint,
        inputFingerprint:`${t10.inputFingerprint}:${race.pair_raw_sha256 || ''}` };
      rows.push({ id:`umaren_t5_31_${ymd}_${String(race.race_no).padStart(2,'0')}`, baba_code:BABA, race_date:date,
        race_no:race.race_no, scheduled_post_at:snapshot.scheduledStartAt, status:snapshot.trigger ? 'trigger' : 'no_bet',
        transport:'first_party_worker', raw_sha256:race.pair_raw_sha256 || '', runner_count:snapshot.runnerSet.length,
        model_fingerprint:UMAREN_MODEL_FINGERPRINT, payload:snapshot });
    }
  }
  await writeInferenceRows(env,rows);
  return { attempted:checkpoints.length, saved:rows.length, unavailable, failed, reasons };
}

async function runCapture(env) {
  const startedAt = new Date().toISOString();
  const runBase = startedAt.replace(/[^0-9]/g, '').slice(0,17);
  const kochiRunId = `31_${runBase}`;
  const dateForPrecompute=jstNow().dateStr;
  const precomputeJob=runCloudBrowserPrecompute(env,dateForPrecompute).catch(error => ({ attempted:true, ok:false, error:String(error?.message || error).slice(0,300) }));
  const kochi = await captureKochiOdds(env, kochiRunId);
  kochi.runId = kochiRunId;
  const marketCheckpoints = await recordMarketCheckpoints(env, kochi);
  const t10Coverage = await recordT10Coverage(env, kochi);
  const cloudInference = await runCloudUmarenInference(env, kochi);
  const cloudPrecompute = await precomputeJob;
  const finishedAt = new Date().toISOString();
  const failed = kochi.ok === false;
  const shouldAudit = failed || kochi.captured > 0 || jstNow().minutes % 5 === 0;
  if (shouldAudit) {
    await recordCaptureRun(env, {
      id:kochiRunId, started_at:startedAt, finished_at:finishedAt, capture_date:kochi.date,
      baba_code:BABA, expected_races:12, attempted_races:kochi.attemptedRaces || (kochi.races || []).length,
      captured_races:kochi.capturedRaces || 0, captured_rows:kochi.captured || 0,
      status:failed ? 'failed' : 'success', details:kochi, release_sha:env.RELEASE_SHA || '',
    });
  }
  if (failed) throw new Error('Kochi odds capture failed');
  return { kochi, marketCheckpoints, t10Coverage, cloudInference, cloudPrecompute, audited:shouldAudit,
    received_at:finishedAt, release_sha:env.RELEASE_SHA || '' };
}

export { scoreCloudUmarenAxis, scoreCloudUmarenPairs, runCloudUmarenInference, runCloudBrowserPrecompute, cloudRunnerSignature };

export default {
  // cron: Kochi odds snapshots only. Monbetsu/Ooi are owned by the other-track project.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCapture(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok:true, service:'kochi-capture', release_sha:env.RELEASE_SHA || '' }),
        { status:200, headers:Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},CORS_ANY) });
    }

    // Shared, narrow official-history cache for the JRA transfer shadow.
    if (request.method === 'GET' && url.pathname === '/horse-history') {
      const lineage = String(url.searchParams.get('lineage') || '');
      const horseName = String(url.searchParams.get('horse') || '');
      if (!/^\d{8,14}$/.test(lineage)) {
        return new Response(JSON.stringify({ ok:false, error:'invalid lineage' }), {
          status:400, headers:Object.assign({'Content-Type':'application/json'}, CORS_ANY),
        });
      }
      try {
        const result = await getSharedHorseHistory(env, lineage, horseName);
        return new Response(JSON.stringify(result), { status:200, headers:Object.assign({
          'Content-Type':'application/json', 'Cache-Control':'public, max-age=1800',
        }, CORS_ANY) });
      } catch (error) {
        return new Response(JSON.stringify({ ok:false, error:String(error && error.message || error) }), {
          status:502, headers:Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'}, CORS_ANY),
        });
      }
    }

    // Narrow first-party bridge for Kochi post-race comments. The caller can
    // supply only a validated race id; arbitrary keiba.or.jp URLs are never proxied.
    if (url.pathname === '/postrace-comment') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status:405, headers:CORS_ANY });
      const raceId = normalizePostraceCommentRaceId(url.searchParams.get('race'));
      if (!raceId) return new Response('Invalid race id', { status:400, headers:CORS_ANY });
      const officialUrl = 'https://www.keiba.or.jp/?postracecomment=' + raceId;
      try {
        const upstream = await fetch(officialUrl, {
          headers:{ 'User-Agent':UA, 'Accept':'text/html,application/xhtml+xml', 'Accept-Language':'ja,en-US;q=0.7,en;q=0.3' },
          redirect:'follow', signal:AbortSignal.timeout(12000),
        });
        const declaredSize = Number(upstream.headers.get('Content-Length') || 0);
        if (declaredSize > MAX_PROXY_BYTES) return new Response('Response too large', { status:413, headers:CORS_ANY });
        const body = await upstream.arrayBuffer();
        if (body.byteLength > MAX_PROXY_BYTES) return new Response('Response too large', { status:413, headers:CORS_ANY });
        return new Response(body, { status:upstream.status, headers:Object.assign({
          'Content-Type':upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'Cache-Control':upstream.ok ? 'public, max-age=60' : 'no-store',
        }, CORS_ANY) });
      } catch (_) {
        return new Response('Upstream error', { status:502, headers:CORS_ANY });
      }
    }

    // 1) HTML proxy (GET ?url=...), allow-listed hosts only, no token needed
    const target = url.searchParams.get('url');
    if (request.method === 'GET' && target) {
      let t;
      try { t = new URL(target); } catch (e) { return new Response('Bad url', { status: 400, headers: CORS_ANY }); }
      if (t.protocol !== 'https:' || !PROXY_HOSTS.has(t.hostname)) {
        return new Response('Host not allowed', { status: 403, headers: CORS_ANY });
      }
      if (!PROXY_PATHS.some(prefix => t.pathname.startsWith(prefix))) {
        return new Response('Path not allowed', { status: 403, headers: CORS_ANY });
      }
      try {
        const upstream = await fetch(t.toString(), { headers: { 'User-Agent': UA }, signal:AbortSignal.timeout(12000) });
        const declaredSize = Number(upstream.headers.get('Content-Length') || 0);
        if (declaredSize > MAX_PROXY_BYTES) return new Response('Response too large', { status:413, headers:CORS_ANY });
        const body = await upstream.arrayBuffer();
        if (body.byteLength > MAX_PROXY_BYTES) return new Response('Response too large', { status:413, headers:CORS_ANY });
        return new Response(body, {
          status: upstream.status,
          headers: Object.assign({ 'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, CORS_ANY),
        });
      } catch (e) {
        return new Response('Upstream error', { status: 502, headers: CORS_ANY });
      }
    }

    // 2) manual capture trigger. Token is sent in a header so it does not leak into access logs.
    if (url.pathname === '/capture') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status:405, headers:CORS_ANY });
      if (!captureToken(env) || bearer(request) !== captureToken(env)) {
        return new Response('Unauthorized', { status: 401, headers: CORS_ANY });
      }
      try {
        const result = await runCapture(env);
        return new Response(JSON.stringify(result), { status:200, headers:Object.assign({'Content-Type':'application/json'}, CORS_ANY) });
      } catch (error) {
        return new Response(JSON.stringify({ ok:false, error:String(error && error.message || error) }),
          { status:502, headers:Object.assign({'Content-Type':'application/json'}, CORS_ANY) });
      }
    }

    // 3) Supabase write proxy (unchanged behavior, X-Write-Token required)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsWrite(request) });
    }

    const token = request.headers.get('X-Write-Token');
    if (!adminToken(env) || !token || token !== adminToken(env)) {
      return new Response('Unauthorized', { status: 401, headers: corsWrite(request) });
    }

    if (request.method === 'GET' && url.pathname === '/auth/check') {
      return new Response(JSON.stringify({ ok:true, release_sha:env.RELEASE_SHA || '' }), {
        status:200, headers:Object.assign({'Content-Type':'application/json'}, corsWrite(request)),
      });
    }

    if (request.method === 'POST' && url.pathname === '/rpc/save-keiba-race-bundle') {
      const input = await request.json().catch(() => null);
      if (!input || !input.race_id || !Array.isArray(input.horses) || !Array.isArray(input.expected_uma_ban)) {
        return new Response('Invalid bundle', { status:400, headers:corsWrite(request) });
      }
      const rpcRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/save_keiba_race_bundle', {
        method:'POST', headers:{'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_KEY,
          'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY},
        body:JSON.stringify({p_race_id:input.race_id,p_race:input.race,p_horses:input.horses,p_expected_uma_ban:input.expected_uma_ban}),
      });
      return new Response(await rpcRes.arrayBuffer(), {
        status:rpcRes.status, headers:Object.assign({'Content-Type':'application/json'}, corsWrite(request)),
      });
    }

    // Delete one meeting day atomically.  Horse and race deletes either both
    // commit or both roll back inside Supabase.
    if (request.method === 'POST' && url.pathname === '/rpc/delete-keiba-day') {
      const input = await request.json().catch(() => null);
      if (!input || !/^\d{2}$/.test(String(input.baba_code || '')) ||
          !/^\d{4}\/\d{2}\/\d{2}$/.test(String(input.race_date || ''))) {
        return new Response('Invalid day', { status:400, headers:corsWrite(request) });
      }
      const rpcRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/delete_keiba_day', {
        method:'POST', headers:{'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_KEY,
          'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY},
        body:JSON.stringify({p_baba_code:String(input.baba_code),p_race_date:String(input.race_date)}),
      });
      return new Response(await rpcRes.arrayBuffer(), {
        status:rpcRes.status, headers:Object.assign({'Content-Type':'application/json'}, corsWrite(request)),
      });
    }

    // Idempotent race-level first-3F backfill. The database function updates
    // only blank rows, so a concurrent/manual value always wins.
    if (request.method === 'POST' && url.pathname === '/rpc/backfill-keiba-first3f') {
      const rpcRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/backfill_keiba_first3f', {
        method:'POST', headers:{'Content-Type':'application/json','apikey':env.SUPABASE_SERVICE_KEY,
          'Authorization':'Bearer ' + env.SUPABASE_SERVICE_KEY},
        body:'{}',
      });
      return new Response(await rpcRes.arrayBuffer(), {
        status:rpcRes.status, headers:Object.assign({'Content-Type':'application/json'}, corsWrite(request)),
      });
    }

    if (!['POST', 'DELETE'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405, headers: corsWrite(request) });
    }

    const tableMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/);
    if (!tableMatch || !ALLOWED_TABLES.has(tableMatch[1])) {
      return new Response('Forbidden', { status: 403, headers: corsWrite(request) });
    }
    if (request.method === 'DELETE' && !url.searchParams.has('id')) {
      return new Response('DELETE requires an id filter', { status:400, headers:corsWrite(request) });
    }

    const supaHeaders = {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    };
    const prefer = request.headers.get('Prefer');
    if (prefer) supaHeaders['Prefer'] = prefer;

    const supaRes = await fetch(SUPABASE_URL + url.pathname + url.search, {
      method: request.method,
      headers: supaHeaders,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
    });

    const body = await supaRes.arrayBuffer();
    return new Response(body, {
      status: supaRes.status,
      headers: Object.assign({ 'Content-Type': 'application/json' }, corsWrite(request)),
    });
  },
};
