'use strict';
// Order Flow tab: candles + ESTIMATED delta bubbles from Webull 5-min bars (not live L2). Read-only; never places orders.
const OF={charts:LS('charts')||[],cur:LS('chartCur')||null,hub:LS('hubTab')||'premarket',iv:LS('chartIv')||'5m',from:'',to:'',idx:null,msg:'',chart:null,ro:null,bars:{}};
const ofSave=()=>{LS('charts',OF.charts);LS('chartCur',OF.cur);LS('hubTab',OF.hub);LS('chartIv',OF.iv)};
const IVL={'1m':'1 min','5m':'5 min','15m':'15 min','1h':'1 hour','1d':'1 day'};
async function ofIdx(){if(OF.idx)return OF.idx;try{const r=await fetch(`../data/bars/index.json?t=${Date.now()}`,{cache:'no-store'});if(r.ok)OF.idx=await r.json()}catch(e){}return OF.idx}
const ptOff=s=>{const d=new Date(s*1000),p=new Date(d.toLocaleString('en-US',{timeZone:'America/Los_Angeles'})),u=new Date(d.toLocaleString('en-US',{timeZone:'UTC'}));return (p-u)/1000};
const estDelta=b=>{const[,o,h,l,c,v]=b;return h>l?v*(2*c-h-l)/(h-l):0};
function openChart(t){t=String(t).toUpperCase().trim();if(!t)return;OF.msg='';OF.from=OF.to='';if(!OF.charts.includes(t))OF.charts.push(t);OF.cur=t;ofSave();closeD();
  if(tab!=='flow'){tab='flow';LS('tab','flow');history.replaceState(null,'','#flow')}render();scrollTo(0,0)}
function flowView(){
  if(!OF.cur){const q=['premarket','intraday','afterhours'].flatMap(n=>(D[n]?.rows||[]).filter(r=>r.qualifies)).sort((a,b)=>b.pct-a.pct)[0]||D.premarket?.rows?.[0];if(q){OF.cur=q.t;if(!OF.charts.includes(q.t))OF.charts.push(q.t)}}
  const tabs=OF.charts.map(t=>`<span class="ct ${t===OF.cur?'on':''}" data-c="${t}">${t}<i data-cx="${t}">×</i></span>`).join('');
  setTimeout(drawFlow,0);
  return `<div class=ofwrap><div class=ofmain><div class=ctabs>${tabs||'<span class=mut>Pick a ticker from the Hub →</span>'}</div>
  <div class=ofctl><form id=ofsearch><input id=ofq list=ofsyms placeholder="Search ticker…" autocomplete=off autocapitalize=characters><datalist id=ofsyms></datalist><button>Open</button></form>
  <select id=ofiv>${Object.entries(IVL).map(([k,l])=>`<option value="${k}" ${k===OF.iv?'selected':''}>${l}</option>`).join('')}</select>
  <label>From <input type=date id=offrom value="${OF.from}"></label><label>To <input type=date id=ofto value="${OF.to}"></label><button id=ofall type=button>All</button></div>
  ${OF.msg?`<div class=ofmsg>${OF.msg}</div>`:''}<div class=ofhead id=ofhead></div><div id=ofchart class=ofchart><canvas id=ofbub></canvas></div>
  <div class=oflegend><span><i class=g></i>buyers (est. +delta)</span><span><i class=r></i>sellers (est. −delta)</span><span>bubble size = |delta|</span></div>
  <p class=ofnote><b>Estimated delta from bars</b> · delta ≈ volume×(2·close−high−low)/(high−low) on the selected bars (premarket, regular and after-hours; Yahoo Finance chart data). Refreshed on the scan schedule (about 6:07 AM, 8:13 AM, 2:17 PM PT) for screener tickers, your Webull watchlists and a core list, <b>not live Level 2</b>. History: 1m 2 days · 5m 10 days · 15m 1 month · 1h 6 months · 1D 2 years. Times in PT. Not investment advice.</p></div>
  <aside class=ofhub>${hubPanel()}</aside></div>`}
