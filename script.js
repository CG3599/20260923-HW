const API_URL="/api/weather";
const state={rows:[],selectedCity:"",selectedTown:"",defaultCities:[],suggestionItems:[],suggestionIndex:-1};
const DEFAULT_KEY="weatherDefaultCities";
const $=s=>document.querySelector(s);

function icon(t=""){if(t.includes("雷"))return"⛈️";if(t.includes("雨"))return"🌧️";if(t.includes("雪"))return"❄️";if(t.includes("霧"))return"🌫️";if(t.includes("晴時多雲"))return"🌤️";if(t.includes("晴"))return"☀️";if(t.includes("多雲"))return"⛅";if(t.includes("陰"))return"☁️";return"🌈"}
function num(v){if(v==null||v===""||v==="--"||v==="無資料")return null;const n=Number(v);return Number.isFinite(n)?n:null}
function windArrow(direction=""){const d=String(direction);if(d.includes("北北東")||d.includes("東北"))return"↗️";if(d.includes("東南")||d.includes("南東"))return"↘️";if(d.includes("南西")||d.includes("西南"))return"↙️";if(d.includes("西北")||d.includes("北西"))return"↖️";if(d.includes("東"))return"➡️";if(d.includes("南"))return"⬇️";if(d.includes("西"))return"⬅️";if(d.includes("北"))return"⬆️";return"🧭"}

function parseRows(data){
  const groups=data?.records?.Locations||[],rows=[];
  for(const group of groups){
    const city=group?.LocationsName||"未知縣市";
    for(const l of group?.Location||[]){
      const es=l?.WeatherElement||[];
      const find=(...names)=>es.find(x=>names.includes(x.ElementName));
      const first=(...names)=>find(...names)?.Time?.[0]?.ElementValue?.[0]||{};
      const temperatureEl=find("溫度","Temperature");
      const humidityEl=find("相對濕度","RelativeHumidity");
      const popEl=find("3小時降雨機率","3小時降雨機率（%）","降雨機率","ProbabilityOfPrecipitation","3-hour ProbabilityOfPrecipitation");
      const windDirectionEl=find("風向","WindDirection");
      const windSpeedEl=find("風速","WindSpeed");
      const weatherEl=find("天氣現象","Weather");
      const times=new Map();
      const timeKeys=new Set([
        ...(temperatureEl?.Time||[]).map(t=>t.StartTime||t.DataTime).filter(Boolean),
        ...(weatherEl?.Time||[]).map(t=>t.StartTime||t.DataTime).filter(Boolean)
      ]);
      const valueAt=(element,key)=>{
        const item=(element?.Time||[]).find(t=>(t.StartTime||t.DataTime)===key);
        return item?.ElementValue?.[0]||{};
      };
      const valueFrom=(v,names)=>{
        for(const name of names){
          if(v?.[name]!=null)return v[name];
        }
        return Object.values(v||{})[0];
      };
      for(const key of timeKeys){
        const tv=valueAt(temperatureEl,key),hv=valueAt(humidityEl,key),pv=valueAt(popEl,key),wv=valueAt(windDirectionEl,key),ws=valueAt(windSpeedEl,key),xv=valueAt(weatherEl,key);
        const r={
          city,town:l?.LocationName||"未知鄉鎮",latitude:num(l?.Latitude),longitude:num(l?.Longitude),
          temperature:num(valueFrom(tv,["溫度","Temperature"])),
          humidity:num(valueFrom(hv,["相對濕度","RelativeHumidity"])),
          pop:num(valueFrom(pv,["ProbabilityOfPrecipitation","3小時降雨機率","3小時降雨機率（%）"])),
          windDirection:valueFrom(wv,["風向","WindDirection"])??"--",
          windSpeed:num(valueFrom(ws,["風速","WindSpeed"])),
          weather:valueFrom(xv,["天氣現象","Weather"])??"資料待更新",
          start:key
        };
        times.set(key,r);
      }
      const forecast=[...times.values()].sort((a,b)=>new Date(a.start)-new Date(b.start));
      const current=forecast[0]||{
        city,town:l?.LocationName||"未知鄉鎮",latitude:num(l?.Latitude),longitude:num(l?.Longitude),
        temperature:null,humidity:null,pop:null,windDirection:"--",windSpeed:null,weather:"資料待更新",start:""
      };
      current.forecast=forecast;
      rows.push(current);
    }
  }
  return rows.map(r=>{
    const riding=ridingCondition(r);
    return {...r,riding};
  });
}

