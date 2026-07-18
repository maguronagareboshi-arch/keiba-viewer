// AI予想・詳細分析を必要な時だけ読み込む遅延モジュール。
// ============================================================
// 好走傾向分析モジュール（インライン版）
// ============================================================
let ana3fChart = null;

document.addEventListener('DOMContentLoaded', () => {
  // save-status の変化で分析セレクトを更新
  const saveStatus = document.getElementById('save-status');
  if (saveStatus) {
    new MutationObserver(() => {
      if (saveStatus.textContent.includes('保存しました')) initAnalysisDateSelect();
    }).observe(saveStatus, {childList:true,characterData:true,subtree:true});
  }
});

function initAnalysisDateSelect() {
  const sel = document.getElementById('ana-date-select');
  const lsData = lsRead();
  const groups = {};
  Object.values(lsData).filter(v=>v.type==='race').forEach(v=>{const key=`${v.race_date}__${v.baba_code}`;if(!groups[key])groups[key]={date:v.race_date,baba:v.baba_code};});
  const sorted = Object.values(groups).sort((a,b)=>b.date.localeCompare(a.date));
  while(sel.options.length>1)sel.remove(1);
  if(!sorted.length){document.getElementById('ana-nodata').classList.remove('hidden');document.getElementById('ana-body').classList.add('hidden');return;}
  sorted.forEach(g=>{const opt=document.createElement('option');opt.value=`${g.date}__${g.baba}`;opt.textContent=`${g.date}　${getBabaName(g.baba)}`;sel.appendChild(opt);});
  sel.value='';
  document.getElementById('ana-nodata').classList.remove('hidden');
  document.getElementById('ana-body').classList.add('hidden');
}

// クラス階層順序（インライン版）
const CLASS_ORDER = ['2歳','3歳','C3','C2','C1','B','A','重賞','OP'];
if (typeof window._anaActiveClass === 'undefined') window._anaActiveClass = '';
function switchClassTab(cls) { window._anaActiveClass = cls; renderAnalysis(); }

function renderAnalysis() {
  const selVal=document.getElementById('ana-date-select').value;
  const topN=parseInt(document.getElementById('ana-top-n').value)||3;
  const distSelEl=document.getElementById('ana-distance-select');
  const filterDist=distSelEl?distSelEl.value:'';
  const tabWrap=document.getElementById('ana-class-tabs-wrap');
  const tabsEl=document.getElementById('ana-class-tabs');
  if(!selVal){
    document.getElementById('ana-nodata').classList.remove('hidden');
    document.getElementById('ana-body').classList.add('hidden');
    if(tabWrap)tabWrap.classList.add('hidden');
    return;
  }
  const [targetDate,targetBaba]=selVal.split('__');
  const lsData=lsRead();
  const allHorses=[];
  const memRaces=(typeof allRacesData!=='undefined')?allRacesData:{};
  const memRaceNos=new Set();
  Object.entries(memRaces).forEach(([rn,raceData])=>{if(!raceData?.horses)return;const ri=raceData.raceInfo;if(ri.raceDate!==targetDate||ri.babaCode!==targetBaba)return;memRaceNos.add(parseInt(rn));raceData.horses.forEach(h=>{allHorses.push({raceNo:parseInt(rn),raceName:ri.raceName,distance:ri.distance,raceClass:ri.raceClass,paceTypeRace:ri.paceType,chakujun:parseInt(h.chakujun)||999,umaBan:h.umaBan,wakuBan:h.wakuBan,horseName:h.horseName,jockey:h.jockey,first3f:parseFloat(h.first3f)||null,paceType:h.paceType,mukaeShoumen:h.mukaeShoumen||'',shoumenStraight:h.shoumenStraight||'',time:h.time||'',agari3f:h.agari3f||'',ninki:h.ninki||'',corner:h.corner||''});});});
  // IDB保存分：対象日のレース馬を1パスで事前収集（O(n²)→O(n)）
  const idbHorsePrefix=`${targetBaba}_${targetDate}_`;
  const idbHorsesByRace=new Map();
  const idbRaceMap=new Map();
  for(const [k,v] of Object.entries(lsData)){
    if(v.type==='race'&&v.race_date===targetDate&&v.baba_code===targetBaba){idbRaceMap.set(v.race_no,v);}
    else if(v.type==='horse'&&k.startsWith(idbHorsePrefix)){const parts=k.split('_');const rn=parseInt(parts[2]);if(!isNaN(rn)){if(!idbHorsesByRace.has(rn))idbHorsesByRace.set(rn,[]);idbHorsesByRace.get(rn).push([k,v]);}}
  }
  idbRaceMap.forEach((raceVal,rn)=>{if(memRaceNos.has(rn))return;(idbHorsesByRace.get(rn)||[]).forEach(([k,v])=>{const umaBan=parseInt(k.split('_')[3]);if(isNaN(umaBan))return;allHorses.push({raceNo:rn,raceName:raceVal.race_name||`第${rn}レース`,distance:raceVal.distance||'',raceClass:raceVal.raceClass||raceVal.race_class||'',paceTypeRace:raceVal.paceType||'',chakujun:parseInt(v.chakujun)||999,umaBan,wakuBan:v.wakuBan||'',horseName:v.horseName||`馬番${umaBan}`,jockey:v.jockey||'',first3f:parseFloat(v.first3f)||null,paceType:v.paceType||'',mukaeShoumen:v.mukaeShoumen||'',shoumenStraight:v.shoumenStraight||'',time:v.time||'',agari3f:v.agari3f||'',ninki:v.ninki||'',corner:v.corner||''});});});

  // ── クラス別タブ生成 ──
  if(tabWrap&&tabsEl){
    const classSet=new Set(allHorses.map(h=>h.raceClass).filter(c=>c&&c.trim()));
    const classArr=[...classSet].sort((a,b)=>{const ia=CLASS_ORDER.indexOf(a),ib=CLASS_ORDER.indexOf(b);if(ia===-1&&ib===-1)return a.localeCompare(b);if(ia===-1)return 1;if(ib===-1)return -1;return ia-ib;});
    if(classArr.length>1){
      if(window._anaActiveClass&&!classArr.includes(window._anaActiveClass))window._anaActiveClass='';
      tabWrap.classList.remove('hidden');
      const allAct=window._anaActiveClass===''?' active':'';
      tabsEl.innerHTML=`<button class="ana-class-tab${allAct}" onclick="switchClassTab('')">全クラス</button>`+classArr.map(cls=>{const act=window._anaActiveClass===cls?' active':'';return`<button class="ana-class-tab${act}" onclick="switchClassTab('${cls}')">${cls}</button>`;}).join('');
    } else {
      tabWrap.classList.add('hidden');
      window._anaActiveClass='';
    }
  }

  const activeClass=window._anaActiveClass;

  // 距離フィルタセレクトを動的更新
  if(distSelEl){
    const distSet=new Set(allHorses.filter(h=>!activeClass||h.raceClass===activeClass).map(h=>h.distance).filter(d=>d&&d.trim()));
    const distSorted=[...distSet].sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0));
    const cur=distSelEl.value;
    while(distSelEl.options.length>1)distSelEl.remove(1);
    distSorted.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;distSelEl.appendChild(o);});
    if(cur&&distSorted.includes(cur))distSelEl.value=cur;
  }
  const validHorses=allHorses.filter(h=>h.chakujun<900&&(!filterDist||h.distance===filterDist)&&(!activeClass||h.raceClass===activeClass));
  if(!validHorses.length){document.getElementById('ana-nodata').classList.remove('hidden');document.getElementById('ana-body').classList.add('hidden');document.getElementById('ana-nodata').innerHTML='<i class="fas fa-info-circle"></i> 着順データがありません。<br>レース取得後に <b>「この日の全データを保存」</b> してから <b>📊 分析</b> を押してください。';return;}
  document.getElementById('ana-nodata').classList.add('hidden');document.getElementById('ana-body').classList.remove('hidden');
  const winner=validHorses.filter(h=>h.chakujun<=topN), loser=validHorses.filter(h=>h.chakujun>topN);
  // 現在の馬データをwindowに保持（各種フィルタ再描画用）
  window._anaValidHorses=validHorses;
  window._anaWinner=winner;
  window._anaLoser=loser;
  window._anaAllHorses=allHorses;
  window._anaTopN=topN;
  renderSummary(validHorses,winner,topN,targetDate,targetBaba);
  renderPosBars('ana-mukae-bars',['最内','内','外2','外3','大外'],h=>h.mukaeShoumen,winner,loser,validHorses,'mukae','ana-mukae-detail');
  renderPosBars('ana-straight-bars',['内','中','外'],h=>h.shoumenStraight,winner,loser,validHorses,'straight','ana-straight-detail');
  renderPosBars('ana-pace-bars',['ハイ','ミドル','スロー'],h=>h.paceType,winner,loser,validHorses,'pace','ana-pace-detail');
  renderCornerChart(winner,loser,validHorses);
  renderWakuBarsNew(winner,loser,validHorses);
  renderResultTable(winner,topN);
  renderLoserTable();
  const agariHorses=activeClass?allHorses.filter(h=>h.raceClass===activeClass):allHorses;
  window._anaAgariHorses=agariHorses;
  updateAgariFilters(agariHorses);
  renderAgariRanking(agariHorses);
  renderPositionMatrix(validHorses,winner,topN);
  const compareHorses=activeClass?allHorses.filter(h=>h.raceClass===activeClass):allHorses;
  updateCompareRaceSelect(compareHorses);
  renderRaceCompare();
  initLapChartDistSelect();
  renderLapChart();
}

function renderSummary(all,winners,topN,date,baba) {
  const row=document.getElementById('ana-summary-row');
  const raceCount=new Set(all.map(h=>h.raceNo)).size, wc=winners.length;
  const topMukae=topEntry(countByKey(winners,h=>h.mukaeShoumen));
  const topStraight=topEntry(countByKey(winners,h=>h.shoumenStraight));
  const topPace=topEntry(countByKey(winners,h=>h.paceType));
  const f3vals=winners.map(h=>h.first3f).filter(v=>v!=null);
  const medF3=f3vals.length?median(f3vals).toFixed(1):'—';
  row.innerHTML=`<div class="ana-summary-card"><div class="ana-sum-icon"><i class="fas fa-calendar-check"></i></div><div class="ana-sum-body"><div class="ana-sum-label">対象</div><div class="ana-sum-value">${date} ${getBabaName(baba)}</div><div class="ana-sum-sub">${raceCount}R / 好走${wc}頭</div></div></div><div class="ana-summary-card ${topMukae?'ana-sum-highlight':''}"><div class="ana-sum-icon"><i class="fas fa-horse-head"></i></div><div class="ana-sum-body"><div class="ana-sum-label">向正面（最多）</div><div class="ana-sum-value">${topMukae?topMukae[0]:'—'}</div><div class="ana-sum-sub">${topMukae?topMukae[1]+'頭':'データなし'}</div></div></div><div class="ana-summary-card ${topStraight?'ana-sum-highlight':''}"><div class="ana-sum-icon"><i class="fas fa-flag-checkered"></i></div><div class="ana-sum-body"><div class="ana-sum-label">直線（最多）</div><div class="ana-sum-value">${topStraight?topStraight[0]:'—'}</div><div class="ana-sum-sub">${topStraight?topStraight[1]+'頭':'データなし'}</div></div></div><div class="ana-summary-card ${topPace?'ana-sum-highlight':''}"><div class="ana-sum-icon"><i class="fas fa-tachometer-alt"></i></div><div class="ana-sum-body"><div class="ana-sum-label">ペース（最多）</div><div class="ana-sum-value pace-text-${topPace?paceKey(topPace[0]):'none'}">${topPace?topPace[0]:'—'}</div><div class="ana-sum-sub">${topPace?topPace[1]+'頭':'データなし'}</div></div></div><div class="ana-summary-card"><div class="ana-sum-icon"><i class="fas fa-stopwatch"></i></div><div class="ana-sum-body"><div class="ana-sum-label">前半3F中央値（好走）</div><div class="ana-sum-value">${medF3!=='—'?medF3+'秒':'—'}</div><div class="ana-sum-sub">${f3vals.length}頭のデータ</div></div></div>`;
}
// ── ポジションバー（クリックで馬一覧表示対応版） ──
function renderPosBars(cid,labels,keyFn,winners,losers,allValid,type,detailId){
  const el=document.getElementById(cid);if(!el)return;
  el.innerHTML='';
  let anyData=false;
  // 事前グループ化でO(n×m)→O(n+m)に
  const wMap=new Map(),lMap=new Map();
  winners.forEach(h=>{const k=keyFn(h);if(!wMap.has(k))wMap.set(k,[]);wMap.get(k).push(h);});
  losers.forEach(h=>{const k=keyFn(h);if(!lMap.has(k))lMap.set(k,[]);lMap.get(k).push(h);});
  labels.forEach(label=>{
    const wArr=wMap.get(label)||[];
    const lArr=lMap.get(label)||[];
    const wc=wArr.length,lc=lArr.length,total=wc+lc;
    if(!total)return;
    anyData=true;
    const rate=Math.round(wc/total*100);
    const cc=posBarColor(label,type);
    // 人気インサイト計算
    const ninkiNums=wArr.map(h=>parseInt(h.ninki)).filter(n=>n>0&&!isNaN(n));
    const avgNinkiWin=ninkiNums.length?ninkiNums.reduce((a,b)=>a+b,0)/ninkiNums.length:null;
    const favLoseCnt=lArr.filter(h=>{const n=parseInt(h.ninki);return!isNaN(n)&&n>=1&&n<=3;}).length;
    const upsetWinCnt=wArr.filter(h=>{const n=parseInt(h.ninki);return!isNaN(n)&&n>=6;}).length;
    const hintParts=[];
    if(avgNinkiWin!=null)hintParts.push(`<span style="color:#64748b">勝均${avgNinkiWin.toFixed(1)}人</span>`);
    if(favLoseCnt>0)hintParts.push(`<span style="color:#dc2626;font-weight:700">⚠${favLoseCnt}人気凡走</span>`);
    if(upsetWinCnt>0&&avgNinkiWin!=null&&avgNinkiWin>=5)hintParts.push(`<span style="color:#d97706;font-weight:700">★穴${upsetWinCnt}頭</span>`);
    const hintHtml=hintParts.length?`<div style="font-size:9px;padding:0 4px 3px 56px;line-height:1.4">${hintParts.join('　')}</div>`:'';
    const row=document.createElement('div');
    row.className='ana-bar-row';
    row.style.cssText='cursor:pointer;border-radius:6px;padding:2px 0;transition:background .15s;display:block';
    row.title=`「${label}」の馬一覧を表示`;
    row.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:0 4px"><div class="ana-bar-label">${label}</div><div class="ana-bar-track"><div class="ana-bar-fill ${cc}" style="width:${rate}%"></div></div><div class="ana-bar-stats"><span class="ana-bar-rate">${rate}%</span><span class="ana-bar-count">${wc}/${total}</span></div></div>${hintHtml}`;
    row.addEventListener('click',()=>{
      openPosDetailModal(label,type,wArr,lArr);
    });
    row.addEventListener('mouseenter',()=>row.style.background='#f0e8ff');
    row.addEventListener('mouseleave',()=>row.style.background='');
    el.appendChild(row);
  });
  if(!anyData)el.innerHTML='<p class="ana-empty">入力データなし</p>';
}

// ── ポジション詳細モーダル ──
function openPosDetailModal(label,type,wArr,lArr){
  let modal=document.getElementById('pos-detail-modal');
  if(!modal){modal=document.createElement('div');modal.id='pos-detail-modal';modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:none;align-items:flex-start;justify-content:center;padding:40px 12px;overflow-y:auto';modal.onclick=e=>{if(e.target===modal)closePosDetailModal();};document.body.appendChild(modal);}
  const typeLabel=type==='mukae'?'向正面':type==='straight'?'直線':type==='pace'?'ペース':type==='corner'?'脚質':type==='waku'?'枠番':type==='ninki'?'':type==='matrix'?'コース':'位置';
  // 人気インサイト
  const nk=h=>{const n=parseInt(h.ninki);return(!isNaN(n)&&n>0)?n:null;};
  const nkWin=wArr.map(nk).filter(n=>n!==null);
  const avgNkW=nkWin.length?nkWin.reduce((a,b)=>a+b,0)/nkWin.length:null;
  const favLose=lArr.filter(h=>{const n=nk(h);return n!==null&&n<=3;});
  const upsetWin=wArr.filter(h=>{const n=nk(h);return n!==null&&n>=6;});
  // インサイトバッジ
  const insightBadge=(txt,bg,clr)=>`<span style="background:${bg};color:${clr};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">${txt}</span>`;
  const insights=[];
  if(avgNkW!=null)insights.push(insightBadge(`好走馬 平均${avgNkW.toFixed(1)}人気`,'#e0e7ff','#3730a3'));
  if(upsetWin.length>0)insights.push(insightBadge(`★ 穴馬好走 ${upsetWin.length}頭`,'#fef3c7','#92400e'));
  if(favLose.length>0)insights.push(insightBadge(`⚠ 人気馬凡走 ${favLose.length}頭`,'#fee2e2','#991b1b'));
  if(!upsetWin.length&&!favLose.length&&avgNkW!=null&&avgNkW<=3)insights.push(insightBadge('実力通り','#d1fae5','#065f46'));
  // ヘッダー背景色
  const hdrBg=upsetWin.length&&avgNkW!=null&&avgNkW>=5?'linear-gradient(135deg,#d97706,#b45309)':favLose.length?'linear-gradient(135deg,#dc2626,#b91c1c)':'linear-gradient(135deg,#4f46e5,#7c3aed)';
  // テーブル行生成
  const cCls=c=>c===1?'chakujun-1':c===2?'chakujun-2':c===3?'chakujun-3':'';
  const nkStyle=n=>{if(n===null)return'color:#94a3b8';if(n<=2)return'color:#dc2626;font-weight:800';if(n<=5)return'color:#ea580c;font-weight:700';return'color:#0284c7;font-weight:700';};
  const sortedHorses=[...wArr.sort((a,b)=>a.chakujun-b.chakujun),...lArr.sort((a,b)=>a.chakujun-b.chakujun)];
  const rowsHtml=sortedHorses.map(h=>{
    const isWin=wArr.includes(h);
    const c=h.chakujun<900?h.chakujun:'—';
    const n=nk(h);
    const nStr=n!==null?n+'人気':'—';
    const isUpset=isWin&&n!==null&&n>=6;
    const isFavLose=!isWin&&n!==null&&n<=3;
    const icon=isUpset?'<span style="color:#d97706;font-weight:900;margin-right:3px">★</span>':isFavLose?'<span style="color:#dc2626;font-weight:900;margin-right:3px">⚠</span>':'';
    const rowBg=isUpset?'#fffbeb':isFavLose?'#fff1f2':isWin?'#f0fdf4':'#ffffff';
    const wkn=Math.min(Math.max(parseInt(h.wakuBan)||1,1),8);
    return `<tr class="pd-row" style="background:${rowBg};border-bottom:1px solid #f1f5f9">
      <td class="pd-r" style="padding:5px 6px;text-align:center;white-space:nowrap"><span style="background:#e2e8f0;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">${h.raceNo}R</span></td>
      <td class="pd-chaku" style="padding:5px 6px;text-align:center"><span class="chakujun-badge ${cCls(h.chakujun)}" style="font-size:11px;min-width:20px;height:20px">${c}</span></td>
      <td class="pd-ninki" style="padding:5px 6px;text-align:center;font-size:11px;${nkStyle(n)}">${nStr}</td>
      <td class="pd-name" style="padding:5px 8px;font-size:12px;font-weight:700;white-space:nowrap">${icon}${h.horseName}</td>
      <td class="pd-meta" data-label="枠" style="padding:5px 6px;text-align:center"><span class="waku-badge waku-${wkn}" style="font-size:10px;width:20px;height:20px">${h.wakuBan||'—'}</span></td>
      <td class="pd-meta" data-label="向正面" style="padding:5px 6px;text-align:center;font-size:11px;color:#475569">${h.mukaeShoumen||'—'}</td>
      <td class="pd-meta" data-label="直線" style="padding:5px 6px;text-align:center;font-size:11px;color:#475569">${h.shoumenStraight||'—'}</td>
      <td class="pd-meta" data-label="ペース" style="padding:5px 6px;text-align:center;font-size:10px;color:#64748b">${h.paceType||'—'}</td>
      <td class="pd-col-sec pd-meta" data-label="タイム" style="padding:5px 6px;font-family:monospace;font-size:10px;color:#374151">${h.time||'—'}</td>
      <td class="pd-col-sec pd-meta" data-label="上がり" style="padding:5px 6px;font-family:monospace;font-size:10px;color:#7c3aed">${h.agari3f||'—'}</td>
    </tr>`;
  }).join('');
  modal.innerHTML=`<div style="background:#fff;border-radius:14px;max-width:720px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;margin:auto">
    <div style="background:${hdrBg};padding:16px 20px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="color:#fff;font-size:16px;font-weight:800">「${label}」${typeLabel}の馬</div>
        <div style="color:rgba(255,255,255,.85);font-size:12px;margin-top:2px">好走 ${wArr.length}頭 / 非好走 ${lArr.length}頭（計 ${wArr.length+lArr.length}頭）</div>
      </div>
      <button onclick="closePosDetailModal()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;flex-shrink:0">✕</button>
    </div>
    ${insights.length?`<div style="padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:6px">${insights.join('')}</div>`:''}
    <div style="overflow-x:auto;max-height:62vh;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc;position:sticky;top:0;z-index:1">
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">R</th>
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">着</th>
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">人気</th>
          <th style="padding:6px;text-align:left;font-size:10px;color:#64748b;font-weight:600">馬名</th>
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">枠</th>
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">向正面</th>
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">直線</th>
          <th style="padding:6px;font-size:10px;color:#64748b;font-weight:600">ペース</th>
          <th class="pd-col-sec" style="padding:6px;font-size:10px;color:#64748b;font-weight:600">タイム</th>
          <th class="pd-col-sec" style="padding:6px;font-size:10px;color:#64748b;font-weight:600">上がり</th>
        </tr></thead>
        <tbody>${rowsHtml||'<tr><td colspan="10" style="text-align:center;color:#9ca3af;padding:16px">データなし</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
  modal.style.display='flex';
  document.body.style.overflow='hidden';
}
function closePosDetailModal(){
  const m=document.getElementById('pos-detail-modal');
  if(m){m.style.display='none';document.body.style.overflow='';}
  document.querySelectorAll('td.matrix-cell-selected').forEach(t=>t.classList.remove('matrix-cell-selected'));
}


// ── 好走馬一覧テーブル ──
function renderResultTable(winners,topN){const tbody=document.getElementById('ana-result-tbody');if(!tbody)return;const sorted=[...winners].sort((a,b)=>a.raceNo-b.raceNo||a.chakujun-b.chakujun);tbody.innerHTML=sorted.map(h=>{const cCls=h.chakujun===1?'chakujun-1':h.chakujun===2?'chakujun-2':h.chakujun===3?'chakujun-3':'';const wCls=`waku-${Math.min(Math.max(parseInt(h.wakuBan)||1,1),8)}`;const pCls=paceKey(h.paceType);const mCls=mukaeColor(h.mukaeShoumen),sCls=straightColor(h.shoumenStraight);return`<tr class="horse-row"><td><span class="umano-badge">${escapeHTML(h.raceNo)}R</span></td><td><span class="chakujun-badge ${cCls}">${escapeHTML(h.chakujun)}</span></td><td><span class="waku-badge ${wCls}">${escapeHTML(h.wakuBan)}</span></td><td><span class="umano-badge">${escapeHTML(h.umaBan)}</span></td><td style="text-align:left;font-weight:700">${escapeHTML(h.horseName)}</td><td>${escapeHTML(h.jockey)||'—'}</td><td style="font-family:monospace;font-weight:700">${h.first3f!=null?h.first3f.toFixed(1)+'秒':'—'}</td><td><span class="pace-label pace-label-${pCls}">${escapeHTML(h.paceType)||'—'}</span></td><td class="${mCls}">${escapeHTML(h.mukaeShoumen)||'—'}</td><td class="${sCls}">${escapeHTML(h.shoumenStraight)||'—'}</td><td style="font-family:monospace">${escapeHTML(h.time)||'—'}</td><td style="font-family:monospace">${escapeHTML(h.agari3f)||'—'}</td></tr>`;}).join('');if(!sorted.length)tbody.innerHTML='<tr><td colspan="12" class="no-data">好走馬のデータがありません</td></tr>';}

// ── 凡走馬一覧テーブル ──
function renderLoserTable(){
  const tbody=document.getElementById('ana-loser-tbody');if(!tbody)return;
  const fromSel=document.getElementById('ana-loser-from');
  const fromN=fromSel?parseInt(fromSel.value)||6:6;
  const allValid=window._anaValidHorses||[];
  const losers=allValid.filter(h=>h.chakujun>=fromN).sort((a,b)=>a.raceNo-b.raceNo||a.chakujun-b.chakujun);
  const countEl=document.getElementById('ana-loser-count');
  if(countEl)countEl.textContent=`${losers.length}頭`;
  const cCls=c=>c===1?'chakujun-1':c===2?'chakujun-2':c===3?'chakujun-3':'';
  const pCls=p=>paceKey(p);
  tbody.innerHTML=losers.map(h=>{
    const wCls=`waku-${Math.min(Math.max(parseInt(h.wakuBan)||1,1),8)}`;
    const mCls=mukaeColor(h.mukaeShoumen),sCls=straightColor(h.shoumenStraight);
    return`<tr class="horse-row"><td><span class="umano-badge">${escapeHTML(h.raceNo)}R</span></td><td><span class="chakujun-badge ${cCls(h.chakujun)}">${escapeHTML(h.chakujun)}</span></td><td><span class="waku-badge ${wCls}">${escapeHTML(h.wakuBan)}</span></td><td><span class="umano-badge">${escapeHTML(h.umaBan)}</span></td><td style="text-align:left;font-weight:700">${escapeHTML(h.horseName)}</td><td>${escapeHTML(h.jockey)||'—'}</td><td style="font-family:monospace;font-weight:700">${h.first3f!=null?h.first3f.toFixed(1)+'秒':'—'}</td><td><span class="pace-label pace-label-${pCls(h.paceType)}">${escapeHTML(h.paceType)||'—'}</span></td><td class="${mCls}">${escapeHTML(h.mukaeShoumen)||'—'}</td><td class="${sCls}">${escapeHTML(h.shoumenStraight)||'—'}</td><td style="font-family:monospace">${escapeHTML(h.time)||'—'}</td><td style="font-family:monospace">${escapeHTML(h.agari3f)||'—'}</td></tr>`;
  }).join('');
  if(!losers.length)tbody.innerHTML=`<tr><td colspan="12" class="no-data">${fromN}着以下のデータがありません</td></tr>`;
}

// ── 好走/凡走タブ切り替え ──
function anaShowTab(tab){
  document.getElementById('ana-panel-winner').classList.toggle('hidden',tab!=='winner');
  document.getElementById('ana-panel-loser').classList.toggle('hidden',tab!=='loser');
  document.getElementById('ana-tab-winner').classList.toggle('active',tab==='winner');
  document.getElementById('ana-tab-loser').classList.toggle('active',tab==='loser');
}

// ── 上がり3Fランキング フィルタ更新 ──
function updateAgariFilters(allHorses){
  const distSel=document.getElementById('ana-agari-dist');
  const clsSel=document.getElementById('ana-agari-class');
  if(distSel){
    const cur=distSel.value;
    const distSet=new Set(allHorses.map(h=>h.distance).filter(d=>d&&d.trim()));
    const distArr=[...distSet].sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0));
    while(distSel.options.length>1)distSel.remove(1);
    distArr.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;distSel.appendChild(o);});
    if(cur&&distArr.includes(cur))distSel.value=cur;
  }
  if(clsSel){
    const cur=clsSel.value;
    const clsSet=new Set(allHorses.map(h=>h.raceClass).filter(c=>c&&c.trim()));
    const clsArr=[...clsSet].sort((a,b)=>{const ia=CLASS_ORDER.indexOf(a),ib=CLASS_ORDER.indexOf(b);if(ia===-1&&ib===-1)return a.localeCompare(b);if(ia===-1)return 1;if(ib===-1)return -1;return ia-ib;});
    while(clsSel.options.length>1)clsSel.remove(1);
    clsArr.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;clsSel.appendChild(o);});
    if(cur&&clsArr.includes(cur))clsSel.value=cur;
  }
}

// ── 上がり3Fランキング（フィルタ対応） ──
function renderAgariRankingFromState(){
  const horses=window._anaAgariHorses||[];
  renderAgariRanking(horses);
}

function renderAgariRanking(allHorses){
  const tbody=document.getElementById('ana-agari-tbody');if(!tbody)return;
  const topNSel=document.getElementById('ana-agari-top-n');
  const topN=topNSel?parseInt(topNSel.value)||0:10;
  const distSel=document.getElementById('ana-agari-dist');
  const clsSel=document.getElementById('ana-agari-class');
  const filterDist=distSel?distSel.value:'';
  const filterCls=clsSel?clsSel.value:'';
  function parseF(v){if(v==null)return null;const n=parseFloat(String(v).replace(/[^\d.]/g,''));return isNaN(n)?null:n;}
  let filtered=allHorses;
  if(filterDist)filtered=filtered.filter(h=>h.distance===filterDist);
  if(filterCls)filtered=filtered.filter(h=>h.raceClass===filterCls);
  const ranked=filtered.map(h=>({...h,agari3fNum:parseF(h.agari3f),first3fNum:parseF(h.first3f)})).filter(h=>h.agari3fNum!==null).sort((a,b)=>a.agari3fNum-b.agari3fNum);
  const display=topN>0?ranked.slice(0,topN):ranked;
  if(!display.length){tbody.innerHTML=`<tr><td colspan="10" class="no-data">${filterDist||filterCls?'フィルタ条件に一致する':''}上がり3Fデータがありません</td></tr>`;return;}
  const cCls=c=>c===1?'chakujun-1':c===2?'chakujun-2':c===3?'chakujun-3':'';
  tbody.innerHTML=display.map((h,i)=>{const rank=i+1,isBest=rank===1,wCls=`waku-${Math.min(Math.max(parseInt(h.wakuBan)||1,1),8)}`;
    const distTag=filterDist?'':(h.distance?`<span style="font-size:9px;color:#6b7280;margin-left:3px">${escapeHTML(h.distance)}</span>`:'');
    const f3Cell=h.first3fNum!=null?`<span style="font-family:monospace">${h.first3fNum.toFixed(1)}</span>`:'<span style="color:#d1d5db">—</span>';
    return `<tr class="horse-row${isBest?' agari-rank-1':''}">
      <td><span class="agari-rank-badge${rank<=3?' agari-rank-top':''}">${rank}</span></td>
      <td><span class="umano-badge">${escapeHTML(h.raceNo)}R</span></td>
      <td><span class="chakujun-badge ${cCls(h.chakujun)}">${h.chakujun<900?escapeHTML(h.chakujun):'—'}</span></td>
      <td><span class="waku-badge ${wCls}">${escapeHTML(h.wakuBan)||'—'}</span></td>
      <td><span class="umano-badge">${escapeHTML(h.umaBan)}</span></td>
      <td style="text-align:left;font-weight:700">${escapeHTML(h.horseName)}${distTag}</td>
      <td style="font-family:monospace;color:#374151">${f3Cell}</td>
      <td style="font-family:monospace;font-weight:800;color:${isBest?'#b8860b':rank<=3?'#1d4ed8':'#111'}">${h.agari3fNum.toFixed(1)}<small>秒</small></td>
      <td style="font-family:monospace">${escapeHTML(h.time)||'—'}</td>
      <td>${h.ninki?escapeHTML(h.ninki)+'人気':'—'}</td>
    </tr>`;
  }).join('');
}

// ── 向正面×直線 ポジションマトリクス ──
// グローバル：マトリクスセルデータ保持（クリックハンドラから参照）
window._matrixCells = {};

// グローバル：マトリクスセルタップ時の詳細表示
window._showMatrixCell = function(td) {
  const key = td.dataset.key;
  if (!key) return;
  const c = window._matrixCells[key];
  if (!c) return;
  const parts = key.split('__');
  const m = parts[0], s = parts[1];
  // 選択セルのハイライト（他を解除）
  const wrap = document.getElementById('ana-matrix-wrap');
  if (wrap) wrap.querySelectorAll('td.matrix-clickable').forEach(t => t.classList.remove('matrix-cell-selected'));
  td.classList.add('matrix-cell-selected');
  openPosDetailModal(`向正面:${m} × 直線:${s}`, 'matrix', c.win, c.lose);
};

function renderPositionMatrix(validHorses,winners,topN){
  const wrap=document.getElementById('ana-matrix-wrap');if(!wrap)return;
  const mukaeLabels=['最内','内','外2','外3','大外'];
  const straightLabels=['内','中','外'];
  const usedMukae=mukaeLabels.filter(m=>validHorses.some(h=>h.mukaeShoumen===m));
  const usedStraight=straightLabels.filter(s=>validHorses.some(h=>h.shoumenStraight===s));
  if(!usedMukae.length||!usedStraight.length){wrap.innerHTML='<p class="ana-empty">向正面・直線ポジションのデータがありません</p>';return;}

  // 各セルのデータ計算（キーはダブルアンダースコアで統一）
  const cells={};let maxRate=0;
  usedMukae.forEach(m=>{
    usedStraight.forEach(s=>{
      const key=`${m}__${s}`;
      const all=validHorses.filter(h=>h.mukaeShoumen===m&&h.shoumenStraight===s);
      const win=all.filter(h=>h.chakujun<=topN);
      const rate=all.length?Math.round(win.length/all.length*100):null;
      cells[key]={win,lose:all.filter(h=>h.chakujun>topN),all,rate};
      if(rate!==null&&rate>maxRate)maxRate=rate;
    });
  });

  // グローバル変数に保存（onclickから参照できるようにする）
  window._matrixCells = cells;

  // 行・列の合計を事前計算
  const rowTotals={}, colTotals={};
  let grandWin=0, grandAll=0;
  usedMukae.forEach(m=>{
    rowTotals[m]={win:0,all:0};
    usedStraight.forEach(s=>{
      const c=cells[`${m}__${s}`];
      if(c&&c.all.length){rowTotals[m].win+=c.win.length;rowTotals[m].all+=c.all.length;}
    });
    grandWin+=rowTotals[m].win; grandAll+=rowTotals[m].all;
  });
  usedStraight.forEach(s=>{
    colTotals[s]={win:0,all:0};
    usedMukae.forEach(m=>{
      const c=cells[`${m}__${s}`];
      if(c&&c.all.length){colTotals[s].win+=c.win.length;colTotals[s].all+=c.all.length;}
    });
  });

  const totCellHtml=(win,all)=>{
    if(!all)return`<td class="matrix-total--empty">—</td>`;
    const r=Math.round(win/all*100);
    return`<td class="matrix-total">
      <div class="ana-matrix-cell"><span class="matrix-rate">${r}%</span><span class="matrix-count">${win}/${all}走</span></div>
    </td>`;
  };

  // テーブル生成（セルにonclick属性を直接埋め込み）
  let html=`<table class="ana-matrix-table">
    <thead><tr>
      <th style="background:#5b21b6">向正面 ＼ 直線</th>
      ${usedStraight.map(s=>`<th>${s}</th>`).join('')}
      <th style="background:#3b0764">計</th>
    </tr></thead>
    <tbody>`;
  usedMukae.forEach(m=>{
    html+=`<tr><td class="matrix-row-header">向正面：${m}</td>`;
    usedStraight.forEach(s=>{
      const key=`${m}__${s}`;
      const c=cells[key];
      if(!c||c.all.length===0){html+=`<td><span class="matrix-empty">—</span></td>`;return;}
      const isBest=c.rate===maxRate&&maxRate>0&&c.all.length>=2;
      const isHot=c.rate>=50&&!isBest&&c.all.length>=2;
      const isCold=c.rate===0&&c.all.length>=2;
      const cls=isBest?'matrix-best':isHot?'matrix-hot':isCold?'matrix-cold':'';
      html+=`<td class="${cls} matrix-clickable" data-key="${key}" title="タップで馬一覧を表示" onclick="window._showMatrixCell(this)">
        <div class="ana-matrix-cell">
          <span class="matrix-rate">${c.rate}%</span>
          <span class="matrix-count">${c.win.length}/${c.all.length}走</span>
          <span class="matrix-tap-hint"><i class="fas fa-hand-pointer"></i></span>
        </div>
      </td>`;
    });
    html+=totCellHtml(rowTotals[m].win,rowTotals[m].all)+'</tr>';
  });
  // 列合計行
  html+=`<tr><td class="matrix-row-header" style="background:#3b0764;color:#e9d5ff">計</td>`;
  usedStraight.forEach(s=>{ html+=totCellHtml(colTotals[s].win,colTotals[s].all); });
  html+=totCellHtml(grandWin,grandAll)+'</tr>';
  html+='</tbody></table>';
  html+=`<p class="matrix-legend">
    <span style="display:inline-block;width:12px;height:12px;background:#dcfce7;border:2px solid #22c55e;border-radius:2px;vertical-align:middle;margin-right:3px"></span>最高好走率&nbsp;&nbsp;
    <span style="display:inline-block;width:12px;height:12px;background:#fef3c7;border:2px solid #f59e0b;border-radius:2px;vertical-align:middle;margin-right:3px"></span>好走率50%以上&nbsp;&nbsp;
    <span style="display:inline-block;width:12px;height:12px;background:#fee2e2;border-radius:2px;vertical-align:middle;margin-right:3px"></span>0%&nbsp;&nbsp;※2走以上のセルに適用
  </p>`;

  // セル詳細エリア（テーブル下に1つ共通で展開）
  html+=`<div id="ana-matrix-detail" class="ana-matrix-cell-detail hidden"></div>`;

  wrap.innerHTML=html;
}
function updateCompareRaceSelect(allHorses){
  const container=document.getElementById('ana-compare-checklist');if(!container)return;
  const prevChecked=new Set(Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(el=>el.value));
  const raceMap={};
  allHorses.forEach(h=>{if(!raceMap[h.raceNo])raceMap[h.raceNo]=h.raceName||`第${h.raceNo}レース`;});
  const raceNos=Object.keys(raceMap).sort((a,b)=>parseInt(a)-parseInt(b));
  container.innerHTML=raceNos.map(rn=>{
    const checked=prevChecked.has(String(rn))?'checked':'';
    return `<label class="compare-check-label"><input type="checkbox" class="compare-check" value="${rn}" ${checked} onchange="renderRaceCompare()"><span class="compare-check-rno">${rn}R</span><span class="compare-check-name">${raceMap[rn]}</span></label>`;
  }).join('');
}
// ── レース内比較：タブ切り替え ──
function cmpSwitchTab(tab) {
  ['race','rank'].forEach(t => {
    const btn = document.getElementById(`cmp-tab-${t}`);
    const pnl = document.getElementById(`cmp-panel-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pnl) pnl.classList.toggle('hidden', t !== tab);
  });
  if (tab === 'rank') renderCompareRanking();
}

// ── チェック中レースの全馬データを取得するヘルパー ──
function _getCheckedRaceHorses() {
  const container = document.getElementById('ana-compare-checklist');
  const checkedNos = container
    ? Array.from(container.querySelectorAll('input[type=checkbox]:checked'))
        .map(el => parseInt(el.value)).filter(n => !isNaN(n))
    : [];
  if (!checkedNos.length) return { checkedNos: [], allHorses: [], raceInfoMap: {} };

  const memRaces = (typeof allRacesData !== 'undefined') ? allRacesData : {};
  const lsData = lsRead();
  const selVal = document.getElementById('ana-date-select')?.value || '';
  const [targetDate, targetBaba] = selVal.split('__');
  function parseNum(v) { const n = parseFloat(String(v||'').replace(/[^\d.]/g,'')); return isNaN(n) ? null : n; }

  const allHorses = [];
  const raceInfoMap = {};
  checkedNos.forEach(raceNo => {
    let horses = [], raceInfo = null;
    if (memRaces[raceNo]) {
      raceInfo = memRaces[raceNo].raceInfo;
      horses   = memRaces[raceNo].horses || [];
    } else {
      const raceEntry = Object.values(lsData).find(v => v.type==='race' && v.race_date===targetDate && v.baba_code===targetBaba && v.race_no===raceNo);
      if (raceEntry) {
        raceInfo = { raceName: raceEntry.race_name, distance: raceEntry.distance, raceClass: raceEntry.race_class || raceEntry.raceClass };
        horses = Object.entries(lsData)
          .filter(([k,v]) => v.type==='horse' && k.startsWith(`${targetBaba}_${targetDate}_${raceNo}_`))
          .map(([k,v]) => ({ ...v, umaBan: parseInt(k.split('_').pop()) }));
      }
    }
    raceInfoMap[raceNo] = raceInfo || {};
    horses.forEach(h => {
      allHorses.push({
        ...h,
        _raceNo: raceNo,
        agari3fNum:  parseNum(h.agari3f),
        first3fNum:  parseNum(h.first3f),
        chakujunNum: parseInt(h.chakujun) || 999,
        ninkiNum:    parseInt(h.ninki)    || 999,
      });
    });
  });
  return { checkedNos, allHorses, raceInfoMap };
}

function renderRaceCompare() {
  const area = document.getElementById('ana-compare-area'); if (!area) return;
  const { checkedNos, allHorses, raceInfoMap } = _getCheckedRaceHorses();
  if (!checkedNos.length) { area.innerHTML = '<p class="ana-empty" style="padding:12px">レースにチェックを入れてください</p>'; return; }

  const cCls = c => c===1?'chakujun-1':c===2?'chakujun-2':c===3?'chakujun-3':'';

  // _timeNum を付与
  allHorses.forEach(h => { if (h._timeNum === undefined) h._timeNum = raceTimeToSec(h.time); });

  // 全チェックレースにまたがる上位3位を計算
  const MEDALS = ['🥇','🥈','🥉'];
  function crossRankMap(horses, valFn, sentinel) {
    const valid = horses.filter(h => valFn(h) != null && valFn(h) < sentinel)
                        .sort((a,b) => valFn(a) - valFn(b));
    const map = new Map();
    let rank = 0, prev = null;
    for (const h of valid) {
      const v = valFn(h);
      if (v !== prev) { rank++; prev = v; }
      if (rank <= 3) map.set(h, rank);
    }
    return map;
  }
  const f3RankMap    = crossRankMap(allHorses, h => h.first3fNum, 900);
  const agariRankMap = crossRankMap(allHorses, h => h.agari3fNum, 900);
  const timeRankMap  = crossRankMap(allHorses, h => h._timeNum,   9999);

  const blocks = checkedNos.map(raceNo => {
    const horses = allHorses.filter(h => h._raceNo === raceNo);
    if (!horses.length) return `<p class="ana-empty">${raceNo}R 馬データがありません</p>`;
    const sorted = [...horses].sort((a,b) => a.chakujunNum !== b.chakujunNum ? a.chakujunNum - b.chakujunNum : (a.umaBan||0)-(b.umaBan||0));
    const bestAgari = Math.min(...sorted.map(h=>h.agari3fNum).filter(v=>v!==null), Infinity);
    const bestF3    = Math.min(...sorted.map(h=>h.first3fNum).filter(v=>v!==null), Infinity);
    const rows = sorted.map(h => {
      const isA = h.agari3fNum !== null && h.agari3fNum === bestAgari;
      const isF = h.first3fNum !== null && h.first3fNum === bestF3;
      const wCls = `waku-${Math.min(Math.max(parseInt(h.wakuBan)||1,1),8)}`;
      const f3Medal    = f3RankMap.has(h)    ? `<span style="font-size:11px">${MEDALS[f3RankMap.get(h)-1]}</span>`    : '';
      const agMedal    = agariRankMap.has(h) ? `<span style="font-size:11px">${MEDALS[agariRankMap.get(h)-1]}</span>` : '';
      const timeMedal  = timeRankMap.has(h)  ? `<span style="font-size:11px">${MEDALS[timeRankMap.get(h)-1]}</span>`  : '';
      return `<tr class="horse-row">
        <td><span class="chakujun-badge ${cCls(h.chakujunNum)}">${h.chakujunNum<900?h.chakujunNum:'—'}</span></td>
        <td><span class="waku-badge ${wCls}">${h.wakuBan||'—'}</span></td>
        <td><span class="umano-badge">${h.umaBan}</span></td>
        <td style="text-align:left;font-weight:700">${escapeHTML(h.horseName)||'—'}</td>
        <td class="compare-cell ${isF?'compare-best-f3':''}">${h.first3fNum!==null?h.first3fNum.toFixed(1):'—'}${isF?' 🏇':''}${f3Medal}</td>
        <td class="compare-cell ${isA?'compare-best-agari':''}">${h.agari3fNum!==null?h.agari3fNum.toFixed(1):'—'}${isA?' ⚡':''}${agMedal}</td>
        <td style="font-family:monospace">${escapeHTML(h.time)||'—'}${timeMedal}</td>
        <td>${h.ninkiNum<900?escapeHTML(h.ninkiNum)+'人気':'—'}</td>
        <td>${escapeHTML(h.jockey)||'—'}</td>
      </tr>`;
    }).join('');
    const ri = raceInfoMap[raceNo] || {};
    const cls = ri.raceClass ? `<span class="race-class-badge ${raceClassCssClass(ri.raceClass)}" style="font-size:11px;padding:1px 6px">${escapeHTML(ri.raceClass)}</span>` : '';
    return `<div class="compare-race-block">
      <div class="compare-race-header"><span class="compare-race-name">${raceNo}R ${escapeHTML(ri.raceName)}</span><span class="compare-race-meta">${escapeHTML(ri.distance)}</span>${cls}</div>
      <div class="table-wrapper"><table class="deban-table ana-result-table">
        <thead><tr><th>着順</th><th>枠</th><th>馬番</th><th>馬名</th><th>前半3F 🏇</th><th>上がり3F ⚡</th><th>タイム</th><th>人気</th><th>騎手</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  });
  area.innerHTML = blocks.join('') + '<div class="compare-legend"><span>🏇 前半3F最速（レース内）</span><span>⚡ 上がり3F最速（レース内）</span><span>🥇🥈🥉 全レース内順位</span></div>';

  // ランキングも同時更新（タブが表示中なら）
  if (!document.getElementById('cmp-panel-rank')?.classList.contains('hidden')) {
    renderCompareRanking();
  }
}

// ── 全馬ランキング比較 ──
function renderCompareRanking() {
  const area = document.getElementById('cmp-rank-area'); if (!area) return;
  const { checkedNos, allHorses } = _getCheckedRaceHorses();
  if (!checkedNos.length || !allHorses.length) {
    area.innerHTML = '<p class="ana-empty" style="padding:12px">レースを選択してください</p>';
    return;
  }
  const key = document.getElementById('cmp-rank-key')?.value || 'agari3f';

  // _timeNum を付与
  allHorses.forEach(h => { if (h._timeNum === undefined) h._timeNum = raceTimeToSec(h.time); });

  let sortFn, valFn, labelFn, unitStr = '', keyLabel = '', sub1Label = '', sub2Label = '';

  if (key === 'agari3f') {
    valFn    = h => h.agari3fNum;
    sortFn   = (a,b) => (a.agari3fNum??999) - (b.agari3fNum??999);
    labelFn  = h => h.agari3fNum !== null ? h.agari3fNum.toFixed(1) + '秒' : '—';
    unitStr  = '（速い順）'; keyLabel = '上がり3F'; sub1Label = '前半3F'; sub2Label = 'タイム';
  } else if (key === 'first3f') {
    valFn    = h => h.first3fNum;
    sortFn   = (a,b) => (a.first3fNum??999) - (b.first3fNum??999);
    labelFn  = h => h.first3fNum !== null ? h.first3fNum.toFixed(1) + '秒' : '—';
    unitStr  = '（速い順）'; keyLabel = '前半3F'; sub1Label = 'タイム'; sub2Label = '上がり3F';
  } else { // time
    valFn    = h => h._timeNum;
    sortFn   = (a,b) => (a._timeNum??9999) - (b._timeNum??9999);
    labelFn  = h => h._timeNum != null ? h.time : '—';
    unitStr  = '（速い順）'; keyLabel = 'タイム'; sub1Label = '前半3F'; sub2Label = '上がり3F';
  }

  const isTimeBased = (key === 'time');
  const sentinel    = isTimeBased ? 9999 : 900;
  const hasVal  = allHorses.filter(h => valFn(h) != null && valFn(h) < sentinel);
  const noVal   = allHorses.filter(h => valFn(h) == null || valFn(h) >= sentinel);
  hasVal.sort(sortFn);
  const ranked  = [...hasVal, ...noVal];

  const vals = hasVal.map(h => valFn(h));
  const minV = vals.length ? Math.min(...vals) : 0;
  const maxV = vals.length ? Math.max(...vals) : 1;
  const range = maxV - minV || 1;

  const R_PALETTE = ['#1a56a0','#e84040','#16a34a','#e8a020','#7c3aed','#0891b2','#be123c','#065f46','#92400e','#4f46e5','#0369a1','#9a3412'];
  const raceColorMap = {};
  checkedNos.forEach((rn, i) => { raceColorMap[rn] = R_PALETTE[i % R_PALETTE.length]; });

  const rows = ranked.map((h, idx) => {
    const rank  = idx + 1;
    const hasV  = valFn(h) != null && valFn(h) < sentinel;
    const v     = valFn(h);
    const color = raceColorMap[h._raceNo] || '#6b7280';
    const isTop = idx === 0 && hasV;
    const wCls  = `waku-${Math.min(Math.max(parseInt(h.wakuBan)||1,1),8)}`;

    // サブ列の値
    let sub1 = '—', sub2 = '—';
    if (key === 'agari3f') {
      sub1 = h.first3fNum != null ? h.first3fNum.toFixed(1) : '—';
      sub2 = h.time || '—';
    } else if (key === 'first3f') {
      sub1 = h.time || '—';
      sub2 = h.agari3fNum != null ? h.agari3fNum.toFixed(1) : '—';
    } else {
      sub1 = h.first3fNum != null ? h.first3fNum.toFixed(1) : '—';
      sub2 = h.agari3fNum != null ? h.agari3fNum.toFixed(1) : '—';
    }

    return `<tr class="horse-row" style="${isTop?'background:#fffbeb':''}">
      <td style="font-weight:700;color:${rank<=3?['#d97706','#6b7280','#b45309'][rank-1]:'#374151'};text-align:center;min-width:28px">
        ${rank<=3?['🥇','🥈','🥉'][rank-1]:rank}
      </td>
      <td style="text-align:center"><span style="display:inline-block;background:${color};color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;min-width:28px">${escapeHTML(h._raceNo)}R</span></td>
      <td><span class="waku-badge ${wCls}" style="font-size:10px;width:18px;height:18px">${escapeHTML(h.wakuBan)||'—'}</span></td>
      <td><span class="umano-badge" style="font-size:10px;width:18px;height:18px">${escapeHTML(h.umaBan)||'—'}</span></td>
      <td style="text-align:left;font-weight:700;font-size:12px">${escapeHTML(h.horseName)||'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;min-width:140px">
          <span style="font-weight:700;font-size:12px;min-width:52px;text-align:right;${isTop?'color:#d97706':''}">${labelFn(h)}</span>
          ${hasV ? `<div style="flex:1;background:#f1f5f9;border-radius:4px;height:8px;overflow:hidden;min-width:60px">
            <div style="width:${Math.max(2, Math.round((maxV - v) / range * 100))}%;height:100%;background:${color};border-radius:4px;transition:width .3s"></div>
          </div>` : ''}
        </div>
      </td>
      <td style="font-size:11px;font-family:monospace;color:#4b5563">${sub1}</td>
      <td style="font-size:11px;font-family:monospace;color:#4b5563">${sub2}</td>
      <td style="font-size:11px;color:#6b7280">${h.jockey||'—'}</td>
    </tr>`;
  }).join('');

  area.innerHTML = `
    <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
      ${checkedNos.map((rn,i)=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px"><span style="display:inline-block;width:10px;height:10px;background:${raceColorMap[rn]};border-radius:50%"></span>${rn}R</span>`).join('')}
    </div>
    <div class="table-wrapper">
      <table class="deban-table ana-result-table">
        <thead><tr>
          <th style="min-width:30px">順位</th><th>R</th><th>枠</th><th>馬番</th><th style="text-align:left">馬名</th>
          <th style="text-align:left">${keyLabel} ${unitStr}</th>
          <th>${sub1Label}</th><th>${sub2Label}</th><th>騎手</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function countByKey(arr,keyFn){const map={};arr.forEach(item=>{const k=keyFn(item);if(k)map[k]=(map[k]||0)+1;});return map;}
function topEntry(map){const e=Object.entries(map).filter(([k])=>k);if(!e.length)return null;return e.sort((a,b)=>b[1]-a[1])[0];}
function median(arr){const s=[...arr].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2!==0?s[m]:(s[m-1]+s[m])/2;}
function paceKey(p){return p==='ハイ'?'high':p==='ミドル'?'mid':p==='スロー'?'slow':'none';}

// ════════════════════════════════════════════════════════════
// 馬特徴メモ（タグ記憶）
// ════════════════════════════════════════════════════════════
const HORSE_NOTE_TAGS = [
  { id: 'yoi_ok',      label: '良得意',      color: '#15803d', bg: '#dcfce7' },
  { id: 'furyou_ok',   label: '不良得意',    color: '#1d4ed8', bg: '#dbeafe' },
  { id: 'michiaku_ng', label: '道悪NG',      color: '#b91c1c', bg: '#fee2e2' },
  { id: 'suna_ng',     label: '砂被りNG',    color: '#92400e', bg: '#fef3c7' },
  { id: 'inner_ng',    label: '内枠NG',      color: '#7c3aed', bg: '#ede9fe' },
  { id: 'outer_ok',    label: '外枠得意',    color: '#0891b2', bg: '#e0f2fe' },
  { id: 'nodo_nari',   label: '喉鳴り',      color: '#dc2626', bg: '#fee2e2' },
  { id: 'yasumi_ng',   label: '休み明けNG',  color: '#6b7280', bg: '#f1f5f9' },
  { id: 'tataki',      label: '叩き良化',    color: '#15803d', bg: '#dcfce7' },
  { id: 'dist_up_ok',  label: '距離延長得意', color: '#0891b2', bg: '#e0f2fe' },
  { id: 'nige_only',   label: '逃げ専',      color: '#dc2626', bg: '#fee2e2' },
];

function getHorseTags(horseName) {
  const d = lsRead()[`horseNote_${horseName}`];
  return (d && Array.isArray(d.tags)) ? d.tags : [];
}
function getHorseMemo(horseName) {
  const d = lsRead()[`horseNote_${horseName}`];
  return (d && d.memo) ? d.memo : '';
}
function saveHorseTags(horseName, tags, memo) {
  lsWrite(`horseNote_${horseName}`, { type: 'horseNote', tags, memo: memo != null ? memo : getHorseMemo(horseName) });
}

function horseTagBadgesHtml(horseName) {
  const tags = getHorseTags(horseName);
  const memo = getHorseMemo(horseName);
  const badges = tags.map(id => {
    const t = HORSE_NOTE_TAGS.find(x => x.id === id);
    return t
      ? `<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:${t.bg};color:${t.color};font-weight:700;white-space:nowrap;">${t.label}</span>`
      : '';
  }).join('');
  const memoBadge = memo
    ? `<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:#f1f5f9;color:#475569;white-space:nowrap;" title="${escapeHTML(memo)}">📝${escapeHTML(memo.slice(0,6))}${memo.length>6?'…':''}</span>`
    : '';
  return badges + memoBadge;
}

function showHorseNoteEditor(horseName, btn) {
  const existing = document.getElementById('horse-note-popup');
  if (existing) {
    if (existing.dataset.horse === horseName) { existing.remove(); return; }
    existing.remove();
  }
  const tags = getHorseTags(horseName);
  const memo = getHorseMemo(horseName);
  const popup = document.createElement('div');
  popup.id = 'horse-note-popup';
  popup.dataset.horse = horseName;
  popup.style.cssText = 'position:fixed;z-index:20000;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 12px;box-shadow:0 4px 24px rgba(0,0,0,.18);min-width:210px;max-width:260px;';
  const rect = btn.getBoundingClientRect();
  popup.style.left = Math.min(rect.left, window.innerWidth - 270) + 'px';
  popup.style.top  = Math.min(rect.bottom + 4, window.innerHeight - 260) + 'px';
  popup.innerHTML = `
    <div style="font-size:10px;font-weight:800;color:#1e293b;margin-bottom:7px;border-bottom:1px solid #f1f5f9;padding-bottom:5px;">特徴タグ：${escapeHTML(horseName)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
      ${HORSE_NOTE_TAGS.map(t => {
        const on = tags.includes(t.id);
        return `<button onclick="toggleHorseTag('${jsAttrEsc(horseName)}','${t.id}',this)"
          style="font-size:9px;padding:2px 7px;border-radius:4px;cursor:pointer;transition:all .1s;
          border:1.5px solid ${on ? t.color : '#e2e8f0'};background:${on ? t.bg : '#f8fafc'};
          color:${on ? t.color : '#9ca3af'};font-weight:${on ? '700' : '400'};"
          data-tagid="${t.id}" data-on="${on}">${t.label}</button>`;
      }).join('')}
    </div>
    <div style="font-size:9px;color:#6b7280;margin-bottom:3px;">メモ（自由記入）</div>
    <input id="horse-memo-input" type="text" value="${escapeHTML(memo)}"
      placeholder="例: 内枠は苦手、距離◎"
      style="width:100%;padding:4px 8px;border:1.5px solid #e2e8f0;border-radius:5px;font-size:10px;box-sizing:border-box;outline:none;"
      oninput="saveHorseTagsFromPopup('${jsAttrEsc(horseName)}')">
    <div style="text-align:right;margin-top:7px;">
      <button onclick="document.getElementById('horse-note-popup')?.remove()"
        style="font-size:10px;padding:3px 10px;border-radius:5px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#374151;">閉じる</button>
    </div>`;
  document.body.appendChild(popup);
  setTimeout(() => {
    document.addEventListener('click', function _close(e) {
      if (!popup.contains(e.target) && e.target !== btn) {
        popup.remove();
        document.removeEventListener('click', _close);
      }
    });
  }, 80);
}

function toggleHorseTag(horseName, tagId, btn) {
  const tags = getHorseTags(horseName);
  const on   = tags.includes(tagId);
  const newTags = on ? tags.filter(t => t !== tagId) : [...tags, tagId];
  saveHorseTags(horseName, newTags);
  const t  = HORSE_NOTE_TAGS.find(x => x.id === tagId);
  const now = !on;
  btn.dataset.on   = now;
  btn.style.border = `1.5px solid ${now ? t.color : '#e2e8f0'}`;
  btn.style.background = now ? t.bg : '#f8fafc';
  btn.style.color      = now ? t.color : '#9ca3af';
  btn.style.fontWeight = now ? '700' : '400';
  // 馬名セルのバッジを全更新
  document.querySelectorAll(`.horse-tag-badges[data-horse="${CSS.escape(horseName)}"]`).forEach(el => {
    el.innerHTML = horseTagBadgesHtml(horseName);
  });
}

function saveHorseTagsFromPopup(horseName) {
  const tags = getHorseTags(horseName);
  const memo = document.getElementById('horse-memo-input')?.value || '';
  saveHorseTags(horseName, tags, memo);
  document.querySelectorAll(`.horse-tag-badges[data-horse="${CSS.escape(horseName)}"]`).forEach(el => {
    el.innerHTML = horseTagBadgesHtml(horseName);
  });
}

// ── 脚質成績（1角位置から逃げ/先行/差し/追い込みを判定） ──
function renderCornerChart(winners, losers, allValid) {
  const wrap = document.getElementById('ana-corner-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const getFirstPos = h => {
    const parts = String(h.corner || '').replace(/[^\d\-]/g,'').split('-').map(Number).filter(n => n > 0);
    return parts.length > 0 ? parts[0] : null;
  };

  const GROUPS = [
    { label: '逃げ',     test: n => n <= 2,           color: '#dc2626' },
    { label: '先行',     test: n => n >= 3 && n <= 5, color: '#d97706' },
    { label: '差し',     test: n => n >= 6 && n <= 9, color: '#0891b2' },
    { label: '追い込み', test: n => n >= 10,           color: '#7c3aed' },
  ];

  const rows = [];
  GROUPS.forEach(g => {
    const w = winners.filter(h => { const p = getFirstPos(h); return p !== null && g.test(p); });
    const l = losers.filter(h  => { const p = getFirstPos(h); return p !== null && g.test(p); });
    const total = w.length + l.length;
    if (!total) return;
    rows.push({ label: g.label, rate: Math.round(w.length / total * 100), w, l, total, color: g.color });
  });

  if (!rows.length) { wrap.innerHTML = '<p class="ana-empty">脚質データなし</p>'; return; }

  rows.forEach(r => {
    const nkNums=r.w.map(h=>parseInt(h.ninki)).filter(n=>n>0&&!isNaN(n));
    const avgNkW=nkNums.length?nkNums.reduce((a,b)=>a+b,0)/nkNums.length:null;
    const favLoseC=r.l.filter(h=>{const n=parseInt(h.ninki);return!isNaN(n)&&n>=1&&n<=3;}).length;
    const upsetWC=r.w.filter(h=>{const n=parseInt(h.ninki);return!isNaN(n)&&n>=6;}).length;
    const hParts=[];
    if(avgNkW!=null)hParts.push(`<span style="color:#64748b">勝均${avgNkW.toFixed(1)}人</span>`);
    if(favLoseC>0)hParts.push(`<span style="color:#dc2626;font-weight:700">⚠${favLoseC}人気凡走</span>`);
    if(upsetWC>0&&avgNkW!=null&&avgNkW>=5)hParts.push(`<span style="color:#d97706;font-weight:700">★穴${upsetWC}頭</span>`);
    const hHtml=hParts.length?`<div style="font-size:9px;padding:0 4px 3px 60px;line-height:1.4">${hParts.join('　')}</div>`:'';
    const div = document.createElement('div');
    div.className = 'ana-bar-row';
    div.style.cssText = 'cursor:pointer;border-radius:5px;padding:2px 0;transition:background .15s;display:block';
    div.innerHTML = `<div style="display:flex;align-items:center;gap:6px;padding:0 4px">
      <div class="ana-bar-label" style="width:52px;font-size:11px">${r.label}</div>
      <div class="ana-bar-track"><div class="ana-bar-fill" style="width:${r.rate}%;background:${r.color}"></div></div>
      <div class="ana-bar-stats"><span class="ana-bar-rate">${r.rate}%</span><span class="ana-bar-count">${r.w.length}/${r.total}</span></div>
    </div>${hHtml}`;
    div.addEventListener('mouseenter', () => { div.style.background = '#f0fdf4'; });
    div.addEventListener('mouseleave', () => { div.style.background = ''; });
    div.addEventListener('click', () => { openPosDetailModal(r.label,'corner',r.w,r.l); });
    wrap.appendChild(div);
  });
}

// ── 人気別好走バー（クリックで馬一覧表示対応） ──

function renderWakuBarsNew(winners,losers,allValid){
  const el=document.getElementById('ana-waku-bars');if(!el)return;
  el.innerHTML='';
  const WC=['','bar-waku-1','bar-waku-2','bar-waku-3','bar-waku-4','bar-waku-5','bar-waku-6','bar-waku-7','bar-waku-8'];
  let any=false;
  for(let w=1;w<=8;w++){
    const ws=String(w);
    const wArr=winners.filter(h=>String(h.wakuBan)===ws);
    const lArr=losers.filter(h=>String(h.wakuBan)===ws);
    const wc=wArr.length,lc=lArr.length,total=wc+lc;
    if(!total)continue;
    any=true;
    const rate=Math.round(wc/total*100);
    const row=document.createElement('div');
    row.className='ana-bar-row';
    row.style.cssText='cursor:pointer;border-radius:6px;padding:2px 4px;transition:background .15s';
    row.title=`${w}枠の馬一覧を表示`;
    const wkNkNums=wArr.map(h=>parseInt(h.ninki)).filter(n=>n>0&&!isNaN(n));
    const wkAvgNk=wkNkNums.length?wkNkNums.reduce((a,b)=>a+b,0)/wkNkNums.length:null;
    const wkFavL=lArr.filter(h=>{const n=parseInt(h.ninki);return!isNaN(n)&&n>=1&&n<=3;}).length;
    const wkUps=wArr.filter(h=>{const n=parseInt(h.ninki);return!isNaN(n)&&n>=6;}).length;
    const wkHP=[];
    if(wkAvgNk!=null)wkHP.push(`<span style="color:#64748b">勝均${wkAvgNk.toFixed(1)}人</span>`);
    if(wkFavL>0)wkHP.push(`<span style="color:#dc2626;font-weight:700">⚠${wkFavL}人気凡走</span>`);
    if(wkUps>0&&wkAvgNk!=null&&wkAvgNk>=5)wkHP.push(`<span style="color:#d97706;font-weight:700">★穴${wkUps}頭</span>`);
    const wkHHtml=wkHP.length?`<div style="font-size:9px;padding:0 4px 3px 52px;line-height:1.4">${wkHP.join('　')}</div>`:'';
    row.style.display='block';
    row.innerHTML=`<div style="display:flex;align-items:center;gap:6px;padding:0 4px"><div class="ana-bar-label waku-label"><span class="waku-mini waku-${w}">${w}</span>枠</div><div class="ana-bar-track"><div class="ana-bar-fill ${WC[w]}" style="width:${rate}%"></div></div><div class="ana-bar-stats"><span class="ana-bar-rate">${rate}%</span><span class="ana-bar-count">${wc}/${total}</span></div></div>${wkHHtml}`;
    const wNum=w;
    row.addEventListener('click',()=>{ openPosDetailModal(`${wNum}枠`,'waku',wArr,lArr); });
    row.addEventListener('mouseenter',()=>row.style.background='#f0e8ff');
    row.addEventListener('mouseleave',()=>row.style.background='');
    el.appendChild(row);
  }
  if(!any)el.innerHTML='<p class="ana-empty">枠番データなし</p>';
}
// 互換性のため旧名も保持
function posBarColor(label,type){if(type==='mukae')return{'最内':'bar-uchi0','内':'bar-uchi1','外2':'bar-soto2','外3':'bar-soto3','大外':'bar-soto4'}[label]||'bar-default';if(type==='straight')return{'内':'bar-s-uchi','中':'bar-s-naka','外':'bar-s-soto'}[label]||'bar-default';if(type==='pace')return{'ハイ':'bar-pace-high','ミドル':'bar-pace-mid','スロー':'bar-pace-slow'}[label]||'bar-default';return'bar-default';}
function mukaeColor(v){return{'最内':'ana-td-uchi0','内':'ana-td-uchi1','外2':'ana-td-soto2','外3':'ana-td-soto3','大外':'ana-td-soto4'}[v]||'';}
function straightColor(v){return{'内':'ana-td-s-uchi','中':'ana-td-s-naka','外':'ana-td-s-soto'}[v]||'';}

// ============================================================
// ラップグラフ（分析画面）
// ============================================================
let _lapChart = null;

// Chart.js の動的ロード（グラフを初めて表示した時だけ・同時要求も1回に集約）。
function ensureChartJs(cb) {
  _kvLoadLibrary('chart')
    .then(() => { if (typeof cb === 'function') cb(); })
    .catch(e => console.warn('[Chart.js]', e));
}

/** 分析画面のラップグラフ フィルターセレクト初期化（距離・クラス） */
function initLapChartDistSelect() {
  const sel      = document.getElementById('lap-chart-dist');
  const selClass = document.getElementById('lap-chart-class');
  if (!sel) return;
  const selVal = document.getElementById('ana-date-select')?.value || '';
  const [targetDate, targetBaba] = selVal.split('__');
  const lsData = lsRead();
  const dists   = new Set();
  const classes = new Set();
  Object.values(lsData).filter(v => {
    if (v.type !== 'race') return false;
    if (targetDate && v.race_date !== targetDate) return false;
    if (targetBaba && v.baba_code !== targetBaba) return false;
    let laps = v.lapTimes;
    if (!laps && v.lap_times) { try { laps = JSON.parse(v.lap_times); } catch(e){} }
    return laps && laps.some(x => x != null);
  }).forEach(v => {
    if (v.distance) dists.add(v.distance);
    // クラス取得（race_class or raceClass）
    const rc = v.race_class || v.raceClass || '';
    if (rc) classes.add(rc);
  });

  // 距離セレクト更新
  const curDist = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  [...dists].sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0)).forEach(d => {
    const o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o);
  });
  if (curDist && [...dists].includes(curDist)) sel.value = curDist;

  // クラスセレクト更新
  if (selClass) {
    const curClass = selClass.value;
    while (selClass.options.length > 1) selClass.remove(1);
    // クラス順（B < C3 < C2 < C1 < A3 < A2 < A1 < 重賞系）
    const classOrder = ['B','C3','C2','C1','A3','A2','A1'];
    const sortedClasses = [...classes].sort((a,b) => {
      const ia = classOrder.findIndex(c => a.includes(c));
      const ib = classOrder.findIndex(c => b.includes(c));
      if (ia !== -1 && ib !== -1) return ia !== ib ? ia - ib : a.localeCompare(b);
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    sortedClasses.forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c; selClass.appendChild(o);
    });
    if (curClass && [...classes].includes(curClass)) selClass.value = curClass;
  }
}

/** ラップグラフのレンダリング */
function renderLapChart() {
  ensureChartJs(() => _doRenderLapChart());
}

// グローバル：ラップグラフのハイライト状態
window._lapHighlightIdx = null;

// グローバル：ラップ凡例クリックでハイライト
window._lapLegendClick = function(idx) {
  if (!_lapChart) return;
  if (window._lapHighlightIdx === idx) {
    // 再クリック → 全解除
    window._lapHighlightIdx = null;
    _lapChart.data.datasets.forEach((ds) => {
      ds.borderWidth      = ds._origBorderWidth      ?? ds.borderWidth;
      ds.borderColor      = ds._origBorderColor      ?? ds.borderColor;
      ds.backgroundColor  = ds._origBgColor          ?? ds.backgroundColor;
      ds.pointRadius      = ds._origPointRadius      ?? ds.pointRadius;
    });
  } else {
    window._lapHighlightIdx = idx;
    // 新しいdataset構造:
    //   [0]        過去平均 区間折れ線 (__avg__)
    //   [1]        過去平均 累計折れ線 (__avgcum__)
    //   [avgOff..avgOff+n-1]   当日棒グラフ
    //   [avgOff+n..avgOff+2n-1] 当日折れ線  ← idxはここ
    // 選択折れ線(idx)に対応する棒グラフは idx - _lapChart._todayCount
    const n = _lapChart._todayCount || 0;
    const avgOff = _lapChart._avgOffset || 0; // 平均datasets数
    _lapChart.data.datasets.forEach((ds, i) => {
      const lbl = ds.label || '';
      // 過去平均は常に表示維持（薄くしない）
      const isAvg = lbl.startsWith('__avg');
      // 選択された折れ線
      const isTargetLine = (i === idx);
      // 対応する棒グラフ: idx - (avgOff + n) = 棒グラフのオフセット位置
      const barIdx = idx - n; // avgOff+n+i_折れ線 → avgOff+i_棒
      const isTargetBar = (i === barIdx);
      const isTarget = isTargetLine || isTargetBar;

      if (!ds._origBorderColor) {
        ds._origBorderColor   = ds.borderColor;
        ds._origBgColor       = ds.backgroundColor;
        ds._origBorderWidth   = ds.borderWidth;
        ds._origPointRadius   = ds.pointRadius;
      }
      if (isTarget) {
        ds.borderWidth     = (ds._origBorderWidth || 2) + 2;
        ds.pointRadius     = (ds._origPointRadius || 3) + 3;
        ds.borderColor     = ds._origBorderColor;
        ds.backgroundColor = ds._origBgColor;
      } else if (isAvg) {
        // 過去平均は薄くはするが完全に消さない
        ds.borderColor     = 'rgba(148,163,184,0.3)';
        ds.backgroundColor = ds._origBgColor;
        ds.pointRadius     = ds._origPointRadius ?? ds.pointRadius;
      } else {
        // 非ターゲット → 薄く
        const fade = c => {
          if (typeof c !== 'string') return c;
          if (c.startsWith('rgba')) return c.replace(/[\d.]+\)$/, '0.10)');
          if (c.startsWith('#') && c.length === 7) return c + '1a';
          if (c.startsWith('#') && c.length === 9) return c.slice(0,7) + '1a';
          return c;
        };
        ds.borderColor     = fade(ds._origBorderColor);
        ds.backgroundColor = fade(ds._origBgColor);
        ds.pointRadius     = 0;
      }
    });
  }
  _lapChart.update();
  // 凡例のハイライト更新
  const legEl = document.getElementById('lap-chart-legend');
  if (legEl) legEl.querySelectorAll('.lap-leg-item').forEach((el, i) => {
    el.classList.toggle('lap-leg-active', window._lapHighlightIdx === i);
    el.classList.toggle('lap-leg-dim',    window._lapHighlightIdx !== null && window._lapHighlightIdx !== i);
  });
};

function _doRenderLapChart() {
  const canvas = document.getElementById('lap-compare-chart'); if (!canvas) return;
  const nodata = document.getElementById('lap-chart-nodata');
  const legEl  = document.getElementById('lap-chart-legend');
  const distF  = document.getElementById('lap-chart-dist')?.value  || '';
  const classF = document.getElementById('lap-chart-class')?.value || '';

  // 対象日・競馬場
  const selVal = document.getElementById('ana-date-select')?.value || '';
  const [targetDate, targetBaba] = selVal.split('__');

  const lsData = lsRead();

  // ── その日のラップデータ収集 ──
  const todayRaces = [];
  Object.values(lsData).filter(v => v.type === 'race').forEach(v => {
    if (targetDate && v.race_date !== targetDate) return;
    if (targetBaba && v.baba_code !== targetBaba) return;
    let laps = v.lapTimes;
    if (!laps && v.lap_times) { try { laps = JSON.parse(v.lap_times); } catch(e){} }
    if (!laps || !laps.some(x => x != null)) return;
    if (distF && v.distance !== distF) return;
    // クラスフィルター
    const rc = v.race_class || v.raceClass || '';
    if (classF && rc !== classF) return;
    todayRaces.push({
      label: `${v.race_no}R`,
      fullLabel: `${v.race_no}R${rc ? ' [' + rc + ']' : ''}`,
      laps: laps.map(x => (x == null ? null : +parseFloat(x).toFixed(2))),
      dist: v.distance || '',
      paceType: v.paceType || v.pace_type || '',
      raceClass: rc,
    });
  });
  todayRaces.sort((a, b) => parseInt(a.label) - parseInt(b.label));

  // ── 過去同距離の平均ラップ計算（その日を除く） ──
  const histRaces = [];
  Object.values(lsData).filter(v => v.type === 'race').forEach(v => {
    if (targetDate && v.race_date === targetDate && v.baba_code === targetBaba) return;
    let laps = v.lapTimes;
    if (!laps && v.lap_times) { try { laps = JSON.parse(v.lap_times); } catch(e){} }
    if (!laps || !laps.some(x => x != null)) return;
    const matchDist = distF || (todayRaces.length > 0 ? todayRaces[0].dist : '');
    if (matchDist && v.distance !== matchDist) return;
    histRaces.push(laps.map(x => (x == null ? null : parseFloat(x))));
  });

  // 過去平均ラップ（区間）
  let avgLaps = null;
  if (histRaces.length > 0) {
    const maxSeg = Math.max(...histRaces.map(l => l.length));
    avgLaps = Array.from({ length: maxSeg }, (_, i) => {
      const vals = histRaces.map(l => l[i]).filter(v => v != null);
      return vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : null;
    });
  }

  if (!todayRaces.length) {
    canvas.parentElement.classList.add('hidden');
    if (nodata) nodata.classList.remove('hidden');
    if (legEl)  legEl.innerHTML = '';
    return;
  }
  canvas.parentElement.classList.remove('hidden');
  if (nodata) nodata.classList.add('hidden');

  // 最大区間数
  const maxSegs = Math.max(...todayRaces.map(r => r.laps.length), avgLaps ? avgLaps.length : 0);
  // X軸ラベル = 各区間の終点距離（200m, 400m, ...）
  const labels = Array.from({ length: maxSegs }, (_, i) => `${(i + 1) * 200}m`);

  // ── 累計ラップ（通過タイム）を計算するヘルパー ──
  function toCumulative(laps) {
    let sum = 0;
    return laps.map(v => {
      if (v == null) return null;
      sum = +(sum + v).toFixed(2);
      return sum;
    });
  }

  // 色パレット
  const PALETTE = [
    '#1a56a0','#e84040','#16a34a','#e8a020','#7c3aed',
    '#0891b2','#be123c','#065f46','#92400e','#4f46e5',
    '#0369a1','#9a3412','#14532d','#7e22ce','#0f766e'
  ];
  const paceStroke = { 'ハイ': '#e84040', 'ミドル': '#e8a020', 'スロー': '#3090e0', '': '#1a56a0' };

  // ── datasets 生成 ──
  // 構造（tooltip表示順を過去平均が先頭になるよう設計）:
  // [0]        過去平均 区間ラップ折れ線   __avg__      (yLap, order:99)
  // [1]        過去平均 累計通過タイム折れ線 __avgcum__  (yTotal, order:98) ← 新規
  // [2..n+1]   当日レース 累計棒グラフ     __cumul__    (yTotal, order:i+20)
  // [n+2..2n+1] 当日レース 区間ラップ折れ線             (yLap, order:i+1)
  const datasets = [];

  // ① 過去平均：区間ラップ折れ線（先頭に配置 → tooltip最上段）
  const avgOffset = avgLaps ? 2 : 0;  // 平均datasets数（区間+累計）
  if (avgLaps) {
    datasets.push({
      type: 'line',
      label: `__avg__過去平均（${histRaces.length}R）区間`,
      data: avgLaps,
      borderColor: 'rgba(148,163,184,0.85)',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [6, 3],
      pointRadius: 3,
      pointBackgroundColor: 'rgba(148,163,184,0.85)',
      pointBorderColor: '#fff',
      pointBorderWidth: 1,
      tension: 0,
      spanGaps: true,
      yAxisID: 'yLap',
      order: 99
    });

    // ② 過去平均：累計通過タイム折れ線（右軸、点線・薄いグレー）
    const avgCumLaps = toCumulative(avgLaps);
    datasets.push({
      type: 'line',
      label: `__avgcum__過去平均（${histRaces.length}R）通過`,
      data: avgCumLaps,
      borderColor: 'rgba(148,163,184,0.55)',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointRadius: 2,
      pointBackgroundColor: 'rgba(148,163,184,0.55)',
      pointBorderColor: '#fff',
      pointBorderWidth: 1,
      tension: 0,
      spanGaps: true,
      yAxisID: 'yTotal',
      order: 98
    });
  }

  const todayCount = todayRaces.length;

  // ③ 当日各レース：累計ラップ（通過タイム）を薄い棒グラフ（yTotal）
  todayRaces.forEach((r, i) => {
    const color = PALETTE[i % PALETTE.length];
    const cumData = toCumulative(r.laps);
    datasets.push({
      type: 'bar',
      label: r.fullLabel + '__cumul__',  // 識別用サフィックス
      data: cumData,
      backgroundColor: color + '2a',
      borderColor:     color + '55',
      borderWidth: 1,
      barPercentage: 0.85,
      categoryPercentage: 1.0,
      yAxisID: 'yTotal',
      order: i + 20,
      skipNull: true,
    });
  });

  // ④ 当日各レース：区間ラップ折れ線（色付き実線、yLap）
  todayRaces.forEach((r, i) => {
    const color = PALETTE[i % PALETTE.length];
    datasets.push({
      type: 'line',
      label: r.fullLabel,
      data: r.laps,
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      tension: 0,
      spanGaps: true,
      yAxisID: 'yLap',
      order: i + 1
    });
  });

  // 既存チャート破棄・ハイライト状態リセット
  if (_lapChart) { _lapChart.destroy(); _lapChart = null; }
  window._lapHighlightIdx = null;

  // ツールチップをチャートの上端に固定するカスタムポジショナー（棒グラフを隠さない）
  if (!Chart.Tooltip.positioners.lapTop) {
    Chart.Tooltip.positioners.lapTop = function(elements, eventPosition) {
      return { x: eventPosition.x, y: this.chart.chartArea.top };
    };
  }

  // 棒グラフに区間ラップ数値ラベルを描画するカスタムプラグイン（クロージャでavgOffset/todayCountを参照）
  const barLabelPlugin = {
    id: 'lapBarLabels',
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart;
      data.datasets.forEach((ds, dsIdx) => {
        if (!ds.label || !ds.label.includes('__cumul__')) return;
        const meta = chart.getDatasetMeta(dsIdx);
        if (!meta.visible) return;
        // 対応する折れ線データセットindex（avgOffset, todayCountはクロージャ変数）
        const barI   = dsIdx - avgOffset;
        const lineIdx = avgOffset + todayCount + barI;
        meta.data.forEach((bar, i) => {
          const rawV = data.datasets[lineIdx]?.data?.[i];
          if (rawV == null) return;
          ctx.save();
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = ds.borderColor?.replace('55', 'dd') || '#555';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(rawV.toFixed(1), bar.x, bar.y - 2);
          ctx.restore();
        });
      });
    }
  };

  _lapChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    plugins: [barLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onClick: (event, elements) => {
        // チャート上の空白クリックでハイライトをリセット
        if ((!elements || elements.length === 0) && window._lapHighlightIdx !== null) {
          window._lapLegendClick(window._lapHighlightIdx);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          position: 'lapTop',
          yAlign: 'bottom',
          itemSort: (a, b) => {
            // 過去平均(__avg__ / __avgcum__)を先頭に表示
            const aIsAvg = (a.dataset.label || '').startsWith('__avg');
            const bIsAvg = (b.dataset.label || '').startsWith('__avg');
            if (aIsAvg && !bIsAvg) return -1;
            if (!aIsAvg && bIsAvg) return 1;
            return 0;
          },
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if (v == null) return null;
              const lbl = ctx.dataset.label || '';
              if (lbl.includes('__avgcum__')) {
                // 過去平均 累計通過タイム
                return ` ${lbl.replace('__avgcum__','')}: ${v.toFixed(2)}秒`;
              }
              if (lbl.includes('__cumul__')) {
                // 棒グラフは通過タイムとして表示
                const rl = lbl.replace('__cumul__','');
                return ` ${rl} 通過: ${v.toFixed(2)}秒`;
              }
              if (lbl.includes('__avg__')) {
                return ` ${lbl.replace('__avg__','')}: ${v.toFixed(2)}秒`;
              }
              return ` ${lbl} 区間: ${v.toFixed(2)}秒`;
            }
          }
        }
      },
      scales: {
        yLap: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '区間ラップ（秒）', font: { size: 10 }, color: '#374151' },
          ticks: { callback: v => v.toFixed(1) + 's', font: { size: 10 } },
          beginAtZero: false,
          grid: { color: 'rgba(0,0,0,0.06)' }
        },
        yTotal: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '累計タイム（秒）', font: { size: 10 }, color: '#94a3b8' },
          ticks: { callback: v => v.toFixed(0) + 's', font: { size: 10 }, color: '#94a3b8' },
          beginAtZero: false,
          grid: { drawOnChartArea: false }
        },
        x: {
          title: { display: true, text: '通過距離', font: { size: 10 } }
        }
      }
    }
  });
  // todayCount と avgOffset をチャートに保存（ハイライト関数から参照）
  _lapChart._todayCount = todayCount;
  _lapChart._avgOffset  = avgOffset;

  // ── 凡例生成（過去平均を最上部に固定、レース一覧その下、棒の説明を最下部） ──
  if (legEl) {
    const paceStrokeColor = { 'ハイ': '#e84040', 'ミドル': '#e8a020', 'スロー': '#3090e0', '': '#1a56a0' };

    // 過去平均（最上部・クリック不可）区間ラップ + 累計通過タイム
    const avgLegend = avgLaps
      ? `<div class="lap-legend-item" style="opacity:0.85;margin-bottom:1px">
          <span style="display:inline-block;width:24px;height:0;border-top:2px dashed rgba(148,163,184,0.9);vertical-align:middle;margin-right:6px"></span>
          <span style="color:#6b7280;font-size:11px">過去平均（${histRaces.length}R）区間ラップ</span>
         </div>
         <div class="lap-legend-item" style="opacity:0.75;margin-bottom:4px">
          <span style="display:inline-block;width:24px;height:0;border-top:1.5px dashed rgba(148,163,184,0.6);vertical-align:middle;margin-right:6px"></span>
          <span style="color:#9ca3af;font-size:11px">過去平均（${histRaces.length}R）累計通過タイム（右軸）</span>
         </div>`
      : '';

    // 当日レース（クリックでハイライト）
    // 新しいdataset構造: [0]=avg区間 [1]=avg累計 [2..n+1]=棒 [n+2..2n+1]=折れ線
    // 凡例クリックに渡すdsIdx = avgOffset + todayCount + i（折れ線のdataset index）
    const raceLegends = todayRaces.map((r, i) => {
      const color = PALETTE[i % PALETTE.length];
      const pl = r.paceType
        ? `<span style="color:${paceStrokeColor[r.paceType]||'#666'};font-weight:700;margin-left:4px">(${r.paceType})</span>`
        : '';
      const dsIdx = avgOffset + todayCount + i;
      const lapsStr = r.laps.map(v => v != null ? v.toFixed(1) : '—').join(' - ');
      const total   = r.laps.filter(v => v != null).reduce((s, v) => s + v, 0);
      return `<div class="lap-legend-item lap-leg-item" style="cursor:pointer;border-radius:4px;padding:3px 5px;transition:background .15s" onclick="window._lapLegendClick(${dsIdx})" title="クリックでハイライト">
        <div style="display:flex;align-items:center">
          <span style="display:inline-block;width:24px;height:0;border-top:2.5px solid ${color};vertical-align:middle;margin-right:6px;flex-shrink:0"></span>
          <span style="font-weight:600">${r.fullLabel}</span>${pl}
        </div>
        <div style="margin-left:30px;font-size:10px;color:#4b5563;font-family:monospace;margin-top:1px">
          ${lapsStr} <span style="color:#94a3b8;margin-left:4px">(計${total.toFixed(1)}秒)</span>
        </div>
      </div>`;
    }).join('');

    // 棒グラフ注記（最下部）
    const barNote = `<div class="lap-legend-item" style="color:#9ca3af;font-size:10px;margin-top:4px">
      <span style="display:inline-block;width:12px;height:10px;background:#94a3b820;border:1px solid #94a3b840;border-radius:2px;vertical-align:middle;margin-right:6px"></span>
      薄い棒＝各レースの累計通過タイム（右軸）
    </div>`;

    legEl.innerHTML = avgLegend + raceLegends + barNote;
  }

  // ── ボタン横スパンは静的テキストに戻す ──
  const infoEl = document.getElementById('lap-chart-times-info');
  if (infoEl) infoEl.textContent = '（200m区間ごとのラップタイム比較）';
}


// ════════════════════════════════════════════════════════
//  馬モーダル スクリーンショット保存
// ════════════════════════════════════════════════════════
function screenshotHorseModal() {
  const btn = document.getElementById('horse-screenshot-btn');
  const titleEl = document.getElementById('horse-modal-title');

  // ボタンをローディング表示
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; btn.disabled = true; }

  // html2canvas を動的ロード（未ロードなら）
  function doCapture() {
    // キャプチャ対象：成績テーブル＋コメント部分のみ
    const captureTarget = document.getElementById('horse-history-capture-area');
    if (!captureTarget) {
      alert('キャプチャ対象が見つかりません');
      if (btn) { btn.innerHTML = '<i class="fas fa-camera"></i> 保存'; btn.disabled = false; }
      return;
    }

    // capture-mode クラスを付与してスクロールバーを消す（全行表示）
    captureTarget.classList.add('capture-mode');

    // 少し待ってからキャプチャ（レイアウト反映待ち）
    setTimeout(() => {
    html2canvas(captureTarget, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
    }).then(canvas => {
      // capture-mode を解除
      captureTarget.classList.remove('capture-mode');

      // ダウンロード
      const horseName = (titleEl?.textContent || '馬成績').replace(/\s+/g,'_').replace(/[/\\:*?"<>|]/g,'');
      const date = new Date();
      const dateStr = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
      const link = document.createElement('a');
      link.download = `${horseName}_${dateStr}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> 保存完了'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-camera"></i> 保存'; btn.disabled = false; }, 2000); }
    }).catch(e => {
      console.error('screenshot error', e);
      captureTarget.classList.remove('capture-mode');
      alert('スクリーンショットの生成に失敗しました');
      if (btn) { btn.innerHTML = '<i class="fas fa-camera"></i> 保存'; btn.disabled = false; }
    });
    }, 80); // レイアウト反映待ち
  }

  ensureCaptureLibs(false)
    .then(doCapture)
    .catch(() => {
      alert('html2canvasの読み込みに失敗しました');
      if (btn) { btn.innerHTML = '<i class="fas fa-camera"></i> 保存'; btn.disabled = false; }
    });
}

// ════════════════════════════════════════════════════════
//  好走馬・凡走馬一覧の折りたたみトグル
// ════════════════════════════════════════════════════════
function toggleAnaHorseList() {
  const body = document.getElementById('ana-horse-list-body');
  const btn  = document.getElementById('ana-horse-list-toggle');
  if (!body || !btn) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  // 開いた状態
  if (isHidden) {
    btn.style.background = '#ede9fe';
    btn.style.color = '#6d28d9';
    btn.style.borderColor = '#c4b5fd';
    btn.innerHTML = '<i class="fas fa-list"></i> 馬一覧を閉じる <i class="fas fa-chevron-up" style="font-size:10px;margin-left:2px"></i>';
  } else {
    btn.style.background = '#f3f4f6';
    btn.style.color = '#374151';
    btn.style.borderColor = '#d1d5db';
    btn.innerHTML = '<i class="fas fa-list"></i> 馬一覧を表示 <i class="fas fa-chevron-down" style="font-size:10px;margin-left:2px"></i>';
  }
}

// ── 汎用：分析セクション折りたたみトグル ──
// key: 'compare' | 'lap' | 'agari'
window.toggleAnaSection = function(key) {
  const cfg = {
    compare: {
      bodyId: 'ana-compare-body', btnId: 'ana-compare-toggle',
      icon: 'fa-balance-scale', openLabel: 'レース内比較を閉じる', closeLabel: 'レース内比較',
      openBg: '#e0f2fe', openColor: '#0369a1', openBorder: '#7dd3fc',
    },
    lap: {
      bodyId: 'ana-lap-body', btnId: 'ana-lap-toggle',
      icon: 'fa-chart-bar', openLabel: 'ラップグラフを閉じる', closeLabel: 'ラップグラフ（区間ラップ比較）',
      openBg: '#ecfdf5', openColor: '#065f46', openBorder: '#6ee7b7',
      onOpen: function() {
        // ラップグラフは展開時に再描画が必要
        setTimeout(() => { if (typeof renderLapChart === 'function') renderLapChart(); }, 50);
      }
    },
    agari: {
      bodyId: 'ana-agari-body', btnId: 'ana-agari-toggle',
      icon: 'fa-medal', openLabel: '上がり3Fランキングを閉じる', closeLabel: 'その日の上がり3Fランキング',
      openBg: '#fffbeb', openColor: '#92400e', openBorder: '#fcd34d',
    },
  };
  const c = cfg[key]; if (!c) return;
  const body = document.getElementById(c.bodyId);
  const btn  = document.getElementById(c.btnId);
  if (!body || !btn) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (isHidden) {
    // 開く
    btn.style.background   = c.openBg;
    btn.style.color        = c.openColor;
    btn.style.borderColor  = c.openBorder;
    btn.innerHTML = `<i class="fas ${c.icon}"></i> ${c.openLabel} <i class="fas fa-chevron-up" style="font-size:10px;margin-left:2px"></i>`;
    if (c.onOpen) c.onOpen();
  } else {
    // 閉じる
    btn.style.background   = '#f3f4f6';
    btn.style.color        = '#374151';
    btn.style.borderColor  = '#d1d5db';
    btn.innerHTML = `<i class="fas ${c.icon}"></i> ${c.closeLabel} <i class="fas fa-chevron-down" style="font-size:10px;margin-left:2px"></i>`;
  }
};

// ============================================================
// 予想AI パネル
// ============================================================
/** JOCKEY_STATSの検索
 *  keiba.go.jpは3文字省略形で保存（例: 岡村卓弥→岡村卓、多田羅誠→多田誠）
 *  ① 完全一致
 *  ② キーの先頭3文字が一致（岡村卓 vs 岡村卓弥）
 *  ③ キーが4文字でkey[0]+key[1]+key[3]が一致（多田誠 vs 多田羅誠、山田貴 vs 山田義貴）
 */
function lookupJockeyStats(name) {
  if (!name) return null;
  const n = name.replace(/[\s　]/g, '');
  if (JOCKEY_STATS[n]) return JOCKEY_STATS[n];
  const keys = Object.keys(JOCKEY_STATS);
  // ② 先頭3文字前方一致（サイト3文字 vs DB4文字）
  if (n.length === 3) {
    for (const k of keys) {
      const kn = k.replace(/[\s　]/g, '');
      if (kn.startsWith(n)) return JOCKEY_STATS[k];
    }
    // ③ DB4文字の苗字3文字目をスキップした形（多田羅誠→多田誠）
    for (const k of keys) {
      const kn = k.replace(/[\s　]/g, '');
      if (kn.length === 4 && kn[0]+kn[1]+kn[3] === n) return JOCKEY_STATS[k];
    }
  }
  return null;
}

// ── 日数差ヘルパー（d1 > d2、両方 YYYYMMDD 文字列） ──
function dateDiffDays(d1str, d2str) {
  if (!d1str || !d2str) return 999;
  const norm = s => String(s).replace(/\//g, '');
  const n1 = norm(d1str), n2 = norm(d2str);
  if (n1.length < 8 || n2.length < 8) return 999;
  const p = s => new Date(s.slice(0,4), parseInt(s.slice(4,6))-1, parseInt(s.slice(6,8))).getTime();
  return Math.round((p(n1) - p(n2)) / 86400000);
}

// ══════════════ 時系列インデックス：コンボ統計の未来情報混入対策（2026-07-10）══════════════
// 【問題】getComboStats()等は全期間のplace/totalを合算しており、過去レースを評価するとき
// そのレースより後の結果まで特徴量に混ざる（コード監査②）。対象レースの日付+レース番号より
// 「厳密に前」のデータだけを引けるよう、日付順にソートしコンボキーごとに「そのレース終了直後の
// 累積place/total」を記録した索引を1回だけ構築し、二分探索でO(log m)で引く。
// ライブは常に「今日」を評価するため実害は小さいが、過去レース閲覧時・バックテストでは必須。
function _buildAsOfComboIndex() {
  if (window._asOfComboCache) return window._asOfComboCache;
  const ls = lsRead();
  const entries = [];
  for (const [k, v] of Object.entries(ls)) {
    if (v.type !== 'horse' || (v.baba_code||v.babaCode) !== '31' || !v.jockey || !v.trainer) continue;
    const chaku = parseInt(v.chakujun);
    if (isNaN(chaku)) continue;
    const p = k.split('_');
    if (p.length < 4) continue;
    entries.push({ d: p[1], n: parseInt(p[2]), key: `${v.jockey.trim()}_${v.trainer.trim()}`, place: chaku <= 3 ? 1 : 0 });
  }
  entries.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.n - b.n);
  const perKey = new Map(); // key -> [{d,n,place(累積),total(累積)}]（そのレース終了直後の値）
  const running = new Map();
  for (const e of entries) {
    const cur = running.get(e.key) || { place: 0, total: 0 };
    const next = { place: cur.place + e.place, total: cur.total + 1 };
    running.set(e.key, next);
    let arr = perKey.get(e.key);
    if (!arr) { arr = []; perKey.set(e.key, arr); }
    arr.push({ d: e.d, n: e.n, place: next.place, total: next.total });
  }
  return (window._asOfComboCache = { perKey });
}
/** 指定レース(raceDate,raceNo)より厳密に前のコンボ統計を返す（{place,total}|null）。 */
function getComboStatsAsOf(jockey, trainer, raceDate, raceNo) {
  if (!jockey || !trainer || !raceDate) return null;
  const arr = _buildAsOfComboIndex().perKey.get(`${String(jockey).trim()}_${String(trainer).trim()}`);
  if (!arr || !arr.length) return null;
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, e = arr[mid];
    if (e.d < raceDate || (e.d === raceDate && e.n < raceNo)) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? { place: arr[ans].place, total: arr[ans].total } : null;
}

// ── 騎手×厩舎コンボ統計（高知のみ・全期間）──
// 全IDBエントリのスキャンはデータ増加に比例して遅くなるため、
// 結果をキャッシュしデータ書き込み/削除時（idbPut/idbDelete/_idbBulkPut）に無効化する。
// 【注意】全期間集計＝過去レースを評価する用途（バックテスト・過去閲覧）には使わないこと。
// その用途は必ずgetComboStatsAsOf(jockey,trainer,raceDate,raceNo)を使う。
function getComboStats() {
  if (window._comboStatsCache) return window._comboStatsCache;
  const stats = {};
  for (const v of Object.values(lsRead())) {
    if (v.type !== 'horse' || (v.baba_code||v.babaCode) !== '31' || !v.jockey || !v.trainer) continue;
    const chaku = parseInt(v.chakujun);
    if (isNaN(chaku)) continue;
    const ck = `${v.jockey.trim()}_${v.trainer.trim()}`;
    if (!stats[ck]) stats[ck] = { place: 0, total: 0 };
    stats[ck].total++;
    if (chaku <= 3) stats[ck].place++;
  }
  window._comboStatsCache = stats;
  return stats;
}

// ============================================================
// 予想スコア計算・共通式（単一の真実の源）
// renderPredictionPanel（ライブ）と runYosoBacktest（検証）の両方が使う。
// 式・閾値・係数はここで一元管理 — チューニング時はここだけ直せば両方に反映される。
// データの取り方の差は意図的な仕様差として呼び出し側に残る：
//   ・SI計算：ライブ=ペース補正+ポジション補正+公式履歴バイアス推定あり／検証=当日バイアスのみ
//   ・上がり基準値：ライブ=固定表／検証=データ駆動
//   ・コンボ統計：ライブ=高知のみ／検証=全馬場
//   ・4C平均：ライブ=小数1位丸めで判定／検証=生値で判定
// ============================================================
const YOSO_CLASS_RANK = { '重賞':7,'OP':6,'A':5,'B':4,'C1':3,'C2':2,'C3':1,'3歳':1,'2歳':1 };
const Yoso = {
  /** ① SIリスト構築：高知10走→2走未満なら他場6走で補完、上限10。siFor(h)は1走のSI計算（仕様差は呼び出し側） */
  buildSIList(kochiHist, otherHist, siFor) {
    const list = [];
    const push = (lst, lim) => {
      for (const h of lst.slice(0, lim)) {
        if (list.length >= 10) break;
        if (h._isJra) continue; // JRAタイムは高知SI換算不可
        const si = siFor(h);
        if (si != null) list.push(si);
      }
    };
    push(kochiHist, 10);
    const kochiCount = list.length;
    if (kochiCount < 2) push(otherHist.filter(h => !h._isJra), 6);
    return { list, kochiCount };
  },

  /** ① ベーススコア：新しい順の減衰加重平均（0.75^i） */
  baseFromSIList(list) {
    if (!list.length) return null;
    const wts = list.map((_, i) => Math.pow(0.75, i));
    const wSum = wts.reduce((a, b) => a + b, 0);
    return list.reduce((s, si, i) => s + si * wts[i], 0) / wSum;
  },

  /** ① 転入馬推定スコア：履歴→official_*キャッシュの順で、最高クラスの1走から推定。材料なしはnull（真のデビュー馬） */
  estimateTransferScore(histEx, raceCls, hName, officialByHorse) {
    const calc = (entry, useClassStr) => {
      const originRank = getTransferOriginRank(useClassStr);
      const curRank    = YOSO_CLASS_RANK[getEffectiveClass(raceCls)] || 2;
      const classBase  = 40 + curRank * 2;
      const diffRaw    = parseFloat(entry.diff);
      const diffAdj    = isNaN(diffRaw) ? 0
        : diffRaw <= 0   ? +2 : diffRaw <= 0.5 ? +1 : diffRaw <= 1.5 ? 0
        : diffRaw <= 3.0 ? -1 : -2;
      const chaku    = parseInt(entry.chakujun);
      const chakuAdj = isNaN(chaku) ? 0 : chaku === 1 ? +1 : chaku <= 3 ? 0 : chaku <= 5 ? -0.5 : -1;
      return +Math.max(36, Math.min(60, classBase + (originRank - curRank) * 2.5 + diffAdj + chakuAdj)).toFixed(1);
    };
    if (histEx.length > 0) {
      let best = histEx[0], bestRank = -1;
      for (const h of histEx) {
        const cls = [h._raceClass || h.raceClass, h._raceName].filter(Boolean).join(' ');
        const r = getTransferOriginRank(cls);
        if (r > bestRank) { bestRank = r; best = h; }
      }
      return calc(best, [best._raceClass || best.raceClass, best._raceName].filter(Boolean).join(' '));
    }
    const offRaces = officialByHorse?.get(hName);
    if (offRaces?.length) {
      let best = null, bestRank = -1;
      for (const r of offRaces) {
        const cls = [r.raceClassRaw, r.raceName, r.raceClass].filter(Boolean).join(' ');
        const rk = getTransferOriginRank(cls);
        if (rk > bestRank) { bestRank = rk; best = r; }
      }
      if (best) return calc(best, [best.raceClassRaw, best.raceName, best.raceClass].filter(Boolean).join(' '));
    }
    return null;
  },

  /** ③④の材料：履歴から{cond,dist,si}リスト。biasFor(h)は仕様差（呼び出し側） */
  siWithCondList(histEx, biasFor) {
    return histEx.filter(h => h.time && h.trackCond).map(h => {
      const si = calcSpeedIndex(h.time, h.distance, h.raceClass, h.trackCond, biasFor(h), h.kinryo, null);
      return si != null ? { cond: h.trackCond, dist: getDistNum(h.distance), si } : null;
    }).filter(Boolean);
  },

  /** ② 騎手勝率ボーナス（現状は総合スコア外・表示/手動加算用） */
  jockeyModFromWR(wr) {
    return Math.max(-5, Math.min(8, (wr - 12) * 0.22));
  },

  /** ③ 馬場適性：当該馬場状態SI平均 − 全体SI平均。sampleNは「同条件の走数」であること
   *  （全履歴数を渡すと1走の異常値が母数10走分の信頼度で満額適用されるバグになる）。
   *  母数依存の縮約（n/(n+3)）：1走=25%・2走=40%・3走=50%・5走=63%・10走=77%で徐々に信頼。 */
  condMod(condAvg, globalAvg, sampleN) {
    if (globalAvg == null || condAvg == null || !sampleN) return 0;
    const shrink = sampleN / (sampleN + 3);
    return Math.max(-2, Math.min(2, (condAvg - globalAvg) * 0.5 * shrink));
  },

  /** ④-a 距離適性：近距離(±100m)SI平均 − 全体SI平均。sampleNは対象距離帯の走数（母数依存の縮約、condModと同式）。 */
  distMod(nearAvg, globalAvg, sampleN) {
    if (globalAvg == null || nearAvg == null || !sampleN) return 0;
    const shrink = sampleN / (sampleN + 3);
    return Math.max(-2, Math.min(2, (nearAvg - globalAvg) * 0.5 * shrink));
  },

  /** ④-b 距離延長/短縮ペナルティ（前走比±200m以上） */
  distExtAdj(distMod, prevDist, rdistNum) {
    if (!prevDist || !rdistNum) return distMod;
    const dd = rdistNum - prevDist;
    if (dd >= 200)  return Math.max(-2, distMod - 0.3);
    if (dd <= -200) return Math.max(-2, distMod - 0.2);
    return distMod;
  },

  /** ⑤ 近況トレンド：SI線形回帰の傾き×0.625（3走以上）。listは新しい順で渡す */
  trendMod(siListNewestFirst) {
    if (siListNewestFirst.length < 3) return 0;
    const vals = [...siListNewestFirst].reverse();
    const n = vals.length, xm = (n - 1) / 2, ym = vals.reduce((s, v) => s + v, 0) / n;
    const num = vals.reduce((s, v, i) => s + (i - xm) * (v - ym), 0);
    const den = vals.reduce((s, v, i) => s + (i - xm) ** 2, 0);
    return den > 0 ? Math.max(-1.5, Math.min(1.5, (num / den) * 0.625)) : 0;
  },

  /** ⑥ 騎手×厩舎コンボ：shrinkage推定（サンプル少ないほど「そのレースの頭数における複勝の
   *  自然基準」へ引き寄せ）。事前平均を一律33%固定にすると、4頭立て(自然に75%)を大幅過大評価、
   *  12頭立て(自然に25%)を過小評価するバグになるため、fieldSizeからmin(3,頭数)/頭数で都度算出する。 */
  comboMod(cs, fieldSize) {
    if (!cs || cs.total < 1) return 0;
    const prior = fieldSize ? Math.min(3, fieldSize) / fieldSize : 0.33;
    const shrunk = (cs.place + prior * 20) / (cs.total + 20);
    return Math.max(-2, Math.min(2, (shrunk - prior) * 4));
  },

  /** ⑦ ローテーション：連闘(≦7日)-1.0／長期休養明け(≧57日)-0.8 */
  rotMod(raceDate, prevRaceDate) {
    if (!raceDate || !prevRaceDate) return 0;
    const days = dateDiffDays(raceDate, prevRaceDate);
    if (days <= 7)  return -1.0;
    if (days >= 57) return -0.8;
    return 0;
  },

  /** ⑧ 昇降級：降級+1.5／昇級-1.0 */
  classMod(currentClassRank, prevRaceClass) {
    if (!prevRaceClass || currentClassRank <= 0) return 0;
    const prevRank = YOSO_CLASS_RANK[getEffectiveClass(prevRaceClass)] || 0;
    if (prevRank <= 0) return 0;
    if (currentClassRank < prevRank) return +1.5;
    if (currentClassRank > prevRank) return -1.0;
    return 0;
  },

  /** ⑨の材料：直近10走の4C通過順平均（2走以上でavg、それ未満はnull） */
  avg4C(histEx) {
    const ps = histEx.slice(0, 10).map(h => {
      if (!h.corner) return null;
      const parts = String(h.corner).split('-');
      if (parts.length < 4) return null;
      const p = parseInt(parts[3]);
      return isNaN(p) ? null : p;
    }).filter(p => p != null);
    return { avg: ps.length >= 2 ? ps.reduce((s, v) => s + v, 0) / ps.length : null, count: ps.length };
  },

  /** ⑨ 脚質補正：高知は4C前が圧倒的有利（4C1番手=勝率60-75%・129,654走実績） */
  cornMod(avg4C, count) {
    if (avg4C == null || count < 3) return 0;
    if (avg4C <= 1.5) return +3.295875;
    if (avg4C <= 2.5) return +1.7578125;
    if (avg4C <= 3.5) return +0.439453125;
    if (avg4C <= 5.0) return -0.6591796875;
    if (avg4C <= 7.0) return -1.7578125;
    return -2.63671875;
  },

  /** ⑩ 調教師補正（現状は両実装とも総合スコアに未加算・将来用） */
  trainerMod(trnStats) {
    return trnStats ? Math.max(-2, Math.min(2, (trnStats.wr - 12) * 0.12)) : 0;
  },

  /** ⑪の材料：馬体重変化。表記の（+8）優先、なければ前走との実測差 */
  weightChange(weightStr, prevWeightStr) {
    const m = String(weightStr || '').match(/[（\(]([+\-]?\d+)[）\)]/);
    if (m) return parseInt(m[1]);
    const tw = parseInt(String(weightStr || '').match(/^(\d+)/)?.[1]);
    const pw = parseInt(String(prevWeightStr || '').match(/^(\d+)/)?.[1]);
    return (tw && pw) ? tw - pw : null;
  },

  /** ⑪ 馬体重変化補正（大幅増＝太め残り、大幅減＝細め懸念） */
  weightMod(wc) {
    if (wc === null) return 0;
    if (wc >= 12)  return -0.6;
    if (wc >= 8)   return -0.3;
    if (wc <= -12) return -0.5;
    if (wc <= -8)  return -0.2;
    return 0;
  },

  /** ⑫の材料：同距離±200m・直近10走の上がり3F平均（2走以上） */
  agariAvg(histEx, rdistNum) {
    const hs = histEx.slice(0, 10).filter(h => {
      const v = parseFloat(h.agari3f), d = getDistNum(h.distance);
      return !isNaN(v) && v > 30 && v < 50 && d && Math.abs(d - rdistNum) <= 200;
    }).map(h => parseFloat(h.agari3f));
    return hs.length >= 2 ? hs.reduce((s, v) => s + v, 0) / hs.length : null;
  },

  /** ⑫ 上がり3F補正：基準値との差×1.31836（基準値は仕様差・呼び出し側） */
  agariMod(refV, avgAH) {
    if (avgAH === null) return 0;
    return Math.max(-1.25, Math.min(1.25, (refV - avgAH) * 1.31836));
  },

  /** 着差(diff)を馬身数(数値)にパース。伝統表記："3/4"=3/4馬身,"1.1/2"=1+1/2馬身,"5"=5馬身,
   *  "クビ"/"アタマ"/"ハナ"=僅差の慣用値。【2026-07-10修正】旧実装は replace(/[^\d.]/g,'') で
   *  "/"を除去するだけだったため "3/4"→34、"1/2"→12 のように全く別の数値に化けていた
   *  （該当は非1着の着差の34%・分数を含まないものも合わせ52.8%が誤ってパースされていた）。
   *  A/B検証（3000R）：修正後は◎の的中率を維持したまま○の複勝的中率+1.2pt改善。 */
  parseMargin(str) {
    if (!str) return NaN;
    const s = String(str).trim();
    if (s === 'ハナ') return 0.02;
    if (s === 'アタマ') return 0.05;
    if (s === 'クビ') return 0.1;
    let m = s.match(/^(\d+)\/(\d+)$/); if (m) return parseInt(m[1]) / parseInt(m[2]);
    m = s.match(/^(\d+)\.(\d+)\/(\d+)$/); if (m) return parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]);
    m = s.match(/^(\d+)$/); if (m) return parseInt(m[1]);
    return NaN;
  },

  /** ⑬の材料：直近2走の勝ち馬との平均着差（勝ちは0） */
  marginAvgGap(histEx) {
    const races = histEx.slice(0, 2).filter(h => { const c = parseInt(h.chakujun); return !isNaN(c) && c >= 1; });
    if (!races.length) return null;
    const gaps = races.map(h => {
      if (parseInt(h.chakujun) === 1) return 0;
      const d = Yoso.parseMargin(h.diff);
      return isNaN(d) ? null : d;
    }).filter(v => v !== null);
    if (!gaps.length) return null;
    return gaps.reduce((s, v) => s + v, 0) / gaps.length;
  },

  /** ⑬ 前走着差補正（×1.5チューニングはCV再検証で効果消失→中立値。2026-07-01） */
  marginMod(avgGap) {
    if (avgGap === null) return 0;
    if (avgGap <= 0.0) return +0.9;
    if (avgGap <= 0.3) return +0.675;
    if (avgGap <= 0.8) return +0.3375;
    if (avgGap <= 1.5) return 0.0;
    if (avgGap <= 3.0) return -0.3375;
    return -0.675;
  },

  /** ⑭ 勝ち馬の強さ補正（前走惜敗時のみ・勝ち馬SI−自馬平均SI） */
  winStrMod(siDiff) {
    if (siDiff >= 8)  return +0.5;
    if (siDiff >= 4)  return +0.2;
    if (siDiff <= -4) return -0.2;
    return 0;
  },

  /** ⑮ 乗り替わり補正（×0.5チューニングはCV再検証で効果消失→中立値。2026-07-01） */
  jockeyChgMod(wrDiff) {
    if (wrDiff >= 10)  return +5.6;
    if (wrDiff >= 5)   return +2.8;
    if (wrDiff <= -10) return -2.8;
    if (wrDiff <= -5)  return -1.4;
    return 0;
  },

  /** ⑯ 叩き効果：休み明け(前走間隔42日+)の2走目、中7〜42日で+0.6 */
  takiMod(raceDate, prev0Date, prev1Date) {
    if (!raceDate || !prev0Date || !prev1Date) return 0;
    const d01 = dateDiffDays(prev0Date, prev1Date);
    const d0c = dateDiffDays(raceDate, prev0Date);
    return (d01 >= 42 && d0c >= 7 && d0c <= 42) ? +0.6 : 0;
  },

  /** ⑱の材料：直近3走の3→4C順位変化の平均（負=追い込んで改善） */
  cornConsistAvg(histEx) {
    const vals = histEx.slice(0, 3).map(h => {
      const pts = (h.corner || '').split('-').map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
      if (pts.length < 4) return null;
      return pts[3] - pts[2];
    }).filter(v => v !== null);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  },

  /** ⑱ コーナー一貫性補正 */
  cornConsistMod(ccAvg) {
    if (ccAvg === null) return 0;
    if (ccAvg <= -2) return +1.2;
    if (ccAvg <= -1) return +0.6;
    if (ccAvg >=  2) return -1.2;
    if (ccAvg >=  1) return -0.6;
    return 0;
  },

  /** ⑰ 相対SI補正：フィールド平均との差×0.05 */
  relSIMod(base, fieldAvg) {
    return (base - fieldAvg) * 0.05;
  },
};

// ══════════════ 統一SI計算（コード監査③ 2026-07-10）══════════════
// 【問題】本番(computeYosoScored)は馬アンカー馬場差+ペース補正+ポジション補正を使うが、
// バックテスト(runYosoBacktest)とEV特徴量(_evHorseFeatures)は当日バイアスのみの簡易版を
// 使っており、検証していたのは実際にライブで動いているモデルとは別物だった。
// 3経路すべてがこの1つの関数を呼ぶことで、検証結果が本番の実態を反映するようにする。
// h は getHorseHistory系が返す過去走エントリ1件（babaCode/raceDate/raceNo/time/distance/
// raceClass/trackCond/kinryo/first3f/mukaeShoumen/shoumenStraight/fromOfficialを持つ）。
// useAnchor=trueで馬アンカー馬場差(2026-07-02採用のCV合格版)、falseで当日バイアスのみ。
function computeHorseSI(h, useAnchor, auditCtx) {
  if (auditCtx) auditDayBias({
    predictionDate: auditCtx.predictionDate, predictionRaceNo: auditCtx.predictionRaceNo,
    biasDate: h.raceDate, sourceMaxRaceNo: 16, caller: auditCtx.caller || 'computeHorseSI',
  });
  const f3Val = parseFloat(h.first3f);
  let bias;
  if (useAnchor) {
    const hb = getHorseAnchoredBias(h.babaCode, h.raceDate);
    bias = (hb && hb.bias != null) ? hb.bias
      : (getDayBiasForDate(h.babaCode, h.raceDate) ?? (h.fromOfficial ? estimateBiasFromCond(h.distance, h.raceClass, h.trackCond) : null));
  } else {
    bias = getDayBiasForDate(h.babaCode, h.raceDate) ?? (h.fromOfficial ? estimateBiasFromCond(h.distance, h.raceClass, h.trackCond) : null);
  }
  const avgF3 = getRaceAvgF3(h.babaCode, h.raceDate, h.raceNo);
  const pAdj  = calcPaceAdj(f3Val, avgF3);
  const si = calcSpeedIndex(h.time, h.distance, h.raceClass, h.trackCond, bias, h.kinryo, pAdj);
  return si != null ? si + getPositionAdvantage(h.babaCode, h.raceDate, h.mukaeShoumen, h.shoumenStraight) : null;
}

// ══ PSF指数（Claude設計・仕様書v1.0凍結）══
// 位置取り予測(1C)を主役に、位置条件付き地力を掛け合わせる構造モデル。
// 定数は2026-07-02の実測から凍結（fitではなく測定）：
//   PSF_WIN[p] = 1C位置p番手の実測勝率（N=1,200超/セル・pos4-5のみ単調化平滑）
//   PSF_POSEXP[p] = 1C位置p番手の勝ち馬比時計コスト中央値（秒）
// 検証（公式払戻・1,071R・352的中）：単勝ROI 109.2%／現行と◎不一致の635RではROI 112.9%。
// 精度は現行に劣るため印は現行のまま、💎妙味バッジ（表示のみ）に使う。
const PSF_WIN    = [null, .311, .187, .135, .087, .087, .066, .045, .033, .017];
const PSF_POSEXP = [null, 0.4, 1.0, 1.1, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9];
const PSF_BETA = 0.8, PSF_G_COMBO = 2.0, PSF_G_KIN = -0.05, PSF_G_WC = 0.5; // 事前決め打ち
function _psfWinAt(x) { // 実数位置xでの勝率（線形補間・1〜9でクランプ）
  const xc = Math.max(1, Math.min(9, x));
  const lo = Math.floor(xc), hi = Math.ceil(xc);
  const v = lo === hi ? PSF_WIN[lo] : PSF_WIN[lo] + (PSF_WIN[hi] - PSF_WIN[lo]) * (xc - lo);
  return Math.max(v, 0.005);
}

/** 騎手×厩舎コンボ統計（全馬場・PSF用。予想AI用のgetComboStatsは高知限定＝別物） */
function getComboStatsAll() {
  if (window._comboStatsAllCache) return window._comboStatsAllCache;
  const stats = {};
  for (const v of Object.values(lsRead())) {
    if (!v.jockey || !v.trainer) continue;
    const ch = parseInt(v.chakujun);
    if (isNaN(ch)) continue;
    const ck = `${v.jockey.trim()}_${v.trainer.trim()}`;
    if (!stats[ck]) stats[ck] = { place: 0, total: 0 };
    stats[ck].total++;
    if (ch <= 3) stats[ck].place++;
  }
  window._comboStatsAllCache = stats;
  return stats;
}

/**
 * ライブ用PSFスコア計算（バックテストの検証済みレシピと同一の材料・定数）。
 * 戻り値: { top: 最上位の馬名, scores: {馬名: psfS} }｜計算不能は null
 */
function computePsfScores(raceNo) {
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) return null;
  const raceDate = data.raceInfo.raceDate || '';
  const thisNo = parseInt(raceNo);
  const comboAll = getComboStatsAll();
  const ls = lsRead();
  const anchBias = (babaCode, d) => {
    const hb = getHorseAnchoredBias(babaCode, d);
    return (hb && hb.bias != null) ? hb.bias : (getDayBiasForDate(babaCode, d) ?? null);
  };
  const rows = data.horses.map(horse => {
    const name = horse.horseName || '';
    const preHist = getHorseHistoryBefore(name, raceDate, thisNo);
    const k5 = preHist.filter(h => h.babaCode === '31').slice(0, 5);
    const c1s = k5.map(h => parseInt(String(h.corner || '').split('-')[0])).filter(x => !isNaN(x) && x > 0).sort((a, b) => a - b);
    const es = c1s.length >= 2 ? c1s[Math.floor(c1s.length / 2)] : null;
    const perfs = [];
    for (const h of k5) {
      const c1 = parseInt(String(h.corner || '').split('-')[0]);
      const t = raceTimeToSec(h.time);
      if (isNaN(c1) || c1 <= 0 || t == null) continue;
      const rrec = ls[`race_31_${h.raceDate}_${h.raceNo}`] || {};
      const d2 = getDistNum(rrec.distance || h.distance);
      const cl = getEffectiveClass(rrec.race_class || h.raceClass || '');
      const std = (d2 && cl) ? STANDARD_TIMES[d2]?.[cl] : null;
      if (std == null) continue;
      const db = anchBias('31', h.raceDate);
      if (db == null) continue;
      perfs.push(-(t - db - std - PSF_POSEXP[Math.min(c1, 9)]));
    }
    let g = null;
    if (perfs.length >= 2) { perfs.sort((a, b) => a - b); g = perfs[Math.floor(perfs.length / 2)]; }
    const cs = comboAll[`${(horse.jockey || '').trim()}_${(horse.trainer || '').trim()}`];
    const combo = cs ? (cs.place + 0.33 * 10) / (cs.total + 10) - 0.33 : 0;
    const kinV = parseFloat(horse.kinryo);
    return { name, es, g, combo, kin: isNaN(kinV) ? null : kinV, wcM: Yoso.weightMod(Yoso.weightChange(horse.weight, preHist[0]?.weight)) };
  });
  const fld = rows.length;
  const wEs = rows.filter(r => r.es != null).sort((a, b) => a.es - b.es);
  let i = 0;
  while (i < wEs.length) {
    let j = i;
    while (j + 1 < wEs.length && wEs[j + 1].es === wEs[i].es) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let m = i; m <= j; m++) wEs[m]._rank = avgRank;
    i = j + 1;
  }
  const nullRank = Math.ceil(fld * 0.6);
  const D = wEs.filter(r => r.es <= 3).length / fld;
  const shift = D >= 0.45 ? 0.5 : D < 0.25 ? -0.5 : 0;
  const kins = rows.map(r => r.kin).filter(v => v != null);
  const kinAvg = kins.length ? kins.reduce((a, b) => a + b, 0) / kins.length : null;
  const scores = {};
  let top = null, topS = -Infinity;
  for (const r of rows) {
    if (r.g == null) continue;
    const rank = r._rank != null ? r._rank : nullRank;
    const kd = (r.kin != null && kinAvg != null) ? r.kin - kinAvg : 0;
    const s = Math.log(_psfWinAt(rank + shift)) + PSF_BETA * r.g + PSF_G_COMBO * r.combo + PSF_G_KIN * kd + PSF_G_WC * r.wcM;
    scores[r.name] = s;
    if (s > topS) { topS = s; top = r.name; }
  }
  return top ? { top, scores } : null;
}

// V3リスケール（2026-07-04採用）：補正項ごとの実効倍率。CV検証で印全体の質(ペア整合率5/5fold)が
// 現行を上回り◎も平均改善したため、上がり3F/騎手×厩舎/馬体重/勝ち馬強さを増、乗替/叩きを減。
// 未記載の項目（馬場適性・距離・トレンド・脚質・着差・ローテ・昇降級・C一貫性）は等倍のまま。
const YOSO_FACTOR_SCALE = { agariN: 2.5, comboN: 3.0, weightN: 2.5, winStrN: 2.5, jockeyChgN: 0.5, takiN: 0.5, paceCtxN: 1.5 };

/**
 * 予想AIスコア計算（共通コア）
 * renderPredictionPanel（予想AIパネル）と出馬表のAI印列の両方が使う。
 * 戻り値: { scored（スコア降順・_paceBiasプロパティ付き）, comboStats, raceDist, raceCond, raceCls, selCond }｜データなしは null
 */
function computeYosoScored(raceNo, selCondOverride) {
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) return null;

  const { raceInfo, horses } = data;
  const raceDist     = raceInfo.distance ? String(raceInfo.distance).replace(/[^\d]/g, '') : '';
  const raceCond     = raceInfo.trackCond || raceInfo.track_cond || '';
  const raceCls      = raceInfo.raceClass || raceInfo.race_class || '';
  const thisRaceDate = raceInfo.raceDate || '';
  const thisRaceNo   = parseInt(raceNo);
  const selCond      = selCondOverride || raceCond || '良';

  // 騎手×厩舎コンボ統計（キャッシュ経由・データ変更時に自動無効化）
  const _comboStats = getComboStats();

  // クラスランク（昇降級判定）
  const currentClassRank = YOSO_CLASS_RANK[getEffectiveClass(raceCls)] || 0;
  const rdistNum = parseInt(raceDist) || 0;
  const FIELD_AVG_WR = 12;

  // JRA転入馬フォールバック用: official_* キャッシュを馬名でインデックス化
  const _officialByHorse = new Map();
  for (const [k, v] of Object.entries(lsRead())) {
    if (k.startsWith('official_') && v.type === 'official' && v.horseName && v.races?.length) {
      _officialByHorse.set(v.horseName, v.races);
    }
  }

  const scored = horses.map(horse => {
    const hName  = horse.horseName || '';
    const jockey = (horse.jockey || '').trim();
    // 当該レースより前の履歴のみ（未来のレース結果が紛れ込むと予想として成立しないため）
    const histEx = getHorseHistoryBefore(hName, thisRaceDate, thisRaceNo);

    // ── ① ベーススコア ──
    const kochiHist = histEx.filter(h => h.babaCode === '31');
    const otherHist = histEx.filter(h => h.babaCode !== '31');
    // 【2026-07-10】computeHorseSI()に統一（③）。ライブ/バックテスト/EV特徴量が同じ関数を呼ぶ。
    const _siAuditCtx = { predictionDate: thisRaceDate, predictionRaceNo: thisRaceNo };
    const _siForLive = h => computeHorseSI(h, false, { ..._siAuditCtx, caller: '_siForLive' });
    const { list: recentSI, kochiCount: kochiSICount } = Yoso.buildSIList(kochiHist, otherHist, _siForLive);
    // 馬基準差SI（2026-07-02採用）：ベーススコアの水準補正だけを馬アンカー方式に置換。
    // CVで印全体のランキング品質が改善（ペア整合率4/5fold・勝ち馬捕捉+0.4pt・○▲複勝+0.3pt）。
    // トレンド・勝ち馬強さ・siCount等は検証時の構成どおり従来SI（recentSI）を使い続ける。
    const _siForLiveAnch = h => computeHorseSI(h, true, { ..._siAuditCtx, caller: '_siForLiveAnch' });
    let isEstimatedScore = false;
    let isTransfer = kochiSICount === 0 && recentSI.length > 0;
    let baseScore = Yoso.baseFromSIList(Yoso.buildSIList(kochiHist, otherHist, _siForLiveAnch).list) ?? Yoso.baseFromSIList(recentSI);
    // 転入馬推定スコア（SI算出不可＝JRA・NAR他場転入等。履歴→official_*キャッシュの順で推定）
    if (baseScore === null) {
      const _est = Yoso.estimateTransferScore(histEx, raceCls, hName, _officialByHorse);
      if (_est !== null) { baseScore = _est; isEstimatedScore = true; isTransfer = true; }
    }

    // ── ② 騎手補正 ──
    let jockeyWR = FIELD_AVG_WR;
    const jStats = lookupJockeyStats(jockey);
    if (jStats) {
      const src = (jStats.recent?.n >= 30 ? jStats.recent : null) || jStats.all;
      jockeyWR = src.wr;
    }
    const jockeyMod = Yoso.jockeyModFromWR(jockeyWR);

    // ── ③ 馬場適性（SI差分ベース・1走から機能） ──
    // ライブ版は公式履歴のバイアス推定込み（検証版は当日バイアスのみ・仕様差）
    const _allSIWithCond = Yoso.siWithCondList(histEx, h =>
      getDayBiasForDate(h.babaCode, h.raceDate) ?? (h.fromOfficial ? estimateBiasFromCond(h.distance, h.raceClass, h.trackCond) : null));
    const _globalSIAvg = _allSIWithCond.length ? _allSIWithCond.reduce((s,x)=>s+x.si,0)/_allSIWithCond.length : null;
    const _condSIs = _allSIWithCond.filter(x => x.cond === selCond).map(x => x.si);
    const _condSIAvg = _condSIs.length ? _condSIs.reduce((a,b)=>a+b,0)/_condSIs.length : null;
    const condMod = Yoso.condMod(_condSIAvg, _globalSIAvg, _condSIs.length);

    // ── ④ 距離適性（SI差分ベース + 延長/短縮補正） ──
    const _nearDistSIs = _allSIWithCond
      .filter(x => x.dist && rdistNum && Math.abs(x.dist - rdistNum) <= 100)
      .map(x => x.si);
    const _nearDistSIAvg = _nearDistSIs.length
      ? _nearDistSIs.reduce((a, b) => a + b, 0) / _nearDistSIs.length : null;
    const distMod = Yoso.distExtAdj(
      Yoso.distMod(_nearDistSIAvg, _globalSIAvg, _nearDistSIs.length),
      histEx[0] ? getDistNum(histEx[0].distance) : null, rdistNum);

    // ── ⑤ 近況トレンド ──
    const trendMod = Yoso.trendMod(recentSI);

    // ── ⑥ 騎手×厩舎コンボ ──
    const trainer = (horse.trainer || '').trim();
    // 【2026-07-10】未来情報混入対策：全期間集計(_comboStats)ではなく、このレースより前だけの
    // コンボ統計(getComboStatsAsOf)を使う。ライブで今日のレースを見る限り差はほぼ無いが、
    // 過去レースを閲覧する場合はそのレースより後の結果が混ざらないようにする。
    const _comboStatAsOf = (jockey && trainer) ? getComboStatsAsOf(jockey, trainer, thisRaceDate, thisRaceNo) : null;
    const comboMod = (jockey && trainer) ? Yoso.comboMod(_comboStatAsOf, horses.length) : 0;

    // ── ⑦ ローテーション補正（連闘・長期休養明け） ──
    const _prevRace = histEx[0];
    const rotMod = _prevRace ? Yoso.rotMod(thisRaceDate, _prevRace.raceDate) : 0;

    // ── ⑧ 昇降級補正 ──
    const classMod = _prevRace ? Yoso.classMod(currentClassRank, _prevRace.raceClass) : 0;

    // ── ⑨ 4コーナー通過順補正（脚質適性） ──
    const _a4cr = Yoso.avg4C(histEx);
    // ライブ版は表示用に丸めた値で閾値判定する（検証版は生値・仕様差）
    const avg4C = _a4cr.avg != null ? +_a4cr.avg.toFixed(1) : null;
    const cornMod = Yoso.cornMod(avg4C, _a4cr.count);

    // ── ⑩ 調教師補正（現状は総合スコアに未加算・表示もなし） ──
    const trainerMod = Yoso.trainerMod(lookupTrainerStats(trainer));

    // ── ⑪ 馬体重変化補正 ──
    const weightMod = Yoso.weightMod(Yoso.weightChange(horse.weight, histEx[0]?.weight));

    // ── ⑫ 上がり3F補正（固定表。基準38.5は高知実測平均40.5〜40.9より約2秒速く、ほぼ全馬が
    //  マイナス上限(-1.25×2.5)に飽和＝実質「速い差し馬だけ拾う」弱い信号。getAgRef/_getAgRefBTも
    //  馬エントリに無い v.distance を見ており同じく38.5固定なので、本番もEVもバックテストも一致。
    //  【2026-07-10 A/B検証済・9案スイープ】基準是正/重み/片側+のみ/脚質ゲート/交互作用/無効化を
    //  2993Rで総当たり比較した結果、現行の38.5×2.5が◎勝率(39.4%)・◎単回収(92.0%)ともに最良で、
    //  どの活性化案もこれを上回らなかった（実測40.7基準の×2.5=naiveは◎勝38.5%/回収88.2%と最下位）。
    //  agari完全無効化(J)ですら現行に僅かに劣る＝現行は「速い差し馬の相対エッジだけ拾い、前有利で逆効果に
    //  なる本信号は飽和で捨てる」最適点。よって是正しない。上がり信号は既に良い値。触るとほぼ必ず悪化。
    const _agRefTbl = {800:36.0,1300:38.5,1400:38.5,1600:39.0,1900:39.5,2400:40.0};
    const agariMod = Yoso.agariMod(_agRefTbl[rdistNum] || 38.5, Yoso.agariAvg(histEx, rdistNum));

    // ── ⑬ 前走着差補正（直近2走・勝ち馬との時差平均） ──
    const marginMod = Yoso.marginMod(Yoso.marginAvgGap(histEx));

    // ── ⑭ 勝ち馬の強さ補正（前走惜敗時・勝ち馬SIと自馬平均を比較） ──
    let winStrMod = 0;
    if (marginMod > 0 && histEx.length >= 1) {
      const _ph0 = histEx[0];
      if (parseInt(_ph0.chakujun) > 1 && _ph0.babaCode === '31' && _ph0.raceDate && _ph0.raceNo) {
        const _ld = lsRead();
        const _wpfx = `${_ph0.babaCode}_${_ph0.raceDate}_${_ph0.raceNo}_`;
        let _wSI = null;
        for (const [ck, cv] of Object.entries(_ld)) {
          if (!ck.startsWith(_wpfx) || parseInt(cv.chakujun) !== 1 || !cv.time) continue;
          const _wb3 = getDayBiasForDate(_ph0.babaCode, _ph0.raceDate) ?? null;
          const _rc3 = _ld[`race_${_ph0.babaCode}_${_ph0.raceDate}_${_ph0.raceNo}`] || {};
          _wSI = calcSpeedIndex(cv.time, _rc3.distance||_ph0.distance, _rc3.race_class||_ph0.raceClass, _rc3.track_cond||_ph0.trackCond, _wb3, cv.kinryo, null);
          break;
        }
        if (_wSI !== null && recentSI.length >= 2) {
          const _myAvg = recentSI.reduce((s,v)=>s+v,0)/recentSI.length;
          winStrMod = Yoso.winStrMod(_wSI - _myAvg);
        }
      }
    }

    // ── ⑮ 乗り替わり補正（格上/格下騎手への変更シグナル） ──
    const _getJWR = name => { const s = lookupJockeyStats(name); if (!s) return FIELD_AVG_WR; const src = (s.recent?.n >= 30 ? s.recent : null) || s.all; return src?.wr ?? FIELD_AVG_WR; };
    let jockeyChgMod = 0;
    if (histEx.length >= 1 && jockey) {
      const _prevJ = (histEx[0].jockey || '').trim();
      if (_prevJ && _prevJ !== jockey) jockeyChgMod = Yoso.jockeyChgMod(_getJWR(jockey) - _getJWR(_prevJ));
    }

    // ── ⑯ 叩き効果（休み明け2走目・フィットネス向上補正） ──
    const takiMod = histEx.length >= 2 ? Yoso.takiMod(thisRaceDate, histEx[0].raceDate, histEx[1].raceDate) : 0;

    // ── ⑱ コーナー一貫性補正（直近3走・3→4コーナー順位変化） ──
    const cornConsistMod = Yoso.cornConsistMod(Yoso.cornConsistAvg(histEx));

    // ⑳ 前走楽勝ボーナス（2026-07-05採用）：前走高知が勝利ならその勝ち幅からボーナス。
    //    楽勝(1.0秒+)+5／快勝(0.5-1.0秒)+2.5。SIが「余裕を残した勝ち」を過小評価するのを補正。
    const rakuMod = rakuShoBonus(kochiHist[0]);

    // ㉑ 展開文脈補正（2026-07-10採用）：直近3走(高知)のペース基準比×位置取りで
    //    「逆境(ハイペース)で先行して好走＝地力」+0.5／「ハイペース限定の差し好走＝展開ギフト」−0.4／
    //    「ハイペースで先行して潰れた＝免罪」+0.4 を識別。「楽な競馬をした逃げ馬は割引き、
    //    強い競馬をした逃げ馬は評価したい」という意図を、上がり3Fという時間軸ではなく
    //    位置×ペースという文脈軸で捉える（時間軸での是正は高知の前有利と衝突し逆効果と検証済み）。
    //    3000R backtestで重みスイープ(0〜5.0)し1.5が◎/○/▲全てで現状同等以上の唯一の点
    //    （◎勝率39.3→39.5・◎回収89.7→89.8・悪化なし）。
    // 【2026-07-10】未来情報混入対策：各過去走はその過去走「自身の日付」より前のペース基準表で
    // 判定する（getPaceDevLabelAsOf）。旧実装は全期間集計＝半年前の過去走を、その後3ヶ月分の
    // レースまで含んだ「今日時点の基準」で判定しており、未来のデータで過去を評価していた。
    const paceCtxMod = (() => {
      let tough = false, gifted = false, excused = false;
      const _ld = lsRead();
      for (const h of kochiHist.slice(0, 3)) {
        const rrec = _ld[`race_31_${h.raceDate}_${h.raceNo}`];
        if (!rrec || !rrec.first3f) continue;
        const pd = getPaceDevLabelAsOf(rrec.distance, rrec.race_class, rrec.track_cond, rrec.first3f, h.raceDate, parseInt(h.raceNo));
        if (!pd) continue;
        const c1 = parseInt(String(h.corner || '').split('-')[0]);
        const ch = parseInt(h.chakujun);
        if (isNaN(c1) || c1 <= 0 || isNaN(ch)) continue;
        if (pd.dev <= -0.6 && c1 <= 3 && ch <= 3) tough = true;
        if (pd.dev <= -1.0 && c1 >= 6 && ch <= 3) gifted = true;
        if (pd.dev <= -1.0 && c1 <= 3 && ch >= 4) excused = true;
      }
      return (tough ? 0.5 : 0) + (gifted ? -0.4 : 0) + (excused ? 0.4 : 0);
    })();

    // ⑱ 枠順バイアスは検証で◎精度を下げたため不採用（外枠有利は集計上は実在するが、
    //    能力より弱い信号を◎選択に乗せるとノイズが勝つ。CVで訓練・検証とも悪化・2026-06-30）

    // ⑲ 斤量負担率（斤量÷馬体重）も検証で不採用。EDA単体では複勝+7.7ptの強い信号だったが、
    //    厳密5分割CVでは複勝が5分割中1回しか改善せず（枠順と同じ「弱い信号が◎選択でノイズに
    //    負ける」パターン）。ライブモデルには組み込まない（2026-06-30）。

    // 各補正項の実効倍率で合成。優先順：①学習重み(保存時)→②V3リスケール(2026-07-04採用・下記)→③等倍。
    // V3採用の根拠：5分割時系列CVで印全体の質（ペア整合率5/5fold・○▲複勝↑）が現行を上回り、
    // ◎も平均で改善（複勝70.4→71.3・1着38.0→38.5）。馬アンカーSI採用時と同じ"二段目クリア"基準。
    const _mlW = getMlLiveWeights();
    const _eff = k => (_mlW && _mlW.eff[k] != null) ? _mlW.eff[k] : (YOSO_FACTOR_SCALE[k] != null ? YOSO_FACTOR_SCALE[k] : 1);
    const totalScore = baseScore != null
      ? +(baseScore + condMod*_eff('condNew') + distMod*_eff('distNew') + trendMod*_eff('trendN') + comboMod*_eff('comboN') + rotMod*_eff('rotN') + classMod*_eff('clsN') + cornMod*_eff('cornN') + weightMod*_eff('weightN') + agariMod*_eff('agariN') + marginMod*_eff('marginN') + winStrMod*_eff('winStrN') + jockeyChgMod*_eff('jockeyChgN') + takiMod*_eff('takiN') + cornConsistMod*_eff('cornConsistN') + rakuMod*_eff('rakuN') + paceCtxMod*_eff('paceCtxN')).toFixed(2)
      : null;

    // _cornModRaw: ペース×馬場スケール(下記⑯-b)適用「前」の値。市場アンカーモデルはこのスケール前の
    // 値で学習済みのため、スケール後のcornModをそのまま使うと学習/推論の不一致(train/serve skew)になる。
    return { horse, jockey, trainer, baseScore, jockeyMod, condMod, distMod, trendMod, comboMod, rotMod, classMod, cornMod, weightMod, agariMod, marginMod, winStrMod, jockeyChgMod, takiMod, cornConsistMod, rakuMod, paceCtxMod, avg4C, totalScore, siCount: recentSI.length, kochiSICount, isTransfer, isEstimatedScore, jockeyWR, _cornModRaw: cornMod };
  });

  // ── ⑯-b ペース×馬場バイアスで脚質補正(cornMod)を伸縮 ──
  // 出走馬の脚質構成からペースを予測し、(馬場×ペース)の前残り傾向で cornMod をスケール。
  // 前つぶれ想定日は前の加点を抑え差しの減点を緩和、前残り想定日は前を増す（対称）。
  // 【2026-07-10】行列は必ず現在レースの距離(rdistNum)で構築。旧実装は距離を渡さず常に1400m専用
  // 行列を全距離に適用していた。サンプル不足の距離はgetPaceBiasFactor内のN<20ガードでfactor=1になる。
  const _pbMatrix = buildPaceBiasMatrix(currentBaba || '31', rdistNum);
  const _pbPace   = predictRacePaceFromA4C(scored.map(s => s.avg4C), scored.length);
  const _pbFactor = getPaceBiasFactor(_pbMatrix, raceCond, _pbPace);
  if (_pbFactor !== 1) {
    // 学習重み適用時はcornModのスコア寄与が実効倍率分なので、伸縮もその倍率で行う（整合性）
    const _pbW = getMlLiveWeights();
    const _pbEffCorn = (_pbW && _pbW.eff.cornN != null) ? _pbW.eff.cornN : 1;
    scored.forEach(s => {
      if (s.totalScore != null && s.cornMod) {
        s.totalScore = +(s.totalScore + s.cornMod * _pbEffCorn * (_pbFactor - 1)).toFixed(2);
        s.cornMod    = +(s.cornMod * _pbFactor).toFixed(4);
      }
    });
  }
  // パネル下部のヒント表示用に保持
  scored._paceBias = { pace: _pbPace, factor: _pbFactor, cond: raceCond };

  // ── ⑰ 相対SI補正（フィールド内での相対位置） ──
  const _fsiArr = scored.filter(s => s.baseScore != null).map(s => s.baseScore);
  if (_fsiArr.length >= 3) {
    const _fsiAvg = _fsiArr.reduce((a, b) => a + b, 0) / _fsiArr.length;
    scored.forEach(s => {
      const _rsi = s.baseScore != null ? +Yoso.relSIMod(s.baseScore, _fsiAvg).toFixed(2) : 0;
      s.relSIMod = _rsi;
      if (s.totalScore != null) s.totalScore = +(s.totalScore + _rsi).toFixed(2);
    });
  } else {
    scored.forEach(s => { s.relSIMod = 0; });
  }

  // ── 市場アンカーモデル（2026-07-10本採用・2026-07-11に16→12特徴量へ整理）──
  // 印(◎○▲)の順位はこのモデルで決定する。全出走馬のオッズが揃っている時のみ有効。
  // 「市場の織り込み済み確率(log)＋各種補正の学習係数」をレース内softmaxで確率化したものは、
  // expanding-window walk-forward CV・完全未使用ホールドアウトの両方で、従来の加算totalScore順
  // より一貫して的中率・回収率が上回ると検証済み。totalScore自体は内訳表示用にそのまま残す
  // （表示される数値は変えない。変わるのは印の並び順のみ）。オッズが未発売/不足の間は
  // 従来通りtotalScore順にフォールバックする。
  // 【2026-07-11 16→12特徴量整理】3135R(直近3年)でユーザー指摘の全項目を個別・複合アブレーション
  // 検証（expanding-window walk-forward+ホールドアウト）：condNew(係数+0.004でほぼ無風)・
  // winStrN/rakuN(marginNと相関0.25-0.46で包含関係・削除してもmarginN単独で情報を維持)を削除、
  // rotN+takiN(同時発火率0.12%でほぼ排他だがtakiN単独価値小)を1本化(rotTakiN)。
  // 統合12項目は探索5分割中4分割で改善・ホールドアウトも◎勝率/複勝/回収/対数尤度の全指標で改善。
  const _omRunners = scored
    .filter(s => s.totalScore != null)
    .map(s => {
      const o = parseFloat(s.horse.odds);
      return (!isNaN(o) && o > 0) ? {
        s, odds: o,
        feat: {
          base: s.baseScore, distNew: s.distMod, clsN: s.classMod, cornN: s._cornModRaw,
          trendN: s.trendMod, weightN: s.weightMod, agariN: s.agariMod, comboN: s.comboMod,
          marginN: s.marginMod, jockeyChgN: s.jockeyChgMod, cornConsistN: s.cornConsistMod,
          rotTakiN: s.rotMod + s.takiMod,
        },
      } : null;
    });
  const _omReady = _omRunners.every(r => r != null) && _omRunners.length >= 5;
  if (_omReady) {
    const _om = computeOffsetModelProbs(_omRunners.map(r => ({ odds: r.odds, feat: r.feat })), getOffsetModelWeights());
    _omRunners.forEach((r, i) => { r.s.marketProb = _om.marketProbs[i]; r.s.aiProb = _om.probs[i]; });
  }
  scored._offsetModelUsed = _omReady;

  // 【2026-07-13】印の並び順は常にtotalScore（オッズ非依存のAI単独評価）で決定する。
  // 市場アンカーモデル(aiProb)による並び替えは2026-07-10〜07-12に試験採用していたが、
  // ホールドアウト検証で「◎的中率はやや上がるが人気馬と同義に近づき、穴馬(単勝10倍+)の
  // 捕捉率が事前印33%→市場アンカー版25%に低下」「市場との乖離が大きい馬を昇格させる
  // ハイブリッド案も改善せず」と判明したため、印の並びからは撤去（ユーザー承認2026-07-13）。
  // aiProb/marketProb自体はcomputeOffsetModelProbsで引き続き算出し、🔭穴馬チェック
  // (buildLongshotHtml)等の独立したバッジ機能でのみ使用する。
  scored.sort((a, b) => {
    if (a.totalScore == null && b.totalScore == null) return 0;
    if (a.totalScore == null) return 1;
    if (b.totalScore == null) return -1;
    return b.totalScore - a.totalScore;
  });
  return { scored, comboStats: _comboStats, raceDist, raceCond, raceCls, selCond };
}

// ── 🏇 展開予想（予想隊列）──
// 各馬の過去の前半区間タイム基準比(getFrontDev)の減衰平均から「今日の予想前半位置」を出し、
// 速い順に隊列化。速い前半の馬(dev≤−0.3)の頭数からペースを予測（3頭+=ハイ→前崩れ注意）。
// 表示専用（指数には非関与）。EDA(2742R)：ペース圧力大で先行複勝79→77%・差し+0.5pt＝弱いが実在。
function buildPaceFormationHtml(raceNo) {
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) return '';
  const { raceInfo, horses } = data;
  const _wk = h => Math.min(Math.max(parseInt(h.wakuBan) || Math.ceil((parseInt(h.umaBan) || 1) / 2), 1), 8);
  const WBG = w => ({ 1: '#fff', 2: '#111', 3: '#c00', 4: '#1a5ab8', 5: '#e8c800', 6: '#18a020', 7: '#f05a00', 8: '#c080c8' })[w] || '#888';
  const WFG = w => [1, 5, 8].includes(w) ? '#222' : '#fff';

  const rows = horses.map(h => {
    const hist = getHorseHistoryBefore(h.horseName, raceInfo.raceDate, raceNo).filter(x => x.babaCode === '31');
    const devs = [];
    for (const r of hist) {
      const fs = calcFrontSectional(r.time, r.agari3f);
      if (fs == null) continue;
      const d = getFrontDev(r.raceDate, r.distance, r.raceClass, r.trackCond, fs);
      if (d != null) devs.push(d);
      if (devs.length >= 6) break;
    }
    let pd = null;
    if (devs.length >= 2) { let ws = 0, sm = 0; devs.forEach((v, i) => { const w = Math.pow(0.75, i); ws += w; sm += v * w; }); pd = +(sm / ws).toFixed(2); }
    return { uma: h.umaBan, waku: _wk(h), name: h.horseName, pd, n: devs.length };
  });
  const known = rows.filter(r => r.pd != null);
  if (known.length < 3) return '';   // 前半歴が薄いレースは出さない

  const pressers = known.filter(r => r.pd <= -0.3).length;
  const paceCls = pressers >= 3 ? 'hi' : pressers <= 1 ? 'slow' : 'mid';
  const paceInfo = {
    hi:   { tag: 'ハイ',   tagBg: '#fee2e2', tagFg: '#b91c1c', title: 'ハイペース予想', desc: `先行争い${pressers}頭 → 前崩れ注意・差し / 中団に展開の利` },
    mid:  { tag: 'ミドル', tagBg: '#f1f5f9', tagFg: '#475569', title: 'ミドルペース予想', desc: `先行タイプ${pressers}頭 → 平均的な流れ・地力どおり` },
    slow: { tag: 'スロー', tagBg: '#dcfce7', tagFg: '#166534', title: 'スローペース予想', desc: `速い前半${pressers}頭 → 楽な逃げ・前残り濃厚` },
  }[paceCls];

  const _chip = r => {
    const dv = r.pd == null ? '—' : (r.pd > 0 ? '+' : '') + r.pd.toFixed(1);
    const dc = r.pd == null ? 'pf-dev--mid' : r.pd <= -0.3 ? 'pf-dev--fast' : r.pd >= 0.4 ? 'pf-dev--slow' : 'pf-dev--mid';
    const bd = r.waku === 1 ? 'border:1px solid #bbb;' : '';
    return `<div class="pf-chip"><span style="background:${WBG(r.waku)};color:${WFG(r.waku)};${bd}min-width:19px;height:19px;border-radius:3px;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;">${r.uma}</span><span class="pf-chip-name">${r.name}</span><span class="pf-dev ${dc}">${dv}</span></div>`;
  };
  const _band = (label, subHtml, filt) => {
    const arr = rows.filter(filt).sort((a, b) => (a.pd == null ? 99 : a.pd) - (b.pd == null ? 99 : b.pd));
    if (!arr.length) return '';
    return `<div class="pf-band"><div class="pf-band-label">${label}${subHtml}</div><div class="pf-chips">${arr.map(_chip).join('')}</div></div>`;
  };

  const bandsHtml =
    _band('先頭集団', '<div class="pf-band-sub pf-sub--warn">競り合い→垂れ警戒</div>', r => r.pd != null && r.pd <= -0.7) +
    _band('先行', '', r => r.pd != null && r.pd > -0.7 && r.pd <= -0.2) +
    _band('中団', '<div class="pf-band-sub pf-sub--good">展開の利</div>', r => r.pd != null && r.pd > -0.2 && r.pd <= 0.4) +
    _band('後方', paceCls === 'hi' ? '<div class="pf-band-sub pf-sub--good">展開の利</div>' : '', r => r.pd != null && r.pd > 0.4) +
    _band('データ不足', '<div class="pf-band-sub pf-sub--muted">前半歴なし</div>', r => r.pd == null);

  const note = paceCls === 'hi'
    ? '先行勢が競り合いオーバーペース必至。軸は中団〜先行から折り合える馬、ヒモに差し脚を持つ馬を。'
    : paceCls === 'slow'
      ? '前が楽に運べる隊列。逃げ・先行馬の粘り込みを厚めに、差し・追込は割引推奨。'
      : '極端な先行争いはなく地力どおりに流れそう。予想隊列で位置取りの優劣を確認。';

  return `
    <details class="pf-details">
      <summary class="pf-summary">🏇 展開予想（予想隊列）<span class="pf-sm-tag" style="background:${paceInfo.tagBg};color:${paceInfo.tagFg};">${paceInfo.tag}ペース</span></summary>
      <div class="pf-body">
        <div class="pf-pace pf-pace--${paceCls}"><b>${paceInfo.title}</b>　${paceInfo.desc}</div>
        <div class="pf-hint">数値＝前半区間の基準比（−が速い）／各馬の過去走から推定・上ほど先頭で通過</div>
        ${bandsHtml}
        <div class="pf-note"><b>読み筋：</b>${note}</div>
      </div>
    </details>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 💹 EVモニター（中穴×傾斜・単勝）— ウォークフォワード検証で唯一「継続100%超」
 *    だった買い方をライブ提示する。
 *  戦略＝単勝オッズ10〜20倍 かつ モデル勝率×オッズ>1.0 の馬を、EVに応じた傾斜額で
 *        単勝1点買い（実払戻検証：2021-26 全年100%超・計129%／傾斜166%・上位除外でも頑健）。
 *  モデル＝レース単位・条件付きロジット（16特徴量+log(オッズ)・z正規化・全14,653R学習）。
 *  ★特徴量は runYosoBacktest と同一定義で再計算する。computeYosoScored のライブ base は
 *    アンカー＋ペース＋ポジション補正の「仕様差」があり訓練分布とズレるため、ここでは
 *    backtest と厳密一致の“非アンカー・当日バイアスのみ”base／“ペース伸縮前”cornN を使う。
 *  ※市場を入力に持つモデルのため最終オッズで最も正確。ライブ変動オッズでの実効は
 *    前向きペーパートレードで検証中（memory: kochi-walkforward-ml-verdict）。
 * ═══════════════════════════════════════════════════════════════════════════ */
const KV_EV_MODEL = {
  FN: ['base','condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN','marginN','winStrN','jockeyChgN','takiN','cornConsistN','rakuN'],
  mean:    [38.993818,0.012664,-0.067212,-0.174736,-0.000893,-0.931007,-0.025287,-0.025957,-1.086338,-0.090458,-0.280095,0.008352,0.199378,0.014728,0.003027,0.124291,3.02541],
  std:     [13.07071,1.113188,0.544827,0.376235,0.371473,1.349301,0.740008,0.094795,0.415427,0.543692,0.427872,0.062987,1.594666,0.092843,0.582292,0.675127,1.490624],
  weights: [0.173133,0.008697,-0.007631,-0.006132,0.039985,0.100385,0.039914,0.033711,0.112903,0.115689,0.004005,0.007881,-0.008765,-0.013328,-0.037066,0.022714,-1.299585],
  oddsLo: 10, oddsHi: 20,                              // 中穴帯（この帯でのみ買い推奨を出す）
  evCalLo: 1.5, evCalHi: 2.0,                          // 買い推奨の閾値＝キャリブレーション後EVがこの窓に入る時だけ（下記2026-07-09検証）
  stakeK: 300000, stakeMin: 1000, stakeCap: 30000,   // 傾斜額 = clamp(K×(EV−1))・上限＝プール自己インパクトの実務天井
  invLo: 1.05, invHi: 1.6,                            // 学習ドメイン（Σ1/oddsの健全域）
  // 体重ガード（2026-07-07採用）：今日の馬体重が「その馬の好走時(3着内)平均」から極端に乖離した馬をEV買いから除外。
  //   生EDA(各12,000頭超)：好走時比 +12kg超の太目=勝率6.1%・−8kg超のガレ=7.3%（標準帯10.8%）＝ほぼ半減。
  //   体重を持たないモデルはこの馬のEVを過大評価する（EVの罠）。年別WFで除外するとEV買いROI 130→140%（全6年100%超維持）。
  wDevFuto: 12, wDevGare: -8,
  // 【2026-07-09 確率キャリブレーション採用】楽天の実払戻データ(2023/10-2026/07・286日/3,007R)で検証した結果、
  //   このsoftmax確率pは自信があるほど過大評価(40%予測→実際51.7%)という体系的な歪みがあった(Brier 0.0675)。
  //   下記アンカーは「予測確率ビンの中央値→そのビンの実勝率」の実測値(区分線形補間、範囲外は最終区間の比率で外挿)。
  //   補正後の p×odds を calEvLo〜calEvHi の狭い窓に絞ったところ、286日を前半/後半に分けた両方の期間で
  //   独立に黒字(前半119.1%・後半157.4%・通算136.5%、n=119、100円均一賭け)を確認できた検証済みの窓。
  //   他の券種(複勝・馬連・ワイド・馬単・3連複・3連単)は同じ手法で網羅的に探索したが有意なポケットは見つからず、
  //   このpCal窓は現時点で「唯一の実配当ベースで再現性のあるエッジ」。単勝10-20倍以外では絶対に使わないこと。
  calAnchors: [[0.025,0.017],[0.075,0.064],[0.125,0.121],[0.175,0.149],[0.25,0.222],[0.35,0.311],[0.55,0.517]]
};

/** KV_EV_MODEL.calAnchorsによる区分線形補間で、softmax確率の過大評価を補正する（2026-07-09採用・上記メモ参照）。 */
function _calibrateEvP(p) {
  const A = KV_EV_MODEL.calAnchors;
  const pts = [[0, 0], ...A, [1, A[A.length - 1][1] / A[A.length - 1][0]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (p >= a[0] && p <= b[0]) { const t = (p - a[0]) / (b[0] - a[0] || 1e-9); return a[1] + t * (b[1] - a[1]); }
  }
  return p;
}

/** EV特徴量用の全IDB集計マップ（backtestと同一材料）。データ変更時は _evMapsCache=null で無効化。 */
function _evGetMaps() {
  if (window._evMapsCache) return window._evMapsCache;
  const lsData = lsRead();
  const agariByDist = {}, winnerSIMap = {}, officialByHorse = new Map();
  for (const k in lsData) {
    const v = lsData[k];
    if (!v) continue;
    if (k.startsWith('official_') && v.type === 'official' && v.horseName && v.races && v.races.length) officialByHorse.set(v.horseName, v.races);
    if (v.type !== 'horse') continue;
    if (v.agari3f) { const a = parseFloat(v.agari3f); if (!(isNaN(a) || a < 30 || a > 50)) { const d = getDistNum(v.distance); if (d) { (agariByDist[d] || (agariByDist[d] = { s: 0, n: 0 })); agariByDist[d].s += a; agariByDist[d].n++; } } }
    if (parseInt(v.chakujun) === 1 && v.time) {
      const wp = k.split('_');
      if (wp.length >= 4 && wp[0] === '31') {
        const wrk = `${wp[0]}_${wp[1]}_${wp[2]}`;
        if (winnerSIMap[wrk] == null) {
          const wb = getDayBiasForDate(wp[0], wp[1]) ?? null;
          const rc = lsData[`race_${wp[0]}_${wp[1]}_${parseInt(wp[2])}`] || {};
          const wsi = calcSpeedIndex(v.time, rc.distance || '', rc.race_class || '', rc.track_cond || v.trackCond || '', wb, v.kinryo, null);
          if (wsi != null) winnerSIMap[wrk] = wsi;
        }
      }
    }
  }
  const getAgRef = d => {
    if (agariByDist[d] && agariByDist[d].n >= 10) return agariByDist[d].s / agariByDist[d].n;
    const ns = Object.entries(agariByDist).filter(([, x]) => x.n >= 10).sort((a, b) => Math.abs(+a[0] - d) - Math.abs(+b[0] - d));
    return ns.length ? ns[0][1].s / ns[0][1].n : 38.5;
  };
  return (window._evMapsCache = { getAgRef, winnerSIMap, officialByHorse });
}

/** 1頭ぶんのEV特徴量ベクトル（16項目・backtest定義と厳密一致）。base算出不可（真のデビュー馬）は null。 */
function _evHorseFeatures(hName, entry, ctx, maps) {
  const { raceDate, rNo, raceCls, raceDist, rdistNum, curCR, selCond } = ctx;
  const fullHist = getHorseHistory(hName);
  const preHist = fullHist.filter(h => h.raceDate < raceDate || (h.raceDate === raceDate && parseInt(h.raceNo) < rNo));
  const kochiPre = preHist.filter(h => h.babaCode === '31');
  const otherPre = preHist.filter(h => h.babaCode !== '31');

  // 【2026-07-10】computeHorseSI()に統一（③）。ライブ/バックテストと同じ計算。
  const _siForBT = h => computeHorseSI(h, false, { predictionDate: raceDate, predictionRaceNo: rNo, caller: '_evHorseFeatures' });
  const { list: siList } = Yoso.buildSIList(kochiPre, otherPre, _siForBT);
  let base = Yoso.baseFromSIList(siList);
  if (base == null) { base = Yoso.estimateTransferScore(preHist, raceCls, hName, maps.officialByHorse); if (base == null) return null; }

  const allSIcd = Yoso.siWithCondList(preHist, h => getDayBiasForDate(h.babaCode, h.raceDate) ?? null);
  const gAvg = allSIcd.length ? allSIcd.reduce((s, x) => s + x.si, 0) / allSIcd.length : null;
  const cSIs = allSIcd.filter(x => x.cond === selCond).map(x => x.si);
  const cAvg = cSIs.length ? cSIs.reduce((a, b) => a + b, 0) / cSIs.length : null;
  const condNew = Yoso.condMod(cAvg, gAvg, cSIs.length);

  const ndSIs = allSIcd.filter(x => x.dist && rdistNum && Math.abs(x.dist - rdistNum) <= 100).map(x => x.si);
  const ndAvg = ndSIs.length ? ndSIs.reduce((a, b) => a + b, 0) / ndSIs.length : null;
  const distNew = Yoso.distExtAdj(Yoso.distMod(ndAvg, gAvg, ndSIs.length), preHist[0] ? getDistNum(preHist[0].distance) : null, rdistNum);

  const rotN = preHist[0] ? Yoso.rotMod(raceDate, preHist[0].raceDate) : 0;
  const clsN = preHist[0] ? Yoso.classMod(curCR, preHist[0].raceClass) : 0;
  const _a4cB = Yoso.avg4C(preHist);
  const cornN = Yoso.cornMod(_a4cB.avg, _a4cB.count);           // ペース伸縮前の生値（scanData準拠）
  const trendN = Yoso.trendMod(siList);
  const weightN = Yoso.weightMod(Yoso.weightChange(entry.weight, preHist[0]?.weight));
  const agariN = Yoso.agariMod(maps.getAgRef(rdistNum), Yoso.agariAvg(preHist, rdistNum));
  const comboN = Yoso.comboMod(getComboStatsAll()[`${(entry.jockey || '').trim()}_${(entry.trainer || '').trim()}`], ctx.fieldSize);
  const marginN = Yoso.marginMod(Yoso.marginAvgGap(preHist));

  let winStrN = 0;
  if (marginN > 0 && preHist.length >= 1 && parseInt(preHist[0].chakujun) > 1) {
    const _ph0 = preHist[0];
    const _wSI = maps.winnerSIMap[`${_ph0.babaCode}_${_ph0.raceDate}_${_ph0.raceNo}`];
    if (_wSI != null && siList.length >= 2) winStrN = Yoso.winStrMod(_wSI - siList.reduce((s, v) => s + v, 0) / siList.length);
  }

  const _getJWRbt = name => { const s = lookupJockeyStats(name); if (!s) return 12; const src = (s.recent?.n >= 30 ? s.recent : null) || s.all; return src?.wr ?? 12; };
  let jockeyChgN = 0;
  if (entry.jockey && preHist.length >= 1) {
    const _pj = (preHist[0].jockey || '').trim(), _cj = (entry.jockey || '').trim();
    if (_pj && _pj !== _cj) jockeyChgN = Yoso.jockeyChgMod(_getJWRbt(_cj) - _getJWRbt(_pj));
  }
  const takiN = preHist.length >= 2 ? Yoso.takiMod(raceDate, preHist[0].raceDate, preHist[1].raceDate) : 0;
  const cornConsistN = Yoso.cornConsistMod(Yoso.cornConsistAvg(preHist));
  const rakuN = rakuShoBonus(kochiPre[0]);

  return [base, condNew, distNew, rotN, clsN, cornN, trendN, weightN, agariN, comboN, marginN, winStrN, jockeyChgN, takiN, cornConsistN, rakuN];
}

/** その馬の「好走時(3着内)平均馬体重」を当該レースより前の高知成績から算出（リーク無し）。無ければ null。 */
function _evWeightNorm(hName, raceDate, rNo) {
  const hist = getHorseHistory(hName).filter(h =>
    (h.raceDate < raceDate || (h.raceDate === raceDate && parseInt(h.raceNo) < rNo)));
  const pw = s => { const m = String(s || '').match(/(\d{3})/); const w = m ? parseInt(m[1]) : NaN; return (w >= 300 && w <= 700) ? w : NaN; };
  const itm = [], all = [];
  for (const h of hist) { const w = pw(h.weight); if (isNaN(w)) continue; all.push(w); if (parseInt(h.chakujun) <= 3) itm.push(w); }
  if (itm.length >= 1) return itm.reduce((a, b) => a + b, 0) / itm.length;
  if (all.length >= 2) return all.reduce((a, b) => a + b, 0) / all.length;
  return null;
}

/**
 * 💹 EVベット算出。戻り値 { runners:[{uma,name,odds,p,ev,inWindow,stake,weightDev,weightWarn}], invSum, inDomain, nOdds }｜不能は null。
 * selCond 省略時はレースの馬場状態を使用。weightWarn＝好走時比で極端な太目/ガレ（EVの罠・買い除外）。
 */
function computeEvBets(raceNo, selCond) {
  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) return null;
  const raceInfo = data.raceInfo;
  const M = KV_EV_MODEL;
  const ctx = {
    raceDate: raceInfo.raceDate || '',
    rNo: parseInt(raceNo),
    raceCls: raceInfo.raceClass || raceInfo.race_class || '',
    raceDist: String(raceInfo.distance || '').replace(/[^\d]/g, ''),
    selCond: selCond || raceInfo.trackCond || raceInfo.track_cond || '良',
  };
  ctx.rdistNum = parseInt(ctx.raceDist) || 0;
  ctx.curCR = YOSO_CLASS_RANK[getEffectiveClass(ctx.raceCls)] || 0;
  ctx.fieldSize = data.horses.length;
  const maps = _evGetMaps();

  // オッズが有効な出走馬でレースを構成
  const cand = data.horses
    .map(h => ({ h, uma: parseInt(h.umaBan), odds: parseFloat(h.odds) }))
    .filter(x => !isNaN(x.uma) && !isNaN(x.odds) && x.odds > 0);
  if (cand.length < 5) return { runners: [], invSum: 0, inDomain: false, nOdds: cand.length };

  const invSum = cand.reduce((s, x) => s + 1 / x.odds, 0);
  const inDomain = invSum >= M.invLo && invSum <= M.invHi;

  const scored = [];
  for (const c of cand) {
    const feat = _evHorseFeatures(c.h.horseName || '', c.h, ctx, maps);
    if (!feat) continue; // 真のデビュー馬はプールから除外（scanDataと同じ扱い）
    feat.push(Math.log(c.odds)); // 17項目め = log(オッズ)
    let sc = 0;
    for (let f = 0; f < feat.length; f++) sc += M.weights[f] * ((feat[f] - M.mean[f]) / M.std[f]);
    scored.push({ uma: c.uma, name: c.h.horseName || '', odds: c.odds, sc, h: c.h });
  }
  if (scored.length < 5) return { runners: [], invSum, inDomain, nOdds: cand.length };

  const mx = Math.max(...scored.map(s => s.sc));
  let Z = 0; scored.forEach(s => { s.e = Math.exp(s.sc - mx); Z += s.e; });
  const _pw = s => { const m = String(s || '').match(/(\d{3})/); const w = m ? parseInt(m[1]) : NaN; return (w >= 300 && w <= 700) ? w : NaN; };
  const runners = scored.map(s => {
    const p = s.e / Z;
    const ev = p * s.odds;
    // 体重ガード：今日の馬体重が好走時平均から極端に乖離した馬はEVの罠として買い除外
    let weightDev = null, weightWarn = null;
    const curW = _pw(s.h.weight);
    if (!isNaN(curW)) {
      const norm = _evWeightNorm(s.h.horseName || '', ctx.raceDate, ctx.rNo);
      if (norm != null) {
        weightDev = Math.round((curW - norm) * 10) / 10;
        if (weightDev >= M.wDevFuto) weightWarn = 'futo';
        else if (weightDev <= M.wDevGare) weightWarn = 'gare';
      }
    }
    const pCal = _calibrateEvP(p);           // 過大評価を補正した確率（2026-07-09採用）
    const evCal = pCal * s.odds;             // 補正後EV＝実配当ベースで検証済みの買い判定に使う値
    const evOk = s.odds >= M.oddsLo && s.odds < M.oddsHi && evCal >= M.evCalLo && evCal < M.evCalHi;
    const inWindow = evOk && !weightWarn;                   // 買い推奨＝検証済みの補正後EV窓かつ体重ガード通過
    let stake = 0;
    if (inWindow) stake = Math.max(M.stakeMin, Math.min(M.stakeCap, Math.round(M.stakeK * (evCal - 1) / 100) * 100));
    return { uma: s.uma, name: s.name, odds: s.odds, p, ev, pCal, evCal, inWindow, stake, weightDev, weightWarn, evOk };
  }).sort((a, b) => b.ev - a.ev);
  return { runners, invSum, inDomain, nOdds: cand.length };
}

/** EVモニターのライブオッズ取得→パネル再描画（予想パネル専用の取得ボタン用）。 */
async function fetchOddsForEv(raceNo) {
  const btn = document.getElementById(`ev-fetch-btn-${raceNo}`);
  if (btn) { btn.disabled = true; btn.textContent = '取得中...'; }
  try {
    await fetchLiveOdds(raceNo);
    renderHorseRows(raceNo, allRacesData[raceNo].horses);
    if (allRacesData[raceNo]?.horses.some(h => h.postComment)) _renderCommentsInTable(raceNo);
  } catch (e) {
    console.warn('[ev-odds]', raceNo, e);
    if (btn) { btn.disabled = false; btn.textContent = '💹 未発売/取得失敗（再試行）'; }
    return;
  }
  renderPredictionPanel(raceNo); // EVモニターを再計算して反映
  renderCockpitSummary(raceNo);
  renderOddsPanel(raceNo);
  _updateCockpitRaceStatus(raceNo);
}

/** 💹 EVモニターのHTML。オッズ未取得なら取得ボタン、該当なしは見送り、該当ありは傾斜額つきで提示。 */
function buildEvMonitorHtml(raceNo, selCond) {
  let res;
  try { res = computeEvBets(raceNo, selCond); } catch (e) { console.warn('[ev]', e); return ''; }
  if (!res) return '';
  const M = KV_EV_MODEL;
  const _yen = n => '¥' + n.toLocaleString('en-US');
  const _head = (tag, tagBg) => `<div class="evb-head">💹 買い時チェック<span style="font-weight:600;font-size:11px;opacity:.85">単勝が「お得」かの判定</span>${tag ? `<span class="evb-tag" style="${tagBg ? 'background:' + tagBg : ''}">${tag}</span>` : ''}</div>`;

  // オッズ未取得
  if (res.nOdds < 5) {
    return `<div class="ev-monitor-bar skip">${_head('', '')}
      <div style="margin-top:6px">単勝オッズが未取得です。取得すると「AIが見積もる勝つ確率」に対してオッズが十分おいしいかを判定します。
        <button type="button" id="ev-fetch-btn-${raceNo}" class="evb-fetch" style="margin-left:6px" onclick="fetchOddsForEv(${raceNo})">💹 オッズを取得して判定</button></div></div>`;
  }

  const bets = res.runners.filter(r => r.inWindow);
  const warned = res.runners.filter(r => r.evOk && r.weightWarn);  // 買い得だが体重ガードで除外
  const cautionHtml = !res.inDomain
    ? `<div class="evb-sub" style="color:#b45309">⚠️ オッズがまだ固まっていない時間帯の可能性があります（発売直後など）。締切前にもう一度オッズを取り直して確認するのがおすすめです。</div>`
    : '';
  const _wLabel = r => r.weightWarn === 'futo' ? `馬体重が普段より+${r.weightDev}kgと重い` : `馬体重が普段より${r.weightDev}kgと軽い`;
  const warnHtml = warned.length
    ? `<div class="evb-sub">⚖️ 数字はお得でも馬体重が普段と大きく違うため対象外にした馬：${warned.map(r => `<b>${escapeHTML(r.name)}</b>（${r.odds.toFixed(1)}倍／${_wLabel(r)}）`).join('　')}<br><span style="opacity:.8">こういう馬は過去データで勝率が大きく落ちるため買いから外しています。</span></div>`
    : '';

  if (bets.length) {
    const rows = bets.map(b => `
      <div class="evb-row">
        <span class="evb-uma">${escapeHTML(b.uma)}</span>
        <span class="evb-name">${escapeHTML(b.name) || '—'}</span>
        <span class="evb-metric">単勝${b.odds.toFixed(1)}倍 / AIの見立てでは勝率${(b.pCal * 100).toFixed(1)}% / お得度<b>${b.evCal.toFixed(2)}倍</b></span>
        <span class="evb-stake">${_yen(b.stake)}</span>
      </div>`).join('');
    const total = bets.reduce((s, b) => s + b.stake, 0);
    return `<div class="ev-monitor-bar${res.inDomain ? '' : ' caution'}">${_head('勝負', '')}
      ${rows}
      <div class="evb-sub">「お得度」＝AIの勝率で見た払戻の期待倍率（1.00より大きいほどオッズが勝率に対して高くおいしい）。金額はお得なほど多め（上限${_yen(M.stakeCap)}）・単勝のみ。合計 <b>${_yen(total)}</b>。<br>
        この条件（単勝${M.oddsLo}〜${M.oddsHi}倍の中穴でお得度が高い馬）は、過去286日ぶんの実際の配当で検証して期間を分けても黒字（回収率 約136%）でした。ただし該当例はまだ多くないので、金額は控えめに。</div>
      ${warnHtml}${cautionHtml}</div>`;
  }

  // 該当なし＝見送り。参考に最上位の馬を1頭示す。
  const top = res.runners[0];
  const refWhy = warned.length
    ? `候補だった${escapeHTML(warned[0].name)}は${_wLabel(warned[0])}ため見送り`
    : top
      ? (top.odds < M.oddsLo ? `いちばんお得なのは${escapeHTML(top.name)}ですが単勝${top.odds.toFixed(1)}倍と人気になりすぎ（狙い目は${M.oddsLo}〜${M.oddsHi}倍の中穴）`
        : top.odds >= M.oddsHi ? `いちばんお得なのは${escapeHTML(top.name)}ですが単勝${top.odds.toFixed(1)}倍の大穴すぎて対象外（狙い目は${M.oddsLo}〜${M.oddsHi}倍）`
        : `中穴（${M.oddsLo}〜${M.oddsHi}倍）に「オッズが勝率より十分高い馬」がいません`)
      : '';
  return `<div class="ev-monitor-bar skip">${_head('見送り', '#64748b')}
    <div style="margin-top:5px">このレースに「買って得」といえる単勝はありません＝<b>見送り推奨</b>。${refWhy ? '<br><span style="font-size:11px;opacity:.85">' + refWhy + '</span>' : ''}</div>
    ${warned.length ? warnHtml : ''}${cautionHtml}</div>`;
}

/** 🔭 穴馬チェック（2026-07-10本採用）：市場アンカーモデルのAI推定確率(aiProb)が
 * 市場の織り込み確率(marketProb)よりどれだけ高いか＝ratioで中〜大穴の妙味を検出（表示専用）。
 * 上のEVモニター(computeEvBets/KV_EV_MODEL)とは別系統のモデル・検証。
 * 検証（3000R expanding-window walk-forward CV＋直近3ヶ月ホールドアウト）：
 * 単勝8〜30倍・ratio≥1.25は n=231・回収率 約109.7%（合格）。
 * 単勝30倍以上・ratio≥1.5は方向は同じだが n=24 と少なく、買い推奨ではなく参考表示にとどめる。 */
function buildLongshotHtml(scored) {
  if (!scored || !scored._offsetModelUsed) return '';
  const cands = scored
    .filter(s => s.totalScore != null && s.aiProb != null && s.marketProb != null && s.marketProb > 0)
    .map(s => ({ s, odds: parseFloat(s.horse.odds), ratio: s.aiProb / s.marketProb }))
    .filter(c => !isNaN(c.odds));
  // 1レース最大1頭（ratio最大のみ）：候補を絞るほど規律が保てるため。検証時(n=231)も大半が1R1頭だった。
  const mid = cands.filter(c => c.odds >= 8 && c.odds < 30 && c.ratio >= 1.25).sort((a, b) => b.ratio - a.ratio).slice(0, 1);
  const big = cands.filter(c => c.odds >= 30 && c.ratio >= 1.5).sort((a, b) => b.ratio - a.ratio).slice(0, 1);
  if (!mid.length && !big.length) return '';
  const midRows = mid.map(c => `
      <div class="evb-row">
        <span class="evb-uma">${escapeHTML(c.s.horse.umaBan) || '—'}</span>
        <span class="evb-name">${escapeHTML(c.s.horse.horseName) || '—'}</span>
        <span class="evb-metric">単勝${c.odds.toFixed(1)}倍 / オッズの人気度よりAIの評価が${Math.round((c.ratio - 1) * 100)}%高い</span>
      </div>`).join('');
  const midHtml = mid.length ? `
    <div class="evb-head">🔭 穴馬チェック<span style="font-weight:600;font-size:11px;opacity:.85">単勝8〜30倍でオッズより評価が高い馬</span></div>
    ${midRows}
    <div class="evb-sub">過去データの検証（該当231件）では平均回収率 約110%。オッズは発売直後で不安定なことがあるため、締切前にもう一度見直すのがおすすめです。</div>` : '';
  const bigHtml = big.length ? `
    <div class="evb-sub" style="margin-top:${mid.length ? '8px' : '0'}">🔭 参考：単勝30倍以上でさらにズレが大きい馬＝${big.map(c => `<b>${escapeHTML(c.s.horse.horseName)}</b>（${c.odds.toFixed(1)}倍）`).join('・')}。傾向は同じ方向ですが該当例がまだ少なく、買い推奨ではなく参考情報です。</div>` : '';
  return `<div class="ev-monitor-bar">${midHtml}${bigHtml}</div>`;
}

// ── 🧠 AI予想レポート（ルールベース予想エンジン・無料/オフライン）─────────────
// チャット予想の手順をJS化：当日バイアス×脚質整合(全印一貫)・コメント癖辞書(位置取り照合つき)・
// 持ち時計比較・展開シミュレーション(気性難の代替シナリオ)・危険な人気馬/穴の根拠明示・自己チェック。
// 指数本体(computeYosoScored)には一切手を触れない表示レイヤー。
const _YR_QUIRKS = [
  { k: 'sand',  re: /砂を被|揉まれ/, label: '砂を被ると嫌がる', neg: true },
  { k: 'gate',  re: /ゲート.{0,6}(失敗|遅れ|うるさい|駐立)|出負け|出遅れ/, label: 'ゲート難', neg: true },
  { k: 'kisho', re: /気難し|ムラがあ|真面目では|集中力|気合が入りにくい|遊んでい/, label: '気性に課題', neg: true },
  { k: 'zubu',  re: /ズブ|反応が鈍|進む気が無/, label: 'ズブい・反応が鈍い', neg: true },
  { k: 'front', re: /前に行った方|先行した方|逃げれて楽/, label: '前向きな競馬が合う' },
  { k: 'wet',   re: /雨馬場の方|湿った(方|馬場)が良/, label: '湿った馬場が良い' },
  { k: 'dry',   re: /乾いた馬場|普通の馬場の方/, label: '乾いた馬場が良い' },
  { k: 'distLong', re: /距離は?長い|mは長い/, label: '距離が長い(厩舎談)', neg: true },
  { k: 'late',  re: /終いは(確実|伸び)|一脚は使|よく追い込/, label: '終いは確実' },
  { k: 'good',  re: /調子は良|状態は良|良化|走りは良かった/, label: '状態は良さそう' },
];
const _YR_CLS = { 'A': 5, 'B': 4, 'C1': 3, 'C2': 2, 'C3': 1 };
function _yrSec(t) { const m = String(t || '').match(/(\d+):(\d+\.\d)/); return m ? parseInt(m[1]) * 60 + parseFloat(m[2]) : null; }
function _yrWet(c) { return c === '不良' || c === '重' || c === '稍重'; }
function _yrC1(cn) { const v = parseInt(String(cn || '').split('-')[0]); return isNaN(v) || v < 1 ? null : v; }

function _yrProfile(h, ctx) {
  const name = h.horseName || '';
  let hist = [];
  try { hist = getHorseHistoryBefore(name, ctx.date, ctx.rno).filter(x => x.babaCode === '31').slice(0, 5); } catch (e) {}
  const c1s = hist.map(r => _yrC1(r.corner)).filter(v => v != null);
  const avgC1 = c1s.length ? c1s.reduce((a, b) => a + b, 0) / c1s.length : null;
  let style = '不明', styleCls = 'mid';
  if (avgC1 != null) { style = avgC1 <= 2.4 ? '逃げ' : avgC1 <= 4.5 ? '先行' : avgC1 <= 7 ? '中団' : '後方'; styleCls = avgC1 <= 4.5 ? 'front' : avgC1 <= 7 ? 'mid' : 'back'; }
  const jizai = c1s.length >= 3 && Math.min(...c1s) <= 2 && Math.max(...c1s) >= 6;
  const atDist = hist.filter(r => String(r.distance || '').replace(/[^\d]/g, '') === ctx.dist);
  const distTimes = atDist.map(r => _yrSec(r.time)).filter(v => v);
  const wetRuns = hist.filter(r => _yrWet(r.trackCond));
  const wetTop3 = wetRuns.filter(r => parseInt(r.chakujun) <= 3).length;
  const quirks = {};
  hist.slice(0, 4).forEach((r, i) => { const cm = r.postComment || ''; if (!cm) return;
    _YR_QUIRKS.forEach(q => { if (q.re.test(cm) && !quirks[q.k]) quirks[q.k] = { label: q.label, neg: !!q.neg, recent: i < 2 }; }); });
  // 教訓②:「距離長い」コメントは同距離の敗戦の位置取りと照合＝前で試していなければ「未知」扱い
  if (quirks.distLong) { const frontTried = atDist.some(r => { const c = _yrC1(r.corner); return c != null && c <= 4; });
    if (!frontTried) quirks.distLong.unknown = true; }
  const wm = String(h.weight || '').match(/(\d{3})\(([+-]?\d+)\)/);
  const lastCls = hist[0] ? (_YR_CLS[getEffectiveClass(hist[0].raceClass)] || null) : null;
  const nowCls = _YR_CLS[getEffectiveClass(ctx.cls)] || null;
  return { h, name, uma: h.umaBan, hist, nHist: hist.length, style, styleCls, jizai, avgC1,
    distBest: distTimes.length ? Math.min(...distTimes) : null, distTop3: atDist.filter(r => parseInt(r.chakujun) <= 3).length, distN: atDist.length,
    wetN: wetRuns.length, wetTop3, quirks, wDelta: wm ? +wm[2] : null,
    clsUp: (lastCls != null && nowCls != null) ? nowCls - lastCls : 0,
    lastCh: hist[0] ? (parseInt(hist[0].chakujun) || null) : null,
    ninki: parseInt(h.ninki) || null, odds: parseFloat(h.odds) || null };
}

function _yrBuild(raceNo) {
  const data = allRacesData[raceNo]; if (!data || !data.horses.length) return null;
  const ri = data.raceInfo;
  const ctx = { date: ri.raceDate, rno: parseInt(raceNo), dist: String(ri.distance || '').replace(/[^\d]/g, ''),
    cls: ri.raceClass || '', cond: ri.trackCond || '', isFinal: /ファイナル/.test(ri.raceName || '') };
  // ── 当日バイアス（このレースより前の確定Rのみ＝結果リーク防止）──
  let fN = 0, fH = 0, mN = 0, mH = 0, bN = 0, bH = 0, favHit = 0, favN = 0, resR = 0;
  Object.keys(allRacesData).map(Number).filter(rn => rn < ctx.rno).forEach(rn => {
    let has = false;
    (allRacesData[rn].horses || []).forEach(x => { const ch = parseInt(x.chakujun); if (isNaN(ch)) return; has = true;
      const c1 = _yrC1(x.corner); if (c1 != null) { if (c1 <= 3) { fN++; if (ch <= 3) fH++; } else if (c1 <= 7) { mN++; if (ch <= 3) mH++; } else { bN++; if (ch <= 3) bH++; } }
      if (parseInt(x.ninki) === 1) { favN++; if (ch <= 3) favHit++; } });
    if (has) resR++;
  });
  const frontRate = fN >= 8 ? Math.round(100 * fH / fN) : null;
  const backRate = bN >= 5 ? Math.round(100 * bH / bN) : null;
  const biasMode = frontRate == null ? 'unknown' : frontRate >= 52 ? 'front' : frontRate <= 35 ? 'back' : 'flat';
  // ── AI指数・EV ──
  let aiMap = {}, aiOk = false;
  try { computeYosoScored(raceNo).scored.forEach((s, i) => { aiMap[s.horse.horseName] = { rank: i + 1, sc: s.totalScore }; if (s.totalScore != null) aiOk = true; }); } catch (e) {}
  let evList = [];
  try { const er = computeEvBets(raceNo); if (er && er.runners) evList = er.runners; } catch (e) {}
  // ── 各馬プロファイル＋調整スコア ──
  const ps = data.horses.map(h => _yrProfile(h, ctx));
  const fieldBest = Math.min(...ps.map(p => p.distBest).filter(v => v), Infinity);
  const wetToday = _yrWet(ctx.cond);
  ps.forEach(p => {
    const ai = aiMap[p.name] || {};
    p.aiRank = ai.rank || 99; p.aiSc = ai.sc;
    let adj = 0, hardNeg = 0; const plus = [], minus = [], notes = [];
    // 教訓⑤: バイアスは全馬に適用。ただし6/27全11Rのバックテストで「後方馬でも2-3着頻発」＝沈めすぎ厳禁(教訓⑦)。
    //   バイアスは軽い加減点(soft)に留め、消しに落とすのは"実質的な減点"(hardNeg)だけにする。
    if (biasMode === 'front') { if (p.styleCls === 'front') { adj += 2; plus.push('前有利の馬場×' + p.style + '脚質が合致'); }
      else if (p.styleCls === 'back') { adj -= 1.5; minus.push('前有利の今日、後方脚質はやや不利'); } }
    else if (biasMode === 'back') { if (p.styleCls === 'back') { adj += 1.5; plus.push('差し優勢の馬場×追い込み脚質'); }
      else if (p.styleCls === 'front') { adj -= 1; minus.push('差し優勢の今日、前はやや苦しい'); } }
    if (p.jizai) { adj += 1; plus.push('位置取り自在（教訓⑥：番手戦法で差し切れる型）'); }
    if (wetToday) { if (p.wetTop3 >= 2) { adj += 1.5; plus.push('渋った馬場【' + p.wetTop3 + '好走】実績'); }
      if (p.quirks.wet) { adj += 1; plus.push('厩舎談「湿った馬場が良い」×今日' + ctx.cond); }
      if (p.quirks.dry) { adj -= 2; hardNeg++; minus.push('厩舎談「乾いた馬場が良い」×今日' + ctx.cond); } }
    if (p.distBest != null && isFinite(fieldBest)) { const d = +(p.distBest - fieldBest).toFixed(1);
      p.timeDef = d;
      if (d <= 0.05) { adj += 1.5; plus.push('当該距離の持ち時計がメンバー最速'); }
      else if (d >= 1.2) { adj -= 2; hardNeg++; minus.push('持ち時計がメンバー最速比+' + d + '秒不足'); } }
    if (p.quirks.sand && parseInt(p.h.wakuBan) <= 4 && p.styleCls !== 'front') { adj -= 2.5; hardNeg++; minus.push('砂被りNG×内枠×先行力不足は致命的'); }
    if (p.quirks.gate && p.quirks.gate.recent) { adj -= 1.5; hardNeg++; minus.push('直近にゲート難'); }
    if (p.quirks.kisho) { adj -= 1; minus.push('気性に課題（ムラ駆け注意）'); }
    if (p.quirks.zubu) { adj -= 1; minus.push('ズブさ・反応の鈍さ'); }
    if (p.quirks.distLong && !p.quirks.distLong.unknown) { adj -= 1.5; hardNeg++; minus.push('厩舎が距離長いと明言'); }
    if (p.quirks.distLong && p.quirks.distLong.unknown) { notes.push('「距離長い」談あるが前付けは未試行＝未知（教訓②）'); }
    if (p.quirks.front && biasMode === 'front') { adj += 1; plus.push('前向きな競馬が合う×前有利'); }
    if (p.quirks.late) { plus.push('終いは確実（3着紐の価値）'); }
    if (p.quirks.good) { plus.push('陣営コメントの状態良し'); }
    if (p.wDelta != null && Math.abs(p.wDelta) >= 10) { adj -= 2; hardNeg++; minus.push('馬体重' + (p.wDelta > 0 ? '+' : '') + p.wDelta + 'kgの大幅変動'); }
    if (p.clsUp > 0) { adj -= 1; hardNeg++; minus.push('昇級戦'); }
    if (p.clsUp < 0) { adj += 1.5; plus.push('降級で相手弱化'); }
    if (p.nHist <= 1) { notes.push('高知' + p.nHist + '走のみ＝データ不足（転入直後）'); }
    p.adj = adj; p.plus = plus; p.minus = minus; p.notes = notes; p.hardMinus = hardNeg > 0;
    p.final = (p.aiSc != null ? p.aiSc : 0) + adj;
  });
  // 教訓⑨（6/27バックテスト）: 高知データ不足でも人気上位の馬を消しに落とさない＝市場を尊重してフロア。
  //   R3・R7で無データの1番人気が実1着だが最下位評価だった→データが無い時こそ市場に敬意。
  const _sf = ps.filter(p => p.aiSc != null).map(p => p.final).sort((a, b) => b - a);
  const _floor4 = _sf.length ? _sf[Math.min(3, _sf.length - 1)] : 0;
  ps.forEach(p => { if (p.ninki && p.ninki <= 2 && (p.aiSc == null || p.nHist <= 1) && p.final < _floor4) { p.final = _floor4 + 0.2; if (!p.notes.some(n => /市場評価を尊重/.test(n))) p.notes.push('高知データ不足だが' + p.ninki + '人気＝市場評価を尊重しフロア適用（教訓⑨）'); } });
  // ── 印（AI指数＋調整の総合順）──
  ps.sort((a, b) => b.final - a.final);
  const MK = ['◎', '○', '▲', '△', '△'];
  ps.forEach((p, i) => { p.mark = i < 5 ? MK[i] : '消し'; });
  // ☆穴: EVモデルが評価する15倍以上（教訓④）を1頭（印下位から昇格）
  const hole = ps.find(p => { if (p.mark !== '消し' && p.mark !== '△') return false; const ev = evList.find(r => r.name === p.name);
    return ev && p.odds >= 15 && ev.ev >= 0.55 && (p.styleCls === 'front' || p.quirks.late || biasMode !== 'front'); });
  if (hole) hole.mark = '☆';
  // ── 展開（教訓③: 気性難逃げ馬の代替シナリオ）──
  const nige = ps.filter(p => p.avgC1 != null && (p.avgC1 <= 2.4 || p.hist.slice(0, 3).some(r => _yrC1(r.corner) === 1)));
  const senko = ps.filter(p => p.styleCls === 'front' && !nige.includes(p));
  let paceTxt, paceWarn = '';
  if (nige.length >= 3) paceTxt = 'ハイ寄り（逃げ' + nige.length + '頭で先行争い激化）';
  else if (nige.length === 2) paceTxt = '平均〜ややハイ（' + nige.map(p => p.name).join('と') + 'のハナ争い）';
  else if (nige.length === 1) { paceTxt = 'スロー〜平均（' + nige[0].name + 'の単騎逃げ濃厚＝前残り警戒）';
    if (nige[0].quirks.kisho) paceWarn = '⚠️ 逃げ候補' + nige[0].name + 'は気性に課題＝行けなかった場合は隊列一変・別の先行馬の楽逃げまで想定（教訓③）'; }
  else paceTxt = 'スロー（明確な逃げ馬不在＝position争い）';
  // ── 危険な人気馬（2-5人気で「実質減点(hardMinus)あり×エンジン評価が人気より2枚以上下」）──
  //   6/27バックテスト: 旧条件は誤検知3/4（バイアス沈めの副作用で好走馬を危険視）。hardMinus必須＋1人気除外で精度化。
  const danger = ps.filter((p, idx) => p.ninki && p.ninki >= 2 && p.ninki <= 5 && p.hardMinus && (idx + 1) >= p.ninki + 2)
    .sort((a, b) => a.ninki - b.ninki)[0] || null;
  return { ctx, ri, ps, biasMode, frontRate, backRate, resR, favHit, favN, paceTxt, paceWarn, nige, senko, hole, danger, evList, aiOk };
}

function renderYosoReport(raceNo) {
  const host = document.getElementById('yoso-report-' + raceNo); if (!host) return;
  const R = _yrBuild(raceNo);
  if (!R) { host.innerHTML = '<div class="yr-panel">データがありません</div>'; return; }
  if (!R.aiOk) { host.innerHTML = '<div class="yr-panel">各馬の過去データが不足しています（「データ自動取得」を先に実行してください）</div>'; return; }
  const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const biasTxt = R.biasMode === 'unknown' ? '不明（確定レース不足＝過去データ中心で判断）'
    : R.biasMode === 'front' ? '前有利（1角3番手内の複勝' + R.frontRate + '%）'
    : R.biasMode === 'back' ? '差し優勢（前の複勝' + R.frontRate + '%と低調）' : 'フラット（前' + R.frontRate + '%）';
  const mkCls = m => m === '◎' ? 'yr-mk-h' : m === '○' ? 'yr-mk-t' : m === '▲' || m === '△' ? 'yr-mk-s' : m === '☆' ? 'yr-mk-x' : 'yr-mk-k';
  const horseHtml = R.ps.map((p, i) => {
    const tags = [];
    if (p.plus.length) tags.push('<span class="yr-tag yr-tag--p">+' + p.plus.length + '</span>');
    if (p.minus.length) tags.push('<span class="yr-tag yr-tag--m">-' + p.minus.length + '</span>');
    tags.push('<span class="yr-tag">' + p.style + '</span>');
    if (p.ninki) tags.push('<span class="yr-tag">' + p.ninki + '人気</span>');
    const body =
      (p.plus.length ? '<div class="yr-plus">＋ ' + p.plus.map(esc).join('／') + '</div>' : '') +
      (p.minus.length ? '<div class="yr-minus">− ' + p.minus.map(esc).join('／') + '</div>' : '') +
      (Object.keys(p.quirks).length ? '<div class="yr-quirk">癖：' + Object.values(p.quirks).map(q => esc(q.label)).join('・') + '</div>' : '') +
      (p.notes.length ? '<div>※ ' + p.notes.map(esc).join('／') + '</div>' : '') +
      '<div style="color:#94a3b8">AI指数' + (p.aiSc != null ? p.aiSc.toFixed(1) : '—') + '（' + p.aiRank + '位）・補正' + (p.adj >= 0 ? '+' : '') + p.adj.toFixed(1) + (p.timeDef != null ? '・時計差+' + p.timeDef + 's' : '') + '</div>';
    return '<details class="yr-horse"' + (i < 3 ? ' open' : '') + '><summary><span class="yr-mark ' + mkCls(p.mark) + '">' + p.mark + '</span><span class="yr-uma">' + p.uma + '</span><span class="yr-hname">' + esc(p.name) + '</span><span style="font-size:11px;color:#94a3b8">' + esc(p.h.jockey || '') + '</span><span class="yr-tags">' + tags.join('') + '</span></summary><div class="yr-hbody">' + body + '</div></details>';
  }).join('');
  const top5 = R.ps.slice(0, 5);
  const m1 = top5[0], m2 = top5[1], m3 = top5[2];
  const holeTxt = R.hole ? R.hole.uma + ' ' + R.hole.name + '（' + R.hole.odds + '倍）— ' + (R.hole.plus[0] || 'EVモデルが能力を認める過小評価（教訓④）') : 'なし（該当馬不在）';
  const himo = [...new Set(top5.slice(2).map(p => p.uma).concat(R.hole ? [R.hole.uma] : []))].filter(u => u !== m1.uma && u !== m2.uma);
  const buys = R.ctx.isFinal
    ? '<div class="yr-buy"><b>ファイナル警戒（教訓①）</b>：人気軸を疑い広く。3連複 ' + m1.uma + '-（' + m2.uma + ',' + m3.uma + '）-（印全部＋☆）／ワイド ' + m1.uma + '-☆</div>'
    : '<div class="yr-buy"><b>堅め</b>：馬複 ' + m1.uma + '-' + m2.uma + '　<b>本線</b>：馬単 ' + m1.uma + '→' + m2.uma + '・3連複 ' + m1.uma + '-' + m2.uma + '-（' + himo.join(',') + '）　<b>穴</b>：' + (R.hole ? 'ワイド ' + m1.uma + '-' + R.hole.uma : '3連単2列目に△を厚く') + '</div>';
  // 自己チェック（教訓⑤: 上位印とバイアスの整合を機械検証）
  const mism = top5.slice(0, 3).filter(p => R.biasMode === 'front' && p.styleCls === 'back');
  const selfck = '自己チェック：' +
    (R.biasMode !== 'unknown' ? '上位3頭の脚質は' + top5.slice(0, 3).map(p => p.style).join('/') + (mism.length ? '——' + mism.map(p => p.name).join('・') + 'は後方脚質だが時計/終い根拠で残置（要注意）' : '＝当日バイアスと整合✓') : '当日バイアス不明のため過去データ中心で判断') +
    '／コメントは位置取りと照合済（教訓②）' + (R.ctx.isFinal ? '／ファイナル＝荒れ前提で紐を拡張（教訓①）' : '') +
    (R.danger ? '／危険視した' + R.danger.ninki + '人気の根拠：' + esc(R.danger.minus[0] || '') : '') + '。';
  host.innerHTML = '<div class="yr-panel">' +
    '<div class="yr-head"><span class="yr-title">🧠 AI予想レポート</span><span class="yr-note">ルールエンジン（端末内で計算・通信なし）／これは支援情報で的中を保証しません</span></div>' +
    '<div class="yr-sec">■ レース概要</div><div class="yr-kv"><span>距離 <b>' + R.ctx.dist + 'm</b></span><span>クラス <b>' + esc(R.ctx.cls || '—') + '</b></span><span>馬場 <b>' + esc(R.ctx.cond || '—') + '</b></span><span>想定ペース <b>' + esc(R.paceTxt) + '</b></span><span>馬場傾向 <b>' + biasTxt + '</b></span>' + (R.favN ? '<span>本日1人気 <b>' + R.favHit + '/' + R.favN + '3着内</b></span>' : '') + '</div>' +
    (R.ctx.isFinal ? '<div class="yr-warn">⚠️ ファイナルレース＝実力接近で大荒れ名物。人気を鵜呑みにしない（教訓①）</div>' : '') +
    (R.paceWarn ? '<div class="yr-warn">' + esc(R.paceWarn) + '</div>' : '') +
    '<div class="yr-sec">■ 展開予想</div><div style="font-size:12.5px">逃げ候補：' + (R.nige.length ? R.nige.map(p => esc(p.name)).join('・') : 'なし') + '／先行：' + (R.senko.length ? R.senko.map(p => esc(p.name)).join('・') : '—') + '</div>' +
    '<div class="yr-sec">■ 各馬評価（タップで根拠）</div>' + horseHtml +
    '<div class="yr-sec">■ 最終順位予想</div><div style="font-size:12.5px">' + top5.map((p, i) => (i + 1) + '位 ' + p.uma + ' ' + esc(p.name)).join('　→　') + '</div>' +
    '<div class="yr-sec">■ 買い目候補</div>' + buys +
    '<div class="yr-sec">■ 危険な人気馬</div><div style="font-size:12.5px">' + (R.danger ? '<b>' + esc(R.danger.name) + '（' + R.danger.ninki + '人気' + R.danger.odds + '倍）</b>：' + R.danger.minus.map(esc).join('・') : '上位人気に明確な減点なし') + '</div>' +
    '<div class="yr-sec">■ 狙いたい穴馬</div><div style="font-size:12.5px">' + esc(holeTxt) + '</div>' +
    '<div class="yr-selfcheck">' + selfck + '</div>' +
    '</div>';
}

// ══ Phase3-1 新出馬表プレビュー（管理者限定β・feature flag・読み取り専用・独立名前空間 kvx*）══
// 予測計算(computeYosoScored)・印・totalScore・shadowには一切変更を加えない。確定済みscoredを読むだけ。
// AI総合指数=totalScore（オッズ非依存・aiProb/市場アンカー/shadow購入モデルとは別）。走力SI=baseScore。印=既存horseMarkMap。
var _kvxShown = false, _kvxWired = false, _kvxKey = null;   // _kvxKey=現在kvxで表示中のdisplayKey(正規化日付:レース番号)
var _kvxSnap = null, _kvxSnapGen = 0;   // 【Phase3-2d】AI指数内訳snapshot（render同期で確定・immutable・表示用コピーのみ凍結）
// 共通HTMLエスケープ（テキスト・属性値の両方に安全な最小集合 & < > " '）。既存の_esc(5703)はJS文字列用で別物。
function escapeHTML(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
// 外部由来の文字列(馬名等)を、二重引用符のHTML属性(onclick="...")内の単一引用符JS文字列リテラル
// 引数として安全に埋め込むためのエスケープ。バックスラッシュ→クォートの順でJS文字列を守った上で、
// escapeHTML()で"（属性区切り突破）等をHTMLエンティティ化する。単純な.replace(/'/g,"\\'")だけでは
// 二重引用符(")によるonclick属性の早期終了・任意属性注入を防げないため必須（P3脆弱性対応）。
function jsAttrEsc(s){ return escapeHTML(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function kvxEsc(s){ return escapeHTML(s); }   // kvxも共通escapeHTMLを使う（単一実装）
function kvxNormDate(d){ return String(d == null ? '' : d).replace(/\//g, '-').trim(); }   // 2026/07/11 と 2026-07-11 を正規化
// 【一般公開の分離／kill switch】管理者プレビューと一般公開を分離する。
// KVX_PUBLIC_UI_DEFAULT はデプロイされた定数（＝サーバ管理・ブラウザ利用者が編集できない・秘密情報でない）で、
// 一般公開のON/OFFを司る唯一の信頼源。既定は false（未公開）。公開時は true にして deploy、緊急停止は false にして deploy。
// localStorage(kvx_deban_v2) は「管理者プレビュー専用flag」であり、一般公開の信頼源には決して使わない
// （閲覧者が任意に書き換え可能なため）。URLパラメータでも有効化しない（一切参照しない）。
var KVX_PUBLIC_UI_DEFAULT = true;   // ← 一般公開switch。一般公開ON（2026-07-12）。緊急停止は false に戻して再デプロイ（README参照）。
try { window.KVX_PUBLIC_UI_DEFAULT = KVX_PUBLIC_UI_DEFAULT; } catch(e){}
function publicRolloutEnabled(){ try { return window.KVX_PUBLIC_UI_DEFAULT === true; } catch(e){ try { return KVX_PUBLIC_UI_DEFAULT === true; } catch(_){ return false; } } }
window.publicRolloutEnabled = publicRolloutEnabled;
// 新UI有効判定 = 一般公開ON（deploy定数）｜｜（管理者 かつ プレビューflag）。
// 閲覧者は publicRolloutEnabled()===true の時だけ新UI。localStorageを書き換えても isAdminMode()=false なので有効化不可。
function kvxV2Enabled(){
  try {
    if (publicRolloutEnabled()) return true;                                                        // 一般公開（全閲覧者）
    return typeof isAdminMode === 'function' && isAdminMode() && localStorage.getItem('kvx_deban_v2') === '1';  // 管理者プレビュー
  } catch(e){ return false; }
}
// 【最終統合】Phase1ダークシェルのON/OFF。kvxV2Enabled()（一般公開 or 管理者プレビュー）の時だけ body へ kvx-shell-on を付与し、
// 全シェルCSSは .kvx-shell-on 配下だけに限定する（OFF/閲覧者では1つも適用されない）。既存DOM/id/data-page/
// switchPageは不変で、外観のみをCSSで切替える。applyModeUI(管理者⇔閲覧者)からも呼ばれ、閲覧者化で即除去される。
// kill/OFF時は shell class 除去に加え、新UIのDOM（kvx表/カード・AI内訳）も片付けてリロード無しで旧UIへ戻す。
function kvxApplyShell(){
  try {
    var on = kvxV2Enabled();
    document.body.classList.toggle('kvx-shell-on', on);
    if (!on) {                                                          // kill/OFF/閲覧者化：新UI DOMを撤去し既存UIへ復帰
      try { if (typeof kvxClearHide === 'function' && _kvxShown) kvxClearHide(); } catch(_){}       // kvx表/カード＋snapshot clear
      try { var brk = document.getElementById('kvx-ai-breakdown'); if (brk && brk.parentNode) brk.parentNode.removeChild(brk); } catch(_){}  // モーダルが開いていてもAI内訳だけ除去
    }
  } catch(e){ try { document.body.classList.remove('kvx-shell-on'); } catch(_){} }
}
window.kvxApplyShell = kvxApplyShell;
function kvxClearHide(){ var c = document.getElementById('kvx-deban-v2'); if (c) { c.innerHTML = ''; c.hidden = true; } _kvxShown = false; _kvxKey = null; _kvxSnap = null; }
function kvxLast5(name, raceDate, raceNo){
  try {
    if (typeof getHorseHistoryBefore !== 'function') return { zensou:'—', last5:'—' };
    var h = getHorseHistoryBefore(name, raceDate, raceNo) || [];
    var chk = function(v){ var n = parseInt(v, 10); return (!isNaN(n) && n > 0) ? n : '-'; };
    var l5 = h.slice(0, 5).map(function(x){ return chk(x.chakujun); });
    return { zensou: h.length ? (chk(h[0].chakujun) + '着') : '—', last5: l5.length ? ('[' + l5.join('-') + ']') : '—' };
  } catch(e){ return { zensou:'—', last5:'—' }; }
}
// オッズ帯：オッズの「大きさ」の区分のみ（価値判断ではない・色で良し悪しを表さない）。
function kvxOddsBand(odds){
  var o = parseFloat(odds);
  if (!isFinite(o) || o <= 0) return '—';
  if (o < 10) return '1桁台';
  if (o < 20) return '10倍台';
  if (o < 30) return '20倍台';
  return '30倍以上';
}
// デスクトップ表の sticky 左列(印/枠馬番/馬名)の left を実測幅から算出（paddingを含む実幅に一致させ、
// 横スクロール時の座標ズレ・他セルの透けを防ぐ）。スマホカードには sticky を持ち込まない。
function kvxSetSticky(){
  try {
    var t = document.querySelector('#kvx-deban-v2 table.kvx-deban');
    if (!t) return;
    var hm = t.querySelector('thead .kvx-c-mark'), hn = t.querySelector('thead .kvx-c-num');
    if (!hm || !hn) return;
    var w0 = hm.getBoundingClientRect().width, w1 = hn.getBoundingClientRect().width;
    var nums = t.querySelectorAll('.kvx-c-num'); for (var i = 0; i < nums.length; i++) nums[i].style.left = w0 + 'px';
    var names = t.querySelectorAll('.kvx-c-name'); for (var j = 0; j < names.length; j++) names[j].style.left = (w0 + w1) + 'px';
  } catch(e){}
}
// 単一の #kvx-deban-v2 を現在レースの「AI予想」サブタブ内スロット(kvx-yoso-slot)へ移す。
// これで出馬表タブとの縦並びを解消し、サブタブのdisplay切替で自動的に排他表示になる（要素・listenerは使い回し＝二重描画/二重計算なし）。
// hasData=false のときは「AI予想を表示できません」を表示。
function kvxPlaceInYosoSlot(raceNo, hasData){
  try {
    var slot = document.getElementById('kvx-yoso-slot-' + raceNo);
    var c = document.getElementById('kvx-deban-v2');
    if (slot && c && c.parentNode !== slot) slot.appendChild(c);   // 現在レースのスロットへ移動
    var empty = document.getElementById('kvx-yoso-empty-' + raceNo);
    if (empty) empty.hidden = !!hasData;
  } catch(e){}
}
function kvxRenderDebanV2(raceNo, scored, horseMarkMap, renderDate){
  var c = document.getElementById('kvx-deban-v2');
  if (!c) return;
  kvxApplyShell();   // 描画のたびにシェル外観をflag/管理者状態へ同期
  if (!kvxV2Enabled()) { if (_kvxShown) kvxClearHide(); return; }   // OFF：DOM生成/履歴取得/再計算をしない
  // 表示identityは「日付＋レース番号」。currentRaceNoだけでは前日R1と当日R1を識別できないため日付を含める。
  // render開始時のcontext(renderDate=描画対象データの日付)をhookで受け取り、現在選択(currentDate:currentRaceNo)と
  // 一致するときだけ現在表示とみなす。グローバルcurrentDateを後から読むのではなく、hookへ渡された render 側の
  // 日付を使うことで、古いscoredが新日付として扱われるのを防ぐ。
  //  ・選択が無効(日付未設定 or レース未選択)→ 残留を消して終了。
  //  ・renderKey≠curKey(古い非同期/別日付/別レース)→ 描画もclearもしない（現在表示を消さない）。
  //  ・renderKey==curKeyでデータなし → 旧表示を必ず消す（前日R1を当日R1として見せない）。
  var _cd = (typeof currentDate !== 'undefined') ? currentDate : null;
  var _cr = (typeof currentRaceNo !== 'undefined') ? currentRaceNo : null;
  if (!_cd || _cr == null) { if (_kvxShown) kvxClearHide(); return; }
  var curKey    = kvxNormDate(_cd) + ':' + String(_cr);
  var renderKey = kvxNormDate(renderDate) + ':' + String(raceNo);
  if (renderKey !== curKey) return;
  if (!scored || !scored.length) { kvxClearHide(); kvxPlaceInYosoSlot(raceNo, false); return; }   // 現在選択がデータなし → clear＋「AI予想を表示できません」
  var data = (typeof allRacesData !== 'undefined') ? allRacesData[raceNo] : null;
  var raceDate = data && data.raceInfo ? (data.raceInfo.raceDate || '') : '';
  var mm = horseMarkMap || {};
  // 既存契約：scoredはtotalScore降順(sort済)。表示用コピー参照のみ（sort/splice/書換え/再計算しない）。
  // 同じ行データからデスクトップ表とスマホカードの両方を1回で生成し、CSSで表示切替（二重計算しない）。
  var items = Array.prototype.map.call(scored, function(s){
    var horse = s.horse || {};
    var name = horse.horseName || '';
    var mark = (s.totalScore != null) ? (mm[name] || '') : '';         // null馬に印なし
    var oddsRaw = (horse.odds != null && horse.odds !== '') ? horse.odds : null;
    var fh = kvxLast5(name, raceDate, raceNo);
    return {
      markRaw: mark, mark: kvxEsc(mark),
      markCls: mark === '◎' ? ' kvx-honmei' : (mark === '×' ? ' kvx-keshi' : ''),
      markLabel: mark ? ('印 ' + mark) : '印なし',
      nameEsc: kvxEsc(name), jockey: kvxEsc(s.jockey || horse.jockey || ''),
      waku: (horse.waku != null && horse.waku !== '') ? kvxEsc(horse.waku) : '',
      uma: (horse.umaBan != null && horse.umaBan !== '') ? kvxEsc(horse.umaBan) : '—',
      odds: oddsRaw != null ? kvxEsc(oddsRaw) : '—', band: kvxOddsBand(oddsRaw),
      ninki: (horse.ninki != null && horse.ninki !== '') ? kvxEsc(horse.ninki) : '—',
      ts: (s.totalScore != null) ? s.totalScore.toFixed(1) : '—',   // AI総合指数=既存「総合スコア」と同一
      bs: (s.baseScore  != null) ? s.baseScore.toFixed(1)  : '—',   // 走力SI=baseScore
      zensou: fh.zensou, last5: fh.last5
    };
  });
  kvxBuildBreakdownSnap(scored, kvxNormDate(renderDate), raceNo);   // 【Phase3-2d】AI指数内訳snapshot（render同期でeff確定・原本不変）
  var raceEsc = kvxEsc(raceNo);
  var deskRows = items.map(function(it){
    return '<tr>' +
      '<td class="kvx-c-mark"><span class="kvx-mark' + it.markCls + '" aria-hidden="true">' + it.mark + '</span><span class="sr-only">' + it.markLabel + '</span></td>' +
      '<td class="kvx-c-num">' + (it.waku ? '<span class="kvx-wk">枠' + it.waku + '</span>' : '') + '<span class="kvx-waku kvx-num">' + it.uma + '</span></td>' +
      '<td class="kvx-c-name"><div class="kvx-name">' + it.nameEsc + '</div><div class="kvx-sub">高知 / ' + it.jockey + '</div></td>' +
      '<td class="kvx-num"><span class="kvx-odds">' + it.odds + '</span> <span class="kvx-band">' + it.band + '</span><span class="kvx-odds-move" data-uma="' + it.uma + '"></span></td>' +
      '<td class="kvx-num">' + it.ninki + '</td>' +
      '<td class="kvx-num"><span class="kvx-sc">' + it.ts + '</span></td>' +
      '<td class="kvx-num"><span class="kvx-si">' + it.bs + '</span></td>' +
      '<td class="kvx-num kvx-dim">' + it.zensou + '</td>' +
      '<td class="kvx-num kvx-dim">' + it.last5 + '</td>' +
      '<td><button type="button" class="kvx-detail" data-kvx-detail="1" data-name="' + it.nameEsc + '" data-race="' + raceEsc + '" aria-label="' + it.nameEsc + ' の詳細を開く">詳細</button></td>' +
    '</tr>';
  }).join('');
  var cards = items.map(function(it){
    return '<li class="kvx-card-li"><article class="kvx-card">' +
      '<div class="kvx-card-top">' +
        '<span class="kvx-mark' + it.markCls + '" aria-hidden="true">' + it.mark + '</span><span class="sr-only">' + it.markLabel + '</span>' +
        '<span class="kvx-waku kvx-num">' + it.uma + '</span>' +
        '<span class="kvx-card-name">' + it.nameEsc + '</span>' +
        '<span class="kvx-card-odds"><span class="kvx-odds">' + it.odds + '</span><span class="kvx-band">' + it.band + '</span><span class="kvx-odds-move" data-uma="' + it.uma + '"></span></span>' +
      '</div>' +
      '<div class="kvx-card-meta">' +
        '<span class="kvx-tag"><span class="kvx-k">騎手</span>' + it.jockey + '</span>' +
        '<span class="kvx-tag"><span class="kvx-k">人気</span>' + it.ninki + '</span>' +
        '<span class="kvx-tag"><span class="kvx-k">AI総合指数</span>' + it.ts + '</span>' +
        '<span class="kvx-tag"><span class="kvx-k">走力SI</span>' + it.bs + '</span>' +
      '</div>' +
      '<div class="kvx-card-foot"><span class="kvx-dim">前走 ' + it.zensou + ' ・ 近5走 ' + it.last5 + '</span>' +
        '<button type="button" class="kvx-detail" data-kvx-detail="1" data-name="' + it.nameEsc + '" data-race="' + raceEsc + '" aria-label="' + it.nameEsc + ' の詳細を開く">詳細</button></div>' +
    '</article></li>';
  }).join('');
  var aiDesc = 'AI総合指数：走力SIと各種補正を合成した、レース内比較用の指数です。勝率・的中確率・回収率を表す数値ではありません。';
  var siDesc = '走力SI：過去のタイムを距離・馬場ごとに点数化した基本の走力です。';
  c.innerHTML =
    '<div class="kvx-hd">AI予想ランキング</div>' +
    '<div class="kvx-desktop"><div class="kvx-scroll"><table class="kvx-deban">' +
      '<thead><tr>' +
        '<th scope="col" class="kvx-c-mark">印</th><th scope="col" class="kvx-c-num">枠/馬番</th><th scope="col" class="kvx-c-name">馬名 / 騎手</th>' +
        '<th scope="col">オッズ / オッズ帯</th><th scope="col">人気</th>' +
        '<th scope="col" aria-label="' + aiDesc + '">AI総合指数</th>' +
        '<th scope="col" aria-label="' + siDesc + '">走力SI</th>' +
        '<th scope="col">前走</th><th scope="col">近5走</th><th scope="col">詳細</th>' +
      '</tr></thead><tbody>' + deskRows + '</tbody></table></div></div>' +
    '<ul class="kvx-mobile" aria-label="出馬表カード">' + cards + '</ul>' +
    '<div class="kvx-note">' + aiDesc + ' オッズの高い安いには左右されず算出しています。印(◎○▲△×)はAI総合指数が高い順に付けています。オッズ帯は単にオッズの大きさで分けた目安で、お得・妙味といった意味はありません。</div>';
  c.hidden = false; _kvxShown = true; _kvxKey = renderKey;   // 表示中のdisplayKey(日付:レース)を記録（古い日付/レース混入防止）
  if (!_kvxWired) { c.addEventListener('click', kvxOnClick); _kvxWired = true; }   // 委譲は1回だけ（表/カード共通）
  kvxPlaceInYosoSlot(raceNo, true);   // 「AI予想」サブタブ内へ配置（出馬表タブと縦並びにしない）
  kvxSetSticky();
  kvxAttachOddsMoveBadges(raceNo, raceDate, renderKey);   // オッズ急伸/急落バッジ（非同期・表示専用・大玉④）
}
// keiba_odds_snapshotsからオッズ変動を取得し、kvx表の該当セルへ非同期でパッチする（表示専用、予想ロジックは不参照）。
// renderKeyガードで、描画完了までにレースが切り替わっていた場合は書き込まない（kvxRenderDebanV2と同じ設計）。
async function kvxAttachOddsMoveBadges(raceNo, raceDateSlash, renderKey) {
  if (!raceDateSlash) return;
  try {
    const rows = await fetchRaceOddsHistory(raceDateSlash, raceNo);
    if (!rows.length) return;
    if (renderKey !== _kvxKey) return;   // 描画中にレースが切り替わっていたら何もしない
    const byUma = {};
    rows.forEach(r => { (byUma[r.uma_ban] = byUma[r.uma_ban] || []).push(r); });
    document.querySelectorAll('#kvx-deban-v2 .kvx-odds-move[data-uma]').forEach(span => {
      const hist = byUma[span.dataset.uma];
      if (hist && hist.length >= 2) span.innerHTML = oddsMoveBadgeHtml(hist);
    });
  } catch (e) {}
}
function kvxOnClick(e){
  var b = (e.target && e.target.closest) ? e.target.closest('[data-kvx-detail]') : null;
  if (!b) return;
  var nm = b.getAttribute('data-name'), rn = parseInt(b.getAttribute('data-race'), 10);
  if (typeof openHorseModal === 'function') openHorseModal(nm, rn);   // 既存詳細UIを再利用（signature不変）
}

// ═══ 【Phase3-2d】AI総合指数の内訳（管理者限定・kvx起点のみ）═══
// 監査(Phase3-2c)で確定した加算契約だけを表示する。computeYosoScored/getMlLiveWeightsの挙動・
// 予測ロジック・係数・sort・aiProb・shadow には一切触れない。表示は「実寄与＝stored Mod × snapshot eff」。
// allowlist（表示可）：condMod/distMod/trendMod/comboMod/rotMod/classMod/cornMod(scaled)/weightMod/
//   agariMod/marginMod/winStrMod/jockeyChgMod/takiMod/cornConsistMod/rakuMod/paceCtxMod/relSIMod ＋ baseScore(基準)。
// denylist：jockeyMod/jockeyWR/trainerMod/avg4C/_cornModRaw/aiProb/marketProb/odds/ninki/offset係数/shadow/siCount/payout。
var KVX_BRK_KEYS = [
  ['condMod','condNew','馬場適性'], ['distMod','distNew','距離適性'], ['trendMod','trendN','近況トレンド'],
  ['comboMod','comboN','騎手×厩舎'], ['rotMod','rotN','ローテーション'], ['classMod','clsN','昇降級'],
  ['cornMod','cornN','位置・脚質（4角）'], ['weightMod','weightN','馬体重変化'], ['agariMod','agariN','上がり3F'],
  ['marginMod','marginN','前走着差'], ['winStrMod','winStrN','勝ち馬の強さ'], ['jockeyChgMod','jockeyChgN','乗り替わり'],
  ['takiMod','takiN','叩き'], ['cornConsistMod','cornConsistN','コーナー一貫性'], ['rakuMod','rakuN','前走楽勝'],
  ['paceCtxMod','paceCtxN','展開補正']
];
var KVX_BRK_EPS = 0.005;   // 表示中立の技術的固定値＝totalScore(2桁)の表示量子0.01の半分（探索しない）
// renderと同じ同期処理でeffを確定し、各馬の実寄与を計算して immutable snapshot に保存。原本(scored/horse)は変更しない。
function kvxBuildBreakdownSnap(scored, normDate, raceNo){
  try {
    var mlW = (typeof getMlLiveWeights === 'function') ? getMlLiveWeights() : null;
    var effOf = function(k){
      if (mlW && mlW.eff && mlW.eff[k] != null) return mlW.eff[k];
      if (typeof YOSO_FACTOR_SCALE !== 'undefined' && YOSO_FACTOR_SCALE[k] != null) return YOSO_FACTOR_SCALE[k];
      return 1;
    };
    var srcDefault = (typeof KV_ML_WEIGHTS_DEFAULT !== 'undefined') && (mlW === KV_ML_WEIGHTS_DEFAULT);
    var byHorse = {};
    Array.prototype.forEach.call(scored, function(s){
      var name = (s.horse && s.horse.horseName) || '';
      var base = s.baseScore, total = s.totalScore;
      var uma = (s.horse && s.horse.umaBan != null) ? String(s.horse.umaBan) : '';
      if (name === '') return;
      if (base == null || total == null || typeof base !== 'number' || typeof total !== 'number' || !isFinite(base) || !isFinite(total)) return;   // null/非有限馬は内訳対象外
      var contribs = [], sum = 0, bad = false;
      for (var i = 0; i < KVX_BRK_KEYS.length; i++){
        var mk = KVX_BRK_KEYS[i][0], ek = KVX_BRK_KEYS[i][1], nm = KVX_BRK_KEYS[i][2];
        var mod = (typeof s[mk] === 'number') ? s[mk] : 0;   // cornModはpace-bias scaled済み値をそのまま使用（別行にしない）
        var eff = effOf(ek);
        var v = mod * eff;
        if (!isFinite(mod) || !isFinite(eff) || !isFinite(v)) { bad = true; break; }
        contribs.push({ key: ek, name: nm, rawMod: mod, eff: eff, value: v });
        sum += v;
      }
      var relV = (typeof s.relSIMod === 'number') ? s.relSIMod : 0;   // relSIは倍率なしで生加算
      if (bad || !isFinite(relV)) { byHorse[name] = Object.freeze({ ok: false, umaBan: uma, reconstructionDiff: null }); return; }
      contribs.push({ key: 'relSI', name: '相対SI', rawMod: relV, eff: 1, value: relV });
      sum += relV;
      var reconstructed = base + sum;                 // 内部はfull precision（表示時のみ2桁）
      var diff = reconstructed - total;
      var pass = isFinite(reconstructed) && isFinite(diff) && Math.abs(diff) <= 0.011;
      byHorse[name] = Object.freeze({
        umaBan: uma, baseScore: base, totalScore: total, correctionSum: total - base,
        contributions: Object.freeze(contribs.map(function(c){ return Object.freeze(c); })),
        reconstructed: reconstructed, reconstructionDiff: diff, ok: pass
      });
    });
    _kvxSnapGen++;
    _kvxSnap = Object.freeze({
      key: normDate + ':' + String(raceNo), normalizedDate: normDate, raceNo: raceNo,
      coefficientSource: srcDefault ? '出荷時定数(既定)' : 'ローカル再学習',
      coefficientTrainedAt: (mlW && mlW.trainedAt) || '不明',
      gen: _kvxSnapGen, createdAt: Date.now(), byHorse: Object.freeze(byHorse)
    });
  } catch(e){ _kvxSnap = null; }
}
function _kvxBrkFmt(v){ return (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(2); }   // 符号付き2桁
function kvxBreakdownHtml(entry, snap){
  var esc = (typeof escapeHTML === 'function') ? escapeHTML : function(x){ return String(x); };
  var hd = '<div class="kvx-brk-hd">AI総合指数の内訳 <span class="kvx-brk-adm">（管理者限定）</span></div>';
  if (!entry.ok) {   // 再構成安全ゲート不通過：内訳を出さず管理者向けメッセージのみ
    return hd + '<div class="kvx-brk-warn" role="status">内訳を安全に再構成できません。</div>';
  }
  var ups = [], downs = [];
  entry.contributions.forEach(function(c){
    if (!isFinite(c.value)) return;
    if (c.value > KVX_BRK_EPS) ups.push(c);
    else if (c.value < -KVX_BRK_EPS) downs.push(c);   // 中立(|v|<=eps)は非表示。分類は最終寄与の符号（rawではない）
  });
  ups.sort(function(a, b){ return b.value - a.value; });                        // 上げた要因：寄与の大きい順
  downs.sort(function(a, b){ return Math.abs(b.value) - Math.abs(a.value); });  // 下げた要因：絶対値の大きい順
  var rows = function(arr, cls){
    if (!arr.length) return '<li class="kvx-brk-none">該当する要因なし</li>';
    return arr.map(function(c){
      return '<li class="kvx-brk-row"><span class="kvx-brk-name">' + esc(c.name) + '</span>' +
             '<span class="kvx-brk-val ' + cls + '">' + _kvxBrkFmt(c.value) + '</span></li>';
    }).join('');
  };
  var top = '<div class="kvx-brk-top">' +
    '<div class="kvx-brk-cell"><span class="kvx-brk-k">走力SI（基準）</span><span class="kvx-brk-num">' + entry.baseScore.toFixed(2) + '</span></div>' +
    '<div class="kvx-brk-cell"><span class="kvx-brk-k">補正合計</span><span class="kvx-brk-num">' + _kvxBrkFmt(entry.correctionSum) + '</span></div>' +
    '<div class="kvx-brk-cell"><span class="kvx-brk-k">AI総合指数</span><span class="kvx-brk-num kvx-brk-total">' + entry.totalScore.toFixed(2) + '</span></div>' +
  '</div>';
  var desc = '<div class="kvx-brk-desc">走力SIと各補正を合成したレース内比較用の指数です。勝率・的中確率・回収率ではありません。</div>';
  var cols = '<div class="kvx-brk-h2 kvx-brk-h2-up">＋ AI総合指数を上げた要因</div><ul class="kvx-brk-list">' + rows(ups, 'kvx-brk-up') + '</ul>' +
             '<div class="kvx-brk-h2 kvx-brk-h2-down">− AI総合指数を下げた要因</div><ul class="kvx-brk-list">' + rows(downs, 'kvx-brk-down') + '</ul>';
  var det = entry.contributions.map(function(c){
    return '<tr><td>' + esc(c.name) + '</td><td class="kvx-num">' + c.rawMod.toFixed(4) + '</td><td class="kvx-num">' + c.eff.toFixed(3) + '</td><td class="kvx-num">' + _kvxBrkFmt(c.value) + '</td></tr>';
  }).join('');
  var details = '<details class="kvx-brk-det"><summary>詳細（raw Mod × 係数 = 実寄与）</summary>' +
    '<div class="kvx-brk-detwrap"><table class="kvx-brk-tbl"><thead><tr><th scope="col">項目</th><th scope="col">raw Mod</th><th scope="col">係数</th><th scope="col">実寄与</th></tr></thead><tbody>' + det + '</tbody></table></div>' +
    '<div class="kvx-brk-src">係数: ' + esc(snap.coefficientSource) + '（学習: ' + esc(snap.coefficientTrainedAt) + '）／再構成差: ' + entry.reconstructionDiff.toFixed(4) + '</div></details>';
  var foot = '<div class="kvx-brk-foot">各項目の丸めにより合計に最大0.01の差が出る場合があります。</div>';
  return hd + top + desc + cols + details + foot;
}
// モーダルopen（a11y seam経由）：kvx起点＋管理者＋flag＋identity完全一致のときだけ内訳を注入。
function kvxOnModalOpen(trigger){
  var mc = document.getElementById('horse-modal-content');
  var old = document.getElementById('kvx-ai-breakdown'); if (old && old.parentNode) old.parentNode.removeChild(old);   // 常にstale除去（A→B・既存表open で残さない）
  if (!mc) return;
  if (!kvxV2Enabled()) return;                                                   // flag OFF/閲覧者は出さない
  if (typeof isAdminMode !== 'function' || !isAdminMode()) return;               // 管理者のみ
  if (!trigger || !trigger.closest || !trigger.closest('#kvx-deban-v2') || !trigger.getAttribute || trigger.getAttribute('data-kvx-detail') == null) return;   // kvx詳細ボタン起点のみ
  var name = trigger.getAttribute('data-name');
  var rn = parseInt(trigger.getAttribute('data-race'), 10);
  var _cd = (typeof currentDate !== 'undefined') ? currentDate : null;
  var _cr = (typeof currentRaceNo !== 'undefined') ? currentRaceNo : null;
  if (!_cd || _cr == null) return;
  if (!_kvxSnap || _kvxSnap.key !== (kvxNormDate(_cd) + ':' + String(_cr)) || rn !== _cr) return;   // 日付+レース+選択の完全一致
  var titleEl = document.getElementById('horse-modal-title');
  if (!titleEl || String(titleEl.textContent).indexOf(name) < 0) return;         // 現在開いている馬と一致（stale trigger防御）
  var entry = _kvxSnap.byHorse[name];
  if (!entry) return;                                                            // null馬など→内訳なし
  var sec = document.createElement('section');
  sec.id = 'kvx-ai-breakdown'; sec.className = 'kvx-brk'; sec.setAttribute('aria-label', 'AI総合指数の内訳（管理者限定）');   // 管理者限定はJSゲート(上のisAdminMode)で担保。CSS .admin-only は body.public-mode と衝突し隠れるため付けない。
  sec.innerHTML = kvxBreakdownHtml(entry, _kvxSnap);
  mc.insertBefore(sec, mc.firstChild);                                           // 過去成績より上
  if (!entry.ok) { try { console.warn('[kvx-breakdown] reconstruct-fail', { date: _kvxSnap.normalizedDate, race: _cr, umaBan: entry.umaBan, diff: entry.reconstructionDiff }); } catch(e){} }   // 馬名等は出さない
}
function kvxOnModalClose(){ var old = document.getElementById('kvx-ai-breakdown'); if (old && old.parentNode) old.parentNode.removeChild(old); }
window.kvxOnModalOpen = kvxOnModalOpen; window.kvxOnModalClose = kvxOnModalClose;

function kvxSafeRenderDebanV2(raceNo, scored, horseMarkMap, renderDate){   // 例外隔離：kvxの失敗で既存パネルを落とさない
  try { kvxRenderDebanV2(raceNo, scored, horseMarkMap, renderDate); }
  catch(err){ try { console.error('[kvx] preview render failed (既存パネルは維持):', err); } catch(e){} try { kvxClearHide(); } catch(e2){} }
}
window.kvxSafeRenderDebanV2 = kvxSafeRenderDebanV2;
function kvxToggleV2(){
  if (typeof isAdminMode !== 'function' || !isAdminMode()) { kvxClearHide(); return; }   // 管理者のみ
  var next = (localStorage.getItem('kvx_deban_v2') === '1') ? '0' : '1';
  try { localStorage.setItem('kvx_deban_v2', next); } catch(e){}
  var btn = document.getElementById('kvx-toggle-btn');
  if (btn) { btn.setAttribute('aria-pressed', next === '1' ? 'true' : 'false'); btn.textContent = 'AI予想ランキング：' + (next === '1' ? 'ON' : 'OFF'); }
  if (next === '1') { if (typeof currentRaceNo !== 'undefined' && currentRaceNo && typeof renderPredictionPanel === 'function') { try { renderPredictionPanel(currentRaceNo); } catch(e){} } }
  else { kvxClearHide(); }   // ON→OFF：コンテナ hidden＋内容破棄
  kvxApplyShell();   // シェル外観もflagに同期
}
var _kvxResizeWired = false;
function kvxInitToggle(){
  var btn = document.getElementById('kvx-toggle-btn');
  if (btn && !btn._kvxWired) {
    btn._kvxWired = true;
    btn.addEventListener('click', kvxToggleV2);
    var on = (function(){ try { return localStorage.getItem('kvx_deban_v2') === '1'; } catch(e){ return false; } })();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = 'AI予想ランキング：' + (on ? 'ON' : 'OFF');
  }
  if (!_kvxResizeWired) {   // sticky左列のleftは実測幅依存。表→カード→表の幅変化やフォント回り込みで再計算（委譲は1回だけ）。
    _kvxResizeWired = true;
    window.addEventListener('resize', function(){ if (_kvxShown) kvxSetSticky(); });
  }
  kvxApplyShell();   // 初期ロード時にシェル外観を同期（初期OFF・管理者+flagのときだけON）
}
document.addEventListener('DOMContentLoaded', kvxInitToggle);

// 【新設】レース後の印×着順照合テーブル生成（管理者パネル・閲覧者公開ブロック共通・二重実装防止）。
// computeYosoScored/MARKS/ソート順には一切触れない、scored/horsesのみの純粋な表示層関数。
function buildAfterMatchHtml(scored, horses) {
  const MARKS = ['◎', '○', '▲', '△', '×', '×'];
  const markColors = { '◎': '#dc2626', '○': '#2563eb', '▲': '#d97706', '△': '#d97706', '×': '#6b7280' };
  const horseMarkMap = {};
  scored.forEach((s, idx) => { horseMarkMap[s.horse.horseName] = MARKS[idx] || ''; });
  const horseScoreMap = {};
  scored.forEach(s => { horseScoreMap[s.horse.horseName] = s.totalScore; });
  const sortedByResult = [...horses]
    .filter(h => h.chakujun && /^\d+$/.test(String(h.chakujun)))
    .sort((a, b) => parseInt(a.chakujun) - parseInt(b.chakujun));
  const honmei = scored.find(s => s.totalScore != null);
  const honmeiChaku = honmei ? parseInt(honmei.horse.chakujun)||999 : 999;
  const afterRows = sortedByResult.map(h => {
    const chaku = parseInt(h.chakujun);
    const mark  = horseMarkMap[h.horseName] || '';
    const mCol  = markColors[mark] || '#6b7280';
    const ts    = horseScoreMap[h.horseName];
    const hit1  = chaku === 1 && mark === '◎';
    const hit2  = chaku <= 2 && (mark === '◎' || mark === '○');
    const hit3  = chaku <= 3 && (mark === '◎' || mark === '○' || mark === '▲');
    const chakuCol = chaku===1?'#dc2626':chaku===2?'#2563eb':chaku===3?'#d97706':'#374151';
    const bg = hit1 ? 'rgba(220,38,38,.07)' : hit3 ? 'rgba(217,119,6,.05)' : 'transparent';
    return `<tr style="border-bottom:1px solid #e2e8f0;background:${bg}">
      <td style="padding:8px;text-align:center;font-size:17px;font-weight:900;color:${chakuCol}">${chaku}着</td>
      <td style="padding:8px;text-align:center;font-size:20px;font-weight:900;color:${mCol};line-height:1">${mark}</td>
      <td style="padding:8px;text-align:center;font-size:12px;color:#6b7280">${h.umaBan||'—'}</td>
      <td style="padding:8px;font-size:13px;font-weight:700;color:#1a1a2e">${escapeHTML(h.horseName||'—')}</td>
      <td style="padding:8px;font-size:12px;color:#374151">${escapeHTML((h.jockey||'').trim())}</td>
      <td style="padding:8px;text-align:center;font-size:12px;font-family:monospace;color:#7c3aed">${ts!=null?ts.toFixed(1):'—'}</td>
      <td style="padding:8px;text-align:center;font-size:11px;font-weight:700;color:${hit1?'#15803d':hit2?'#2563eb':hit3?'#d97706':'#9ca3af'}">${hit1?'◎的中':hit2?'○的中':hit3?'▲的中':'—'}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#1a1a2e;color:#fff;font-size:11px;">
      <th style="padding:6px 8px;text-align:center">着順</th>
      <th style="padding:6px 8px;text-align:center">予想印</th>
      <th style="padding:6px 4px;text-align:center">馬番</th>
      <th style="padding:6px 8px;text-align:left">馬名</th>
      <th style="padding:6px 8px;text-align:left">騎手</th>
      <th style="padding:6px 8px;text-align:center">予想<br><span style="font-weight:400;font-size:9px">スコア</span></th>
      <th style="padding:6px 8px;text-align:center">結果</th>
    </tr></thead>
    <tbody>${afterRows}</tbody>
  </table>
  <div style="margin-top:8px;font-size:11px;color:#374151">
    ◎本命：<strong>${escapeHTML(honmei?.horse.horseName||'—')}</strong> → <strong style="color:${honmeiChaku===1?'#15803d':'#dc2626'}">${honmeiChaku===1?'1着的中':honmeiChaku+'着（ハズレ）'}</strong>
  </div>`;
}

function renderPredictionPanel(raceNo) {
  const _rd0 = (allRacesData[raceNo] && allRacesData[raceNo].raceInfo && allRacesData[raceNo].raceInfo.raceDate) || null;   // 【Phase3-1】render開始時の日付context（displayKey用）
  const container = document.getElementById(`yoso-panel-${raceNo}`);
  const pubExtra = document.getElementById(`yoso-public-extra-${raceNo}`);   // 閲覧者にも表示する狙い目/穴馬/買い得チェック/スコア解説
  if (!container) { if (pubExtra) pubExtra.innerHTML = ''; if (window.kvxSafeRenderDebanV2) window.kvxSafeRenderDebanV2(raceNo, null, null, _rd0); return; }   // 【Phase3-1 hook】パネル無し経路：現在選択(日付:レース)一致時のみ片付け

  const data = allRacesData[raceNo];
  if (!data || !data.horses.length) {
    container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:24px">レースデータがありません</p>';
    if (pubExtra) pubExtra.innerHTML = '';
    if (window.kvxSafeRenderDebanV2) window.kvxSafeRenderDebanV2(raceNo, null, null, _rd0);   // 【Phase3-1 hook】データなし経路：現在選択一致時のみclear/hide
    return;
  }

  const { raceInfo, horses } = data;
  const raceCond = raceInfo.trackCond || raceInfo.track_cond || '';

  const selCond = container._selCond || raceCond || '良';
  const condOptions = ['良', '稍重', '重', '不良'].map(c =>
    `<option value="${c}" ${c === selCond ? 'selected' : ''}>${c}</option>`
  ).join('');

  // レース結果の有無・表示モード
  const raceHasResult = horses.filter(h => h.chakujun && /^\d+$/.test(String(h.chakujun)) && parseInt(h.chakujun) <= horses.length).length >= 3;
  const _viewMode = container._viewMode || 'before';
  const _displayMode = container._displayMode || 'simple'; // 'simple'（基本＝SI+総合）| 'detail'（全内訳）

  // スコア計算は共通コア computeYosoScored に委譲（出馬表のAI印列と同一の結果）
  const { scored, comboStats: _comboStats, raceDist } = computeYosoScored(raceNo, container._selCond);
  container._scored = scored; // デバッグ・検証用（リファクタ時のスコア一致確認に使用）
  // 🎯狙い目カード用：各バッジが実際に採用した馬を捕捉（カードと詳細バッジの不一致を防ぐ）
  let _pickDanger = null, _pickSleeper = null, _pickValue = null;

  // ── マーク割り当て（◎○▲△××）──
  const MARKS = ['◎', '○', '▲', '△', '×', '×'];
  const markColors = { '◎': '#dc2626', '○': '#2563eb', '▲': '#d97706', '△': '#d97706', '×': '#6b7280' };

  // 馬名→印 マップ（レース後照合用）
  const horseMarkMap = {};
  scored.forEach((s, idx) => { horseMarkMap[s.horse.horseName] = MARKS[idx] || ''; });
  const horseScoreMap = {};
  scored.forEach(s => { horseScoreMap[s.horse.horseName] = s.totalScore; });

  let tableHtml = '';

  if (_viewMode === 'after' && raceHasResult) {
    // ── レース後照合モード(生成は共通関数buildAfterMatchHtmlに委譲。管理者パネル・閲覧者公開ブロック共通) ──
    tableHtml = buildAfterMatchHtml(scored, horses);
  } else if (_displayMode === 'simple') {
    // ── レース前予想モード（基本表示：印・馬番・馬名・騎手・走力SI・総合スコア） ──
    const simpleRows = scored.map((s, idx) => {
      const mark = MARKS[idx] || '';
      const mCol = markColors[mark] || '#6b7280';
      const ts   = s.totalScore != null ? s.totalScore.toFixed(1) : '—';
      const bs   = s.baseScore != null ? s.baseScore.toFixed(1) : '—';
      const noData = s.siCount === 0;
      const transferBadge = s.isEstimatedScore
        ? '<span style="font-size:9px;font-weight:800;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle">推定</span>'
        : s.isTransfer
          ? '<span style="font-size:9px;font-weight:800;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle">転入</span>'
          : '';
      const siNote = s.isEstimatedScore ? '<br><span style="font-size:9px;color:#7c3aed">クラス推定</span>'
        : s.isTransfer ? '<br><span style="font-size:9px;color:#d97706">他場参考</span>' : '';
      return `<tr style="border-bottom:1px solid #e2e8f0;${noData?'opacity:.55':''}">
        <td style="padding:9px 8px;text-align:center;font-size:26px;font-weight:900;color:${mCol};line-height:1">${mark}</td>
        <td style="padding:9px 6px;text-align:center;font-size:13px;color:#6b7280">${s.horse.umaBan||'—'}</td>
        <td style="padding:9px 8px;font-size:15px;font-weight:700;color:#1a1a2e;white-space:nowrap">${escapeHTML(s.horse.horseName||'—')}${transferBadge}</td>
        <td style="padding:9px 8px;font-size:13px;color:#374151;white-space:nowrap">${escapeHTML(s.jockey)}</td>
        <td style="padding:9px 8px;text-align:center;font-size:14px;font-family:monospace;font-weight:700;color:${s.baseScore!=null?(s.isEstimatedScore?'#7c3aed':s.isTransfer?'#d97706':'#1a56a0'):'#9ca3af'}">${bs}${siNote}</td>
        <td style="padding:9px 8px;text-align:center;font-size:19px;font-family:monospace;font-weight:900;color:${s.totalScore!=null?'#7c3aed':'#9ca3af'};background:${s.totalScore!=null&&idx<2?'rgba(124,58,237,.05)':'transparent'}">${ts}</td>
      </tr>`;
    }).join('');
    tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#1a1a2e;color:#fff;font-size:11px;">
        <th style="padding:7px 8px;text-align:center" title="オッズを使わない、AI独自の評価で並べた印（発表前後で変わりません）">AI印</th>
        <th style="padding:7px 6px;text-align:center">馬番</th>
        <th style="padding:7px 8px;text-align:left">馬名</th>
        <th style="padding:7px 8px;text-align:left">騎手</th>
        <th style="padding:7px 8px;text-align:center" title="過去のタイムを距離・馬場ごとに点数化した「基本の走力」">走力<br><span style="font-weight:400;font-size:9px">SIベース</span></th>
        <th style="padding:7px 8px;text-align:center;background:#2d1b69">総合スコア</th>
      </tr></thead>
      <tbody>${simpleRows}</tbody>
    </table>`;
  } else {
    // ── レース前予想モード（詳細表示） ──
    // 【2026-07-10】表示は必ず「実際に総合スコアへ適用されている倍率」で計算する。
    // 旧実装は馬場/距離/トレンド/脚質を生値のまま表示し、コンボだけV3手動倍率(×3固定)で
    // 補正して見せていたため、実際に効いている学習重み(例：コンボ×5.269等)と表示が食い違い、
    // その差が全部「その他」に吸収されて実態と違う内訳になっていた。
    const _mlWDisp = getMlLiveWeights();
    const _effDisp = k => (_mlWDisp && _mlWDisp.eff[k] != null) ? _mlWDisp.eff[k] : (typeof YOSO_FACTOR_SCALE!=='undefined' && YOSO_FACTOR_SCALE[k]!=null ? YOSO_FACTOR_SCALE[k] : 1);
    const rows = scored.map((s, idx) => {
      const mark  = MARKS[idx] || '';
      const mCol  = markColors[mark] || '#6b7280';
      const bs    = s.baseScore != null ? s.baseScore.toFixed(1) : '—';
      const ts    = s.totalScore != null ? s.totalScore.toFixed(1) : '—';
      const jwr   = s.jockeyWR.toFixed(1);
      const umaBan = s.horse.umaBan || '—';
      const fmt = (v, decimals=1) => v >= 0 ? `+${v.toFixed(decimals)}` : v.toFixed(decimals);
      const jMod  = fmt(s.jockeyMod);
      const cModEff  = s.condMod  * _effDisp('condNew');
      const dModEff  = s.distMod  * _effDisp('distNew');
      const tModEff  = s.trendMod * _effDisp('trendN');
      const kModEff  = s.comboMod * _effDisp('comboN');
      const cnModEff = s.cornMod  * _effDisp('cornN');   // s.cornModはペース×馬場伸縮後の値
      const cMod  = fmt(cModEff);
      const dMod  = fmt(dModEff);
      const tMod  = fmt(tModEff);
      const kMod  = fmt(kModEff);
      const cnMod = fmt(cnModEff);
      // その他＝総合に効くが列に出ていない補正の合計（ローテ・昇降級・馬体重・上がり・着差・
      // 勝ち馬強さ・乗替・叩き・コーナー一貫性・相対SI）。画面の丸め値でぴったり合うよう、
      // 各列の表示値（小数1桁・実効倍率適用後）を引いた残りとして算出＝ SI＋各表示列＋その他＝総合 が目で合う。
      const _r1 = v => parseFloat(v.toFixed(1));   // 表示と同じ丸め（.05境界のズレ防止）
      const otherMod = (s.totalScore != null && s.baseScore != null)
        ? +(_r1(s.totalScore) - _r1(s.baseScore) - _r1(cModEff) - _r1(dModEff) - _r1(tModEff) - _r1(kModEff) - _r1(cnModEff)).toFixed(1) : null;
      const oMod = otherMod != null ? fmt(otherMod) : '—';
      const noData = s.siCount === 0;
      const jStatsKnown = !!lookupJockeyStats(s.jockey);
      const transferBadge = s.isEstimatedScore
        ? '<span style="font-size:9px;font-weight:800;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle">推定</span>'
        : s.isTransfer
          ? '<span style="font-size:9px;font-weight:800;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:middle">転入</span>'
          : '';
      const siNote = s.isEstimatedScore ? '<br><span style="font-size:9px;color:#7c3aed">クラス推定</span>'
        : s.isTransfer ? '<br><span style="font-size:9px;color:#d97706">他場参考</span>'
        : (s.kochiSICount > 0 && s.kochiSICount < 2 ? '<br><span style="font-size:9px;color:#9ca3af">高知1走</span>' : '');
      const cs = getComboStatsAsOf(s.jockey, s.trainer, raceInfo.raceDate, parseInt(raceNo));
      const comboNote = cs && cs.total >= 3 ? `<br><span style="font-size:9px;color:#9ca3af">${cs.total}戦${Math.round(cs.place/cs.total*100)}%</span>` : '<br><span style="font-size:9px;color:#cbd5e1">実績少</span>';
      const col = v => parseFloat(v) >= 0 ? '#15803d' : '#dc2626';
      return `<tr style="border-bottom:1px solid #e2e8f0;${noData?'opacity:.55':''}">
        <td style="padding:7px 8px;text-align:center;font-size:22px;font-weight:900;color:${mCol};line-height:1">${mark}</td>
        <td style="padding:7px 6px;text-align:center;font-size:12px;color:#6b7280">${umaBan}</td>
        <td style="padding:7px 8px;font-size:13px;font-weight:700;color:#1a1a2e;white-space:nowrap">${escapeHTML(s.horse.horseName||'—')}${transferBadge}</td>
        <td style="padding:7px 6px;font-size:12px;color:#374151;white-space:nowrap">${escapeHTML(s.jockey)}${jStatsKnown?'':' <span style="font-size:9px;color:#ef4444">*</span>'}</td>
        <td style="padding:7px 8px;text-align:center;font-size:13px;font-family:monospace;font-weight:700;color:${s.baseScore!=null?(s.isEstimatedScore?'#7c3aed':s.isTransfer?'#d97706':'#1a56a0'):'#9ca3af'}">${bs}${siNote}</td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${col(jMod)}">${jMod}<br><span style="font-size:9px;color:#9ca3af">${jwr}%</span></td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${s.condMod!==0?col(cMod):'#9ca3af'}">${s.condMod!==0?cMod:'—'}</td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${s.distMod!==0?col(dMod):'#9ca3af'}">${s.distMod!==0?dMod:'—'}</td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${s.siCount>=3?col(tMod):'#9ca3af'}">${s.siCount>=3?tMod:'—'}</td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${s.comboMod!==0?col(kMod):'#9ca3af'}">${s.comboMod!==0?kMod+comboNote:'—'}</td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${s.cornMod!==0?col(cnMod):'#9ca3af'}">${s.cornMod!==0?cnMod:'—'}${(()=>{if(s.avg4C==null)return'';const a=s.avg4C;const label=a<=2?'逃げ':a<=3.5?'先行':a<=6?'中団':'差追';return '<br><span style="font-size:9px;color:#9ca3af">'+label+' '+a+'番</span>';})()}</td>
        <td style="padding:7px 6px;text-align:center;font-size:11px;color:${otherMod!=null&&otherMod!==0?col(oMod):'#9ca3af'}">${otherMod!=null?(otherMod!==0?oMod:'0.0'):'—'}</td>
        <td style="padding:7px 8px;text-align:center;font-size:15px;font-family:monospace;font-weight:900;color:${s.totalScore!=null?'#7c3aed':'#9ca3af'};background:${s.totalScore!=null&&idx<2?'rgba(124,58,237,.05)':'transparent'}">${ts}</td>
      </tr>`;
    }).join('');
    tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap;">
      <thead><tr style="background:#1a1a2e;color:#fff;font-size:11px;">
        <th style="padding:6px 8px;text-align:center;min-width:32px" title="オッズを使わない、AI独自の評価で並べた印（発表前後で変わりません）">AI印</th>
        <th style="padding:6px 4px;text-align:center">馬番</th>
        <th style="padding:6px 8px;text-align:left">馬名</th>
        <th style="padding:6px 8px;text-align:left">騎手</th>
        <th style="padding:6px 8px;text-align:center" title="過去のタイムを距離・馬場ごとに点数化した「基本の走力」">走力<br><span style="font-weight:400;font-size:9px">SIベース</span></th>
        <th style="padding:6px 6px;text-align:center">騎手<br><span style="font-weight:400;font-size:9px">補正</span></th>
        <th style="padding:6px 6px;text-align:center">馬場<br><span style="font-weight:400;font-size:9px">適性</span></th>
        <th style="padding:6px 6px;text-align:center">距離<br><span style="font-weight:400;font-size:9px">適性</span></th>
        <th style="padding:6px 6px;text-align:center">近況<br><span style="font-weight:400;font-size:9px">トレンド</span></th>
        <th style="padding:6px 6px;text-align:center">厩舎<br><span style="font-weight:400;font-size:9px">コンボ</span></th>
        <th style="padding:6px 6px;text-align:center">脚質<br><span style="font-weight:400;font-size:9px">補正</span></th>
        <th style="padding:6px 6px;text-align:center" title="ローテ・昇降級・馬体重・上がり・着差・勝ち馬強さ・乗替・叩き・コーナー一貫性・前走楽勝・展開文脈・相対SI の合計。下の「全内訳を表示」で項目別に確認できます">その他<br><span style="font-weight:400;font-size:9px">補正計</span></th>
        <th style="padding:6px 8px;text-align:center;background:#2d1b69">総合<br><span style="font-weight:400;font-size:9px">スコア</span></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    // ── 「その他」補正の全内訳（2026-07-11公開）──
    // まとめ値ではなく12項目を個別に開示する折りたたみ表。値は学習済みの実効倍率を
    // 適用した「総合スコアに実際に効いている量」（上表の各列と同じ基準）。
    const _omdComponents = [
      ['ローテ','rotMod','rotN','前走からの間隔'],
      ['昇降級','classMod','clsN','クラスの上げ下げ'],
      ['馬体重','weightMod','weightN','増減の影響'],
      ['上がり3F','agariMod','agariN','過去の末脚'],
      ['着差','marginMod','marginN','近走の着差'],
      ['勝ち強','winStrMod','winStrN','勝ち馬との力差'],
      ['乗替','jockeyChgMod','jockeyChgN','騎手の乗り替わり'],
      ['叩き','takiMod','takiN','休み明け何戦目か'],
      ['C一貫','cornConsistMod','cornConsistN','コーナー位置の安定度'],
      ['楽勝','rakuMod','rakuN','前走の楽勝ボーナス'],
      ['展開','paceCtxMod','paceCtxN','脚質と展開の相性'],
      ['相対SI','relSIMod',null,'メンバー内での相対走力'],
    ];
    const _omdRows = scored.map((s, idx) => {
      let _sum = 0;
      const cells = _omdComponents.map(([label, key, effKey]) => {
        const raw = s[key] || 0;
        const v = raw * (effKey ? _effDisp(effKey) : 1);
        _sum += v;
        const cls = Math.abs(v) < 0.05 ? 'omd-zero' : v > 0 ? 'omd-pos' : 'omd-neg';
        return `<td class="${cls}">${Math.abs(v) < 0.05 ? '—' : (v > 0 ? '+' : '') + v.toFixed(1)}</td>`;
      }).join('');
      return `<tr><td>${s.horse.umaBan||'—'}</td><td class="omd-name">${MARKS[idx]||''} ${escapeHTML(s.horse.horseName||'—')}</td>${cells}<td class="omd-sum">${(_sum>0?'+':'')+_sum.toFixed(1)}</td></tr>`;
    }).join('');
    tableHtml += `<details class="other-mod-detail"><summary>🔎 「その他」補正の全内訳を表示（12項目）</summary><div class="omd-wrap"><table>
      <thead><tr><th>馬番</th><th style="text-align:left">馬名</th>${_omdComponents.map(c=>`<th title="${c[3]}">${c[0]}</th>`).join('')}<th>合計</th></tr></thead>
      <tbody>${_omdRows}</tbody></table>
      <div class="omd-note">※各値は学習済みの実効倍率を適用した「総合スコアに実際に効いている量」。丸めの関係で上表の「その他」と±0.1程度ずれることがあります。列名にカーソルを合わせると項目の説明が出ます。</div></div>
    </details>`;
  }

  const afterBtnLabel  = _viewMode === 'after' ? '▶ レース前予想に戻る' : '📊 結果照合モード';
  const afterBtnStyle  = _viewMode === 'after'
    ? 'background:#7c3aed;color:#fff'
    : 'background:#e2e8f0;color:#374151';
  const afterBtnHtml   = raceHasResult
    ? `<button type="button" onclick="var p=document.getElementById('yoso-panel-${raceNo}');p._viewMode=(p._viewMode||'before')==='after'?'before':'after';renderPredictionPanel(${raceNo})" style="padding:4px 10px;${afterBtnStyle};border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">${afterBtnLabel}</button>`
    : '';
  const displayBtnLabel = _displayMode === 'simple' ? '📋 全ての内訳を表示' : '🔎 基本表示に戻す';
  const displayBtnStyle = _displayMode === 'simple'
    ? 'background:#e2e8f0;color:#374151'
    : 'background:#0e7490;color:#fff';
  const displayBtnHtml  = `<button type="button" onclick="var p=document.getElementById('yoso-panel-${raceNo}');p._displayMode=(p._displayMode||'simple')==='simple'?'detail':'simple';renderPredictionPanel(${raceNo})" style="padding:4px 10px;${displayBtnStyle};border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">${displayBtnLabel}</button>`;

  // ── ペース×馬場 前残り/前崩れ判定バッジ ──
  let paceBiasBadge = '';
  {
    const pb = scored._paceBias || {};
    const f = pb.factor || 1;
    const pace = pb.pace || '平均';
    const condTxt = (pb.cond || raceCond) || '馬場不明';
    const isHigh = raceDist === '1400';  // 行列は1400m由来
    let verdict, vColor, vBg, vIcon;
    if (f <= 0.92)      { verdict = '前崩れ警戒（差し台頭）'; vColor = '#dc2626'; vBg = '#fef2f2'; vIcon = '🔴'; }
    else if (f >= 1.08) { verdict = '前残り有利（先行信頼）'; vColor = '#059669'; vBg = '#f0fdf4'; vIcon = '🟢'; }
    else                { verdict = 'ほぼ中立';             vColor = '#6b7280'; vBg = '#f8fafc'; vIcon = '⚪'; }
    const facTxt = f === 1 ? '—' : `×${f.toFixed(2)}`;
    paceBiasBadge = `
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:${vBg};border:1px solid ${vColor}33;border-radius:8px;padding:7px 12px;font-size:12px">
        <span style="font-weight:800;color:${vColor}">${vIcon} ${verdict}</span>
        <span style="color:#475569">${condTxt} × <strong>${pace}予想</strong></span>
        <button type="button" class="kvi-info" onclick="this.parentElement.classList.toggle('kvi-open')" title="説明を表示">?</button>
        <span class="kvi-hidden" style="color:#94a3b8;font-size:11px">前後の有利さ ${facTxt}${isHigh ? '' : '（1400mの傾向を参考適用）'}｜出走馬の脚質構成から推定</span>
      </div>`;
  }

  // ── ◎の信頼度バッジ（1位と2位のスコア差から算出。実データ1196R検証：
  //    差<2.5=接戦帯(◎複勝54%)／2.5〜6=中間(66%)／6以上=断然帯(82%)） ──
  let confidenceBadge = '';
  {
    const _c0 = scored[0], _c1 = scored[1];
    if (_c0?.totalScore != null && _c1?.totalScore != null) {
      const _gap = +(_c0.totalScore - _c1.totalScore).toFixed(1);
      // 学習重み適用時はML尺度に分位マッチングした閾値と実測複勝率を使う（未適用時は従来の2.5/6）
      const _cw = getMlLiveWeights();
      const _thLo = _cw?.tiers?.c1 ?? 2.5, _thHi = _cw?.tiers?.c2 ?? 6;
      const _stT = _cw?.tiers?.fukuTight ?? 54, _stS = _cw?.tiers?.fukuStrong ?? 82, _stN = _cw?.tiers?.n ?? 1196;
      let label, color, bg, icon;
      if (_gap >= _thHi)      { label = '断然（信頼度高）'; color = '#15803d'; bg = '#f0fdf4'; icon = '🟢'; }
      else if (_gap < _thLo)  { label = '接戦（僅差・注意）'; color = '#d97706'; bg = '#fffbeb'; icon = '🟡'; }
      else                    { label = '標準的な差';       color = '#6b7280'; bg = '#f8fafc'; icon = '⚪'; }
      confidenceBadge = `
        <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:${bg};border:1px solid ${color}33;border-radius:8px;padding:7px 12px;font-size:12px">
          <span style="font-weight:800;color:${color}">${icon} ${label}</span>
          <span style="color:#475569">◎と○のスコア差 <strong>${_gap>=0?'+':''}${_gap}</strong></span>
          <button type="button" class="kvi-info" onclick="this.parentElement.classList.toggle('kvi-open')" title="説明を表示">?</button>
          <span class="kvi-hidden" style="color:#94a3b8;font-size:10px">過去${_stN}レースの集計：差が大きい時の◎は3着内${_stS}%・僅差の時は${_stT}%</span>
        </div>`;
    }
  }

  // ── 💰単勝妙味バッジ（手動等倍指数ベースの妙味検出器・表示専用）──
  //    妙味は「指数と市場の不一致」から生まれ、学習重みは市場寄りに収束するため、
  //    妙味判定は印とは独立に従来の手動等倍指数で行う（💎PSFバッジと同じ「別指数のバッジ」方式）。
  //    検証（全馬オッズ揃い・コールドスタート期除く2025/03以降169R）：手動指数の軸が
  //    「標準帯(差2.5〜6)×単勝3〜10倍」のとき単勝ROI約101%（全◎平均88%比で+13pt）。
  let valueBetBadge = '';
  {
    const _mvArr = scored.filter(s => s.totalScore != null && s.baseScore != null);
    if (_mvArr.length >= 2) {
      // 手動等倍スコアの再構成（学習重み適用前の従来totalScoreと同じ合成：15項目＋相対SI・cornModはペース伸縮後）
      const _manOf = s => s.baseScore + s.condMod + s.distMod + s.trendMod + s.comboMod + s.rotMod + s.classMod + s.cornMod + s.weightMod + s.agariMod + s.marginMod + s.winStrMod + s.jockeyChgMod + s.takiMod + s.cornConsistMod + (s.rakuMod || 0) + (s.relSIMod || 0);
      const _mv = _mvArr.map(s => ({ s, sc: _manOf(s) })).sort((a, b) => b.sc - a.sc);
      const _vgap = _mv[0].sc - _mv[1].sc;
      const _vh = _mv[0].s.horse;
      const _vod = parseFloat(_vh?.odds);
      if (_vgap >= 2.5 && _vgap < 6 && !isNaN(_vod) && _vod >= 3 && _vod < 10) {
        const _isTop = scored[0] && scored[0].horse === _vh;
        const _vnin = parseInt(_vh?.ninki);
        let _sub = '';
        if (!isNaN(_vnin) && _vnin >= 2) {
          const _favNames = horses
            .filter(h => { const n = parseInt(h.ninki); return !isNaN(n) && h.horseName !== _vh.horseName; })
            .sort((a, b) => parseInt(a.ninki) - parseInt(b.ninki)).slice(0, 2).map(h => h.horseName);
          if (_favNames.length) _sub = `<span class="vbb-sub">｜馬単 ${escapeHTML(_vh.horseName)}→（${_favNames.map(escapeHTML).join('・')}）も過去の検証では回収率104%（当たり外れの波は大きめ）</span>`;
        }
        valueBetBadge = `<div class="value-bet-bar">💰 <b>単勝妙味${escapeHTML(_isTop ? 'ゾーン' : '：' + _vh.horseName)}</b>（AIの評価${_isTop ? 'トップ＝◎' : 'は高いが◎とは別の馬'}・単勝${_vod.toFixed(1)}倍）＝AIの評価に対してオッズが高め。過去の同条件では平均より回収率が良い帯です${_sub}</div>`;
        _pickValue = { name: _vh.horseName, odds: _vod, isTop: _isTop };
      }
    }
  }

  // ── ⚠️危険な1番人気バッジ（過剰人気検出・表示専用）──
  //    検証（2026-07-04・1番人気2,386頭）：①手動指数4番手以下②壁馬（同クラス2走以上全て
  //    4着以下＋下級で好走歴）③前走楽逃げ好走（1角2番手以内・3着内・前半dev+0.8秒以上）の
  //    いずれか該当で複勝54.3% vs 該当なし78.7%（−24pt・5fold全て劣後・単勝ROI71% vs 83%）。
  let dangerFavBadge = '';
  {
    const _dfH = horses.find(h => parseInt(h.ninki) === 1);
    const _dfS = _dfH ? scored.find(s => s.horse === _dfH) : null;
    if (_dfS && scored.length >= 5 && raceInfo.raceDate) {
      const _dfReasons = [];
      // ①モデル乖離：手動等倍指数で4番手以下
      const _manOf2 = s => s.baseScore + s.condMod + s.distMod + s.trendMod + s.comboMod + s.rotMod + s.classMod + s.cornMod + s.weightMod + s.agariMod + s.marginMod + s.winStrMod + s.jockeyChgMod + s.takiMod + s.cornConsistMod + (s.rakuMod || 0) + (s.relSIMod || 0);
      const _dfRank = scored.filter(s => s.totalScore != null && s.baseScore != null)
        .map(s => ({ s, sc: _manOf2(s) })).sort((a, b) => b.sc - a.sc)
        .findIndex(x => x.s === _dfS) + 1;
      if (_dfRank >= 4) _dfReasons.push(`AI評価${_dfRank}番手`);
      // ②壁馬 ③前走楽逃げ（高知走歴から判定）
      const _dfHist = getHorseHistoryBefore(_dfH.horseName, raceInfo.raceDate, raceNo).filter(h => h.babaCode === '31');
      const _clsOrd = c => ({ A: 1, B: 2, C1: 3, C2: 4, C3: 5 })[getEffectiveClass(c)] || null;
      const _dfCur = _clsOrd(raceInfo.raceClass);
      if (_dfCur != null && _dfHist.length) {
        const _l6 = _dfHist.slice(0, 6);
        const _inC = _l6.filter(h => _clsOrd(h.raceClass) === _dfCur);
        const _wk  = _l6.filter(h => { const q = _clsOrd(h.raceClass); return q != null && q > _dfCur; });
        const _chN = h => { const c = parseInt(h.chakujun); return isNaN(c) ? 99 : c; };
        if (_inC.length >= 2 && _inC.every(h => _chN(h) > 3) && _wk.some(h => _chN(h) <= 3)) _dfReasons.push('昇級の壁（同クラス連続馬券外）');
      }
      const _lr = _dfHist[0];
      if (_lr && parseInt(_lr.chakujun) <= 3) {
        const _c1 = parseInt(String(_lr.corner || '').split('-')[0]);
        if (!isNaN(_c1) && _c1 <= 2) {
          const _fs = calcFrontSectional(_lr.time, _lr.agari3f);
          const _fd = _fs != null ? getFrontDev(_lr.raceDate, _lr.distance, _lr.raceClass, _lr.trackCond, _fs) : null;
          if (_fd != null && _fd >= 0.8) _dfReasons.push(`前走は楽逃げ（前半+${_fd.toFixed(1)}秒の恵まれ）`);
        }
      }
      if (_dfReasons.length) {
        dangerFavBadge = `<div class="danger-fav-bar">⚠️ <b>危険な1番人気：${escapeHTML(_dfH.horseName)}</b>（${_dfReasons.join('・')}）＝過去のデータでは、こういうタイプの1番人気は3着以内に来る率54%（普通の1番人気は79%）<span class="dfb-sub">｜過去2,386レースの集計</span></div>`;
        _pickDanger = { name: _dfH.horseName, reasons: _dfReasons.slice() };
      }
    }
  }

  // ── 🏇◎脚質注意バッジ（◎が差し・追込馬のとき警告・表示専用）──
  //    検証（scanData 2,742R）：モデル◎の複勝率は 逃げ先行77%・中団71% に対し
  //    差し・追込は48.8%（1着17.6%）と激落ち。高知の前有利で差し◎はコース不向き。
  //    指数側は差し罰則を強めてもCV改善せず（◎-closerは既に最善の選択で振替不可）＝人間警告で活かす。
  let legWarnBadge = '';
  {
    const _honmei = scored.find(s => s.totalScore != null);
    if (_honmei && _honmei.avg4C != null && _honmei.avg4C > 5) {
      const _lt = _honmei.avg4C > 7 ? '追込' : '差し';
      legWarnBadge = `<div class="leg-warn-bar">🏇 <b>◎脚質注意：${escapeHTML(_honmei.horse.horseName)}</b>（4角平均${_honmei.avg4C.toFixed(1)}番手＝${_lt}脚質）＝高知の前有利で差し◎は複勝48.8%（◎が逃げ先行なら77%）<span class="lwb-sub">｜相手の逃げ先行馬を厚めに・軸は割引推奨</span></div>`;
    }
  }

  // ── 🔵市場は買っているバッジ（モデル低評価×市場上位・表示専用）──
  //    残差分析（scanData 2,715R）：モデルが外した勝馬の27%はモデル4番手以下。共通点は
  //    「低SIのベテランを市場が推している」で、指数化できる特徴は無い（市場の私的情報）。
  //    実測：モデル6番手以下でも最終1-2番人気なら複勝45.4%・3-4番人気で33.2%。純能力指数は
  //    汚さず、市場のクロスチェックとして表示（"人気薄→急に人気"の内部情報系を人間に知らせる）。
  let marketBackBadge = '';
  {
    const _mb = scored
      .map((s, idx) => ({ s, rank: idx + 1, nk: parseInt(s.horse?.ninki) }))
      .filter(x => x.rank >= 6 && x.s.totalScore != null && !isNaN(x.nk) && x.nk >= 1 && x.nk <= 4)
      .sort((a, b) => a.nk - b.nk)
      .slice(0, 3);
    if (_mb.length) {
      const _items = _mb.map(x => {
        const _fk = x.nk <= 2 ? '45%' : '33%';
        return `<b>${escapeHTML(x.s.horse.horseName)}</b>（AI${x.rank}番手→${x.nk}番人気・この型は複勝${_fk}）`;
      }).join('　');
      marketBackBadge = `<div class="market-back-bar">🔵 <b>AIは低評価でも人気の馬</b>：${_items}<span class="mbb-sub">｜AIがまだ能力を測れていない可能性あり。直前で急に人気が上がった馬は特に要注意（関係者しか知らない好材料があることも）</span></div>`;
    }
  }

  // ── ⚡穴馬激走バッジ（指数下位の2-3着ライン候補・表示専用）──
  //    残差分析（指数6番手以下66,979頭・2026-07-07）：下位馬のベース複勝率11.4%に対し
  //    ①騎手×厩舎コンボ好調(comboN≥0.5)=24.1% ②逃げ先行型(cornN≥1)=21.0%
  //    ③前走展開不利の免罪(paceCtxN>0)=20.3% と該当馬は複勝率が約2倍。
  //    指数への組み込みはWFで正味+63頭/7909Rと微小のため、印は汚さずライン構築の人間支援に使う。
  let anaBadge = '';
  if (scored.length >= 7) {
    const _allCombo = getComboStatsAll();
    // 前走展開文脈（backtest paceCtxN と同一定義・直近3走のうち高知走のみ）
    const _paceCtxLive = hName => {
      let tough = false, gifted = false, excused = false;
      const _ld = lsRead();
      for (const h of getHorseHistoryBefore(hName, raceInfo.raceDate, raceNo).slice(0, 3)) {
        if (h.babaCode !== '31') continue;
        const rrec = _ld[`race_31_${escapeHTML(h.raceDate)}_${h.raceNo}`];
        if (!rrec || !rrec.first3f) continue;
        const pd = getPaceDevLabel(rrec.distance, rrec.race_class, rrec.track_cond, rrec.first3f);
        if (!pd) continue;
        const c1 = parseInt(String(h.corner || '').split('-')[0]);
        const ch = parseInt(h.chakujun);
        if (isNaN(c1) || c1 <= 0 || isNaN(ch)) continue;
        if (pd.dev <= -0.6 && c1 <= 3 && ch <= 3) tough = true;
        if (pd.dev <= -1.0 && c1 >= 6 && ch <= 3) gifted = true;
        if (pd.dev <= -1.0 && c1 <= 3 && ch >= 4) excused = true;
      }
      return (tough ? 0.5 : 0) + (gifted ? -0.4 : 0) + (excused ? 0.4 : 0);
    };
    const _anaHits = [];
    scored.forEach((s, idx) => {
      if (idx < 5 || s.totalScore == null) return;   // 指数6番手以下のみ
      const why = [];
      const cm = Yoso.comboMod(_allCombo[`${escapeHTML(s.jockey)}_${escapeHTML(s.trainer)}`], scored.length);
      if (cm >= 0.5) why.push('厩舎コンボ好調');
      if (s.cornMod >= 1) why.push('逃げ先行型');
      let pcv = 0;
      try { pcv = _paceCtxLive(s.horse.horseName || ''); } catch (e) {}
      if (pcv > 0) why.push('前走展開不利の免罪');
      if (why.length) _anaHits.push({ s, idx, why, nSig: why.length });
    });
    if (_anaHits.length) {
      _anaHits.sort((a, b) => b.nSig - a.nSig || a.idx - b.idx);
      _pickSleeper = { name: _anaHits[0].s.horse.horseName, idx: _anaHits[0].idx, why: _anaHits[0].why.slice() };
      const _items = _anaHits.slice(0, 3).map(x =>
        `<b>${escapeHTML(x.s.horse.horseName)}</b>（${x.idx + 1}番手・${x.why.join('＋')}）`).join('　');
      anaBadge = `<div class="ana-run-bar">⚡ <b>穴馬激走注意</b>：${_items}<button type="button" class="kvi-info" onclick="this.closest('.ana-run-bar').classList.toggle('kvi-open')" title="説明を表示">?</button><span class="arb-sub kvi-hidden">｜こういう特徴のある評価下位馬は、普通の下位馬（3着以内11%）の約2倍＝20〜24%の確率で馬券に絡みます。ワイドや3連系の相手候補に</span></div>`;
    }
  }

  // ── 🔍距離/馬場実績ありバッジ（近走不振でも条件一致の好走歴・参考情報のみ）──
  //    検証（2026-07-09・高知全体3,007R規模）：直近3走(高知)平均6着以下の馬のうち、それより前の
  //    走で距離±100m・同馬場状態が一致し3着以内があった馬は複勝25.6%（実績なしの馬22.7%）。
  //    split-halfで方向は再現するが、単勝/複勝/3連単いずれも実配当ROIでは市場がほぼ織り込み済みで
  //    妙味は無し（ファイナル限定の現象でもない）。指数には反映しない・当てやすさの参考情報のみ。
  let condFitBadge = '';
  {
    const _cfRdist = parseInt(raceDist) || 0;
    const _cfHits = [];
    scored.forEach((s, idx) => {
      const hName = s.horse?.horseName || '';
      if (!hName) return;
      const hist = getHorseHistoryBefore(hName, raceInfo.raceDate, raceNo).filter(h => h.babaCode === '31');
      if (hist.length < 3) return;
      const recent3 = hist.slice(0, 3).map(h => parseInt(h.chakujun)).filter(f => !isNaN(f));
      if (recent3.length < 2) return;
      const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
      if (recentAvg < 6) return; // 近走不振の馬のみ対象
      const older = hist.slice(3);
      const matched = older.some(h => {
        const d = getDistNum(h.distance);
        return d && _cfRdist && Math.abs(d - _cfRdist) <= 100 && h.trackCond === selCond && parseInt(h.chakujun) <= 3;
      });
      if (matched) _cfHits.push({ s, idx });
    });
    if (_cfHits.length) {
      const _items = _cfHits.slice(0, 3).map(x => `<b>${escapeHTML(x.s.horse.horseName)}</b>（${x.idx + 1}番手）`).join('　');
      condFitBadge = `<div class="cond-fit-bar">🔍 <b>距離/馬場実績あり</b>：${_items}<button type="button" class="kvi-info" onclick="this.closest('.cond-fit-bar').classList.toggle('kvi-open')" title="説明を表示">?</button><span class="cfb-sub kvi-hidden">｜最近の成績は良くないものの、今日と同じ距離・馬場状態では過去に3着以内あり。同タイプの馬はやや好走しやすい（3着以内25.6%・実績なし馬は22.7%）ですが、オッズにも織り込まれがちなので過信は禁物の参考情報です</span></div>`;
    }
  }

  // 🧠 学習重み適用中の表示（表示のみ・重みが未保存なら何も出さない＝従来式）
  const _mlWNote = getMlLiveWeights();
  const mlNote = _mlWNote
    ? `<div class="admin-only" style="margin-bottom:8px;font-size:10px;color:#9ca3af">🧠 学習重み適用中（${_mlWNote.races}R学習・${(_mlWNote.trainedAt || '').slice(0, 10)}）— 精度検証の二段基準クリア済み。補正項を学習済み実効倍率で合成しています。</div>`
    : '';

  // ── 🎯 このレースの狙い目カード（◎/中穴妙味/穴/危険を1枚に束ねた見どころ）──
  //    既存バッジが採用した馬（_pickDanger/_pickSleeper/_pickValue）とEVモニターを再利用＝詳細と矛盾しない。
  let pickSummary = '';
  if (_viewMode !== 'after') {
    const _hm = scored[0];
    if (_hm && _hm.totalScore != null) {
      const _g = (scored[1] && scored[1].totalScore != null) ? +(_hm.totalScore - scored[1].totalScore).toFixed(1) : null;
      const _cw2 = getMlLiveWeights();
      const _thHi2 = _cw2?.tiers?.c2 ?? 6, _thLo2 = _cw2?.tiers?.c1 ?? 2.5;
      let _confTxt = '標準', _confIcon = '⚪';
      if (_g != null) { if (_g >= _thHi2) { _confTxt = '断然'; _confIcon = '🟢'; } else if (_g < _thLo2) { _confTxt = '接戦'; _confIcon = '🟡'; } }
      let _evPick = null;
      try { const _er = computeEvBets(raceNo, container._selCond); if (_er && _er.runners) _evPick = _er.runners.find(r => r.inWindow) || null; } catch (e) {}
      const _row = (label, color, body) => `<div class="ps-row"><span class="ps-tag" style="background:${color}">${label}</span><span class="ps-body">${body}</span></div>`;
      let _rows = _row('本命', '#dc2626', `◎ <b>${escapeHTML(_hm.horse.horseName)}</b> <span class="ps-mut">${_confIcon}${_confTxt}${_g != null ? '（差' + (_g >= 0 ? '+' : '') + _g + '）' : ''}</span>`);
      if (_evPick) _rows += _row('妙味', '#7c3aed', `中穴 <b>${escapeHTML(_evPick.name)}</b> <span class="ps-mut">単勝${_evPick.odds.toFixed(1)}倍｜AIの見立てよりオッズが高くお得</span>`);
      else if (_pickValue) _rows += _row('妙味', '#7c3aed', `<b>${escapeHTML(_pickValue.name)}</b> <span class="ps-mut">単勝${_pickValue.odds.toFixed(1)}倍・AI評価とオッズのズレ</span>`);
      if (_pickSleeper) _rows += _row('穴', '#0891b2', `2-3着に <b>${escapeHTML(_pickSleeper.name)}</b> <span class="ps-mut">${_pickSleeper.idx + 1}番手・${escapeHTML(_pickSleeper.why.join('＋'))}</span>`);
      if (_pickDanger) _rows += _row('危険', '#b45309', `⚠️ <b>${escapeHTML(_pickDanger.name)}</b> <span class="ps-mut">${escapeHTML(_pickDanger.reasons.join('・'))}</span>`);
      const _line = `${_confTxt === '断然' ? '本命◎が抜けています' : _confTxt === '接戦' ? '上位が僅差で頭は割れそう' : '標準的な力関係'}。`
        + (_evPick ? `中穴妙味は${escapeHTML(_evPick.name)}（${_evPick.odds.toFixed(1)}倍）。` : _pickValue ? `妙味は${escapeHTML(_pickValue.name)}。` : '明確な中穴妙味は薄めです。')
        + (_pickSleeper ? `穴なら${escapeHTML(_pickSleeper.name)}を2-3着に。` : '')
        + (_pickDanger ? `人気の${escapeHTML(_pickDanger.name)}は割引が必要。` : '');
      pickSummary = `<div class="pick-summary"><div class="ps-head">🎯 このレースの狙い目<button class="ps-copy" onclick="_copyPickText(this)" title="狙い目をコピー">📋</button></div>${_rows}<div class="ps-line">${_line}</div></div>`;
    }
  }

  // 閲覧者にも表示する部分（狙い目カード・買い得チェック・穴馬チェック・スコア解説）。
  // 計算は既存のcomputeYosoScored/computeEvBets/buildEvMonitorHtml/buildLongshotHtmlをそのまま使い、二重計算しない。
  if (pubExtra) {
    pubExtra.innerHTML = `
      ${pickSummary}
      ${buildEvMonitorHtml(raceNo, container._selCond)}
      ${buildLongshotHtml(scored)}
      ${raceHasResult ? `
      <details class="yoso-public-aftermatch">
        <summary>📊 結果と照合（AIの印は当たったか）</summary>
        <div class="ya-body">${buildAfterMatchHtml(scored, horses)}</div>
      </details>` : ''}
      <details class="yoso-explain">
        <summary>📖 スコアはこう計算しています（タップで開く）</summary>
        <div class="ye-body">
          <b>総合スコア ＝ 基本の走力（走力SI）＋ 6つの加点・減点</b>。点が高いほど「今日のレースで走れそう」という評価です。<br><br>
          <b>🏃 基本の走力（走力SI）</b> … 過去のタイムを「距離・馬場ごとの平均と比べてどれだけ速いか」で点数化したもの。直近10走を新しいレースほど重視して平均します（今日のレース自体は含めません）。<br>
          <b>🌧 馬場</b> … 今日と同じ馬場状態（良・重など）で走ったとき、普段より良い成績なら加点、悪ければ減点。<br>
          <b>📏 距離</b> … 今日と同じくらいの距離（±100m）が得意なら加点。距離が伸びる・縮むのが得意かどうかも見ます。<br>
          <b>📈 近況</b> … 成績が上向きの馬は加点、下向きは減点（3走以上で判定）。<br>
          <b>🤝 コンビ</b> … 今日の騎手と厩舎の組み合わせで過去に好成績なら加点。<br>
          <b>🐎 脚質</b> … 高知は「前に行ける馬」が有利なコース。いつも4コーナーで前にいる馬は加点（最大+1.5）、後ろから追い込む馬は減点（最大-1.2）。実際に4コーナー先頭の馬は6〜7割勝っています。<br>
          <b>🔧 その他</b> … 細かい加点・減点の合計。出走間隔／クラスが上がった・下がった／馬体重の増減／ゴール前の伸び脚／勝った相手の強さ／騎手の乗り替わり／休み明け何戦目か、などです。<br><br>
          <span style="color:#b45309">※「騎手」の数字は参考表示で、スコアには足していません</span>（騎手の影響は「コンビ」と「乗り替わり」で反映済み）。<br>
          印の意味：◎いちばん期待 ○二番手 ▲三番手 △おさえ ×評価低め。「転入」＝他の競馬場から来たばかりで参考値、「推定」＝データが少なくクラスから推定した値です。<br><br>
          <b>🧭 印の並び順について</b> … 印（◎○▲…）は<b>単勝オッズに関係なく、「総合スコア」の高い順</b>に決まります（オッズ非依存のAI単独評価）。市場のオッズから推定した確率（AI推定確率）は🔭穴馬チェックの妙味判定にのみ使い、印の並び順には影響しません。
        </div>
      </details>`;
  }

  // 実験合格前の相手モデルは、管理者の予想AIパネル内だけにshadow表示する。
  // predictorには投影コピーを渡すため、ここで呼んでもscored/印/ソート順は変更されない。
  const _opponentShadow = (_viewMode !== 'after' && typeof computeOpponentShadow === 'function')
    ? computeOpponentShadow(raceNo, scored) : null;
  container._opponentShadow = _opponentShadow;
  const opponentShadowHtml = (typeof buildOpponentShadowHtml === 'function')
    ? buildOpponentShadowHtml(raceNo, _opponentShadow) : '';

  container.innerHTML = `
    <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:700;color:#374151"><i class="fas fa-star" style="color:#d97706;margin-right:4px"></i>予想AI</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;">
        <span style="font-weight:700">馬場状態：</span>
        <select id="yoso-cond-sel-${raceNo}" onchange="document.getElementById('yoso-panel-${raceNo}')._selCond=this.value;renderPredictionPanel(${raceNo})" style="padding:3px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:12px;font-weight:700;background:#fff;">
          ${condOptions}
        </select>
      </label>
      ${displayBtnHtml}
      ${afterBtnHtml}
      <span style="margin-left:auto"></span>
      <button type="button" class="yr-btn" onclick="renderYosoReport(${raceNo});setTimeout(()=>{document.getElementById('yoso-report-${raceNo}')?.scrollIntoView({behavior:'smooth',block:'start'})},50)" title="バイアス×脚質×コメント癖×持ち時計から予想レポートを生成（端末内計算・無料）">🧠 AI予想レポート</button>
      <button type="button" class="admin-only" onclick="runYosoBacktest(${raceNo})" title="過去全レースで予想精度を検証（約10秒）" style="padding:4px 10px;background:#f3f4f6;color:#374151;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">📈 精度検証</button>
      <button type="button" id="yoso-fetch-all-btn-${raceNo}" class="admin-only" onclick="_kvLoadLibrary('adminHorse').then(()=>fetchAllByNameForRace(${raceNo}))" style="padding:4px 12px;background:#1a56a0;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="fas fa-download"></i> データ自動取得</button>
      <span id="yoso-fetch-status-${raceNo}" class="admin-only" style="font-size:11px;color:#6b7280;white-space:nowrap;"></span>
    </div>
    ${mlNote}
    ${confidenceBadge}
    ${dangerFavBadge}
    ${legWarnBadge}
    ${marketBackBadge}
    ${anaBadge}
    ${condFitBadge}
    ${paceBiasBadge}
    ${opponentShadowHtml}
    <div style="overflow-x:auto;">${tableHtml}</div>
    <div id="yoso-backtest-${raceNo}"></div>
    <div id="yoso-report-${raceNo}"></div>`;
  // 【Phase3-1 hook・seam A案】確定scored(totalScore降順・sort済)＋既存印マップを、パネルinnerHTML反映直後に
  // 新UIへ1回だけ渡す。既存パネルの出力・状態は不変、二重計算なし（同じscored/horseMarkMapを渡す）。
  // 例外は kvxSafeRenderDebanV2 内部で隔離し、既存renderPredictionPanelを絶対に失敗させない。
  if (window.kvxSafeRenderDebanV2) window.kvxSafeRenderDebanV2(raceNo, scored, horseMarkMap, _rd0);
}

// ── 精度バックテスト（旧 vs 新 ◎的中率比較） ──
function runYosoBacktest(raceNo) {
  const btDiv = document.getElementById(`yoso-backtest-${raceNo}`);
  if (!btDiv) return;
  if (btDiv._running) return;
  btDiv._running = true;
  btDiv.innerHTML = '<p style="font-size:11px;color:#6b7280;padding:8px 0">バックテスト実行中...</p>';

  setTimeout(() => {
    try {
      const lsData = lsRead();
      const CLASS_RANK = YOSO_CLASS_RANK;

      // IDBから高知レースをグループ化（取消馬も_scratched:trueで含む）
      const raceGroups = {};
      for (const [k, v] of Object.entries(lsData)) {
        if (v.type !== 'horse') continue;
        const parts = k.split('_');
        if (parts[0] !== '31') continue; // 高知のみ
        const chaku = parseInt(v.chakujun);
        const isRunner = !isNaN(chaku) && chaku >= 1 && chaku <= 20;
        const _scratched = !isRunner;
        // 無効な非空chakujun（例:"取消"→"" 以外の残骸）は除外
        if (_scratched && v.chakujun !== '' && v.chakujun != null) continue;
        // 馬名なしのスクラッチは除外
        if (_scratched && !v.horseName) continue;
        const raceKey = `${parts[0]}_${parts[1]}_${parts[2]}`;
        if (!raceGroups[raceKey]) raceGroups[raceKey] = [];
        raceGroups[raceKey].push({ ...v, _key: k, babaCode: parts[0], raceDate: parts[1], raceNo: parseInt(parts[2]), _scratched });
      }

      // 上がり3F距離別平均をIDB全データから集計（ルックアヘッド最小・平均なので問題なし）
      const _agariByDist = {};
      for (const [k, v] of Object.entries(lsData)) {
        if (!v.agari3f) continue;
        const a = parseFloat(v.agari3f);
        if (isNaN(a) || a < 30 || a > 50) continue;
        const d = getDistNum(v.distance);
        if (!d) continue;
        if (!_agariByDist[d]) _agariByDist[d] = {s:0,n:0};
        _agariByDist[d].s += a; _agariByDist[d].n++;
      }
      const _getAgRefBT = d => {
        if (_agariByDist[d]?.n >= 10) return _agariByDist[d].s / _agariByDist[d].n;
        const ns = Object.entries(_agariByDist).filter(([,x])=>x.n>=10).sort((a,b)=>Math.abs(+a[0]-d)-Math.abs(+b[0]-d));
        return ns.length ? ns[0][1].s/ns[0][1].n : 38.5;
      };
      // 騎手×厩舎コンボ複勝率（全IDBデータから）
      const _btComboStats = {};
      for (const [k, v] of Object.entries(lsData)) {
        if (!v.jockey || !v.trainer) continue;
        const chaku2 = parseInt(v.chakujun);
        if (isNaN(chaku2)) continue;
        const ck = `${(v.jockey||'').trim()}_${(v.trainer||'').trim()}`;
        if (!_btComboStats[ck]) _btComboStats[ck] = {place:0,total:0};
        _btComboStats[ck].total++;
        if (chaku2 <= 3) _btComboStats[ck].place++;
      }

      // JRA転入馬フォールバック用: official_* キャッシュを馬名でインデックス化（ライブモデルと同じ）
      const _officialByHorseBT = new Map();
      for (const [k, v] of Object.entries(lsData)) {
        if (k.startsWith('official_') && v.type === 'official' && v.horseName && v.races?.length) {
          _officialByHorseBT.set(v.horseName, v.races);
        }
      }
      // 転入馬推定スコアは Yoso.estimateTransferScore（共通式）を使用。

      // 前走勝ち馬SIマップ（inningStrengthMod用）
      const _winnerSIMap = {};
      for (const [k, v] of Object.entries(lsData)) {
        if (v.type !== 'horse' || parseInt(v.chakujun) !== 1 || !v.time) continue;
        const _wp = k.split('_');
        if (_wp.length < 4 || _wp[0] !== '31') continue;
        const _wrk = `${_wp[0]}_${_wp[1]}_${_wp[2]}`;
        if (_winnerSIMap[_wrk] != null) continue;
        const _wb2 = getDayBiasForDate(_wp[0], _wp[1]) ?? null;
        const _rc2 = lsData[`race_${_wp[0]}_${_wp[1]}_${parseInt(_wp[2])}`] || {};
        const _wsi = calcSpeedIndex(v.time, _rc2.distance||'', _rc2.race_class||'', _rc2.track_cond||v.trackCond||'', _wb2, v.kinryo, null);
        if (_wsi != null) _winnerSIMap[_wrk] = _wsi;
      }
      // 係数スキャン用データ蓄積
      const scanData = [];

      // 乗り替わり診断カウンター
      const _jcDiag = { noJockey:0, sameJockey:0, smallDiff:0, fired:0 };

      // ペース×馬場バイアス行列（脚質補正の伸縮係数用）。
      // 【2026-07-10】距離別にキャッシュしながら構築（旧実装は1400m専用行列を全距離に適用していた）。
      const _btPaceMatrices = {};
      const _getBtPaceMatrix = d => _btPaceMatrices[d] || (_btPaceMatrices[d] = buildPaceBiasMatrix('31', d));

      // 馬基準差SI実験用アクセサ：SIの水準補正を馬アンカー方式に置き換える
      // （データ不足でnullの日は基準時計方式へフォールバック）
      const _anchBiasBT = (babaCode, raceDate) => {
        const hb = getHorseAnchoredBias(babaCode, raceDate);
        return (hb && hb.bias != null) ? hb.bias : (getDayBiasForDate(babaCode, raceDate) ?? null);
      };

      // PSF定数・カーブはトップレベル（PSF_WIN等）を使用（ライブの💎妙味バッジと共通）

      const oldS = { t:0, h1:0, h3:0 };
      const newS = { t:0, h1:0, h3:0 };
      const newBS = { t:0, h1:0, h3:0 }; // 新＋ペース補正
      const noTransferS = { t:0, h1:0, h3:0 }; // ◎が移籍初戦・デビュー馬でないレースのみ
      const transferOnlyS = { t:0, h1:0, h3:0 }; // ◎が移籍初戦（推定スコア）だったレースのみ
      const oldRR = { bet:0, ret:0 }; // 旧◎ 単勝回収率（100円賭け想定・オッズ判明レースのみ）
      const newRR = { bet:0, ret:0 }; // 新◎ 単勝回収率
      const ninkiRR = { bet:0, ret:0 }; // 1番人気単勝を毎回買った場合の回収率（比較用ベースライン）
      const pbActN = { t:0, n1:0, n3:0, b1:0, b3:0 }; // 補正が効いたレースのみ（新 vs 新＋補正）
      const circleS  = { t:0, h1:0, h3:0 }; // ○対抗
      const sankakuS = { t:0, h1:0, h3:0 }; // ▲単穴
      const top3S    = { t:0, hit:0 };       // ◎○▲いずれか1着
      const ninkiS = { top1:{t:0,h1:0,h3:0}, top2:{t:0,h1:0,h3:0}, ana:{t:0,h1:0,h3:0} };
      const detail = [];

      for (const [raceKey, entries] of Object.entries(raceGroups)) {
        // 取消除いたランナーが4頭以上必要
        const _fieldSizeBT = entries.filter(e => !e._scratched).length;
        if (_fieldSizeBT < 4) continue;
        const hasWinner = entries.some(e => parseInt(e.chakujun) === 1);
        if (!hasWinner) continue;
        const { babaCode, raceDate, raceNo: rNo } = entries[0];
        const raceVal = lsData[`race_${babaCode}_${raceDate}_${rNo}`] || {};
        const raceDist = String(raceVal.distance||'').replace(/[^\d]/g,'');
        const raceCls  = raceVal.race_class || raceVal.raceClass || '';
        const rdistNum = parseInt(raceDist) || 0;
        const curCR    = CLASS_RANK[getEffectiveClass(raceCls)] || 0;

        const scoredOld = [], scoredNew = [], scanRaceData = [];
        for (const entry of entries) {
          const hName = entry.horseName || entry.horse_name || '';
          const fullHist = getHorseHistory(hName);
          // 当該レース以前の履歴のみ使用
          const preHist = fullHist.filter(h =>
            h.raceDate < raceDate ||
            (h.raceDate === raceDate && parseInt(h.raceNo) < rNo)
          );
          const kochiPre = preHist.filter(h => h.babaCode === '31');
          const otherPre = preHist.filter(h => h.babaCode !== '31');

          // 【2026-07-10】computeHorseSI()に統一（③）。ライブと同じペース/ポジション補正込み。
          const _siForBT = h => computeHorseSI(h, false, { predictionDate: raceDate, predictionRaceNo: rNo, caller: 'runYosoBacktest' });
          const { list: siList } = Yoso.buildSIList(kochiPre, otherPre, _siForBT);

          // SI算出不可でもhistEx/official_*から推定スコアを試す（ライブと同じフォールバック）。
          // 推定も不可能な場合のみ真のデビュー馬として除外する。
          let base = Yoso.baseFromSIList(siList), _isEstimatedBT = false;
          if (base == null) {
            base = Yoso.estimateTransferScore(preHist, raceCls, hName, _officialByHorseBT);
            if (base == null) continue; // 真のデビュー馬（推定材料もなし）
            _isEstimatedBT = true;
          }

          // 馬基準差SI実験：水準補正だけを馬アンカー方式に置き換えたベーススコア。
          // 補正項は全て共通のまま＝置換の効果だけを分離して測る（推定スコア馬は同値）。
          const _siForBTA = h => computeHorseSI(h, true, { predictionDate: raceDate, predictionRaceNo: rNo, caller: 'runYosoBacktestA' });
          const baseA = _isEstimatedBT ? base : (Yoso.baseFromSIList(Yoso.buildSIList(kochiPre, otherPre, _siForBTA).list) ?? base);


          // 旧: condMod（複勝率ベース・3走以上）
          const selCond = entry.trackCond || raceVal.track_cond || raceVal.trackCond || '良';
          const cH_old = preHist.filter(h => h.trackCond===selCond && h.time && /^\d+$/.test(String(h.chakujun)));
          const condOld = cH_old.length >= 3 ? (cH_old.filter(h=>parseInt(h.chakujun)<=3).length/cH_old.length - 0.33)*4 : 0;

          // 旧: distMod（同距離のみ・3走以上）
          const dH_old = preHist.filter(h => String(h.distance||'').replace(/[^\d]/g,'')===raceDist && h.time && /^\d+$/.test(String(h.chakujun)));
          const distOld = dH_old.length >= 3 ? (dH_old.filter(h=>parseInt(h.chakujun)<=3).length/dH_old.length - 0.33)*2 : 0;

          // 新: condMod + distMod（検証版は当日バイアスのみ・仕様差）
          const allSIcd = Yoso.siWithCondList(preHist, h => getDayBiasForDate(h.babaCode, h.raceDate) ?? null);
          const gAvg = allSIcd.length ? allSIcd.reduce((s,x)=>s+x.si,0)/allSIcd.length : null;
          const cSIs = allSIcd.filter(x=>x.cond===selCond).map(x=>x.si);
          const cAvg = cSIs.length ? cSIs.reduce((a,b)=>a+b,0)/cSIs.length : null;
          const condNew = Yoso.condMod(cAvg, gAvg, cSIs.length);

          // 新: distMod（SI差分ベース + 延長/短縮補正）
          const ndSIs = allSIcd.filter(x=>x.dist&&rdistNum&&Math.abs(x.dist-rdistNum)<=100).map(x=>x.si);
          const ndAvg = ndSIs.length ? ndSIs.reduce((a,b)=>a+b,0)/ndSIs.length : null;
          const distNew = Yoso.distExtAdj(Yoso.distMod(ndAvg, gAvg, ndSIs.length), preHist[0] ? getDistNum(preHist[0].distance) : null, rdistNum);

          // 新: rotMod
          const rotN = preHist[0] ? Yoso.rotMod(raceDate, preHist[0].raceDate) : 0;

          // 新: classMod
          const clsN = preHist[0] ? Yoso.classMod(curCR, preHist[0].raceClass) : 0;

          // 新: cornMod（検証版は生値で閾値判定・ライブは丸め値＝仕様差）
          const _a4cB = Yoso.avg4C(preHist);
          const _a4c = _a4cB.avg;
          const cornN = Yoso.cornMod(_a4c, _a4cB.count);

          // 新: trendMod（SI線形回帰トレンド）
          const trendN = Yoso.trendMod(siList);

          // 新: weightMod（馬体重変化補正）
          const weightN = Yoso.weightMod(Yoso.weightChange(entry.weight, preHist[0]?.weight));

          // 新: trainerMod（現状は総合スコアに未加算・将来用）
          const trainerN = Yoso.trainerMod(lookupTrainerStats((entry.trainer||'').trim()));

          // 新: agariMod（基準値はデータ駆動・ライブは固定表＝仕様差）
          const agariN = Yoso.agariMod(_getAgRefBT(rdistNum), Yoso.agariAvg(preHist, rdistNum));

          // 新: comboN（検証版は全馬場集計・ライブは高知のみ＝仕様差）
          // 【2026-07-10】未来情報混入対策：_btComboStats(全期間集計)ではなくこのレースより前だけの
          // コンボ統計を使う。これがコード監査②の核心（過去レースを未来の結果込みで評価していた）。
          const comboN = Yoso.comboMod(getComboStatsAsOf((entry.jockey||'').trim(), (entry.trainer||'').trim(), raceDate, rNo), _fieldSizeBT);

          // 新: marginN（前走着差補正・直近2走）
          const marginN = Yoso.marginMod(Yoso.marginAvgGap(preHist));

          // 新: winStrN（前走勝ち馬の強さ補正）
          let winStrN = 0;
          if (marginN > 0 && preHist.length >= 1 && parseInt(preHist[0].chakujun) > 1) {
            const _ph0 = preHist[0];
            const _wSI = _winnerSIMap[`${_ph0.babaCode}_${_ph0.raceDate}_${_ph0.raceNo}`];
            if (_wSI != null && siList.length >= 2) {
              winStrN = Yoso.winStrMod(_wSI - siList.reduce((s,v)=>s+v,0)/siList.length);
            }
          }

          // jockeyChgN（乗り替わり補正）
          const _getJWRbt = name => { const s = lookupJockeyStats(name); if (!s) return 12; const src = (s.recent?.n >= 30 ? s.recent : null) || s.all; return src?.wr ?? 12; };
          let jockeyChgN = 0;
          if (!entry.jockey) {
            _jcDiag.noJockey++;
          } else if (preHist.length >= 1) {
            const _pj = (preHist[0].jockey || '').trim();
            const _cj = (entry.jockey || '').trim();
            if (!_pj || _pj === _cj) {
              _jcDiag.sameJockey++;
            } else {
              jockeyChgN = Yoso.jockeyChgMod(_getJWRbt(_cj) - _getJWRbt(_pj));
              if (jockeyChgN !== 0) _jcDiag.fired++; else _jcDiag.smallDiff++;
            }
          }

          // takiN（叩き効果・休み明け2走目）
          const takiN = preHist.length >= 2 ? Yoso.takiMod(raceDate, preHist[0].raceDate, preHist[1].raceDate) : 0;

          // cornConsistN（コーナー一貫性補正）
          const cornConsistN = Yoso.cornConsistMod(Yoso.cornConsistAvg(preHist));

          // rakuN（前走楽勝ボーナス）：前走高知が勝利ならその勝ち幅からボーナス（楽勝+5／快勝+2.5）
          const rakuN = rakuShoBonus(kochiPre[0]);

          // paceCtxN（展開文脈補正・実験v2）：過去3走のペース基準比×位置取りで
          // 「逆境で先行して好走＝地力」「ハイ限定の差し好走＝展開ギフト」
          // 「ハイで潰れた先行＝免罪（次走複勝35.4% vs スロー潰れ27.7%・EDA由来）」を識別
          // 【2026-07-10】未来情報混入対策：各過去走をその過去走自身の日付より前の基準表で判定
          // （getPaceDevLabelAsOf）。ライブ側と同じ修正。
          let paceCtxN = 0;
          {
            let _tough = false, _gifted = false, _excused = false;
            for (const h of preHist.slice(0, 3)) {
              if (h.babaCode !== '31') continue;
              const rrec = lsData[`race_31_${h.raceDate}_${h.raceNo}`];
              if (!rrec || !rrec.first3f) continue;
              const pd = getPaceDevLabelAsOf(rrec.distance, rrec.race_class, rrec.track_cond, rrec.first3f, h.raceDate, parseInt(h.raceNo));
              if (!pd) continue;
              const c1 = parseInt(String(h.corner || '').split('-')[0]);
              const ch = parseInt(h.chakujun);
              if (isNaN(c1) || c1 <= 0 || isNaN(ch)) continue;
              if (pd.dev <= -0.6 && c1 <= 3 && ch <= 3) _tough = true;
              if (pd.dev <= -1.0 && c1 >= 6 && ch <= 3) _gifted = true;
              if (pd.dev <= -1.0 && c1 <= 3 && ch >= 4) _excused = true;
            }
            if (_tough)   paceCtxN += 0.5;
            if (_gifted)  paceCtxN -= 0.4;
            if (_excused) paceCtxN += 0.4;
          }

          // PSF材料：先行力ES（過去5走1C中央値）・位置条件付き地力G（時計から馬場/クラス/位置コストを除いた残差の中央値）
          let psfEs = null, psfG = null;
          {
            const _k5 = preHist.filter(h => h.babaCode === '31').slice(0, 5);
            const _c1s = _k5.map(h => parseInt(String(h.corner || '').split('-')[0])).filter(x => !isNaN(x) && x > 0).sort((a, b) => a - b);
            if (_c1s.length >= 2) psfEs = _c1s[Math.floor(_c1s.length / 2)];
            const _perfs = [];
            for (const h of _k5) {
              const _pc1 = parseInt(String(h.corner || '').split('-')[0]);
              const _pt = raceTimeToSec(h.time);
              if (isNaN(_pc1) || _pc1 <= 0 || _pt == null) continue;
              const _prr = lsData[`race_31_${h.raceDate}_${h.raceNo}`] || {};
              const _pd2 = getDistNum(_prr.distance || h.distance);
              const _pcl = getEffectiveClass(_prr.race_class || h.raceClass || '');
              const _std = (_pd2 && _pcl) ? STANDARD_TIMES[_pd2]?.[_pcl] : null;
              if (_std == null) continue;
              const _pdb = _anchBiasBT('31', h.raceDate);
              if (_pdb == null) continue;
              _perfs.push(-(_pt - _pdb - _std - PSF_POSEXP[Math.min(_pc1, 9)]));
            }
            if (_perfs.length >= 2) { _perfs.sort((a, b) => a - b); psfG = _perfs[Math.floor(_perfs.length / 2)]; }
          }
          const _psfCs = _btComboStats[`${(entry.jockey || '').trim()}_${(entry.trainer || '').trim()}`];
          const psfCombo = _psfCs ? (_psfCs.place + 0.33 * 10) / (_psfCs.total + 10) - 0.33 : 0;
          const _psfKinV = parseFloat(entry.kinryo);
          const psfKin = isNaN(_psfKinV) ? null : _psfKinV;
          const psfWcM = Yoso.weightMod(Yoso.weightChange(entry.weight, preHist[0]?.weight));

          // 移籍初戦／デビュー馬判定：_isEstimatedBT＝SI算出不可で推定スコアを使った
          // （転入初戦の典型）。preHist.length===0は真のデビュー馬だが推定も出来ないため
          // 既にcontinueで除外済み＝ここには到達しない。
          const _isTransferBT = _isEstimatedBT;
          const _isDebutBT    = false;

          const chaku = parseInt(entry.chakujun);
          const _sc = !!entry._scratched;
          const _odds = parseFloat(entry.odds);
          const _ninki = parseInt(entry.ninki);
          if (!_sc) scanRaceData.push({ chaku, umaBan: parseInt(String(entry._key || '').split('_')[3]) || null, base, baseA, condNew, distNew, rotN, clsN, cornN, trendN, weightN, agariN, comboN, marginN, winStrN, jockeyChgN, takiN, cornConsistN, rakuN, paceCtxN, rotTakiN: rotN + takiN, psfEs, psfG, psfCombo, psfKin, psfWcM, odds: (!isNaN(_odds) && _odds>0) ? _odds : null, ninki: isNaN(_ninki) ? null : _ninki });
          scoredOld.push({ hName, chaku, score: base + condOld + distOld, _scratched: _sc });
          scoredNew.push({ hName, chaku, score: base + condNew + distNew + rotN + clsN + cornN + trendN + weightN + agariN + comboN + marginN + winStrN + jockeyChgN + takiN + cornConsistN + rakuN, base, _scratched: _sc, _cornN: cornN, _a4c: _a4c, _isTransferBT, _isDebutBT });
        }

        // 相対SI補正（フィールド内相対位置・後処理）
        const _btBases = scoredNew.filter(s => s.base != null).map(s => s.base);
        if (_btBases.length >= 3) {
          const _btFAvg = _btBases.reduce((a,b)=>a+b,0)/_btBases.length;
          scoredNew.forEach(s => { if (s.base != null) s.score += Yoso.relSIMod(s.base, _btFAvg); });
        }

        // PSFスコア（レース内後処理）：ES順位＝競り合い後の期待位置 → 実測勝率カーブ × 地力
        if (scanRaceData.length >= 2) {
          const _fld = scanRaceData.length;
          const _wEs = scanRaceData.filter(r => r.psfEs != null).sort((a, b) => a.psfEs - b.psfEs);
          let _pi = 0;
          while (_pi < _wEs.length) { // 同ES帯は平均ランク（先行争いの奪い合いを表現）
            let _pj = _pi;
            while (_pj + 1 < _wEs.length && _wEs[_pj + 1].psfEs === _wEs[_pi].psfEs) _pj++;
            const _avgRank = (_pi + _pj) / 2 + 1;
            for (let m = _pi; m <= _pj; m++) _wEs[m]._psfRank = _avgRank;
            _pi = _pj + 1;
          }
          const _nullRank = Math.ceil(_fld * 0.6); // ES不明馬は中団後ろ想定（凍結）
          const _D = _wEs.filter(r => r.psfEs <= 3).length / _fld;
          const _shift = _D >= 0.45 ? 0.5 : _D < 0.25 ? -0.5 : 0; // 先行密度→カーブシフト（凍結）
          const _kins = scanRaceData.map(r => r.psfKin).filter(v => v != null);
          const _kinAvg = _kins.length ? _kins.reduce((a, b) => a + b, 0) / _kins.length : null;
          for (const r of scanRaceData) {
            if (r.psfG == null) { r.psfS = null; continue; }
            const _rank = r._psfRank != null ? r._psfRank : _nullRank;
            const _kd = (r.psfKin != null && _kinAvg != null) ? r.psfKin - _kinAvg : 0;
            r.psfS = Math.log(_psfWinAt(_rank + _shift)) + PSF_BETA * r.psfG + PSF_G_COMBO * r.psfCombo + PSF_G_KIN * _kd + PSF_G_WC * r.psfWcM;
          }
        }
        // 全馬オッズが揃っているレースのみROI検証対象（勝ち馬のみ補完＝生存者バイアスを排除）
        if (scanRaceData.length >= 2) { scanRaceData._date = raceDate; scanRaceData._rno = rNo; scanRaceData._fullOdds = scanRaceData.every(c => c.odds != null); scanData.push(scanRaceData); }
        if (scoredOld.length < 2) continue;
        scoredOld.sort((a,b)=>b.score-a.score);
        scoredNew.sort((a,b)=>b.score-a.score);

        // 取消◎はカウント対象外（予想時点での◎が取消になった場合）
        if (scoredNew[0]?._scratched || scoredOld[0]?._scratched) continue;

        // ランナーのみのリスト（○▲用）
        const runnersNew = scoredNew.filter(s => !s._scratched);
        const runnersOld = scoredOld.filter(s => !s._scratched);

        const winner = entries.find(e=>parseInt(e.chakujun)===1);
        oldS.t++; newS.t++;
        if (runnersOld[0].chaku===1) oldS.h1++;
        if (runnersOld[0].chaku<=3) oldS.h3++;
        if (runnersNew[0].chaku===1) newS.h1++;
        if (runnersNew[0].chaku<=3) newS.h3++;

        // ── 単勝回収率（100円賭け想定・オッズ判明レースのみ集計） ──
        const _oldPickE = entries.find(e=>(e.horseName||e.horse_name||'')===runnersOld[0].hName);
        const _oldOdds  = parseFloat(_oldPickE?.odds);
        if (!isNaN(_oldOdds) && _oldOdds > 0) {
          oldRR.bet++;
          if (runnersOld[0].chaku===1) oldRR.ret += _oldOdds * 100;
        }
        const _newPickE = entries.find(e=>(e.horseName||e.horse_name||'')===runnersNew[0].hName);
        const _newOdds  = parseFloat(_newPickE?.odds);
        if (!isNaN(_newOdds) && _newOdds > 0) {
          newRR.bet++;
          if (runnersNew[0].chaku===1) newRR.ret += _newOdds * 100;
        }
        // 1番人気を毎回買った場合の回収率（市場ベースライン比較用）
        const _favE = entries.find(e => parseInt(e.ninki) === 1);
        const _favOdds = parseFloat(_favE?.odds);
        if (_favE && !isNaN(_favOdds) && _favOdds > 0) {
          ninkiRR.bet++;
          if (parseInt(_favE.chakujun) === 1) ninkiRR.ret += _favOdds * 100;
        }

        // ◎が移籍初戦・デビュー馬でないレースのみを集計
        if (!runnersNew[0]._isTransferBT && !runnersNew[0]._isDebutBT) {
          noTransferS.t++;
          if (runnersNew[0].chaku===1) noTransferS.h1++;
          if (runnersNew[0].chaku<=3) noTransferS.h3++;
        } else {
          transferOnlyS.t++;
          if (runnersNew[0].chaku===1) transferOnlyS.h1++;
          if (runnersNew[0].chaku<=3) transferOnlyS.h3++;
        }

        // ── 新＋ペース補正（cornMod を ペース×馬場係数でスケールした場合の◎） ──
        const _btCond = raceVal.track_cond || raceVal.trackCond || '';
        const _btPace = predictRacePaceFromA4C(runnersNew.map(s => s._a4c), runnersNew.length);
        const _btFactor = getPaceBiasFactor(_getBtPaceMatrix(rdistNum), _btCond, _btPace);
        const runnersB = runnersNew
          .map(s => ({ chaku: s.chaku, _scratched: s._scratched, score: s.score + (s._cornN || 0) * (_btFactor - 1) }))
          .sort((a, b) => b.score - a.score);
        if (!runnersB[0]?._scratched) {
          newBS.t++;
          if (runnersB[0].chaku === 1) newBS.h1++;
          if (runnersB[0].chaku <= 3) newBS.h3++;
          // 補正が実際に効いた（係数が1から有意に外れた）レースのみを切り出して新と比較
          if (Math.abs(_btFactor - 1) >= 0.02) {
            pbActN.t++;
            if (runnersNew[0].chaku === 1) pbActN.n1++;
            if (runnersNew[0].chaku <= 3) pbActN.n3++;
            if (runnersB[0].chaku === 1)   pbActN.b1++;
            if (runnersB[0].chaku <= 3)    pbActN.b3++;
          }
        }

        // ◎の人気を追跡（穴馬判断力測定）
        const _hme = entries.find(e=>(e.horseName||e.horse_name||'')===runnersNew[0].hName);
        const _hnk = parseInt(_hme?.ninki)||0;
        const _bkt = _hnk===1?'top1':_hnk===2?'top2':_hnk>=3?'ana':null;
        if (_bkt) {
          ninkiS[_bkt].t++;
          if (runnersNew[0].chaku===1) ninkiS[_bkt].h1++;
          if (runnersNew[0].chaku<=3) ninkiS[_bkt].h3++;
        }

        // ○▲の集計（取消馬を除いた2位・3位）
        if (runnersNew.length >= 2) {
          circleS.t++;
          if (runnersNew[1].chaku===1) circleS.h1++;
          if (runnersNew[1].chaku<=3) circleS.h3++;
        }
        if (runnersNew.length >= 3) {
          sankakuS.t++;
          if (runnersNew[2].chaku===1) sankakuS.h1++;
          if (runnersNew[2].chaku<=3) sankakuS.h3++;
        }
        // ◎○▲いずれか1着
        top3S.t++;
        if (runnersNew.slice(0,3).some(s=>s.chaku===1)) top3S.hit++;

        detail.push({
          race: `${raceDate.slice(0,4)}/${raceDate.slice(4,6)}/${raceDate.slice(6,8)} ${rNo}R`,
          oldMark: runnersOld[0].hName, oldChaku: runnersOld[0].chaku,
          newMark: runnersNew[0].hName, newChaku: runnersNew[0].chaku,
          circleName: runnersNew[1]?.hName||'', circleChaku: runnersNew[1]?.chaku||0,
          sankakuName: runnersNew[2]?.hName||'', sankakuChaku: runnersNew[2]?.chaku||0,
          newNinki: _hnk,
          winner: winner?.horseName||'?'
        });
      }

      if (oldS.t < 3) {
        btDiv.innerHTML = '<p style="font-size:11px;color:#9ca3af;padding:8px 0">検証に十分なデータがありません（結果付きレースが3R以上必要）。</p>';
        btDiv._running = false;
        return;
      }

      // ── 係数スキャン ──
      const _scanScales = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
      const _scanParams = [
        { key:'agari',       label:'上がり3F' },
        { key:'trend',       label:'トレンド' },
        { key:'margin',      label:'着差' },
        { key:'corn',        label:'4コーナー' },
        { key:'jockeyChg',   label:'乗り替わり' },
        { key:'taki',        label:'叩き効果' },
        { key:'cornConsist', label:'C一貫性' },
      ];
      const scanResults = {};
      for (const { key } of _scanParams) {
        scanResults[key] = _scanScales.map(scale => {
          let _sh1=0, _st=0;
          for (const rc of scanData) {
            if (rc.length < 2) continue;
            const _sc = rc.map(c => ({
              chaku: c.chaku,
              score: c.base + c.condNew + c.distNew + c.rotN + c.clsN +
                (key==='corn'      ? c.cornN*scale      : c.cornN) +
                (key==='trend'     ? c.trendN*scale     : c.trendN) +
                c.weightN +
                (key==='agari'     ? c.agariN*scale     : c.agariN) +
                c.comboN +
                (key==='margin'    ? c.marginN*scale    : c.marginN) +
                c.winStrN +
                (key==='jockeyChg'   ? c.jockeyChgN*scale   : c.jockeyChgN) +
                (key==='taki'        ? c.takiN*scale        : c.takiN) +
                (key==='cornConsist' ? c.cornConsistN*scale : c.cornConsistN) +
                (c.rakuN||0)
            }));
            _sc.sort((a,b)=>b.score-a.score);
            _st++;
            if (_sc[0].chaku===1) _sh1++;
          }
          return { scale, wr: _st>0 ? (_sh1/_st*100).toFixed(1) : '—' };
        });
      }

      window._scanData = scanData; // デバッグ・分析用（PSF精査等でコンソールから利用）

      // ══════════ 市場アンカーモデル：恒久検証（2026-07-10新設） ══════════
      // 下の「厳密検証」5分割CVはtrain=全非テスト(日付順の走査ではない)という設計上の欠陥が残ったまま
      // （このコード自体の再設計はリスクが高く保留・監査メモ参照）。市場アンカーモデルは同じ轍を踏まないよう、
      // 完全に独立した「日付昇順のexpanding-window walk-forward」＋「最後は一度きりの完全未使用ホールドアウト」
      // で検証する。scanData(このバックテストの出力)を再利用し、二重計算はしない。
      let _offsetValHtml = '';
      try {
        const _ovSorted = [...scanData]
          .filter(rc => rc.length >= 2 && rc._fullOdds && rc.some(c => c.chaku === 1))
          .sort((a, b) => (a._date < b._date ? -1 : a._date > b._date ? 1 : (a._rno - b._rno)));
        if (_ovSorted.length >= 200) {
          // 【2026-07-11②】誤比較の再発防止（ユーザー指摘）：
          // 「現行」という曖昧なラベルが、実際には常に"旧・加算モデル(getMlLiveWeights)"を指しており、
          // 「16→12特徴量の効果」を検証しているつもりが「加算→市場アンカー化の効果」まで
          // 混ぜて比較してしまっていた（全期間再検証で◎複勝+4pt/回収-6.7ptと出たのは実際には
          // 市場アンカー化そのものの効果で、16→12の純粋な効果は+0.2pt/+0.9ptに過ぎなかった）。
          // 再発防止のため、比較は必ず「モデル系統(family)」を明示した3本立てにする：
          //   ①旧・加算モデル(additive・市場アンカー化前の基準) ②市場アンカー・16特徴量(アーキテクチャ基準)
          //   ③市場アンカー・検証中の特徴量候補(_ovFeats、現在は12項目)
          // ②③は同じfamily(market_offset)同士なので、この2つの差だけが「特徴量整理の純粋な効果」。
          const _ovFeats16 = ['base','condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN','marginN','winStrN','jockeyChgN','takiN','cornConsistN','rakuN'];
          const _ovFeats = ['base','distNew','clsN','cornN','trendN','weightN','agariN','comboN','marginN','jockeyChgN','cornConsistN','rotTakiN'];
          const _ovMktProbs = rc => {
            const invs = rc.map(c => c.odds > 0 ? 1 / c.odds : 0);
            const sum = invs.reduce((a, b) => a + b, 0);
            return invs.map(v => sum > 0 ? v / sum : 1 / rc.length);
          };
          // 条件付きロジット（オフセット固定・特徴量の係数だけ学習）。既存_mlTrainと同じ勾配上昇だが、
          // 各馬のスコアに market log-prob を固定オフセットとして足す点だけが違う。feats引数で
          // 特徴量セットを外から指定できるようにし、16特徴量版・候補版の両方に使い回す。
          const _ovTrain = (races, feats) => {
            const F = feats.length;
            const mean = new Array(F).fill(0), sd = new Array(F).fill(0);
            let n = 0;
            for (const rc of races) for (const c of rc) { n++; for (let f = 0; f < F; f++) mean[f] += c[feats[f]]; }
            for (let f = 0; f < F; f++) mean[f] /= n;
            for (const rc of races) for (const c of rc) for (let f = 0; f < F; f++) { const d = c[feats[f]] - mean[f]; sd[f] += d * d; }
            for (let f = 0; f < F; f++) { sd[f] = Math.sqrt(sd[f] / n); if (!sd[f]) sd[f] = 1; }
            const Z = races.map(rc => {
              const mkt = _ovMktProbs(rc);
              return {
                off: mkt.map(p => Math.log(Math.max(p, 1e-6))),
                X: rc.map(c => feats.map((k, f) => (c[k] - mean[f]) / sd[f])),
                win: rc.findIndex(c => c.chaku === 1),
              };
            });
            const w = new Array(F).fill(0);
            const LR = 1.0, L2 = 0.003, ITERS = 250;
            for (let it = 0; it < ITERS; it++) {
              const g = new Array(F).fill(0);
              for (const { X, win, off } of Z) {
                let mx = -Infinity;
                const sc = X.map((x, i) => { let s = off[i]; for (let f = 0; f < F; f++) s += x[f] * w[f]; if (s > mx) mx = s; return s; });
                let sum = 0;
                const ex = sc.map(s => { const e = Math.exp(s - mx); sum += e; return e; });
                for (let i = 0; i < X.length; i++) {
                  const coef = (i === win ? 1 : 0) - ex[i] / sum;
                  for (let f = 0; f < F; f++) g[f] += coef * X[i][f];
                }
              }
              for (let f = 0; f < F; f++) w[f] += LR * (g[f] / Z.length - L2 * w[f]);
            }
            return { w, mean, sd, feats, races: races.length, family: 'market_offset', featureCount: F };
          };
          const _ovPickOffset = (rc, m) => {
            const mkt = _ovMktProbs(rc);
            let bi = 0, bs = -Infinity;
            for (let i = 0; i < rc.length; i++) {
              let s = Math.log(Math.max(mkt[i], 1e-6));
              for (let f = 0; f < m.feats.length; f++) s += ((rc[i][m.feats[f]] - m.mean[f]) / m.sd[f]) * m.w[f];
              if (s > bs) { bs = s; bi = i; }
            }
            return bi;
          };
          // 旧・加算モデル(family=additive・市場アンカー化以前のtotalScoreロジック)。
          // 【重要】比較相手を選ぶ時、これを暗黙に「現行」と呼ばない。必ずfamilyを明示する。
          const _ovPickAdditive = rc => {
            const _cw = getMlLiveWeights();
            const _ef = k => (_cw && _cw.eff[k] != null) ? _cw.eff[k] : (YOSO_FACTOR_SCALE[k] != null ? YOSO_FACTOR_SCALE[k] : 1);
            let bi = 0, bs = -Infinity;
            for (let i = 0; i < rc.length; i++) {
              const c = rc[i];
              const s = c.base + c.condNew*_ef('condNew') + c.distNew*_ef('distNew') + c.trendN*_ef('trendN') + c.comboN*_ef('comboN') + c.rotN*_ef('rotN') + c.clsN*_ef('clsN') + c.cornN*_ef('cornN') + c.weightN*_ef('weightN') + c.agariN*_ef('agariN') + c.marginN*_ef('marginN') + c.winStrN*_ef('winStrN') + c.jockeyChgN*_ef('jockeyChgN') + c.takiN*_ef('takiN') + c.cornConsistN*_ef('cornConsistN') + (c.rakuN||0)*_ef('rakuN') + (c.paceCtxN||0)*_ef('paceCtxN');
              if (s > bs) { bs = s; bi = i; }
            }
            return bi;
          };
          const _ovEval = (set, pickFn) => {
            let h1 = 0, h3 = 0, t = 0, bet = 0, ret = 0;
            for (const rc of set) {
              if (rc.length < 2) continue;
              const bi = pickFn(rc);
              t++; if (rc[bi].chaku === 1) h1++; if (rc[bi].chaku <= 3) h3++;
              if (rc[bi].odds != null) { bet++; if (rc[bi].chaku === 1) ret += rc[bi].odds * 100; }
            }
            return { n: t, win: t ? +(100*h1/t).toFixed(1) : null, fuku: t ? +(100*h3/t).toFixed(1) : null, roi: bet ? +(ret/bet).toFixed(1) : null };
          };
          // 16特徴量オフセット vs 候補オフセットの◎一致率・不一致レースのみの成績（16→12の純粋な効果）
          const _ovAgreement = (set, m16, mC) => {
            let same = 0, diff = 0, hit16 = 0, hit12 = 0, bet16 = 0, ret16 = 0, betC = 0, retC = 0;
            for (const rc of set) {
              const b16 = _ovPickOffset(rc, m16), bC = _ovPickOffset(rc, mC);
              if (b16 === bC) { same++; continue; }
              diff++;
              if (rc[b16].chaku === 1) hit16++; if (rc[bC].chaku === 1) hit12++;
              if (rc[b16].odds != null) { bet16++; if (rc[b16].chaku===1) ret16 += rc[b16].odds*100; }
              if (rc[bC].odds != null) { betC++; if (rc[bC].chaku===1) retC += rc[bC].odds*100; }
            }
            return { same, diff, agreeRate: +(same/(same+diff)*100).toFixed(1),
              switched16: { n: diff, win: diff?+(100*hit16/diff).toFixed(1):null, roi: bet16?+(ret16/bet16).toFixed(1):null },
              switchedC: { n: diff, win: diff?+(100*hit12/diff).toFixed(1):null, roi: betC?+(retC/betC).toFixed(1):null } };
          };

          // ① 直近10%（最低50R）を完全ホールドアウト＝このセッション中は一度も学習に使わない
          const _holdN = Math.max(50, Math.round(_ovSorted.length * 0.10));
          const _preHold = _ovSorted.slice(0, _ovSorted.length - _holdN);
          const _holdSet = _ovSorted.slice(_ovSorted.length - _holdN);

          // ② pre-hold部分だけをexpanding-window walk-forwardでK-1分割検証（最初の1/Kは訓練専用）
          const K = 4;
          const _foldSize = Math.floor(_preHold.length / K);
          const _wfFolds = [];
          for (let k = 1; k < K; k++) {
            const testStart = k * _foldSize;
            const testEnd = (k === K - 1) ? _preHold.length : (k + 1) * _foldSize;
            const train = _preHold.slice(0, testStart);
            const test = _preHold.slice(testStart, testEnd);
            if (train.length < 100 || test.length < 20) continue;
            const m16 = _ovTrain(train, _ovFeats16);
            const mC = _ovTrain(train, _ovFeats);
            _wfFolds.push({
              k, n: test.length,
              additive: _ovEval(test, _ovPickAdditive),
              off16: _ovEval(test, rc => _ovPickOffset(rc, m16)),
              offC: _ovEval(test, rc => _ovPickOffset(rc, mC)),
              agree: _ovAgreement(test, m16, mC),
            });
          }

          // ③ ホールドアウト評価は一度きり：pre-hold全体で学習→holdoutで1回だけ評価
          const _holdModel16 = _ovTrain(_preHold, _ovFeats16);
          const _holdModelC = _ovTrain(_preHold, _ovFeats);
          const _holdAdditive = _ovEval(_holdSet, _ovPickAdditive);
          const _hold16 = _ovEval(_holdSet, rc => _ovPickOffset(rc, _holdModel16));
          const _holdC = _ovEval(_holdSet, rc => _ovPickOffset(rc, _holdModelC));
          const _holdAgree = _ovAgreement(_holdSet, _holdModel16, _holdModelC);

          // ④ 本番採用用：全データ(ホールドアウト含む)で最終学習した係数（検証中の特徴量候補で）
          const _finalModel = _ovTrain(_ovSorted, _ovFeats);

          window._offsetModelVal = {
            wfFolds: _wfFolds, holdAdditive: _holdAdditive, hold16: _hold16, holdC: _holdC,
            holdAgree: _holdAgree, holdN: _holdSet.length, finalModel: _finalModel,
          };

          const _wfRows = _wfFolds.map(f => `<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">fold${f.k}(N=${f.n})</td>
              <td style="padding:4px 6px;text-align:center">${f.additive.roi!=null?f.additive.roi+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${f.off16.roi!=null?f.off16.roi+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center;${(f.offC.roi!=null&&f.off16.roi!=null&&f.offC.roi>f.off16.roi)?'background:#dcfce7;font-weight:700;color:#15803d':''}">${f.offC.roi!=null?f.offC.roi+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.agree.agreeRate}%</td>
            </tr>`).join('');
          const _cWins = _wfFolds.filter(f => f.offC.fuku >= f.off16.fuku).length;
          const _canAdopt = _wfFolds.length > 0 && _cWins >= Math.ceil(_wfFolds.length * 0.75) && _holdC.fuku >= _hold16.fuku && _holdC.win >= _hold16.win;
          const _adoptBtn = (typeof isAdminMode === 'function' && isAdminMode())
            ? `<button type="button" onclick='saveOffsetModelWeights({trainedAt:new Date().toISOString(),races:${_ovSorted.length},feats:${JSON.stringify(_finalModel.feats)},w:${JSON.stringify(_finalModel.w)},mean:${JSON.stringify(_finalModel.mean)},sd:${JSON.stringify(_finalModel.sd)}});alert("市場アンカーモデルを更新しました（全${_ovSorted.length}R・${_finalModel.featureCount}特徴量で再学習）");' style="margin-top:6px;padding:5px 12px;background:${_canAdopt?'#7c3aed':'#94a3b8'};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">🧭 この結果で市場アンカーモデルを更新（${_finalModel.featureCount}特徴量）${_canAdopt?'（基準クリア）':'（基準未達・注意して判断）'}</button>`
            : '';
          _offsetValHtml = `<div style="font-size:12px;font-weight:800;color:#1a1a2e;margin-bottom:6px">🧭 現在のモデル評価（最新・最も信頼できる検証結果）</div>
          <div class="cv-verdict-card">
            <div class="cv-verdict-title">🧭 市場アンカーモデル 特徴量候補の検証</div>
            <div style="font-size:10px;color:#6b7280;margin-bottom:4px">
              A＝旧・加算モデル(family:additive) ／ B＝市場アンカー・16特徴量(family:market_offset, n=16, 参考基準) ／
              C＝市場アンカー・検証中の候補(family:market_offset, n=${_finalModel.featureCount}, feats=${_finalModel.feats.join(',')})
            </div>
            <div>ホールドアウト（直近${_holdSet.length}R・一度も学習に使っていない初見データ）：
              ◎勝率 A${_holdAdditive.win}%／B${_hold16.win}%／C${_holdC.win}%
              ◎複勝 A${_holdAdditive.fuku}%／B${_hold16.fuku}%／C${_holdC.fuku}%
              ◎単勝回収 A${_holdAdditive.roi??'—'}%／B${_hold16.roi??'—'}%／C${_holdC.roi??'—'}%
            </div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">B↔C の◎一致率：${_holdAgree.agreeRate}%（不一致${_holdAgree.diff}R）。
              A↔B（加算→市場アンカー化）の差と、B↔C（特徴量整理そのものの差）を混同しないこと。</div>
            <div class="cv-verdict-note">${_canAdopt ? '✅ B(16特徴量)よりCが複勝・勝率とも上回る＝特徴量整理として採用可' : '⚠️ 基準未達（walk-forward複勝勝ちfold ' + _cWins + '/' + _wfFolds.length + '・ホールドアウトは' + (_holdC.fuku>=_hold16.fuku?'○':'×') + '）'}</div>
          </div>
          <details class="cv-sec" style="margin-top:6px"><summary>🧭 walk-forward 各foldの詳細（◎単勝回収率＋B↔C一致率）</summary><div class="cv-sec-body">
            <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
              <thead><tr style="background:#1a1a2e;color:#fff">
                <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">A 加算(回収)</th><th style="padding:4px 6px">B 16特徴量(回収)</th><th style="padding:4px 6px">C 候補(回収)</th><th style="padding:4px 6px">B↔C一致率</th>
              </tr></thead>
              <tbody>${_wfRows}</tbody>
            </table></div>
            <div style="font-size:10px;color:#374151;margin-top:5px">train=各foldのテスト開始日より前の全レースのみ（未来を混ぜない・オッズ判明レース限定N=${_ovSorted.length}）。Aは参考列（市場アンカー化そのものの効果を切り分けて見るため）。判定はB(16特徴量)とC(候補)の比較のみで行う。</div>
          </div></details>
          ${_adoptBtn}`;
        } else {
          _offsetValHtml = `<div style="font-size:11px;color:#9ca3af;margin-top:8px">🧭 市場アンカーモデル検証：オッズ判明レースが${_ovSorted.length}件と少なく検証をスキップしました（200件以上で実行）。</div>`;
        }
      } catch (e) { console.warn('[offsetVal]', e); }

      // ── 時系列クロスバリデーション（過学習検出） ──
      // scanData を日付順で訓練70%/検証30%に分割。各補正の最適スケールを訓練で決め、
      // それが検証(未見データ)でも改善するか確認。改善しなければ「山」はノイズ＝過学習。
      const _cvSorted = [...scanData].sort((a,b) => (a._date<b._date?-1:a._date>b._date?1:0));
      const _cvSplit  = Math.floor(_cvSorted.length * 0.7);
      const _cvTrain  = _cvSorted.slice(0, _cvSplit);
      const _cvTest   = _cvSorted.slice(_cvSplit);
      const _cvScore = (c, key, scale) =>
        c.base + c.condNew + c.distNew + c.rotN + c.clsN +
        (key==='corn'?c.cornN*scale:c.cornN) + (key==='trend'?c.trendN*scale:c.trendN) + c.weightN +
        (key==='agari'?c.agariN*scale:c.agariN) + c.comboN + (key==='margin'?c.marginN*scale:c.marginN) +
        c.winStrN + (key==='jockeyChg'?c.jockeyChgN*scale:c.jockeyChgN) + (key==='taki'?c.takiN*scale:c.takiN) +
        (key==='cornConsist'?c.cornConsistN*scale:c.cornConsistN) + (c.rakuN||0);
      const _cvWinRate = (set, key, scale) => {
        let h=0, t=0;
        for (const rc of set) {
          if (rc.length<2) continue;
          const s = rc.map(c=>({chaku:c.chaku, score:_cvScore(c,key,scale)})).sort((a,b)=>b.score-a.score);
          t++; if (s[0].chaku===1) h++;
        }
        return t ? h/t*100 : 0;
      };
      window._cvResult = { trainN:_cvTrain.length, testN:_cvTest.length, factors:[] };
      let _cvRows = '';
      for (const { key, label } of _scanParams) {
        let bestScale=1.0, bestWr=-1;
        for (const sc of _scanScales) { const wr=_cvWinRate(_cvTrain,key,sc); if(wr>bestWr){bestWr=wr;bestScale=sc;} }
        const testBase = _cvWinRate(_cvTest, key, 1.0);
        const testBest = _cvWinRate(_cvTest, key, bestScale);
        const gen = testBest > testBase + 0.001;
        window._cvResult.factors.push({ label, bestScale, trainWr:+bestWr.toFixed(1), testBase:+testBase.toFixed(1), testBest:+testBest.toFixed(1), generalizes: gen });
        const verdict = bestScale===1.0 ? '<span style="color:#6b7280">現状維持</span>'
          : gen ? '<span style="color:#15803d;font-weight:700">✅汎化</span>'
          : '<span style="color:#dc2626;font-weight:700">❌過学習</span>';
        _cvRows += `<tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:4px 8px;font-weight:600;color:#374151">${label}</td>
          <td style="padding:4px 8px;text-align:center">×${bestScale.toFixed(2)}</td>
          <td style="padding:4px 8px;text-align:center">${testBase.toFixed(1)}%</td>
          <td style="padding:4px 8px;text-align:center;${gen?'background:#dcfce7;font-weight:700;color:#15803d':''}">${testBest.toFixed(1)}%</td>
          <td style="padding:4px 8px;text-align:center">${verdict}</td>
        </tr>`;
      }

      // ── 旧5分割参考検証（非厳密）: test以外を学習するため未来期間も混入 ──
      // 各foldで「訓練だけで乗替×着差の最適スケールを再導出→初見の検証foldで
      // 元係数モデル(default)・現行モデル(採用値)・再導出モデル(tuned)を比較」。
      // scanDataのmarginN=×1.5済/jockeyChgN=×0.5済なので、元係数は mg=2/3, jc=2.0 で復元。
      let _strictCvHtml = '';
      {
        const _scoreJM = (c, jc, mg) =>
          c.base + c.condNew + c.distNew + c.rotN + c.clsN + c.cornN + c.trendN + c.weightN +
          c.agariN + c.comboN + c.marginN*mg + c.winStrN + c.jockeyChgN*jc + c.takiN + c.cornConsistN + (c.rakuN||0);
        const _rate = (set, jc, mg, place) => {
          let h=0, t=0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const s = rc.map(c=>({chaku:c.chaku, score:_scoreJM(c,jc,mg)})).sort((a,b)=>b.score-a.score);
            t++; if (place ? s[0].chaku<=3 : s[0].chaku===1) h++;
          }
          return t ? 100*h/t : 0;
        };
        // ◎回収率（100円賭け想定）と、同じfold内の1番人気ベースライン回収率
        const _rrRate = (set, jc, mg) => {
          let bet=0, ret=0;
          for (const rc of set) {
            if (rc.length < 2 || !rc._fullOdds) continue;
            const s = rc.map(c=>({chaku:c.chaku, odds:c.odds, score:_scoreJM(c,jc,mg)})).sort((a,b)=>b.score-a.score);
            if (s[0].odds == null) continue;
            bet++; if (s[0].chaku===1) ret += s[0].odds*100;
          }
          return bet>0 ? ret/bet : null;
        };
        const _rrRateFav = set => {
          let bet=0, ret=0;
          for (const rc of set) {
            if (!rc._fullOdds) continue;
            const fav = rc.find(c => c.ninki === 1);
            if (!fav || fav.odds == null) continue;
            bet++; if (fav.chaku===1) ret += fav.odds*100;
          }
          return bet>0 ? ret/bet : null;
        };
        // ◎信頼度バッジのfold版：◎○のスコア差で断然/標準/接戦に分け、各層のfold別◎回収率・複勝率を見る
        // （ライブの信頼度バッジと同じ閾値：差<2.5=接戦／2.5〜6=標準／6以上=断然）
        const _confTier = gap => gap >= 6 ? 'strong' : gap < 2.5 ? 'tight' : 'mid';
        const _rrRateByTier = (set, jc, mg) => {
          const mk = () => ({ n:0, h3:0, bet:0, ret:0, h1:0 });
          const out = { strong: mk(), mid: mk(), tight: mk() };
          for (const rc of set) {
            if (rc.length < 2) continue;
            const s = rc.map(c=>({chaku:c.chaku, odds:c.odds, score:_scoreJM(c,jc,mg)})).sort((a,b)=>b.score-a.score);
            const tier = out[_confTier(s[0].score - s[1].score)];
            tier.n++;
            if (s[0].chaku <= 3) tier.h3++;
            if (rc._fullOdds && s[0].odds != null) {
              tier.bet++;
              if (s[0].chaku === 1) { tier.ret += s[0].odds * 100; tier.h1++; }
            }
          }
          return out;
        };
        // ── 学習重み実験（条件付きロジット・案1）──
        // 15特徴量（ベースSI＋14補正）の重みを各foldの訓練データだけで学習
        // （レース内softmaxで勝ち馬の尤度を最大化）し、初見のテストfoldで現行モデルと対決。
        // 採用基準（事前固定）: 複勝で5fold中4以上現行に勝ち、かつ1着平均が現行以上。
        const _mlFeats = ['base','condNew','distNew','rotN','clsN','cornN','trendN','weightN','agariN','comboN','marginN','winStrN','jockeyChgN','takiN','cornConsistN','rakuN'];
        const _mlTrain = races => {
          const F = _mlFeats.length;
          const usable = races.filter(rc => rc.length >= 2 && rc.some(c => c.chaku === 1));
          const mean = new Array(F).fill(0), sd = new Array(F).fill(0);
          let n = 0;
          for (const rc of usable) for (const c of rc) { n++; for (let f = 0; f < F; f++) mean[f] += c[_mlFeats[f]]; }
          for (let f = 0; f < F; f++) mean[f] /= n;
          for (const rc of usable) for (const c of rc) for (let f = 0; f < F; f++) { const d = c[_mlFeats[f]] - mean[f]; sd[f] += d * d; }
          for (let f = 0; f < F; f++) { sd[f] = Math.sqrt(sd[f] / n); if (!sd[f]) sd[f] = 1; }
          const Z = usable.map(rc => ({
            X: rc.map(c => _mlFeats.map((k, f) => (c[k] - mean[f]) / sd[f])),
            win: rc.findIndex(c => c.chaku === 1),
          }));
          const w = new Array(F).fill(0);
          const LR = 1.0, L2 = 0.003, ITERS = 250;
          for (let it = 0; it < ITERS; it++) {
            const g = new Array(F).fill(0);
            for (const { X, win } of Z) {
              let mx = -Infinity;
              const sc = X.map(x => { let s = 0; for (let f = 0; f < F; f++) s += x[f] * w[f]; if (s > mx) mx = s; return s; });
              let sum = 0;
              const ex = sc.map(s => { const e = Math.exp(s - mx); sum += e; return e; });
              for (let i = 0; i < X.length; i++) {
                const coef = (i === win ? 1 : 0) - ex[i] / sum;
                for (let f = 0; f < F; f++) g[f] += coef * X[i][f];
              }
            }
            for (let f = 0; f < F; f++) w[f] += LR * (g[f] / Z.length - L2 * w[f]);
          }
          return { w, mean, sd };
        };
        const _mlScore = (c, m) => { let s = 0; for (let f = 0; f < _mlFeats.length; f++) s += ((c[_mlFeats[f]] - m.mean[f]) / m.sd[f]) * m.w[f]; return s; };
        const _mlPick = (rc, m) => { let bi = 0, bs = -Infinity; for (let i = 0; i < rc.length; i++) { const s = _mlScore(rc[i], m); if (s > bs) { bs = s; bi = i; } } return bi; };
        const _mlRate = (set, m, place) => {
          let h = 0, t = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _mlPick(rc, m);
            t++; if (place ? rc[bi].chaku <= 3 : rc[bi].chaku === 1) h++;
          }
          return t ? 100 * h / t : 0;
        };
        const _mlRRf = (set, m) => {
          let bet = 0, ret = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _mlPick(rc, m);
            if (!rc._fullOdds || rc[bi].odds == null) continue;
            bet++; if (rc[bi].chaku === 1) ret += rc[bi].odds * 100;
          }
          return bet > 0 ? ret / bet : null;
        };

        // ── 妙味スライス（案2）：◎の人気帯・オッズ帯ごとの成績 ──
        // モデルと市場の意見が割れた◎（＝非1番人気）に回収率の妙味があるかを見る。
        // パラメータ適合なしの記述統計なので過学習の余地はない。
        // 注意：oddsは確定オッズ（前売りではない）。実際の購入時オッズとはズレる。
        const _valueSlices = set => {
          const mk = () => ({ n:0, bet:0, ret:0, h1:0, h3:0 });
          const out = { n1:mk(), n23:mk(), n4p:mk(), oLow:mk(), oMid:mk(), oHigh:mk() };
          for (const rc of set) {
            if (rc.length < 2) continue;
            let bi=0, bs=-Infinity;
            for (let i=0;i<rc.length;i++){ const s=_scoreJM(rc[i],1,1); if(s>bs){bs=s;bi=i;} }
            const p = rc[bi];
            // ROI(bet/ret)は全馬オッズ判明レースのみ（勝ち馬のみ補完＝生存者バイアス排除）。複勝率(h3)は全レース可
            const _roiOK = rc._fullOdds && p.odds!=null;
            const rec = o => { o.n++; if(p.chaku<=3)o.h3++; if(_roiOK){o.bet++; if(p.chaku===1){o.ret+=p.odds*100;o.h1++;}} };
            if (p.ninki===1) rec(out.n1);
            else if (p.ninki!=null && p.ninki<=3) rec(out.n23);
            else if (p.ninki!=null) rec(out.n4p);
            if (_roiOK) {
              if (p.odds<3) rec(out.oLow);
              else if (p.odds<10) rec(out.oMid);
              else rec(out.oHigh);
            }
          }
          return out;
        };

        // ── 馬基準差SI実験（固定変種・パラメータ適合なし）──
        // ベーススコアだけを馬アンカー方式SIに置き換え、他の補正は現行と完全共通。
        const _scoreAnch = c => _scoreJM(c, 1, 1) + ((c.baseA != null ? c.baseA : c.base) - c.base);
        const _pickAnch = rc => { let bi = 0, bs = -Infinity; for (let i = 0; i < rc.length; i++) { const s = _scoreAnch(rc[i]); if (s > bs) { bs = s; bi = i; } } return bi; };
        const _rateAnch = (set, place) => {
          let h = 0, t = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _pickAnch(rc);
            t++; if (place ? rc[bi].chaku <= 3 : rc[bi].chaku === 1) h++;
          }
          return t ? 100 * h / t : 0;
        };
        const _rrAnchF = set => {
          let bet = 0, ret = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _pickAnch(rc);
            if (!rc._fullOdds || rc[bi].odds == null) continue;
            bet++; if (rc[bi].chaku === 1) ret += rc[bi].odds * 100;
          }
          return bet > 0 ? ret / bet : null;
        };

        // ── 展開文脈補正実験（固定変種・パラメータ適合なし）──
        // 現行スコアに paceCtxN（逆境先行好走+0.5／ハイ限定差し好走−0.4）を足しただけの変種
        const _scorePctx = c => _scoreJM(c, 1, 1) + (c.paceCtxN || 0);
        const _pickPctx = rc => { let bi = 0, bs = -Infinity; for (let i = 0; i < rc.length; i++) { const s = _scorePctx(rc[i]); if (s > bs) { bs = s; bi = i; } } return bi; };
        const _ratePctx = (set, place) => {
          let h = 0, t = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _pickPctx(rc);
            t++; if (place ? rc[bi].chaku <= 3 : rc[bi].chaku === 1) h++;
          }
          return t ? 100 * h / t : 0;
        };
        const _rrPctxF = set => {
          let bet = 0, ret = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _pickPctx(rc);
            if (!rc._fullOdds || rc[bi].odds == null) continue;
            bet++; if (rc[bi].chaku === 1) ret += rc[bi].odds * 100;
          }
          return bet > 0 ? ret / bet : null;
        };

        // ── PSF対決（Claude設計指数 vs 現行・固定変種）──
        const _scorePsf = c => c.psfS != null ? c.psfS : -1e9;
        const _pickPsf = rc => { let bi = 0, bs = -Infinity; for (let i = 0; i < rc.length; i++) { const s = _scorePsf(rc[i]); if (s > bs) { bs = s; bi = i; } } return bi; };
        const _ratePsf = (set, place) => {
          let h = 0, t = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _pickPsf(rc);
            t++; if (place ? rc[bi].chaku <= 3 : rc[bi].chaku === 1) h++;
          }
          return t ? 100 * h / t : 0;
        };
        const _rrPsfF = set => {
          let bet = 0, ret = 0;
          for (const rc of set) {
            if (rc.length < 2) continue;
            const bi = _pickPsf(rc);
            if (!rc._fullOdds || rc[bi].odds == null) continue;
            bet++; if (rc[bi].chaku === 1) ret += rc[bi].odds * 100;
          }
          return bet > 0 ? ret / bet : null;
        };

        // ── ランキング品質指標（印全体の評価：◎だけでなく○▲△が正当か）──
        const _rankMetrics = (set, scorer) => {
          let races = 0, winCap3 = 0, hitCnt = 0, sanren = 0, pairsC = 0, pairsT = 0;
          const fuku = [0, 0, 0], fn = [0, 0, 0]; // ○▲△（2,3,4番手）の複勝
          for (const rc of set) {
            if (rc.length < 4) continue;
            const s = rc.map(c => ({ chaku: c.chaku, score: scorer(c) })).sort((a, b) => b.score - a.score);
            races++;
            const top3 = s.slice(0, 3);
            if (top3.some(x => x.chaku === 1)) winCap3++;
            const capt = top3.filter(x => x.chaku <= 3).length;
            hitCnt += capt;
            if (capt === 3) sanren++;
            for (let m = 0; m < 3; m++) { const p = s[m + 1]; if (p) { fn[m]++; if (p.chaku <= 3) fuku[m]++; } }
            for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
              if (s[i].chaku === s[j].chaku) continue;
              pairsT++;
              if (s[i].chaku < s[j].chaku) pairsC++;
            }
          }
          const pc = (a, b) => b > 0 ? +(100 * a / b).toFixed(1) : null;
          return {
            winCap3: pc(winCap3, races), sanren: pc(sanren, races),
            avgHit: races ? +(hitCnt / races).toFixed(2) : null,
            fuku2: pc(fuku[0], fn[0]), fuku3: pc(fuku[1], fn[1]), fuku4: pc(fuku[2], fn[2]),
            concord: pc(pairsC, pairsT),
          };
        };

        const _jcCand=[0.5,0.75,1.0,1.5,2.0], _mgCand=[0.5,0.75,1.0,1.5];
        // 評価（テストfold）はウォームスタート領域のみ：データ先頭のレースは参照履歴が薄く、
        // 全変種が実力と無関係に劣化して比較ノイズになる（実測：妙味セルROIがコールド期48.7%／
        // ウォーム期100.9%）。ライブ運用は常にウォーム条件なので、テストはウォーム領域から切る。
        // 訓練には全データを使う（過去情報としては有効）。全変種に対称に適用。
        const _CV_WARMUP = 400;
        const _cvEval = _cvSorted.length > _CV_WARMUP + 500 ? _cvSorted.slice(_CV_WARMUP) : _cvSorted;
        const K=5, N=_cvEval.length, blk=Math.floor(N/K), folds=[];
        for (let k=0;k<K;k++){
          const lo=k*blk, hi=(k===K-1?N:(k+1)*blk);
          const test=_cvEval.slice(lo,hi);
          const _testSet=new Set(test);
          const train=_cvSorted.filter(rc => !_testSet.has(rc));
          let bJc=1,bMg=1,bWr=-1;
          for(const jc of _jcCand)for(const mg of _mgCand){const wr=_rate(train,jc,mg,false); if(wr>bWr){bWr=wr;bJc=jc;bMg=mg;}}
          const _rrCur = _rrRate(test,1,1), _rrFav = _rrRateFav(test);
          // 学習重み：このfoldの訓練データだけで学習（テストは完全初見）
          const _ml = _mlTrain(train);
          const _rrMl = _mlRRf(test, _ml);
          // 有効スケール＝現行×1.0と直接比較できる係数比（ベースSIの係数で正規化）
          const _wb = _ml.w[0] / _ml.sd[0];
          const mlEff = _wb > 0 ? _ml.w.map((wv, f) => +((wv / _ml.sd[f]) / _wb).toFixed(2)) : null;
          folds.push({
            k:k+1, n:test.length, bJc, bMg,
            origWin:+_rate(test,2.0,2/3,false).toFixed(1),  curWin:+_rate(test,1,1,false).toFixed(1),  tunedWin:+_rate(test,bJc,bMg,false).toFixed(1),
            origFuku:+_rate(test,2.0,2/3,true).toFixed(1),  curFuku:+_rate(test,1,1,true).toFixed(1),   tunedFuku:+_rate(test,bJc,bMg,true).toFixed(1),
            rrCur: _rrCur!=null?+_rrCur.toFixed(1):null, rrFav: _rrFav!=null?+_rrFav.toFixed(1):null,
            tierRR: _rrRateByTier(test, 1, 1),
            mlWin:+_mlRate(test,_ml,false).toFixed(1), mlFuku:+_mlRate(test,_ml,true).toFixed(1),
            rrMl: _rrMl!=null?+_rrMl.toFixed(1):null,
            mlTrainWin:+_mlRate(train,_ml,false).toFixed(1), curTrainWin:+_rate(train,1,1,false).toFixed(1),
            mlEff,
            valueSlices: _valueSlices(test),
            anchWin: +_rateAnch(test, false).toFixed(1),
            anchFuku: +_rateAnch(test, true).toFixed(1),
            rrAnchV: (() => { const v = _rrAnchF(test); return v != null ? +v.toFixed(1) : null; })(),
            pctxWin: +_ratePctx(test, false).toFixed(1),
            pctxFuku: +_ratePctx(test, true).toFixed(1),
            rrPctxV: (() => { const v = _rrPctxF(test); return v != null ? +v.toFixed(1) : null; })(),
            rmCur: _rankMetrics(test, c => _scoreJM(c, 1, 1)),
            rmPctx: _rankMetrics(test, _scorePctx),
            rmAnch: _rankMetrics(test, _scoreAnch),
            rmPsf: _rankMetrics(test, _scorePsf),
            rmMl: _rankMetrics(test, c => _mlScore(c, _ml)),  // 学習重みの印全体品質（二段目検証）
            psfWin: +_ratePsf(test, false).toFixed(1),
            psfFuku: +_ratePsf(test, true).toFixed(1),
            rrPsfV: (() => { const v = _rrPsfF(test); return v != null ? +v.toFixed(1) : null; })(),
          });
        }
        const _avg=key=>+(folds.reduce((s,x)=>s+x[key],0)/folds.length).toFixed(1);
        const _rrFolds = folds.filter(f=>f.rrCur!=null && f.rrFav!=null);
        const _rrAvgCur = _rrFolds.length ? +(_rrFolds.reduce((s,f)=>s+f.rrCur,0)/_rrFolds.length).toFixed(1) : null;
        const _rrAvgFav = _rrFolds.length ? +(_rrFolds.reduce((s,f)=>s+f.rrFav,0)/_rrFolds.length).toFixed(1) : null;
        const _rrWinsFolds = _rrFolds.filter(f=>f.rrCur>f.rrFav).length;
        // 信頼度層別の集計（全fold合算＝サンプル数を確保。fold単位の頑健性も別途見る）
        const _tierLabel = { strong:'断然帯(差≥6)', mid:'標準帯(2.5〜6)', tight:'接戦帯(<2.5)' };
        const tierRR = {};
        for (const tk of ['strong','mid','tight']) {
          const totalN   = folds.reduce((s,f)=>s+f.tierRR[tk].n,   0);
          const totalBet = folds.reduce((s,f)=>s+f.tierRR[tk].bet, 0);
          const totalRet = folds.reduce((s,f)=>s+f.tierRR[tk].ret, 0);
          const totalH1  = folds.reduce((s,f)=>s+f.tierRR[tk].h1,  0);
          const totalH3  = folds.reduce((s,f)=>s+f.tierRR[tk].h3,  0);
          const foldsWithBet  = folds.filter(f=>f.tierRR[tk].bet>0);
          const foldsAboveFav = foldsWithBet.filter(f=>f.rrFav!=null && (f.tierRR[tk].ret/f.tierRR[tk].bet) > f.rrFav).length;
          tierRR[tk] = {
            label: _tierLabel[tk], n: totalN, bet: totalBet,
            fuku: totalN>0 ? +(100*totalH3/totalN).toFixed(1) : null,
            win:  totalBet>0 ? +(100*totalH1/totalBet).toFixed(1) : null,
            roi:  totalBet>0 ? +(totalRet/totalBet).toFixed(1) : null,
            foldsAboveFav, foldsWithBet: foldsWithBet.length,
          };
        }
        // 妙味スライスの集計（全fold合算＋fold頑健性）
        const _vsLabel = { n1:'◎=1番人気（市場と一致）', n23:'◎=2〜3番人気', n4p:'◎=4番人気以下（大穴狙い）', oLow:'◎オッズ3倍未満', oMid:'◎オッズ3〜10倍', oHigh:'◎オッズ10倍以上' };
        const value = {};
        for (const vk of Object.keys(_vsLabel)) {
          const totalN   = folds.reduce((s,f)=>s+f.valueSlices[vk].n,   0);
          const totalBet = folds.reduce((s,f)=>s+f.valueSlices[vk].bet, 0);
          const totalRet = folds.reduce((s,f)=>s+f.valueSlices[vk].ret, 0);
          const totalH1  = folds.reduce((s,f)=>s+f.valueSlices[vk].h1,  0);
          const totalH3  = folds.reduce((s,f)=>s+f.valueSlices[vk].h3,  0);
          const foldsWithBet  = folds.filter(f=>f.valueSlices[vk].bet>0);
          const foldsAboveFav = foldsWithBet.filter(f=>f.rrFav!=null && (f.valueSlices[vk].ret/f.valueSlices[vk].bet) > f.rrFav).length;
          value[vk] = {
            label: _vsLabel[vk], n: totalN, bet: totalBet,
            fuku: totalN>0 ? +(100*totalH3/totalN).toFixed(1) : null,
            win:  totalBet>0 ? +(100*totalH1/totalBet).toFixed(1) : null,
            roi:  totalBet>0 ? +(totalRet/totalBet).toFixed(1) : null,
            foldsAboveFav, foldsWithBet: foldsWithBet.length,
          };
        }

        // 馬基準差SI実験の集計と判定（事前固定基準：複勝4/5以上 かつ 1着平均で現行以上）
        const _anchFukuWins = folds.filter(f => f.anchFuku > f.curFuku).length;
        const _anchWinWins  = folds.filter(f => f.anchWin  > f.curWin).length;
        const _anchRRFolds  = folds.filter(f => f.rrAnchV != null && f.rrCur != null);
        const _rrAvgAnch = _anchRRFolds.length ? +(_anchRRFolds.reduce((s, f) => s + f.rrAnchV, 0) / _anchRRFolds.length).toFixed(1) : null;
        const anch = {
          winAvg: _avg('anchWin'), fukuAvg: _avg('anchFuku'),
          fukuWins: _anchFukuWins, winWins: _anchWinWins, rrAvg: _rrAvgAnch,
          adopt: _anchFukuWins >= 4 && _avg('anchWin') >= _avg('curWin'),
        };

        // 展開文脈補正実験の集計と判定（事前固定基準：複勝4/5以上 かつ 1着平均で現行以上）
        const _pctxFukuWins = folds.filter(f => f.pctxFuku > f.curFuku).length;
        const _pctxWinWins  = folds.filter(f => f.pctxWin  > f.curWin).length;
        const _pctxRRFolds  = folds.filter(f => f.rrPctxV != null && f.rrCur != null);
        const _rrAvgPctx = _pctxRRFolds.length ? +(_pctxRRFolds.reduce((s, f) => s + f.rrPctxV, 0) / _pctxRRFolds.length).toFixed(1) : null;
        const paceCtx = {
          winAvg: _avg('pctxWin'), fukuAvg: _avg('pctxFuku'),
          fukuWins: _pctxFukuWins, winWins: _pctxWinWins, rrAvg: _rrAvgPctx,
          adopt: _pctxFukuWins >= 4 && _avg('pctxWin') >= _avg('curWin'),
        };

        // ランキング品質の集計（印全体の評価：変種が◎不変でも○▲△を改善していないか）
        const RM_KEYS = ['winCap3', 'sanren', 'avgHit', 'fuku2', 'fuku3', 'fuku4', 'concord'];
        const _rmAvg = (src, key) => { const vals = folds.map(f => f[src][key]).filter(v => v != null); return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(key === 'avgHit' ? 2 : 1) : null; };
        const _rmWins = (src, key) => folds.filter(f => f[src][key] != null && f.rmCur[key] != null && f[src][key] > f.rmCur[key]).length;
        const rank = { cur: {}, pctx: {}, anch: {}, psf: {}, ml: {}, pctxWins: {}, anchWins: {}, psfWins: {}, mlWins: {} };
        for (const _rk of RM_KEYS) {
          rank.cur[_rk]  = _rmAvg('rmCur', _rk);
          rank.pctx[_rk] = _rmAvg('rmPctx', _rk);
          rank.anch[_rk] = _rmAvg('rmAnch', _rk);
          rank.psf[_rk]  = _rmAvg('rmPsf', _rk);
          rank.ml[_rk]   = _rmAvg('rmMl', _rk);
          rank.pctxWins[_rk] = _rmWins('rmPctx', _rk);
          rank.anchWins[_rk] = _rmWins('rmAnch', _rk);
          rank.psfWins[_rk]  = _rmWins('rmPsf', _rk);
          rank.mlWins[_rk]   = _rmWins('rmMl', _rk);
        }

        // PSF対決の判定（仕様書v1.0の事前登録ルール）
        const _psfFukuWins = folds.filter(f => f.psfFuku > f.curFuku).length;
        const _psfWinWins  = folds.filter(f => f.psfWin  > f.curWin).length;
        const _psfRRFolds  = folds.filter(f => f.rrPsfV != null && f.rrCur != null);
        const _rrAvgPsf = _psfRRFolds.length ? +(_psfRRFolds.reduce((s, f) => s + f.rrPsfV, 0) / _psfRRFolds.length).toFixed(1) : null;
        const psf = {
          winAvg: _avg('psfWin'), fukuAvg: _avg('psfFuku'),
          fukuWins: _psfFukuWins, winWins: _psfWinWins, rrAvg: _rrAvgPsf,
          // 主判定（事前登録）：ペア整合率4/5以上 かつ ○▲複勝が平均で悪化しない
          primaryWin: rank.psfWins.concord >= 4 && rank.psf.fuku2 >= rank.cur.fuku2 && rank.psf.fuku3 >= rank.cur.fuku3,
          // 副判定：◎基準
          secondaryWin: _psfFukuWins >= 4 && _avg('psfWin') >= _avg('curWin'),
        };

        // 学習重み実験の集計と採用判定（基準は事前固定：複勝4/5以上 かつ 1着平均で現行以上）
        const _mlWinAvg = _avg('mlWin'), _mlFukuAvg = _avg('mlFuku');
        const _mlFukuWins = folds.filter(f => f.mlFuku > f.curFuku).length;
        const _mlWinWins  = folds.filter(f => f.mlWin  > f.curWin).length;
        const _mlRRFolds  = folds.filter(f => f.rrMl != null && f.rrCur != null);
        const _rrAvgMl = _mlRRFolds.length ? +(_mlRRFolds.reduce((s, f) => s + f.rrMl, 0) / _mlRRFolds.length).toFixed(1) : null;
        const _mlEffAvg = _mlFeats.map((k, f) => {
          const vals = folds.map(x => x.mlEff ? x.mlEff[f] : null).filter(v => v != null);
          return { key: k, eff: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null };
        });
        const _mlAdopt = _mlFukuWins >= 4 && _mlWinAvg >= _avg('curWin');
        // 二段目判定（アンカーSI採用時と同じ規律）：ペア整合率4/5以上 かつ ○▲複勝が平均で悪化しない
        const _mlRank2 = rank.mlWins.concord >= 4 && rank.ml.fuku2 >= rank.cur.fuku2 && rank.ml.fuku3 >= rank.cur.fuku3;
        const ml = {
          winAvg: _mlWinAvg, fukuAvg: _mlFukuAvg, fukuWins: _mlFukuWins, winWins: _mlWinWins,
          rrAvg: _rrAvgMl, effAvg: _mlEffAvg, adopt: _mlAdopt,
          rank2Pass: _mlRank2, fullAdopt: _mlAdopt && _mlRank2,  // 両段クリアで正式採用資格
          trainWinAvg: _avg('mlTrainWin'), curTrainWinAvg: _avg('curTrainWin'),
        };
        window._strictCV = {
          folds,
          origWin:_avg('origWin'), curWin:_avg('curWin'), tunedWin:_avg('tunedWin'),
          origFuku:_avg('origFuku'), curFuku:_avg('curFuku'), tunedFuku:_avg('tunedFuku'),
          curWinsFolds: folds.filter(f=>f.curWin>f.origWin).length,
          curFukuFolds: folds.filter(f=>f.curFuku>f.origFuku).length,
          rrAvgCur: _rrAvgCur, rrAvgFav: _rrAvgFav, rrWinsFolds: _rrWinsFolds, rrFoldsN: _rrFolds.length,
          tierRR, ml, value, anch, paceCtx, rank, psf,
        };

        // ── 🧠 ライブ用フル学習（自動保存は2026-07-10 一時停止中）──
        // 【停止理由】このCV自体に②コンボ/上がり集計の未来情報混入・①テスト期間より後のレースを
        // 学習に含む(walk-forward違反)・④同一データを繰り返し見て倍率を選ぶ多重検定、という
        // 複数の未解決の検証バグがあり、「二段基準クリア」の判定自体が信頼できない。
        // 検証基盤を修正するまで、ここで合格しても自動保存はしない（診断ログのみ・console確認用）。
        // 既存のKV_ML_WEIGHTS_DEFAULT／保存済みml_weights_31はそのまま維持（本番挙動は変えない）。
        // 再開する場合はsaveMlLiveWeights(...)のコメントアウトを解除する。
        try {
          if (ml.fullAdopt && typeof isAdminMode === 'function' && isAdminMode()) {
            const _mFull = _mlTrain(_cvSorted);
            const _wbF = _mFull.w[0] / _mFull.sd[0];
            if (_wbF > 0) {
              const _effF = {};
              _mlFeats.forEach((k, f) => { if (f > 0) _effF[k] = +((_mFull.w[f] / _mFull.sd[f]) / _wbF).toFixed(3); });
              // 信頼度バッジ用のML尺度閾値：手動スケールの帯比率（差<2.5／≥6）を分位マッチングで移植し、
              // ML採点でのギャップ分布から同じ比率になる境界を求める（＋帯別◎複勝の実測も保存）
              const _mlScoreEff = c => { let s = c.base; _mlFeats.forEach((k, f) => { if (f > 0) s += (c[k] || 0) * _effF[k]; }); return s; };
              const _manGaps = [], _mlGapRows = [];
              for (const rc of _cvEval) {   // 閾値もウォーム領域から導出（ライブ条件の分布に合わせる）
                if (rc.length < 2) continue;
                const man = rc.map(c => _scoreJM(c, 1, 1)).sort((a, b) => b - a);
                _manGaps.push(man[0] - man[1]);
                const m = rc.map(c => ({ chaku: c.chaku, sc: _mlScoreEff(c) })).sort((a, b) => b.sc - a.sc);
                _mlGapRows.push({ gap: m[0].sc - m[1].sc, h3: m[0].chaku <= 3 });
              }
              const _pTight = _manGaps.filter(g => g < 2.5).length / _manGaps.length;
              const _pStrong = _manGaps.filter(g => g >= 6).length / _manGaps.length;
              const _gSorted = _mlGapRows.map(r => r.gap).sort((a, b) => a - b);
              const _c1t = +_gSorted[Math.floor(_pTight * _gSorted.length)].toFixed(2);
              const _c2t = +_gSorted[Math.floor((1 - _pStrong) * _gSorted.length)].toFixed(2);
              const _fkT = pred => { const s = _mlGapRows.filter(pred); return s.length ? +(100 * s.filter(r => r.h3).length / s.length).toFixed(1) : null; };
              const tiers = { c1: _c1t, c2: _c2t, fukuTight: _fkT(r => r.gap < _c1t), fukuMid: _fkT(r => r.gap >= _c1t && r.gap < _c2t), fukuStrong: _fkT(r => r.gap >= _c2t), n: _mlGapRows.length };
              // 【一時停止中】saveMlLiveWeights({ eff: _effF, tiers, fullAdopt: true, races: _cvSorted.length, trainedAt: new Date().toISOString(),
              //   cv: { mlWin: ml.winAvg, mlFuku: ml.fukuAvg, curWin: _avg('curWin'), curFuku: _avg('curFuku'), concordWins: rank.mlWins.concord } });
              console.log('[mlWeights] 二段基準クリア（診断のみ・自動保存は停止中）', _effF, tiers);
            }
          }
        } catch(e) { console.warn('[mlWeights]', e); }
        const _sv = window._strictCV;
        const _mark = (a,b)=> a>b?`<span style="color:#15803d;font-weight:700">${a}</span>` : a<b?`<span style="color:#dc2626">${a}</span>` : `${a}`;
        // ── 判定サマリー（折りたたみを開かなくても結論が見えるように） ──
        const _pcv = v => v != null ? v + '%' : '—';
        const _mlR2Fails = [];
        if (rank.mlWins.concord < 4) _mlR2Fails.push(`ペア整合率${rank.mlWins.concord}/5`);
        if (!(rank.ml.fuku2 >= rank.cur.fuku2)) _mlR2Fails.push(`○複勝${_pcv(rank.ml.fuku2)}＜現行${_pcv(rank.cur.fuku2)}`);
        if (!(rank.ml.fuku3 >= rank.cur.fuku3)) _mlR2Fails.push(`▲複勝${_pcv(rank.ml.fuku3)}＜現行${_pcv(rank.cur.fuku3)}`);
        const _mlShort = ml.fullAdopt ? '✅ 二段基準クリア → 重みを保存（ライブ適用）'
          : ml.adopt ? `⏸ 採用保留：一段目(◎)✅・二段目(印全体)✗（${_mlR2Fails.join('・')}）`
          : ml.rank2Pass ? `⏸ 採用保留：二段目(印全体)✅・一段目(◎)✗（複勝${ml.fukuWins}/5）`
          : `❌ 見送り（複勝${ml.fukuWins}/5・1着${ml.winWins}/5）`;
        const _mlLiveNow = (typeof getMlLiveWeights === 'function' && getMlLiveWeights()) ? '🧠 学習重み適用中' : '手動等倍（従来式）';
        const _cvVerdictCard = `<div class="cv-verdict-card">
          <div class="cv-verdict-title">⚠ 旧5分割の参考値（非厳密・学習側に未来期間を含む／評価${_cvEval.length}R）</div>
          <div>🤖 学習重み：<b>${_mlShort}</b>　<span style="color:#64748b">／現在のライブ採点：${_mlLiveNow}</span></div>
          <div>💰 ◎単勝ROI <b>${_pcv(_rrAvgCur)}</b>（1番人気${_pcv(_rrAvgFav)}・勝ちfold ${_rrWinsFolds}/${_rrFolds.length}）　🎯 帯別：断然${_pcv(tierRR.strong.roi)}／標準${_pcv(tierRR.mid.roi)}／接戦${_pcv(tierRR.tight.roi)}</div>
          <div class="cv-verdict-note">この欄は旧実装の診断表示です。モデル採用判断には、別途保存したexpanding-window＋固定holdout結果を使用してください。</div>
        </div>`;
        _strictCvHtml = _cvVerdictCard + `<details style="font-size:10px;margin-top:6px">
          <summary style="cursor:pointer;color:#b45309;font-weight:700;margin-bottom:6px">⚠ 旧5分割参考検証（非厳密・未来学習混入あり）</summary>
          <details class="cv-sec"><summary>📊 現行係数 vs 元係数 <span class="cv-sum-verdict">— 現行が勝ったfold：1着${_sv.curWinsFolds}/5・複勝${_sv.curFukuFolds}/5</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">データを日付で5分割し、各回1つを初見の検証用に。元係数＝旧固定値／現行＝採用中の値（現在は中立×1.0）。<b>現行が元係数より高ければ緑</b>。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">元1着</th><th style="padding:4px 6px">現1着</th><th style="padding:4px 6px">元複勝</th><th style="padding:4px 6px">現複勝</th>
            </tr></thead>
            <tbody>${folds.map(f=>`<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.k}(N=${f.n})</td>
              <td style="padding:4px 6px;text-align:center">${f.origWin}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.curWin,f.origWin)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.origFuku}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.curFuku,f.origFuku)}%</td>
            </tr>`).join('')}
            <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
              <td style="padding:5px 6px;text-align:center">平均</td>
              <td style="padding:5px 6px;text-align:center">${_sv.origWin}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(_sv.curWin,_sv.origWin)}%</td>
              <td style="padding:5px 6px;text-align:center">${_sv.origFuku}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(_sv.curFuku,_sv.origFuku)}%</td>
            </tr></tbody>
          </table></div>
          <div style="font-size:10px;color:#374151;margin-top:5px;line-height:1.6">初見データで現行が元係数に勝ったfold：<b>1着 ${_sv.curWinsFolds}/5・複勝 ${_sv.curFukuFolds}/5</b>。${_sv.curFukuFolds>=4?'<b style="color:#15803d">→ 複勝で頑健に汎化＝再最適化は本物</b>':'<span style="color:#dc2626">→ 汎化が弱い。要再考</span>'}</div>
          </div></details>
          <details class="cv-sec"><summary>💰 ◎単勝回収率 vs 1番人気 <span class="cv-sum-verdict">— ◎${_pcv(_rrAvgCur)}／人気${_pcv(_rrAvgFav)}（勝ちfold ${_rrWinsFolds}/${_rrFolds.length}）</span></summary><div class="cv-sec-body">
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">1番人気回収率</th><th style="padding:4px 6px">新◎回収率</th>
            </tr></thead>
            <tbody>${_rrFolds.map(f=>`<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.k}</td>
              <td style="padding:4px 6px;text-align:center">${f.rrFav}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.rrCur,f.rrFav)}%</td>
            </tr>`).join('')}
            <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
              <td style="padding:5px 6px;text-align:center">平均</td>
              <td style="padding:5px 6px;text-align:center">${_rrAvgFav}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(_rrAvgCur,_rrAvgFav)}%</td>
            </tr></tbody>
          </table></div>
          <div style="font-size:10px;color:#374151;margin-top:5px;line-height:1.6">初見データで新◎回収率が1番人気ベースラインに勝ったfold：<b>${_rrWinsFolds}/${_rrFolds.length}</b>。${_rrFolds.length>0 && _rrWinsFolds>=Math.ceil(_rrFolds.length*0.8)?'<b style="color:#15803d">→ 頑健に市場を上回る</b>':'<span style="color:#d97706">→ foldごとのブレが大きく、まだ確信は持てない（オッズ判明レースが少なくサンプル不足の可能性）</span>'}</div>
          </div></details>
          <details class="cv-sec"><summary>🎯 信頼度帯別・◎回収率 <span class="cv-sum-verdict">— 断然${_pcv(tierRR.strong.roi)}／標準${_pcv(tierRR.mid.roi)}／接戦${_pcv(tierRR.tight.roi)}</span></summary><div class="cv-sec-body">
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px;text-align:left">層</th><th style="padding:4px 6px">N（全fold合算）</th><th style="padding:4px 6px">複勝率</th><th style="padding:4px 6px">単勝回収率</th><th style="padding:4px 6px">1番人気超えfold</th>
            </tr></thead>
            <tbody>${['strong','mid','tight'].map(tk => { const t = tierRR[tk]; return `<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px">${t.label}</td>
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${t.n}</td>
              <td style="padding:4px 6px;text-align:center">${t.fuku!=null?t.fuku+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center;font-weight:700">${t.roi!=null?t.roi+'%':'—（オッズ判明レース不足）'}</td>
              <td style="padding:4px 6px;text-align:center">${t.foldsWithBet>0?`${t.foldsAboveFav}/${t.foldsWithBet}`:'—'}</td>
            </tr>`; }).join('')}</tbody>
          </table></div>
          <div style="font-size:10px;color:#374151;margin-top:5px;line-height:1.6">断然帯（◎○のスコア差6以上）のN・foldごとのオッズ判明数が十分か確認のうえで判断してください。層を細かく切るほどfold内サンプルは減り、ノイズも増えます。</div>
          </div></details>
          <details class="cv-sec"><summary>🤖 学習重み実験（条件付きロジット） <span class="cv-sum-verdict">— ${_mlShort}</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">15特徴量（ベースSI＋14補正）の重みを各foldの訓練データだけで機械学習し、初見のテストで現行モデルと比較。<b>採用基準（事前固定）：複勝で4/5以上勝ち かつ 1着平均が現行以上</b>。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">現1着</th><th style="padding:4px 6px">学習1着</th><th style="padding:4px 6px">現複勝</th><th style="padding:4px 6px">学習複勝</th><th style="padding:4px 6px">現ROI</th><th style="padding:4px 6px">学習ROI</th>
            </tr></thead>
            <tbody>${folds.map(f=>`<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.k}</td>
              <td style="padding:4px 6px;text-align:center">${f.curWin}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.mlWin,f.curWin)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.curFuku}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.mlFuku,f.curFuku)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.rrCur!=null?f.rrCur+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${f.rrMl!=null?_mark(f.rrMl,f.rrCur)+'%':'—'}</td>
            </tr>`).join('')}
            <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
              <td style="padding:5px 6px;text-align:center">平均</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curWin}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(ml.winAvg,_sv.curWin)}%</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curFuku}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(ml.fukuAvg,_sv.curFuku)}%</td>
              <td style="padding:5px 6px;text-align:center">${_rrAvgCur!=null?_rrAvgCur+'%':'—'}</td>
              <td style="padding:5px 6px;text-align:center">${ml.rrAvg!=null?_mark(ml.rrAvg,_rrAvgCur)+'%':'—'}</td>
            </tr></tbody>
          </table></div>
          <div style="margin-top:6px;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.7;${ml.adopt?'background:#f0fdf4;border:1px solid #86efac;color:#166534':'background:#f8fafc;border:1px solid #cbd5e1;color:#475569'}">
            ${ml.adopt
              ? (ml.fullAdopt
                ? `🤖 <b>判定：学習重みが二段基準を両方クリア＝正式採用資格</b> — 一段目（◎）：複勝 ${ml.fukuWins}/5・1着 ${ml.winWins}/5。二段目（📐印全体）：ペア整合率 ${rank.mlWins.concord}/5・○複勝 ${rank.ml.fuku2}%（現行${rank.cur.fuku2}%）・▲複勝 ${rank.ml.fuku3}%（現行${rank.cur.fuku3}%）。ライブモデルへの反映を検討できます。`
                : `🤖 <b>判定：一段目（◎基準）は合格・二段目（📐印全体）は未達で採用保留</b> — ◎：複勝 ${ml.fukuWins}/5・1着 ${ml.winWins}/5。📐：ペア整合率 ${rank.mlWins.concord}/5（基準4/5）・○複勝 ${rank.ml.fuku2!=null?rank.ml.fuku2+'%':'—'} vs 現行${rank.cur.fuku2!=null?rank.cur.fuku2+'%':'—'}・▲複勝 ${rank.ml.fuku3!=null?rank.ml.fuku3+'%':'—'} vs 現行${rank.cur.fuku3!=null?rank.cur.fuku3+'%':'—'}。上の📐表の🧠列に内訳。`)
              : `🤖 <b>判定：採用見送り</b> — 複勝で現行に勝ったfoldは ${ml.fukuWins}/5（基準4/5）、1着は ${ml.winWins}/5。学習訓練内1着 ${ml.trainWinAvg}%（現行 ${ml.curTrainWinAvg}%）。訓練内で勝っていて初見で勝てない場合は過学習、訓練内でも並ぶ場合は「手動重みが既に最適水準」の証拠。`}
          </div>
          <details style="margin-top:5px"><summary style="cursor:pointer;color:#6b7280;font-size:10px">学習された有効スケール（fold平均・現行×1.00との比較）</summary>
            <div style="overflow-x:auto;margin-top:4px"><table style="border-collapse:collapse;font-size:10px">
              <thead><tr style="background:#1a1a2e;color:#fff"><th style="padding:3px 8px;text-align:left">特徴量</th><th style="padding:3px 8px">学習スケール</th></tr></thead>
              <tbody>${(() => {
                const lbl = { base:'ベースSI', condNew:'馬場適性', distNew:'距離適性', rotN:'ローテ', clsN:'昇降級', cornN:'脚質(4C)', trendN:'トレンド', weightN:'馬体重', agariN:'上がり3F', comboN:'騎手×厩舎', marginN:'着差', winStrN:'勝ち馬強さ', jockeyChgN:'乗り替わり', takiN:'叩き2走目', cornConsistN:'C一貫性', rakuN:'前走楽勝' };
                return ml.effAvg.map(e => `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:3px 8px">${lbl[e.key]||e.key}</td><td style="padding:3px 8px;text-align:center;${e.eff!=null&&Math.abs(e.eff-1)>=0.5?'font-weight:700;color:#be185d':''}">${e.eff!=null?'×'+e.eff.toFixed(2):'—'}</td></tr>`).join('');
              })()}</tbody>
            </table></div>
            <div style="font-size:9px;color:#9ca3af;margin-top:3px">×1.00＝現行と同じ重み。ベースSIの係数で正規化した比。太字＝現行から±50%以上乖離。</div>
          </details>
          </div></details>
          <details class="cv-sec"><summary>💎 妙味検証（◎の人気帯・オッズ帯別ROI） <span class="cv-sum-verdict">— 2〜3人気${_pcv(value.n23.roi)}／4人気以下${_pcv(value.n4p.roi)}／3〜10倍${_pcv(value.oMid.roi)}</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">◎を「市場との一致度」で分けた成績。<b>非1番人気の◎の回収率が高ければ、モデル独自の眼に妙味がある</b>ことになる。注意：オッズは確定値（前売りではない）。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px;text-align:left">層</th><th style="padding:4px 6px">N</th><th style="padding:4px 6px">複勝率</th><th style="padding:4px 6px">単勝率</th><th style="padding:4px 6px">単勝回収率</th><th style="padding:4px 6px">1番人気超えfold</th>
            </tr></thead>
            <tbody>${['n1','n23','n4p','oLow','oMid','oHigh'].map((vk,i) => { const v = value[vk]; return `${i===3?'<tr><td colspan="6" style="padding:2px"></td></tr>':''}<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px">${v.label}</td>
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${v.n}</td>
              <td style="padding:4px 6px;text-align:center">${v.fuku!=null?v.fuku+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${v.win!=null?v.win+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center;font-weight:700;${v.roi!=null&&v.roi>=100?'color:#15803d;background:#f0fdf4':''}">${v.roi!=null?v.roi+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${v.foldsWithBet>0?`${v.foldsAboveFav}/${v.foldsWithBet}`:'—'}</td>
            </tr>`; }).join('')}</tbody>
          </table></div>
          <div style="font-size:10px;color:#374151;margin-top:5px;line-height:1.6">緑背景＝回収率100%超え。Nが小さい層（特に4番人気以下・10倍以上）は数レースの的中で数字が跳ねるので、fold頑健性（右列）とセットで判断すること。</div>
          </div></details>
          <details class="cv-sec"><summary>🧭 馬基準差SI実験 <span class="cv-sum-verdict">— ${anch.adopt?'✅基準クリア':'見送り'}（ベースSIに採用済みの方式・参考）</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">ベーススコアの馬場差補正だけを馬基準差（同一馬の自己比較）に置き換え、他の補正は現行と完全共通。パラメータ適合なしの固定変種。<b>◎基準は未達だったが、印全体のランキング品質（下の📐）で頑健な改善を示し、2026-07-02にライブモデルのベースSIへ採用済み</b>。この表の「現行」は採用前の旧構成。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">現1着</th><th style="padding:4px 6px">馬基準1着</th><th style="padding:4px 6px">現複勝</th><th style="padding:4px 6px">馬基準複勝</th><th style="padding:4px 6px">現ROI</th><th style="padding:4px 6px">馬基準ROI</th>
            </tr></thead>
            <tbody>${folds.map(f=>`<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.k}</td>
              <td style="padding:4px 6px;text-align:center">${f.curWin}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.anchWin,f.curWin)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.curFuku}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.anchFuku,f.curFuku)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.rrCur!=null?f.rrCur+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${f.rrAnchV!=null?_mark(f.rrAnchV,f.rrCur)+'%':'—'}</td>
            </tr>`).join('')}
            <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
              <td style="padding:5px 6px;text-align:center">平均</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curWin}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(anch.winAvg,_sv.curWin)}%</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curFuku}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(anch.fukuAvg,_sv.curFuku)}%</td>
              <td style="padding:5px 6px;text-align:center">${_rrAvgCur!=null?_rrAvgCur+'%':'—'}</td>
              <td style="padding:5px 6px;text-align:center">${anch.rrAvg!=null?_mark(anch.rrAvg,_rrAvgCur)+'%':'—'}</td>
            </tr></tbody>
          </table></div>
          <div style="margin-top:6px;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.7;${anch.adopt?'background:#f0fdf4;border:1px solid #86efac;color:#166534':'background:#f8fafc;border:1px solid #cbd5e1;color:#475569'}">
            ${anch.adopt
              ? `🧭 <b>判定：馬基準差SIが採用基準を満たしました</b>（複勝 ${anch.fukuWins}/5・1着 ${anch.winWins}/5で現行超え）。ライブモデルのSI補正への反映を検討できます。`
              : `🧭 <b>判定：採用見送り</b> — 複勝で現行に勝ったfoldは ${anch.fukuWins}/5（基準4/5）、1着は ${anch.winWins}/5。両方式の馬場差は大半の日でほぼ一致するため、◎の入れ替わり自体が少ない可能性もあります。データが増えたら自動で再判定されます。`}
          </div>
          </div></details>
          <details class="cv-sec"><summary>🌀 展開文脈補正実験 <span class="cv-sum-verdict">— ${paceCtx.adopt?'✅基準クリア':`❌見送り（複勝${paceCtx.fukuWins}/5）`}</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">直近3走に「基準比−0.6以下のハイ寄りを先行(1C3内)して3着内」→+0.5（逆境の地力）／「基準比−1.0以下のハイ限定で差し(1C6下)好走」→−0.4（展開ギフト割引）／「基準比−1.0以下のハイで先行して着外」→+0.4（ペース犠牲の免罪：次走複勝35.4% vs スロー潰れ27.7%のEDAより）。<b>採用基準（事前固定）：複勝で4/5以上勝ち かつ 1着平均が現行以上</b>。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">現1着</th><th style="padding:4px 6px">展開1着</th><th style="padding:4px 6px">現複勝</th><th style="padding:4px 6px">展開複勝</th><th style="padding:4px 6px">現ROI</th><th style="padding:4px 6px">展開ROI</th>
            </tr></thead>
            <tbody>${folds.map(f=>`<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.k}</td>
              <td style="padding:4px 6px;text-align:center">${f.curWin}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.pctxWin,f.curWin)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.curFuku}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.pctxFuku,f.curFuku)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.rrCur!=null?f.rrCur+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${f.rrPctxV!=null?_mark(f.rrPctxV,f.rrCur)+'%':'—'}</td>
            </tr>`).join('')}
            <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
              <td style="padding:5px 6px;text-align:center">平均</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curWin}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(paceCtx.winAvg,_sv.curWin)}%</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curFuku}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(paceCtx.fukuAvg,_sv.curFuku)}%</td>
              <td style="padding:5px 6px;text-align:center">${_rrAvgCur!=null?_rrAvgCur+'%':'—'}</td>
              <td style="padding:5px 6px;text-align:center">${paceCtx.rrAvg!=null?_mark(paceCtx.rrAvg,_rrAvgCur)+'%':'—'}</td>
            </tr></tbody>
          </table></div>
          <div style="margin-top:6px;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.7;${paceCtx.adopt?'background:#f0fdf4;border:1px solid #86efac;color:#166534':'background:#f8fafc;border:1px solid #cbd5e1;color:#475569'}">
            ${paceCtx.adopt
              ? `🌀 <b>判定：展開文脈補正が採用基準を満たしました</b>（複勝 ${paceCtx.fukuWins}/5・1着 ${paceCtx.winWins}/5で現行超え）。ライブモデルへの反映を検討できます。`
              : `🌀 <b>判定：採用見送り</b> — 複勝で現行に勝ったfoldは ${paceCtx.fukuWins}/5（基準4/5）、1着は ${paceCtx.winWins}/5。データが増えたら自動で再判定されます。`}
          </div>
          </div></details>
          <details class="cv-sec"><summary>📐 印全体の評価（🧠学習重み列はここ） <span class="cv-sum-verdict">— ペア整合率：学習${_pcv(rank.ml.concord)} vs 現行${_pcv(rank.cur.concord)}（${rank.mlWins.concord}/5）</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">◎的中だけでは変種の価値を見落とす（○▲△の改善が測れない）ため、印全体の質を比較。<b>ペア整合率</b>＝任意の2頭でスコア上位が実際に先着した割合（全馬が正当に評価される度合いの最直接指標）。緑＝現行より改善、括弧＝5fold中の勝ち数。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px;text-align:left">指標</th><th style="padding:4px 6px">現行</th><th style="padding:4px 6px">展開補正v2</th><th style="padding:4px 6px">馬基準SI</th><th style="padding:4px 6px">⚔PSF</th><th style="padding:4px 6px">🧠学習重み</th>
            </tr></thead>
            <tbody>${[
              ['winCap3', '勝ち馬が◎○▲内', '%'], ['sanren', '3連複（上位3頭=1-3着）', '%'], ['avgHit', '上位3頭の平均的中頭数', '頭'],
              ['fuku2', '○の複勝率', '%'], ['fuku3', '▲の複勝率', '%'], ['fuku4', '△の複勝率', '%'], ['concord', '全馬ペア整合率', '%'],
            ].map(([key, label, unit]) => `<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px">${label}</td>
              <td style="padding:4px 6px;text-align:center">${rank.cur[key] != null ? rank.cur[key] + unit : '—'}</td>
              <td style="padding:4px 6px;text-align:center">${rank.pctx[key] != null ? _mark(rank.pctx[key], rank.cur[key]) + unit + ` <span style="color:#9ca3af">(${rank.pctxWins[key]}/5)</span>` : '—'}</td>
              <td style="padding:4px 6px;text-align:center">${rank.anch[key] != null ? _mark(rank.anch[key], rank.cur[key]) + unit + ` <span style="color:#9ca3af">(${rank.anchWins[key]}/5)</span>` : '—'}</td>
              <td style="padding:4px 6px;text-align:center">${rank.psf[key] != null ? _mark(rank.psf[key], rank.cur[key]) + unit + ` <span style="color:#9ca3af">(${rank.psfWins[key]}/5)</span>` : '—'}</td>
              <td style="padding:4px 6px;text-align:center">${rank.ml[key] != null ? _mark(rank.ml[key], rank.cur[key]) + unit + ` <span style="color:#9ca3af">(${rank.mlWins[key]}/5)</span>` : '—'}</td>
            </tr>`).join('')}</tbody>
          </table></div>
          <div style="font-size:10px;color:#374151;margin-top:5px;line-height:1.6">◎が同じでも○▲△が改善する変種は「印の割り当て」への採用価値がある。ペア整合率と○▲複勝率が4/5以上のfoldで現行を上回っていれば頑健な改善。</div>
          </div></details>
          <details class="cv-sec"><summary>⚔ PSF対決（Claude設計指数 vs 現行） <span class="cv-sum-verdict">— ${psf.primaryWin?'PSF勝利（主判定）':psf.secondaryWin?'PSF勝利（副判定）':'現行の防衛'}</span></summary><div class="cv-sec-body">
          <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">PSF＝位置取り予測（1C・競合調整）を主役に、位置条件付き地力・実測勝率カーブ・コンボ/斤量/馬体重で構成（17項目→5部品）。定数は実測から凍結・fitなし。<b>主判定＝ペア整合率4/5以上かつ○▲複勝が悪化しない／副判定＝◎基準</b>。</div>
          <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
            <thead><tr style="background:#1a1a2e;color:#fff">
              <th style="padding:4px 6px">fold</th><th style="padding:4px 6px">現1着</th><th style="padding:4px 6px">PSF1着</th><th style="padding:4px 6px">現複勝</th><th style="padding:4px 6px">PSF複勝</th><th style="padding:4px 6px">現ROI</th><th style="padding:4px 6px">PSF ROI</th>
            </tr></thead>
            <tbody>${folds.map(f=>`<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:4px 6px;text-align:center;color:#6b7280">${f.k}</td>
              <td style="padding:4px 6px;text-align:center">${f.curWin}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.psfWin,f.curWin)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.curFuku}%</td>
              <td style="padding:4px 6px;text-align:center">${_mark(f.psfFuku,f.curFuku)}%</td>
              <td style="padding:4px 6px;text-align:center">${f.rrCur!=null?f.rrCur+'%':'—'}</td>
              <td style="padding:4px 6px;text-align:center">${f.rrPsfV!=null?_mark(f.rrPsfV,f.rrCur)+'%':'—'}</td>
            </tr>`).join('')}
            <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;font-weight:700">
              <td style="padding:5px 6px;text-align:center">平均</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curWin}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(psf.winAvg,_sv.curWin)}%</td>
              <td style="padding:5px 6px;text-align:center">${_sv.curFuku}%</td>
              <td style="padding:5px 6px;text-align:center">${_mark(psf.fukuAvg,_sv.curFuku)}%</td>
              <td style="padding:5px 6px;text-align:center">${_rrAvgCur!=null?_rrAvgCur+'%':'—'}</td>
              <td style="padding:5px 6px;text-align:center">${psf.rrAvg!=null?_mark(psf.rrAvg,_rrAvgCur)+'%':'—'}</td>
            </tr></tbody>
          </table></div>
          <div style="margin-top:6px;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.7;${(psf.primaryWin||psf.secondaryWin)?'background:#f0fdf4;border:1px solid #86efac;color:#166534':'background:#f8fafc;border:1px solid #cbd5e1;color:#475569'}">
            ${psf.primaryWin
              ? `⚔ <b>判定：PSFの勝利（主判定クリア）</b> — ペア整合率 ${rank.psfWins.concord}/5・○複勝 ${rank.psf.fuku2}%（現行${rank.cur.fuku2}%）・▲複勝 ${rank.psf.fuku3}%（現行${rank.cur.fuku3}%）。副判定（◎）：複勝${psf.fukuWins}/5・1着${psf.winWins}/5。`
              : psf.secondaryWin
                ? `⚔ <b>判定：PSFの勝利（副判定＝◎基準クリア）</b> — 複勝${psf.fukuWins}/5・1着平均${psf.winAvg}%≥現行。主判定（📐）は未達：ペア整合率${rank.psfWins.concord}/5。`
                : `⚔ <b>判定：現行の防衛</b> — 主判定：ペア整合率 ${rank.psfWins.concord}/5（基準4/5）・○複勝 ${rank.psf.fuku2!=null?rank.psf.fuku2+'%':'—'} vs 現行${rank.cur.fuku2!=null?rank.cur.fuku2+'%':'—'}。副判定（◎）：複勝${psf.fukuWins}/5・1着${psf.winWins}/5。上の📐表のPSF列に敗因の内訳。`}
          </div>
          </div></details>
        </details>`;
      }

      // CVで汎化した（＝本当に採用してよい）変更だけを抽出して推奨バナー化
      const _genFactors = window._cvResult.factors.filter(f => f.bestScale !== 1.0 && f.generalizes);
      const _cvRecommendHtml = _genFactors.length
        ? `<div style="margin:10px 0;padding:9px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:12px;color:#166534">
             🧪 <b>係数変更の推奨：${_genFactors.map(f=>`${f.label}×${f.bestScale.toFixed(2)}`).join('、')}</b>（CVで未見データでも改善を確認）</div>`
        : `<div style="margin:10px 0;padding:9px 12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;color:#475569">
             🧪 <b>係数変更の推奨：なし</b> — 全補正がクロスバリデーションで非汎化。<b>現在が最適点</b>です。下のスキャン表の緑「best」は<u>同一データ上の見かけの山（ノイズ）</u>なので追わないでください（適用すると未見データで悪化）。</div>`;
      const _cvHtml = `<details style="font-size:10px;margin-top:6px">
        <summary style="cursor:pointer;color:#7c3aed;font-weight:700;margin-bottom:6px">🧪 クロスバリデーション（訓練${_cvTrain.length}R→検証${_cvTest.length}R・過学習検出）</summary>
        <div style="font-size:10px;color:#6b7280;margin-bottom:5px;line-height:1.6">古い70%で各係数の最適スケールを決め、新しい30%（未見データ）で改善するか検証。<b style="color:#15803d">✅汎化</b>＝本物の改善／<b style="color:#dc2626">❌過学習</b>＝そのデータ限定のノイズ（採用禁物）。</div>
        <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px;width:100%">
          <thead><tr style="background:#1a1a2e;color:#fff">
            <th style="padding:4px 8px;text-align:left">補正項目</th>
            <th style="padding:4px 8px">訓練best</th>
            <th style="padding:4px 8px">検証:現行</th>
            <th style="padding:4px 8px">検証:適用</th>
            <th style="padding:4px 8px">判定</th>
          </tr></thead>
          <tbody>${_cvRows}</tbody>
        </table></div>
      </details>`;

      const pct = (n, t) => t>0 ? (n/t*100).toFixed(1)+'%' : '—';
      const _mc = (chaku) => chaku===1?'#15803d':chaku<=3?'#d97706':'#dc2626';
      const detailRows = detail.slice(-20).map(d => {
        const ninkiLabel = d.newNinki >= 3 ? `<span style="background:#fef3c7;color:#92400e;border-radius:3px;padding:0 3px;font-size:9px">${d.newNinki}人気</span>` : d.newNinki >= 1 ? `<span style="font-size:9px;color:#6b7280">${d.newNinki}人気</span>` : '';
        return `<tr style="border-bottom:1px solid #e2e8f0;font-size:10px;">
          <td style="padding:3px 6px;color:#6b7280">${d.race}</td>
          <td style="padding:3px 6px;color:#374151">🏆${d.winner}</td>
          <td style="padding:3px 6px;text-align:center;color:${_mc(d.oldChaku)};font-weight:700">${d.oldMark}<br><span style="font-size:9px">${d.oldChaku}着</span></td>
          <td style="padding:3px 6px;text-align:center;color:${_mc(d.newChaku)};font-weight:700">◎${d.newMark} ${ninkiLabel}<br><span style="font-size:9px">${d.newChaku}着</span></td>
          <td style="padding:3px 6px;text-align:center;color:${_mc(d.circleChaku)};font-size:10px">○${d.circleName}<br><span style="font-size:9px">${d.circleChaku}着</span></td>
          <td style="padding:3px 6px;text-align:center;color:${_mc(d.sankakuChaku)};font-size:10px">▲${d.sankakuName}<br><span style="font-size:9px">${d.sankakuChaku}着</span></td>
        </tr>`;
      }).join('');

      const ninkiRows = [
        ['1番人気◎', ninkiS.top1, '#15803d'],
        ['2番人気◎', ninkiS.top2, '#d97706'],
        ['3番人気以下◎ 🎯', ninkiS.ana, '#7c3aed'],
      ].map(([label, s, color]) => s.t > 0 ? `
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:5px 10px;font-size:11px;color:${color};font-weight:700">${label}</td>
          <td style="padding:5px 10px;text-align:center;font-size:12px;color:#374151">${s.t}R</td>
          <td style="padding:5px 10px;text-align:center;font-size:13px;font-weight:700;color:${color}">${pct(s.h1,s.t)}</td>
          <td style="padding:5px 10px;text-align:center;font-size:13px;font-weight:700;color:${color}">${pct(s.h3,s.t)}</td>
        </tr>` : '').join('');

      btDiv.innerHTML = `
        ${_offsetValHtml}
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-size:12px;font-weight:700;color:#6b7280;padding:4px 0">🗂 旧検証ログを見る（総合スコア方式時代の実験記録・普段は見なくてOK）</summary>
        <div style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">📈 精度バックテスト結果（高知・対象レース ${oldS.t}R）</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
            <thead><tr style="background:#1a1a2e;color:#fff;font-size:11px">
              <th style="padding:5px 8px;text-align:left"></th>
              <th style="padding:5px 8px;text-align:center">◎1着率</th>
              <th style="padding:5px 8px;text-align:center">◎複勝率</th>
              <th style="padding:5px 8px;text-align:center">○1着率</th>
              <th style="padding:5px 8px;text-align:center">○複勝率</th>
              <th style="padding:5px 8px;text-align:center">▲1着率</th>
              <th style="padding:5px 8px;text-align:center">▲複勝率</th>
              <th style="padding:5px 8px;text-align:center">◎○▲<br>いずれか1着</th>
            </tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid #e2e8f0">
                <td style="padding:6px 8px;font-size:11px;color:#6b7280">旧アルゴリズム</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:700;color:#374151">${pct(oldS.h1,oldS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:700;color:#374151">${pct(oldS.h3,oldS.t)}</td>
                <td colspan="5" style="padding:6px 8px;text-align:center;font-size:11px;color:#9ca3af">—</td>
              </tr>
              <tr>
                <td style="padding:6px 8px;font-size:11px;font-weight:700;color:#7c3aed">新アルゴリズム</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:${newS.h1>=oldS.h1?'#15803d':'#dc2626'}">${pct(newS.h1,newS.t)}${newS.h1>oldS.h1?' ▲':newS.h1<oldS.h1?' ▼':''}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:${newS.h3>=oldS.h3?'#15803d':'#dc2626'}">${pct(newS.h3,newS.t)}${newS.h3>oldS.h3?' ▲':newS.h3<oldS.h3?' ▼':''}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:700;color:#d97706">${pct(circleS.h1,circleS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:700;color:#d97706">${pct(circleS.h3,circleS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:700;color:#2563eb">${pct(sankakuS.h1,sankakuS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:700;color:#2563eb">${pct(sankakuS.h3,sankakuS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:#7c3aed">${pct(top3S.hit,top3S.t)}</td>
              </tr>
              <tr style="background:#faf5ff;border-top:1px solid #e9d5ff">
                <td style="padding:6px 8px;font-size:11px;font-weight:700;color:#7c3aed">新＋ペース補正<br><span style="font-size:9px;font-weight:400;color:#9ca3af">脚質補正をペース×馬場で伸縮</span></td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:${newBS.h1>=newS.h1?'#15803d':'#dc2626'}">${pct(newBS.h1,newBS.t)}${newBS.h1>newS.h1?' ▲':newBS.h1<newS.h1?' ▼':''}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:${newBS.h3>=newS.h3?'#15803d':'#dc2626'}">${pct(newBS.h3,newBS.t)}${newBS.h3>newS.h3?' ▲':newBS.h3<newS.h3?' ▼':''}</td>
                <td colspan="5" style="padding:6px 8px;text-align:center;font-size:10px;color:#9ca3af">対 新アルゴリズム（◎のみ比較）</td>
              </tr>
              <tr style="background:#f0fdf4;border-top:1px solid #bbf7d0">
                <td style="padding:6px 8px;font-size:11px;font-weight:700;color:#166534">◎が移籍初戦/デビュー馬でないレースのみ<br><span style="font-size:9px;font-weight:400;color:#9ca3af">新アルゴリズム・純粋な高知実績馬の◎のみ</span></td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:#166534">${pct(noTransferS.h1,noTransferS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:#166534">${pct(noTransferS.h3,noTransferS.t)}</td>
                <td colspan="5" style="padding:6px 8px;text-align:center;font-size:10px;color:#9ca3af">対象 ${noTransferS.t}R</td>
              </tr>
              <tr style="background:#fffbeb;border-top:1px solid #fde68a">
                <td style="padding:6px 8px;font-size:11px;font-weight:700;color:#92400e">◎が移籍初戦（推定スコア）だったレースのみ<br><span style="font-size:9px;font-weight:400;color:#9ca3af">転入馬フォールバック推定を◎に採用した回のみ</span></td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:#92400e">${pct(transferOnlyS.h1,transferOnlyS.t)}</td>
                <td style="padding:6px 8px;text-align:center;font-size:13px;font-weight:900;color:#92400e">${pct(transferOnlyS.h3,transferOnlyS.t)}</td>
                <td colspan="5" style="padding:6px 8px;text-align:center;font-size:10px;color:#9ca3af">対象 ${transferOnlyS.t}R（全${newS.t}R中）</td>
              </tr>
            </tbody>
          </table>
          <div style="font-size:11px;color:#374151;background:#faf5ff;border:1px solid #e9d5ff;border-radius:6px;padding:8px 10px;margin-bottom:10px;line-height:1.7">
            🎯 <strong>ペース補正が効いたレースのみ</strong>（ハイ/スロー予想＝係数≠1）：<strong>${pbActN.t}R</strong><br>
            ◎1着率 ${pct(pbActN.n1,pbActN.t)} → <strong style="color:${pbActN.b1>=pbActN.n1?'#15803d':'#dc2626'}">${pct(pbActN.b1,pbActN.t)}</strong>
            ／ ◎複勝率 ${pct(pbActN.n3,pbActN.t)} → <strong style="color:${pbActN.b3>=pbActN.n3?'#15803d':'#dc2626'}">${pct(pbActN.b3,pbActN.t)}</strong>
            <span style="color:#9ca3af">（補正なし→あり）</span>
          </div>
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">💰 単勝回収率（100円賭け想定・オッズ判明レースのみ）</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
            <thead><tr style="background:#1a1a2e;color:#fff;font-size:11px">
              <th style="padding:5px 8px;text-align:left"></th>
              <th style="padding:5px 8px;text-align:center">対象R</th>
              <th style="padding:5px 8px;text-align:center">回収率</th>
            </tr></thead>
            <tbody>
              ${(() => {
                const rr = o => o.bet>0 ? (o.ret/o.bet).toFixed(1)+'%' : '—';
                const rrColor = o => o.bet>0 && (o.ret/o.bet) >= 100 ? '#15803d' : '#dc2626';
                return `
              <tr style="border-bottom:1px solid #e2e8f0">
                <td style="padding:6px 8px;font-size:11px;color:#6b7280">1番人気を毎回単勝<br><span style="font-size:9px;color:#9ca3af">市場ベースライン</span></td>
                <td style="padding:6px 8px;text-align:center;font-size:12px;color:#374151">${ninkiRR.bet}R</td>
                <td style="padding:6px 8px;text-align:center;font-size:14px;font-weight:900;color:${rrColor(ninkiRR)}">${rr(ninkiRR)}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0">
                <td style="padding:6px 8px;font-size:11px;color:#6b7280">旧◎ 単勝</td>
                <td style="padding:6px 8px;text-align:center;font-size:12px;color:#374151">${oldRR.bet}R</td>
                <td style="padding:6px 8px;text-align:center;font-size:14px;font-weight:900;color:${rrColor(oldRR)}">${rr(oldRR)}</td>
              </tr>
              <tr>
                <td style="padding:6px 8px;font-size:11px;font-weight:700;color:#7c3aed">新◎ 単勝</td>
                <td style="padding:6px 8px;text-align:center;font-size:12px;color:#374151">${newRR.bet}R</td>
                <td style="padding:6px 8px;text-align:center;font-size:14px;font-weight:900;color:${rrColor(newRR)}">${rr(newRR)}</td>
              </tr>`;
              })()}
            </tbody>
          </table>
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">🎯 穴馬判断力（新◎の人気別成績）</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
            <thead><tr style="background:#f1f5f9;font-size:10px">
              <th style="padding:5px 10px;text-align:left"></th>
              <th style="padding:5px 10px;text-align:center">対象R</th>
              <th style="padding:5px 10px;text-align:center">1着率</th>
              <th style="padding:5px 10px;text-align:center">複勝率</th>
            </tr></thead>
            <tbody>${ninkiRows}</tbody>
          </table>
          ${_cvRecommendHtml}
          <details style="font-size:10px;margin-bottom:8px">
            <summary style="cursor:pointer;color:#1a56a0;font-weight:700;margin-bottom:6px">🔧 係数感度スキャン（◎1着率・<span style="color:#dc2626">緑=同一データ上の見かけの山。適用可否は上のCVで判断</span>）</summary>
            <div style="overflow-x:auto;margin-top:4px"><table style="border-collapse:collapse;font-size:10px">
              <thead><tr style="background:#1a1a2e;color:#fff">
                <th style="padding:4px 8px;text-align:left">補正項目</th>
                ${_scanScales.map(s=>`<th style="padding:4px 8px;text-align:center">${s===1.0?'<b>×1.00<br>（現在）</b>':`×${s.toFixed(2)}`}</th>`).join('')}
              </tr></thead>
              <tbody>${_scanParams.map(({key,label})=>{
                const row=scanResults[key];
                const best=row.reduce((a,b)=>parseFloat(b.wr)>parseFloat(a.wr)?b:a,row[0]);
                return `<tr style="border-bottom:1px solid #e2e8f0">
                  <td style="padding:4px 8px;font-weight:600;color:#374151">${label}</td>
                  ${row.map(r=>`<td style="padding:4px 8px;text-align:center;${r===best?'background:#dcfce7;font-weight:700;color:#15803d':r.scale===1.0?'background:#f1f5f9;color:#374151':''}">${r.wr}%</td>`).join('')}
                </tr>`;
              }).join('')}</tbody>
            </table></div>
          </details>
          ${_cvHtml}
          ${_strictCvHtml}
          <details style="font-size:10px;margin-top:6px">
            <summary style="cursor:pointer;color:#6b7280;margin-bottom:4px">🔍 乗り替わり診断</summary>
            <div style="padding:6px 8px;background:#fefce8;border:1px solid #fef08a;border-radius:4px;font-size:11px;color:#713f12">
              騎手なし(entry.jockey空): <b>${_jcDiag.noJockey}</b>件 ／
              同一騎手: <b>${_jcDiag.sameJockey}</b>件 ／
              差5%未満: <b>${_jcDiag.smallDiff}</b>件 ／
              <span style="color:#15803d">補正発火: <b>${_jcDiag.fired}</b>件</span>
            </div>
          </details>
          <details style="font-size:10px">
            <summary style="cursor:pointer;color:#6b7280;margin-bottom:4px">直近${Math.min(20,detail.length)}R 詳細</summary>
            <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f1f5f9;font-size:10px">
                <th style="padding:3px 6px;text-align:left">レース</th>
                <th style="padding:3px 6px;text-align:left">実際の勝馬</th>
                <th style="padding:3px 6px;text-align:center">旧◎</th>
                <th style="padding:3px 6px;text-align:center">新◎（人気）</th>
                <th style="padding:3px 6px;text-align:center">○対抗</th>
                <th style="padding:3px 6px;text-align:center">▲単穴</th>
              </tr></thead>
              <tbody>${detailRows}</tbody>
            </table></div>
          </details>
          <div style="text-align:right;margin-top:10px">
            <button id="_bt_copy_btn" style="font-size:11px;padding:4px 10px;background:#1a56a0;color:#fff;border:none;border-radius:4px;cursor:pointer">📋 結果コピー</button>
          </div>
        </div>
        </details>`;
      // コピーボタンのハンドラをセット
      const _copyBtn = btDiv.querySelector('#_bt_copy_btn');
      if (_copyBtn) {
        const _scanSummary = _scanParams.map(({key, label}) => {
          const row = scanResults[key];
          const best = row.reduce((a, b) => parseFloat(b.wr) > parseFloat(a.wr) ? b : a, row[0]);
          const cur = row.find(r => r.scale === 1.0);
          return `${label}: best=×${best.scale.toFixed(2)}(${best.wr}%) cur=${cur.wr}%`;
        }).join('\n');
        const _copyText = `◎1着=${pct(newS.h1,newS.t)} ◎複=${pct(newS.h3,newS.t)} 旧◎1着=${pct(oldS.h1,oldS.t)} 旧◎複=${pct(oldS.h3,oldS.t)} ${newS.t}R\n${_scanSummary}`;
        _copyBtn.onclick = () => navigator.clipboard.writeText(_copyText).then(() => {
          _copyBtn.textContent = '✅ コピー済';
          setTimeout(() => { _copyBtn.textContent = '📋 結果コピー'; }, 2000);
        });
      }
    } catch(e) {
      if (btDiv) btDiv.innerHTML = `<p style="font-size:11px;color:#dc2626;padding:8px 0">検証エラー: ${e.message}</p>`;
    }
    btDiv._running = false;
  }, 0);
}

// DataRoomの馬名検索・一括取得は modules/admin-horse-data.js を操作時に読み込む。
