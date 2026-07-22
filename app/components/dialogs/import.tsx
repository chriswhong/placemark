import { PlusCircledIcon } from "@radix-ui/react-icons";
import addedFeaturesToast from "app/components/added_features_toast";
import { DialogHeader } from "app/components/dialog";
import { MapContext } from "app/context/map_context";
import type { ConvertResult } from "app/lib/convert/utils";
import { flattenResult } from "./import_utils";
import { extendExtent, getExtent } from "app/lib/geometry";
import { truncate } from "app/lib/utils";
import { DEFAULT_IMPORT_OPTIONS, detectType } from "app/lib/convert";
import type { ImportOptions } from "app/lib/convert";
import type { FileGroup } from "app/lib/group_files";
import type { ShapefileGroup } from "app/lib/convert/shapefile";
import { Shapefile } from "app/lib/convert/shapefile";
import { useImportFile, useImportShapefile, type PropertyMapping } from "app/hooks/use_import";
import { lib } from "app/lib/worker";
import * as Comlink from "comlink";
import { transfer } from "comlink";
import type { LngLatBoundsLike } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import { type Maybe, Nothing } from "purify-ts/Maybe";
import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ModalStateImport } from "state/jotai";
import type { BBox } from "types";
import type { FeatureCollection } from "types";

export type OnNext = (arg0: ConvertResult | null) => void;

/** Count features by geometry type */
function geometryBreakdown(fc: FeatureCollection) {
  const counts: Record<string, number> = {};
  for (const f of fc.features) {
    const type = f.geometry?.type ?? "Unknown";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

const GEOMETRY_LABELS: Record<string, string> = {
  Point: "point",
  MultiPoint: "multi-point",
  LineString: "line",
  MultiLineString: "multi-line",
  Polygon: "polygon",
  MultiPolygon: "multi-polygon",
  GeometryCollection: "geometry collection",
};

/** Collect all unique property keys across features, sorted by frequency */
function collectPropertyKeys(fc: FeatureCollection): string[] {
  const counts = new Map<string, number>();
  for (const f of fc.features) {
    if (!f.properties) continue;
    for (const key of Object.keys(f.properties)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

/** Auto-detect which property should map to name/description */
function autoDetectMapping(keys: string[]): { nameKey: string; descKey: string } {
  const lower = keys.map((k) => k.toLowerCase());

  let nameKey = "";
  const nameCandidates = ["name", "title", "label", "feature_name", "place_name", "site_name"];
  for (const candidate of nameCandidates) {
    const idx = lower.indexOf(candidate);
    if (idx !== -1) { nameKey = keys[idx]; break; }
  }

  let descKey = "";
  const descCandidates = ["description", "desc", "notes", "comment", "comments", "details", "summary", "remarks"];
  for (const candidate of descCandidates) {
    const idx = lower.indexOf(candidate);
    if (idx !== -1) { descKey = keys[idx]; break; }
  }

  return { nameKey, descKey };
}

// ---------------------------------------------------------------------------
// Preview map
// ---------------------------------------------------------------------------

function ImportPreviewMap({ geojson }: { geojson: FeatureCollection }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [0, 0],
      zoom: 1,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("import-preview", {
        type: "geojson",
        data: geojson as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: "import-fill",
        type: "fill",
        source: "import-preview",
        filter: ["any",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "MultiPolygon"],
        ],
        paint: { "fill-color": "#1f7a6c", "fill-opacity": 0.15 },
      });

      map.addLayer({
        id: "import-line",
        type: "line",
        source: "import-preview",
        filter: ["any",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "MultiPolygon"],
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "MultiLineString"],
        ],
        paint: { "line-color": "#1f7a6c", "line-width": 2 },
      });

      map.addLayer({
        id: "import-circle",
        type: "circle",
        source: "import-preview",
        filter: ["any",
          ["==", ["geometry-type"], "Point"],
          ["==", ["geometry-type"], "MultiPoint"],
        ],
        paint: {
          "circle-radius": 4,
          "circle-color": "#1f7a6c",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });

      // Fit bounds
      const bounds = new maplibregl.LngLatBounds();
      let hasCoords = false;
      for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        for (const [lng, lat] of getAllCoords(geom)) {
          if (isFinite(lng) && isFinite(lat)) {
            bounds.extend([lng, lat]);
            hasCoords = true;
          }
        }
      }
      if (hasCoords) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geojson]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[260px] rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
    />
  );
}

