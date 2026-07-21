import { GeoJsonLayer, IconLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { DECK_ICON_DESCRIPTORS } from "app/lib/icons";
import {
  pinSvgDataUrl,
  DEFAULT_PIN_BODY_COLOR,
  DEFAULT_PIN_INNER_COLOR,
  DEFAULT_PIN_SIZE,
  DEFAULT_ICON_COLOR,
  PIN_ANCHOR_X,
  PIN_ANCHOR_Y,
  PIN_VIEWBOX_W,
  PIN_VIEWBOX_H,
  PIN_INNER_CENTER_ABOVE_TIP_FRACTION,
  PIN_HALF_WIDTH_FRACTION,
  buildEmojiAtlas,
  type EmojiIconMapping,
  DEFAULT_EMOJI,
  DEFAULT_EMOJI_SIZE,
} from "app/lib/marker_types";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { colorFromPresence } from "app/lib/color";
import {
  CURSOR_DEFAULT,
  DECK_SYNTHETIC_ID,
  DEFAULT_MAP_BOUNDS,
  LINE_COLORS_SELECTED,
  LINE_COLORS_SELECTED_RGB,
  purple900,
  WHITE,
} from "app/lib/constants";
import type { IDMap } from "app/lib/id_mapper";
import loadAndAugmentStyle, {
  DECK_EPHEMERAL_ID,
  DECK_FEATURES_ID,
  FEATURES_SOURCE_NAME,
  FEATURES_LINE_LAYER_NAME,
  EPHEMERAL_SOURCE_NAME,
  EPHEMERAL_LINE_LAYER_NAME,
  LASSO_SOURCE_NAME,
} from "app/lib/load_and_augment_style";
import * as d3 from "d3-color";
import { splitFeatureGroups } from "app/lib/pmap/split_feature_groups";
import { shallowArrayEqual } from "app/lib/utils";
import mapboxgl from "mapbox-gl";
import type {
  Data,
  EphemeralEditingState,
  PreviewProperty,
  Sel,
} from "state/jotai";
import type {
  Feature,
  IFeature,
  IFeatureCollection,
  IPresence,
  ISymbolization,
  LayerConfigMap,
  Point,
} from "types";
import type * as GeoJSON from "geojson";
import { bboxToPolygon } from "../geometry";

const DECK_POINT_SELECTION_ID = "deckgl-point-selection";
const DECK_POINT_LABELS_ID = "deckgl-point-labels";
const DECK_POINT_ICONS_ID = "deckgl-point-icons";
export const DECK_PIN_LAYER_ID = "deckgl-pins";
export const DECK_EMOJI_LAYER_ID = "deckgl-emoji";

const isPinFeature = (f: { geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }) =>
  f.geometry?.type === "Point" &&
  (f.properties as Record<string, unknown> | null | undefined)?.["marker-type"] === "pin";

const isEmojiFeature = (f: { geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }) =>
  f.geometry?.type === "Point" &&
  (f.properties as Record<string, unknown> | null | undefined)?.["marker-type"] === "emoji";

/**
 * Build a rounded-rectangle path in screen space (pixels) around (cx, cy),
 * then unproject each vertex to lng/lat for use in a DeckGL PolygonLayer.
 * cornerRadius = 0 gives a sharp rectangle.
 */
function buildRoundedRectPath(
  cx: number,
  cy: number,
  width: number,
  height: number,
  cornerRadius: number,
  map: mapboxgl.Map,
): [number, number][] {
  const r = Math.min(cornerRadius, width / 2, height / 2);
  const hw = width / 2;
  const hh = height / 2;
  const SEGS = 6; // arc segments per corner
  const screenPts: [number, number][] = [];

  // Four corners: top-right, bottom-right, bottom-left, top-left
  const corners = [
    { ox: cx + hw - r, oy: cy - hh + r, startAngle: -Math.PI / 2 },
    { ox: cx + hw - r, oy: cy + hh - r, startAngle: 0 },
    { ox: cx - hw + r, oy: cy + hh - r, startAngle: Math.PI / 2 },
    { ox: cx - hw + r, oy: cy - hh + r, startAngle: Math.PI },
  ];

  for (const { ox, oy, startAngle } of corners) {
    for (let i = 0; i <= SEGS; i++) {
      const a = startAngle + (Math.PI / 2) * (i / SEGS);
      screenPts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
    }
  }

  return screenPts.map((p) => {
    const ll = map.unproject(p as mapboxgl.PointLike);
    return [ll.lng, ll.lat];
  });
}

const MAP_OPTIONS: Omit<mapboxgl.MapboxOptions, "container"> = {
  style: { version: 8, layers: [], sources: {} },
  maxZoom: 26,
  boxZoom: false,
  dragRotate: false,
  attributionControl: false,
  fadeDuration: 0,
  preserveDrawingBuffer: true,
};

const cursorSvg = (color: string) => {
  const div = document.createElement("div");
  div.style.color = color;
  div.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7 17L1 1L17 7L10 10L7 17Z" stroke="white" fill="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
</svg>
`;
  return div;
};

type ClickEvent = mapboxgl.MapMouseEvent;
type MoveEvent = mapboxgl.MapboxEvent;

export type PMapHandlers = {
  onClick: (e: ClickEvent) => void;
  onDoubleClick: (e: ClickEvent) => void;
  onMapMouseUp: (e: mapboxgl.MapMouseEvent) => void;
  onMapMouseMove: (e: mapboxgl.MapMouseEvent) => void;
  onMapTouchMove: (e: mapboxgl.MapTouchEvent) => void;
  onMapMouseDown: (e: mapboxgl.MapMouseEvent) => void;
  onMapTouchStart: (e: mapboxgl.MapTouchEvent) => void;
  onMoveEnd: (e: mapboxgl.MapboxEvent) => void;
  onMapTouchEnd: (e: mapboxgl.MapTouchEvent) => void;
  onMove: (e: mapboxgl.MapboxEvent) => void;
};

const lastValues = new WeakMap<mapboxgl.GeoJSONSource, Feature[]>();

/**
 * Memoized set data for a mapboxgl.GeoJSONSource. If
 * the same source is called with the same data,
 * it won't set.
 */
function mSetData(
  source: mapboxgl.GeoJSONSource,
  newData: Feature[],
  _label: string,
  force?: boolean,
) {
  if (!shallowArrayEqual(lastValues.get(source), newData) || force) {
    source.setData({
      type: "FeatureCollection",
      features: newData,
    } as IFeatureCollection);
    lastValues.set(source, newData);
  } else {
    // console.log(
    //   "Skipped update",
    //   _label,
    //   source,
    //   newData,
    //   lastValues.get(source)
    // );
  }
}

/**
 * Parse a space-separated dasharray string (e.g. "4 2 1 2") into a numeric array.
 * Returns null if the string is empty or not parseable.
 */
function parseDasharray(str: string): number[] | null {
  const nums = str.trim().split(/\s+/).map(Number);
  if (nums.length === 0 || nums.some(isNaN)) return null;
  return nums;
}

/**
 * Collect all unique stroke-dasharray string values from a set of features.
 */
function collectDashPatterns(features: Feature[]): Map<string, number[]> {
  const patterns = new Map<string, number[]>();
  for (const f of features) {
    const da = (f.properties as Record<string, unknown> | null)?.["stroke-dasharray"];
    if (typeof da === "string" && da !== "") {
      if (!patterns.has(da)) {
        const parsed = parseDasharray(da);
        if (parsed) patterns.set(da, parsed);
      }
    }
  }
  return patterns;
}

/**
 * Build a mapbox expression for line-dasharray that handles all known patterns.
 */
function buildDashExpression(
  patterns: Map<string, number[]>,
): mapboxgl.Expression {
  const cases: (mapboxgl.Expression | number[])[] = [];
  for (const [str, arr] of patterns) {
    cases.push(["==", ["get", "stroke-dasharray"], str], ["literal", arr]);
  }
  // Default: solid line
  cases.push(["literal", [1, 0]]);
  return ["case", ...cases] as mapboxgl.Expression;
}

/**
 * Get the effective marker radius (in pixels) for a point feature,
 * used to offset the label from the marker edge.
 */
function getMarkerRadius(f: GeoJSON.Feature): number {
  const props = f.properties ?? {};
  if (props["marker-type"] === "pin") {
    const h = typeof props["pin-size"] === "number" ? props["pin-size"] : DEFAULT_PIN_SIZE;
    return h * PIN_HALF_WIDTH_FRACTION;
  }
  if (props["marker-type"] === "emoji") {
    const s = typeof props["emoji-size"] === "number" ? props["emoji-size"] : DEFAULT_EMOJI_SIZE;
    return s / 2;
  }
  return typeof props["marker-size"] === "number" ? props["marker-size"] : 8;
}

/**
 * Parse a CSS/hex color string into a DeckGL RGBA array [r, g, b, a].
 */
function parseColor(
  colorStr: string | null | undefined,
  fallback: string,
): [number, number, number, number] {
  const c = d3.color(colorStr || fallback) ?? d3.color(fallback);
  if (!c) return [0, 0, 0, 255];
  const rgb = c.rgb();
  return [
    Math.round(Math.max(0, Math.min(255, rgb.r))),
    Math.round(Math.max(0, Math.min(255, rgb.g))),
    Math.round(Math.max(0, Math.min(255, rgb.b))),
    Math.round(Math.max(0, Math.min(255, rgb.opacity * 255))),
  ];
}

export default class PMap {
  map: mapboxgl.Map;
  handlers: React.MutableRefObject<PMapHandlers>;
  idMap: IDMap;

  lastSelection: Sel;
  lastData: Data | null;
  lastEphemeralState: EphemeralEditingState;
  lastSymbolization: ISymbolization | null;
  presenceMarkers: Map<IPresence["userId"], mapboxgl.Marker>;
  lastLayer: LayerConfigMap | null;
  lastPreviewProperty: PreviewProperty;
  overlay: MapboxOverlay;
  lastSelectionEphemeralPoint: GeoJSON.Feature | null = null;
  emojiAtlas: string | null = null;
  emojiMapping: EmojiIconMapping | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastDeckLayers: any[] = [];
  lastMapboxSelectionIds: Set<RawId> = new Set();

  constructor({
    element,
    layerConfigs,
    handlers,
    previewProperty,
    symbolization,
    idMap,
    initialBounds,
    controlsCorner = "bottom-left",
  }: {
    element: HTMLDivElement;
    layerConfigs: LayerConfigMap;
    handlers: React.MutableRefObject<PMapHandlers>;
    symbolization: ISymbolization;
    previewProperty: PreviewProperty;
    idMap: IDMap;
    initialBounds?: [[number, number], [number, number]] | null;
    controlsCorner?: Parameters<mapboxgl.Map["addControl"]>[1];
  }) {
    this.idMap = idMap;
    const positionOptions = {
      bounds: (initialBounds ?? DEFAULT_MAP_BOUNDS) as mapboxgl.LngLatBoundsLike,
    };

    const map = new mapboxgl.Map({
      container: element,
      ...MAP_OPTIONS,
      ...positionOptions,
    });

    this.overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });

    map.addControl(this.overlay as any);

    map.addControl(
      new mapboxgl.GeolocateControl({
        showUserLocation: false,
        showAccuracyCircle: false,
        positionOptions: {
          enableHighAccuracy: true,
        },
      }),
      controlsCorner,
    );
    map.addControl(new mapboxgl.NavigationControl({}), controlsCorner);
    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
    );
    map.getCanvas().style.cursor = CURSOR_DEFAULT;
    map.on("click", this.onClick);
    map.on("mousedown", this.onMapMouseDown);
    map.on("mousemove", this.onMapMouseMove);
    map.on("dblclick", this.onMapDoubleClick);
    map.on("mouseup", this.onMapMouseUp);
    map.on("moveend", this.onMoveEnd);
    map.on("zoom", this.onZoom);
    map.on("touchend", this.onMapTouchEnd);
    map.on("move", this.onMove);

    map.on("touchstart", this.onMapTouchStart);
    map.on("touchmove", this.onMapTouchMove);
    map.on("touchend", this.onMapTouchEnd);

    this.presenceMarkers = new Map();
    this.lastSymbolization = symbolization;

    this.lastSelection = { type: "none" };
    this.lastData = null;
    this.lastEphemeralState = { type: "none" };
    this.lastLayer = null;
    this.lastPreviewProperty = null;
    this.handlers = handlers;
    this.map = map;
    void this.setStyle({
      layerConfigs,
      symbolization,
      previewProperty: previewProperty,
    });
  }

  /**
   * Handler proxies --------------------------------------
   */
  onClick = (e: LayerScopedEvent) => {
    this.handlers.current.onClick(e);
  };

  onMapMouseDown = (e: LayerScopedEvent) => {
    this.handlers.current.onMapMouseDown(e);
  };

  onMapTouchStart = (e: mapboxgl.MapTouchEvent) => {
    this.handlers.current.onMapTouchStart(e);
  };

  onMapMouseUp = (e: LayerScopedEvent) => {
    this.handlers.current.onMapMouseUp(e);
  };

  _computeOutlinePath(): [number, number][] | null {
    const f = this.lastSelectionEphemeralPoint;
    if (!f || f.geometry?.type !== "Point") return null;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    const center = this.map.project([lng, lat] as mapboxgl.LngLatLike);
    const props = (f.properties ?? {}) as Record<string, unknown>;
    if (props["marker-type"] === "pin") {
      const pinH = typeof props["pin-size"] === "number" ? (props["pin-size"] as number) : DEFAULT_PIN_SIZE;
      const pinW = pinH * (PIN_VIEWBOX_W / PIN_VIEWBOX_H);
      return buildRoundedRectPath(center.x, center.y - pinH / 2, pinW + 8, pinH + 8, 3, this.map);
    } else if (props["marker-type"] === "emoji") {
      const emojiSize = typeof props["emoji-size"] === "number" ? (props["emoji-size"] as number) : DEFAULT_EMOJI_SIZE;
      const side = emojiSize + 10;
      return buildRoundedRectPath(center.x, center.y, side, side, 5, this.map);
    } else {
      const r = typeof props["marker-size"] === "number" ? (props["marker-size"] as number) : 8;
      const side = r * 2 + 10;
      return buildRoundedRectPath(center.x, center.y, side, side, 5, this.map);
    }
  }

  onZoom = () => {
    if (!this.lastSelectionEphemeralPoint || !this.lastDeckLayers.length) return;
    const path = this._computeOutlinePath();
    const newOutlineLayer = new PolygonLayer({
      id: DECK_POINT_SELECTION_ID,
      data: path ? [path] : [],
      getPolygon: (d: [number, number][]) => d,
      filled: false,
      stroked: true,
      getLineColor: [15, 118, 110, 255],
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      lineJointRounded: true,
      pickable: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.overlay.setProps({
      layers: this.lastDeckLayers.map((layer: any) =>
        layer.id === DECK_POINT_SELECTION_ID ? newOutlineLayer : layer,
      ) as any,
    });
  };

  onMoveEnd = (e: MoveEvent) => {
    this.handlers.current.onMoveEnd(e);
    // Recompute selection outline after zoom so it matches the current scale
    if (this.lastData) {
      this.setData({
        data: this.lastData,
        ephemeralState: this.lastEphemeralState,
      });
    }
  };

  onMapTouchEnd = (e: mapboxgl.MapTouchEvent) => {
    this.handlers.current.onMapTouchEnd(e);
  };

  onMove = (e: MoveEvent) => {
    this.handlers.current.onMove(e);
  };

  onMapMouseMove = (e: mapboxgl.MapMouseEvent) => {
    this.handlers.current.onMapMouseMove(e);
  };

  onMapTouchMove = (e: mapboxgl.MapTouchEvent) => {
    this.handlers.current.onMapTouchMove(e);
  };

  onMapDoubleClick = (e: mapboxgl.MapMouseEvent) => {
    this.handlers.current.onDoubleClick(e);
  };

  setPresences(presences: IPresence[]) {
    const ids = new Set(presences.map((p) => p.userId));
    for (const presence of presences) {
      const marker =
        this.presenceMarkers.get(presence.userId) ??
        new mapboxgl.Marker(cursorSvg(colorFromPresence(presence)));
      marker
        .setLngLat([presence.cursorLongitude, presence.cursorLatitude])
        .addTo(this.map);
      this.presenceMarkers.set(presence.userId, marker);
    }
    // Remove stale presences
    for (const [id, marker] of this.presenceMarkers.entries()) {
      if (!ids.has(id)) {
        marker.remove();
        this.presenceMarkers.delete(id);
      }
    }
  }

  /**
   * The central hard method, trying to optimize feature updates
   * on the map.
   */
  setData({
    data,
    ephemeralState,
    force = false,
  }: {
    data: Data;
    ephemeralState: EphemeralEditingState;
    force?: boolean;
  }) {
    if (!(this.map && (this.map as any).style)) {
      this.lastData = data;
      return;
    }

    const lassoSource = this.map.getSource(
      LASSO_SOURCE_NAME,
    ) as mapboxgl.GeoJSONSource;

    if (!lassoSource) {
      // Style hasn't loaded yet; store data so setStyle re-applies it.
      this.lastData = data;
      return;
    }

    const groups = splitFeatureGroups({
      idMap: this.idMap,
      data,
      lastSymbolization: this.lastSymbolization,
      previewProperty: this.lastPreviewProperty,
    });

    const defaultColor = this.lastSymbolization?.defaultColor ?? purple900;
    const defaultOpacity =
      typeof this.lastSymbolization?.defaultOpacity === "number"
        ? this.lastSymbolization.defaultOpacity
        : 0.3;

    const SELECTED: [number, number, number, number] = [
      ...LINE_COLORS_SELECTED_RGB,
      255,
    ];

    // Separate line/polygon features for mapbox GL rendering
    const LINE_POLY_TYPES = new Set([
      "LineString", "MultiLineString", "Polygon", "MultiPolygon",
    ]);
    const isLineOrPoly = (f: Feature) =>
      LINE_POLY_TYPES.has(f.geometry?.type ?? "");

    // Push line/polygon features to mapbox GL sources
    const featuresSource = this.map.getSource(FEATURES_SOURCE_NAME) as mapboxgl.GeoJSONSource | undefined;
    const ephemeralSource = this.map.getSource(EPHEMERAL_SOURCE_NAME) as mapboxgl.GeoJSONSource | undefined;

    const linePolyFeatures = groups.features.filter(isLineOrPoly);
    const linePolyEphemeral = groups.ephemeral.filter(isLineOrPoly);

    if (featuresSource) {
      mSetData(featuresSource, linePolyFeatures, "mapbox-features", force);
    }
    if (ephemeralSource) {
      mSetData(ephemeralSource, linePolyEphemeral, "mapbox-ephemeral", force);
    }

    // Update line-dasharray expression to include any custom patterns
    if (this.lastSymbolization?.simplestyle) {
      const allLineFeatures = [...linePolyFeatures, ...linePolyEphemeral];
      const dashPatterns = collectDashPatterns(allLineFeatures);
      const dashExpr = buildDashExpression(dashPatterns);
      for (const layerId of [FEATURES_LINE_LAYER_NAME, EPHEMERAL_LINE_LAYER_NAME]) {
        if (this.map.getLayer(layerId)) {
          (this.map as any).setPaintProperty(layerId, "line-dasharray", dashExpr);
        }
      }
    }

    // Sync feature-state for selection (highlight selected features in mapbox GL)
    try {
      for (const id of this.lastMapboxSelectionIds) {
        this.map.removeFeatureState({ source: FEATURES_SOURCE_NAME, id }, "state");
      }
      for (const id of groups.selectionIds) {
        this.map.setFeatureState(
          { source: FEATURES_SOURCE_NAME, id },
          { state: "selected" },
        );
      }
    } catch (_e) {
      // Feature-state updates may fail if the source isn't fully loaded yet;
      // don't let this block deck.gl layer updates.
    }
    this.lastMapboxSelectionIds = groups.selectionIds;

    const makeGeoJsonLayer = (
      id: string,
      features: Feature[],
      selectionIds: Set<RawId>,
    ) =>
      new GeoJsonLayer({
        id,
        data: {
          type: "FeatureCollection" as const,
          features: features as GeoJSON.Feature[],
        },
        pickable: true,
        filled: true,
        stroked: true,
        getFillColor: (f: GeoJSON.Feature) => {
          if (selectionIds.has(f.id as RawId)) return SELECTED;
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const type = f.geometry?.type;
          const isPoint = type === "Point" || type === "MultiPoint";
          const colorStr = isPoint
            ? (props["fill"] as string | undefined)
            : (props["fill"] as string | undefined);
          const color = parseColor(colorStr ?? null, defaultColor);
          const rawOpacity =
            !isPoint && (type === "Polygon" || type === "MultiPolygon")
              ? props["fill-opacity"]
              : isPoint
                ? 1
                : defaultOpacity;
          color[3] = Math.round(
            (typeof rawOpacity === "number" ? rawOpacity : defaultOpacity) *
              255,
          );
          return color;
        },
        getLineColor: (f: GeoJSON.Feature) => {
          if (selectionIds.has(f.id as RawId)) return SELECTED;
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const color = parseColor(
            (props["stroke"] as string | undefined) ?? null,
            defaultColor,
          );
          const opacity = typeof props["stroke-opacity"] === "number" ? props["stroke-opacity"] : 1;
          color[3] = Math.round(opacity * 255);
          return color;
        },
        getLineWidth: (f: GeoJSON.Feature) => {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          return typeof props["stroke-width"] === "number"
            ? props["stroke-width"]
            : 2;
        },
        lineWidthUnits: "pixels" as const,
        getPointRadius: (f: GeoJSON.Feature) => {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          return typeof props["marker-size"] === "number" ? props["marker-size"] : 8;
        },
        pointRadiusUnits: "pixels" as const,
        updateTriggers: {
          getFillColor: [selectionIds, defaultColor, defaultOpacity],
          getLineColor: [selectionIds, defaultColor],
          getLineWidth: [],
        },
      });

    // Only point features go to deck.gl; line/polygon features are rendered by mapbox GL.
    const pointFeatures = groups.features.filter((f) => !isLineOrPoly(f));
    const pointEphemeral = groups.ephemeral.filter((f) => !isLineOrPoly(f));
    const nonSpecialFeatures = pointFeatures.filter((f) => !isPinFeature(f) && !isEmojiFeature(f));
    const nonSpecialEphemeral = pointEphemeral.filter((f) => !isPinFeature(f) && !isEmojiFeature(f));
    const allPinFeatures = [
      ...pointFeatures.filter(isPinFeature),
      ...pointEphemeral.filter(isPinFeature),
    ] as GeoJSON.Feature[];
    const allEmojiFeatures = [
      ...pointFeatures.filter(isEmojiFeature),
      ...pointEphemeral.filter(isEmojiFeature),
    ] as GeoJSON.Feature[];

    // Compute selection outline polygon in screen space, then unproject to lng/lat
    this.lastSelectionEphemeralPoint =
      groups.ephemeral.find((f) => f.geometry?.type === "Point") ?? null;

    const selectionOutlinePath = this._computeOutlinePath();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextLayers: any[] = [
        makeGeoJsonLayer(DECK_FEATURES_ID, nonSpecialFeatures, groups.selectionIds),
        makeGeoJsonLayer(DECK_EPHEMERAL_ID, nonSpecialEphemeral, new Set()),
        new ScatterplotLayer<IFeature<Point>>({
          id: DECK_SYNTHETIC_ID,

          radiusUnits: "pixels",
          lineWidthUnits: "pixels",

          pickable: true,
          stroked: true,
          filled: true,

          data: groups.synthetic,

          getPosition: (d) => d.geometry.coordinates as [number, number],
          getFillColor: (d) => {
            if (d.properties?.fp) return [0, 0, 0, 0];
            return groups.selectionIds.has(d.id as RawId)
              ? WHITE
              : LINE_COLORS_SELECTED_RGB;
          },
          getLineColor: (d) => {
            if (d.properties?.fp) return [0, 0, 0, 0];
            return groups.selectionIds.has(d.id as RawId)
              ? LINE_COLORS_SELECTED_RGB
              : WHITE;
          },
          getLineWidth: 1.5,
          getRadius: (d) => {
            const fp = d.properties?.fp;
            if (fp) return 12;
            const id = Number(d.id || 0);
            return id % 2 === 0 ? 5 : 3.5;
          },
        }),
        new PolygonLayer({
          id: DECK_POINT_SELECTION_ID,
          data: selectionOutlinePath ? [selectionOutlinePath] : [],
          getPolygon: (d) => d,
          filled: false,
          stroked: true,
          getLineColor: [15, 118, 110, 255], // dark teal (teal-700)
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          lineJointRounded: true,
          pickable: false,
        }),
        new IconLayer<GeoJSON.Feature>({
          id: DECK_PIN_LAYER_ID,
          data: allPinFeatures,
          pickable: true,
          getPosition: (f) =>
            (f.geometry as GeoJSON.Point).coordinates as [number, number],
          getIcon: (f: GeoJSON.Feature) => {
            const p = (f.properties ?? {}) as Record<string, unknown>;
            return {
              url: pinSvgDataUrl(
                typeof p["pin-body-color"] === "string" ? p["pin-body-color"] : DEFAULT_PIN_BODY_COLOR,
                typeof p["pin-inner-color"] === "string" ? p["pin-inner-color"] : DEFAULT_PIN_INNER_COLOR,
                typeof p.icon === "string" ? p.icon : null,
                typeof p["icon-color"] === "string" ? p["icon-color"] : DEFAULT_ICON_COLOR,
              ),
              width: PIN_VIEWBOX_W,
              height: PIN_VIEWBOX_H,
              anchorX: PIN_ANCHOR_X,
              anchorY: PIN_ANCHOR_Y,
            };
          },
          getSize: (f: GeoJSON.Feature) =>
            typeof f.properties?.["pin-size"] === "number"
              ? f.properties["pin-size"]
              : DEFAULT_PIN_SIZE,
          sizeUnits: "pixels",
        }),
        (() => {
          if (!this.emojiAtlas) {
            const { atlas, mapping } = buildEmojiAtlas();
            this.emojiAtlas = atlas;
            this.emojiMapping = mapping;
          }
          return new IconLayer<GeoJSON.Feature>({
            id: DECK_EMOJI_LAYER_ID,
            data: allEmojiFeatures,
            pickable: true,
            iconAtlas: this.emojiAtlas,
            iconMapping: this.emojiMapping!,
            getPosition: (f) =>
              (f.geometry as GeoJSON.Point).coordinates as [number, number],
            getIcon: (f: GeoJSON.Feature) => {
              const p = (f.properties ?? {}) as Record<string, unknown>;
              return typeof p["emoji"] === "string" ? p["emoji"] : DEFAULT_EMOJI;
            },
            getSize: (f: GeoJSON.Feature) =>
              typeof f.properties?.["emoji-size"] === "number"
                ? f.properties["emoji-size"]
                : DEFAULT_EMOJI_SIZE,
            sizeUnits: "pixels",
            updateTriggers: {
              getIcon: [allEmojiFeatures],
              getSize: [allEmojiFeatures],
            },
          });
        })(),
        new IconLayer<GeoJSON.Feature>({
          id: DECK_POINT_ICONS_ID,
          data: [...pointFeatures, ...pointEphemeral].filter(
            (f) =>
              f.geometry?.type === "Point" &&
              f.properties?.["marker-type"] !== "pin" &&
              f.properties?.["marker-type"] !== "emoji" &&
              typeof f.properties?.icon === "string" &&
              DECK_ICON_DESCRIPTORS.has(f.properties.icon),
          ),
          pickable: false,
          getPosition: (f) =>
            (f.geometry as GeoJSON.Point).coordinates as [number, number],
          getIcon: (f: GeoJSON.Feature) =>
            DECK_ICON_DESCRIPTORS.get(f.properties?.icon as string)!,
          getSize: (f: GeoJSON.Feature) => {
            const r =
              typeof f.properties?.["marker-size"] === "number"
                ? f.properties["marker-size"]
                : 8;
            const sw =
              typeof f.properties?.["stroke-width"] === "number"
                ? f.properties["stroke-width"]
                : 1;
            const innerRadius = Math.max(0, r - sw / 2);
            return innerRadius * 1.19;
          },
          sizeUnits: "pixels",
          getColor: (f: GeoJSON.Feature) =>
            parseColor(
              (f.properties?.["icon-color"] as string | undefined) ?? null,
              "#ffffff",
            ),
        }),
        new TextLayer<GeoJSON.Feature>({
          id: DECK_POINT_LABELS_ID,
          data: [...pointFeatures, ...pointEphemeral].filter(
            (f) =>
              f.geometry?.type === "Point" &&
              typeof f.properties?.name === "string" &&
              (f.properties.name as string).length > 0 &&
              f.properties?.["name-anchor"] !== "none",
          ),
          pickable: false,
          getPosition: (f) =>
            (f.geometry as GeoJSON.Point).coordinates as [number, number],
          getText: (f) => f.properties?.name as string,
          getSize: 13,
          sizeUnits: "pixels",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: "bold",
          fontSettings: { sdf: true },
          letterSpacing: 0.06,
          getColor: [30, 30, 30, 255],
          outlineWidth: 5,
          outlineColor: [255, 255, 255, 220],
          background: false,
          getPixelOffset: (f: GeoJSON.Feature) => {
            const anchor = (f.properties?.["name-anchor"] as string) || "right";
            const props = f.properties ?? {};
            const isPin = props["marker-type"] === "pin";
            const gap = 6;

            if (isPin) {
              const h = typeof props["pin-size"] === "number" ? props["pin-size"] : DEFAULT_PIN_SIZE;
              const yOffset = -(h * PIN_INNER_CENTER_ABOVE_TIP_FRACTION);
              const xRadius = h * PIN_HALF_WIDTH_FRACTION;
              switch (anchor) {
                case "left":
                  return [-(xRadius + gap), yOffset];
                case "bottom":
                  return [0, gap];
                default: // "right"
                  return [xRadius + gap, yOffset];
              }
            }

            const markerRadius = getMarkerRadius(f);
            switch (anchor) {
              case "left":
                return [-(markerRadius + gap), 0];
              case "bottom":
                return [0, markerRadius + gap];
              default: // "right"
                return [markerRadius + gap, 0];
            }
          },
          getTextAnchor: (f: GeoJSON.Feature) => {
            const anchor = (f.properties?.["name-anchor"] as string) || "right";
            switch (anchor) {
              case "left":
                return "end";
              case "bottom":
                return "middle";
              default:
                return "start";
            }
          },
          getAlignmentBaseline: (f: GeoJSON.Feature) => {
            const anchor = (f.properties?.["name-anchor"] as string) || "right";
            return anchor === "bottom" ? "top" : "center";
          },
          updateTriggers: {
            getPixelOffset: [...pointFeatures, ...pointEphemeral].map(
              (f) => `${f.id}:${f.properties?.["name-anchor"]}:${f.properties?.["marker-type"]}:${f.properties?.["marker-size"]}:${f.properties?.["pin-size"]}:${f.properties?.["emoji-size"]}`,
            ),
            getTextAnchor: [...pointFeatures, ...pointEphemeral].map(
              (f) => `${f.id}:${f.properties?.["name-anchor"]}`,
            ),
            getAlignmentBaseline: [...pointFeatures, ...pointEphemeral].map(
              (f) => `${f.id}:${f.properties?.["name-anchor"]}`,
            ),
          },
        }),
    ];

    this.lastDeckLayers = nextLayers;
    this.overlay.setProps({ layers: nextLayers as any });

    if (ephemeralState.type === "lasso") {
      mSetData(
        lassoSource,
        [
          {
            geometry: bboxToPolygon([
              ...ephemeralState.box[0],
              ...ephemeralState.box[1],
            ]),
            properties: {},
            type: "Feature",
          },
        ],
        "features",
        force,
      );
    } else {
      mSetData(lassoSource, [], "features", force);
    }

    this.lastData = data;
    this.lastEphemeralState = ephemeralState;
  }

  remove() {
    this.map.remove();
  }

  // Use { diff: false } to force a style load: otherwise
  // if we switch from a style to itself, we don't get
  // a style.load event.
  async setStyle({
    layerConfigs,
    symbolization,
    previewProperty,
  }: {
    layerConfigs: LayerConfigMap;
    symbolization: ISymbolization;
    previewProperty: PreviewProperty;
  }) {
    if (
      layerConfigs === this.lastLayer &&
      symbolization === this.lastSymbolization &&
      previewProperty === this.lastPreviewProperty
    ) {
      return;
    }
    this.lastLayer = layerConfigs;
    this.lastSymbolization = symbolization;
    this.lastPreviewProperty = previewProperty;
    const style = await loadAndAugmentStyle({
      layerConfigs,
      symbolization,
      previewProperty,
    });
    this.map.setStyle(style);

    await new Promise((resolve) => setTimeout(resolve, 100));

    if (this.lastData) {
      this.setData({
        data: this.lastData,
        ephemeralState: this.lastEphemeralState,
        force: true,
      });
      this.lastSelection = { type: "none" };
    }
  }

  /**
   * Capture the current map view as a JPEG thumbnail blob.
   * Composites the mapbox GL canvas with any deck.gl overlay canvases.
   */
  captureThumbnail(width = 480, height = 320): Promise<Blob | null> {
    return new Promise((resolve) => {
      try {
        const mapCanvas = this.map.getCanvas();
        const container = mapCanvas.parentElement;
        if (!container) {
          resolve(null);
          return;
        }

        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        // Draw the mapbox GL canvas (basemap + line/polygon layers)
        ctx.drawImage(mapCanvas, 0, 0, width, height);

        // Overlay deck.gl canvases (points, icons, labels)
        const deckCanvases = container.querySelectorAll("canvas");
        for (const c of deckCanvases) {
          if (c === mapCanvas) continue;
          try {
            ctx.drawImage(c, 0, 0, width, height);
          } catch {
            // cross-origin or tainted canvas — skip
          }
        }

        offscreen.toBlob(
          (blob) => resolve(blob),
          "image/jpeg",
          0.85,
        );
      } catch {
        resolve(null);
      }
    });
  }
}
