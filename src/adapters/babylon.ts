import { BadodoRuntime } from "../runtime/runtime";

/**
 * Babylon.js adapter for Badodo Script.
 *
 * Wraps Babylon meshes, lights, and cameras as Badodo scene nodes with
 * natural-language domain methods, and bridges pointer pick events into the
 * Badodo runtime's event system.
 *
 * Babylon is a browser-only library; the adapter accepts objects as plain
 * `any` and never imports @babylonjs/core directly, so it stays decoupled.
 */

/** Wrap a Babylon Mesh as a Badodo node. */
export function createMeshNode(mesh: any): any {
  return {
    rotate_x(angle: number): void {
      mesh.rotation.x += angle;
    },
    rotate_y(angle: number): void {
      mesh.rotation.y += angle;
    },
    rotate_z(angle: number): void {
      mesh.rotation.z += angle;
    },
    set_position(v: { x: number; y: number; z: number }): void {
      mesh.position.x = v.x;
      mesh.position.y = v.y;
      mesh.position.z = v.z;
    },
    set_scale(v: { x: number; y: number; z: number }): void {
      mesh.scaling.x = v.x;
      mesh.scaling.y = v.y;
      mesh.scaling.z = v.z;
    },
    set_color(c: { r: number; g: number; b: number }): void {
      if (mesh.material && mesh.material.diffuseColor) {
        mesh.material.diffuseColor.r = c.r / 255;
        mesh.material.diffuseColor.g = c.g / 255;
        mesh.material.diffuseColor.b = c.b / 255;
      }
    },
    show(): void {
      mesh.setEnabled(true);
    },
    hide(): void {
      mesh.setEnabled(false);
    },
  };
}

/** Wrap a Babylon Light as a Badodo node. */
export function createLightNode(light: any): any {
  return {
    on(): void {
      light.intensity = 1;
    },
    off(): void {
      light.intensity = 0;
    },
    switch(): void {
      light.intensity = light.intensity > 0 ? 0 : 1;
    },
    set_intensity(value: number): void {
      light.intensity = value;
    },
  };
}

/** Wrap a Babylon Camera as a Badodo node. */
export function createCameraNode(camera: any): any {
  return {
    set_position(v: { x: number; y: number; z: number }): void {
      camera.position.x = v.x;
      camera.position.y = v.y;
      camera.position.z = v.z;
    },
    look_at(v: { x: number; y: number; z: number }): void {
      camera.setTarget(newTarget(camera, v));
    },
  };
}

function newTarget(camera: any, v: { x: number; y: number; z: number }): any {
  // Try to construct a Vector3 via the camera's position type, else return plain object.
  const pos = camera.position;
  if (pos && pos.constructor) {
    return new pos.constructor(v.x, v.y, v.z);
  }
  return { x: v.x, y: v.y, z: v.z };
}

/** Bridge a Babylon pointer-pick on a mesh to a Badodo `click` event. */
export function bridgeMeshClick(scene: any, mesh: any, node: any, rt: BadodoRuntime): void {
  scene.onPointerObservable.add((pointerInfo: any) => {
    if (pointerInfo.type === 2 /* POINTERPICK */ && pointerInfo.pickedMesh === mesh) {
      rt.emit(node, "click");
    }
  });
}
