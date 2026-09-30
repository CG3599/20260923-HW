PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  town TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  UNIQUE(city, town)
);

CREATE TABLE IF NOT EXISTS weather_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,
  forecast_time TEXT NOT NULL,
  temperature REAL,
  humidity REAL,
  precipitation_probability REAL,
  weather TEXT,
  wind_direction TEXT,
  wind_speed REAL,
  source TEXT NOT NULL DEFAULT 'CWA F-D0047-093',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE(location_id, forecast_time)
);

CREATE TABLE IF NOT EXISTS ingestion_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  location_count INTEGER NOT NULL DEFAULT 0,
  forecast_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_weather_location_time
  ON weather_forecasts(location_id, forecast_time);

CREATE INDEX IF NOT EXISTS idx_weather_forecast_time
  ON weather_forecasts(forecast_time);

CREATE INDEX IF NOT EXISTS idx_locations_city
  ON locations(city);