function hubPanel(){
  const segs=[['premarket','Pre'],['intraday','Intraday'],['afterhours','AH']].map(([k,l])=>`<button data-hub="${k}" class="${OF.hub===k?'on':''}">${l}</button>`).join('');
  const d=D[OF.hub],rs=(d?.rows||[]).slice().sort((a,b)=>(b.qualifies-a.qualifies)||b.pct-a.pct);
  const rows=rs.map(r=>{const f=r.filings||[];return `<tr class="hr ${r.t===OF.cur?'cur':''}" data-c="${r.t}"><td><b>${r.t}</b>${r.qualifies?' <span class="tag q">Q</span>':''}${r.dilution?' <span class="tag dil">dil</span>':''}</td><td>${pc(r.pct)}</td><td>${big(r.float)}</td><td>${r.rot==null?'?':r.rot.toFixed(1)+'x'}</td></tr>
   <tr class="hsub ${r.t===OF.cur?'cur':''}" data-c="${r.t}"><td colspan=4>${r.news?`<a href="${esc(r.news[1])}" target=_blank rel=noopener>${esc(r.news[0]).slice(0,110)}</a>`:'<span class=mut>no catalyst found</span>'}${f.length?`<br><span class=mut>Filings:</span> ${f.slice(0,3).map(x=>`<a href="${esc(x.url)}" target=_blank rel=noopener class="${x.dilution?'dilc':''}">${esc(x.form)} ${esc(x.date||'')}</a>`).join(' · ')}`:''}</td></tr>`}).join('');
  const nw=(D.news?.headlines||[]).slice(0,12).map(h=>`<div class=nw><div class=meta>${ptTime(h.ts)} · ${esc(h.src)} · ${esc(h.impact)}</div><a href="${esc(h.link)}" target=_blank rel=noopener>${esc(h.title)}</a></div>`).join('');
  return `<div class=hubh><b>Clutch Hub</b><small class=mut>${esc(d?.updated_pt||'')}</small></div><div class=seg>${segs}</div>
  <div class=hubt><table><tr><th>Ticker</th><th>%</th><th>Float</th><th>Rot</th></tr>${rows||'<tr><td colspan=4 class=mut>No rows.</td></tr>'}</table></div>
  <h2>Market news</h2>${D.news?`<div class=mut style="font-size:11px">Bias: <b>${esc(D.news.bias)}</b> · ${esc(D.news.tape||'')}</div>`:''}${nw}`}
