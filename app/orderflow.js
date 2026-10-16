'use strict';
// Order Flow tab: candles + ESTIMATED delta bubbles from Webull 5-min bars (not live L2). Read-only; never places orders.
const OF={charts:LS('charts')||[],cur:LS('chartCur')||null,hub:LS('hubTab')||'premarket',chart:null,ro:null,bars:{}};
const ofSave=()=>{LS('charts',OF.charts);LS('chartCur',OF.cur);LS('hubTab',OF.hub)};
const ptOff=s=>{const d=new Date(s*1000),p=new Date(d.toLocaleString('en-US',{timeZone:'America/Los_Angeles'})),u=new Date(d.toLocaleString('en-US',{timeZone:'UTC'}));return (p-u)/1000};
const estDelta=b=>{const[,o,h,l,c,v]=b;return h>l?v*(2*c-h-l)/(h-l):0};
function openChart(t){t=String(t).toUpperCase();if(!OF.charts.includes(t))OF.charts.push(t);OF.cur=t;ofSave();closeD();
  if(tab!=='flow'){tab='flow';LS('tab','flow');history.replaceState(null,'','#flow')}render();scrollTo(0,0)}
function flowView(){
  if(!OF.cur){const q=['premarket','intraday','afterhours'].flatMap(n=>(D[n]?.rows||[]).filter(r=>r.qualifies)).sort((a,b)=>b.pct-a.pct)[0]||D.premarket?.rows?.[0];if(q){OF.cur=q.t;if(!OF.charts.includes(q.t))OF.charts.push(q.t)}}
  const tabs=OF.charts.map(t=>`<span class="ct ${t===OF.cur?'on':''}" data-c="${t}">${t}<i data-cx="${t}">×</i></span>`).join('');
  setTimeout(drawFlow,0);
  return `<div class=ofwrap><div class=ofmain><div class=ctabs>${tabs||'<span class=mut>Pick a ticker from the Hub →</span>'}</div>
  <div class=ofhead id=ofhead></div><div id=ofchart class=ofchart><canvas id=ofbub></canvas></div>
  <div class=oflegend><span><i class=g></i>buyers (est. +delta)</span><span><i class=r></i>sellers (est. −delta)</span><span>bubble size = |delta|</span></div>
  <p class=ofnote><b>Estimated delta from bars</b> · delta ≈ volume×(2·close−high−low)/(high−low) on Webull 5-min bars (premarket, regular, after-hours; today + last session). Refreshed on the scan schedule (about 6:07 AM, 8:13 AM, 2:17 PM PT), <b>not live Level 2</b>. Times in PT. Not investment advice.</p></div>
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
  let d=OF.bars[t];
  if(!d){head.innerHTML=`<b>${t}</b> <span class=mut>loading bars…</span>`;try{const r=await fetch(`../data/bars/${t}.json?t=${Date.now()}`,{cache:'no-store'});if(r.ok)d=OF.bars[t]=await r.json()}catch(e){}}
  if(OF.cur!==t||!$('#ofchart'))return;
  if(!d||!d.bars?.length){head.innerHTML=`<b>${t}</b> <span class=mut>No bar data yet. Bars are saved for screener tickers on each scan.</span>`;return}
  const B=d.bars,off=ptOff(B[B.length-1][0]),last=B[B.length-1],first=B.find(b=>b[0]>=B[B.length-1][0]-86400*1)||B[0];
  const dl=B.map(estDelta),tot=dl.filter((x,i)=>B[i][0]>=first[0]).reduce((a,b)=>a+b,0);
  head.innerHTML=`<b>${t}</b> $${last[4]} <span class=mut>5m · ${esc(d.days.join(' & '))} · bars as of ${esc(d.updated_pt)}</span> · est. delta last 24h <span class="${tot>=0?'up':'dn'}">${tot>=0?'+':''}${big(Math.round(Math.abs(tot)))}${tot<0?' sell':' buy'}</span>`;
  const ch=OF.chart=LightweightCharts.createChart(el,{autoSize:true,layout:{background:{color:'#0b0f14'},textColor:'#9fb0c3'},grid:{vertLines:{color:'#141b24'},horzLines:{color:'#141b24'}},
    timeScale:{timeVisible:true,secondsVisible:false,borderColor:'#1f2733'},rightPriceScale:{borderColor:'#1f2733'},crosshair:{mode:0}});
  const cs=ch.addCandlestickSeries({upColor:'#26a69a',downColor:'#ef5350',wickUpColor:'#26a69a',wickDownColor:'#ef5350',borderVisible:false});
  cs.setData(B.map(b=>({time:b[0]+off,open:b[1],high:b[2],low:b[3],close:b[4]})));
  const vs=ch.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'v'});ch.priceScale('v').applyOptions({scaleMargins:{top:.82,bottom:0}});
  vs.setData(B.map(b=>({time:b[0]+off,value:b[5],color:b[4]>=b[1]?'#26a69a55':'#ef535055'})));
  const n=B.length;ch.timeScale().setVisibleLogicalRange({from:Math.max(0,n-120),to:n+3});
  const cv=$('#ofbub'),ctx=cv.getContext('2d');
  const paint=()=>{const w=el.clientWidth,h=el.clientHeight,dpr=devicePixelRatio||1;cv.width=w*dpr;cv.height=h*dpr;cv.style.width=w+'px';cv.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const r=ch.timeScale().getVisibleLogicalRange();if(!r)return;const a=Math.max(0,Math.floor(r.from)),z=Math.min(n-1,Math.ceil(r.to));
    let mx=0;for(let i=a;i<=z;i++)mx=Math.max(mx,Math.abs(dl[i]));if(!mx)return;
    const sp=ch.timeScale().options().barSpacing,R=Math.max(6,Math.min(26,sp*2.2));
    for(let i=a;i<=z;i++){const q=Math.abs(dl[i])/mx;if(q<.08)continue;const x=ch.timeScale().timeToCoordinate(B[i][0]+off),y=cs.priceToCoordinate(B[i][4]);if(x==null||y==null)continue;
      const rad=2+R*Math.sqrt(q);ctx.beginPath();ctx.arc(x,y,rad,0,7);ctx.fillStyle=dl[i]>0?`rgba(0,200,83,${.25+.4*q})`:`rgba(255,23,68,${.25+.4*q})`;ctx.fill();
      ctx.lineWidth=1;ctx.strokeStyle=dl[i]>0?'#00e676':'#ff5252';ctx.stroke();
      if(rad>13){ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(big(Math.round(Math.abs(dl[i]))),x,y)}}};
  ch.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(paint));OF.ro=new ResizeObserver(()=>requestAnimationFrame(paint));OF.ro.observe(el);
  setTimeout(paint,60);
  ch.subscribeCrosshairMove(p=>{if(!p.time)return;const i=B.findIndex(b=>b[0]+off===p.time);if(i<0)return;const b=B[i];
    $('#ofhead').title=`O ${b[1]} H ${b[2]} L ${b[3]} C ${b[4]} V ${b[5]} est.delta ${Math.round(dl[i])}`})}
document.addEventListener('click',e=>{
  const x=e.target.closest('[data-cx]');if(x){e.stopPropagation();const t=x.dataset.cx;OF.charts=OF.charts.filter(c=>c!==t);if(OF.cur===t)OF.cur=OF.charts.at(-1)||null;ofSave();render();return}
  const h=e.target.closest('[data-hub]');if(h){e.stopPropagation();OF.hub=h.dataset.hub;ofSave();const a=$('.ofhub');if(a)a.innerHTML=hubPanel();return}
  if(e.target.closest('a'))return;
  const c=e.target.closest('[data-c]');if(c){e.stopPropagation();openChart(c.dataset.c)}},true);