function buildDecisionSupport(r){
  const riding=r?.riding||ridingCondition(r);
  const reasons=riding.reasons||[];
  let action="EXECUTE";
  let actionLabel="可出發";
  let actionIcon="🟢";
  if(riding.level==="high"){
    action="WAIT"; actionLabel="建議等待"; actionIcon="🔴";
  }else if(riding.level==="caution"){
    action="ASK"; actionLabel="出發前再次確認"; actionIcon="🟠";
  }else if(riding.level==="normal"){
    action="ASK"; actionLabel="建議確認天氣"; actionIcon="🟡";
  }
  const evidence=[
    Number.isFinite(r.temperature)?("溫度 "+fmt(r.temperature," °C")):null,
    Number.isFinite(r.humidity)?("濕度 "+fmt(r.humidity," %")):null,
    Number.isFinite(r.pop)?("降雨機率 "+fmt(r.pop," %")):null,
    Number.isFinite(r.windSpeed)?("風速 "+fmt(r.windSpeed," m/s")):null
  ].filter(Boolean);
  return {action,actionLabel,actionIcon,score:riding.score,reasons,evidence,advice:riding.advice};
}

function ridingAdvice(condition){
  const reasons=condition?.reasons||[];
  const level=condition?.level;
  if(level==="high"){
    return "目前騎乘條件較不利，出發前請重新確認最新天氣資訊，並留意降雨、風勢或極端溫度。";
  }
  if(level==="caution"){
    if(reasons.includes("降雨機率高")||reasons.includes("降雨機率偏高")||reasons.includes("可能有降雨")){
      return "騎乘時需留意降雨，建議攜帶雨具並持續確認天氣變化。";
    }
    if(reasons.includes("風速強")||reasons.includes("風速偏強")||reasons.includes("風速較高")){
      return "騎乘時需留意風勢，經過橋梁、開闊路段時請特別注意。";
    }
    return "目前騎乘條件需注意，建議出發前再次確認天氣與路況。";
  }
  if(level==="normal"){
    return "整體騎乘條件尚可，仍建議持續留意降雨與風勢變化。";
  }
  return "目前天氣條件較穩定，適合一般騎乘；出發前仍可確認最新天氣資訊。";
}

function ridingCondition(r){
  const temp=num(r?.temperature);
  const pop=num(r?.pop);
  const humidity=num(r?.humidity);
  const wind=num(r?.windSpeed);
  let score=0;
  const reasons=[];

  if(Number.isFinite(pop)){
    if(pop>=70){score+=4;reasons.push("降雨機率高");}
    else if(pop>=40){score+=2;reasons.push("降雨機率偏高");}
    else if(pop>=20){score+=1;reasons.push("可能有降雨");}
  }

  if(Number.isFinite(wind)){
    if(wind>=10){score+=4;reasons.push("風速強");}
    else if(wind>=7){score+=3;reasons.push("風速偏強");}
    else if(wind>=5){score+=1;reasons.push("風速較高");}
  }

  if(Number.isFinite(temp)){
    if(temp>=35){score+=4;reasons.push("高溫");}
    else if(temp>=32){score+=2;reasons.push("炎熱");}
    else if(temp<=10){score+=3;reasons.push("低溫");}
    else if(temp<=15){score+=1;reasons.push("氣溫偏低");}
  }

  if(Number.isFinite(humidity)&&humidity>=90){
    score+=1;
    reasons.push("濕度高");
  }

  let level="good";
  let label="良好";
  let icon="🟢";

  if(score>=7){
    level="high";
    label="高風險";
    icon="🔴";
  }else if(score>=4){
    level="caution";
    label="需注意";
    icon="🟠";
  }else if(score>=2){
    level="normal";
    label="普通";
    icon="🟡";
  }

  const condition={score,level,label,icon,reasons};
  condition.advice=ridingAdvice(condition);
  return condition;
}

function ridingLevel(score){
  if(score>=7)return {level:"high",label:"高風險",icon:"🔴"};
  if(score>=4)return {level:"caution",label:"需注意",icon:"🟠"};
  if(score>=2)return {level:"normal",label:"普通",icon:"🟡"};
  return {level:"good",label:"良好",icon:"🟢"};
}

