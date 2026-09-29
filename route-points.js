(function(){
  const $=s=>document.querySelector(s);
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const km=(a,b)=>{
    const R=6371,p1=a[0]*Math.PI/180,p2=b[0]*Math.PI/180;
    const dp=(b[0]-a[0])*Math.PI/180,dl=(b[1]-a[1])*Math.PI/180;
    const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };
  const condition=r=>{
    const t=num(r.temperature),p=num(r.pop),h=num(r.humidity),w=num(r.windSpeed);
    let s=0;
    if(p>=70)s+=4;else if(p>=40)s+=2;else if(p>=20)s+=1;
    if(w>=10)s+=4;else if(w>=7)s+=3;else if(w>=5)s+=1;
    if(t>=35)s+=4;else if(t>=32)s+=2;else if(t<=10)s+=3;else if(t<=15)s+=1;
    if(h>=90)s+=1;
    return {score:s,level:s>=7?"high":s>=4?"caution":s>=2?"normal":"good"};
  };
  function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
  function weatherIcon(t=""){if(t.includes("雷"))return"⛈️";if(t.includes("雨"))return"🌧️";if(t.includes("雪"))return"❄️";if(t.includes("霧"))return"🌫️";if(t.includes("晴"))return"☀️";if(t.includes("多雲"))return"⛅";if(t.includes("陰"))return"☁️";return"🌈";}
  async function addRoutePoints(){
    const from=$("#routeFrom")?.value,to=$("#routeTo")?.value,box=$("#routeResult");
    if(!from||!to||!box)return;
    const [fc,ft]=from.split("||"),[tc,tt]=to.split("||");
    try{
      const api=await fetch("/api/weather").then(r=>r.json());
      const rows=[];
      for(const g of api?.records?.Locations||[]){
        for(const l of g.Location||[]){
          const es=l.WeatherElement||[],find=(...names)=>es.find(x=>names.includes(x.ElementName)),first=(...names)=>find(...names)?.Time?.[0]?.ElementValue?.[0]||{};
          rows.push({city:g.LocationsName,town:l.LocationName,latitude:num(l.Latitude),longitude:num(l.Longitude),temperature:num(first("溫度","Temperature").Temperature),humidity:num(first("相對濕度","RelativeHumidity").RelativeHumidity),pop:num((()=>{const v=first("3小時降雨機率","3小時降雨機率（%）","降雨機率","ProbabilityOfPrecipitation","3-hour ProbabilityOfPrecipitation");return v.ProbabilityOfPrecipitation??v["3小時降雨機率"]??v["3小時降雨機率（%）"]??Object.values(v)[0]})()),windSpeed:num(first("風速","WindSpeed").WindSpeed),weather:first("天氣現象","Weather").Weather||"資料待更新"});
        }
      }
      const fr=rows.find(r=>r.city===fc&&r.town===ft),tr=rows.find(r=>r.city===tc&&r.town===tt);
      if(!fr||!tr)return;
      const routeUrls=[
        "https://router.project-osrm.org/route/v1/driving/"+fr.longitude+","+fr.latitude+";"+tr.longitude+","+tr.latitude+"?overview=full&geometries=geojson&steps=false",
        "https://routing.openstreetmap.de/routed-car/route/v1/driving/"+fr.longitude+","+fr.latitude+";"+tr.longitude+","+tr.latitude+"?overview=full&geometries=geojson&steps=false"
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
      const coords=data?.routes?.[0]?.geometry?.coordinates?.map(p=>[p[1],p[0]])||[];
      if(!coords.length)return;
      const n=Math.min(30,coords.length),points=[],seen=new Set();
      let cumulative=0;
      for(let i=0;i<n;i++){
        const idx=Math.round(i*(coords.length-1)/(n-1||1));
        if(i>0)cumulative+=km(coords[Math.round((i-1)*(coords.length-1)/(n-1||1))],coords[idx]);
        const p=coords[idx];
        let best=null,bd=Infinity;
        for(const r of rows){
          if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude))continue;
          const d=km(p,[r.latitude,r.longitude]);
          if(d<bd){bd=d;best=r;}
        }
        if(best){
          const key=best.city+"||"+best.town;
          if(!seen.has(key)){seen.add(key);points.push({...best,routeKm:cumulative});}
        }
      }
      if(!points.length)return;
      const html=points.map((r,i)=>{
        const c=condition(r);
        return '<div class="route-point route-point-'+c.level+'"><div class="route-point-index">'+(i+1)+'</div><div><div class="route-point-title"><strong>'+esc(r.city)+"｜"+esc(r.town)+'</strong><span>約 '+r.routeKm.toFixed(1)+' km</span></div><div class="route-point-metrics"><span>🌡️ '+(r.temperature??"--")+' °C</span><span>💧 '+(r.humidity??"--")+' %</span><span>🌧️ '+(r.pop??"--")+' %</span><span>💨 '+(r.windSpeed??"--")+' m/s</span><span class="route-point-score">'+(c.score)+' 分</span></div><div class="route-point-weather">'+weatherIcon(r.weather)+' '+esc(r.weather)+'</div></div></div>';
      }).join("");
      const old=box.querySelector(".route-points-collapse");if(old)old.remove();
      const details=document.createElement("details");details.className="route-points-collapse";
      details.innerHTML='<summary>🛣️ 查看沿線 '+points.length+' 個氣象資料點</summary><div class="route-points-list">'+html+"</div>";
      box.appendChild(details);
    }catch(e){console.warn("route point details:",e);}
  }
  window.addEventListener("load",()=>{
    const btn=$("#analyzeRouteBtn");
    if(btn)btn.addEventListener("click",()=>setTimeout(addRoutePoints,700));
  });
})();