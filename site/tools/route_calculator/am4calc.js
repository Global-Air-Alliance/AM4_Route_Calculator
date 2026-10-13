/* AM4 Route Calculator – optimal aircraft type & route profitability for Airline Manager 4
 * Page: globalairall.net/tools/am4calc.html (website repository, Bootstrap Studio)
 * Needs: ../shared_resources/am4.js (aircraft list, game data, formatting) loaded first.
 * All visible texts generated here come from AM4.strings() – the page can override (and
 * Linguise can translate) every text via <div id="am4-strings">.
 */
(function(){
'use strict';
if(!window.AM4){console.error('AM4 Route Calculator: shared_resources/am4.js is missing');return}
const {AIRCRAFT,nf,num,fpd,money,esc,tpl}=AM4;
const $=id=>document.getElementById(id);

const S=AM4.strings({
  pickCountry:'– Select country –',
  pickCountryFirst:'– select country first –',
  pickAirport:'– Select airport –',
  unavailable:'unavailable',
  hint:'Select origin and destination to take distance, runway and demand from the game data — or fill in the fields below manually.',
  rwy:'shortest runway',
  demand:'Demand',
  loadingDemand:'loading demand…',
  filled:'Values taken from game data (highlighted green) — can be overwritten.',
  demandError:'Demand could not be loaded — please enter demand manually.',
  dataError:'Game data could not be loaded — please fill in the fields manually.',
  cfgNote:'({req} requested, {free} unsold)',
  bestTitle:'🏆 Best Aircraft: {name}',
  configuration:'Configuration',
  depDay:'Departures/Day',
  netProfitDay:'Net Profit/Day',
  profitDays:'Profit {d}d',
  roiDays:'ROI ({d}d)',
  acPrice:'A/C Price',
  resale:'Resale (180d)',
  deprDay:'Depreciation/Day',
  perDay:'/d',
  perAc:'/ac',
  noProfitTitle:'⚠️ No profitable route',
  noProfitText:'No aircraft type is profitable with these parameters.',
  noFleet:'No profitable fleet possible',
  fleetTitle:'🛫 Optimal Fleet: {n} Aircraft',
  aircraft:'Aircraft',
  fleetProfitDay:'Fleet Profit/Day',
  investment:'Investment',
  fleetRoi:'Fleet ROI',
  coverage:'Demand Coverage: Y {y}% · J {j}% · F {f}%',
  economy:'Economy (Y)',
  business:'Business (J)',
  first:'First (F)',
  colConfig:'Config',
  colDep:'Dep',
  colRev:'Rev/D',
  colCost:'Cost/D',
  colProfit:'Profit/D',
  colInvest:'Invest',
  total:'Σ Total',
  resultsInfo:'{n} aircraft (of {m} within range & runway)',
  noResults:'No results — adjust parameters, runway or filters.'
});

let AP=null, gameMode='realism', fleetMode='single', results=[], currentSort={key:'profitDay',asc:false}, activeCat='all', reqToken=0;

// ---------- Formatting ----------
function cfgHtml(r){
  const note=r.freeY>0?` <span class="cfg-note">${esc(tpl(S.cfgNote,{req:nf(r.reqY),free:nf(r.freeY)}))}</span>`:'';
  return `<span class="tag tag-y">${r.sY} Y</span>${note} <span class="tag tag-j">${r.sJ} J</span> <span class="tag tag-f">${r.sF} F</span>`;
}
const pct=n=>num(n,1)+'%';

// ---------- Game formulas ----------
function ticketPrices(d){
  return gameMode==='easy'
    ?{y:(0.4*d+170)*1.1,j:(0.8*d+560)*1.08,f:(1.2*d+1200)*1.06}
    :{y:(0.3*d+150)*1.1,j:(0.6*d+500)*1.08,f:(0.9*d+1000)*1.06};
}

function getParams(){
  const v=id=>+$(id).value;
  return{d:v('distance'),maxRwy:v('maxRwy'),demY:v('demY'),demJ:v('demJ'),demF:v('demF'),
    fuelP:v('fuelPrice'),co2P:v('co2Price'),days:v('days'),fh:v('flightHours'),
    sP:v('salPilot'),sC:v('salCrew'),sE:v('salEng'),sT:v('salTech'),mktPct:v('marketPct')/100};
}

function evalAircraft(ac,p,remY,remJ,remF){
  const {id,sn,name,speed,fuel,co2,cost,cap,rwy,range,checkCost,maint,pilots,crew,eng,tech}=ac;
  if(p.d>range||rwy>p.maxRwy)return null;
  // AM4: flight time of one departure = one-way distance; Easy mode flies 1.5× faster
  const effSpeed=speed*(gameMode==='easy'?1.5:1);
  const tripH=p.d/effSpeed;
  // If one flight does not fit into the flight hours per day, the day is counted pro rata (e.g. 0.8 flights/day)
  const fpdN=tripH<=p.fh?Math.floor(p.fh/tripH):p.fh/tripH;

  let cRem=cap;
  let sF=Math.min(Math.floor(remF/fpdN),Math.floor(cRem/3));cRem-=sF*3;
  let sJ=Math.min(Math.floor(remJ/fpdN),Math.floor(cRem/2));cRem-=sJ*2;
  let sY=Math.min(Math.floor(remY/fpdN),Math.floor(cRem));cRem-=sY;
  if(cRem>0){const ex=Math.min(cRem,Math.max(0,Math.floor(remY/fpdN)-sY));sY+=ex;cRem-=ex}
  // The game always requires the full capacity: remaining seats as economy (no demand = unsold)
  const reqY=sY,freeY=cRem;sY+=cRem;cRem=0;

  const totalY=Math.min(fpdN*sY,remY),totalJ=Math.min(fpdN*sJ,remJ),totalF=Math.min(fpdN*sF,remF);
  if(totalY+totalJ+totalF===0)return null;

  const prices=ticketPrices(p.d);
  const revDay=totalY*prices.y+totalJ*prices.j+totalF*prices.f;
  const fuelCostFlight=p.d*fuel*(p.fuelP/1000);
  const co2CostFlight=p.d*co2*p.co2P;
  const flightCostDay=fpdN*(fuelCostFlight+co2CostFlight);
  const staffDay=pilots*p.sP+crew*p.sC+eng*p.sE+tech*p.sT;
  const numChecks=Math.max(0,Math.floor(p.days*p.fh/maint));
  // A-check: in Realism mode the game shows exactly twice the base value
  const checkDay=numChecks*checkCost*(gameMode==='realism'?2:1)/p.days;

  const totalFH180=35+180*p.fh;
  const currentValue=Math.max(cost-2500*totalFH180,0.10*cost);
  const resaleValue=currentValue*p.mktPct;
  const amortDay=(cost-resaleValue)/180;

  const costDay=flightCostDay+staffDay+checkDay+amortDay;
  const profitDay=revDay-costDay;
  const profitTotal=profitDay*p.days;
  const roi=cost>0?(profitTotal/cost)*100:0;

  return{id,sn,name,speed,rwy,tripH,acCost:cost,capacity:cap,range,fpd:fpdN,
    sY,sJ,sF,totalY,totalJ,totalF,
    revDay,costDay,profitDay,profitTotal,roi,
    fuelCostDay:fpdN*fuelCostFlight,co2CostDay:fpdN*co2CostFlight,
    staffDay,checkDay,amortDay,resaleValue,
    reqY,freeY,
    config:`${sY}/${sJ}/${sF}`};
}

function calculate(){
  const p=getParams();
  results=[];
  for(const ac of AIRCRAFT){
    const r=evalAircraft(ac,p,p.demY,p.demJ,p.demF);
    if(r)results.push(r);
  }
  results.sort((a,b)=>b.profitDay-a.profitDay);
  currentSort={key:'profitDay',asc:false};
  markSorted();

  if(fleetMode==='multi')calculateFleet(p);
  else $('fleetArea').innerHTML='';

  renderResults();
}

function calculateFleet(p){
  let remY=p.demY,remJ=p.demJ,remF=p.demF;
  const fleet=[];
  const MAX_AC=30;

  while((remY+remJ+remF)>0&&fleet.length<MAX_AC){
    let bestResult=null;
    for(const ac of AIRCRAFT){
      const r=evalAircraft(ac,p,remY,remJ,remF);
      if(r&&r.profitDay>0&&(!bestResult||r.profitDay>bestResult.profitDay))bestResult=r;
    }
    if(!bestResult)break;
    fleet.push(bestResult);
    remY=Math.max(0,remY-bestResult.totalY);
    remJ=Math.max(0,remJ-bestResult.totalJ);
    remF=Math.max(0,remF-bestResult.totalF);
  }

  const fa=$('fleetArea');
  if(fleet.length===0){
    fa.innerHTML=`<div class="am4-card err-card"><h2>${esc(S.noFleet)}</h2></div>`;
    return;
  }

  const totRev=fleet.reduce((s,f)=>s+f.revDay,0);
  const totCost=fleet.reduce((s,f)=>s+f.costDay,0);
  const totProfit=fleet.reduce((s,f)=>s+f.profitDay,0);
  const totInvest=fleet.reduce((s,f)=>s+f.acCost,0);
  const servedY=p.demY-remY,servedJ=p.demJ-remJ,servedF=p.demF-remF;
  const pctY=p.demY>0?Math.round(servedY/p.demY*100):0;
  const pctJ=p.demJ>0?Math.round(servedJ/p.demJ*100):0;
  const pctF=p.demF>0?Math.round(servedF/p.demF*100):0;

  const grouped={};
  fleet.forEach(f=>{
    const k=f.id+'|'+f.config; // same type with a different configuration = own row
    if(!grouped[k])grouped[k]={...f,count:1};
    else{const g=grouped[k];g.count++;g.revDay+=f.revDay;g.costDay+=f.costDay;g.profitDay+=f.profitDay;g.acCost+=f.acCost;g.amortDay+=f.amortDay}
  });
  const gArr=Object.values(grouped).sort((a,b)=>b.profitDay-a.profitDay);

  const rows=gArr.map(g=>`<tr>
    <td class="t">${g.count}× ${esc(g.name)}</td>
    <td>${cfgHtml(g)}</td>
    <td>${fpd(g.fpd)}${esc(S.perAc)}</td>
    <td>${money(g.revDay)}</td>
    <td>${money(g.costDay)}</td>
    <td class="pos">${money(g.profitDay)}</td>
    <td>${money(g.acCost)}</td>
  </tr>`).join('');

  fa.innerHTML=`
  <div class="am4-card plan-card">
    <h2>${esc(tpl(S.fleetTitle,{n:nf(fleet.length)}))}</h2>
    <div class="stats" style="margin-bottom:.75rem">
      <div class="stat"><div class="val">${nf(fleet.length)}</div><div class="lbl">${esc(S.aircraft)}</div></div>
      <div class="stat"><div class="val pos">${money(totProfit)}${esc(S.perDay)}</div><div class="lbl">${esc(S.fleetProfitDay)}</div></div>
      <div class="stat"><div class="val pos">${money(totProfit*p.days)}</div><div class="lbl">${esc(tpl(S.profitDays,{d:nf(p.days)}))}</div></div>
      <div class="stat"><div class="val">${money(totInvest)}</div><div class="lbl">${esc(S.investment)}</div></div>
      <div class="stat"><div class="val">${pct(totInvest>0?totProfit*p.days/totInvest*100:0)}</div><div class="lbl">${esc(S.fleetRoi)}</div></div>
    </div>
    <div class="coverage">${esc(tpl(S.coverage,{y:pctY,j:pctJ,f:pctF}))}</div>
    <div class="coverage-bars">
      <div><label>${esc(S.economy)}</label><div class="demand-bar"><div class="demand-fill" style="width:${pctY}%"></div></div></div>
      <div><label>${esc(S.business)}</label><div class="demand-bar"><div class="demand-fill j" style="width:${pctJ}%"></div></div></div>
      <div><label>${esc(S.first)}</label><div class="demand-bar"><div class="demand-fill f" style="width:${pctF}%"></div></div></div>
    </div>
    <div class="table-wrap"><table class="am4-table fleet-table">
      <thead><tr><th>${esc(S.aircraft)}</th><th>${esc(S.colConfig)}</th><th>${esc(S.colDep)}</th><th>${esc(S.colRev)}</th><th>${esc(S.colCost)}</th><th>${esc(S.colProfit)}</th><th>${esc(S.colInvest)}</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td class="t">${esc(S.total)}</td><td></td><td></td>
          <td>${money(totRev)}</td><td>${money(totCost)}</td>
          <td class="pos">${money(totProfit)}</td><td>${money(totInvest)}</td>
        </tr>
      </tbody>
    </table></div>
  </div>`;
}

// ---------- Result list ----------
function getCat(range){return range<=4000?'sh':range<=8000?'mh':'lh'}

function markSorted(){document.querySelectorAll('#resultsTable th.s').forEach(th=>th.classList.toggle('sorted',th.dataset.k===currentSort.key))}

function sortBy(key){
  if(currentSort.key===key)currentSort.asc=!currentSort.asc;
  else currentSort={key,asc:false};
  results.sort((a,b)=>{let va=a[key],vb=b[key];if(typeof va==='string'){va=va.toLowerCase();vb=vb.toLowerCase()}return currentSort.asc?(va>vb?1:-1):(va<vb?1:-1)});
  markSorted();
  renderResults();
}

function renderResults(){
  const search=$('searchAc').value.toLowerCase();
  const filtered=results.filter(r=>{
    if(activeCat!=='all'&&getCat(r.range)!==activeCat)return false;
    if(search&&!r.name.toLowerCase().includes(search)&&!r.sn.toLowerCase().includes(search))return false;
    return true;
  });

  const wa=$('winnerArea');
  if(fleetMode==='single'&&filtered.length>0){
    const w=filtered.reduce((b,r)=>r.profitDay>b.profitDay?r:b,filtered[0]);
    const dv=nf(+$('days').value);
    if(w.profitDay>0){
      wa.innerHTML=`<div class="am4-card winner-card">
        <h2>${esc(tpl(S.bestTitle,{name:w.name}))}</h2>
        <div class="stats">
          <div class="stat"><div class="val">${cfgHtml(w)}</div><div class="lbl">${esc(S.configuration)}</div></div>
          <div class="stat"><div class="val">${fpd(w.fpd)}</div><div class="lbl">${esc(S.depDay)}</div></div>
          <div class="stat"><div class="val">${money(w.profitDay)}</div><div class="lbl">${esc(S.netProfitDay)}</div></div>
          <div class="stat"><div class="val">${money(w.profitTotal)}</div><div class="lbl">${esc(tpl(S.profitDays,{d:dv}))}</div></div>
          <div class="stat"><div class="val">${pct(w.roi)}</div><div class="lbl">${esc(tpl(S.roiDays,{d:dv}))}</div></div>
          <div class="stat"><div class="val">${money(w.acCost)}</div><div class="lbl">${esc(S.acPrice)}</div></div>
          <div class="stat"><div class="val">${money(w.resaleValue)}</div><div class="lbl">${esc(S.resale)}</div></div>
          <div class="stat"><div class="val">${money(w.amortDay)}${esc(S.perDay)}</div><div class="lbl">${esc(S.deprDay)}</div></div>
        </div>
      </div>`;
    }else{
      wa.innerHTML=`<div class="am4-card err-card"><h2>${esc(S.noProfitTitle)}</h2><p>${esc(S.noProfitText)}</p></div>`;
    }
  }else{
    wa.innerHTML='';
  }

  $('resultsInfo').textContent=tpl(S.resultsInfo,{n:nf(filtered.length),m:nf(results.length)});

  const tbody=$('tbody');
  if(filtered.length===0){
    tbody.innerHTML=`<tr><td colspan="13" class="empty">${esc(S.noResults)}</td></tr>`;
    return;
  }

  const bestProfit=Math.max(...filtered.map(r=>r.profitDay));
  tbody.innerHTML=filtered.map((r,i)=>{
    const isBest=r.profitDay===bestProfit&&r.profitDay>0;
    const pc=r.profitDay>=0?'pos':'neg';
    return `<tr class="${isBest?'best':''}">
      <td class="t">${i+1}. ${esc(r.name)}</td>
      <td>${nf(r.capacity)}</td>
      <td>${cfgHtml(r)}</td>
      <td>${nf(r.speed)}</td>
      <td>${nf(r.rwy)}</td>
      <td>${fpd(r.fpd)}</td>
      <td>${money(r.revDay)}</td>
      <td>${money(r.costDay)}</td>
      <td>${money(r.amortDay)}</td>
      <td class="${pc}">${money(r.profitDay)}</td>
      <td class="${pc}">${money(r.profitTotal)}</td>
      <td class="${r.roi>=0?'pos':'neg'}">${pct(r.roi)}</td>
      <td>${money(r.acCost)}</td>
    </tr>`;
  }).join('');
}

// ---------- Origin / destination from game data ----------
function setInfo(html,cls){const el=$('routeInfo');el.className='hint no-translate'+(cls?' '+cls:'');el.innerHTML=html}
function resetAirport(side,text){const s=$(side+'Airport');s.replaceChildren(AM4.option('',text));s.disabled=true}

function onCountry(side){
  const c=$(side+'Country').value;
  if(!c){resetAirport(side,S.pickCountryFirst);onAirport();return}
  AM4.fillAirports($(side+'Airport'),AP,c,S.pickAirport);
  onAirport();
}

// Destination must not be the origin
function syncExclusion(){
  const dep=$('depAirport').value,arr=$('arrAirport');
  for(const o of arr.options)o.disabled=o.value!==''&&o.value===dep;
  if(dep!==''&&arr.value===dep)arr.value='';
}

async function onAirport(){
  syncExclusion();
  const dv=$('depAirport').value,av=$('arrAirport').value;
  const token=++reqToken;
  if(dv===''||av===''){setInfo(AP?esc(S.hint):'');return}
  const a=AP[+dv],b=AP[+av];
  const fill=(id,v)=>{const el=$(id);el.value=v;el.classList.add('autofilled')};
  const dist=Math.round(AM4.distance(a,b));
  const rwy=Math.min(a.rwy,b.rwy);
  fill('distance',dist);
  fill('maxRwy',rwy);
  const head=`✈️ <b>${esc(a.iata)}</b> → <b>${esc(b.iata)}</b> · ${nf(dist)} km · ${esc(S.rwy)} ${nf(rwy)} ft`;
  setInfo(head+' · '+esc(S.loadingDemand));
  try{
    const dvw=await AM4.loadDemand(a.i);
    if(token!==reqToken)return;
    const d=AM4.demand(dvw,b.i);
    fill('demY',d.y);fill('demJ',d.j);fill('demF',d.f);
    setInfo(`${head} · ${esc(S.demand)} <span class="tag tag-y">${nf(d.y)} Y</span> <span class="tag tag-j">${nf(d.j)} J</span> <span class="tag tag-f">${nf(d.f)} F</span><br><span class="muted">${esc(S.filled)}</span>`);
  }catch(e){
    if(token!==reqToken)return;
    setInfo(`${head}<br><span class="muted">${esc(S.demandError)}</span>`,'warn');
  }
}

// ---------- Events ----------
function toggle(id,cb){
  $(id).addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    $(id).querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    cb(b.dataset.v);
  });
}
toggle('gameToggle',v=>{gameMode=v});
toggle('fleetToggle',v=>{fleetMode=v});
$('calcBtn').addEventListener('click',calculate);
$('searchAc').addEventListener('input',renderResults);
$('catChips').addEventListener('click',e=>{
  const c=e.target.closest('[data-cat]');if(!c)return;
  $('catChips').querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===c));
  activeCat=c.dataset.cat;renderResults();
});
document.querySelectorAll('#resultsTable th.s').forEach(th=>th.addEventListener('click',()=>sortBy(th.dataset.k)));
$('depCountry').addEventListener('change',()=>onCountry('dep'));
$('arrCountry').addEventListener('change',()=>onCountry('arr'));
$('depAirport').addEventListener('change',onAirport);
$('arrAirport').addEventListener('change',onAirport);
// Manual input removes the "taken from game data" highlight
['distance','maxRwy','demY','demJ','demF'].forEach(id=>$(id).addEventListener('input',e=>e.target.classList.remove('autofilled')));

calculate();

AM4.loadAirports().then(ap=>{
  AP=ap;
  for(const side of ['dep','arr']){
    AM4.fillCountries($(side+'Country'),AP,S.pickCountry);
    resetAirport(side,S.pickCountryFirst);
  }
  setInfo(esc(S.hint));
}).catch(()=>{
  for(const side of ['dep','arr']){$(side+'Country').replaceChildren(AM4.option('',S.unavailable));resetAirport(side,'–')}
  setInfo(esc(S.dataError),'warn');
});
})();
