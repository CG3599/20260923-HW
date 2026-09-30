# RideSky｜騎士天堂

全台氣象資訊 × 騎乘條件分析。

## 系統資料流程

```
中央氣象署 CWA
      ↓
CWA API
      ↓
資料解析
      ↓
資料驗證
      ↓
SQLite
      ↓
SQL 查詢
      ↓
/api/weather
      ↓
RideSky 前端
      ↓
GIS 地圖／騎乘條件分析
```

## SQLite 資料庫

資料庫檔案：`database/weather.db`

Schema：`database/schema.sql`

SQL 驗證與查詢：`database/queries.sql`

### 資料表

#### locations
儲存全台鄉鎮基本資料：`id`、`city`、`town`、`latitude`、`longitude`。

#### weather_forecasts
儲存 CWA 天氣預報：`location_id`、`forecast_time`、`temperature`、`humidity`、`precipitation_probability`、`weather`、`wind_direction`、`wind_speed`、`source`、`created_at`。

#### ingestion_logs
記錄每次資料匯入與驗證結果，包括資料來源、取得時間、鄉鎮數量、預報筆數、通過／失敗筆數、執行狀態與訊息。

## SQL 資料驗證

目前建立的驗證包含：

1. 縣市／鄉鎮數量檢查
2. 經緯度合理範圍檢查
3. 氣溫範圍檢查
4. 濕度 0–100 檢查
5. 降雨機率 0–100 檢查
6. 風速不可為負
7. 外鍵孤兒資料檢查
8. 每個鄉鎮是否都有天氣資料
9. 使用 SQL Window Function 取得最接近目前時間的資料
10. GIS 地圖所需的座標＋天氣 JOIN 查詢

## 建置 SQLite

Vercel 建置時執行：

```bash
node scripts/build-database.js
```

建置程式會：

1. 從 CWA `F-D0047-093` 分批取得全台資料
2. 驗證資料欄位與合理範圍
3. 建立／更新 SQLite
4. 寫入 `locations`
5. 寫入 `weather_forecasts`
6. 寫入 `ingestion_logs`

CWA API Key 只使用環境變數 `CWA_API_KEY`，不寫入 GitHub。

## 網站資料來源

目前 `/api/weather` **不再直接把 CWA API 回傳給前端**。

前端流程：

```
前端
 ↓
/api/weather
 ↓
SQLite
 ↓
SQL JOIN + ROW_NUMBER()
 ↓
JSON
 ↓
前端
```

API 同時會再次使用 SQL 檢查資料完整性。只有通過驗證才回傳資料。

## Vercel

Vercel Environment Variable：

`CWA_API_KEY`

Build 時建立 SQLite；Serverless Function 以唯讀方式查詢 SQLite。

> 注意：SQLite 適合本專案的課程／Prototype 資料流程與 SQL 驗證展示。Vercel Serverless 環境的檔案系統不是長期可寫入的持久資料庫，因此本專案採「建置時取得 CWA → 建立 SQLite → 部署後唯讀查詢」架構。

## 目前狀態

- CWA 全台鄉鎮資料：已接入
- 資料驗證：已建立
- SQLite Schema：已建立
- SQL 驗證查詢：已建立
- SQLite 建置程式：已建立
- `/api/weather`：改為 SQL 查詢 SQLite
- 前端：維持原本 GIS、搜尋、騎乘條件與路線分析
