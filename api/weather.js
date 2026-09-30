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

    // 使用 SQL 取每個鄉鎮最接近目前時間的預報資料。
    const rows = db.prepare(`
      WITH ranked AS (
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
          wf.wind_speed,
          ROW_NUMBER() OVER (
            PARTITION BY wf.location_id
            ORDER BY ABS(
              julianday(wf.forecast_time) -
              julianday(datetime('now', '+8 hours'))
            )
          ) AS rn
        FROM weather_forecasts wf
        JOIN locations l ON l.id = wf.location_id
      )
      SELECT
        city,
        town,
        latitude,
        longitude,
        forecast_time,
        temperature,
        humidity,
        pop,
        weather,
        wind_direction,
        wind_speed
      FROM ranked
      WHERE rn = 1
      ORDER BY city, town
    `).all();

    const validation = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM locations) AS location_count,
        (SELECT COUNT(*) FROM weather_forecasts) AS forecast_count,
        (SELECT COUNT(*) FROM weather_forecasts WHERE humidity IS NOT NULL AND (humidity < 0 OR humidity > 100)) AS invalid_humidity,
        (SELECT COUNT(*) FROM weather_forecasts WHERE precipitation_probability IS NOT NULL AND (precipitation_probability < 0 OR precipitation_probability > 100)) AS invalid_pop,
        (SELECT COUNT(*) FROM weather_forecasts WHERE wind_speed IS NOT NULL AND wind_speed < 0) AS invalid_wind
    `).get();

    if (
      validation.location_count === 0 ||
      validation.forecast_count === 0 ||
      validation.invalid_humidity > 0 ||
      validation.invalid_pop > 0 ||
      validation.invalid_wind > 0
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
      sql: "weather_forecasts JOIN locations + ROW_NUMBER() 取得最接近目前時間的預報",
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
