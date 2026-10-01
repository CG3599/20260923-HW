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
      status: "allowed"
    },
    note: "國道主線全段禁止；國道甲線依 RideSky 規則保留。"
  },

  provincialExpressways: {
    default: "allowed",

    allowed: [
      { ref: "台61", fromKm: 2.606, toKm: 71.266, label: "八里一交流道－鳳山溪橋" },
      { ref: "台61", fromKm: 76.000, toKm: 305.750, label: "香山浸水橋南側－十份交流道" },
      { ref: "台62", fromKm: 0.000, toKm: 18.760, label: "安樂端－瑞濱端" },
      { ref: "台62甲", fromKm: 0.000, toKm: 5.622, label: "基隆端－四腳亭交流道" },
      { ref: "台64", fromKm: 0.000, toKm: 28.668, label: "台北港端－新店端" },
      { ref: "台65", fromKm: 0.000, toKm: 10.980, label: "五股端－土城一交流道" },
      { ref: "台66", fromKm: 0.000, toKm: 27.205, label: "觀音交流道－大溪端" },
      { ref: "台68", fromKm: 0.000, toKm: 22.992, label: "南寮端－竹東端" },
      { ref: "台68甲", fromKm: 0.000, toKm: 1.260, label: "台68線高架端－竹東市區" },
      { ref: "台72", fromKm: 2.410, toKm: 31.042, label: "後龍端－獅潭端" },
      { ref: "台74", fromKm: 0.000, toKm: 34.000, label: "快官交流道－草湖交流道" },
      { ref: "台76", fromKm: 11.400, toKm: 26.500, label: "埔鹽交流道－林厝交流道" },
      { ref: "台78", fromKm: 0.000, toKm: 39.190, label: "台西交流道－古坑交流道" },
      { ref: "台82", fromKm: 8.080, toKm: 31.980, label: "朴子－嘉義交流道" },
      { ref: "台84", fromKm: 0.000, toKm: 37.800, label: "北門交流道－走馬瀨" },
      { ref: "台86", fromKm: 0.000, toKm: 17.900, label: "台南端－關廟" },
      { ref: "台88", fromKm: 2.400, toKm: 22.391, label: "鳳山交流道－竹田端" }
    ],

    forbidden: [
      { ref: "台65", fromKm: 10.980, toKm: 12.320, label: "土城一交流道－土城交流道" },
      { ref: "台74", fromKm: 34.000, toKm: 39.235, label: "草湖交流道－霧峰交流道" },
      { ref: "台76", fromKm: 26.500, toKm: 32.600, label: "林厝交流道－中興系統交流道", includes: ["八卦山隧道"] },
      { ref: "台78", fromKm: 39.190, toKm: 43.520, label: "古坑交流道－古坑系統交流道" },
      { ref: "台82", fromKm: 31.980, toKm: 34.740, label: "嘉義交流道－水上系統交流道" },
      { ref: "台88", fromKm: 0.000, toKm: 2.400, label: "五甲系統交流道－鳳山交流道" }
    ],

    note: "公路局註明：本局轄管省道快速公路除6處通車路線末端與高速公路銜接路段（含台76線八卦山隧道）不開放大型重型機車，其餘路線均開放。"
  },

  provincialRoads: {
    allowed: [
      { ref: "台63", label: "中投公路" }
    ]
  },

  cityExpressways: {
    status: "separate-policy-required",
    note: "縣市快速道路另有公路局資料；後續 GIS 路線規則應獨立建立，避免與省道快速公路混為一談。"
  }
};

window.RideSkyRoutePolicy = {
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

  summary() {
    return {
      nationalMain: "forbidden",
      nationalA: "allowed",
      expresswayDefault: "allowed",
      forbiddenExpresswaySegments:
        window.RIDESKY_ROUTE_POLICY.provincialExpressways.forbidden.length,
      provincial63: "allowed"
    };
  }
};
