export default async function handler(req, res) {
  const key = req.query?.Authorization || req.headers.authorization;
  if (!key) return res.status(400).json({ success:false, message:"缺少 CWA Authorization" });

  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-093");
  url.searchParams.set("format", "JSON");
  url.searchParams.set("Authorization", key);

  try {
    const response = await fetch(url.toString());
    const text = await response.text();
    res.status(response.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ success:false, message:"無法連線至中央氣象署 API", error:String(error) });
  }
}