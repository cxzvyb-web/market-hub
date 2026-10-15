'use strict';
const TABS=[['market','Market'],['premarket','Premarket'],['intraday','Intraday'],['afterhours','After-Hours'],['news','News & Filings'],['watch','★ Watchlist']];
const D={},$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS=(k,v)=>v===undefined?JSON.parse(localStorage.getItem('clutch.'+k)||'null'):localStorage.setItem('clutch.'+k,JSON.stringify(v));
let tab=(location.hash.slice(1)||LS('tab')||'market'),sort=LS('sort')||{k:'pct',a:false},newsSeg='all';
const F=Object.assign({maxFloat:50,minRot:2,minPct:0,hideDil:false,qualOnly:false,q:''},LS('filters')||{});
const W=new Set(LS('watch')||[]);
const pc=v=>v==null?'<span class=mut>n/a</span>':`<span class="${v>0?'up':v<0?'dn':''}">${v>0?'+':''}${v.toFixed(2)}%</span>`;
const big=v=>v==null?'?':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':String(v);
const ptTime=iso=>iso?new Date(iso).toLocaleString('en-US',{timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT':'?';

async function load(){
  $('#badge').textContent='refreshing…';
  await Promise.all(['market','premarket','intraday','afterhours','news'].map(async n=>{
    try{const r=await fetch(`../data/${n}.json?t=${Date.now()}`,{cache:'no-store'});if(r.ok)D[n]=await r.json()}catch(e){}}));
  const ts=Object.values(D).map(d=>d.updated).filter(Boolean).sort().pop();
  const b=$('#badge');b.textContent='Updated '+ptTime(ts);b.classList.toggle('stale',ts&&Date.now()-new Date(ts)>6*3600e3);
  render();
}
function navs(){$('#tabs').innerHTML=TABS.map(([k,l])=>`<button data-t="${k}" class="${k===tab?'on':''}">${l}</button>`).join('')}
$('#tabs').onclick=e=>{const t=e.target.dataset.t;if(t){tab=t;LS('tab',t);history.replaceState(null,'','#'+t);render();scrollTo(0,0)}};
$('#refresh').onclick=load;
function render(){navs();const v=$('#view');
  if(tab==='market')v.innerHTML=market();else if(tab==='news')v.innerHTML=news();else if(tab==='watch')v.innerHTML=watch();else v.innerHTML=screener(tab)}

function market(){const m=D.market;if(!m)return '<div class=empty>Market data unavailable.</div>';
  const cards=m.cards.map(c=>`<div class=card><div class=n>${esc(c.name)}</div><div class=p>${c.price==null?'<span class=mut>n/a</span>':c.price.toLocaleString(undefined,{maximumFractionDigits:2})}</div>${pc(c.pct)}${c.ext?`<div><small>ext ${esc(c.ext)} (${((c.ext/c.price-1)*100).toFixed(2)}%)</small></div>`:''}<div><small>${esc(c.src||'')} ${esc(c.time||'')}</small></div></div>`).join('');
  const heat=[...m.sectors].sort((a,b)=>(b.pct??-99)-(a.pct??-99)).map(s=>{const a=Math.min(Math.abs(s.pct||0)/2,1),col=s.pct==null?'#30363d':s.pct>=0?`rgba(46,160,67,${.25+.75*a})`:`rgba(248,81,73,${.25+.75*a})`;return `<div style="background:${col}"><b>${s.sym}</b><br>${esc(s.name)}<br>${s.pct==null?'n/a':(s.pct>0?'+':'')+s.pct.toFixed(2)+'%'}</div>`}).join('');
  const fg=m.fear_greed;const fgh=fg?`<div class=card><div class=fg><div><div class=n>Fear &amp; Greed (CNN)</div><div class=p>${fg.score} <small>${esc(fg.rating)}</small></div><small>prev close ${fg.prev}</small></div><div class=fgbar><i style="left:${fg.score}%"></i></div></div></div>`:'<div class="card mut">Fear &amp; Greed unavailable</div>';
  const bias=D.news?`<div class=card><div class=n>Daily bias (headline heuristic)</div><div class=p>${esc(D.news.bias)}</div><small>${D.news.bull} bullish vs ${D.news.bear} bearish headlines · ${esc(D.news.tape||'')}</small></div>`:'';
  const econ=(m.econ||[]).map(e=>`<div class=item><div class=meta>${esc(e[0])} · <span class=tag>${esc(e[3])}</span></div><a href="${esc(e[2])}" target=_blank rel=noopener>${esc(e[1])}</a></div>`).join('');
  const mv=(m.movers||[]).map(x=>`<tr class=r data-t="${x.t}"><td><b>${x.t}</b></td><td>${x.price}</td><td>${pc(x.pct)}</td></tr>`).join('');
  return `<div class=grid>${cards}</div><h2>Sentiment</h2><div class=grid style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${fgh}${bias}</div>
  <h2>Sector heatmap</h2><div class=heat>${heat}</div><p class=mut>Breadth: ${esc(m.breadth)}</p>
  <h2>Econ calendar</h2>${econ||'<div class=mut>none</div>'}<h2>Top premarket movers</h2><div class=tw><table><tr><th>Ticker</th><th>Price</th><th>%</th></tr>${mv}</table></div>`}

const COLS=[['star',''],['t','Ticker'],['price','Price'],['pct','% Chg'],['vol','Vol'],['float','Float'],['rot','Rotation'],['hr','Max 1h'],['news','Catalyst']];
function rowsFor(d){return (d?.rows||[]).filter(r=>(r.float||0)<=F.maxFloat*1e6&&(r.rot||0)>=F.minRot&&r.pct>=F.minPct&&!(F.hideDil&&r.dilution)&&!(F.qualOnly&&!r.qualifies)&&(!F.q||r.t.includes(F.q.toUpperCase())))}
function screener(n){const d=D[n];if(!d)return '<div class=empty>No data yet for this session.</div>';
  const rs=rowsFor(d).sort((a,b)=>{let x=a[sort.k],y=b[sort.k];if(sort.k==='news'){x=a.news?.[0]||'';y=b.news?.[0]||''}if(sort.k==='star'){x=W.has(a.t);y=W.has(b.t)}const r=typeof x==='string'?x.localeCompare(y):(x??-1e18)-(y??-1e18);return sort.a?r:-r});
  const flt=`<div class=filters><label>Search<input type=search data-f=q value="${esc(F.q)}" placeholder="Ticker"></label><label>Max float (M)<input type=number data-f=maxFloat value="${F.maxFloat}" step=1 min=0></label><label>Min rotation (x)<input type=number data-f=minRot value="${F.minRot}" step=0.5 min=0></label><label>Min % gain<input type=number data-f=minPct value="${F.minPct}" step=5></label><label class=chk><input type=checkbox data-f=hideDil ${F.hideDil?'checked':''}>Hide dilution-flagged</label><label class=chk><input type=checkbox data-f=qualOnly ${F.qualOnly?'checked':''}>Qualifiers only</label></div>`;
  const th=COLS.map(([k,l])=>`<th data-s="${k}" class="${sort.k===k?'s'+(sort.a?' a':''):''}">${l}</th>`).join('');
  const tb=rs.map(r=>`<tr class=r data-t="${r.t}"><td><button class="star ${W.has(r.t)?'on':''}" data-w="${r.t}">★</button></td><td><b>${r.t}</b> ${r.qualifies?'<span class="tag q">Q</span>':''}${r.dilution?'<span class="tag dil">dilution</span>':''}</td><td>${r.price}</td><td>${pc(r.pct)}</td><td>${big(r.vol)}</td><td>${big(r.float)}</td><td>${r.rot==null?'?':r.rot.toFixed(1)+'x'}</td><td>${r.hr==null?'?':r.hr.toFixed(1)+'x'}</td><td class=cat>${r.news?esc(r.news[0]):'<span class=mut>none found</span>'}</td></tr>`).join('');
  return `<p class=mut>${esc(d.label)} · ${esc(d.window)} · ${esc(d.rules)}</p>${flt}<div class=tw><table><thead><tr>${th}</tr></thead><tbody>${tb||`<tr><td colspan=9 class=empty>No names match these filters.</td></tr>`}</tbody></table></div><p class=mut>${rs.length} of ${d.rows.length} names (float &lt; 50M) · Q = meets 2x-rotation rule · tap a row for details</p>`}
document.addEventListener('input',e=>{const k=e.target.dataset.f;if(!k)return;F[k]=e.target.type==='checkbox'?e.target.checked:e.target.type==='number'?parseFloat(e.target.value)||0:e.target.value;LS('filters',F);
  const pos=e.target.selectionStart,f=k;render();const el=document.querySelector(`[data-f="${f}"]`);if(el){el.focus();if(el.type==='search')el.setSelectionRange(pos,pos)}});
document.addEventListener('click',e=>{
  const w=e.target.closest('[data-w]');if(w){e.stopPropagation();const t=w.dataset.w;W.has(t)?W.delete(t):W.add(t);LS('watch',[...W]);if($('#drawer').hidden)render();else{openT(t);render()}return}
  const s=e.target.closest('th[data-s]');if(s&&tab!=='market'){const k=s.dataset.s;sort=sort.k===k?{k,a:!sort.a}:{k,a:k==='t'};LS('sort',sort);render();return}
  const ns=e.target.closest('[data-n]');if(ns){newsSeg=ns.dataset.n;render();return}
  const r=e.target.closest('[data-t]');if(r&&!e.target.closest('nav')&&!e.target.closest('a'))openT(r.dataset.t);
  if(e.target.id==='scrim'||e.target.closest('.x'))closeD()});
function closeD(){$('#drawer').hidden=$('#scrim').hidden=true}
function find(t){const out=[];for(const n of ['premarket','intraday','afterhours']){const r=D[n]?.rows?.find(x=>x.t===t);if(r)out.push([n,r])}return out}
function openT(t){const hits=find(t),r=hits[0]?.[1];
  const fil=(r?.filings?.length?r.filings:(D.news?.filings||[]).filter(f=>f.ticker===t));
  const news=[...(D.news?.smallcap||[]),...(D.news?.macro||[])].filter(n=>n.ticker===t);
  $('#drawer').innerHTML=`<button class="x star" style="font-size:22px">✕</button><h3>${t} <button class="star ${W.has(t)?'on':''}" data-w="${t}">★</button></h3>
  ${hits.map(([n,x])=>`<div class=item><div class=meta>${n}</div>$${x.price} ${pc(x.pct)} · float ${big(x.float)} · rotation ${x.rot?.toFixed(1)??'?'}x · max 1h ${x.hr?.toFixed(1)??'?'}x ${x.dilution?'<span class="tag dil">dilution risk</span>':''}</div>`).join('')||'<p class=mut>Not in today\'s screeners.</p>'}
  <h2>Catalyst</h2>${r?.news?`<a href="${esc(r.news[1])}" target=_blank rel=noopener>${esc(r.news[0])}</a>`:'<span class=mut>No news found</span>'}
  ${news.map(n=>`<div class=item><div class=meta>${esc(n.time)} · <span class=tag>${esc(n.why)}</span></div><a href="${esc(n.url)}" target=_blank rel=noopener>${esc(n.title)}</a></div>`).join('')}
  <h2>SEC filings</h2>${fil.length?fil.map(f=>`<div class=item><div class=meta>${esc(f.date||ptTime(f.accepted))} ${f.dilution?'<span class="tag dil">dilution</span>':''}</div><a href="${esc(f.url)}" target=_blank rel=noopener>${esc(f.form)}</a> <small class=mut>${esc(f.items)} ${esc(f.note)}</small></div>`).join(''):'<span class=mut>None on file in our watchlist scan (check EDGAR).</span>'}
  <h2>Links</h2><div class=links><a href="https://finviz.com/quote.ashx?t=${t}" target=_blank rel=noopener>finviz</a><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${t}&owner=include&count=40" target=_blank rel=noopener>SEC EDGAR</a><a href="https://finance.yahoo.com/quote/${t}" target=_blank rel=noopener>Yahoo</a><a href="https://www.benzinga.com/quote/${t}" target=_blank rel=noopener>Benzinga</a><a href="https://x.com/search?q=%24${t}&f=live" target=_blank rel=noopener>X</a></div>
  <p class=mut style="margin-top:16px">Not investment advice.</p>`;
  $('#drawer').hidden=$('#scrim').hidden=false}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeD()});

