const SOURCES = {
  section: "https://thbapp.thb.gov.tw/opendata/section/sectioninfo/SectionList.xml",
  shape: "https://thbapp.thb.gov.tw/opendata/section/sectionshapeinfo/SectionShapeList.xml"
};

const FORBIDDEN = [
  { ref: "台65", fromKm: 10.980, toKm: 12.320 },
  { ref: "台74", fromKm: 34.000, toKm: 39.235 },
  { ref: "台76", fromKm: 26.500, toKm: 32.600 },
  { ref: "台78", fromKm: 39.190, toKm: 43.520 },
  { ref: "台82", fromKm: 31.980, toKm: 34.740 },
  { ref: "台88", fromKm: 0.000, toKm: 2.400 }
];

const cache = globalThis.__RIDESKY_ROAD_POLICY_CACHE__ || (globalThis.__RIDESKY_ROAD_POLICY_CACHE__ = {
  loadedAt: 0,
  sections: null,
  shapes: null
});

function normalizeRef(value=""){
  return String(value)
    .replaceAll("臺","台")
    .replace(/省道|快速公路/g,"")
    .replace(/\s+/g,"")
    .replace(/號|線$/g,"")
    .trim();
}

function xmlDecode(value=""){
  return String(value)
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'");
}

function tag(block,name){
  const m=String(block).match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+name+">","i"));
  return m ? xmlDecode(m[1].trim()) : "";
}

function blocks(xml,name){
  const out=[];
  const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+name+">","gi");
  let m;
  while((m=re.exec(xml||"")))out.push(m[1]);
  return out;
}

function parseKm(value){
  const s=String(value||"").trim();
  const m=s.match(/(\\d+)K(?:\\+|\\s*)(\\d{1,3})?/i);
  if(!m)return Number.isFinite(Number(s)) ? Number(s) : null;
  return Number(m[1]) + Number(m[2]||0)/1000;
}

function parseSections(xml){
  return blocks(xml,"Section").map(block=>{
    const mile=tag(block,"SectionMile");
    return {
      id:tag(block,"SectionID"),
      name:tag(block,"SectionName"),
      roadId:tag(block,"RoadID"),
      roadName:tag(block,"RoadName"),
      roadClass:Number(tag(block,"RoadClass")),
      direction:tag(block,"RoadDirection"),
      lengthM:Number(tag(block,"SectionLength")),
      startKm:parseKm(tag(mile,"StartKm") || tag(mile,"StartKM")),
      endKm:parseKm(tag(mile,"EndKm") || tag(mile,"EndKM"))
    };
  }).filter(x=>x.id);
}

function parseShapes(xml){
  const map=new Map();
  for(const block of blocks(xml,"SectionShape")){
    const id=tag(block,"SectionID");
    const geometry=tag(block,"Geometry");
    if(id&&geometry)map.set(id,parseWkt(geometry));
  }
  return map;
}

function parseWkt(wkt){
  const m=String(wkt||"").match(/LINESTRING\\s*\\(([^)]+)\\)/i);
  if(!m)return [];
  return m[1].split(",").map(pair=>{
    const p=pair.trim().split(/\\s+/).map(Number);
    return p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])?[p[1],p[0]]:null;
  }).filter(Boolean);
}

function pointDistanceMeters(p,a){
  const lat0=(p[0]+a[0])*Math.PI/360;
  const x=(p[1]-a[1])*111320*Math.cos(lat0);
  const y=(p[0]-a[0])*110540;
  return Math.hypot(x,y);
}

function pointSegmentDistanceMeters(p,a,b){
  const lat0=(p[0]+a[0]+b[0])*Math.PI/1080;
  const sx=(b[1]-a[1])*111320*Math.cos(lat0);
  const sy=(b[0]-a[0])*110540;
  const px=(p[1]-a[1])*111320*Math.cos(lat0);
  const py=(p[0]-a[0])*110540;
  const len2=sx*sx+sy*sy;
  if(!len2)return Math.hypot(px,py);
  const t=Math.max(0,Math.min(1,(px*sx+py*sy)/len2));
  return Math.hypot(px-t*sx,py-t*sy);
}

function polylineDistanceMeters(point, line){
  let best=Infinity;
  for(let i=1;i<line.length;i++){
    const d=pointSegmentDistanceMeters(point,line[i-1],line[i]);
    if(d<best)best=d;
  }
  return best;
}

function linesNearEachOther(route, line, threshold=120){
  if(!route.length||line.length<2)return false;
  const routeStep=Math.max(1,Math.floor(route.length/160));
  const lineStep=Math.max(1,Math.floor(line.length/160));
  for(let i=0;i<route.length;i+=routeStep){
    if(polylineDistanceMeters(route[i],line)<=threshold)return true;
  }
  for(let i=0;i<line.length;i+=lineStep){
    if(polylineDistanceMeters(line[i],route)<=threshold)return true;
  }
  return false;
}

