import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  const dbPath = path.join(process.cwd(), "database", "weather.db");

  if (!fs.existsSync(dbPath)) {
    return res.status(503).json({
      success: false,
      message: "SQLite 資料庫尚未建立，請重新部署以執行資料庫建置流程。"
    });
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma("foreign_keys = ON");

    // 取得「現在起 3 天」的完整預報資料；前端會依鄉鎮分組並顯示每日摘要。
    const rows = db.prepare(`
      SELECT
        l.city,
        l.town,
        l.latitude,
        l.longitude,
        wf.forecast_time,
        wf.temperature,
        wf.humidity,
        wf.precipitation_probability AS pop,
        wf.weather,
        wf.wind_direction,
        wf.wind_speed
      FROM weather_forecasts wf
      JOIN locations l ON l.id = wf.location_id
      WHERE wf.forecast_time >= datetime('now', '+8 hours')
        AND wf.forecast_time < datetime('now', '+8 hours', '+3 days')
      ORDER BY l.city, l.town, wf.forecast_time
    `).all();

    const validation = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM locations) AS location_count,
        (SELECT COUNT(*) FROM weather_forecasts) AS forecast_count,
        (SELECT COUNT(*) FROM weather_forecasts WHERE humidity IS NOT NULL AND (humidity < 0 OR humidity > 100)) AS invalid_humidity,
        (SELECT COUNT(*) FROM weather_forecasts WHERE precipitation_probability IS NOT NULL AND (precipitation_probability < 0 OR precipitation_probability > 100)) AS invalid_pop,
        (SELECT COUNT(*) FROM weather_forecasts WHERE wind_speed IS NOT NULL AND (wind_speed < 0 OR wind_speed > 100)) AS invalid_wind,
        (SELECT COUNT(*) FROM weather_forecasts WHERE temperature IS NOT NULL AND (temperature < -30 OR temperature > 60)) AS invalid_temperature,
        (SELECT COUNT(*) FROM locations WHERE city IS NULL OR city = '' OR town IS NULL OR town = '') AS invalid_location_name,
        (SELECT COUNT(*) FROM locations WHERE latitude NOT BETWEEN 20 AND 27 OR longitude NOT BETWEEN 118 AND 123) AS invalid_coordinates,
        (SELECT COUNT(*) FROM weather_forecasts wf LEFT JOIN locations l ON l.id = wf.location_id WHERE l.id IS NULL) AS orphan_weather,
        (SELECT COUNT(*) FROM locations l LEFT JOIN weather_forecasts wf ON wf.location_id = l.id WHERE wf.id IS NULL) AS locations_without_weather
    `).get();

    if (
      validation.location_count !== 368 ||
      validation.forecast_count === 0 ||
      validation.invalid_humidity > 0 ||
      validation.invalid_pop > 0 ||
      validation.invalid_wind > 0 ||
      validation.invalid_temperature > 0 ||
      validation.invalid_location_name > 0 ||
      validation.invalid_coordinates > 0 ||
      validation.orphan_weather > 0 ||
      validation.locations_without_weather > 0
    ) {
      return res.status(500).json({
        success: false,
        message: "SQLite 資料驗證失敗",
        validation
      });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=120");
    return res.status(200).json({
      success: true,
      source: "SQLite",
      sql: "weather_forecasts JOIN locations + 取得現在起 3 天完整預報",
      records: {
        Locations: rows
      },
      meta: {
        locationCount: validation.location_count,
        forecastCount: validation.forecast_count,
        validation
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "SQLite 查詢失敗",
      error: String(error)
    });
  } finally {
    if (db) db.close();
  }
}