function news(){const n=D.news;if(!n)return '<div class=empty>News unavailable.</div>';
  const seg=[['all','Headlines'],['macro','Macro movers'],['smallcap','Small-cap catalysts'],['filings','SEC filings'],['x','X']].map(([k,l])=>`<button data-n="${k}" class="${newsSeg===k?'on':''}">${l}</button>`).join('');
  const tg=s=>{s=(s||'').toLowerCase();return s.includes('dilut')||s.includes('offering')?'dil':s.includes('bear')?'bear':s.includes('bull')?'bull':s.includes('high')?'hi':''};
  let body='';
  if(newsSeg==='all')body=n.headlines.map(h=>`<div class=item><div class=meta>${ptTime(h.ts)} · ${esc(h.src)} <span class="tag ${tg(h.impact)}">${esc(h.impact)}</span></div><a href="${esc(h.link)}" target=_blank rel=noopener>${esc(h.title)}</a></div>`).join('');
  else if(newsSeg==='filings')body=n.filings.map(f=>`<div class="item r" data-t="${f.ticker}"><div class=meta>${ptTime(f.accepted)} ${f.dilution?'<span class="tag dil">dilution</span>':''}</div><b>${f.ticker}</b> <a href="${esc(f.url)}" target=_blank rel=noopener>${esc(f.form)}</a> <small class=mut>${esc(f.items)} ${esc(f.note)}</small></div>`).join('');
  else if(newsSeg==='x')body=n.x.length?n.x.map(x=>`<div class=item><a href="${esc(x.url)}" target=_blank rel=noopener>${esc(x.title)}</a></div>`).join(''):'<div class=empty>No X headlines in this build.</div>';
  else body=n[newsSeg].map(i=>`<div class="item r" data-t="${esc(i.ticker)}"><div class=meta>${esc(i.time)} · <b>${esc(i.ticker)}</b> <span class="tag ${tg(i.why)}">${esc(i.why)}</span></div><a href="${esc(i.url)}" target=_blank rel=noopener>${esc(i.title)}</a></div>`).join('');
  return `<div class=card><div class=n>Daily bias</div><div class=p>${esc(n.bias)}</div><small>${n.bull} bullish / ${n.bear} bearish headlines · ${esc(n.tape)}</small></div><h2></h2><div class=seg>${seg}</div>${body||'<div class=empty>Nothing here.</div>'}${n.feeds_down?.length?`<p class=mut>Feeds down: ${esc(n.feeds_down.join(', '))}</p>`:''}`}
function watch(){if(!W.size)return '<div class=empty>Tap ★ on any ticker to add it to your watchlist. It\'s saved on this device.</div>';
  return `<div class=tw><table><tr><th></th><th>Ticker</th><th>Session</th><th>Price</th><th>%</th><th>Rotation</th></tr>${[...W].map(t=>{const h=find(t);return h.length?h.map(([n,r],i)=>`<tr class=r data-t="${t}"><td>${i?'':`<button class="star on" data-w="${t}">★</button>`}</td><td><b>${i?'':t}</b></td><td>${n}</td><td>${r.price}</td><td>${pc(r.pct)}</td><td>${r.rot?.toFixed(1)??'?'}x</td></tr>`).join(''):`<tr class=r data-t="${t}"><td><button class="star on" data-w="${t}">★</button></td><td><b>${t}</b></td><td colspan=4 class=mut>not in today's screeners</td></tr>`}).join('')}</table></div>`}

load();setInterval(load,5*60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
