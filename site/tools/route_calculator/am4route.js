/* AM4 Streckenrechner / Route Calculator — Start/Ziel-Auswahl aus Spieldaten
 * Daten: abc8747/am4 (airports.parquet, routes.parquet), aufbereitet in data/
 *   data/airports.json        Flughäfen in DB-Reihenfolge (Index = Dateiname der Nachfrage)
 *   data/demand/<idx>.bin     Nachfrage ab Flughafen <idx> zu allen Flughäfen:
 *                             pro Ziel 3 × uint16 little-endian (Y, J, F)
 * Erwartet window.ROUTE_I18N (Texte je Sprache) vor dem Laden dieses Skripts.
 */
(function(){
  const T=window.ROUTE_I18N;
  const DATA='../shared_resources/data/';
  const $=id=>document.getElementById(id);
  let AP=null;               // [{i,name,full,country,iata,icao,lat,lng,rwy}]
  const rowCache=new Map();  // idx -> Promise<DataView>
  let reqToken=0;

  const nf=n=>Math.round(n).toLocaleString(T.locale);
  function setInfo(html,cls){const el=$('routeInfo');el.className='route-info'+(cls?' '+cls:'');el.innerHTML=html}
  function opt(value,text,title){const o=new Option(text,value);if(title)o.title=title;return o}
  function resetAirport(side,text){const s=$(side+'Airport');s.replaceChildren(opt('',text));s.disabled=true}

  // Grosskreisdistanz wie im Spiel (Erddurchmesser 12'742 km)
  function distance(a,b){
    const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lng-a.lng)*r;
    const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
    return 12742*Math.asin(Math.sqrt(h));
  }

  function loadRow(idx){
    if(!rowCache.has(idx)){
      const p=fetch(DATA+'demand/'+idx+'.bin').then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()})
        .then(b=>{if(b.byteLength!==AP.length*6)throw new Error('size');return new DataView(b)});
      p.catch(()=>rowCache.delete(idx));
      rowCache.set(idx,p);
    }
    return rowCache.get(idx);
  }

  window.onCountry=function(side){
    const c=$(side+'Country').value;
    if(!c){resetAirport(side,T.pickCountryFirst);onAirport();return}
    const s=$(side+'Airport');
    const list=AP.filter(a=>a.country===c)
      .sort((a,b)=>a.name.localeCompare(b.name,'en')||a.iata.localeCompare(b.iata));
    s.replaceChildren(opt('',T.pickAirport),...list.map(a=>opt(a.i,`${a.name} (${a.iata})`,`${a.full} · ${a.iata}/${a.icao} · ${nf(a.rwy)} ft`)));
    s.disabled=false;
    onAirport();
  };

  // Ziel-Flughafen darf nicht gleich Start-Flughafen sein
  function syncExclusion(){
    const dep=$('depAirport').value,arr=$('arrAirport');
    for(const o of arr.options)o.disabled=o.value!==''&&o.value===dep;
    if(dep!==''&&arr.value===dep)arr.value='';
  }

  window.onAirport=async function(){
    syncExclusion();
    const dv=$('depAirport').value,av=$('arrAirport').value;
    const token=++reqToken;
    if(dv===''||av===''){setInfo(AP?T.hint:'');return}
    const a=AP[+dv],b=AP[+av];
    const fill=(id,v)=>{const el=$(id);el.value=v;el.classList.add('autofilled')};
    const dist=Math.round(distance(a,b));
    fill('distance',dist);
    fill('maxRwy',Math.min(a.rwy,b.rwy));
    const head=`✈️ <b>${a.iata}</b> → <b>${b.iata}</b> · ${nf(dist)} km · ${T.rwy} ${nf(Math.min(a.rwy,b.rwy))} ft`;
    setInfo(head+' · '+T.loadingDemand);
    try{
      const dvw=await loadRow(a.i);
      if(token!==reqToken)return;
      const o=b.i*6,y=dvw.getUint16(o,true),j=dvw.getUint16(o+2,true),f=dvw.getUint16(o+4,true);
      fill('demY',y);fill('demJ',j);fill('demF',f);
      setInfo(`${head} · ${T.demand} <span class="tag tag-y">${nf(y)} Y</span> <span class="tag tag-j">${nf(j)} J</span> <span class="tag tag-f">${nf(f)} F</span><br><span class="muted">${T.filled}</span>`,'ok');
    }catch(e){
      if(token!==reqToken)return;
      setInfo(`${head}<br><span class="muted">${T.demandError}</span>`,'warn');
    }
  };

  // Manuelle Änderung entfernt die "automatisch"-Markierung
  ['distance','maxRwy','demY','demJ','demF'].forEach(id=>$(id).addEventListener('input',e=>e.target.classList.remove('autofilled')));

  fetch(DATA+'airports.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(j=>{
    AP=j.airports.map((a,i)=>({i,name:a[0],full:a[1],country:a[2],iata:a[3],icao:a[4],lat:a[5],lng:a[6],rwy:a[7]}));
    const countries=[...new Set(AP.map(a=>a.country))].sort((a,b)=>a.localeCompare(b,'en'));
    for(const side of ['dep','arr']){
      const s=$(side+'Country');
      s.replaceChildren(opt('',T.pickCountry),...countries.map(c=>opt(c,c)));
      s.disabled=false;
      resetAirport(side,T.pickCountryFirst);
    }
    setInfo(T.hint);
  }).catch(()=>{
    for(const side of ['dep','arr']){$(side+'Country').replaceChildren(opt('',T.unavailable));resetAirport(side,'–')}
    setInfo(T.dataError,'warn');
  });
})();