function sliceByMileage(line,startKm,endKm,clipStart,clipEnd){
  if(line.length<2||!Number.isFinite(startKm)||!Number.isFinite(endKm)||endKm<=startKm)return [];
  const totalKm=endKm-startKm;
  const from=Math.max(0,Math.min(1,(clipStart-startKm)/totalKm));
  const to=Math.max(0,Math.min(1,(clipEnd-startKm)/totalKm));
  if(to<=from)return [];
  const cumulative=[0];
  for(let i=1;i<line.length;i++){
    cumulative[i]=cumulative[i-1]+pointDistanceMeters(line[i],line[i-1])/1000;
  }
  const total=cumulative[cumulative.length-1];
  if(!total)return [];
  const a=from*total,b=to*total;
  const out=[];
  const interpolate=(i,target)=>{
    const seg=cumulative[i]-cumulative[i-1];
    const t=seg?Math.max(0,Math.min(1,(target-cumulative[i-1])/seg)):0;
    return [
      line[i-1][0]+(line[i][0]-line[i-1][0])*t,
      line[i-1][1]+(line[i][1]-line[i-1][1])*t
    ];
  };
  out.push(line[0]);
  out.length=0;
  for(let i=1;i<line.length;i++){
    if(cumulative[i]>=a&&out.length===0)out.push(interpolate(i,a));
    if(cumulative[i]>a&&cumulative[i]<b)out.push(line[i]);
    if(cumulative[i]>=b){
      out.push(interpolate(i,b));
      break;
    }
  }
  return out.length>=2?out:[];
}

async function fetchText(url){
  const res=await fetch(url,{headers:{accept:"application/xml,text/xml,*/*"}});
  if(!res.ok)throw new Error("公路局資料 HTTP "+res.status);
  return res.text();
}

async function loadData(){
  const fresh=Date.now()-cache.loadedAt<6*60*60*1000;
  if(fresh&&cache.sections&&cache.shapes)return;
  const [sectionXml,shapeXml]=await Promise.all([
    fetchText(SOURCES.section),
    fetchText(SOURCES.shape)
  ]);
  cache.sections=parseSections(sectionXml);
  cache.shapes=parseShapes(shapeXml);
  cache.loadedAt=Date.now();
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=3600");
  if(req.method!=="POST"){
    return res.status(405).json({ok:false,message:"Method Not Allowed"});
  }

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const coordinates=Array.isArray(body.coordinates)
      ? body.coordinates.map(p=>Array.isArray(p)?[Number(p[0]),Number(p[1])]:null)
        .filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]))
      : [];
    const refs=[...new Set((Array.isArray(body.refs)?body.refs:[]).map(normalizeRef).filter(Boolean))];
    if(coordinates.length<2||!refs.length){
      return res.status(400).json({ok:false,message:"缺少 route coordinates 或道路編號。"});
    }

    await loadData();

    const relevant=cache.sections.filter(section=>{
      const ref=normalizeRef(section.roadName||section.name);
      return refs.some(target=>ref===target||ref.includes(target));
    });

    const findings=[];
    let verifiedSections=0;
    let missingMileage=0;

    for(const rule of FORBIDDEN){
      if(!refs.includes(normalizeRef(rule.ref)))continue;
      const candidates=relevant.filter(s=>{
        const ref=normalizeRef(s.roadName||s.name);
        return ref===normalizeRef(rule.ref)||ref.includes(normalizeRef(rule.ref));
      });

      let ruleVerified=false;
      for(const section of candidates){
        const line=cache.shapes.get(section.id);
        if(!line||line.length<2)continue;
        if(!linesNearEachOther(coordinates,line,120))continue;

        if(!Number.isFinite(section.startKm)||!Number.isFinite(section.endKm)){
          missingMileage++;
          continue;
        }

        const lo=Math.max(section.startKm,rule.fromKm);
        const hi=Math.min(section.endKm,rule.toKm);
        if(hi<=lo)continue;

        const forbiddenGeometry=sliceByMileage(line,section.startKm,section.endKm,lo,hi);
        if(forbiddenGeometry.length>=2&&linesNearEachOther(coordinates,forbiddenGeometry,120)){
          ruleVerified=true;
          findings.push({
            type:"expressway-mileage",
            status:"forbidden",
            ref:rule.ref,
            fromKm:rule.fromKm,
            toKm:rule.toKm,
            sectionId:section.id,
            sectionName:section.name
          });
          break;
        }
        verifiedSections++;
      }

      if(!ruleVerified&&candidates.length){
        const hasMileage=candidates.some(s=>Number.isFinite(s.startKm)&&Number.isFinite(s.endKm));
        if(!hasMileage)missingMileage++;
      }
    }

    const unavailable=refs.filter(ref=>{
      const relevantForRef=relevant.filter(s=>normalizeRef(s.roadName||s.name)===ref);
      return relevantForRef.length===0;
    });

    const verification=unavailable.length
      ? "unavailable"
      : findings.length
        ? "forbidden-verified"
        : (missingMileage ? "mileage-pending" : "verified");

    return res.status(200).json({
      ok:true,
      verified:verification==="verified",
      forbidden:findings.length>0,
      verification,
      refs,
      findings,
      unavailable,
      stats:{
        officialSections:relevant.length,
        verifiedSections,
        missingMileage
      },
      source:{
        agency:"交通部公路局",
        section:SOURCES.section,
        shape:SOURCES.shape,
        fetchedAt:new Date().toISOString()
      }
    });
  }catch(error){
    console.error("road-policy:",error);
    return res.status(502).json({
      ok:false,
      verification:"unavailable",
      message:"公路局官方路段 GIS 資料暫時無法取得。",
      detail:error?.message||String(error)
    });
  }
}
