export default async function handler(req, res) {
  const key = process.env.CWA_API_KEY;

  if (!key) {
    return res.status(500).json({
      success: false,
      message: "Vercel 尚未設定 CWA_API_KEY"
    });
  }

  const url = new URL(
    "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-093"
  );

  // 093 為全臺鄉鎮資料；指定 20 個縣市資料區域，避免 API 對無條件查詢回傳 Resource not found。
  const locationIds = [
    "F-D0047-001", "F-D0047-005", "F-D0047-009", "F-D0047-013",
    "F-D0047-017", "F-D0047-021", "F-D0047-025", "F-D0047-029",
    "F-D0047-033", "F-D0047-037", "F-D0047-041", "F-D0047-045",
    "F-D0047-049", "F-D0047-053", "F-D0047-057", "F-D0047-061",
    "F-D0047-065", "F-D0047-069", "F-D0047-073", "F-D0047-077",
    "F-D0047-081", "F-D0047-085"
  ];

  url.searchParams.set("locationId", locationIds.join(","));
  url.searchParams.set("Authorization", key);
  url.searchParams.set("format", "JSON");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();

    let body = null;
    try {
      body = JSON.parse(text);
    } catch (_) {}

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: body?.message || body?.result?.message || `CWA API HTTP ${response.status}`,
        cwaStatus: response.status,
        cwaResponse: body || text
      });
    }

    return res.status(200).json(body ?? {
      success: false,
      message: "CWA API 回傳內容不是有效 JSON"
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: "無法連線至中央氣象署 API",
      error: String(error)
    });
  }
}
