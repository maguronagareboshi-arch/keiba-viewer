// レース映像(パドック/レース)ジャンプ — 高知けいばYouTubeアーカイブへの時刻リンク。
// 設計: 高知競馬\01_高知映像計測\paddock\設計書_パドック返し馬映像_v1.0.md (v1.1)
// データ: data/kochi_video_index.json(videoindex.py が生成。手編集しない)
// 規律: クリックまで動画は1バイトも読まない(iframeはタップ時に生成・常に1個だけ)。
//       「返し馬」ボタンは番組分割(Phase 1.5)が入るまで出さない —
//       固定オフセットでは前レースの写真判定等に着地するため(Phase 0実測)。
(function () {
  'use strict';
  // パドック = 発走−1200秒。Phase 0実測(2026-08-03・7/11のR1/R2)でパドック中継に着地。
  var PADDOCK_BACK = 1200;
  // レース頭出しの余裕: 精測(s)は±1秒級 → −15秒 / 概測(l)は−19〜+14秒ズレ実測 → −30秒。
  // 予定ベース(o)は誤差±70秒級なのでレースボタン自体を出さない(パドックのみ)。
  var RACE_BACK = { s: 15, l: 30 };
  var _idx = null, _idxPromise = null, _player = null;

  function loadIndex() {
    if (!_idxPromise) {
      _idxPromise = fetch('data/kochi_video_index.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (j) { _idx = j; return j; });
    }
    return _idxPromise;
  }

  // renderDebanExtra(app-main.js)から同期で呼ばれる。プレースホルダを返し、非同期で埋める。
  window.buildRaceVideoHtml = function (raceNo) {
    var data = (typeof allRacesData === 'object') ? allRacesData[raceNo] : null;
    var d = data && data.raceInfo && data.raceInfo.raceDate;
    if (!d) return '';
    setTimeout(function () { populate(raceNo, String(d).replace(/\//g, '-')); }, 0);
    return '<div id="kv-video-row-' + Number(raceNo) + '" class="kv-video-row" hidden></div>';
  };

  function populate(raceNo, dateKey) {
    loadIndex().then(function () {
      var el = document.getElementById('kv-video-row-' + raceNo);
      if (!el || !_idx || !_idx.days) return;
      var day = _idx.days[dateKey];
      var rec = day && day.races && day.races[String(raceNo)];
      if (!rec || !day.vid || !/^[\w-]{6,20}$/.test(day.vid)) return; // 映像なし→行ごと非表示のまま
      var start = Math.max(0, Math.round(rec.start));
      var html = '<span class="kv-video-cap">📺 中継映像</span>';
      html += mkBtn(day.vid, Math.max(0, start - PADDOCK_BACK), '🐴 パドック',
                    'この日の中継のパドックのあたりから再生します');
      if (RACE_BACK[rec.acc] != null) {
        html += mkBtn(day.vid, Math.max(0, start - RACE_BACK[rec.acc]), '🎬 レース',
                      '発走の少し前から再生します');
      }
      html += '<span class="kv-video-hint">位置は目安です(前後にずれたら早送り/巻き戻しで調整)</span>';
      el.innerHTML = html;
      el.hidden = false;
    });
  }

  function mkBtn(vid, t, label, title) {
    // vid は自前生成のインデックス由来だが、念のため英数-_のみを通す(上で検証済み)。
    return '<button type="button" class="btn btn-secondary btn-sm kv-video-btn" title="' + title +
           '" onclick="kvVideoPlay(\'' + vid + '\',' + (t | 0) + ',this)">' + label + '</button>';
  }

  window.kvVideoPlay = function (vid, t, btnEl) {
    if (!/^[\w-]{6,20}$/.test(String(vid))) return;
    t = Math.max(0, t | 0);
    window.kvVideoClose();
    var row = btnEl && btnEl.closest ? btnEl.closest('.kv-video-row') : null;
    if (!row) return;
    var host = document.createElement('div');
    host.className = 'kv-video-player';
    host.innerHTML =
      '<div class="kv-video-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + vid +
      '?start=' + t + '&autoplay=1" title="高知けいば中継" loading="lazy" allowfullscreen ' +
      'allow="autoplay; encrypted-media; picture-in-picture" ' +
      'referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
      '<div class="kv-video-bar"><a href="https://www.youtube.com/watch?v=' + vid + '&t=' + t +
      's" target="_blank" rel="noopener">YouTubeで開く</a>' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="kvVideoClose()">✕ 閉じる</button></div>';
    row.after(host);
    _player = host;
  };

  window.kvVideoClose = function () {
    if (_player && _player.parentNode) _player.parentNode.removeChild(_player);
    _player = null;
  };
})();
