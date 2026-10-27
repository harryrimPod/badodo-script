// Ambient declarations for the runtime functions generated BDS TypeScript
// calls. Mirrors src/runtime/runtime.ts (legacy RuntimeHandles + builtins) and
// is only used by scripts/verify-generated-ts.mjs. Scene nodes are declared
// per example in examples/<name>.d.ts with the members that example uses.

/** Opaque scene node owned by the host engine. */
interface BdsSceneNode {
  readonly __bdsSceneNode?: true;
}

interface BdsVec3 { x: number; y: number; z: number }
interface BdsColor { r: number; g: number; b: number }

declare function on(node: BdsSceneNode, event: string, handler: () => void): void;
declare function bind<T>(getter: () => T, node: BdsSceneNode, prop: string): void;
declare function watch<T>(getter: () => T, handler: (value: T) => void): void;
declare function onFrame(handler: (time: number) => void): void;
declare function animate(node: BdsSceneNode, prop: string, value: number, duration: number): void;
declare function animateTo(node: BdsSceneNode, target: BdsSceneNode, duration: number): void;
declare function vec3(x: number, y: number, z: number): BdsVec3;
declare function color(r: number, g: number, b: number): BdsColor;
