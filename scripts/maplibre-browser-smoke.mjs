import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { packScript } = require("../dist/index.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

const fixtureHtml = `<!doctype html>
<meta charset="utf-8">
<style>html, body, #map { width: 320px; height: 240px; margin: 0; padding: 0; }</style>
<div id="map"></div>
<script src="/fixture/maplibre-gl.js"></script>
<script src="/demo/badodo-runtime.js"></script>
<script>
(async () => {
  try {
    const style = {
      version: 8,
      sources: {
        sensors: {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: { type: "Point", coordinates: [116.39, 39.9] } },
              { type: "Feature", geometry: { type: "Point", coordinates: [116.46, 39.92] } },
            ],
          },
        },
      },
      layers: [{
        id: "sensor-layer",
        type: "circle",
        source: "sensors",
        paint: { "circle-radius": 12, "circle-color": "rgb(80,180,255)", "circle-opacity": 0.7 },
      }],
    };
    const map = new maplibregl.Map({
      container: "map",
      style,
      center: [116.39, 39.9],
      zoom: 5,
      interactive: false,
      attributionControl: false,
    });
    await new Promise((resolve, reject) => {
      map.once("load", resolve);
      map.once("error", (event) => reject(event.error || event));
    });

    function makeMarker(color, coordinates) {
      const element = document.createElement("div");
      element.style.width = "18px";
      element.style.height = "18px";
      element.style.borderRadius = "50%";
      element.style.background = color;
      element.style.border = "2px solid #fff";
      return new maplibregl.Marker({ element }).setLngLat(coordinates).addTo(map);
    }
    const markerA = makeMarker("#4da3ff", [116.39, 39.9]);
    const markerB = makeMarker("#ff7d4d", [116.46, 39.92]);
    const runtime = new Badodo.BadodoRuntime();
    const mapNode = Badodo.createMapNode(map);
    const sensorA = Badodo.createMarkerNode(markerA);
    const sensorB = Badodo.createMarkerNode(markerB);
    const sensorLayer = Badodo.createCircleLayerNode(map, "sensor-layer");
    const data = { temperature: 25 };
    runtime.registerNode("map", mapNode);
    runtime.registerNode("sensor_a", sensorA);
    runtime.registerNode("sensor_b", sensorB);
    runtime.registerNode("sensor_layer", sensorLayer);
    runtime.registerNode("data", data);
    Badodo.bridgeMapEvents(map, mapNode, runtime);
    Badodo.bridgeMarkerClick(markerA, sensorA, runtime);
    Badodo.bridgeMarkerClick(markerB, sensorB, runtime);
    await Badodo.runEncrypted(runtime, "/fixture/map.bds.bin", "browser-smoke-key-2026");
    runtime.emit(mapNode, "load");
    runtime.tick(0.016);
    const coolColor = map.getPaintProperty("sensor-layer", "circle-color");
    data.temperature = 90;
    runtime.tick(0.016);
    const hotColor = map.getPaintProperty("sensor-layer", "circle-color");
    markerB.getElement().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    map.stop();
    const center = map.getCenter();
    const canvas = map.getCanvas();
    const webgl2 = Boolean(canvas.getContext("webgl2"));
    window.__BDS_RESULT__ = {
      ok: true,
      webgl2,
      styleLoaded: map.isStyleLoaded(),
      coolColor,
      hotColor,
      markerHighlighted: markerB.getElement().style.filter.includes("drop-shadow"),
      center: { lng: center.lng, lat: center.lat },
    };
    map.remove();
  } catch (error) {
    window.__BDS_RESULT__ = { ok: false, error: error && (error.stack || error.message || String(error)) };
  }
})();
</script>`;

const serverPort = await freePort();
const mapSource = fs.readFileSync(path.join(root, "demo-maplibre", "map.bds"), "utf8");
const payload = packScript(mapSource, "browser-smoke-key-2026");
const runtimeBundle = fs.readFileSync(path.join(root, "demo-maplibre", "badodo-runtime.js"));
const maplibreBundle = fs.readFileSync(path.join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl.js"));
const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${serverPort}`);
  if (url.pathname === "/fixture/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml);
  } else if (url.pathname === "/fixture/maplibre-gl.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(maplibreBundle);
  } else if (url.pathname === "/demo/badodo-runtime.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(runtimeBundle);
  } else if (url.pathname === "/fixture/map.bds.bin") {
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.end(payload);
  } else {
    response.writeHead(404);
    response.end("not found");
  }
});
await new Promise((resolve) => server.listen(serverPort, "127.0.0.1", resolve));

let browser;
try {
  const configuredChrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const launchOptions = { headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage"] };
  if (fs.existsSync(configuredChrome)) launchOptions.executablePath = configuredChrome;
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(`http://127.0.0.1:${serverPort}/fixture/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__BDS_RESULT__), null, { timeout: 20000 });
  const result = await page.evaluate(() => window.__BDS_RESULT__);
  assert.equal(result.ok, true, result.error ?? "MapLibre fixture failed");
  assert.equal(result.webgl2, true, "MapLibre did not expose WebGL2");
  assert.equal(result.styleLoaded, true, "MapLibre style did not finish loading");
  assert.equal(result.coolColor, "rgb(80,180,255)");
  assert.equal(result.hotColor, "rgb(255,60,60)");
  assert.equal(result.markerHighlighted, true, "marker click bridge did not highlight the marker");
  assert.ok(result.center.lng > 116.40, `fly_to did not move the map center: ${JSON.stringify(result.center)}`);
  assert.equal(pageErrors.length, 0, pageErrors.map((error) => error.stack).join("\n"));
  console.log(`MapLibre smoke passed: v4.7.1 WebGL2, local style, encrypted script, bindings, marker click, and fly_to (${result.center.lng.toFixed(4)}).`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