function getAllCoords(geom: GeoJSON.Geometry): number[][] {
  switch (geom.type) {
    case "Point": return [geom.coordinates];
    case "MultiPoint":
    case "LineString": return geom.coordinates;
    case "MultiLineString":
    case "Polygon": return geom.coordinates.flat();
    case "MultiPolygon": return geom.coordinates.flat(2);
    case "GeometryCollection": return geom.geometries.flatMap(getAllCoords);
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Property mapping select
// ---------------------------------------------------------------------------

function PropertySelect({
  label,
  value,
  onChange,
  keys,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keys: string[];
  preview: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0 font-medium">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 outline-none focus:border-[#1f7a6c] text-gray-700 dark:text-gray-300 min-w-0"
      >
        <option value="">— None —</option>
        {keys.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      {preview && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[120px]" title={preview}>
          e.g. {preview}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main preview component
// ---------------------------------------------------------------------------

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; geojson: FeatureCollection; result: ConvertResult; options: ImportOptions };

function ImportPreview({
  fileGroup,
  onClose,
  onImported,
}: {
  fileGroup: FileGroup | ShapefileGroup;
  onClose: () => void;
  onImported: (result: ConvertResult) => void;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [importing, setImporting] = useState(false);
  const [nameKey, setNameKey] = useState("");
  const [descKey, setDescKey] = useState("");
  const [mappingInitialized, setMappingInitialized] = useState(false);
  const doImport = useImportFile();
  const doImportShapefile = useImportShapefile();

  // Auto-detect and convert on mount
  useEffect(() => {
    let cancelled = false;

    async function convert() {
      try {
        if (fileGroup.type === "shapefile") {
          const options: ImportOptions = {
            ...DEFAULT_IMPORT_OPTIONS,
            type: "shapefile",
          };
          const either = await Shapefile.forwardLoose(fileGroup, options);
          if (cancelled) return;
          either.caseOf({
            Left(err) {
              setState({ status: "error", message: err.message });
            },
            Right(result) {
              const fc = flattenResult(result);
              setState({ status: "ready", geojson: fc, result, options });
            },
          });
        } else {
          const file = fileGroup.file;
          const detected = await detectType(file);
          if (cancelled) return;
          const detectedOpts = detected.orDefault({
            ...DEFAULT_IMPORT_OPTIONS,
            type: "geojson",
          });
          const options: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...detectedOpts };

          const arrayBuffer = await file.arrayBuffer();
          const either = await lib.fileToGeoJSON(
            transfer(arrayBuffer, [arrayBuffer]),
            options,
            Comlink.proxy(() => {}),
          );
          if (cancelled) return;
          either.caseOf({
            Left(err) {
              setState({ status: "error", message: err.message });
            },
            Right(result) {
              const fc = flattenResult(result);
              setState({ status: "ready", geojson: fc, result, options });
            },
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setState({ status: "error", message: e.message || "Failed to read file" });
        }
      }
    }

    convert();
    return () => { cancelled = true; };
  }, [fileGroup]);

  // Property keys and auto-detection
  const propertyKeys = useMemo(() => {
    if (state.status !== "ready") return [];
    return collectPropertyKeys(state.geojson);
  }, [state]);

  // Auto-detect mapping once when data is ready
  useEffect(() => {
    if (state.status !== "ready" || mappingInitialized) return;
    const detected = autoDetectMapping(propertyKeys);
    setNameKey(detected.nameKey);
    setDescKey(detected.descKey);
    setMappingInitialized(true);
  }, [state, propertyKeys, mappingInitialized]);

  // Preview values for the selected keys
  const namePreview = useMemo(() => {
    if (state.status !== "ready" || !nameKey) return "";
    for (const f of state.geojson.features) {
      const v = f.properties?.[nameKey];
      if (v != null && String(v).trim()) return String(v);
    }
    return "";
  }, [state, nameKey]);

  const descPreview = useMemo(() => {
    if (state.status !== "ready" || !descKey) return "";
    for (const f of state.geojson.features) {
      const v = f.properties?.[descKey];
      if (v != null && String(v).trim()) return String(v);
    }
    return "";
  }, [state, descKey]);

  const handleImport = useCallback(async () => {
    if (state.status !== "ready") return;
    setImporting(true);

    const mapping: PropertyMapping = { nameKey, descKey };

    try {
      if (fileGroup.type === "shapefile") {
        const res = await doImportShapefile(fileGroup, state.options, mapping);
        res.caseOf({
          Left(err) {
            setState({ status: "error", message: err.message });
            setImporting(false);
          },
          Right: async (r) => {
            onImported(await r);
          },
        });
      } else {
        const res = await doImport(fileGroup.file, state.options, () => {}, mapping);
        res.caseOf({
          Left(err) {
            setState({ status: "error", message: err.message });
            setImporting(false);
          },
          Right: async (r) => {
            onImported(await r);
          },
        });
      }
    } catch (e: any) {
      setState({ status: "error", message: e.message });
      setImporting(false);
    }
  }, [state, nameKey, descKey, fileGroup, doImport, doImportShapefile, onImported]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-6 h-6 border-2 border-[#1f7a6c] border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-gray-500">Reading file…</div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg p-3">
          {state.message}
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const { geojson } = state;
  const featureCount = geojson.features.length;
  const breakdown = geometryBreakdown(geojson);
  const breakdownEntries = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  const hasProperties = propertyKeys.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <ImportPreviewMap geojson={geojson} />

      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Importing {featureCount} {featureCount === 1 ? "feature" : "features"}
        </div>

        <div className="flex flex-wrap gap-2">
          {breakdownEntries.map(([type, count]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-1"
            >
              <GeometryDot type={type} />
              {count} {GEOMETRY_LABELS[type] ?? type}
            </span>
          ))}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
          Features will be added with default styling
          {breakdown.Point || breakdown.MultiPoint ? " (circle markers for points)" : ""}.
        </p>
      </div>

      {/* Property mapping */}
      {hasProperties && (
        <div className="flex flex-col gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Map properties
          </div>
          <PropertySelect
            label="Name"
            value={nameKey}
            onChange={setNameKey}
            keys={propertyKeys}
            preview={namePreview}
          />
          <PropertySelect
            label="Description"
            value={descKey}
            onChange={setDescKey}
            keys={propertyKeys}
            preview={descPreview}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="text-sm px-4 py-2 rounded-lg bg-[#1f7a6c] text-white hover:bg-[#196358] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {importing && (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Import
        </button>
      </div>
    </div>
  );
}

function GeometryDot({ type }: { type: string }) {
  const isPoint = type === "Point" || type === "MultiPoint";
  const isLine = type === "LineString" || type === "MultiLineString";

  if (isPoint) {
    return <span className="w-2 h-2 rounded-full bg-[#12312c] shrink-0" />;
  }
  if (isLine) {
    return <span className="w-3 h-0.5 bg-[#1f7a6c] rounded-full shrink-0" />;
  }
  return <span className="w-2.5 h-2 bg-[#1f7a6c]/20 border border-[#1f7a6c] rounded-sm shrink-0" />;
}

export function ImportDialog({
  modal,
  onClose,
}: {
  modal: ModalStateImport;
  onClose: () => void;
}) {
  const { files } = modal;
  const map = useContext(MapContext);

  const [index, setIndex] = useState<number>(0);
  const [extent, setExtent] = useState<Maybe<BBox>>(Nothing);

  const file = files[index];
  const hasNext = index < files.length - 1;
  const progress = files.length > 1 ? ` (${index + 1}/${files.length})` : "";

  const fileName = file.type === "file" ? file.file.name : "Shapefile";

  const onImported = useCallback((result: ConvertResult) => {
    let nextExtent = extent;
    if (result) {
      nextExtent = extendExtent(getExtent(flattenResult(result)), extent);
    }
    if (hasNext) {
      setExtent(nextExtent);
      setIndex((i) => i + 1);
    } else {
      nextExtent.map((importedExtent) => {
        map?.map.fitBounds(importedExtent as LngLatBoundsLike, {
          padding: 100,
        });
      });
      addedFeaturesToast(result);
      onClose();
    }
  }, [extent, hasNext, map, onClose]);

  return (
    <>
      <DialogHeader
        title={`Import ${truncate(fileName)}${progress}`}
        titleIcon={PlusCircledIcon}
      />
      <ImportPreview
        key={index}
        fileGroup={file}
        onClose={onClose}
        onImported={onImported}
      />
    </>
  );
}
