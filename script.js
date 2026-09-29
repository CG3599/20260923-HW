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
      rows.push({city,town:l?.LocationName||"未知鄉鎮",latitude:num(l?.Latitude),longitude:num(l?.Longitude),temperature:num(first("溫度","Temperature").Temperature),humidity:num(first("相對濕度","RelativeHumidity").RelativeHumidity),pop:num(first("降雨機率","ProbabilityOfPrecipitation").ProbabilityOfPrecipitation),windDirection:first("風向","WindDirection").WindDirection??"--",windSpeed:num(first("風速","WindSpeed").WindSpeed),weather:first("天氣現象","Weather").Weather??"資料待更新",start:find("溫度","Temperature")?.Time?.[0]?.StartTime||find("溫度","Temperature")?.Time?.[0]?.DataTime||""});
    }
  }
  return rows;
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

  return {score,level,label,icon,reasons};
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
    const marker=L.circleMarker([r.latitude,r.longitude],{
      radius:s.radius,fillColor:s.fillColor,color:s.color,weight:1.5,fillOpacity:.82
    }).addTo(taiwanMap);
    marker.bindPopup('<div class="weather-popup"><h4>'+r.city+"｜"+r.town+'</h4><div class="weather-temp">'+fmt(r.temperature," °C")+'</div><p>💧 濕度：'+fmt(r.humidity," %")+'</p><p>🌧️ 降雨機率：'+fmt(r.pop," %")+'</p><p>💨 風向：'+(r.windDirection||"--")+'</p><p>💨 風速：'+fmt(r.windSpeed," m/s")+'</p><p class="popup-muted">'+(r.weather||"資料待更新")+'</p></div>');
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
  status("正在取得資料…","正在透過網站後端連線至中央氣象署。");$("#refreshBtn").disabled=true;
  try{
    const res=await fetch(API_URL),data=await res.json().catch(()=>null);
    if(!res.ok)throw new Error(data?.message||data?.result?.message||("HTTP "+res.status));
    if(data?.success===false)throw new Error(data?.result?.message||data?.message||"CWA API 回傳錯誤");
    state.rows=parseRows(data);
    if(!state.rows.length)throw new Error("API 有回應，但沒有可顯示的預報資料。");
    loadDefaults();ensureDefaults();summary();renderDefaultCards();renderTaiwanMap();
    $("#updatedAt").textContent=new Date().toLocaleString("zh-TW",{hour12:false});
    status("資料取得成功","目前取得 "+state.rows.length+" 筆鄉鎮資料，可搜尋縣市或鄉鎮。");
  }catch(e){console.error(e);status("取得資料失敗",e.message)}finally{$("#refreshBtn").disabled=false}
}
$("#refreshBtn").addEventListener("click",loadWeather);
$("#searchInput").addEventListener("input",renderSuggestions);
$("#searchInput").addEventListener("keydown",handleSearchKeydown);
$("#townSelect").addEventListener("change",e=>{if(!state.selectedCity)return;if(e.target.value)renderTownResult(state.selectedCity,e.target.value);else renderCityCards(state.selectedCity)});
$("#clearSearchBtn").addEventListener("click",clearSearch);
document.addEventListener("click",e=>{if(!e.target.closest(".search-field"))$("#suggestions").classList.add("hidden")});
window.addEventListener("load",loadWeather);