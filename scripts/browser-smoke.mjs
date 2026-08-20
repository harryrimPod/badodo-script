import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { packScript, generateSigningKeyPair, issueLicense, signArtifact, serializeSignedArtifact } = require("../dist/index.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    path.join(process.env.CODEX_NODE_MODULES ?? "", "playwright"),
    "C:\\Users\\karlx\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next configured local runtime.
    }
  }
  throw new Error("Playwright is not installed. Set PLAYWRIGHT_MODULE or install the repository dev dependency.");
}

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
<canvas id="webgl-probe" width="16" height="16"></canvas>
<script src="/demo/badodo-runtime.js"></script>
<script src="/fixture/babylon-fixture.js"></script>
<script>
(async () => {
  try {
    const canvas = document.getElementById("webgl-probe");
    const webgl2 = Boolean(canvas.getContext("webgl2"));
    const engine = new BabylonFixture.Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new BabylonFixture.Scene(engine);
    scene.clearColor = new BabylonFixture.Color4(0.05, 0.06, 0.09, 1);
    const camera = new BabylonFixture.ArcRotateCamera(
      "camera", -Math.PI / 2, Math.PI / 3, 8,
      BabylonFixture.Vector3.Zero(), scene,
    );
    scene.activeCamera = camera;
    new BabylonFixture.HemisphericLight("ambient", new BabylonFixture.Vector3(0, 1, 0), scene);
    const cubeMesh = BabylonFixture.MeshBuilder.CreateBox("cube", { size: 2 }, scene);
    cubeMesh.material = new BabylonFixture.StandardMaterial("cubeMat", scene);
    cubeMesh.material.diffuseColor = new BabylonFixture.Color3(0.3, 0.6, 1.0);
    const pointLight = new BabylonFixture.PointLight("light", BabylonFixture.Vector3.Zero(), scene);
    pointLight.position = new BabylonFixture.Vector3(0, 3, 4);
    pointLight.intensity = 1;
    const cube = Badodo.createMeshNode(cubeMesh);
    const light = Badodo.createLightNode(pointLight);
    const runtime = new Badodo.BadodoRuntime();
    runtime.registerNode("cube", cube);
    runtime.registerNode("light", light);
    Badodo.bridgeMeshClick(scene, cubeMesh, cube, runtime);
    const signedResponse = await fetch("/fixture/demo.signed.json");
    const signedArtifact = await signedResponse.json();
    const publicKeyPem = await (await fetch("/fixture/public-key.pem")).text();
    const verifiedArtifact = await Badodo.verifySignedArtifactBrowser(
      signedArtifact,
      publicKeyPem,
      new Date("2026-06-01T00:00:00Z"),
      "web3d",
    );
    const verifiedKeyringArtifact = await Badodo.verifySignedArtifactBrowserWithKeyring(
      signedArtifact,
      { [signedArtifact.keyId]: publicKeyPem },
      undefined,
      new Date("2026-06-01T00:00:00Z"),
      "web3d",
    );
    await Badodo.runSignedEncrypted(
      runtime,
      "/fixture/demo.signed.json",
      "browser-smoke-key-2026",
      publicKeyPem,
      new Date("2026-06-01T00:00:00Z"),
      "web3d",
    );
    const tampered = { ...signedArtifact, payload: btoa("tampered") };
    let tamperedArtifactRejected = false;
    try {
      await Badodo.verifySignedArtifactBrowser(tampered, publicKeyPem, new Date("2026-06-01T00:00:00Z"), "web3d");
    } catch {
      tamperedArtifactRejected = true;
    }
    runtime.tick(0.5);
    runtime.tick(0.5);
    scene.onPointerObservable.notifyObservers({ type: 2, pickedMesh: cubeMesh });
    scene.render();
    const mapCalls = [];
    const fakeMap = {
      setCenter(value) { mapCalls.push(["setCenter", value]); },
      setZoom(value) { mapCalls.push(["setZoom", value]); },
      getZoom() { return 5; },
      flyTo(value) { mapCalls.push(["flyTo", value]); },
      zoomIn() { mapCalls.push(["zoomIn"]); },
      zoomOut() { mapCalls.push(["zoomOut"]); },
      setStyle(value) { mapCalls.push(["setStyle", value]); },
    };
    const mapNode = Badodo.createMapNode(fakeMap);
    mapNode.set_center([116.39, 39.9], 7);
    mapNode.fly_to([116.4, 39.91], 8);
    window.__BDS_RESULT__ = {
      ok: true,
      signedArtifactVerified: verifiedArtifact.payload.byteLength > 0,
      signedKeyringVerified: verifiedKeyringArtifact.keyId === signedArtifact.keyId,
      tamperedArtifactRejected,
      payloadExecuted: true,
      webgl2,
      babylonWebGLVersion: engine.webGLVersion,
      rotationY: cubeMesh.rotation.y,
      lightIntensity: pointLight.intensity,
      mapCalls,
    };
  } catch (error) {
    window.__BDS_RESULT__ = { ok: false, error: error && (error.stack || error.message || String(error)) };
  }
})();
</script>`;

const serverPort = await freePort();
const source = fs.readFileSync(path.join(root, "demo", "demo.bds"), "utf8");
const payload = packScript(source, "browser-smoke-key-2026");
const issuer = generateSigningKeyPair();
const license = issueLicense({
  subject: "browser-smoke",
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  features: ["web3d"],
}, issuer.privateKeyPem);
const signedArtifact = serializeSignedArtifact(signArtifact(payload, license, issuer.privateKeyPem)).toString("utf8");
const runtimeBundle = fs.readFileSync(path.join(root, "demo", "badodo-runtime.js"));
const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${serverPort}`);
  if (url.pathname === "/fixture/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml);
  } else if (url.pathname === "/demo/badodo-runtime.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(runtimeBundle);
  } else if (url.pathname === "/fixture/babylon-fixture.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(fs.readFileSync(path.join(root, "browser-fixtures", "babylon-fixture.js")));
  } else if (url.pathname === "/fixture/demo.signed.json") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(signedArtifact);
  } else if (url.pathname === "/fixture/public-key.pem") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end(issuer.publicKeyPem);
  } else {
    response.writeHead(404);
    response.end("not found");
  }
});
await new Promise((resolve) => server.listen(serverPort, "127.0.0.1", resolve));

