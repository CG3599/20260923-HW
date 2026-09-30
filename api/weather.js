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

    // 取得「現在起 7 天」的完整預報資料；前端會依鄉鎮分組並顯示每日摘要。
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
        AND wf.forecast_time < datetime('now', '+8 hours', '+7 days')
      ORDER BY l.city, l.town, wf.forecast_time
    `).all();

    const validation = db.prepare(`
      SELECT (SELECT COUNT(*) FROM locations) AS location_count,
             (SELECT COUNT(*) FROM weather_forecasts) AS forecast_count
    `).get();

    if (
      validation.location_count !== 368 ||
      validation.forecast_count === 0
    ) {
      return res.status(500).json({
        success: false,
        message: "SQLite 資料驗證失敗",
        validation
      });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=120");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({
      success: true,
      source: "SQLite",
      sql: "weather_forecasts JOIN locations + 取得現在起 7 天完整預報",
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
