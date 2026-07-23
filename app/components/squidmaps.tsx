import { Dialogs } from "app/components/dialogs";
import Drop from "app/components/drop";
import { MapComponent } from "app/components/map_component";
import { MapTitleBar } from "app/components/map_title_bar";
import type PMap from "app/lib/pmap";
import "styles/globals.css";
import "core-js/features/array/at";
import { Keybindings } from "app/components/keybindings";
import { Legend } from "app/components/legend";
import Notifications from "app/components/notifications";
import { MapContext } from "app/context/map_context";
import { MapSlugContext, useMapSlug } from "app/context/map_slug_context";
import { useImportFile, useImportString } from "app/hooks/use_import";
import { DEFAULT_IMPORT_OPTIONS, detectType } from "app/lib/convert";
import { groupFiles } from "app/lib/group_files";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { usePersistence } from "app/lib/persistence/context";
import { ChevronLeftIcon, Cross2Icon, Pencil2Icon } from "@radix-ui/react-icons";
import { Switch, Tooltip as T } from "radix-ui";
import { TContent, StyledTooltipArrow } from "./elements";
import { Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { activeInteractionAtom, dataAtom, dialogAtom, layerConfigAtom, scaleUnitAtom, scaleVisibleAtom, selectedFeaturesAtom, zoomControlVisibleAtom, type ActiveInteraction } from "state/jotai";
import { DECK_SYNTHETIC_ID } from "app/lib/constants";
import { SCALE_UNITS, zScaleUnit } from "app/lib/constants";
import { DECK_PIN_LAYER_ID, DECK_EMOJI_LAYER_ID } from "app/lib/pmap";
import { DECK_FEATURES_ID } from "app/lib/load_and_augment_style";
import { decodeId } from "app/lib/id";
import { UIDMap } from "app/lib/id_mapper";
import { getMarkerOptions } from "app/lib/marker_types";
import { match } from "ts-pattern";
import Markdown from "react-markdown";
import { useSearchParams } from "wouter";
import Modes from "app/components/modes";
import { FeatureEditorFolderInner } from "./panels/feature_editor/feature_editor_folder";
import { FeatureStylePanel, MultiFeatureStylePanel } from "./feature_style_panel";

function UrlAPI() {
  const doImportString = useImportString();
  const setDialogState = useSetAtom(dialogAtom);
  const doImportFile = useImportFile();
  const [searchParams] = useSearchParams();
  const load = searchParams?.get("load");
  const done = useRef<boolean>(false);

  useEffect(() => {
    if (load && !done.current) {
      done.current = true;
      (async () => {
        try {
          const url = new URL(load);
          if (url.protocol === "https:") {
            const res = await fetch(url);
            const buffer = await res.arrayBuffer();
            const file = new File(
              [buffer],
              url.pathname.split("/").pop() || "",
              {
                type: res.headers.get("Content-Type") || "",
              },
            );
            const options = (await detectType(file)).unsafeCoerce();
            doImportFile(file, options, () => {});
          } else if (url.protocol === "data:") {
            const [description, ...parts] = url.pathname.split(",");
            const data = parts.join(",");
            const [type, encoding] = description.split(";", 2) as [
              string,
              string | undefined,
            ];

            const decoded = match(encoding)
              .with(undefined, () => decodeURIComponent(data))
              .with("base64", () => atob(data))
              .otherwise(() => {
                throw new Error("Unknown encoding in data url");
              });

            if (type === "application/json") {
              doImportString(
                decoded,
                {
                  ...DEFAULT_IMPORT_OPTIONS,
                  type: "geojson",
                },
                (...args) => {
                  // eslint-disable-next-line no-console
                  console.log(args);
                },
              );
            } else {
              setDialogState({
                type: "load_text",
                initialValue: decoded,
              });
            }
          } else {
            toast.error(
              "Couldn't handle this ?load argument - urls and data urls are supported",
            );
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Failed to load data from URL",
          );
        }
      })();
    }
  }, [load, doImportString, doImportFile, setDialogState]);

  return null;
}

const BASEMAP_OPTIONS = [
  { id: "bright", name: "Bright", url: "https://tiles.openfreemap.org/styles/bright", thumb: "/basemap-bright.svg" },
  { id: "positron", name: "Positron", url: "https://tiles.openfreemap.org/styles/positron", thumb: "/basemap-positron.svg" },
  { id: "dark", name: "Dark", url: "https://tiles.openfreemap.org/styles/dark", thumb: "/basemap-dark.svg" },
  { id: "liberty", name: "Liberty", url: "https://tiles.openfreemap.org/styles/liberty", thumb: "/basemap-liberty.svg" },
  { id: "fiord", name: "Fiord", url: "https://tiles.openfreemap.org/styles/fiord", thumb: "/basemap-fiord.svg" },
] as const;

function BasemapSelector() {
  const [layerConfigs, setLayerConfigs] = useAtom(layerConfigAtom);
  const [scaleVisible, setScaleVisible] = useAtom(scaleVisibleAtom);
  const [scaleUnit, setScaleUnit] = useAtom(scaleUnitAtom);
  const [zoomControlVisible, setZoomControlVisible] = useAtom(zoomControlVisibleAtom);

  // Get current layer config (single entry map)
  const [layerId, currentConfig] = [...layerConfigs.entries()][0];
  const currentUrl = currentConfig?.url ?? "";
  const labelsVisible = currentConfig?.labelVisibility ?? true;

  function selectBasemap(url: string, name: string) {
    if (!layerId || !currentConfig) return;
    const next = new Map(layerConfigs);
    next.set(layerId, { ...currentConfig, url, name });
    setLayerConfigs(next);
  }

  function toggleLabels() {
    if (!layerId || !currentConfig) return;
    const next = new Map(layerConfigs);
    next.set(layerId, { ...currentConfig, labelVisibility: !labelsVisible });
    setLayerConfigs(next);
  }

  return (
    <div className="p-3">
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Basemap</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {BASEMAP_OPTIONS.map((opt) => {
          const selected = currentUrl === opt.url;
          return (
            <button
              key={opt.id}
              onClick={() => selectBasemap(opt.url, opt.name)}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div
                className={`w-[36px] h-[36px] rounded-md overflow-hidden border-2 transition-colors ${
                  selected
                    ? "border-[#1f7a6c]"
                    : "border-[#dde6e2] hover:border-[#8fa8a2]"
                }`}
              >
                <img
                  src={opt.thumb}
                  alt={opt.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  draggable={false}
                />
              </div>
              <span
                className={`text-[10px] font-semibold ${
                  selected ? "text-[#1f7a6c]" : "text-[#5b7d76]"
                }`}
              >
                {opt.name}
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
        <Switch.Root
          checked={labelsVisible}
          onCheckedChange={toggleLabels}
          className="w-[30px] h-[17px] rounded-full bg-[#c7dbd5] data-[state=checked]:bg-[#1f7a6c] transition-colors shrink-0 relative"
        >
          <Switch.Thumb className="block w-[13px] h-[13px] rounded-full bg-white shadow-sm transition-transform translate-x-[2px] data-[state=checked]:translate-x-[15px]" />
        </Switch.Root>
        <span className="text-xs text-[#5b7d76] font-medium">
          Show map labels
        </span>
      </label>

      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-4 mb-2">Controls</div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <Switch.Root
          checked={zoomControlVisible}
          onCheckedChange={setZoomControlVisible}
          className="w-[30px] h-[17px] rounded-full bg-[#c7dbd5] data-[state=checked]:bg-[#1f7a6c] transition-colors shrink-0 relative"
        >
          <Switch.Thumb className="block w-[13px] h-[13px] rounded-full bg-white shadow-sm transition-transform translate-x-[2px] data-[state=checked]:translate-x-[15px]" />
        </Switch.Root>
        <span className="text-xs text-[#5b7d76] font-medium">
          Zoom controls
        </span>
      </label>
      <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
        <Switch.Root
          checked={scaleVisible}
          onCheckedChange={setScaleVisible}
          className="w-[30px] h-[17px] rounded-full bg-[#c7dbd5] data-[state=checked]:bg-[#1f7a6c] transition-colors shrink-0 relative"
        >
          <Switch.Thumb className="block w-[13px] h-[13px] rounded-full bg-white shadow-sm transition-transform translate-x-[2px] data-[state=checked]:translate-x-[15px]" />
        </Switch.Root>
        <span className="text-xs text-[#5b7d76] font-medium">
          Scale bar
        </span>
      </label>
      {scaleVisible && (
        <div className="ml-[38px] mt-1.5">
          <select
            value={scaleUnit}
            onChange={(e) => {
              const data = zScaleUnit.safeParse(e.target.value);
              if (data.success) setScaleUnit(data.data);
            }}
            className="text-xs text-[#5b7d76] bg-white border border-[#dde6e2] rounded px-1.5 py-0.5 outline-none focus:border-[#1f7a6c]"
          >
            {SCALE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit.charAt(0).toUpperCase() + unit.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function RightSidebarContent() {
  const selectedFeatures = useAtomValue(selectedFeaturesAtom);
  if (selectedFeatures.length === 1) {
    return <FeatureStylePanel />;
  }
  if (selectedFeatures.length > 1) {
    return <MultiFeatureStylePanel />;
  }
  return (
    <div>
      <BasemapSelector />
    </div>
  );
}

function MapDescriptionEditor() {
  const rep = usePersistence();
  const [meta, setMeta] = rep.useMetadata();
  const description = meta.type === "memory" ? meta.description ?? "" : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function startEditing() {
    setDraft(description);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function save() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== description) {
      setMeta({ description: trimmed });
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="px-3 pb-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
          placeholder="Add a description…"
          rows={2}
          className="w-full text-xs text-[#5b7d76] bg-white border border-[#1f7a6c] rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-[#1f7a6c]/30 resize-none"
        />
      </div>
    );
  }

  return (
    <div className="px-3 pb-2">
      <button
        onClick={startEditing}
        className="text-xs text-[#8fa8a2] hover:text-[#5b7d76] transition-colors text-left w-full"
        title="Click to edit description"
      >
        {description || "Add a description…"}
      </button>
    </div>
  );
}

function PreviewTitleOverlay({ mapTitle, username }: { mapTitle: string; username: string }) {
  const rep = usePersistence();
  const [meta] = rep.useMetadata();
  const description = meta.type === "memory" ? meta.description ?? "" : "";

  return (
    <div
      className="bg-white/90 backdrop-blur-sm rounded-xl px-5 py-4 border border-[#dde6e2] max-w-sm"
      style={{ boxShadow: panelShadow }}
    >
      <div className="font-semibold text-[#12312c] text-lg leading-snug">
        {mapTitle}
      </div>
      <div className="text-sm text-[#8fa8a2]">
        @{username}
      </div>
      {description && (
        <div className="text-sm text-[#5b7d76] mt-2 leading-relaxed prose prose-sm prose-stone max-w-none">
          <Markdown>{description}</Markdown>
        </div>
      )}
    </div>
  );
}

interface SquidmapsProps {
  username: string;
  mapSlug: string;
  mapTitle: string;
}

const panelShadow = "0 6px 20px rgba(18,49,44,0.14)";

// ---------------------------------------------------------------------------
// Interaction components for preview mode
// ---------------------------------------------------------------------------

function MapPopup({ interaction, onClose }: { interaction: ActiveInteraction; onClose: () => void }) {
  const mapSlug = useMapSlug();
  const imageUrl = interaction.hasImage ? `/api/maps/${mapSlug}/features/${interaction.featureId}/image` : null;
  return (
    <div
      className="absolute z-20 pointer-events-auto"
      style={{ left: interaction.screenX, top: interaction.screenY, transform: "translate(-50%, -100%) translateY(-12px)" }}
    >
      <div
        className="bg-white rounded-xl border border-[#dde6e2] overflow-hidden max-w-xs"
        style={{ boxShadow: panelShadow }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-32 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-sm text-[#12312c]">{interaction.name}</div>
            <button
              onClick={onClose}
              className="text-[#8fa8a2] hover:text-[#12312c] transition-colors shrink-0 mt-0.5"
            >
              <Cross2Icon className="w-3.5 h-3.5" />
            </button>
          </div>
          {interaction.text && (
            <div className="text-xs text-[#5b7d76] mt-1 leading-relaxed prose prose-xs prose-stone max-w-none">
              <Markdown>{interaction.text}</Markdown>
            </div>
          )}
        </div>
      </div>
      {/* Arrow */}
      <div className="flex justify-center -mt-px">
        <div className="w-3 h-3 bg-white border-b border-r border-[#dde6e2] rotate-45 -translate-y-1.5" />
      </div>
    </div>
  );
}

function MapTooltip({ interaction }: { interaction: ActiveInteraction }) {
  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{ left: interaction.screenX, top: interaction.screenY }}
    >
      <div
        className="bg-[#12312c] text-white text-xs px-2.5 py-1.5 rounded-lg max-w-[200px]"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}
      >
        {interaction.name && <div className="font-semibold">{interaction.name}</div>}
        {interaction.text && (
          <div className="opacity-80 mt-0.5 prose prose-xs prose-invert max-w-none">
            <Markdown>{interaction.text}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

function SlideInPanel({ interaction, onClose }: { interaction: ActiveInteraction; onClose: () => void }) {
  const mapSlug = useMapSlug();
  const imageUrl = interaction.hasImage ? `/api/maps/${mapSlug}/features/${interaction.featureId}/image` : null;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <div
      className="absolute top-3 bottom-3 left-3 z-20 w-[300px] flex flex-col bg-white rounded-2xl border border-[#dde6e2] overflow-hidden transition-transform duration-200 ease-out"
      style={{
        boxShadow: panelShadow,
        transform: visible ? "translateX(0)" : "translateX(-110%)",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#dde6e2] shrink-0">
        <div className="font-semibold text-sm text-[#12312c] truncate">{interaction.name}</div>
        <button
          onClick={handleClose}
          className="text-[#8fa8a2] hover:text-[#12312c] transition-colors shrink-0"
        >
          <Cross2Icon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-auto overflow-y-auto squidmaps-scrollbar">
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-48 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {interaction.text && (
          <div className="px-3 py-3 text-sm text-[#5b7d76] leading-relaxed prose prose-sm prose-stone max-w-none">
            <Markdown>{interaction.text}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewInteractionHandler() {
  const map = useContext(MapContext);
  const data = useAtomValue(dataAtom);
  const rep = usePersistence();
  const setInteraction = useSetAtom(activeInteractionAtom);

  useEffect(() => {
    if (!map?.map) return;
    const mlMap = map.map;

    function pickFeature(point: { x: number; y: number }) {
      if (!map) return null;
      const featureLayers = [DECK_FEATURES_ID, DECK_PIN_LAYER_ID, DECK_EMOJI_LAYER_ID, DECK_SYNTHETIC_ID];
      const pick = map.overlay.pickObject({ ...point, layerIds: featureLayers }) as { object: { id: unknown } } | null;
      if (!pick) {
        const multi = map.overlay.pickMultipleObjects({ ...point, radius: 10, layerIds: featureLayers }) as { object: { id: unknown } }[] | null;
        return multi?.[0] ?? null;
      }
      return pick;
    }

    function getInteractionForPick(pick: { object: { id: unknown } } | null) {
      if (!pick) return null;
      const rawId = pick.object.id;
      const decoded = decodeId(rawId as RawId);
      if (decoded.type !== "feature") return null;
      const uuid = UIDMap.getUUID(rep.idMap, decoded.featureId);
      const wf = data.featureMap.get(uuid);
      if (!wf) return null;
      const props = (wf.feature.properties ?? {}) as Record<string, unknown>;
      const iType = typeof props["interaction-type"] === "string" ? props["interaction-type"] : "none";
      if (iType === "none") return null;
      return { wf, props, iType: iType as "popup" | "tooltip" | "panel" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getScreenPosForFeature(
      wf: any,
      props: Record<string, unknown>,
    ): { screenX: number; screenY: number } {
      const geom = wf.feature?.geometry;
      if (!geom || geom.type !== "Point") return { screenX: 0, screenY: 0 };
      const [lng, lat] = (geom as GeoJSON.Point).coordinates;
      const pt = mlMap.project([lng, lat] as maplibregl.LngLatLike);
      const marker = getMarkerOptions(props);
      let offsetY = 0;
      switch (marker.type) {
        case "circle":
          offsetY = marker.markerSize + marker.strokeWidth;
          break;
        case "pin":
          offsetY = marker.size;
          break;
        case "emoji":
          offsetY = marker.size / 2;
          break;
      }
      return { screenX: pt.x, screenY: pt.y - offsetY };
    }

    function onClick(e: maplibregl.MapMouseEvent) {
      const pick = pickFeature(e.point);
      const info = getInteractionForPick(pick);
      if (!info || info.iType === "tooltip") {
        if (!info) setInteraction(null);
        return;
      }
      const name = typeof info.props.name === "string" ? info.props.name : "";
      const text = typeof info.props.description === "string" ? info.props.description : "";
      const hasImage = !!info.props._hasImage;
      const pos = getScreenPosForFeature(info.wf, info.props);
      setInteraction({
        featureId: info.wf.id,
        type: info.iType,
        name,
        text,
        hasImage,
        ...pos,
      });
    }

    function onMouseMove(e: maplibregl.MapMouseEvent) {
      const pick = pickFeature(e.point);
      const info = getInteractionForPick(pick);
      if (info?.iType === "tooltip") {
        const name = typeof info.props.name === "string" ? info.props.name : "";
        const text = typeof info.props.description === "string" ? info.props.description : "";
        setInteraction({
          featureId: info.wf.id,
          type: "tooltip",
          name,
          text,
          hasImage: false,
          screenX: e.point.x + 12,
          screenY: e.point.y - 8,
        });
        mlMap.getCanvas().style.cursor = "pointer";
      } else {
        setInteraction((prev) => prev?.type === "tooltip" ? null : prev);
        if (info) {
          mlMap.getCanvas().style.cursor = "pointer";
        } else {
          mlMap.getCanvas().style.cursor = "";
        }
      }
    }

    mlMap.on("click", onClick);
    mlMap.on("mousemove", onMouseMove);
    return () => {
      mlMap.off("click", onClick);
      mlMap.off("mousemove", onMouseMove);
      mlMap.getCanvas().style.cursor = "";
    };
  }, [map, data, rep.idMap, setInteraction]);

  return null;
}

function InteractionOverlay() {
  const [interaction, setInteraction] = useAtom(activeInteractionAtom);
  if (!interaction) return null;

  const onClose = () => setInteraction(null);

  return (
    <>
      {interaction.type === "popup" && <MapPopup interaction={interaction} onClose={onClose} />}
      {interaction.type === "tooltip" && <MapTooltip interaction={interaction} />}
      {interaction.type === "panel" && <SlideInPanel interaction={interaction} onClose={onClose} />}
    </>
  );
}

function DebugPanel() {
  const map = useContext(MapContext);
  const data = useAtomValue(dataAtom);
  return (
    <div className="flex gap-1 px-3 py-2 border-t border-[#dde6e2]">
      <button
        className="text-[10px] px-2 py-0.5 rounded border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 bg-white/80 transition-colors font-mono"
        onClick={() => {
          if (map) {
            // eslint-disable-next-line no-console
            console.log("Map style:", map.map.getStyle());
          }
        }}
      >
        log style
      </button>
      <button
        className="text-[10px] px-2 py-0.5 rounded border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 bg-white/80 transition-colors font-mono"
        onClick={() => {
          const fc = {
            type: "FeatureCollection" as const,
            features: [...data.featureMap.values()].map((wf) => wf.feature),
          };
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(fc, null, 2));
        }}
      >
        log features
      </button>
    </div>
  );
}


async function captureAndUploadThumbnail(pmap: PMap | null, mapSlug: string) {
  if (!pmap) return;
  try {
    const blob = await pmap.captureThumbnail();
    if (!blob) return;
    await fetch(`/api/maps/${mapSlug}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
  } catch {
    // Thumbnail upload is best-effort; don't block navigation
  }
}

export function Squidmaps({ username, mapSlug, mapTitle }: SquidmapsProps) {
  const [map, setMap] = useState<PMap | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isPreview = searchParams?.get("preview") === "true";

  const handleBackToMaps = useCallback(async () => {
    await captureAndUploadThumbnail(map, mapSlug);
    window.location.href = `/@${username}`;
  }, [map, mapSlug, username]);

  const enterPreview = useCallback(() => {
    setSearchParams("?preview=true");
  }, [setSearchParams]);

  const setDialogState = useSetAtom(dialogAtom);
  const setInteraction = useSetAtom(activeInteractionAtom);
  const exitPreview = useCallback(() => {
    setInteraction(null);
    setSearchParams("");
  }, [setSearchParams, setInteraction]);

  return (
    <main className="h-screen flex flex-col">
      <T.Provider>
        <MapSlugContext.Provider value={mapSlug}>
        <MapContext.Provider value={map}>
          <div className="flex-auto relative">
            <MapComponent setMap={setMap} />
            <Legend />

            {isPreview ? (
              <>
                {/* Preview mode: title + back to editor */}
                <div className="absolute top-4 left-4 z-10 flex items-start gap-2">
                  <PreviewTitleOverlay
                    mapTitle={mapTitle}
                    username={username}
                  />
                  <button
                    onClick={exitPreview}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-[#dde6e2] text-[#5b7d76] hover:bg-white hover:text-[#12312c] transition-colors font-semibold mt-1"
                    style={{ boxShadow: panelShadow }}
                  >
                    <Pencil2Icon className="w-3 h-3" />
                    Back to editor
                  </button>
                </div>
                <PreviewInteractionHandler />
              </>
            ) : (
              <>
                {/* Mode toolbar — bottom center pill */}
                <div
                  className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center bg-white rounded-full border border-[#dde6e2] px-2"
                  style={{ boxShadow: panelShadow }}
                >
                  <Modes replaceGeometryForId={null} />
                </div>

                {/* Left panel */}
                <div
                  className="absolute top-3 bottom-3 left-3 z-10 w-[270px] flex flex-col bg-white rounded-2xl border border-[#dde6e2] overflow-hidden"
                  style={{ boxShadow: panelShadow }}
                >
                  <div className="flex items-center gap-x-2 px-3 py-2.5 border-b border-[#dde6e2] shrink-0">
                    <T.Root delayDuration={300}>
                      <T.Trigger asChild>
                        <button
                          onClick={handleBackToMaps}
                          className="text-[#8fa8a2] hover:text-[#12312c] transition-colors shrink-0"
                        >
                          <ChevronLeftIcon className="w-5 h-5" />
                        </button>
                      </T.Trigger>
                      <T.Portal>
                        <TContent side="right">
                          Back to maps
                          <StyledTooltipArrow />
                        </TContent>
                      </T.Portal>
                    </T.Root>
                    <div className="flex flex-col min-w-0 flex-1">
                      <MapTitleBar
                        username={username}
                        mapSlug={mapSlug}
                        initialTitle={mapTitle}
                      />
                      <span className="text-xs text-[#8fa8a2] truncate">
                        /@{username}/{mapSlug}
                      </span>
                    </div>
                  </div>
                  <MapDescriptionEditor />
                  <div className="flex items-center justify-between px-3 pt-2 shrink-0">
                    <span className="text-[10px] font-semibold text-[#8fa8a2] uppercase tracking-wide">
                      Features
                    </span>
                    <button
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.multiple = true;
                        input.accept = ".geojson,.json,.kml,.kmz,.gpx,.csv,.xlsx,.xls,.topojson,.shp,.wkt,.tcx,.osm,.pbf,.fgb,.zip";
                        input.onchange = () => {
                          if (input.files?.length) {
                            setDialogState({
                              type: "import",
                              files: groupFiles(Array.from(input.files)),
                            });
                          }
                        };
                        input.click();
                      }}
                      className="text-[10px] font-semibold text-[#1f7a6c] hover:text-[#12312c] transition-colors uppercase tracking-wide"
                    >
                      + Import
                    </button>
                  </div>
                  <FeatureEditorFolderInner />
                  <div className="mt-auto">
                    <DebugPanel />
                  </div>
                </div>

                {/* Right panel */}
                <div
                  className="absolute top-3 bottom-3 right-3 z-10 w-[270px] flex flex-col bg-white rounded-2xl border border-[#dde6e2] overflow-hidden"
                  style={{ boxShadow: panelShadow }}
                >
                  <div className="flex items-center gap-x-2 px-3 py-2.5 border-b border-[#dde6e2] shrink-0">
                    <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center bg-[#12312c] text-white text-xs font-bold shrink-0 select-none">
                      {username[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1" />
                    <button
                      onClick={enterPreview}
                      className="text-xs px-2.5 py-1 rounded-full border border-[#dde6e2] text-[#5b7d76] hover:bg-[#eef3f1] transition-colors font-semibold"
                    >
                      Preview
                    </button>
                    <button className="text-xs px-2.5 py-1 rounded-full bg-[#1f7a6c] hover:bg-[#196358] text-white transition-colors font-semibold">
                      Publish
                    </button>
                  </div>
                  <div className="flex-auto overflow-y-auto squidmaps-scrollbar">
                    <RightSidebarContent />
                  </div>
                </div>
              </>
            )}
            <InteractionOverlay />
          </div>
          <Drop />
          <UrlAPI />
          <Dialogs />
          <Suspense fallback={null}>
            <Keybindings />
          </Suspense>
          <Notifications />
        </MapContext.Provider>
        </MapSlugContext.Provider>
      </T.Provider>
    </main>
  );
}
