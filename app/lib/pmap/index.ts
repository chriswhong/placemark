import { GeoJsonLayer, IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
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

const SELECTION_RECT_ICON = {
  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="2" width="28" height="28" rx="5" ry="5" fill="none" stroke="${LINE_COLORS_SELECTED}" stroke-width="2.5"/></svg>`)}`,
  width: 32,
  height: 32,
};

const MAP_OPTIONS: Omit<mapboxgl.MapboxOptions, "container"> = {
  style: { version: 8, layers: [], sources: {} },
  maxZoom: 26,
  boxZoom: false,
  dragRotate: false,
  attributionControl: false,
  fadeDuration: 0,
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

  constructor({
    element,
    layerConfigs,
    handlers,
    previewProperty,
    symbolization,
    idMap,
    controlsCorner = "bottom-left",
  }: {
    element: HTMLDivElement;
    layerConfigs: LayerConfigMap;
    handlers: React.MutableRefObject<PMapHandlers>;
    symbolization: ISymbolization;
    previewProperty: PreviewProperty;
    idMap: IDMap;
    controlsCorner?: Parameters<mapboxgl.Map["addControl"]>[1];
  }) {
    this.idMap = idMap;
    const positionOptions = {
      bounds: DEFAULT_MAP_BOUNDS as mapboxgl.LngLatBoundsLike,
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

  onMoveEnd = (e: MoveEvent) => {
    this.handlers.current.onMoveEnd(e);
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
          return parseColor(
            (props["stroke"] as string | undefined) ?? null,
            defaultColor,
          );
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

    this.overlay.setProps({
      layers: [
        makeGeoJsonLayer(DECK_FEATURES_ID, groups.features, groups.selectionIds),
        makeGeoJsonLayer(DECK_EPHEMERAL_ID, groups.ephemeral, new Set()),
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
        new IconLayer<IFeature<Point>>({
          id: DECK_POINT_SELECTION_ID,
          data: groups.synthetic.filter((d) => d.properties?.fp),
          pickable: false,
          getPosition: (d) => d.geometry.coordinates as [number, number],
          getIcon: () => SELECTION_RECT_ICON,
          getSize: (() => {
            const fpPoint = groups.ephemeral.find(
              (f) => f.geometry?.type === "Point",
            );
            const markerRadius =
              typeof fpPoint?.properties?.["marker-size"] === "number"
                ? fpPoint.properties["marker-size"]
                : 8;
            return markerRadius * 4;
          })(),
          sizeUnits: "pixels",
        }),
        new TextLayer<GeoJSON.Feature>({
          id: DECK_POINT_LABELS_ID,
          data: [...groups.features, ...groups.ephemeral].filter(
            (f) =>
              f.geometry?.type === "Point" &&
              typeof f.properties?.name === "string" &&
              (f.properties.name as string).length > 0,
          ),
          pickable: false,
          getPosition: (f) =>
            (f.geometry as GeoJSON.Point).coordinates as [number, number],
          getText: (f) => f.properties?.name as string,
          getSize: 13,
          sizeUnits: "pixels",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: "bold",
          getColor: [30, 30, 30, 255],
          background: false,
          getPixelOffset: (f: GeoJSON.Feature) => {
            const r =
              typeof f.properties?.["marker-size"] === "number"
                ? f.properties["marker-size"]
                : 8;
            return [r + 6, 0];
          },
          getTextAnchor: "start",
          getAlignmentBaseline: "center",
        }),
      ],
    });

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
}
