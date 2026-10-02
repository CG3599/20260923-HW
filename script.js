const API_URL="/api/weather";
const state={rows:[],selectedCity:"",selectedTown:"",selectedDate:"",routeDate:"",forecastDates:[],defaultLocations:[],suggestionItems:[],suggestionIndex:-1};
const DEFAULT_KEY="weatherDefaultLocations";
let cartoBasemapKey=(window.__CARTO_CONFIG__&&window.__CARTO_CONFIG__.key)||"";
function loadCartoBasemapKey(){
  if(!cartoBasemapKey)throw new Error("CARTO_API_KEY 尚未設定。");
  return cartoBasemapKey;
}

const $=s=>document.querySelector(s);

function icon(t=""){if(t.includes("雷"))return"⛈️";if(t.includes("雨"))return"🌧️";if(t.includes("雪"))return"❄️";if(t.includes("霧"))return"🌫️";if(t.includes("晴時多雲"))return"🌤️";if(t.includes("晴"))return"☀️";if(t.includes("多雲"))return"⛅";if(t.includes("陰"))return"☁️";return"🌈"}
function num(v){if(v==null||v===""||v==="--"||v==="無資料")return null;const n=Number(v);return Number.isFinite(n)?n:null}
function windArrow(direction=""){const d=String(direction);if(d.includes("北北東")||d.includes("東北"))return"↗️";if(d.includes("東南")||d.includes("南東"))return"↘️";if(d.includes("南西")||d.includes("西南"))return"↙️";if(d.includes("西北")||d.includes("北西"))return"↖️";if(d.includes("東"))return"➡️";if(d.includes("南"))return"⬇️";if(d.includes("西"))return"⬅️";if(d.includes("北"))return"⬆️";return"🧭"}

