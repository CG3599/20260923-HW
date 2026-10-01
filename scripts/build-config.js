const fs = require("fs");
const path = require("path");

const key = process.env["CARTO_API_KEY"];
if (!key) {
  throw new Error("CARTO_API_KEY is not configured.");
}

const output = "window.__CARTO_CONFIG__ = " + JSON.stringify({ key }) + ";\n";
fs.writeFileSync(path.join(process.cwd(), "carto-config.js"), output, "utf8");
console.log("CARTO config generated.");