function fmt(v,s=""){return v==null?"--":(Number.isInteger(v)?v:v.toFixed(1))+s}
function cities(){return [...new Set(state.rows.map(r=>r.city))]}
function towns(city){return state.rows.filter(r=>r.city===city).sort((a,b)=>a.town.localeCompare(b.town,"zh-Hant"))}
function cityRepresentative(city){const rs=towns(city);return rs[0]||null}
function routeOptionValue(r){return r.city+"||"+r.town}
function findRouteRow(value){const [city,town]=String(value||"").split("||");return state.rows.find(r=>r.city===city&&r.town===town)||null}
function populateRouteSelects(){
  const options=state.rows.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).slice().sort((a,b)=>(a.city+a.town).localeCompare(b.city+b.town,"zh-Hant"));
  const html='<option value="">請選擇地點</option>'+options.map(r=>'<option value="'+routeOptionValue(r).replaceAll('"','&quot;')+'">'+r.city+"｜"+r.town+"</option>").join("");
  ["#routeFrom","#routeTo"].forEach(sel=>{const el=$(sel);if(el)el.innerHTML=html;});
  setupRouteSearch("from"); setupRouteSearch("to");
}
function routeSearchElements(side){
  const cap=side==="from"?"From":"To";
  return {input:$("#route"+cap+"Search"),suggestions:$("#route"+cap+"Suggestions"),townWrap:$("#route"+cap+"TownWrap"),town:$("#route"+cap+"Town"),value:$("#route"+cap)};
}
function populateRouteTown(side,city,selected=""){
  const el=routeSearchElements(side).town;
  el.innerHTML='<option value="">請選擇鄉鎮</option>';
  towns(city).filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).forEach(r=>{const o=document.createElement("option");o.value=routeOptionValue(r);o.textContent=r.town;if(r.town===selected)o.selected=true;el.appendChild(o);});
}
function setRouteLocation(side,r){
  const e=routeSearchElements(side); if(!r)return;
  e.value.value=routeOptionValue(r); e.input.value=r.town;
  e.townWrap.classList.add("hidden"); e.suggestions.classList.add("hidden");
}
function renderRouteSuggestions(side){
  const e=routeSearchElements(side),q=normalizeSearchText(e.input.value);
  e.suggestions.innerHTML="";
  if(!q){e.suggestions.classList.add("hidden");e.townWrap.classList.add("hidden");return;}
  const cityMatches=cities().filter(c=>normalizeSearchText(c).includes(q));
  const townMatches=state.rows.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&normalizeSearchText(r.town).includes(q));
  const exactCity=cities().find(c=>normalizeSearchText(c)===q);
  if(exactCity){
    e.suggestions.classList.add("hidden");e.townWrap.classList.remove("hidden");populateRouteTown(side,exactCity);
    e.input.dataset.city=exactCity;e.input.dataset.mode="city";e.value.value="";
    return;
  }
  const items=[],seen=new Set();
  cityMatches.forEach(city=>{if(!seen.has(city)){seen.add(city);items.push({type:"city",city,town:"",name:city,label:"縣市"});}});
  townMatches.forEach(r=>items.push({type:"town",city:r.city,town:r.town,name:r.town,label:"鄉鎮"}));
  items.slice(0,10).forEach(m=>{const b=document.createElement("button");b.type="button";b.className="suggestion";b.innerHTML="<span>"+m.name+"</span><small>"+m.label+(m.type==="town"?"｜"+m.city:"")+"</small>";b.addEventListener("click",()=>selectRouteSearch(side,m));e.suggestions.appendChild(b);});
  e.suggestions.classList.toggle("hidden",!items.length);
  e.townWrap.classList.add("hidden");
}
function selectRouteSearch(side,m){
  const e=routeSearchElements(side); e.input.dataset.city=m.city;
  if(m.type==="town"){const r=findRouteRow(routeOptionValue({city:m.city,town:m.town}));setRouteLocation(side,r);return;}
  e.input.value=m.city;e.input.dataset.mode="city";e.value.value="";populateRouteTown(side,m.city);e.townWrap.classList.remove("hidden");e.suggestions.classList.add("hidden");
}
function setupRouteSearch(side){
  const e=routeSearchElements(side); if(!e.input||e.input.dataset.ready)return;
  e.input.dataset.ready="1";
  e.input.dataset.index="-1";
  e.input.addEventListener("input",()=>{e.input.dataset.index="-1";renderRouteSuggestions(side);});
  e.input.addEventListener("keydown",e2=>handleRouteSearchKeydown(side,e2));
  e.town.addEventListener("keydown",e2=>{
    if(e2.key==="Enter"&&e2.target.value){
      const r=findRouteRow(e2.target.value);
      if(r){setRouteLocation(side,r);e2.preventDefault();}
    }
  });
  e.town.addEventListener("change",()=>{const r=findRouteRow(e.town.value);if(r)setRouteLocation(side,r);});
}
function routeSuggestionButtons(side){
  return [...routeSearchElements(side).suggestions.querySelectorAll(".suggestion")];
}
function setRouteSuggestionIndex(side,index){
  const e=routeSearchElements(side),buttons=routeSuggestionButtons(side);
  if(!buttons.length)return;
  const next=Math.max(0,Math.min(index,buttons.length-1));
  e.input.dataset.index=String(next);
  buttons.forEach((el,i)=>el.classList.toggle("active",i===next));
  buttons[next]?.scrollIntoView({block:"nearest"});
}
function handleRouteSearchKeydown(side,event){
  const e=routeSearchElements(side),box=e.suggestions;
  if(event.key==="Escape"){
    box.classList.add("hidden");
    e.input.dataset.index="-1";
    return;
  }
  const buttons=routeSuggestionButtons(side);
  if(box.classList.contains("hidden")||!buttons.length){
    if((event.key==="ArrowDown"||event.key==="ArrowUp")&&e.input.value){
      renderRouteSuggestions(side);
      event.preventDefault();
      setRouteSuggestionIndex(side,event.key==="ArrowDown"?0:routeSuggestionButtons(side).length-1);
    }
    return;
  }
  const current=Number(e.input.dataset.index||"-1");
  if(event.key==="ArrowDown"){
    event.preventDefault();
    setRouteSuggestionIndex(side,current<0?0:current+1);
  }else if(event.key==="ArrowUp"){
    event.preventDefault();
    setRouteSuggestionIndex(side,current<0?buttons.length-1:current-1);
  }else if(event.key==="Enter"){
    event.preventDefault();
    const index=current<0?0:current;
    const items=buttons[index];
    if(items)items.click();
  }
}