function parseRows(data){
  // SQLite API 回傳的是扁平化的 Locations rows；
  // 舊版 CWA API 則是「縣市 -> Location -> WeatherElement」巢狀格式。
  if(data?.source==="SQLite"){
    const records=data?.records?.Locations||[];
    const groups=new Map();
    for(const r of records){
      const key=(r?.city||"未知縣市")+"||"+(r?.town||"未知鄉鎮");
      if(!groups.has(key)){
        groups.set(key,{
          city:r?.city||"未知縣市",
          town:r?.town||"未知鄉鎮",
          latitude:num(r?.latitude),
          longitude:num(r?.longitude),
          forecast:[]
        });
      }
      groups.get(key).forecast.push({
        city:r?.city||"未知縣市",
        town:r?.town||"未知鄉鎮",
        latitude:num(r?.latitude),
        longitude:num(r?.longitude),
        temperature:num(r?.temperature),
        humidity:num(r?.humidity),
        pop:num(r?.pop),
        windDirection:r?.wind_direction??"--",
        windSpeed:num(r?.wind_speed),
        weather:r?.weather??"資料待更新",
        start:r?.forecast_time||""
      });
    }
    return [...groups.values()].map(g=>{
      g.forecast.sort((a,b)=>new Date(a.start)-new Date(b.start));
      const now=Date.now();
      const current=g.forecast.reduce((best,r)=>{
        if(!best)return r;
        return Math.abs(new Date(r.start)-now)<Math.abs(new Date(best.start)-now)?r:best;
      },g.forecast[0]||null);
      const row=current||{
        city:g.city,town:g.town,latitude:g.latitude,longitude:g.longitude,
        temperature:null,humidity:null,pop:null,windDirection:"--",windSpeed:null,weather:"資料待更新",start:""
      };
      row.forecast=g.forecast;
      row.city=g.city; row.town=g.town; row.latitude=g.latitude; row.longitude=g.longitude;
      const riding=ridingCondition(row);
      return {...row,riding};
    });
  }
  // 保留舊版 CWA 原始資料格式解析能力。
  const groups=data?.records?.Locations||[],rows=[];
  for(const group of groups){
    const city=group?.LocationsName||"未知縣市";
    for(const l of group?.Location||[]){
      const es=l?.WeatherElement||[];
      const find=(...names)=>es.find(x=>names.includes(x.ElementName));
      const temperatureEl=find("溫度","Temperature");
      const humidityEl=find("相對濕度","RelativeHumidity");
      const popEl=find("3小時降雨機率","3小時降雨機率（%）","降雨機率","ProbabilityOfPrecipitation","3-hour ProbabilityOfPrecipitation");
      const windDirectionEl=find("風向","WindDirection");
      const windSpeedEl=find("風速","WindSpeed");
      const weatherEl=find("天氣現象","Weather");
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
      const times=new Map();
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
    Number.isFinite(r.pop)?("降雨機率 "+fmt(r.pop," %")):"降雨機率：資料缺失",
    Number.isFinite(r.windSpeed)?("風速 "+fmt(r.windSpeed," m/s")):"風速：資料缺失"
  ].filter(Boolean);
  return {
    action,actionLabel,actionIcon,score:riding.score,reasons,evidence,
    advice:riding.advice,rainGear:riding.rainGear,rainRisk:riding.rainRisk
  };
}

function ridingAdvice(condition){
  const reasons=condition?.reasons||[];
  const level=condition?.level;
  if(condition?.rainGear==="強烈建議攜帶"){
    return "降雨風險較高，建議攜帶雨具並在出發前再次確認最新天氣。";
  }
  if(level==="high"){
    return "目前騎乘條件較不利，出發前請重新確認最新天氣資訊，並留意降雨、風勢或極端溫度。";
  }
  if(level==="caution"){
    if(reasons.some(x=>x.includes("降雨")||x.includes("陣雨")||x.includes("雷雨")||x.includes("大雨")||x.includes("豪雨"))){
      return "騎乘時需留意降雨，建議攜帶雨具並持續確認天氣變化。";
    }
    if(reasons.includes("風速強")||reasons.includes("風速偏強")||reasons.includes("風速較高")){
      return "騎乘時需留意風勢，經過橋梁、開闊路段時請特別注意。";
    }
    return "目前騎乘條件需注意，建議出發前再次確認天氣與路況。";
  }
  if(level==="normal"){
    return condition?.rainGear==="建議攜帶"
      ? "整體騎乘條件尚可，但有降雨可能，建議攜帶雨具並持續留意天氣。"
      : "整體騎乘條件尚可，仍建議持續留意降雨與風勢變化。";
  }
  return condition?.rainGear==="建議攜帶"
    ? "目前騎乘條件穩定，但仍有降雨可能，建議攜帶雨具。"
    : "目前天氣條件較穩定，適合一般騎乘；出發前仍可確認最新天氣資訊。";
}

function classifyRainRisk(pop,weather){
  const text=String(weather||"").replaceAll("臺","台");
  let weatherLevel=0;
  if(/大豪雨|豪雨|強烈雷雨/.test(text))weatherLevel=4;
  else if(/雷雨|雷陣雨|大雨|強陣雨/.test(text))weatherLevel=3;
  else if(/短暫雨|短暫陣雨|午後.*陣雨|陣雨|有雨|降雨|持續降雨/.test(text))weatherLevel=1;
  let popLevel=null;
  if(Number.isFinite(pop)){
    if(pop>=90)popLevel=4;
    else if(pop>=70)popLevel=3;
    else if(pop>=50)popLevel=2;
    else if(pop>=20)popLevel=1;
    else popLevel=0;
  }
  const riskLevel=Math.max(weatherLevel,popLevel==null?0:popLevel);
  const penalty=Math.min(4,riskLevel);
  let rainRisk="低";
  if(riskLevel>=4)rainRisk="極高";
  else if(riskLevel>=3)rainRisk="高";
  else if(riskLevel>=2)rainRisk="中高";
  else if(riskLevel>=1)rainRisk="中";
  let rainGear="不需特別準備";
  if(riskLevel>=4)rainGear="強烈建議攜帶";
  else if(riskLevel>=2)rainGear="建議攜帶";
  else if(riskLevel===1)rainGear=(weatherLevel>=1||popLevel>=1)?"建議攜帶":"可考慮攜帶";
  return {riskLevel,penalty,rainRisk,rainGear,weatherLevel,popLevel};
}

function ridingCondition(r){
  const temp=num(r?.temperature);
  const humidity=num(r?.humidity);
  const wind=num(r?.windSpeed);
  const pop=num(r?.pop);
  const weather=String(r?.weather||"");
  let score=5;
  const reasons=[];
  const missing=[];

  const rain=classifyRainRisk(pop,weather);
  if(rain.penalty>0){
    if(rain.popLevel>=4)reasons.push("降雨機率極高");
    else if(rain.popLevel===3)reasons.push("降雨機率高");
    else if(rain.popLevel===2)reasons.push("降雨機率偏高");
    else if(rain.popLevel===1)reasons.push("有降雨可能");
    if(rain.weatherLevel>=4)reasons.push("嚴重降雨");
    else if(rain.weatherLevel===3)reasons.push("雷雨或強降雨");
    else if(rain.weatherLevel===1 && !/晴時多雲|多雲/.test(weather))reasons.push("可能出現陣雨");
  }
  if(!Number.isFinite(pop))missing.push("降雨機率資料缺失");

  let windPenalty=0;
  if(Number.isFinite(wind)){
    if(wind>=13){windPenalty=4;reasons.push("強風");}
    else if(wind>=10){windPenalty=3;reasons.push("風速強");}
    else if(wind>=7){windPenalty=2;reasons.push("風速偏強");}
    else if(wind>=5){windPenalty=1;reasons.push("風速較高");}
  }else{
    missing.push("風速資料缺失");
  }

  let tempPenalty=0;
  if(Number.isFinite(temp)){
    if(temp>=35){tempPenalty=3;reasons.push("高溫");}
    else if(temp>=33){tempPenalty=2;reasons.push("炎熱");}
    else if(temp>=30){tempPenalty=1;reasons.push("氣溫偏高");}
    else if(temp<10){tempPenalty=2;reasons.push("低溫");}
    else if(temp<15){tempPenalty=1;reasons.push("氣溫偏低");}
  }else{
    missing.push("溫度資料缺失");
  }

  let humidityPenalty=0;
  if(Number.isFinite(humidity)){
    if(humidity>=90){humidityPenalty=1;reasons.push("濕度高");}
    else if(humidity>=85){humidityPenalty=1;reasons.push("濕度偏高");}
  }else{
    missing.push("濕度資料缺失");
  }

  const availableFactors=[temp,humidity,wind,pop].filter(Number.isFinite).length;
  if(missing.length)reasons.push("部分氣象資料缺失，評分僅依目前可用資料估算");

  const incomplete=availableFactors===0;
  if(incomplete){
    return {
      score:null,level:"normal",label:"資料不足",icon:"🟡",
      reasons:reasons.length?reasons:["目前沒有可用的騎乘評估資料"],
      missing,incomplete:true,weatherRisk:false,rainRisk:rain.rainRisk,rainGear:rain.rainGear,
      rainPenalty:rain.penalty,advice:"目前缺少可用的氣象資料，暫時無法估算騎乘條件。"
    };
  }

  score-=rain.penalty+windPenalty+tempPenalty+humidityPenalty;

  // 主要不利因素同時出現時，避免單項扣分不足以反映整體騎乘環境。
  const majorFactors=[
    rain.riskLevel>=1,
    windPenalty>=1,
    tempPenalty>=2
  ].filter(Boolean).length;
  if(majorFactors>=3){
    score=Math.min(score,2);
    reasons.push("多項主要不利因素同時存在");
  }else if(majorFactors>=2){
    score=Math.min(score,3);
    reasons.push("同時存在多項不利因素");
  }

  // 嚴重降雨／雷雨設定最高分，避免其他舒適條件抵銷明顯的降雨風險。
  if(rain.weatherLevel>=4)score=Math.min(score,1);
  else if(rain.weatherLevel===3)score=Math.min(score,2);
  else if(rain.weatherLevel===1)score=Math.min(score,4);

  score=Math.max(0,Math.min(5,score));

  let level="good",label="良好",icon="🟢";
  if(score<=1){level="high";label="高風險";icon="🔴";}
  else if(score===2){level="caution";label="需注意";icon="🟠";}
  else if(score===3){level="normal";label="普通";icon="🟡";}

  const condition={
    score,level,label,icon,reasons,missing,incomplete:false,
    weatherRisk:rain.riskLevel>=2,rainRisk:rain.rainRisk,rainGear:rain.rainGear,
    rainPenalty:rain.penalty
  };
  condition.advice=missing.length
    ? "目前以已取得的氣象資料估算騎乘條件；部分資料缺失，結果可能存在誤差。"
    : ridingAdvice(condition);
  return condition;
}
function ridingLevel(score){
  if(score<=1)return {level:"high",label:"高風險",icon:"🔴"};
  if(score===2)return {level:"caution",label:"需注意",icon:"🟠"};
  if(score===3)return {level:"normal",label:"普通",icon:"🟡"};
  return {level:"good",label:"良好",icon:"🟢"};
}

function fmt(v,s=""){return v==null?"--":(Number.isInteger(v)?v:v.toFixed(1))+s}
function taiwanDateKey(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return "";
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function todayTaiwan(){
  return taiwanDateKey(new Date());
}
function availableForecastDates(){
  if(state.forecastDates.length)return state.forecastDates.slice(0,7);
  const set=new Set();
  state.rows.forEach(r=>(r.forecast||[]).forEach(item=>{
    const key=taiwanDateKey(item.start);
    if(key)set.add(key);
  }));
  state.forecastDates=[...set].sort().slice(0,7);
  return state.forecastDates;
}
function formatForecastDate(key){
  if(!key)return "";
  const d=new Date(key+"T00:00:00+08:00");
  if(Number.isNaN(d.getTime()))return key;
  const month=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  const weekday=["日","一","二","三","四","五","六"][d.getDay()];
  return month+"/"+day+" (週"+weekday+")";
}
function formatTaiwanDateTime(value){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return "--";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(d);
  const get=t=>parts.find(p=>p.type===t)?.value||"00";
  return get("year")+"/"+get("month")+"/"+get("day")+" "+get("hour")+":"+get("minute")+":"+get("second");
}
function rowForDate(r,dateKey=state.selectedDate){
  if(!r)return null;
  const items=(r.forecast||[]).filter(x=>taiwanDateKey(x.start)===dateKey);
  if(!items.length)return null;
  const target=new Date(dateKey+"T12:00:00+08:00").getTime();
  return items.slice().sort((a,b)=>Math.abs(new Date(a.start).getTime()-target)-Math.abs(new Date(b.start).getTime()-target))[0]||items[0];
}
function selectedRows(rows=state.rows){
  const dateKey=state.selectedDate||todayTaiwan();
  return rows.map(r=>rowForDate(r,dateKey)).filter(Boolean).map(x=>{
    const base=state.rows.find(r=>r.city===x.city&&r.town===x.town)||x;
    return {...x,forecast:base.forecast||x.forecast};
  });
}
function populateForecastDateSelect(){
  const sel=$("#forecastDateSelect");
  if(!sel)return;
  const dates=availableForecastDates();
  const today=todayTaiwan();
  state.selectedDate=dates.includes(state.selectedDate)?state.selectedDate:(dates.includes(today)?today:(dates[0]||""));
  sel.innerHTML=dates.map(key=>'<option value="'+key+'">'+formatForecastDate(key)+'</option>').join("");
  sel.value=state.selectedDate;
}
function refreshSelectedDateView(){
  const rows=selectedRows();
  if(state.selectedCity&&state.selectedTown){
    const r=rows.find(x=>x.city===state.selectedCity&&x.town===state.selectedTown);
    if(r)renderRows([r],false);
    else renderDefaultCards();
  }else if(state.selectedCity){
    renderCityCards(state.selectedCity);
  }else{
    renderDefaultCards();
  }
  lazyLoadTaiwanMap();
}
function cities(){return [...new Set(state.rows.map(r=>r.city))]}
function towns(city){return state.rows.filter(r=>r.city===city).sort((a,b)=>a.town.localeCompare(b.town,"zh-Hant"))}
function cityRepresentative(city){const rs=towns(city);return rs[0]||null}
function routeOptionValue(r){return r.city+"||"+r.town}
function routeDateValue(){const dates=availableForecastDates();if(!dates.length)return todayTaiwan();if(!state.routeDate||!dates.includes(state.routeDate))state.routeDate=dates.includes(todayTaiwan())?todayTaiwan():dates[0];return state.routeDate;}
function routeWeatherRow(r){return rowForDate(r,routeDateValue())||r;}
function findRouteRow(value){const [city,town]=String(value||"").split("||");const base=state.rows.find(r=>r.city===city&&r.town===town)||null;return base?routeWeatherRow(base):null;}
function populateRouteDateSelect(){const sel=$("#routeDateSelect");if(!sel)return;const dates=availableForecastDates();state.routeDate=dates.includes(state.routeDate)?state.routeDate:(dates.includes(todayTaiwan())?todayTaiwan():(dates[0]||""));sel.innerHTML=dates.map(key=>'<option value="'+key+'">'+formatForecastDate(key)+(key===todayTaiwan()?" · 今天":"")+'</option>').join("");sel.value=state.routeDate;}
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
function focusNextRouteField(side){
  setTimeout(()=>{
    if(side==="from"){
      const next=$("#routeToSearch");
      if(next)next.focus();
    }else{
      const button=$("#analyzeRouteBtn");
      if(button)button.focus();
    }
  },0);
}
function focusRouteTown(side){
  setTimeout(()=>{
    const town=routeSearchElements(side).town;
    if(town)town.focus();
  },0);
}
function setRouteLocation(side,r){
  const e=routeSearchElements(side); if(!r)return;
  e.value.value=routeOptionValue(r); e.input.value=r.town;
  e.townWrap.classList.add("hidden"); e.suggestions.classList.add("hidden");
  focusNextRouteField(side);
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
    focusRouteTown(side);
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
  focusRouteTown(side);
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

function routeStepText(step){
  return [step?.ref,step?.name,step?.destinations,step?.exits].filter(Boolean).join(" ");
}
function routeHasForbiddenNationalMain(route){
  const steps=(route?.legs||[]).flatMap(leg=>leg?.steps||[]);
  const nationalPattern=/國道\s*(1|2|3|4|5|6|7|8|9|10)\s*(號|線)?/;
  return steps.some(step=>{
    const text=routeStepText(step).replaceAll("臺","台");
    if(/國道\s*甲/.test(text))return false;
    if(nationalPattern.test(text))return true;
    if(/(?:中山高速公路|福爾摩沙高速公路|北二高|二高|蔣渭水高速公路|北宜高速公路|水沙連高速公路|高速公路)/.test(text))return true;
    if(step?.road_classification?.motorway_class===true)return true;
    const ref=String(step?.ref||"").replaceAll("臺","台").trim();
    if(/^國道\s*(1|2|3|4|5|6|7|8|9|10)\s*(號|線)?$/.test(ref))return true;
    return false;
  });
}
function routeHasExpressway(route){
  const steps=(route?.legs||[]).flatMap(leg=>leg?.steps||[]);
  const expresswayPattern=/(?:台|臺)\s*(61|62|64|65|66|68|72|74|76|78|82|84|86|88)\s*(?:線)?/;
  return steps.some(step=>{
    const text=routeStepText(step).replaceAll("臺","台");
    if(step?.road_classification?.trunk_class===true)return true;
    if(expresswayPattern.test(text))return true;
    const ref=String(step?.ref||"").replaceAll("臺","台").trim();
    return /^(?:台|臺)?\s*(61|62|64|65|66|68|72|74|76|78|82|84|86|88)\s*(?:線)?$/.test(ref);
  });
}
function routeRoadTier(route){
  if(routeHasForbiddenNationalMain(route))return 0;
  return routeHasExpressway(route)?2:1;
}
function routePolicyLabel(route){
  const tier=routeRoadTier(route);
  return tier===0?"⚠️ 路線仍包含國道主線":tier===2?"🚫 國道禁止・快速道路優先":"🚫 國道禁止・一般平面道路";
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
  for(let i=0;i<n;i++)out.push(coords[Math.round(i*(coords.length-1)/(n-1))]);
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
function routeCandidateAnalysis(route){
  const coords=(route?.geometry?.coordinates||[]).map(p=>[p[1],p[0]]);
  const nearby=[];const seen=new Set();
  for(const p of sampleRoutePoints(coords,30)){
    const hit=nearestWeatherRow(p[0],p[1]);
    if(hit){
      const weatherRow=routeWeatherRow(hit.row);
      const key=weatherRow.city+"||"+weatherRow.town;
      if(!seen.has(key)){seen.add(key);nearby.push({...hit,row:weatherRow});}
    }
  }
  const conditions=nearby.map(x=>x.row.riding||ridingCondition(x.row)).filter(c=>Number.isFinite(c.score));
  const rainLevels=nearby.map(x=>(x.row.riding||ridingCondition(x.row)).rainPenalty||0);
  const pops=nearby.map(x=>x.row.pop).filter(Number.isFinite);
  return {
    route,coords,nearby,conditions,
    roadTier:routeRoadTier(route),
    rainMetric:rainLevels.length?rainLevels.reduce((a,b)=>a+b,0)/rainLevels.length:0,
    maxPop:pops.length?Math.max(...pops):null,
    minScore:conditions.length?Math.min(...conditions.map(c=>c.score)):null,
    avgScore:conditions.length?conditions.reduce((a,c)=>a+c.score,0)/conditions.length:null
  };
}
function loadRouteHistory(){try{const x=JSON.parse(localStorage.getItem(ROUTE_HISTORY_KEY)||"[]");return Array.isArray(x)?x.slice(0,10):[];}catch(_){return [];}}
function renderRouteHistory(){
  const box=$("#routeHistoryList");if(!box)return;const history=loadRouteHistory();
  if(!history.length){box.innerHTML='<div class="route-history-empty">尚無歷史路線查詢。</div>';return;}
  box.innerHTML=history.map((h,i)=>{const f=h.from||{},t=h.to||{},d=h.time?new Date(h.time):null;const tm=d&&!Number.isNaN(d.getTime())?formatTaiwanDateTime(d):"--";return '<button type="button" class="route-history-item" data-history-index="'+i+'"><div><div class="route-history-route">'+(f.city||"--")+"｜"+(f.town||"--")+" → "+(t.city||"--")+"｜"+(t.town||"--")+'</div><span class="route-history-time">'+tm+'</span></div><span class="route-history-arrow">›</span></button>';}).join("");
  box.querySelectorAll(".route-history-item").forEach(btn=>btn.addEventListener("click",()=>{const h=history[Number(btn.dataset.historyIndex)];if(!h)return;if(h.date){state.routeDate=h.date;const ds=$("#routeDateSelect");if(ds)ds.value=h.date;}const f=findRouteRow((h.from?.city||"")+"||"+(h.from?.town||"")),t=findRouteRow((h.to?.city||"")+"||"+(h.to?.town||""));if(f)setRouteLocation("from",f);if(t)setRouteLocation("to",t);}));
}
function saveRouteHistoryItem(from,to){
  const date=routeDateValue();const key=from.city+"||"+from.town+"=>"+to.city+"||"+to.town+"=>"+date;
  const history=loadRouteHistory().filter(h=>(h.from?.city+"||"+h.from?.town+"=>"+h.to?.city+"||"+h.to?.town+"=>"+(h.date||todayTaiwan()))!==key);
  history.unshift({from:{city:from.city,town:from.town},to:{city:to.city,town:to.town},date,time:Date.now()});
  try{localStorage.setItem(ROUTE_HISTORY_KEY,JSON.stringify(history.slice(0,10)));}catch(_){}
  renderRouteHistory();
}
let routeDiagnostics=[];
function resetRouteDiagnostics(){
  routeDiagnostics=[];
}
function routeDiagnosticEntry(entry){
  routeDiagnostics.push({
    time:new Date().toISOString(),
    ...entry
  });
}
function routeDiagnosticRoadType(route){
  const steps=(route?.legs||[]).flatMap(leg=>leg?.steps||[]);
  const refs=[...new Set(steps.map(s=>String(s?.ref||"").trim()).filter(Boolean))];
  const names=[...new Set(steps.map(s=>String(s?.name||"").trim()).filter(Boolean))];
  const classes=[...new Set(steps.map(s=>s?.road_classification||{}).flatMap(x=>Object.entries(x).filter(([,v])=>v===true).map(([k])=>k)))];
  return {
    tier:routeRoadTier(route),
    hasNational:routeHasForbiddenNationalMain(route),
    hasExpressway:routeHasExpressway(route),
    refs:refs.slice(0,12),
    names:names.slice(0,12),
    classes
  };
}
function routeDiagnosticRouteSummary(route){
  return {
    distance:Number(route?.distance||0),
    duration:Number(route?.duration||0),
    road:routeDiagnosticRoadType(route)
  };
}
async function requestOsrmRoutes(base,query,timeoutMs=18000,diagnostic={}){
  const started=Date.now();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(base+query,{signal:controller.signal});
    const text=await res.text();let data=null;try{data=JSON.parse(text)}catch(_){}
    const routes= res.ok&&data?.code==="Ok"&&Array.isArray(data.routes)?data.routes:[];
    routeDiagnosticEntry({
      kind:"osrm",
      provider:base,
      context:diagnostic.context||"unknown",
      segment:diagnostic.segment??null,
      status:res.status,
      code:data?.code||null,
      routeCount:routes.length,
      elapsedMs:Date.now()-started,
      routes:routes.slice(0,3).map(routeDiagnosticRouteSummary)
    });
    return routes;
  }catch(error){
    routeDiagnosticEntry({
      kind:"osrm",
      provider:base,
      context:diagnostic.context||"unknown",
      segment:diagnostic.segment??null,
      status:null,
      code:null,
      routeCount:0,
      elapsedMs:Date.now()-started,
      error:error?.name==="AbortError"?"timeout":String(error?.message||error)
    });
    return [];
  }finally{clearTimeout(timer);}
}
async function requestRouteFromServers(coords,options=""){
  const bases=["https://router.project-osrm.org/","https://routing.openstreetmap.de/routed-car/"];
  for(const root of bases){
    const routes=await requestOsrmRoutes(root+"route/v1/driving/"+coords,options,22000);
    if(routes.length)return routes;
  }
  return [];
}
async function requestOsrmNearestCandidates(base,lat,lon,timeoutMs=10000,diagnostic={}){
  const started=Date.now();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(base+"nearest/v1/driving/"+lon+","+lat+"?number=8",{signal:controller.signal});
    const data=await res.json().catch(()=>null);
    const waypoints=res.ok&&data?.code==="Ok"&&Array.isArray(data.waypoints)?data.waypoints:[];
    routeDiagnosticEntry({
      kind:"nearest",
      provider:base,
      context:diagnostic.context||"unknown",
      segment:diagnostic.segment??null,
      status:res.status,
      code:data?.code||null,
      waypointCount:waypoints.length,
      waypoints:waypoints.slice(0,8).map(w=>({name:w?.name||"",ref:w?.ref||"",location:w?.location||null,classes:w?.classes||[]})),
      elapsedMs:Date.now()-started
    });
    return waypoints;
  }catch(error){
    routeDiagnosticEntry({
      kind:"nearest",
      provider:base,
      context:diagnostic.context||"unknown",
      segment:diagnostic.segment??null,
      status:null,
      code:null,
      waypointCount:0,
      elapsedMs:Date.now()-started,
      error:error?.name==="AbortError"?"timeout":String(error?.message||error)
    });
    return [];
  }finally{clearTimeout(timer);}
}
function isNationalWaypoint(w){
  const text=[w?.name,w?.ref,w?.classes].filter(Boolean).join(" ").replaceAll("臺","台");
  return /國道\s*(1|2|3|4|5|6|7|8|9|10)\s*(號|線)?/.test(text)||
    /(?:中山高速公路|福爾摩沙高速公路|北二高|二高|蔣渭水高速公路|北宜高速公路|水沙連高速公路|高速公路)/.test(text);
}
async function snapPointNonNational(root,r,diagnostic={}){
  const candidates=await requestOsrmNearestCandidates(root,r.latitude,r.longitude,10000,diagnostic);
  const usable=candidates.filter(w=>w?.location&&!isNationalWaypoint(w));
  const chosen=usable[0]||null;
  routeDiagnosticEntry({
    kind:"snap",
    provider:root,
    context:diagnostic.context||"unknown",
    segment:diagnostic.segment??null,
    input:{latitude:r.latitude,longitude:r.longitude},
    candidateCount:candidates.length,
    usableCount:usable.length,
    chosen:chosen?{name:chosen.name||"",ref:chosen.ref||"",location:chosen.location||null,classes:chosen.classes||[]}:null,
    rejectedNational:candidates.filter(w=>isNationalWaypoint(w)).slice(0,8).map(w=>({name:w?.name||"",ref:w?.ref||"",classes:w?.classes||[]}))
  });
  return chosen?.location||null;
}
async function requestOsrmTierCandidates(coords){
  const bases=["https://router.project-osrm.org/","https://routing.openstreetmap.de/routed-car/"];
  const queries=[
    "?overview=full&geometries=geojson&steps=true&alternatives=3&continue_straight=false&exclude=motorway",
    "?overview=full&geometries=geojson&steps=true&alternatives=3&continue_straight=false&annotations=true"
  ];
  const all=[],seen=new Set();
  for(const root of bases){
    for(const q of queries){
      const routes=await requestOsrmRoutes(root+"route/v1/driving/"+coords,q,22000,{context:"tier-candidate"});
      for(const route of routes){
        if(routeHasForbiddenNationalMain(route))continue;
        const key=(route.geometry?.coordinates||[]).slice(0,5).map(p=>p.join(",")).join("|")+"|"+Math.round(Number(route.distance||0))+"|"+Math.round(Number(route.duration||0));
        if(!seen.has(key)){seen.add(key);all.push(route);}
      }
    }
  }
  return all;
}
function routeIntermediatePoints(from,to,count=8){
  const out=[];
  for(let i=1;i<count;i++){
    const t=i/count;
    const lat=from.latitude+(to.latitude-from.latitude)*t;
    const lon=from.longitude+(to.longitude-from.longitude)*t;
    out.push({latitude:lat,longitude:lon});
  }
  return out;
}
async function requestSegmentedRoute(from,to,mode){
  const bases=["https://router.project-osrm.org/","https://routing.openstreetmap.de/routed-car/"];
  const segmentCounts=mode==="expressway"?[4,6,8]:[6,8,10,12];
  for(const root of bases){
    for(const count of segmentCounts){
      const raw=[from,...routeIntermediatePoints(from,to,count),to];
      const snapped=[];
      let failed=false;
      for(let pointIndex=0;pointIndex<raw.length;pointIndex++){
        const p=raw[pointIndex];
        const loc=await snapPointNonNational(root,p,{context:"segmented-snap",segment:pointIndex+" / "+(raw.length-1),mode});
        if(!loc){failed=true;break;}
        snapped.push(loc[0]+","+loc[1]);
      }
      if(failed)continue;
      const q="?overview=full&geometries=geojson&steps=true&alternatives=2&continue_straight=false&exclude=motorway";
      const parts=[];
      for(let i=0;i<snapped.length-1;i++){
        let routes=await requestOsrmRoutes(root+"route/v1/driving/"+snapped[i]+";"+snapped[i+1],q,20000,{context:"segmented-route",segment:i+" / "+(snapped.length-1),mode,from:snapped[i],to:snapped[i+1]});
        if(!routes.length){
          const fallbackQ="?overview=full&geometries=geojson&steps=true&alternatives=2&continue_straight=false&annotations=true";
          routes=await requestOsrmRoutes(root+"route/v1/driving/"+snapped[i]+";"+snapped[i+1],fallbackQ,20000,{context:"segmented-route-fallback-no-exclude",segment:i+" / "+(snapped.length-1),mode,from:snapped[i],to:snapped[i+1]});
        }
        const candidates=routes.filter(r=>!routeHasForbiddenNationalMain(r));
        if(!candidates.length){failed=true;break;}
        let chosen;
        if(mode==="expressway"){
          const express=candidates.filter(r=>routeHasExpressway(r));
          chosen=(express.slice().sort((a,b)=>a.duration-b.duration)[0]||candidates.slice().sort((a,b)=>a.duration-b.duration)[0]);
        }else{
          const flat=candidates.filter(r=>!routeHasExpressway(r));
          chosen=(flat.slice().sort((a,b)=>a.duration-b.duration)[0]||candidates.slice().sort((a,b)=>a.duration-b.duration)[0]);
        }
        parts.push(chosen);
      }
      if(failed||!parts.length)continue;
      const coords=[],legs=[];let distance=0,duration=0;
      for(const part of parts){
        distance+=Number(part.distance||0);duration+=Number(part.duration||0);
        if(part.geometry?.coordinates?.length)coords.push(...(coords.length?part.geometry.coordinates.slice(1):part.geometry.coordinates));
        legs.push(...(part.legs||[]));
      }
      if(coords.length>1){
        const route={distance,duration,geometry:{type:"LineString",coordinates:coords},legs};
        if(!routeHasForbiddenNationalMain(route))return route;
      }
    }
  }
  return null;
}
async function requestValhallaFlatRoute(from,to,waypoints=[]){
  const locations=[from,...waypoints,to].map(r=>({lat:r.latitude,lon:r.longitude,type:"break"}));
  const payload={locations,costing:"motorcycle",costing_options:{motorcycle:{use_highways:0,use_trails:0}},units:"kilometers",directions_options:{units:"kilometers"}};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    const res=await fetch("https://valhalla1.openstreetmap.de/route",{method:"POST",headers:{"Content-Type":"application/json","X-Client-Id":"ridesky-weather"},body:JSON.stringify(payload),signal:controller.signal});
    const data=await res.json().catch(()=>null),trip=data?.trip;
    if(!res.ok||!trip?.legs?.length)return null;
    const coords=[],steps=[];
    for(const leg of trip.legs){
      if(leg.shape){const part=decodePolyline6(leg.shape);if(part.length)coords.push(...(coords.length?part.slice(1):part));}
      for(const m of leg.maneuvers||[])steps.push({name:(m.street_names||[]).map(x=>x.value||x.text||String(x)).join(" "),ref:"",destinations:[m.verbal_pre_transition_instruction,m.verbal_post_transition_instruction].filter(Boolean).join(" ")});
    }
    if(coords.length<2)return null;
    const summary=trip.summary||{};
    return {distance:Number(summary.length||0)*1000,duration:Number(summary.time||0),geometry:{type:"LineString",coordinates:coords.map(p=>[p[1],p[0]])},legs:[{steps}]};
  }catch(_){return null}finally{clearTimeout(timer);}
}
function decodePolyline6(str){
  let index=0,lat=0,lng=0,out=[];
  while(index<str.length){
    let result=0,shift=0,b;
    do{b=str.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);
    lat+=result&1?~(result>>1):result>>1;
    result=0;shift=0;
    do{b=str.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);
    lng+=result&1?~(result>>1):result>>1;
    out.push([lat/1e6,lng/1e6]);
  }
  return out;
}
function renderRouteDiagnostics(errorMessage){
  const box=$("#routeResult");
  if(!box)return;
  const rows=routeDiagnostics.map((d,i)=>{
    const provider=d.provider?.replace(/^https?:\/\//,"").replace(/\/$/,"")||"--";
    if(d.kind==="osrm"){
      const routeText=d.routes?.length
        ? d.routes.map((r,j)=>"候選 "+(j+1)+"："+Math.round(r.distance||0)+"m / "+Math.round(r.duration||0)+"s / "+(r.road?.hasExpressway?"快速道路":"一般道路")+(r.road?.hasNational?" / 含國道":" / 無國道")).join("； ")
        : "沒有可用 route";
      return "<details class=\"route-debug-item\""+(i===0?" open":"")+"><summary>"+d.context+" · "+provider+" · segment "+(d.segment??"--")+" · HTTP "+(d.status??"--")+" · "+(d.code||"no route")+"</summary><div class=\"route-debug-body\">"+routeText+(d.error?"<br>錯誤："+d.error:"")+"</div></details>";
    }
    if(d.kind==="snap"){
      const chosen=d.chosen?((d.chosen.ref||"--")+" "+d.chosen.name+" @ "+(d.chosen.location||[]).join(", ")):"❌ 沒有可用非國道道路";
      return "<details class=\"route-debug-item\"><summary>snap · "+d.context+" · segment "+(d.segment??"--")+"</summary><div class=\"route-debug-body\">輸入："+d.input.latitude.toFixed(5)+", "+d.input.longitude.toFixed(5)+"<br>候選："+d.candidateCount+"；非國道："+d.usableCount+"<br>選擇："+chosen+"</div></details>";
    }
    return "";
  }).join("");
  box.className="route-result route-debug";
  box.innerHTML="<strong>路線分析失敗</strong><p class=\"route-hint\">"+errorMessage+"</p><div class=\"route-debug-title\">OSRM 實際診斷</div>"+(rows||"<p>尚無 OSRM 診斷資料。</p>");
}
async function analyzeRoute(){
  resetRouteDiagnostics();
  clearRouteMotorcycleAnimation();
  const from=findRouteRow($("#routeFrom")?.value),to=findRouteRow($("#routeTo")?.value),box=$("#routeResult");
  if(!from||!to){if(box){box.className="route-result";box.innerHTML="<strong>請先選擇起點與終點。</strong>"}return;}
  if(from.city===to.city&&from.town===to.town){if(box){box.className="route-result";box.innerHTML="<strong>起點與終點不能相同。</strong>"}return;}
  const button=$("#analyzeRouteBtn");button.disabled=true;button.textContent="正在依道路階層規劃路線…";
  try{
    const direct=from.longitude+","+from.latitude+";"+to.longitude+","+to.latitude;
    const connected=await requestRouteFromServers(direct,"?overview=false&geometries=geojson&steps=true&alternatives=1");
    if(!connected.length)throw new Error("起點與終點目前無法由路由服務建立道路連通；請稍後再試。");

    // 第一層：國道永遠禁止。先取得所有可驗證的非 motorway 候選。
    let candidates=await requestOsrmTierCandidates(direct);
    let express=candidates.filter(r=>routeRoadTier(r)===2);
    let routingMode="國道禁止";

    // 第二層：只要有快速道路候選，就只在快速道路層選擇。
    if(express.length){
      candidates=express;routingMode="國道禁止／快速道路優先";
    }else{
      // 第二層找不到快速道路，才進入第三層：真正的分段平面道路搜尋。
      const segmentedExpress=await requestSegmentedRoute(from,to,"expressway");
      if(segmentedExpress&&!routeHasForbiddenNationalMain(segmentedExpress)&&routeHasExpressway(segmentedExpress)){
        candidates=[segmentedExpress];routingMode="國道禁止／快速道路分段搜尋";
      }else{
        const segmentedFlat=await requestSegmentedRoute(from,to,"flat");
        if(segmentedFlat&&!routeHasForbiddenNationalMain(segmentedFlat)){
          candidates=[segmentedFlat];routingMode="國道禁止／一般平面道路分段搜尋";
        }else{
          // 最後才使用 Valhalla 作為獨立的平面道路備援。
          // 舊版曾呼叫已移除的 buildDetourWaypoints()，會造成
          // ReferenceError；現在不再依賴不存在的繞行函式，也不再疊加
          // 無法驗證的人工 detour waypoint。
          const fallbackRoute=await requestValhallaFlatRoute(from,to,[]);
          if(fallbackRoute&&!routeHasForbiddenNationalMain(fallbackRoute)){
            candidates=[fallbackRoute];
            routingMode="國道禁止／一般平面道路備援";
          }
        }
      }
    }

    if(!candidates.length)throw new Error("已確認起點與終點存在道路，但目前無法建立符合「國道禁止 → 快速道路優先 → 平面道路」規則的完整路線。");

    // 國道永遠淘汰；同一層內才比較時間。
    candidates=candidates.filter(r=>routeRoadTier(r)>0);
    if(!candidates.length)throw new Error("路由服務回傳的候選路線均含國道主線，已全部排除。");

    routeCandidates=candidates.map(route=>routeCandidateAnalysis(route)).filter(x=>x.coords.length>1).sort((a,b)=>a.route.duration-b.route.duration);
    const fast=routeCandidates[0];
    if(!fast)throw new Error("路由服務有回應，但沒有可繪製的完整道路幾何。");

    // 低降雨路線只從「同一優先道路層」的真實候選中產生，不虛構第二條。
    const maxAllowed=fast.route.duration*1.25+900;
    const pool=routeCandidates.filter(x=>x.route.duration<=maxAllowed);
    const dry=pool.slice().sort((a,b)=>a.rainMetric-b.rainMetric||a.route.duration-b.route.duration)[0];
    routeCandidates=[fast];
    if(dry&&dry!==fast)routeCandidates.push(dry);

    activeRouteCandidateIndex=0;
    activeRouteEndpoints={from,to,routingMode};
    saveRouteHistoryItem(from,to);
    activateRouteCandidate(0);
  }catch(e){
    console.error(e);
    renderRouteDiagnostics(e.message);
  }finally{
    button.disabled=false;button.textContent="分析這段路的可騎行性";
  }
}
function clearRoute(){
  clearRouteMotorcycleAnimation();
  if(routeLayer){routeLayer.remove();routeLayer=null;}
  clearRouteEndpoints();routeCandidates=[];activeRouteCandidateIndex=0;
  const from=routeSearchElements("from"),to=routeSearchElements("to");
  [from,to].forEach(e=>{if(!e)return;e.input.value="";e.input.dataset.city="";e.input.dataset.mode="";e.input.dataset.index="-1";e.value.value="";e.suggestions.innerHTML="";e.suggestions.classList.add("hidden");e.townWrap.classList.add("hidden");e.town.innerHTML='<option value="">請先選擇縣市</option>';});
  const box=$("#routeResult");if(box){box.className="route-result hidden";box.innerHTML="";}
  const button=$("#analyzeRouteBtn");if(button){button.disabled=false;button.textContent="分析這段路的可騎行性";}
}
function normalizeDefaultLocation(value){
  if(typeof value==="string"){
    const r=cityRepresentative(value);
    return r?{city:r.city,town:r.town}:null;
  }
  if(!value||!value.city)return null;
  const city=state.rows.find(r=>r.city===value.city);
  if(!city)return null;
  const town=value.town||city.town;
  const r=state.rows.find(row=>row.city===value.city&&row.town===town);
  return r?{city:r.city,town:r.town}:null;
}
function loadDefaults(){
  try{
    const saved=JSON.parse(localStorage.getItem(DEFAULT_KEY)||"[]");
    if(Array.isArray(saved)&&saved.length){
      state.defaultLocations=saved.map(normalizeDefaultLocation).filter(Boolean).slice(0,9);
      return;
    }
    const legacy=JSON.parse(localStorage.getItem(LEGACY_DEFAULT_KEY)||"[]");
    if(Array.isArray(legacy)&&legacy.length){
      state.defaultLocations=legacy.map(normalizeDefaultLocation).filter(Boolean).slice(0,9);
      saveDefaults();
    }
  }catch(_){}
}
function saveDefaults(){
  localStorage.setItem(DEFAULT_KEY,JSON.stringify(state.defaultLocations.slice(0,9)));
  updateDefaultCount();
}
function updateDefaultCount(){
  $("#defaultCount").textContent=state.defaultLocations.length+" / 9";
}
function ensureDefaults(){
  const normalized=state.defaultLocations.map(normalizeDefaultLocation).filter(Boolean);
  state.defaultLocations=normalized.slice(0,9);
  if(!state.defaultLocations.length){
    state.defaultLocations=cities().slice(0,9).map(city=>{
      const r=cityRepresentative(city);
      return r?{city:r.city,town:r.town}:null;
    }).filter(Boolean);
  }
  saveDefaults();
}
function normalizeSearchText(value=""){
  return String(value).trim().replaceAll("臺","台").replaceAll("台灣","台灣");
}
function openDefaultCities(){
  const panel=document.querySelector(".default-cities-collapse");
  if(panel)panel.open=true;
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
    openDefaultCities();
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
    openDefaultCities();
    $("#searchHint").textContent="目前顯示："+m.city+"｜"+m.town+"（鄉鎮）。";
    return;
  }

  populateTownSelect(m.city);
  $("#townSelectWrap").classList.remove("hidden");
  $("#searchHint").textContent="已選擇："+m.city+"，請從下方下拉選單選擇該地區的鄉鎮。";
  renderCityCards(m.city);
  openDefaultCities();
  setTimeout(()=>{$("#townSelect").focus();},0);
}
function populateTownSelect(city,selected=""){
  const sel=$("#townSelect");sel.innerHTML='<option value="">請選擇鄉鎮</option>';
  towns(city).forEach(r=>{const o=document.createElement("option");o.value=r.town;o.textContent=r.town;if(r.town===selected)o.selected=true;sel.appendChild(o)});
}
function renderTownResult(city,town){
  const r=selectedRows().find(x=>x.city===city&&x.town===town);if(!r)return;
  state.selectedCity=city;
  state.selectedTown=town;
  openDefaultCities();
  renderRows([r],false);
  $("#searchHint").textContent="目前顯示："+city+"｜"+town+"。選擇其他鄉鎮即可切換。";
}
function renderCityCards(city){openDefaultCities();$("#weatherGrid").innerHTML="";$("#searchHint").textContent="已選擇："+city+"，請從下方下拉選單選擇鄉鎮；選擇後才會顯示該鄉鎮資料。"}
function forecastDays(r){
  const forecast=(r?.forecast||[]).filter(x=>x?.start).sort((a,b)=>new Date(a.start)-new Date(b.start));
  const days=new Map();
  for(const item of forecast){
    const d=new Date(item.start);
    const key=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
    if(!days.has(key))days.set(key,[]);
    days.get(key).push(item);
  }
  return [...days.entries()].slice(0,7).map(([key,items],index)=>{
    const temps=items.map(x=>x.temperature).filter(Number.isFinite);
    const pops=items.map(x=>x.pop).filter(Number.isFinite);
    const hums=items.map(x=>x.humidity).filter(Number.isFinite);
    const winds=items.map(x=>x.windSpeed).filter(Number.isFinite);
    const representativeWeather=items.find(x=>x.weather&&x.weather!=="資料待更新")?.weather||"資料待更新";
    const riding=ridingCondition({
      temperature:temps.length?temps.reduce((a,b)=>a+b,0)/temps.length:null,
      humidity:hums.length?hums.reduce((a,b)=>a+b,0)/hums.length:null,
      pop:pops.length?Math.max(...pops):null,
      windSpeed:winds.length?Math.max(...winds):null,
      weather:representativeWeather
    });
    return {
      key,items,index,
      dateLabel:index===0?"今天":index===1?"明天":index===2?"後天":`第${index+1}天`,
      temp:temps.length?temps.reduce((a,b)=>a+b,0)/temps.length:null,
      minTemp:temps.length?Math.min(...temps):null,
      maxTemp:temps.length?Math.max(...temps):null,
      pop:pops.length?Math.max(...pops):null,
      humidity:hums.length?hums.reduce((a,b)=>a+b,0)/hums.length:null,
      wind:winds.length?Math.max(...winds):null,
      weather:items.find(x=>x.weather&&x.weather!=="資料待更新")?.weather||"資料待更新",
      riding
    };
  });
}
function buildLineChart(days,type){
  const width=720,height=220,pad={l:48,r:24,t:30,b:42};
  const values=days.map(d=>type==="temp"?d.temp:d.pop).map(v=>Number.isFinite(v)?v:null);
  const valid=values.filter(v=>v!==null);
  if(!valid.length)return '<div class="forecast-chart-empty">目前沒有可用資料</div>';
  let min=Math.min(...valid),max=Math.max(...valid);
  if(type==="temp"){min=Math.floor(min-1);max=Math.ceil(max+1);}
  else {min=Math.max(0,Math.floor(min/10)*10);max=Math.min(100,Math.ceil(max/10)*10);if(min===max){min=Math.max(0,min-10);max=Math.min(100,max+10);}}
  if(min===max){min-=1;max+=1;}
  const x=i=>pad.l+(days.length===1?0:i*(width-pad.l-pad.r)/(days.length-1));
  const y=v=>pad.t+(max-v)*(height-pad.t-pad.b)/(max-min);
  const points=values.map((v,i)=>v===null?null:`${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(" ");
  const unit=type==="temp"?"°C":"%";
  const title=type==="temp"?"🌡️ 溫度變化":"🌧️ 降雨機率變化";
  const labels=days.map((d,i)=>`<text x="${x(i)}" y="${height-14}" text-anchor="middle" class="forecast-chart-label">${d.dateLabel}</text>`).join("");
  const dots=values.map((v,i)=>v===null?"":`<circle cx="${x(i)}" cy="${y(v)}" r="4" class="forecast-chart-dot"><title>${days[i].dateLabel}：${v.toFixed(0)}${unit}</title></circle>`).join("");
  const guides=[0,.5,1].map(t=>{const value=max-(max-min)*t;return `<line x1="${pad.l}" x2="${width-pad.r}" y1="${y(value)}" y2="${y(value)}" class="forecast-chart-grid"/><text x="${pad.l-9}" y="${y(value)+4}" text-anchor="end" class="forecast-chart-y">${value.toFixed(0)}${unit}</text>`;}).join("");
  return `<div class="forecast-chart"><div class="forecast-chart-title"><strong>${title}</strong><span>7 日趨勢</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><g>${guides}</g><polyline points="${points}" class="forecast-chart-line" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline><g>${dots}</g><g>${labels}</g></svg></div>`;
}
function renderThreeDayForecast(container,r){
  container.innerHTML="";
  const days=forecastDays(r);
  if(!days.length){container.innerHTML='<p class="muted">目前沒有可用的 7 日預報資料。</p>';return;}
  container.innerHTML='<div class="forecast-charts">'+buildLineChart(days,"temp")+buildLineChart(days,"pop")+'</div><div class="forecast-day-list">'+
    days.map(d=>'<div class="three-day-item '+(d.riding?.level||"good")+'"><div class="three-day-head"><strong>'+d.dateLabel+'</strong><span>'+d.key+'</span></div><div class="three-day-weather">'+icon(d.weather)+' '+d.weather+'</div><div class="three-day-values"><span>🌡️ '+(d.minTemp!=null?d.minTemp+"–"+d.maxTemp:"--")+' °C</span><span>🌧️ 降雨機率 '+(d.pop!=null?d.pop:"--")+' %</span><span>💧 濕度 '+(d.humidity!=null?d.humidity.toFixed(0):"--")+' %</span><span>💨 最高風速 '+(d.wind!=null?d.wind.toFixed(1):"--")+' m/s</span></div><div class="three-day-riding"><span>🏍️ 騎乘條件</span><strong>'+((d.riding?.icon)||"")+" "+((d.riding?.label)||"資料不足")+(d.riding?.incomplete?"":" · "+(Number.isFinite(d.riding?.score)?d.riding.score:"--")+" / 5")+'</strong></div><div class="three-day-riding-reasons">'+(d.riding?.reasons?.length?d.riding.reasons.join("、"):"目前沒有明顯不利因素")+'</div></div>').join("")+
    '</div>';
}
function bindForecastCollapse(details){
  if(!details)return;
  details.addEventListener("toggle",()=>{
    if(details.open)document.querySelectorAll(".three-day-collapse[open]").forEach(other=>{if(other!==details)other.open=false;});
    const card=details.closest(".weather-card");
    if(!card)return;
    card.classList.toggle("forecast-expanded",details.open);
    if(details.open){
      requestAnimationFrame(()=>{
        const charts=details.querySelectorAll(".forecast-chart");
        charts.forEach((chart,i)=>{
          chart.style.animation="none";
          void chart.offsetWidth;
          chart.style.animation="";
          chart.style.animationDelay=(i*70)+"ms";
        });
      });
    }
  });
}
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
    const rainGearEl=n.querySelector(".rain-gear-value");
    if(rainGearEl)rainGearEl.textContent=(riding.rainGear||"資料不足")+(riding.rainRisk?"（降雨風險："+riding.rainRisk+"）":"");
    const decisionPanel=n.querySelector(".decision-panel");
    decisionPanel.className="decision-panel decision-"+decision.action.toLowerCase();
    n.querySelector(".decision-action").textContent=decision.actionIcon+" "+decision.actionLabel;
    n.querySelector(".decision-evidence").textContent=decision.evidence.join("、");
    n.querySelector(".forecast-time").textContent=r.start?"預報時間："+formatTaiwanDateTime(r.start):"預報時間：--";
    renderThreeDayForecast(n.querySelector(".three-day-forecast"),r);
    bindForecastCollapse(n.querySelector(".three-day-collapse"));
    const defaultLocation=state.defaultLocations.some(d=>d.city===r.city&&d.town===r.town);
    check.checked=defaultLocation;
    check.addEventListener("change",()=>toggleDefault(r.city,r.town,check.checked));
    g.appendChild(n);
  });
}
function toggleDefault(city,town,on){
  const key=city+"||"+town;
  if(on){
    if(state.defaultLocations.some(d=>d.city+"||"+d.town===key))return;
    if(state.defaultLocations.length>=9){
      alert("預設顯示最多 9 個地區，請先取消其他預設地區。");
      renderDefaultCards();
      return;
    }
    state.defaultLocations.push({city,town});
  }else{
    state.defaultLocations=state.defaultLocations.filter(d=>d.city!==city||d.town!==town);
  }
  saveDefaults();
  if(on&&state.selectedCity===city&&state.selectedTown===town)clearSearch();
  else renderDefaultCards();
}
function renderDefaultCards(){
  const rows=selectedRows(state.defaultLocations.map(d=>state.rows.find(r=>r.city===d.city&&r.town===d.town)).filter(Boolean));
  renderRows(rows,true);
  $("#searchHint").textContent="勾選「預設」即可讓該縣市／鄉鎮在下次開啟網頁時自動出現；最多 9 個。";
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
let routeEndpointMarkers=[];
let routeLayer=null;
let routeCandidates=[];
let activeRouteCandidateIndex=0;
let activeRouteEndpoints=null;
const ROUTE_HISTORY_KEY="rideskyRouteHistoryV1";
let routeMotorcycleMarker=null;
let routeAnimationFrame=null;
let routeAnimationRestartTimer=null;
let routeAnimationToken=0;

function clearRouteMotorcycleAnimation(){
  routeAnimationToken++;
  if(routeAnimationFrame!=null)cancelAnimationFrame(routeAnimationFrame);
  routeAnimationFrame=null;
  if(routeAnimationRestartTimer!=null)clearTimeout(routeAnimationRestartTimer);
  routeAnimationRestartTimer=null;
  if(routeMotorcycleMarker&&taiwanMap){
    taiwanMap.removeLayer(routeMotorcycleMarker);
  }
  routeMotorcycleMarker=null;
}

function routeDistance(a,b){
  const R=6371000,rad=Math.PI/180;
  const dLat=(b[0]-a[0])*rad,dLng=(b[1]-a[1])*rad;
  const x=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function routeBearing(a,b){
  const rad=Math.PI/180;
  const lat1=a[0]*rad,lat2=b[0]*rad,dLng=(b[1]-a[1])*rad;
  const y=Math.sin(dLng)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLng);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}

function startRouteMotorcycleAnimation(coords){
  clearRouteMotorcycleAnimation();
  if(!taiwanMap||!Array.isArray(coords)||coords.length<2)return;
  const token=routeAnimationToken,points=[];let total=0;
  for(let i=0;i<coords.length;i++){if(i>0)total+=routeDistance(coords[i-1],coords[i]);points.push({lat:coords[i][0],lng:coords[i][1],distance:total});}
  if(total<=0)return;
  const icon=L.divIcon({className:"route-motorcycle-marker",html:"<span>🏍️</span>",iconSize:[34,34],iconAnchor:[17,17]});
  routeMotorcycleMarker=L.marker([points[0].lat,points[0].lng],{icon,zIndexOffset:1000,interactive:false}).addTo(taiwanMap);
  const duration=Math.min(30000,Math.max(7000,total/90*1000));
  let start=performance.now(),phase="forward";
  function setPoint(target){
    let i=1;while(i<points.length&&points[i].distance<target)i++;if(i>=points.length)i=points.length-1;
    const a=points[i-1],b=points[i],span=Math.max(1,b.distance-a.distance),local=Math.min(1,Math.max(0,(target-a.distance)/span));
    routeMotorcycleMarker.setLatLng([a.lat+(b.lat-a.lat)*local,a.lng+(b.lng-a.lng)*local]);
    const bearing=routeBearing([a.lat,a.lng],[b.lat,b.lng]),el=routeMotorcycleMarker.getElement()?.querySelector("span");
    if(el)el.style.transform="rotate("+(bearing+90)+"deg)";
  }
  function flyBack(now){
    const progress=Math.min(1,(now-start)/1200),eased=progress<.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;
    const end=points[points.length-1],first=points[0];
    routeMotorcycleMarker.setLatLng([end.lat+(first.lat-end.lat)*eased,end.lng+(first.lng-end.lng)*eased]);
    const el=routeMotorcycleMarker.getElement()?.querySelector("span");if(el)el.style.transform="rotate(-90deg) scale("+(1+0.08*Math.sin(progress*Math.PI))+")";
    if(progress<1){routeAnimationFrame=requestAnimationFrame(flyBack);return;}
    routeAnimationFrame=null;routeMotorcycleMarker.setLatLng([first.lat,first.lng]);phase="forward";start=performance.now();routeAnimationFrame=requestAnimationFrame(frame);
  }
  function frame(now){
    if(token!==routeAnimationToken||!routeMotorcycleMarker)return;
    if(phase==="return"){flyBack(now);return;}
    const progress=Math.min(1,(now-start)/duration);setPoint(total*progress);
    if(progress<1){routeAnimationFrame=requestAnimationFrame(frame);return;}
    routeAnimationFrame=null;setPoint(total);
    routeAnimationRestartTimer=setTimeout(()=>{routeAnimationRestartTimer=null;if(token!==routeAnimationToken||!routeMotorcycleMarker)return;phase="return";start=performance.now();routeAnimationFrame=requestAnimationFrame(frame);},5000);
  }
  routeAnimationFrame=requestAnimationFrame(frame);
}
function weatherMarkerStyle(r){
  const riding=r?.riding||ridingCondition(r);
  const level=riding?.level||"normal";
  const styles={
    good:{fillColor:"#22c55e",color:"#bbf7d0"},
    normal:{fillColor:"#facc15",color:"#fef08a"},
    caution:{fillColor:"#f97316",color:"#fed7aa"},
    high:{fillColor:"#ef4444",color:"#fecaca"}
  };
  const style=styles[level]||styles.normal;
  return {radius:8,...style};
}

function cartoKeyUrl(url,key){
  const separator=url.includes("?")?"&":"?";
  return url+separator+"key="+encodeURIComponent(key);
}

function customizeRideSkyStyle(style,key){
  const custom=JSON.parse(JSON.stringify(style));
  custom.name="RideSky Vector Basemap";
  custom.sources=custom.sources||{};
  Object.values(custom.sources).forEach(source=>{
    if(source&&typeof source.url==="string")source.url=cartoKeyUrl(source.url,key);
  });
  if(custom.sprite)custom.sprite=cartoKeyUrl(custom.sprite,key);
  if(custom.glyphs)custom.glyphs=cartoKeyUrl(custom.glyphs,key);

  const colors={
    background:"#071522",
    land:"#0b1d2b",
    park:"#0d2631",
    water:"#0a2f4a",
    waterway:"#1c6682",
    boundary:"#29485e",
    motorway:"#6f9bb5",
    trunk:"#5f8ca6",
    primary:"#4f7890",
    secondary:"#3c5e73",
    tertiary:"#304d61",
    minor:"#263f52",
    service:"#203747",
    path:"#24485d",
    rail:"#35566b",
    building:"#102536",
    text:"#b9d3e2",
    textStrong:"#d8e8f2",
    textHalo:"#071522"
  };

  for(const layer of custom.layers||[]){
    const sourceLayer=layer["source-layer"]||"";
    const id=String(layer.id||"");
    const filter=JSON.stringify(layer.filter||[]);
    layer.paint=layer.paint||{};

    if(layer.type==="background"){
      layer.paint["background-color"]=colors.background;
      continue;
    }

    if(layer.type==="fill"||layer.type==="fill-extrusion"){
      if(sourceLayer==="water")layer.paint["fill-color"]=colors.water;
      else if(sourceLayer==="landcover"||sourceLayer==="park")layer.paint["fill-color"]=colors.park;
      else if(sourceLayer==="landuse")layer.paint["fill-color"]=colors.land;
      else if(sourceLayer==="building")layer.paint["fill-color"]=colors.building;
      continue;
    }

    if(layer.type==="line"){
      if(sourceLayer==="waterway")layer.paint["line-color"]=colors.waterway;
      else if(sourceLayer==="boundary"){
        layer.paint["line-color"]=colors.boundary;
        layer.paint["line-opacity"]=0.55;
      }else if(sourceLayer==="transportation"){
        let road=colors.minor;
        if(filter.includes('"motorway"'))road=colors.motorway;
        else if(filter.includes('"trunk"'))road=colors.trunk;
        else if(filter.includes('"primary"'))road=colors.primary;
        else if(filter.includes('"secondary"'))road=colors.secondary;
        else if(filter.includes('"tertiary"'))road=colors.tertiary;
        else if(filter.includes('"service"'))road=colors.service;
        else if(filter.includes('"path"'))road=colors.path;
        else if(filter.includes('"rail"'))road=colors.rail;
        if(id.includes("_case"))road="#12293a";
        layer.paint["line-color"]=road;
      }else if(sourceLayer==="aeroway"){
        layer.paint["line-color"]="#29485e";
      }
      continue;
    }

    if(layer.type==="symbol"){
      if(layer.paint["text-color"]!==undefined)layer.paint["text-color"]=sourceLayer==="place"?colors.textStrong:colors.text;
      if(layer.paint["text-halo-color"]!==undefined)layer.paint["text-halo-color"]=colors.textHalo;
      if(layer.paint["icon-color"]!==undefined)layer.paint["icon-color"]="#6f93a8";
      if(sourceLayer==="poi"){
        if(layer.paint["text-opacity"]===undefined)layer.paint["text-opacity"]=0.62;
        if(layer.paint["icon-opacity"]===undefined)layer.paint["icon-opacity"]=0.55;
      }
    }
  }
  return custom;
}

let mapLibrePromise=null;
function loadMapLibreAssets(){
  if(window.maplibregl&&L.maplibreGL)return Promise.resolve();
  if(mapLibrePromise)return mapLibrePromise;
  mapLibrePromise=new Promise((resolve,reject)=>{
    const css=document.createElement("link");
    css.rel="stylesheet";
    css.href="https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css";
    document.head.appendChild(css);

    const mapScript=document.createElement("script");
    mapScript.src="https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js";
    mapScript.onload=()=>{
      const bridge=document.createElement("script");
      bridge.src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js";
      bridge.onload=resolve;
      bridge.onerror=()=>reject(new Error("MapLibre Leaflet 整合套件載入失敗。"));
      document.head.appendChild(bridge);
    };
    mapScript.onerror=()=>reject(new Error("MapLibre GL 載入失敗。"));
    document.head.appendChild(mapScript);
  });
  return mapLibrePromise;
}

async function getRideSkyVectorStyle(key){
  const cacheKey="rideskyVectorStyleV1";
  try{
    const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");
    if(cached?.style?.version&&cached?.savedAt&&Date.now()-cached.savedAt<86400000){
      return customizeRideSkyStyle(cached.style,key);
    }
  }catch(_){}
  const styleUrl=cartoKeyUrl("https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",key);
  const response=await fetch(styleUrl,{cache:"force-cache"});
  if(!response.ok)throw new Error("CARTO Vector Basemap 載入失敗（HTTP "+response.status+"）。");
  const style=await response.json();
  try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),style}));}catch(_){}
  return customizeRideSkyStyle(style,key);
}

async function initTaiwanMap(){
  if(taiwanMap||typeof L==="undefined")return;
  const key=loadCartoBasemapKey();
  await loadMapLibreAssets();
  const style=await getRideSkyVectorStyle(key);

  taiwanMap=L.map("taiwanMap",{
    zoomControl:true,
    preferCanvas:true,
    minZoom:5,
    maxZoom:18,
    maxBounds:[[21.5,118.0],[26.5,123.0]],
    maxBoundsViscosity:0.9
  }).setView([23.7,121.0],7);

  L.maplibreGL({
    style,
    interactive:false,
    attribution:"&copy; OpenStreetMap contributors, &copy; CARTO"
  }).addTo(taiwanMap);
}

let mapLoadScheduled=false;
function lazyLoadTaiwanMap(){
  if(mapLoadScheduled||taiwanMap)return;
  mapLoadScheduled=true;
  const target=document.getElementById("taiwanMap");
  if(!target){
    mapLoadScheduled=false;
    return;
  }
  if("IntersectionObserver" in window){
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();
        renderTaiwanMap();
      }
    },{rootMargin:"600px 0px"});
    observer.observe(target);
  }else{
    setTimeout(()=>renderTaiwanMap(),300);
  }
}

async function renderTaiwanMap(){
  try{
    await initTaiwanMap();
  }catch(error){
    console.error("RideSky Vector Basemap 載入失敗",error);
    $("#mapCount").textContent="地圖載入失敗，請稍後重試";
    return;
  }
  if(!taiwanMap)return;
  weatherMarkers.forEach(m=>m.remove());
  weatherMarkers=[];
  const defaults=selectedRows(state.defaultLocations.map(d=>state.rows.find(r=>r.city===d.city&&r.town===d.town)).filter(r=>r&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)));
  $("#mapCount").textContent=defaults.length+" 個預設地區";
  defaults.forEach(r=>{
    const s=weatherMarkerStyle(r);
    const riding=r.riding||ridingCondition(r);
    const marker=L.circleMarker([r.latitude,r.longitude],{
      radius:s.radius,fillColor:s.fillColor,color:s.color,weight:1.5,fillOpacity:.82
    }).addTo(taiwanMap);
    marker.bindPopup('<div class="weather-popup"><h4>'+r.city+"｜"+r.town+'</h4><div class="weather-temp">'+fmt(r.temperature," °C")+'</div><p>💧 濕度：'+fmt(r.humidity," %")+'</p><p>🌧️ 降雨機率：'+fmt(r.pop," %")+'</p><p>💨 風向：'+(r.windDirection||"--")+'</p><p>💨 風速：'+fmt(r.windSpeed," m/s")+'</p><p><strong>🏍️ 騎乘條件：'+(riding.icon||"")+" "+(riding.label||"--")+'</strong></p><p>評分：'+(Number.isFinite(riding.score)?riding.score:"--")+'</p><p>☔ 雨具建議：'+(riding.rainGear||"--")+'</p><p class="popup-muted">'+(riding.reasons?.length?"主要因素："+riding.reasons.join("、")+"<br>":"")+(riding.advice||"")+'</p></div>');
    weatherMarkers.push(marker);
  });
  if(defaults.length){
    const bounds=L.latLngBounds(defaults.map(r=>[r.latitude,r.longitude]));
    taiwanMap.fitBounds(bounds.pad(.12));
  }else{
    taiwanMap.setView([23.7,121.0],7);
  }
  if(activeRouteEndpoints)renderRouteEndpoints(activeRouteEndpoints.from,activeRouteEndpoints.to);
  setTimeout(()=>taiwanMap.invalidateSize(),100);
}

function status(a,b){$("#statusTitle").textContent=a;$("#statusText").textContent=b}
async function loadWeather(){
  status("正在取得資料…","正在透過網站後端連線至中央氣象署。");
  const statusEl=$("#refreshStatus"),actionEl=$("#refreshAction");
  actionEl.disabled=true;
  statusEl.textContent="取得資料中......";
  statusEl.classList.remove("is-success");
  try{
    const res=await fetch(API_URL),data=await res.json().catch(()=>null);
    if(!res.ok)throw new Error(data?.message||data?.result?.message||("HTTP "+res.status));
    if(data?.success===false)throw new Error(data?.result?.message||data?.message||"CWA API 回傳錯誤");
    state.rows=parseRows(data);
    // 日期選單直接使用 API 明確提供的 7 個預報日期；若舊版 API 尚未提供，
    // 再從實際回傳的 SQLite forecast rows 推導，避免日期選單空白。
    const apiDates=Array.isArray(data?.meta?.forecastDates)
      ? data.meta.forecastDates.map(String).filter(Boolean)
      : [];
    const rowDates=[...new Set(
      state.rows.flatMap(r=>(r.forecast||[]).map(item=>taiwanDateKey(item.start))).filter(Boolean)
    )].sort();
    const fallbackDates=apiDates.length===7?apiDates:rowDates.slice(-7);
    state.forecastDates=fallbackDates.length===7?fallbackDates:[];
    if(!state.forecastDates.length){
      console.warn("預報日期建立失敗：API meta 與 SQLite rows 都沒有 7 個有效日期。",{
        apiDates,rowDates
      });
    }
    populateForecastDateSelect();
    populateRouteDateSelect();
    if(!state.rows.length)throw new Error("API 有回應，但沒有可顯示的預報資料。");
    loadDefaults();ensureDefaults();summary();renderDefaultCards();populateRouteSelects();populateRouteDateSelect();
    lazyLoadTaiwanMap();
    $("#updatedAt").textContent=formatTaiwanDateTime(new Date());
    status("資料取得成功","目前取得 "+state.rows.length+" 筆鄉鎮資料，可搜尋縣市或鄉鎮。");
    statusEl.textContent="取得成功 ✓";
    statusEl.classList.add("is-success");
    actionEl.disabled=false;
    actionEl.textContent="重新取得資料";
    clearTimeout(window.__refreshButtonTimer);
    window.__refreshButtonTimer=setTimeout(()=>{
      statusEl.textContent="取得成功 ✓";
      statusEl.classList.remove("is-success");
      actionEl.disabled=false;
      actionEl.textContent="重新取得資料";
    },5000);
  }catch(e){
    console.error(e);
    status("取得資料失敗",e.message);
    statusEl.textContent="取得失敗";
    statusEl.classList.remove("is-success");
    actionEl.disabled=false;
    actionEl.textContent="重新取得資料";
  }
}
$("#refreshAction").addEventListener("click",loadWeather);
$("#searchInput").addEventListener("input",renderSuggestions);
$("#searchInput").addEventListener("keydown",handleSearchKeydown);
$("#townSelect").addEventListener("change",e=>{
  if(!state.selectedCity)return;
  if(e.target.value){
    renderTownResult(state.selectedCity,e.target.value);
    openDefaultCities();
  }else renderCityCards(state.selectedCity);
});
$("#clearSearchBtn").addEventListener("click",clearSearch);
$("#forecastDateSelect").addEventListener("change",e=>{
  state.selectedDate=e.target.value||todayTaiwan();
  refreshSelectedDateView();
});
$("#routeDateSelect").addEventListener("change",e=>{state.routeDate=e.target.value||todayTaiwan();if(activeRouteEndpoints)analyzeRoute();});
$("#analyzeRouteBtn").addEventListener("click",analyzeRoute);
$("#clearRouteBtn").addEventListener("click",clearRoute);
renderRouteHistory();
document.addEventListener("click",e=>{if(!e.target.closest(".search-field"))$("#suggestions").classList.add("hidden")});
window.addEventListener("load",loadWeather);