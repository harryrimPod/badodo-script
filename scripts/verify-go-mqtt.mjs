import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateSharedArtifacts } from "../dist/shared.js";
import { generateGoMQTT } from "../dist/server-go-mqtt.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const goCommand = process.env.BDS_GO ?? "go";
const toolEnv = { ...process.env };
if (!toolEnv.GOCACHE) toolEnv.GOCACHE = path.join(root, ".tmp", "go-cache");
if (!toolEnv.GOPATH) toolEnv.GOPATH = path.join(root, ".tmp", "go-path");
fs.mkdirSync(toolEnv.GOCACHE, { recursive: true });
fs.mkdirSync(toolEnv.GOPATH, { recursive: true });
const goProbe = spawnSync(goCommand, ["version"], { stdio: "ignore", env: toolEnv });
if (goProbe.error || goProbe.status !== 0) {
  console.log("Go toolchain not installed; generated Go MQTT source check skipped.");
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-go-mqtt-"));
try {
  const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
`, { fieldMetadata: { "DeviceState.id": { constraints: { minLength: 1 } } } });
  const generated = generateGoMQTT(
    artifacts.declarations,
    [{ name: "device-service", methods: [{ name: "get_state", request: "DeviceState", response: "DeviceState" }] }],
    [{ service: "device-service", method: "get_state", topic: "bds/device/get", qos: 1, retain: false }],
    { packageName: "server", fieldMetadata: { "DeviceState.id": { constraints: { minLength: 1 } } } },
  );
  for (const [name, content] of Object.entries(generated.files)) fs.writeFileSync(path.join(fixture, name), content, "utf8");
  fs.writeFileSync(path.join(fixture, "go.mod"), "module bdsfixture\n\ngo 1.20\n", "utf8");
  fs.writeFileSync(path.join(fixture, "mqtt_test.go"), `package server

import (
  "context"
  "testing"
)

type fixtureService struct{}

func (fixtureService) GetState(_ context.Context, request DeviceState) (DeviceState, error) {
  return request, nil
}

type publishedMessage struct {
  topic string
  payload []byte
  qos byte
  retain bool
}

type fixtureTransport struct {
  subscriptions map[string]func(context.Context, MQTTMessage) error
  published []publishedMessage
}

func (f *fixtureTransport) Publish(_ context.Context, topic string, payload []byte, qos byte, retain bool) error {
  f.published = append(f.published, publishedMessage{topic: topic, payload: payload, qos: qos, retain: retain})
  return nil
}

func (f *fixtureTransport) Subscribe(_ context.Context, topic string, handler func(context.Context, MQTTMessage) error) error {
  if f.subscriptions == nil { f.subscriptions = map[string]func(context.Context, MQTTMessage) error{} }
  f.subscriptions[topic] = handler
  return nil
}

func TestGeneratedMQTTValidRequest(t *testing.T) {
  transport := &fixtureTransport{}
  handler := NewMQTTHandler(transport, fixtureService{})
  if err := handler.Register(context.Background()); err != nil { t.Fatal(err) }
  callback := transport.subscriptions["bds/device/get"]
  if callback == nil { t.Fatal("subscription missing") }
  if err := callback(context.Background(), MQTTMessage{Topic: "bds/device/get", Payload: []byte(\`{"id":"D-1","online":true}\`)}); err != nil { t.Fatal(err) }
  if len(transport.published) != 1 { t.Fatalf("published = %d", len(transport.published)) }
  if transport.published[0].topic != "bds/device/get/response" || transport.published[0].qos != 1 { t.Fatalf("unexpected publish: %+v", transport.published[0]) }
}

func TestGeneratedMQTTRejectsInvalidRequest(t *testing.T) {
  transport := &fixtureTransport{}
  handler := NewMQTTHandler(transport, fixtureService{})
  if err := handler.Register(context.Background()); err != nil { t.Fatal(err) }
  callback := transport.subscriptions["bds/device/get"]
  if err := callback(context.Background(), MQTTMessage{Topic: "bds/device/get", Payload: []byte(\`{"online":true}\`)}); err == nil { t.Fatal("invalid request accepted") }
  if len(transport.published) != 0 { t.Fatal("invalid request published a response") }
}
`, "utf8");

  const result = spawnSync(goCommand, ["test", "./..."], { cwd: fixture, encoding: "utf8", env: toolEnv });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
