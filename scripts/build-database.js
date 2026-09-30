const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const API_KEY = process.env.CWA_API_KEY;
const DATASET = "F-D0047-093";
const LOCATION_IDS = [
  "F-D0047-001","F-D0047-005","F-D0047-009","F-D0047-013",
  "F-D0047-017","F-D0047-021","F-D0047-025","F-D0047-029",
  "F-D0047-033","F-D0047-037","F-D0047-041","F-D0047-045",
  "F-D0047-049","F-D0047-053","F-D0047-057","F-D0047-061",
  "F-D0047-065","F-D0047-069","F-D0047-073","F-D0047-077",
  "F-D0047-081","F-D0047-085"
];
const BATCH_SIZE = 5;
const ROOT = path.resolve(__dirname, "..");
const DB_DIR = path.join(ROOT, "database");
const DB_FILE = path.join(DB_DIR, "weather.db");
const SCHEMA_FILE = path.join(DB_DIR, "schema.sql");

function valueFrom(value, names) {
  for (const name of names) {
    if (value?.[name] != null) return value[name];
  }
  return Object.values(value || {})[0];
}

function toNumber(value) {
  if (value == null || value === "" || value === "--" || value === "無資料") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validLocation(row) {
  return row.city &&
    row.town &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude) &&
    row.latitude >= 20 && row.latitude <= 27 &&
    row.longitude >= 118 && row.longitude <= 123;
}

function validForecast(row) {
  const ranges = [
    ["temperature", -30, 60],
    ["humidity", 0, 100],
    ["precipitation_probability", 0, 100],
    ["wind_speed", 0, 100]
  ];
  return row.forecast_time &&
    ranges.every(([key, min, max]) =>
      row[key] == null || (Number.isFinite(row[key]) && row[key] >= min && row[key] <= max)
    );
}

async function fetchBatch(batch) {
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/" + DATASET);
  url.searchParams.set("locationId", batch.join(","));
  url.searchParams.set("Authorization", API_KEY);
  url.searchParams.set("format", "JSON");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) {}

  if (!response.ok) {
    throw new Error(body?.message || body?.result?.message || `CWA API HTTP ${response.status}`);
  }
  if (!body?.records?.Locations) {
    throw new Error("CWA API 回傳內容缺少 Locations");
  }
  return body.records.Locations;
}

function parseLocations(groups) {
  const locations = [];
  for (const group of groups) {
    const city = group?.LocationsName || "未知縣市";
    for (const location of group?.Location || []) {
      const weatherElements = location?.WeatherElement || [];
      const find = (...names) => weatherElements.find(x => names.includes(x.ElementName));
      const tempEl = find("溫度", "Temperature");
      const humidityEl = find("相對濕度", "RelativeHumidity");
      const popEl = find("3小時降雨機率", "3小時降雨機率（%）", "降雨機率", "ProbabilityOfPrecipitation", "3-hour ProbabilityOfPrecipitation");
      const weatherEl = find("天氣現象", "Weather");
      const directionEl = find("風向", "WindDirection");
      const speedEl = find("風速", "WindSpeed");

      const keys = new Set();
      for (const el of [tempEl, humidityEl, popEl, weatherEl, directionEl, speedEl]) {
        for (const t of el?.Time || []) {
          const key = t.StartTime || t.DataTime;
          if (key) keys.add(key);
        }
      }

      for (const forecastTime of keys) {
        const at = el => (el?.Time || []).find(t => (t.StartTime || t.DataTime) === forecastTime)?.ElementValue?.[0] || {};
        const tv = at(tempEl), hv = at(humidityEl), pv = at(popEl), xv = at(weatherEl), dv = at(directionEl), sv = at(speedEl);
        locations.push({
          city,
          town: location?.LocationName || "未知鄉鎮",
          latitude: toNumber(location?.Latitude),
          longitude: toNumber(location?.Longitude),
          forecast_time: forecastTime,
          temperature: toNumber(valueFrom(tv, ["溫度", "Temperature"])),
          humidity: toNumber(valueFrom(hv, ["相對濕度", "RelativeHumidity"])),
          precipitation_probability: toNumber(valueFrom(pv, ["ProbabilityOfPrecipitation", "3小時降雨機率", "3小時降雨機率（%）"])),
          weather: valueFrom(xv, ["天氣現象", "Weather"]) ?? "資料待更新",
          wind_direction: valueFrom(dv, ["風向", "WindDirection"]) ?? "--",
          wind_speed: toNumber(valueFrom(sv, ["風速", "WindSpeed"]))
        });
      }
    }
  }
  return locations;
}

