'use strict';

// 管理者が公式DataRoomを取得する時だけ読み込む遅延モジュール。
// ============================================================
// DataRoom 馬名検索 → 自動取得
// ============================================================

const COURSE_TO_BABA = {
  '高知':'31','佐賀':'21','盛岡':'06','水沢':'07',
  '浦和':'09','船橋':'10','大井':'11','川崎':'12',
  '金沢':'13','笠松':'14','名古屋':'15','園田':'16','姫路':'17','福山':'18',
  'J札幌':'jra01','J函館':'jra02','J福島':'jra03','J新潟':'jra04',
  'J東京':'jra05','J中山':'jra06','J中京':'jra07','J京都':'jra08',
  'J阪神':'jra09','J小倉':'jra10'
};

// 馬名でlineageLoginCodeを探す（キャッシュ優先、DataRoom検索フォールバック）
async function searchHorseLineageCode(horseName) {
  // ① official_ キャッシュから馬名逆引き
  const lsData = lsRead();
  for (const v of Object.values(lsData)) {
    if (v.type === 'official' && v.horseName === horseName && v.lineageCode) return v.lineageCode;
  }

  // ② DataRoom 馬名検索（セッション不要の形式を優先して試す）
  const searchUrls = [
    `https://www.keiba.go.jp/KeibaWeb/DataRoom/HorseMarkList?k_horseName=${encodeURIComponent(horseName)}&k_resultInfo=2`,
    `https://www.keiba.go.jp/KeibaWeb/DataRoom/HorseMarkList?k_horseName=${encodeURIComponent(horseName)}&k_bn=2&k_activeFlag=3&k_resultInfo=2`,
  ];
  for (const url of searchUrls) {
    let html;
    try { html = await fetchHtmlWithProxy(url, 15000); } catch(e) { continue; }

    // CSS セレクタで探す
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a[href*="lineageLoginCode"]')];
    if (links.length) {
      const kochiLink = links.find(a => a.closest('tr')?.textContent.includes('高知'));
      const link = kochiLink || links[0];
      const m = (link.getAttribute('href') || '').match(/k_lineageLoginCode=(\d+)/);
      if (m) return m[1];
    }
    // 生HTML から直接スキャン（DOM構造が異なる場合のフォールバック）
    const mRaw = html.match(/k_lineageLoginCode=(\d+)/);
    if (mRaw) return mRaw[1];
  }
  return null;
}
// 公式レース履歴をgetHorseHistory互換のhorse/raceエントリとして保存
// JRA・不明競馬場は除外し、地方競馬のみを対象とする
function storeOfficialRacesAsHorseEntries(horseName, lineageCode, races) {
  const lsData = lsRead();
  // 日付を8桁整数に正規化（フォーマット違いを吸収）
  const _nd = d => parseInt(String(d||'').replace(/\D/g,'').slice(0,8), 10) || 0;
  for (const race of races) {
    if (!race.raceDate || !race.time) continue;
    const babaCode = COURSE_TO_BABA[race.course];
    // 未マッピング競馬場はスキップ（JRAは _isJra=true で保持）
    if (!babaCode) continue;
    const _isJra = babaCode.startsWith('jra');
    const raceNo   = race.raceNo;
    const raceDate = race.raceDate;
    // キー: offi_{lineageCode}_{babaCode}_{raceDate}_{raceNo}
    // ※ 通常キー({babaCode}_...)と衝突しないよう offi_ プレフィックスを使う
    const horseKey = `offi_${lineageCode}_${babaCode}_${raceDate}_${raceNo}`;
    // コーナー通過順: 既存レース結果エントリ（通常キー）から同馬名で検索（無料）
    const rdN = _nd(raceDate), rNInt = parseInt(raceNo) || 0;
    let cornerFromIDB = '';
    for (const [k, v] of Object.entries(lsData)) {
      if (k.startsWith('offi_') || k.startsWith('race_')) continue;
      if (!v?.corner || v.horseName !== horseName) continue;
      const p = k.split('_');
      if (p[0] === babaCode && (parseInt(p[2])||0) === rNInt && _nd(p[1]) === rdN) {
        cornerFromIDB = v.corner; break;
      }
    }
    lsWrite(horseKey, {
      type: 'horse', horseName, fromOfficial: true, lineageCode,
      _babaCode: babaCode, _raceDate: raceDate, _raceNo: parseInt(raceNo) || 0,
      _isJra,
      _raceClass: race.raceClassRaw || race.raceClass || '', // 生クラス文字列（推定用）
      _raceName: race.raceName || '',  // JRAクラス情報が埋め込まれている場合に使用
      _dist: race.dist || '',
      chakujun: race.chakujun, time: race.time, agari3f: race.agari3f,
      kinryo: race.kinryo, jockey: race.jockey, trainer: race.trainer,
      weight: race.weight, diff: race.diff, trackCond: race.trackCond,
      corner: cornerFromIDB
    });
    // レースエントリ（distance/raceClass取得用）が未登録なら追加
    const raceKey = `race_${babaCode}_${raceDate}_${raceNo}`;
    if (!lsData[raceKey]) {
      lsWrite(raceKey, {
        type: 'race', baba_code: babaCode, race_date: raceDate,
        race_no: parseInt(raceNo) || 0, distance: race.dist,
        race_class: race.raceClass, track_cond: race.trackCond,
        race_name: race.raceName, fromOfficial: true
      });
    }
  }
}

