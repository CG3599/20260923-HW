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

    // Keep the visual skeleton needed for Taiwan-wide orientation.
    if(type==="background") return false;
    if(source==="water"||source==="waterway"||source==="landcover"||source==="park"||
       source==="landuse"||source==="boundary"||source==="transportation"||
       source==="place"||source==="admin") return false;

    // These layers are comparatively expensive and are not necessary for the
    // first frame: POI icons/text, building detail, house numbers, shields,
    // transit, address labels and fine-grained road labels.
    const heavy=/poi|housenumber|building|transit|rail_station|aeroway|road_shield|shield|address|place_label|waterway_label|road_label/i;
    if(heavy.test(id)||heavy.test(source)) return true;

    // Symbol layers not explicitly needed for place/admin context are delayed.
    if(type==="symbol" && source!=="place" && source!=="admin") return true;

    return false;
  }

  function makeLightStyle(style){
    const light=JSON.parse(JSON.stringify(style));
    light.name="RideSky Vector Basemap — Fast First Frame";
    light.layers=(light.layers||[]).filter(layer=>!isDetailLayer(layer));
    return light;
  }

  // script.js defines this function before this file is loaded.
  if(typeof getRideSkyVectorStyle!=="function") return;
  const original=getRideSkyVectorStyle;
  window.getRideSkyVectorStyle=function(key){
    return Promise.resolve(original(key)).then(full=>{
      const light=makeLightStyle(full);
      light.metadata=Object.assign({},light.metadata,{rideskyProgressive:true});
      window[DETAIL_KEY]=full;
      return light;
    });
  };

  // After the light style is rendered, replace it with the complete RideSky
  // style. This is intentionally delayed so the first useful map frame wins.
  const originalInit=window.initTaiwanMap;
  if(typeof originalInit==="function"){
    window.initTaiwanMap=async function(){
      await originalInit();
      const mapLayer=window.__rideskyMapLibreLayer;
      if(mapLayer) restore(mapLayer);
    };
  }

  function findGLMap(layer){
    if(!layer) return null;
    return layer._glMap || layer._map || layer._maplibreMap || layer._mapLibreMap || null;
  }

  function restore(layer){
    const full=window[DETAIL_KEY];
    const gl=findGLMap(layer);
    if(!full||!gl||typeof gl.setStyle!=="function") return;
    const run=()=>{
      setTimeout(()=>{
        try{
          gl.setStyle(full,{diff:true});
        }catch(_){}
      },DETAIL_DELAY);
    };
    if(typeof gl.once==="function") gl.once("idle",run);
    else run();
  }

  // Capture the MapLibre Leaflet layer created by script.js.
  const patch=()=>{
    if(!window.L||typeof L.maplibreGL!=="function"||L.maplibreGL.__rideskyPatched)return;
    const base=L.maplibreGL;
    const wrapped=function(){
      const layer=base.apply(this,arguments);
      window.__rideskyMapLibreLayer=layer;
      return layer;
    };
    Object.assign(wrapped,base);
    wrapped.__rideskyPatched=true;
    L.maplibreGL=wrapped;
  };

  if(window.L) patch();
  else window.addEventListener("load",patch,{once:true});
})();