async function main() {
  if (!API_KEY) {
    if (fs.existsSync(DB_FILE)) {
      console.log("CWA_API_KEY 未提供，保留既有 SQLite database/weather.db。");
      return;
    }
    throw new Error("缺少 CWA_API_KEY，無法建立 SQLite 天氣資料庫。");
  }

  fs.mkdirSync(DB_DIR, { recursive: true });
  const groups = [];
  for (let i = 0; i < LOCATION_IDS.length; i += BATCH_SIZE) {
    groups.push(...await fetchBatch(LOCATION_IDS.slice(i, i + BATCH_SIZE)));
  }

  const rows = parseLocations(groups);
  const invalidRows = rows.filter(r => !validLocation(r) || !validForecast(r));

  if (!rows.length) throw new Error("CWA 沒有回傳任何天氣資料。");
  if (invalidRows.length) throw new Error(`資料驗證失敗：${invalidRows.length} 筆資料不符合格式或範圍。`);

  const db = new Database(DB_FILE);
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(SCHEMA_FILE, "utf8"));

  const transaction = db.transaction(() => {
    db.exec("DELETE FROM weather_forecasts; DELETE FROM locations;");
    const insertLocation = db.prepare(
      "INSERT INTO locations (city,town,latitude,longitude) VALUES (?,?,?,?) ON CONFLICT(city,town) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude"
    );
    const insertWeather = db.prepare(
      "INSERT INTO weather_forecasts (location_id,forecast_time,temperature,humidity,precipitation_probability,weather,wind_direction,wind_speed,source) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(location_id,forecast_time) DO UPDATE SET temperature=excluded.temperature,humidity=excluded.humidity,precipitation_probability=excluded.precipitation_probability,weather=excluded.weather,wind_direction=excluded.wind_direction,wind_speed=excluded.wind_speed,source=excluded.source"
    );
    const locationIds = new Map();

    for (const row of rows) {
      const key = row.city + "||" + row.town;
      if (!locationIds.has(key)) {
        insertLocation.run(row.city,row.town,row.latitude,row.longitude);
        const location = db.prepare("SELECT id FROM locations WHERE city=? AND town=?").get(row.city,row.town);
        locationIds.set(key, location.id);
      }
      insertWeather.run(locationIds.get(key),row.forecast_time,row.temperature,row.humidity,row.precipitation_probability,row.weather,row.wind_direction,row.wind_speed,DATASET);
    }

    db.prepare(
      "INSERT INTO ingestion_logs (source,location_count,forecast_count,valid_count,invalid_count,status,message) VALUES (?,?,?,?,?,?,?)"
    ).run(DATASET,locationIds.size,rows.length,rows.length,0,"success","CWA 資料通過欄位與範圍驗證後寫入 SQLite");
  });

  transaction();
  const counts = db.prepare("SELECT (SELECT COUNT(*) FROM locations) AS locations, (SELECT COUNT(*) FROM weather_forecasts) AS forecasts").get();

  // 建置完成後再次使用 SQL 做資料庫層級驗證；任何異常都直接讓 build fail。
  const validation = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM locations) AS location_count,
      (SELECT COUNT(*) FROM weather_forecasts) AS forecast_count,
      (SELECT COUNT(*) FROM locations WHERE city IS NULL OR city = '' OR town IS NULL OR town = '') AS invalid_location_name,
      (SELECT COUNT(*) FROM locations WHERE latitude NOT BETWEEN 20 AND 27 OR longitude NOT BETWEEN 118 AND 123) AS invalid_coordinates,
      (SELECT COUNT(*) FROM weather_forecasts WHERE temperature IS NOT NULL AND (temperature < -30 OR temperature > 60)) AS invalid_temperature,
      (SELECT COUNT(*) FROM weather_forecasts WHERE humidity IS NOT NULL AND (humidity < 0 OR humidity > 100)) AS invalid_humidity,
      (SELECT COUNT(*) FROM weather_forecasts WHERE precipitation_probability IS NOT NULL AND (precipitation_probability < 0 OR precipitation_probability > 100)) AS invalid_pop,
      (SELECT COUNT(*) FROM weather_forecasts WHERE wind_speed IS NOT NULL AND (wind_speed < 0 OR wind_speed > 100)) AS invalid_wind,
      (SELECT COUNT(*) FROM weather_forecasts wf LEFT JOIN locations l ON l.id = wf.location_id WHERE l.id IS NULL) AS orphan_weather,
      (SELECT COUNT(*) FROM locations l WHERE NOT EXISTS (SELECT 1 FROM weather_forecasts wf WHERE wf.location_id = l.id)) AS locations_without_weather
  `).get();

  const validationPassed =
    validation.location_count === 368 &&
    validation.forecast_count > 0 &&
    validation.invalid_location_name === 0 &&
    validation.invalid_coordinates === 0 &&
    validation.invalid_temperature === 0 &&
    validation.invalid_humidity === 0 &&
    validation.invalid_pop === 0 &&
    validation.invalid_wind === 0 &&
    validation.orphan_weather === 0 &&
    validation.locations_without_weather === 0;

  db.prepare(
    "INSERT INTO ingestion_logs (source,location_count,forecast_count,valid_count,invalid_count,status,message) VALUES (?,?,?,?,?,?,?)"
  ).run(
    DATASET,
    validation.location_count,
    validation.forecast_count,
    validationPassed ? validation.forecast_count : 0,
    validationPassed ? 0 : 1,
    validationPassed ? "validated" : "validation_failed",
    JSON.stringify(validation)
  );

  db.close();

  console.log("=== SQLite Data Validation ===");
  console.log(JSON.stringify(validation, null, 2));

  if (!validationPassed) {
    throw new Error("SQLite SQL 驗證失敗：資料庫未通過完整性檢查。");
  }

  console.log(`SQLite 建立與驗證完成：${counts.locations} 個鄉鎮、${counts.forecasts} 筆預報資料，Validation: PASS。`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
