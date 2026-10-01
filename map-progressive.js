// RideSky progressive vector basemap loader.
// First render keeps only the roads, water and administrative/place context
// that are useful for route/weather orientation. Detailed labels/POI/buildings
// are restored after the first map frame settles.
(function(){
  const DETAIL_DELAY=1400;
  const DETAIL_KEY="__rideskyFullVectorStyle";

  function isDetailLayer(layer){
    const id=String(layer?.id||"").toLowerCase();
    const source=String(layer?.["source-layer"]||"").toLowerCase();
    const type=String(layer?.type||"").toLowerCase();

    if(type==="background") return false;
    if(source==="water"||source==="waterway"||source==="landcover"||source==="park"||
       source==="landuse"||source==="boundary"||source==="transportation"||
       source==="place"||source==="admin") return false;

    // Delay visually dense layers that are not needed for the first frame.
    const heavy=/poi|housenumber|building|transit|rail_station|aeroway|road_shield|shield|address|place_label|waterway_label|road_label/i;
    if(heavy.test(id)||heavy.test(source)) return true;
    if(type==="symbol" && source!=="place" && source!=="admin") return true;
    return false;
  }

  function makeLightStyle(style){
    const light=JSON.parse(JSON.stringify(style));
    light.name="RideSky Vector Basemap — Fast First Frame";
    light.layers=(light.layers||[]).filter(layer=>!isDetailLayer(layer));
    return light;
  }

  if(typeof getRideSkyVectorStyle!=="function") return;
  const originalGetStyle=getRideSkyVectorStyle;

  window.getRideSkyVectorStyle=function(key){
    return Promise.resolve(originalGetStyle(key)).then(full=>{
      window[DETAIL_KEY]=full;
      const light=makeLightStyle(full);
      light.metadata=Object.assign({},light.metadata,{rideskyProgressive:true});
      return light;
    });
  };

  function findGLMap(layer){
    if(!layer) return null;
    return layer._glMap || layer._maplibreMap || layer._mapLibreMap || null;
  }

  function restoreDetails(){
    const full=window[DETAIL_KEY];
    const layer=window.__rideskyMapLibreLayer;
    const gl=findGLMap(layer);
    if(!full||!gl||typeof gl.setStyle!=="function"){
      // The Leaflet bridge may expose the GL map a little later.
      setTimeout(restoreDetails,250);
      return;
    }

    const restore=()=>{
      setTimeout(()=>{
        try{
          gl.setStyle(full,{diff:true});
        }catch(_){}
      },DETAIL_DELAY);
    };

    if(typeof gl.once==="function") gl.once("idle",restore);
    else restore();
  }

  // Capture the MapLibre Leaflet layer and begin the progressive restore as
  // soon as that layer exists; no dependency on script.js internals required.
  const patch=()=>{
    if(!window.L||typeof L.maplibreGL!=="function"||L.maplibreGL.__rideskyPatched)return;
    const base=L.maplibreGL;
    const wrapped=function(){
      const layer=base.apply(this,arguments);
      window.__rideskyMapLibreLayer=layer;
      setTimeout(restoreDetails,0);
      return layer;
    };
    Object.assign(wrapped,base);
    wrapped.__rideskyPatched=true;
    L.maplibreGL=wrapped;
  };

  if(window.L) patch();
  else window.addEventListener("load",patch,{once:true});
})();