function haversineKm(a,b){
  const R=6371;
  const p1=a[0]*Math.PI/180,p2=b[0]*Math.PI/180;
  const dp=(b[0]-a[0])*Math.PI/180,dl=(b[1]-a[1])*Math.PI/180;
  const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function routeLevel(score){return ridingLevel(score)}
function routeDecision(level){
  if(level==="high")return {icon:"🔴",label:"建議等待"};
  if(level==="caution")return {icon:"🟠",label:"出發前再次確認"};
  if(level==="normal")return {icon:"🟡",label:"建議確認天氣"};
  return {icon:"🟢",label:"可騎乘"};
}
function sampleRoutePoints(coords,count=30){
  if(!coords.length)return [];
  const n=Math.min(count,coords.length),out=[];
  if(n===1)return [coords[0]];
  for(let i=0;i<n;i++){
    const index=Math.round(i*(coords.length-1)/(n-1));
    out.push(coords[index]);
  }
  return out;
}
function nearestWeatherRow(lat,lon){
  let best=null,bestDistance=Infinity;
  for(const r of state.rows){
    if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude))continue;
    const d=haversineKm([lat,lon],[r.latitude,r.longitude]);
    if(d<bestDistance){bestDistance=d;best=r;}
  }
  return best?{row:best,distance:bestDistance}:null;
}
function routeClass(level){return level==="high"?"route-high":level==="caution"?"route-caution":level==="normal"?"route-normal":"route-good"}
async function analyzeRoute(){
  const from=findRouteRow($("#routeFrom")?.value),to=findRouteRow($("#routeTo")?.value),box=$("#routeResult");
  if(!from||!to){if(box){box.className="route-result";box.innerHTML="<strong>請先選擇起點與終點。</strong>"}return}
  if(from.city===to.city&&from.town===to.town){if(box){box.className="route-result";box.innerHTML="<strong>起點與終點不能相同。</strong>"}return}
  const button=$("#analyzeRouteBtn");
  button.disabled=true;button.textContent="正在規劃道路並分析沿線天氣…";
  try{
    const routeUrls=[
      "https://router.project-osrm.org/route/v1/driving/"+from.longitude+","+from.latitude+";"+to.longitude+","+to.latitude+"?overview=full&geometries=geojson&steps=false",
      "https://routing.openstreetmap.de/routed-car/route/v1/driving/"+from.longitude+","+from.latitude+";"+to.longitude+","+to.latitude+"?overview=full&geometries=geojson&steps=false"
    ];
    let data=null;
    for(const url of routeUrls){
      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),12000);
        const res=await fetch(url,{signal:controller.signal});
        const text=await res.text();
        clearTimeout(timer);
        let parsed=null;
        try{parsed=JSON.parse(text)}catch(_){}
        if(res.ok&&parsed?.code==="Ok"&&parsed?.routes?.length){data=parsed;break}
      }catch(_){}
    }
    if(!data)throw new Error("目前無法取得這兩個地點之間的道路路線。請稍後再試。");
    const route=data.routes[0],coords=route.geometry.coordinates.map(p=>[p[1],p[0]]);
    const samples=sampleRoutePoints(coords,30);
    const nearby=[];
    const seen=new Set();
    for(const p of samples){
      const hit=nearestWeatherRow(p[0],p[1]);
      if(hit&&!seen.has(hit.row.city+"||"+hit.row.town)){
        seen.add(hit.row.city+"||"+hit.row.town);nearby.push(hit);
      }
    }
    const conditions=nearby.map(x=>x.row.riding||ridingCondition(x.row)).filter(c=>Number.isFinite(c.score));
    if(!conditions.length)throw new Error("沿線沒有足夠的氣象資料可供分析。");
    const maxScore=Math.max(...conditions.map(c=>c.score));
    const avgScore=conditions.reduce((a,c)=>a+c.score,0)/conditions.length;
    const level=routeLevel(maxScore),decision=routeDecision(level.level);
    const worst=nearby.reduce((best,x)=>((x.row.riding?.score??ridingCondition(x.row).score)>(best.row.riding?.score??ridingCondition(best.row).score)?x:best),nearby[0]);
    const reasons=[...new Set(conditions.flatMap(c=>c.reasons||[]))];
    const distanceKm=route.distance/1000,durationMin=Math.round(route.duration/60);
    const rainValues=nearby.map(x=>x.row.pop).filter(Number.isFinite);
    const maxRain=rainValues.length?Math.max(...rainValues):null;
    const worstRain=Number.isFinite(worst.row.pop)?worst.row.pop:null;
    box.className="route-result "+routeClass(level.level);
    box.innerHTML=
      '<div class="route-result-head"><div class="route-result-title">'+from.city+"｜"+from.town+" → "+to.city+"｜"+to.town+'</div><strong class="route-result-level">'+level.icon+" "+level.label+'</strong></div>'+
      '<div class="route-score-row"><div class="route-score"><strong>'+maxScore+'</strong><span>最差 Score</span></div><div class="route-summary">依道路路線沿線 '+nearby.length+' 個氣象資料點分析。<br><strong>建議：'+decision.icon+" "+decision.label+'</strong><br>最需注意路段：'+worst.row.city+"｜"+worst.row.town+'</div></div>'+
      '<div class="route-evidence"><div><span>道路距離</span><strong>'+distanceKm.toFixed(1)+' km</strong></div><div><span>預估車程</span><strong>'+durationMin+' 分鐘</strong></div><div><span>沿線平均 Score</span><strong>'+avgScore.toFixed(1)+'</strong></div><div><span>最高降雨機率</span><strong>'+(maxRain==null?"--":maxRain+" %")+'</strong></div></div>'+
      '<div class="route-reasons">主要因素：'+(reasons.length?reasons.join("、"):"目前沒有明顯不利因素")+'<br><span>最需注意路段降雨機率：'+(worstRain==null?"--":worstRain+" %")+'</span></div>';
    if(taiwanMap){
      if(routeLayer)routeLayer.remove();
      routeLayer=L.polyline(coords,{color:"#7dd3fc",weight:5,opacity:.85}).addTo(taiwanMap);
      const bounds=L.latLngBounds(coords);taiwanMap.fitBounds(bounds.pad(.12));
    }
  }catch(e){
    console.error(e);
    box.className="route-result";
    box.innerHTML="<strong>路線分析失敗</strong><p class=\"route-hint\">"+e.message+"</p>";
  }finally{
    button.disabled=false;button.textContent="分析這段路的可騎行性";
  }
}

