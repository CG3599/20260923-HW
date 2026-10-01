// RideSky map cold-start optimizer.
// Warm MapLibre and the CARTO style while the weather API is loading,
// so the first uncached map view does not have to start from zero.
(function(){
  function warm(){
    try{
      if(typeof loadMapLibreAssets==="function"){
        loadMapLibreAssets().catch(()=>{});
      }
      const key=window.__CARTO_CONFIG__&&window.__CARTO_CONFIG__.key;
      if(!key)return;
      const cacheKey="rideskyVectorStyleV1";
      let cached=null;
      try{cached=JSON.parse(localStorage.getItem(cacheKey)||"null");}catch(_){}
      if(cached?.style?.version&&cached?.savedAt&&Date.now()-cached.savedAt<86400000)return;
      const url="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json?key="+encodeURIComponent(key);
      fetch(url,{cache:"force-cache",credentials:"omit"})
        .then(r=>r.ok?r.json():null)
        .then(style=>{
          if(!style?.version)return;
          try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),style}));}catch(_){}
        })
        .catch(()=>{});
    }catch(_){}
  }
  if("requestIdleCallback" in window){
    requestIdleCallback(warm,{timeout:1200});
  }else{
    setTimeout(warm,250);
  }
})();