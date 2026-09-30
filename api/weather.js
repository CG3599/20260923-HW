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
      WHERE date(wf.forecast_time, '+8 hours') >= (
          SELECT date(datetime(MAX(forecast_time), '+8 hours'), '-6 days')
          FROM weather_forecasts
        )
        AND date(wf.forecast_time, '+8 hours') < (
          SELECT date(datetime(MAX(forecast_time), '+8 hours'), '+1 day')
          FROM weather_forecasts
        )
      ORDER BY l.city, l.town, wf.forecast_time
    `).all();

    const validation = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM locations) AS location_count,
        (SELECT COUNT(*) FROM weather_forecasts) AS forecast_count,
        (SELECT COUNT(DISTINCT date(forecast_time, '+8 hours')) FROM weather_forecasts) AS forecast_day_count,
        (SELECT MIN(date(forecast_time, '+8 hours')) FROM weather_forecasts) AS min_forecast_date,
        (SELECT MAX(date(forecast_time, '+8 hours')) FROM weather_forecasts) AS max_forecast_date
    `).get();

    if (
      validation.location_count !== 368 ||
      validation.forecast_count === 0 ||
      validation.forecast_day_count < 7
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
      sql: "weather_forecasts JOIN locations + 以台灣時區最新預報日期為基準取得完整 7 個日曆日",
      records: {
        Locations: rows
      },
      meta: {
        locationCount: validation.location_count,
        forecastCount: validation.forecast_count,
        forecastDayCount: validation.forecast_day_count,
        minForecastDate: validation.min_forecast_date,
        maxForecastDate: validation.max_forecast_date,
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