function loadDefaults(){
  try{const saved=JSON.parse(localStorage.getItem(DEFAULT_KEY)||"[]");if(Array.isArray(saved)&&saved.length)state.defaultCities=saved.slice(0,9)}catch(_){}
}
function saveDefaults(){localStorage.setItem(DEFAULT_KEY,JSON.stringify(state.defaultCities.slice(0,9)));updateDefaultCount()}
function updateDefaultCount(){$("#defaultCount").textContent=state.defaultCities.length+" / 9"}
function ensureDefaults(){
  const available=cities();
  state.defaultCities=state.defaultCities.filter(c=>available.includes(c));
  if(!state.defaultCities.length)state.defaultCities=available.slice(0,9);
  state.defaultCities=state.defaultCities.slice(0,9);
  saveDefaults();
}
function normalizeSearchText(value=""){
  return String(value).trim().replaceAll("臺","台").replaceAll("台灣","台灣");
}
function renderSuggestions(){
  const box=$("#suggestions"),q=normalizeSearchText($("#searchInput").value);
  state.suggestionItems=[];state.suggestionIndex=-1;
  if(!q){box.classList.add("hidden");$("#townSelectWrap").classList.add("hidden");return}

  const cityMatches=cities().filter(city=>normalizeSearchText(city).includes(q));
  const townMatches=state.rows.filter(r=>normalizeSearchText(r.town).includes(q));

  // 完整輸入縣市名稱：維持原本行為，顯示該縣市的鄉鎮下拉選單。
  const exactCity=cities().find(city=>normalizeSearchText(city)===q);
  if(exactCity){
    state.selectedCity=exactCity;state.selectedTown="";
    populateTownSelect(exactCity);
    $("#townSelectWrap").classList.remove("hidden");
    $("#searchHint").textContent="已輸入："+exactCity+"，請從下方下拉選單選擇該地區的鄉鎮。";
    box.classList.add("hidden");
    renderCityCards(exactCity);
    return;
  }

  const items=[];
  const seenCities=new Set();
  cityMatches.forEach(city=>{
    if(seenCities.has(city))return;
    seenCities.add(city);
    items.push({type:"city",city,town:"",name:city,label:"縣市"});
  });

  // 同名鄉鎮可能存在於不同縣市，因此保留每一筆，讓使用者能直接選到正確資料。
  townMatches.forEach(r=>items.push({type:"town",city:r.city,town:r.town,name:r.town,label:"鄉鎮"}));

  state.suggestionItems=items;
  box.innerHTML="";
  items.slice(0,10).forEach((m,i)=>{
    const b=document.createElement("button");
    b.type="button";b.className="suggestion";b.dataset.index=i;
    b.innerHTML="<span>"+m.name+"</span><small>"+m.label+(m.type==="town"?"｜"+m.city:"")+"</small>";
    b.addEventListener("click",()=>selectSearch(m));
    b.addEventListener("mouseenter",()=>setSuggestionIndex(i));
    box.appendChild(b);
  });
  box.classList.toggle("hidden",!items.length);
  $("#townSelectWrap").classList.add("hidden");
}
function setSuggestionIndex(index){
  const visibleCount=Math.min(state.suggestionItems.length,10);
  if(!visibleCount)return;
  state.suggestionIndex=Math.max(0,Math.min(index,visibleCount-1));
  document.querySelectorAll("#suggestions .suggestion").forEach((el,i)=>el.classList.toggle("active",i===state.suggestionIndex));
  const active=document.querySelector("#suggestions .suggestion.active");
  if(active)active.scrollIntoView({block:"nearest"});
}
function handleSearchKeydown(e){
  const box=$("#suggestions");
  if(box.classList.contains("hidden")){
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      const q=normalizeSearchText($("#searchInput").value);
      if(q){renderSuggestions();e.preventDefault();}
    }
    return;
  }
  const count=Math.min(state.suggestionItems.length,10);
  if(!count)return;
  if(e.key==="ArrowDown"){
    e.preventDefault();setSuggestionIndex(state.suggestionIndex<0?0:state.suggestionIndex+1);
  }else if(e.key==="ArrowUp"){
    e.preventDefault();setSuggestionIndex(state.suggestionIndex<0?count-1:state.suggestionIndex-1);
  }else if(e.key==="Enter"){
    if(state.suggestionIndex>=0){e.preventDefault();selectSearch(state.suggestionItems[state.suggestionIndex]);}
  }else if(e.key==="Escape"){
    e.preventDefault();box.classList.add("hidden");state.suggestionIndex=-1;
  }
}
function selectSearch(m){
  $("#suggestions").classList.add("hidden");
  state.suggestionIndex=-1;
  state.selectedCity=m.city;
  state.selectedTown=m.town||"";
  $("#searchInput").value=m.type==="town"?m.town:m.city;

  if(m.type==="town"){
    // 搜尋到鄉鎮時直接顯示該筆資料，不需要再選一次縣市。
    $("#townSelectWrap").classList.add("hidden");
    renderTownResult(m.city,m.town);
    $("#searchHint").textContent="目前顯示："+m.city+"｜"+m.town+"（鄉鎮）。";
    return;
  }

  populateTownSelect(m.city);
  $("#townSelectWrap").classList.remove("hidden");
  $("#searchHint").textContent="已選擇："+m.city+"，請從下方下拉選單選擇該地區的鄉鎮。";
  renderCityCards(m.city);
  setTimeout(()=>{$("#townSelect").focus();},0);
}
function populateTownSelect(city,selected=""){
  const sel=$("#townSelect");sel.innerHTML='<option value="">請選擇鄉鎮</option>';
  towns(city).forEach(r=>{const o=document.createElement("option");o.value=r.town;o.textContent=r.town;if(r.town===selected)o.selected=true;sel.appendChild(o)});
}
function renderTownResult(city,town){
  const r=state.rows.find(x=>x.city===city&&x.town===town);if(!r)return;
  renderRows([r],false);
  $("#searchHint").textContent="目前顯示："+city+"｜"+town+"。選擇其他鄉鎮即可切換。";
}
function renderCityCards(city){renderRows([cityRepresentative(city)].filter(Boolean),false);$("#searchHint").textContent="已選擇："+city+"，下方選單可查看該縣市所有鄉鎮。"}
function renderRows(rows,showAll=false){
  const g=$("#weatherGrid");g.innerHTML="";
  if(!rows.length){g.innerHTML='<div class="source-card"><strong>沒有符合的資料</strong><p>請重新搜尋或清除選擇。</p></div>';return}
  const t=$("#weatherTemplate");
  rows.forEach(r=>{
    const n=t.content.cloneNode(true),check=n.querySelector(".default-check");
    n.querySelector(".city").textContent=r.town;n.querySelector(".town").textContent=r.city;
    n.querySelector(".weather-icon").textContent=icon(r.weather);n.querySelector(".temp").textContent=fmt(r.temperature);
    n.querySelector(".weather-name").textContent=r.weather;n.querySelector(".humidity").textContent=fmt(r.humidity,"%");n.querySelector(".pop").textContent=fmt(r.pop,"%");
    n.querySelector(".wind-direction").textContent=windArrow(r.windDirection)+" "+(r.windDirection||"--");n.querySelector(".wind-speed").textContent=fmt(r.windSpeed," m/s");
    const riding=r.riding||ridingCondition(r);
    const decision=buildDecisionSupport(r);
    const levelEl=n.querySelector(".riding-level");
    const panel=n.querySelector(".riding-panel");
    levelEl.textContent=(riding.icon||"")+" "+(riding.label||"資料不足");
    panel.className="riding-panel riding-"+(riding.level||"unknown");
    n.querySelector(".riding-score-value").textContent=Number.isFinite(riding.score)?riding.score:"--";
    n.querySelector(".riding-reasons-value").textContent=riding.reasons?.length?riding.reasons.join("、"):"目前沒有明顯不利因素";
    n.querySelector(".riding-advice-value").textContent=riding.advice||"請留意最新天氣資訊。";
    const decisionPanel=n.querySelector(".decision-panel");
    decisionPanel.className="decision-panel decision-"+decision.action.toLowerCase();
    n.querySelector(".decision-action").textContent=decision.actionIcon+" "+decision.actionLabel;
    n.querySelector(".decision-evidence").textContent=decision.evidence.join("、");
    n.querySelector(".forecast-time").textContent=r.start?"預報時間："+new Date(r.start).toLocaleString("zh-TW",{hour12:false}):"預報時間：--";
    check.checked=state.defaultCities.includes(r.city);
    check.addEventListener("change",()=>toggleDefault(r.city,check.checked));
    g.appendChild(n);
  });
}
function toggleDefault(city,on){
  if(on){if(state.defaultCities.includes(city))return;if(state.defaultCities.length>=9){alert("預設顯示最多 9 個縣市，請先取消其他縣市。");renderDefaultCards();return}state.defaultCities.push(city)}
  else state.defaultCities=state.defaultCities.filter(c=>c!==city);
  saveDefaults();renderDefaultCards();
}
function renderDefaultCards(){
  const rows=state.defaultCities.map(city=>cityRepresentative(city)).filter(Boolean);
  renderRows(rows,true);
  $("#searchHint").textContent="勾選「預設」即可讓該縣市在下次開啟網頁時自動出現；最多 9 個。";
}
function clearSearch(){
  state.selectedCity="";state.suggestionItems=[];state.suggestionIndex=-1;state.selectedTown="";$("#searchInput").value="";$("#townSelect").innerHTML='<option value="">請先選擇縣市</option>';$("#townSelectWrap").classList.add("hidden");$("#suggestions").classList.add("hidden");renderDefaultCards();
}
function summary(){
  const ts=state.rows.map(r=>r.temperature).filter(Number.isFinite),hs=state.rows.map(r=>r.humidity).filter(Number.isFinite);
  $("#cityCount").textContent=cities().length;$("#recordCount").textContent=state.rows.length;
  $("#avgTemp").textContent=ts.length?(ts.reduce((a,b)=>a+b,0)/ts.length).toFixed(1)+" °C":"--";
  $("#avgHumidity").textContent=hs.length?(hs.reduce((a,b)=>a+b,0)/hs.length).toFixed(1)+" %":"--";
}
let taiwanMap=null;
let weatherMarkers=[];
let routeLayer=null;

