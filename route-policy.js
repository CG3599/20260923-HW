/*
 * RideSky Route Policy
 * 來源：交通部公路局「大型重型機車開放及禁行路段」
 * https://www.thb.gov.tw/News_ExpresswaySection.aspx?n=462&sms=13790
 *
 * 定義：
 * 1. 國道主線：禁止。
 * 2. 國道甲線：允許。
 * 3. 省道快速公路：預設允許，但官方公告禁行區段除外。
 * 4. 台63線：允許。
 *
 * 注意：這份資料是「道路政策資料」，里程尚未直接等同 GIS 幾何。
 * 真正路線阻擋必須再經道路幾何／OSM way 驗證後套用。
 */

window.RIDESKY_ROUTE_POLICY = {
  version: "2026-10-02",
  verification: "flat-roads-only",
  vehicleScope: "大型重型機車",
  source: {
    agency: "交通部公路局",
    title: "大型重型機車開放及禁行路段",
    url: "https://www.thb.gov.tw/News_ExpresswaySection.aspx?n=462&sms=13790"
  },

  nationalFreeways: {
    default: "forbidden",
    exception: {
      pattern: "國道甲線",
      status: "forbidden"
    },
    note: "所有國道與國道甲線均禁止。"
  },

  provincialExpressways: {
    default: "forbidden",
    allowed: [],
    forbidden: [],
    note: "所有快速公路均禁止。"
  },

  provincialRoads: {
    allowed: []
  },

  cityExpressways: {
    status: "forbidden",
    note: "所有縣市快速道路均禁止。"
  }
};

window.RideSkyRoutePolicy = {
  normalizeRef(value = "") {
    return String(value).replaceAll("臺","台").replace(/省道|快速公路/g,"").replace(/線$/,"").trim();
  },
  forbiddenExpresswayAtMileage(ref, km) {
    const normalized = this.normalizeRef(ref);
    if (!Number.isFinite(Number(km))) return false;
    return window.RIDESKY_ROUTE_POLICY.provincialExpressways.forbidden.some(seg =>
      this.normalizeRef(seg.ref) === normalized && Number(km) >= seg.fromKm && Number(km) <= seg.toKm
    );
  },
  forbiddenNationalMain(ref = "", name = "") {
    const s = (String(ref) + " " + String(name)).replaceAll("臺", "台");
    if (!/國道|national/i.test(s)) return false;
    return !/甲/.test(s);
  },

  forbiddenExpresswayRefs() {
    return new Set(
      window.RIDESKY_ROUTE_POLICY.provincialExpressways.forbidden.map(x => x.ref)
    );
  },


  verifyRoute(route) {
    const steps=(route?.legs||[]).flatMap(leg=>leg?.steps||[]);
    const nationalMain=[];
    for(const step of steps){
      const ref=String(step?.ref||"").trim();
      const text=[ref,step?.name,step?.destinations].filter(Boolean).join(" ").replaceAll("臺","台");
      if(this.forbiddenNationalMain(ref,text)){
        nationalMain.push({type:"national-main",status:"forbidden",ref,text});
      }
    }
    return {
      ok:nationalMain.length===0,
      nationalMainForbidden:nationalMain.length>0,
      expresswayMileagePending:false,
      findings:nationalMain,
      verification:"national-freeway-only"
    };
  },

  summary() {
    return {
      nationalMain: "forbidden",
      nationalA: "forbidden",
      expresswayDefault: "forbidden",
      forbiddenExpresswaySegments:
        window.RIDESKY_ROUTE_POLICY.provincialExpressways.forbidden.length,
      provincial63: "allowed"
    };
  }
};
