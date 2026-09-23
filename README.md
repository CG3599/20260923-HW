# 20260923-HW｜全台氣象靜態網頁

目前先完成氣象靜態網站，使用原生 HTML / CSS / JavaScript 串接中央氣象署 OpenData。

## 功能
- 全台縣市氣象資訊
- 溫度、相對濕度、降雨機率、風向、風速
- 搜尋縣市、手動重新取得資料
- API 授權碼只儲存在瀏覽器 localStorage，不寫入 GitHub

## 資料來源
中央氣象署「鄉鎮天氣預報－全臺灣各鄉鎮市區預報資料」
- Dataset：F-D0047-093
- API：https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-093

## 下一階段
再加入 SQLite、資料正確性驗證、GIS 地圖與 Vercel 部署最佳化。