let browser;
let skipped = false;
try {
  const { chromium } = loadPlaywright();
  const configuredChrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const launchOptions = {
    headless: true,
    args: ["--disable-gpu", "--disable-dev-shm-usage"],
  };
  if (fs.existsSync(configuredChrome)) launchOptions.executablePath = configuredChrome;
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(`http://127.0.0.1:${serverPort}/fixture/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__BDS_RESULT__), null, { timeout: 15000 });
  const result = await page.evaluate(() => window.__BDS_RESULT__);
  assert.equal(result.ok, true, result.error ?? "browser fixture failed");
  assert.equal(result.signedArtifactVerified, true, "browser did not verify signed artifact");
  assert.equal(result.signedKeyringVerified, true, "browser did not verify keyring artifact");
  assert.equal(result.tamperedArtifactRejected, true, "browser accepted tampered signed artifact");
  assert.equal(result.payloadExecuted, true, "verified payload did not execute");
  assert.equal(result.webgl2, true, "Chromium did not expose a WebGL2 context");
  assert.ok(result.rotationY > 0, `every frame did not update rotation: ${result.rotationY}`);
  assert.equal(result.lightIntensity, 0, "Babylon light adapter did not toggle intensity");
  assert.ok(result.babylonWebGLVersion >= 1, `Babylon engine did not initialize WebGL: ${result.babylonWebGLVersion}`);
  assert.deepEqual(result.mapCalls, [
    ["setCenter", [116.39, 39.9]],
    ["setZoom", 7],
    ["flyTo", { center: [116.4, 39.91], zoom: 8 }],
  ], "MapLibre adapter calls were not bridged deterministically");
  assert.equal(pageErrors.length, 0, pageErrors.map((error) => error.stack).join("\n"));
  console.log(`Browser smoke passed: Babylon WebGL${result.babylonWebGLVersion}, signed artifact verification, encrypted execution, event/frame runtime, and map adapter (${result.rotationY} rotation).`);
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Playwright is not installed") && process.env.BDS_REQUIRE_BROWSER !== "1") {
    skipped = true;
    console.warn(`Browser smoke skipped: ${error.message}`);
  } else {
    throw error;
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
if (skipped) process.exit(0);
