export default async function handler(req, res) {
  const key = process.env.CWA_API_KEY;

  if (!key) {
    return res.status(500).json({
      success: false,
      message: "Vercel 尚未設定 CWA_API_KEY"
    });
  }

  // F-D0047-093 為「全臺灣各鄉鎮市區預報」，
  // 每一個 locationId 代表一個縣市的全部鄉鎮。
  const locationIds = [
    "F-D0047-001", "F-D0047-005", "F-D0047-009", "F-D0047-013",
    "F-D0047-017", "F-D0047-021", "F-D0047-025", "F-D0047-029",
    "F-D0047-033", "F-D0047-037", "F-D0047-041", "F-D0047-045",
    "F-D0047-049", "F-D0047-053", "F-D0047-057", "F-D0047-061",
    "F-D0047-065", "F-D0047-069", "F-D0047-073", "F-D0047-077",
    "F-D0047-081", "F-D0047-085"
  ];

  // CWA 對跨縣市查詢的回傳數量可能受到限制，
  // 因此分批查詢，最後在後端合併成一份資料。
  const batchSize = 5;
  const batches = [];
  for (let i = 0; i < locationIds.length; i += batchSize) {
    batches.push(locationIds.slice(i, i + batchSize));
  }

  try {
    // CWA 全台 368 鄉鎮資料量較大，啟用 Vercel CDN 快取，避免每次重新取得都等待 CWA。
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=120");

    const results = await Promise.all(
      batches.map(async (batch) => {
        const url = new URL(
          "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-093"
        );

        url.searchParams.set("locationId", batch.join(","));
        url.searchParams.set("Authorization", key);
        url.searchParams.set("format", "JSON");

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" }
        });

        const text = await response.text();
        let body = null;
        try {
          body = JSON.parse(text);
        } catch (_) {}

        if (!response.ok) {
          throw new Error(
            body?.message ||
            body?.result?.message ||
            `CWA API HTTP ${response.status}`
          );
        }

        if (!body?.records?.Locations) {
          throw new Error("CWA API 回傳內容缺少 Locations");
        }

        return body.records.Locations;
      })
    );

    const locations = results.flat();

    return res.status(200).json({
      success: true,
      records: {
        Locations: locations
      },
      meta: {
        source: "CWA F-D0047-093",
        cityCount: locations.length,
        requestedCityCount: locationIds.length
      }
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: "無法完整取得中央氣象署全台鄉鎮資料",
      error: String(error)
    });
  }
}