function weatherMarkerStyle(r){
  const temp=Number(r.temperature);
  if(Number.isFinite(temp)&&temp>=30)return {radius:8,fillColor:"#fb7185",color:"#fecdd3"};
  if(Number.isFinite(temp)&&temp>=26)return {radius:8,fillColor:"#fbbf24",color:"#fde68a"};
  return {radius:8,fillColor:"#38bdf8",color:"#bae6fd"};
}

function initTaiwanMap(){
  if(taiwanMap||typeof L==="undefined")return;
  taiwanMap=L.map("taiwanMap",{zoomControl:true,preferCanvas:true}).setView([23.7,121.0],7);
  L.tileLayer("https://wmts.nlsc.gov.tw/wmts/EMAP/default/EPSG:3857/{z}/{y}/{x}",{
    maxZoom:19,
    attribution:"&copy; OpenStreetMap &copy; CARTO"
  }).addTo(taiwanMap);
}

function renderTaiwanMap(){
  initTaiwanMap();
  if(!taiwanMap)return;
  weatherMarkers.forEach(m=>m.remove());
  weatherMarkers=[];
  const defaults=state.defaultCities.map(city=>cityRepresentative(city)).filter(r=>r&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
  $("#mapCount").textContent=defaults.length+" 個預設地區";
  defaults.forEach(r=>{
    const s=weatherMarkerStyle(r);
    const riding=r.riding||ridingCondition(r);
    const marker=L.circleMarker([r.latitude,r.longitude],{
      radius:s.radius,fillColor:s.fillColor,color:s.color,weight:1.5,fillOpacity:.82
    }).addTo(taiwanMap);
    marker.bindPopup('<div class="weather-popup"><h4>'+r.city+"｜"+r.town+'</h4><div class="weather-temp">'+fmt(r.temperature," °C")+'</div><p>💧 濕度：'+fmt(r.humidity," %")+'</p><p>🌧️ 降雨機率：'+fmt(r.pop," %")+'</p><p>💨 風向：'+(r.windDirection||"--")+'</p><p>💨 風速：'+fmt(r.windSpeed," m/s")+'</p><p><strong>🏍️ 騎乘條件：'+(riding.icon||"")+" "+(riding.label||"--")+'</strong></p><p>評分：'+(Number.isFinite(riding.score)?riding.score:"--")+'</p><p class="popup-muted">'+(riding.reasons?.length?"主要因素："+riding.reasons.join("、")+"<br>":"")+(riding.advice||"")+'</p></div>');
    weatherMarkers.push(marker);
  });
  if(defaults.length){
    const bounds=L.latLngBounds(defaults.map(r=>[r.latitude,r.longitude]));
    taiwanMap.fitBounds(bounds.pad(.12));
  }else{
    taiwanMap.setView([23.7,121.0],7);
  }
  setTimeout(()=>taiwanMap.invalidateSize(),100);
}

function status(a,b){$("#statusTitle").textContent=a;$("#statusText").textContent=b}
async function loadWeather(){
  status("正在取得資料…","正在透過網站後端連線至中央氣象署。");$("#refreshBtn").disabled=true;$("#refreshBtn").textContent="取得資料中......";
  try{
    const res=await fetch(API_URL),data=await res.json().catch(()=>null);
    if(!res.ok)throw new Error(data?.message||data?.result?.message||("HTTP "+res.status));
    if(data?.success===false)throw new Error(data?.result?.message||data?.message||"CWA API 回傳錯誤");
    state.rows=parseRows(data);
    if(!state.rows.length)throw new Error("API 有回應，但沒有可顯示的預報資料。");
    loadDefaults();ensureDefaults();summary();renderDefaultCards();populateRouteSelects();renderTaiwanMap();
    $("#updatedAt").textContent=new Date().toLocaleString("zh-TW",{hour12:false});
    status("資料取得成功","目前取得 "+state.rows.length+" 筆鄉鎮資料，可搜尋縣市或鄉鎮。");
  }catch(e){console.error(e);status("取得資料失敗",e.message)}finally{$("#refreshBtn").disabled=false;$("#refreshBtn").textContent="重新取得資料"}
}
$("#refreshBtn").addEventListener("click",loadWeather);
$("#searchInput").addEventListener("input",renderSuggestions);
$("#searchInput").addEventListener("keydown",handleSearchKeydown);
$("#townSelect").addEventListener("change",e=>{if(!state.selectedCity)return;if(e.target.value)renderTownResult(state.selectedCity,e.target.value);else renderCityCards(state.selectedCity)});
$("#clearSearchBtn").addEventListener("click",clearSearch);
$("#analyzeRouteBtn").addEventListener("click",analyzeRoute);\n$("#weeklyCitySelect")?.addEventListener("change",()=>{renderWeeklyDayOptions();renderWeeklyForecast()});\n$("#weeklyDaySelect")?.addEventListener("change",renderWeeklyForecast);
document.addEventListener("click",e=>{if(!e.target.closest(".search-field"))$("#suggestions").classList.add("hidden")});
window.addEventListener("load",loadWeather);