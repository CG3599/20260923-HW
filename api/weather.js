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

  // CWA 的 F-D0047 系列實務上可使用 Authorization query parameter。
  // API Key 只在 Vercel Serverless Function 內使用，不會暴露給瀏覽器。
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
