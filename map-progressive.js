// RideSky progressive vector basemap.
// Loading order:
// 1. Immediate: RideSky colors, land/water/boundaries and essential roads.
// 2. Initial zoom: Chinese city/place names only.
// 3. Zoom in: mountains, detailed roads and geographic labels.
// 4. Further zoom: POI, buildings, addresses and other dense details.
//
// The important principle is not to render all map information at Taiwan-wide
// zoom. Detail is controlled by zoom level so the map stays light while zoomed
// out and becomes richer only when the rider asks for more detail.
(function(){
  const DETAIL_KEY="__rideskyFullVectorStyle";

  function sourceOf(layer){
    return String(layer?.["source-layer"]||"").toLowerCase();
  }

  function idOf(layer){
    return String(layer?.id||"").toLowerCase();
  }

  function isCityLabel(layer){
    if(layer?.type!=="symbol") return false;
    const s=sourceOf(layer),id=idOf(layer);
    return (
      s==="place" ||
      /place|city|town|settlement|locality|label/.test(id)
    );
  }

  function isMountainLabel(layer){
    if(layer?.type!=="symbol") return false;
    const s=sourceOf(layer),id=idOf(layer);
    return /mountain|peak|natural|terrain|hill|summit|contour/.test(s+" "+id);
  }

  function isRoadLabel(layer){
    if(layer?.type!=="symbol") return false;
    const s=sourceOf(layer),id=idOf(layer);
    return /transportation_name|road_label|road_name|highway|road|shield/.test(s+" "+id);
  }

  function isHeavyDetail(layer){
    const s=sourceOf(layer),id=idOf(layer);
    return /poi|housenumber|building|transit|rail_station|aeroway|address|shop|restaurant|road_shield|shield/.test(s+" "+id);
  }

  function setChineseText(layer){
    if(layer?.type!=="symbol" || !layer.layout || !layer.layout["text-field"]) return;

    // CARTO/OpenStreetMap vector tiles normally provide localized names.
    // Prefer Traditional Chinese, then Simplified Chinese, then generic name.
    layer.layout["text-field"]=[
      "coalesce",
      ["get","name:zh-Hant"],
      ["get","name:zh-TW"],
      ["get","name:zh"],
      ["get","name"],
      ""
    ];
  }

  function setTextVisibility(layer,minzoom){
    if(!layer.layout)layer.layout={};
    layer.minzoom=Math.max(Number(layer.minzoom||0),minzoom);
  }

  function buildProgressiveStyle(style){
    const light=JSON.parse(JSON.stringify(style));
    light.name="RideSky Progressive Vector Basemap";

    for(const layer of light.layers||[]){
      const s=sourceOf(layer);
      const id=idOf(layer);
      const city=isCityLabel(layer);
      const mountain=isMountainLabel(layer);
      const roadLabel=isRoadLabel(layer);
      const heavy=isHeavyDetail(layer);

      // Always keep the visual base: RideSky colors, terrain/land/water,
      // administrative boundaries and the essential transportation network.
      if(layer.type==="background") continue;
      if(["water","waterway","landcover","park","landuse","boundary","transportation","admin"].includes(s)){
        if(layer.type==="symbol") setTextVisibility(layer,12);
        continue;
      }

      // City names are the only text/symbol detail allowed at the initial
      // Taiwan-wide view. They use Chinese labels.
      if(city){
        setChineseText(layer);
        if(layer.type==="symbol"){
          // Large cities appear first; smaller places enter progressively.
          if(/city|capital|major/.test(id)) layer.minzoom=Math.max(Number(layer.minzoom||0),5.5);
          else layer.minzoom=Math.max(Number(layer.minzoom||0),6.5);
        }
        continue;
      }

      // Mountain/terrain labels appear only after zooming in.
      if(mountain){
        layer.minzoom=Math.max(Number(layer.minzoom||0),9);
        setChineseText(layer);
        continue;
      }

      // Road names/numbers are useful only after the rider zooms in.
      if(roadLabel){
        layer.minzoom=Math.max(Number(layer.minzoom||0),10);
        setChineseText(layer);
        continue;
      }

      // Fine map detail: delay until a closer zoom level.
      if(heavy){
        layer.minzoom=Math.max(Number(layer.minzoom||0),13);
        if(layer.type==="symbol")setChineseText(layer);
        continue;
      }

      // Any remaining symbol layer is deliberately delayed so the first
      // Taiwan-wide render remains visually clean and inexpensive.
      if(layer.type==="symbol"){
        layer.minzoom=Math.max(Number(layer.minzoom||0),11);
        setChineseText(layer);
      }
    }

    // Keep the style's sources intact: this reduces visual/render work without
    // breaking CARTO source references or requiring another network style.
    light.metadata=Object.assign({},light.metadata,{
      rideskyProgressive:true,
      rideskyLoadingOrder:"base -> Chinese cities -> mountains -> roads -> POI/buildings"
    });
    return light;
  }

  if(typeof getRideSkyVectorStyle!=="function") return;
  const originalGetStyle=getRideSkyVectorStyle;

  window.getRideSkyVectorStyle=function(key){
    return Promise.resolve(originalGetStyle(key)).then(full=>{
      window[DETAIL_KEY]=full;
      return buildProgressiveStyle(full);
    });
  };

  // Once the user zooms in, we do not swap the entire style. The progressive
  // style itself controls minzoom, which avoids a second full style reload.
  // This is intentionally cheaper than restoring the complete CARTO style.

  function patchMapLayer(){
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
  }

  if(window.L)patchMapLayer();
  else window.addEventListener("load",patchMapLayer,{once:true});
})();