// 各馬のパドック映像(自前クリップ) — 馬モーダルの過去走から呼ぶ。
// データ: data/kochi_paddock_index.json(paddock_index.py が生成。手編集しない)
// 実体: Cloudflare R2 の公開URL。YouTubeの埋め込みは使わない(見た目と外部依存を避けるため)。
// 規律: 索引に載っている馬だけボタンを出す(載っていない=クリップが無い)。
//       索引は馬モーダルを開いたときに一度だけ読む。動画はタップまで1バイトも読まない。
(function () {
  'use strict';
  var _idx = null, _p = null, _player = null;

  function load() {
    if (!_p) {
      _p = fetch('data/kochi_paddock_index.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (j) { _idx = j; return j; });
    }
    return _p;
  }

  function has(date, raceNo, umaBan) {
    if (!_idx || !_idx.days) return false;
    var d = _idx.days[String(date).replace(/\//g, '-')];
    var r = d && d[String(raceNo)];
    if (!r) return false;
    return r.split(',').indexOf(String(parseInt(umaBan, 10))) >= 0;
  }

  function url(date, raceNo, umaBan, ext) {
    var ymd = String(date).replace(/[/-]/g, '');
    var uma = ('0' + parseInt(umaBan, 10)).slice(-2);
    return _idx.base + '/' + ymd + '/R' + parseInt(raceNo, 10) + '/uma' + uma + '.' + ext;
  }

  // 過去走テーブルの各行に埋めるセル。索引が未読の間は空セルを返し、読めたら差し替える。
  window.paddockCellHtml = function (date, raceNo, umaBan, babaCode) {
    if (String(babaCode || '31') !== '31') return '<td class="col-paddock"></td>';
    var id = 'pdk-' + String(date).replace(/[/-]/g, '') + '-' + raceNo + '-' + umaBan;
    setTimeout(function () { fill(id, date, raceNo, umaBan); }, 0);
    return '<td class="col-paddock" id="' + id + '"></td>';
  };

  function fill(id, date, raceNo, umaBan) {
    load().then(function () {
      var el = document.getElementById(id);
      if (!el || !has(date, raceNo, umaBan)) return;
      el.innerHTML = '<button type="button" class="kv-pdk-btn" title="この日のこの馬のパドックを見る"' +
        ' onclick="kvPaddockPlay(this,\'' + jsAttrEsc(String(date)) + '\',' +
        parseInt(raceNo, 10) + ',' + parseInt(umaBan, 10) + ')">🐴</button>';
    });
  }

  window.kvPaddockPlay = function (btn, date, raceNo, umaBan) {
    if (!_idx || !has(date, raceNo, umaBan)) return;
    window.kvPaddockClose();
    var host = document.createElement('div');
    host.className = 'kv-pdk-player';
    host.innerHTML =
      '<div class="kv-pdk-head">🐴 ' + escapeHTML(String(date)) + ' ' + parseInt(raceNo, 10) +
      'R ' + parseInt(umaBan, 10) + '番 のパドック' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="kvPaddockClose()">✕ 閉じる</button></div>' +
      '<video controls autoplay playsinline preload="none" poster="' +
      url(date, raceNo, umaBan, 'jpg') + '" src="' + url(date, raceNo, umaBan, 'mp4') + '"></video>';
    document.body.appendChild(host);
    _player = host;
  };

  window.kvPaddockClose = function () {
    if (_player && _player.parentNode) _player.parentNode.removeChild(_player);
    _player = null;
  };
})();
