import { BadodoRuntime } from "../runtime/runtime";

/**
 * MapLibre GL JS adapter for Badodo Script.
 *
 * Wraps a MapLibre map, markers, and layers as Badodo scene nodes with
 * natural-language domain methods, and bridges native map events into the
 * Badodo runtime's event system.
 *
 * Since MapLibre GL is a browser-only library, the adapter accepts the map
 * instance as a plain `any` and never imports maplibre-gl directly.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

/** Wrap a MapLibre Map instance as a Badodo node. */
export function createMapNode(map: any): any {
  return {
    set_center(center: [number, number], zoom?: number): void {
      map.setCenter(center);
      if (zoom != null) map.setZoom(zoom);
    },
    fly_to(center: [number, number], zoom?: number): void {
      map.flyTo({ center, zoom: zoom ?? map.getZoom() });
    },
    set_zoom(zoom: number): void {
      map.setZoom(zoom);
    },
    zoom_in(): void {
      map.zoomIn();
    },
    zoom_out(): void {
      map.zoomOut();
    },
    set_style(url: string): void {
      map.setStyle(url);
    },
  };
}

/** Wrap a MapLibre Marker as a Badodo node. */
export function createMarkerNode(marker: any): any {
  return {
    show(): void {
      marker.getElement().style.display = "";
    },
    hide(): void {
      marker.getElement().style.display = "none";
    },
    highlight(): void {
      const el = marker.getElement();
      el.style.cursor = "pointer";
      el.style.filter = "drop-shadow(0 0 6px #ffd500)";
    },
    unhighlight(): void {
      marker.getElement().style.filter = "";
    },
    set_label(text: string): void {
      const el = marker.getElement();
      el.textContent = text;
    },
  };
}

/** Wrap a MapLibre layer (by id) as a Badodo node. */
export function createLayerNode(map: any, layerId: string): any {
  return {
    show(): void {
      map.setLayoutProperty(layerId, "visibility", "visible");
    },
    hide(): void {
      map.setLayoutProperty(layerId, "visibility", "none");
    },
  };
}

/** Wrap a MapLibre circle layer (by id) as a data-binding node. */
export function createCircleLayerNode(map: any, layerId: string): any {
  return {
    set_color(c: { r: number; g: number; b: number }): void {
      map.setPaintProperty(layerId, "circle-color", `rgb(${c.r},${c.g},${c.b})`);
    },
    set_radius(r: number): void {
      map.setPaintProperty(layerId, "circle-radius", r);
    },
    set_opacity(o: number): void {
      map.setPaintProperty(layerId, "circle-opacity", o);
    },
    show(): void {
      map.setLayoutProperty(layerId, "visibility", "visible");
    },
    hide(): void {
      map.setLayoutProperty(layerId, "visibility", "none");
    },
  };
}

/** Bridge a MapLibre Map's native events into a Badodo runtime. */
export function bridgeMapEvents(map: any, mapNode: any, rt: BadodoRuntime): void {
  map.on("load", () => rt.emit(mapNode, "load"));
  map.on("click", (e: any) => rt.emit(mapNode, "click", e));
  map.on("moveend", () => rt.emit(mapNode, "move_end"));
}

/** Bridge a MapLibre Marker's click into a Badodo runtime. */
export function bridgeMarkerClick(marker: any, markerNode: any, rt: BadodoRuntime): void {
  marker.getElement().addEventListener("click", () => rt.emit(markerNode, "click"));
}
