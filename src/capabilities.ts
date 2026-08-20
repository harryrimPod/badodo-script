export type CapabilityKind = "runtime" | "builtin" | "adapter";
export type CapabilityTarget = "portable" | "web" | "server" | "godot";

export interface CapabilityManifestEntry {
  id: string;
  kind: CapabilityKind;
  target: CapabilityTarget;
  name: string;
  signature: string;
  version: string;
  events?: string[];
}

/** Machine-readable Phase 0 contract for injected runtime functions. */
export const RUNTIME_CAPABILITIES: readonly CapabilityManifestEntry[] = [
  { id: "runtime.bind", kind: "runtime", target: "web", name: "bind", signature: "(getter, node, prop) -> void", version: "0.1" },
  { id: "runtime.watch", kind: "runtime", target: "web", name: "watch", signature: "(getter, handler) -> void", version: "0.1" },
  { id: "runtime.on-frame", kind: "runtime", target: "web", name: "onFrame", signature: "(handler(time)) -> void", version: "0.1" },
  { id: "runtime.on", kind: "runtime", target: "portable", name: "on", signature: "(node, event, handler) -> void", version: "0.1" },
  { id: "runtime.animate", kind: "runtime", target: "web", name: "animate", signature: "(node, prop, value, duration) -> void", version: "0.1" },
  { id: "runtime.animate-to", kind: "runtime", target: "web", name: "animateTo", signature: "(node, target, duration) -> void", version: "0.1" },
];

export const BUILTIN_CAPABILITIES: readonly CapabilityManifestEntry[] = [
  { id: "builtin.vec3", kind: "builtin", target: "portable", name: "vec3", signature: "(x, y, z) -> Vec3", version: "0.1" },
  { id: "builtin.color", kind: "builtin", target: "portable", name: "color", signature: "(r, g, b) -> Color", version: "0.1" },
  { id: "builtin.some", kind: "builtin", target: "portable", name: "some", signature: "(T) -> Option<T>", version: "0.2" },
  { id: "builtin.none", kind: "builtin", target: "portable", name: "none", signature: "() -> Option<T>", version: "0.2" },
  { id: "builtin.ok", kind: "builtin", target: "portable", name: "ok", signature: "(T) -> Result<T,E>", version: "0.2" },
  { id: "builtin.err", kind: "builtin", target: "portable", name: "err", signature: "(E) -> Result<T,E>", version: "0.2" },
  { id: "builtin.is-ok", kind: "builtin", target: "portable", name: "is_ok", signature: "(Result<T,E>) -> bool", version: "0.2" },
  { id: "builtin.unwrap", kind: "builtin", target: "portable", name: "unwrap", signature: "(Result<T,E>) -> T", version: "0.2" },
];

export const ADAPTER_CAPABILITIES: readonly CapabilityManifestEntry[] = [
  { id: "adapter.go.http", kind: "adapter", target: "server", name: "Go net/http", signature: "JSON request/response handler", version: "0.1" },
  { id: "adapter.go.mqtt", kind: "adapter", target: "server", name: "Go MQTT", signature: "JSON request/response topic handler", version: "0.1" },
  { id: "adapter.godot.shared", kind: "adapter", target: "godot", name: "Godot C# Shared DTO", signature: "System.Text.Json DTO + Validate", version: "0.1" },
  { id: "adapter.babylon.mesh", kind: "adapter", target: "web", name: "Babylon.Mesh", signature: "rotate/set/show/hide", version: "0.1", events: ["click"] },
  { id: "adapter.babylon.light", kind: "adapter", target: "web", name: "Babylon.Light", signature: "on/off/switch/set_intensity", version: "0.1" },
  { id: "adapter.babylon.camera", kind: "adapter", target: "web", name: "Babylon.Camera", signature: "set_position/look_at", version: "0.1" },
  { id: "adapter.maplibre.map", kind: "adapter", target: "web", name: "MapLibre.Map", signature: "set_center/fly_to/set_zoom/zoom_in/zoom_out/set_style", version: "0.1", events: ["load", "click", "move_end"] },
  { id: "adapter.maplibre.marker", kind: "adapter", target: "web", name: "MapLibre.Marker", signature: "show/hide/highlight/unhighlight/set_label", version: "0.1", events: ["click"] },
  { id: "adapter.maplibre.layer", kind: "adapter", target: "web", name: "MapLibre.Layer", signature: "show/hide/set_color/set_radius/set_opacity", version: "0.1" },
];

export const BDS_CAPABILITIES: readonly CapabilityManifestEntry[] = [
  ...RUNTIME_CAPABILITIES,
  ...BUILTIN_CAPABILITIES,
  ...ADAPTER_CAPABILITIES,
];

export function capabilityById(id: string): CapabilityManifestEntry | undefined {
  return BDS_CAPABILITIES.find((entry) => entry.id === id);
}

export function capabilitiesForTarget(target: CapabilityTarget): CapabilityManifestEntry[] {
  return BDS_CAPABILITIES.filter((entry) => entry.target === target || entry.target === "portable");
}
