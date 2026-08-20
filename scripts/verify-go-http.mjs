import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateSharedArtifacts } from "../dist/shared.js";
import { generateGoHTTP } from "../dist/server-go-http.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const goCommand = process.env.BDS_GO ?? "go";
const toolEnv = { ...process.env };
if (!toolEnv.GOCACHE) toolEnv.GOCACHE = path.join(root, ".tmp", "go-cache");
if (!toolEnv.GOPATH) toolEnv.GOPATH = path.join(root, ".tmp", "go-path");
fs.mkdirSync(toolEnv.GOCACHE, { recursive: true });
fs.mkdirSync(toolEnv.GOPATH, { recursive: true });
const goProbe = spawnSync(goCommand, ["version"], { stdio: "ignore", env: toolEnv });
if (goProbe.error || goProbe.status !== 0) {
  console.log("Go toolchain not installed; generated Go HTTP source check skipped.");
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-go-http-"));
try {
  const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
`, { fieldMetadata: { "DeviceState.id": { constraints: { minLength: 1 } } } });
  const generated = generateGoHTTP(
    artifacts.declarations,
    [{ name: "device-service", methods: [{ name: "get_state", request: "DeviceState", response: "DeviceState" }] }],
    [{ service: "device-service", method: "get_state", httpMethod: "POST", path: "/v1/device/state" }],
    { packageName: "server", fieldMetadata: { "DeviceState.id": { constraints: { minLength: 1 } } } },
  );
  for (const [name, content] of Object.entries(generated.files)) fs.writeFileSync(path.join(fixture, name), content, "utf8");
  fs.writeFileSync(path.join(fixture, "go.mod"), "module bdsfixture\n\ngo 1.20\n", "utf8");
  fs.writeFileSync(path.join(fixture, "http_test.go"), `package server

import (
  "bytes"
  "context"
  "encoding/json"
  "net/http"
  "net/http/httptest"
  "testing"
)

type fixtureService struct{}

func (fixtureService) GetState(_ context.Context, request DeviceState) (DeviceState, error) {
  return request, nil
}

func TestGeneratedHTTPValidRequest(t *testing.T) {
  handler := NewHTTPHandler(fixtureService{})
  request := httptest.NewRequest(http.MethodPost, "/v1/device/state", bytes.NewBufferString(\`{"id":"D-1","online":true}\`))
  request.Header.Set("Content-Type", "application/json")
  response := httptest.NewRecorder()
  handler.ServeHTTP(response, request)
  if response.Code != http.StatusOK { t.Fatalf("status = %d, body = %s", response.Code, response.Body.String()) }
  var state DeviceState
  if err := json.NewDecoder(response.Body).Decode(&state); err != nil { t.Fatal(err) }
  if state.Id != "D-1" || !state.Online { t.Fatalf("unexpected response: %+v", state) }
}

func TestGeneratedHTTPValidationAndNotFound(t *testing.T) {
  handler := NewHTTPHandler(fixtureService{})
  invalid := httptest.NewRequest(http.MethodPost, "/v1/device/state", bytes.NewBufferString(\`{"online":true}\`))
  invalid.Header.Set("Content-Type", "application/json")
  invalidResponse := httptest.NewRecorder()
  handler.ServeHTTP(invalidResponse, invalid)
  if invalidResponse.Code != http.StatusUnprocessableEntity { t.Fatalf("invalid status = %d", invalidResponse.Code) }
  missing := httptest.NewRequest(http.MethodGet, "/missing", nil)
  missingResponse := httptest.NewRecorder()
  handler.ServeHTTP(missingResponse, missing)
  if missingResponse.Code != http.StatusNotFound { t.Fatalf("missing status = %d", missingResponse.Code) }
}
`, "utf8");

  const result = spawnSync(goCommand, ["test", "./..."], { cwd: fixture, encoding: "utf8", env: toolEnv });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
