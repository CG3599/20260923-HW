const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bboxFor(from, to, pad = 0.28) {
  const lat1 = number(from?.latitude);
  const lon1 = number(from?.longitude);
  const lat2 = number(to?.latitude);
  const lon2 = number(to?.longitude);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  return [
    Math.min(lat1, lat2) - pad,
    Math.min(lon1, lon2) - pad,
    Math.max(lat1, lat2) + pad,
    Math.max(lon1, lon2) + pad
  ];
}

function overpassQuery(bbox) {
  const [south, west, north, east] = bbox;
  return [
    "[out:json][timeout:35];",
    'way["highway"~"^(trunk|trunk_link)$"](',
    south.toFixed(6), ",", west.toFixed(6), ",",
    north.toFixed(6), ",", east.toFixed(6),
    ");out geom;"
  ].join("");
}

async function fetchOverpass(query) {
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);

    try {
      const response = await fetch(endpoint + "?data=" + encodeURIComponent(query), {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "RideSky/1.0 (Taiwan weather route strategy)"
        },
        signal: controller.signal
      });

      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_) {}

      if (response.ok && Array.isArray(data?.elements) && data.elements.length) {
        return {
          elements: data.elements,
          endpoint
        };
      }

      lastError = new Error(
        "Overpass HTTP " + response.status +
        (data?.remark ? ": " + String(data.remark).slice(0, 240) : "")
      );
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Overpass 無可用回應");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const input = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const from = {
      latitude: number(input?.from?.latitude ?? input?.fromLat),
      longitude: number(input?.from?.longitude ?? input?.fromLon)
    };
    const to = {
      latitude: number(input?.to?.latitude ?? input?.toLat),
      longitude: number(input?.to?.longitude ?? input?.toLon)
    };

    const bbox = bboxFor(from, to);
    if (!bbox) {
      return res.status(400).json({
        ok: false,
        error: "缺少有效的起點／終點座標"
      });
    }

    const query = overpassQuery(bbox);
    const result = await fetchOverpass(query);

    return res.status(200).json({
      ok: true,
      source: "Overpass",
      proxy: "Vercel Server API",
      strategy: "trunk/trunk_link",
      bbox,
      count: result.elements.length,
      elements: result.elements
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      source: "Overpass",
      proxy: "Vercel Server API",
      error: String(error?.message || error || "Overpass request failed")
    });
  }
}