async function drawFlow(){
  const el=$('#ofchart');if(!el||!OF.cur)return;const t=OF.cur,head=$('#ofhead');
  if(OF.chart){try{OF.chart.remove()}catch(e){}OF.chart=null}if(OF.ro){OF.ro.disconnect();OF.ro=null}
  if(typeof LightweightCharts==='undefined'){head.innerHTML='<span class=mut>Chart library failed to load.</span>';return}
  const iv=OF.iv,key=t+'|'+iv;let d=OF.bars[key];
  ofIdx().then(x=>{const dl=$('#ofsyms');if(x&&dl&&!dl.options.length)dl.innerHTML=Object.keys(x.symbols).map(k=>`<option value="${k}">`).join('')});
  if(!d){head.innerHTML=`<b>${t}</b> <span class=mut>loading ${IVL[iv]} bars…</span>`;try{const r=await fetch(`../data/bars/${t}/${iv}.json?t=${Date.now()}`,{cache:'no-store'});if(r.ok)d=OF.bars[key]=await r.json()}catch(e){}}
  if(OF.cur!==t||OF.iv!==iv||!$('#ofchart'))return;
  if(!d||!d.bars?.length){const x=await ofIdx(),has=x?.symbols?.[t];
    head.innerHTML=has?`<b>${t}</b> <span class=mut>No ${IVL[iv]} bars for ${t}. Available: ${Object.keys(has).map(k=>IVL[k]).join(', ')}.</span>`:
    `<b>${t}</b> <span class=ofmsg>No chart data for ${t} yet.</span> <span class=mut>This site is static, so charts cover today's screener tickers, your Webull watchlists (Float Rotators and the dated lists) and a core list (SPY, QQQ, TSLA, NVDA…). Add ${t} to a Webull watchlist and it's charted on the next scan.</span>`;return}
  let all=d.bars;const day=s=>new Date(s*1000).toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
  const f=$('#offrom'),g=$('#ofto');if(f){f.min=g.min=day(all[0][0]);f.max=g.max=day(all.at(-1)[0])}
  const B0=all.filter(b=>(!OF.from||day(b[0])>=OF.from)&&(!OF.to||day(b[0])<=OF.to));
  if(!B0.length){head.innerHTML=`<b>${t}</b> <span class=mut>No ${IVL[iv]} bars between those dates. Data covers ${day(all[0][0])} to ${day(all.at(-1)[0])}.</span>`;return}
  d={...d,bars:B0};
  const B=d.bars,isD=iv==='1d',off=isD?0:ptOff(B[B.length-1][0]),last=B[B.length-1],first=B.find(b=>b[0]>=B[B.length-1][0]-86400*1)||B[0];
  const dl=B.map(estDelta),tot=dl.reduce((a,b)=>a+b,0);
  head.innerHTML=`<b>${t}</b> $${last[4]} <span class=mut>${IVL[iv]} · ${day(B[0][0])} to ${day(B.at(-1)[0])} · ${B.length} bars · updated ${esc(d.updated_pt)}</span> · est. delta in view range <span class="${tot>=0?'up':'dn'}">${tot>=0?'+':''}${big(Math.round(Math.abs(tot)))}${tot<0?' sell':' buy'}</span>`;
  const ch=OF.chart=LightweightCharts.createChart(el,{autoSize:true,layout:{background:{color:'#0b0f14'},textColor:'#9fb0c3'},grid:{vertLines:{color:'#141b24'},horzLines:{color:'#141b24'}},
    timeScale:{timeVisible:!isD,secondsVisible:false,borderColor:'#1f2733'},rightPriceScale:{borderColor:'#1f2733'},crosshair:{mode:0}});
  const cs=ch.addCandlestickSeries({upColor:'#26a69a',downColor:'#ef5350',wickUpColor:'#26a69a',wickDownColor:'#ef5350',borderVisible:false});
  cs.setData(B.map(b=>({time:isD?day(b[0]):b[0]+off,open:b[1],high:b[2],low:b[3],close:b[4]})));
  const vs=ch.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'v'});ch.priceScale('v').applyOptions({scaleMargins:{top:.82,bottom:0}});
  vs.setData(B.map(b=>({time:isD?day(b[0]):b[0]+off,value:b[5],color:b[4]>=b[1]?'#26a69a55':'#ef535055'})));
  const n=B.length;if(OF.from||OF.to)ch.timeScale().fitContent();else ch.timeScale().setVisibleLogicalRange({from:Math.max(0,n-150),to:n+3});
  const cv=$('#ofbub'),ctx=cv.getContext('2d');
  const paint=()=>{const w=el.clientWidth,h=el.clientHeight,dpr=devicePixelRatio||1;cv.width=w*dpr;cv.height=h*dpr;cv.style.width=w+'px';cv.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const r=ch.timeScale().getVisibleLogicalRange();if(!r)return;const a=Math.max(0,Math.floor(r.from)),z=Math.min(n-1,Math.ceil(r.to));
    let mx=0;for(let i=a;i<=z;i++)mx=Math.max(mx,Math.abs(dl[i]));if(!mx)return;
    const sp=ch.timeScale().options().barSpacing,R=Math.max(6,Math.min(26,sp*2.2));
    for(let i=a;i<=z;i++){const q=Math.abs(dl[i])/mx;if(q<.08)continue;const x=ch.timeScale().timeToCoordinate(isD?day(B[i][0]):B[i][0]+off),y=cs.priceToCoordinate(B[i][4]);if(x==null||y==null)continue;
      const rad=2+R*Math.sqrt(q);ctx.beginPath();ctx.arc(x,y,rad,0,7);ctx.fillStyle=dl[i]>0?`rgba(0,200,83,${.25+.4*q})`:`rgba(255,23,68,${.25+.4*q})`;ctx.fill();
      ctx.lineWidth=1;ctx.strokeStyle=dl[i]>0?'#00e676':'#ff5252';ctx.stroke();
      if(rad>13){ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(big(Math.round(Math.abs(dl[i]))),x,y)}}};
  ch.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(paint));OF.ro=new ResizeObserver(()=>requestAnimationFrame(paint));OF.ro.observe(el);
  setTimeout(paint,60);
  ch.subscribeCrosshairMove(p=>{if(!p.time)return;const i=B.findIndex(b=>(isD?day(b[0]):b[0]+off)===p.time);if(i<0)return;const b=B[i];
    $('#ofhead').title=`O ${b[1]} H ${b[2]} L ${b[3]} C ${b[4]} V ${b[5]} est.delta ${Math.round(dl[i])}`})}
document.addEventListener('click',e=>{
  const x=e.target.closest('[data-cx]');if(x){e.stopPropagation();const t=x.dataset.cx;OF.charts=OF.charts.filter(c=>c!==t);if(OF.cur===t)OF.cur=OF.charts.at(-1)||null;ofSave();render();return}
  const h=e.target.closest('[data-hub]');if(h){e.stopPropagation();OF.hub=h.dataset.hub;ofSave();const a=$('.ofhub');if(a)a.innerHTML=hubPanel();return}
  const a=e.target.closest('a');if(a&&!a.dataset.c)return;
  const c=e.target.closest('[data-c]');if(c){e.preventDefault();e.stopPropagation();openChart(c.dataset.c)}},true);

document.addEventListener('submit',e=>{if(e.target.id==='ofsearch'){e.preventDefault();openChart($('#ofq').value)}});
document.addEventListener('change',e=>{const id=e.target.id;
  if(id==='ofiv'){OF.iv=e.target.value;ofSave();render()}else if(id==='offrom'||id==='ofto'){OF[id==='offrom'?'from':'to']=e.target.value;render()}});
document.addEventListener('click',e=>{if(e.target.id==='ofall'){OF.from=OF.to='';render()}});
