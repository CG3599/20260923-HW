-- 1. 檢查縣市／鄉鎮筆數
SELECT city, COUNT(*) AS town_count
FROM locations
GROUP BY city
ORDER BY city;

-- 2. 檢查是否存在空白或異常座標
SELECT *
FROM locations
WHERE city = ''
   OR town = ''
   OR latitude NOT BETWEEN 20 AND 27
   OR longitude NOT BETWEEN 118 AND 123;

-- 3. 檢查氣溫範圍
SELECT COUNT(*) AS invalid_temperature_count
FROM weather_forecasts
WHERE temperature IS NOT NULL
  AND (temperature < -30 OR temperature > 60);

-- 4. 檢查濕度 0–100
SELECT COUNT(*) AS invalid_humidity_count
FROM weather_forecasts
WHERE humidity IS NOT NULL
  AND (humidity < 0 OR humidity > 100);

-- 5. 檢查降雨機率 0–100
SELECT COUNT(*) AS invalid_pop_count
FROM weather_forecasts
WHERE precipitation_probability IS NOT NULL
  AND (precipitation_probability < 0 OR precipitation_probability > 100);

-- 6. 檢查風速不可為負
SELECT COUNT(*) AS invalid_wind_speed_count
FROM weather_forecasts
WHERE wind_speed IS NOT NULL
  AND wind_speed < 0;

-- 7. 檢查孤兒天氣資料
SELECT wf.*
FROM weather_forecasts wf
LEFT JOIN locations l ON l.id = wf.location_id
WHERE l.id IS NULL;

-- 8. 檢查每個鄉鎮是否至少有一筆預報
SELECT l.city, l.town
FROM locations l
LEFT JOIN weather_forecasts wf ON wf.location_id = l.id
GROUP BY l.id, l.city, l.town
HAVING COUNT(wf.id) = 0;

-- 9. 查看最新／最接近目前時間的資料
WITH ranked AS (
  SELECT
    l.city,
    l.town,
    wf.forecast_time,
    wf.temperature,
    wf.humidity,
    wf.precipitation_probability,
    wf.weather,
    wf.wind_direction,
    wf.wind_speed,
    ROW_NUMBER() OVER (
      PARTITION BY wf.location_id
      ORDER BY ABS(
        julianday(wf.forecast_time) - julianday(datetime('now', '+8 hours'))
      )
    ) AS rn
  FROM weather_forecasts wf
  JOIN locations l ON l.id = wf.location_id
)
SELECT *
FROM ranked
WHERE rn = 1
ORDER BY city, town;

-- 10. GIS 可直接使用的查詢
SELECT
  l.city,
  l.town,
  l.latitude,
  l.longitude,
  wf.temperature,
  wf.humidity,
  wf.precipitation_probability,
  wf.weather,
  wf.wind_direction,
  wf.wind_speed,
  wf.forecast_time
FROM locations l
JOIN weather_forecasts wf ON wf.location_id = l.id
WHERE wf.forecast_time = (
  SELECT MIN(wf2.forecast_time)
  FROM weather_forecasts wf2
  WHERE wf2.location_id = wf.location_id
);