// 公式履歴にないコーナー通過順をRaceMarkTableページから補完（高知直近5走）
async function enrichCornerDataFromRaceResults(horseName, lineageCode, races) {
  const KOCHI = '31';
  const lsData = lsRead();
  const toFetch = [];
  for (const race of races) {
    if ((COURSE_TO_BABA[race.course] || '') !== KOCHI) continue;
    const horseKey = `offi_${lineageCode}_${KOCHI}_${race.raceDate}_${race.raceNo}`;
    const entry = lsData[horseKey];
    if (entry?.corner) continue;
    if (toFetch.length >= 5) break;
    toFetch.push({ raceDate: race.raceDate, raceNo: race.raceNo, horseKey });
  }
  if (!toFetch.length) return;

  await Promise.allSettled(toFetch.map(async ({ raceDate, raceNo, horseKey }) => {
    try {
      const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable?k_raceDate=${encodeURIComponent(raceDate)}&k_raceNo=${raceNo}&k_babaCode=${KOCHI}`;
      const html = await fetchHtmlWithProxy(url, 12000);
      const parsed = parseRaceMarkTable(html, raceDate, raceNo, KOCHI);
      if (!parsed) return;
      const hName = horseName.replace(/\s/g, '');
      const hr = parsed.horses.find(h => (h.horseName || '').replace(/\s/g, '') === hName);
      if (!hr?.corner) return;
      const cur = lsRead()[horseKey];
      if (cur) lsWrite(horseKey, { ...cur, corner: hr.corner });
    } catch(e) {}
  }));
}

// 既存の不正エントリをIDBから削除
//   ① 旧フォーマット: {babaCode}_{raceDate}_{raceNo}_off{lineageCode} → 出馬表に混入する
//   ② 新フォーマットでもJRA/不明競馬場のもの
function cleanupJraOfficialEntries() {
  const lsData = lsRead();
  let count = 0;
  for (const [k, v] of Object.entries(lsData)) {
    if (!v || v.type !== 'horse' || !v.fromOfficial) continue;
    if (!k.startsWith('offi_')) {
      // 旧フォーマット（offi_ プレフィックスなし）を削除
      idbDelete(k);
      count++;
    } else {
      // 新フォーマット: 不明競馬場のみ削除（JRAは転入馬推定に使用するため保持）
      const bc = v._babaCode || '';
      if (bc.startsWith('unk_')) {
        idbDelete(k);
        count++;
      }
    }
  }
  return count;
}

// 1頭分：名前検索→HorseMarkInfo取得→保存
async function autoFetchHorseDataByName(horseName, lineageCode, progressCb) {
  try {
    const code = lineageCode || await searchHorseLineageCode(horseName);
    if (!code) { progressCb?.('notfound'); return false; }
    const infoUrl = `https://www.keiba.go.jp/KeibaWeb/DataRoom/HorseMarkInfo?k_lineageLoginCode=${code}`;
    let html;
    try { html = await fetchHtmlWithProxy(infoUrl, 15000); } catch(e) { progressCb?.('error'); return false; }
    const parsed = parseHorseMarkInfoHtml(html);
    if (!parsed.races.length) { progressCb?.('empty'); return false; }
    // official_ キャッシュ保存
    lsWrite(`official_${code}`, {
      type: 'official', lineageCode: code, horseName,
      races: parsed.races, basicInfo: parsed.basicInfo,
      savedAt: new Date().toISOString()
    });
    // SI計算用エントリ保存
    storeOfficialRacesAsHorseEntries(horseName, code, parsed.races);
    // コーナー通過順補完（IDB参照→足りなければRaceMarkTableフェッチ、高知直近5走）
    await enrichCornerDataFromRaceResults(horseName, code, parsed.races);
    progressCb?.('done', parsed.races.length);
    return true;
  } catch(e) {
    progressCb?.('error');
    return false;
  }
}

// 予想AIパネルの「データ自動取得」ボタン処理
async function fetchAllByNameForRace(raceNo) {
  const btn    = document.getElementById(`yoso-fetch-all-btn-${raceNo}`);
  const status = document.getElementById(`yoso-fetch-status-${raceNo}`);

  // クリック確認：即時フィードバック
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 準備中...'; }
  if (status) status.textContent = '不正データ削除中...';
  await new Promise(r => setTimeout(r, 30));

  // JRA由来の不正エントリを削除（能力表が崩れる原因）
  const removed = cleanupJraOfficialEntries();
  if (status) status.textContent = removed > 0 ? `${removed}件の不正データ削除完了。対象馬を確認中...` : '対象馬を確認中...';
  await new Promise(r => setTimeout(r, 50));

  try {
    const data = allRacesData[raceNo];
    if (!data) {
      if (status) status.textContent = 'レースデータが見つかりません（先にレース情報を取得してください）';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> データ自動取得'; }
      return;
    }

    // 公式DataRoomデータがまだない馬を抽出（ローカルデータの有無は問わない）
    const lsData = lsRead();
    const officialNames = new Set(
      Object.values(lsData)
        .filter(v => v.type === 'horse' && v.fromOfficial)
        .map(v => v.horseName)
    );
    const needFetch = data.horses.filter(horse => !officialNames.has(horse.horseName));

    if (!needFetch.length) {
      if (status) status.textContent = '全馬取得済み／対象なし';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> データ自動取得'; }
      await new Promise(r => setTimeout(r, 1500));
      renderPredictionPanel(raceNo);
      return;
    }

    if (status) status.textContent = `${needFetch.length}頭を取得開始...`;
    await new Promise(r => setTimeout(r, 100));

    let done = 0;
    for (const horse of needFetch) {
      const statusEl = document.getElementById(`yoso-fetch-status-${raceNo}`);
      if (statusEl) statusEl.textContent = `${done + 1}/${needFetch.length}: ${horse.horseName} 検索中…`;

      const code = horse.lineageLoginCode || null;
      await autoFetchHorseDataByName(horse.horseName, code, (ev, count) => {
        const el = document.getElementById(`yoso-fetch-status-${raceNo}`);
        if (!el) return;
        const prefix = `${done + 1}/${needFetch.length}: ${horse.horseName}`;
        if      (ev === 'done')     el.textContent = `${prefix} ✓ (${count}走)`;
        else if (ev === 'notfound') el.textContent = `${prefix} — 見つからず`;
        else                        el.textContent = `${prefix} — エラー`;
      });
      done++;
      await new Promise(r => setTimeout(r, 800));
    }

    const statusEl2 = document.getElementById(`yoso-fetch-status-${raceNo}`);
    if (statusEl2) statusEl2.textContent = `完了（${done}頭処理）`;
    const btnEl2 = document.getElementById(`yoso-fetch-all-btn-${raceNo}`);
    if (btnEl2) { btnEl2.disabled = false; btnEl2.innerHTML = '<i class="fas fa-check"></i> 完了'; }

    await new Promise(r => setTimeout(r, 1200));
    renderPredictionPanel(raceNo);

  } catch(e) {
    console.error('[DataRoom自動取得エラー]', e);
    const statusEl = document.getElementById(`yoso-fetch-status-${raceNo}`);
    if (statusEl) statusEl.textContent = `エラー: ${e.message || e}`;
    const btnEl = document.getElementById(`yoso-fetch-all-btn-${raceNo}`);
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-download"></i> データ自動取得'; }
  }
}
