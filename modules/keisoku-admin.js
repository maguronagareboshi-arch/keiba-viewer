/* ============================================================
 * 計測管理（管理者専用・過去開催のラップ計測を依頼する画面）
 *
 * 何をするモジュールか
 *   Supabase の kochi_backfill_map（取得状況の地図）を読んで年別カレンダーを描き、
 *   未取得の日をタップすると kochi_backfill_queue へ「依頼」を積む。
 *   実際の計測はローカルPCの backfill.py --queue（毎晩3時のタスク）が消化する。
 *
 * ⛔このモジュールは予想ロジック・印・買い目に一切触れない。読み書きするのは上の2テーブルだけ。
 * ⛔管理者専用。ページ自体を admin-only にし、switchPage 側でも閲覧者を弾く。
 * ⛔地図は「ローカルが導出してDBへ置いた1行」を読むだけ。ここで15,000行を数え直さない。
 * ============================================================ */
(function () {
  'use strict';

  var ST_CLS = { '済': 'd-ok', '部分': 'd-part', '未': 'd-todo', '不可': 'd-na', '要確認': 'd-err', 'error': 'd-err' };
  var SELECTABLE = { '未': 1, '部分': 1, '要確認': 1, 'error': 1 };
  var MIN_PER_DAY = 30;                 // 1日あたりの実測所要（2026-08-01時点）

  var _map = null, _queue = [], _sel = Object.create(null), _loading = false;

  function cfg() {
    return (typeof window.kvSupabaseReadConfig === 'function')
      ? window.kvSupabaseReadConfig() : null;
  }
  function esc(s) {
    return (typeof escapeHTML === 'function') ? escapeHTML(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }
  function md(d8) { return (+d8.slice(4, 6)) + '/' + (+d8.slice(6, 8)); }
  function selCount() { return Object.keys(_sel).length; }

  function toast(msg) {
    var t = document.getElementById('ks-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 3400);
  }

  async function load() {
    var c = cfg();
    if (!c) return;
    _loading = true; renderAll();
    try {
      var r1 = await fetch(c.url + '/rest/v1/kochi_backfill_map?select=map,updated_at&id=eq.1',
        { headers: c.headers });
      var j1 = await r1.json();
      _map = (j1 && j1[0] && j1[0].map) || {};
      var r2 = await fetch(c.url + '/rest/v1/kochi_backfill_queue' +
        '?select=day,status,note,requested_at&order=requested_at.desc&limit=30',
        { headers: c.headers });
      _queue = await r2.json() || [];
    } catch (e) {
      _map = _map || {};
      toast('取得状況を読み込めませんでした（通信エラー）');
    }
    _loading = false;
    renderAll();
  }

  function renderSummary() {
    var el = document.getElementById('ks-summary');
    if (!el) return;
    var cnt = { '済': 0, '部分': 0, '未': 0, '不可': 0, '要確認': 0, 'error': 0 };
    for (var k in _map) { if (cnt[_map[k].s] != null) cnt[_map[k].s]++; }
    var bad = cnt['要確認'] + cnt['error'];
    el.innerHTML =
      '<span class="ks-chip ks-c-ok">済 ' + cnt['済'] + '</span>' +
      '<span class="ks-chip ks-c-part">部分 ' + cnt['部分'] + '</span>' +
      '<span class="ks-chip ks-c-todo">未 ' + cnt['未'] + '</span>' +
      '<span class="ks-chip ks-c-na">中継なし ' + cnt['不可'] + '</span>' +
      (bad ? '<span class="ks-chip ks-c-err">要確認 ' + bad + '</span>' : '');
  }

  function renderQueue() {
    var el = document.getElementById('ks-queue');
    if (!el) return;
    if (!_queue.length) { el.innerHTML = '<div class="ks-qnote" style="padding:6px 2px">依頼はありません</div>'; return; }
    el.innerHTML = _queue.map(function (r) {
      var st = r.status || '';
      var c = st === '実行中' ? 'ks-st-run' : (st === '依頼' ? 'ks-st-req'
        : (st === '完了' ? 'ks-st-done' : 'ks-st-err'));
      var d = String(r.day || '');
      return '<div class="ks-qrow"><span class="ks-qday">' +
        esc(d.slice(0, 4) + '/' + md(d)) + '</span>' +
        '<span class="ks-qst ' + c + '">' + esc(st) + '</span>' +
        '<span class="ks-qnote">' + esc(r.note || '') + '</span></div>';
    }).join('');
  }

  function renderYears() {
    var el = document.getElementById('ks-years');
    if (!el) return;
    if (_loading && !_map) { el.innerHTML = '<div class="ks-qnote">読み込み中…</div>'; return; }
    var byY = {};
    Object.keys(_map || {}).forEach(function (d8) {
      (byY[d8.slice(0, 4)] = byY[d8.slice(0, 4)] || []).push(d8);
    });
    var years = Object.keys(byY).sort().reverse();
    if (!years.length) { el.innerHTML = '<div class="ks-qnote">取得状況がまだありません</div>'; return; }
    var out = [];
    years.forEach(function (y) {
      var days = byY[y].sort().reverse();
      var nTodo = 0, nOk = 0, byM = {};
      days.forEach(function (d8) {
        var s = _map[d8].s;
        if (s === '未') nTodo++; else if (s === '済') nOk++;
        (byM[d8.slice(4, 6)] = byM[d8.slice(4, 6)] || []).push(d8);
      });
      var mh = Object.keys(byM).sort().reverse().map(function (m) {
        return '<div class="ks-mon"><div class="ks-mlabel">' + (+m) + '月</div><div class="ks-days">' +
          byM[m].map(function (d8) {
            var v = _map[d8], cls = ST_CLS[v.s] || 'd-na';
            var on = !!SELECTABLE[v.s];
            return '<div class="ks-d ' + cls + (_sel[d8] ? ' sel' : '') + '" data-d="' + esc(d8) + '"' +
              (on ? ' role="button" tabindex="0"' : '') + '>' + md(d8) +
              '<small>' + esc(v.s === '不可' ? '中継なし' : v.n) + '</small></div>';
          }).join('') + '</div></div>';
      }).join('');
      out.push('<details class="ks-year"' + (y === years[0] ? ' open' : '') + '><summary>' +
        esc(y) + '年 <span class="ks-ystat">未 ' + nTodo + ' ・ 済 ' + nOk + ' / ' + days.length + '日</span>' +
        '</summary><div class="ks-ybody">' + mh + '</div></details>');
    });
    el.innerHTML = out.join('');
  }

  function renderBar() {
    var bar = document.getElementById('ks-bar');
    if (!bar) return;
    var n = selCount();
    bar.classList.toggle('show', n > 0);
    var c = document.getElementById('ks-selcount'); if (c) c.textContent = n;
    var e = document.getElementById('ks-est');
    if (e) {
      var min = n * MIN_PER_DAY;
      e.textContent = n ? ('・目安 ' + (min >= 90 ? '約' + (Math.round(min / 6) / 10) + '時間' : '約' + min + '分') + '（今夜から順に）') : '';
    }
  }
  function renderAll() { renderSummary(); renderQueue(); renderYears(); renderBar(); }

  function toggle(d8) {
    if (!_map || !_map[d8] || !SELECTABLE[_map[d8].s]) return;
    if (_sel[d8]) delete _sel[d8]; else _sel[d8] = 1;
    var el = document.querySelector('.ks-d[data-d="' + d8 + '"]');
    if (el) el.classList.toggle('sel', !!_sel[d8]);
    renderBar();
  }
  function clearSel() { _sel = Object.create(null); renderAll(); }

  async function submit() {
    var days = Object.keys(_sel).sort();
    if (!days.length) return;
    var c = cfg();
    if (!c) { toast('接続情報がありません'); return; }
    var btn = document.getElementById('ks-submit');
    if (btn) { btn.disabled = true; btn.textContent = '登録中…'; }
    try {
      // ⛔既に同じ日がキューにあると unique 制約で落ちる。merge-duplicates で「依頼」に戻す。
      //   ⛔day は主キーではなく unique 制約なので `on_conflict=day` が必須(無いと409。2026-08-01実測)。
      var body = days.map(function (d) { return { day: d, status: '依頼', note: '管理画面から依頼' }; });
      var h = Object.assign({}, c.headers, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      var res = await fetch(c.url + '/rest/v1/kochi_backfill_queue?on_conflict=day', {
        method: 'POST', headers: h, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      clearSel();
      toast(days.length + '日ぶんを依頼しました。PCが夜間に処理します');
      await load();
    } catch (e) {
      toast('依頼を登録できませんでした（' + (e && e.message ? e.message : '通信エラー') + '）');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'この内容で依頼'; }
    }
  }

  document.addEventListener('click', function (ev) {
    var d = ev.target.closest && ev.target.closest('.ks-d[role="button"]');
    if (d && d.dataset.d) toggle(d.dataset.d);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var d = ev.target.closest && ev.target.closest('.ks-d[role="button"]');
    if (d && d.dataset.d) { ev.preventDefault(); toggle(d.dataset.d); }
  });

  window.ksOpen = function () {                 // switchPage('keisoku') から呼ばれる
    if (!_map) load(); else renderAll();
  };
  window.ksReload = load;
  window.ksClearSel = clearSel;
  window.ksSubmit = submit;
})();
