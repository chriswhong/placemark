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
import { useImportFile, useImportString } from "app/hooks/use_import";
import { DEFAULT_IMPORT_OPTIONS, detectType } from "app/lib/convert";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { usePersistence } from "app/lib/persistence/context";
import { ChevronLeftIcon, Pencil2Icon } from "@radix-ui/react-icons";
import { Switch, Tooltip as T } from "radix-ui";
import { TContent, StyledTooltipArrow } from "./elements";
import { Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { dialogAtom, layerConfigAtom, selectedFeaturesAtom } from "state/jotai";
import { match } from "ts-pattern";
import { useSearchParams } from "wouter";
import Modes from "app/components/modes";
import { FeatureEditorFolderInner } from "./panels/feature_editor/feature_editor_folder";
import { FeatureStylePanel } from "./feature_style_panel";

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
    </div>
  );
}

function RightSidebarContent() {
  const selectedFeatures = useAtomValue(selectedFeaturesAtom);
  if (selectedFeatures.length === 1) {
    return <FeatureStylePanel />;
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
    <div className="absolute top-4 left-4 z-10">
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
          <div className="text-sm text-[#5b7d76] mt-2 leading-relaxed">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

interface SquidmapsProps {
  username: string;
  mapSlug: string;
  mapTitle: string;
}

const panelShadow = "0 6px 20px rgba(18,49,44,0.14)";

function DebugPanel() {
  const map = useContext(MapContext);
  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
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

  const exitPreview = useCallback(() => {
    setSearchParams("");
  }, [setSearchParams]);

  return (
    <main className="h-screen flex flex-col">
      <T.Provider>
        <MapContext.Provider value={map}>
          <div className="flex-auto relative">
            <MapComponent setMap={setMap} />
            <Legend />

            {isPreview ? (
              <>
                {/* Preview mode: title overlay */}
                <PreviewTitleOverlay
                  mapTitle={mapTitle}
                  username={username}
                />

                {/* Preview mode: back to editor button */}
                <div className="absolute top-4 right-4 z-10">
                  <button
                    onClick={exitPreview}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-[#dde6e2] text-[#5b7d76] hover:bg-white hover:text-[#12312c] transition-colors font-semibold"
                    style={{ boxShadow: panelShadow }}
                  >
                    <Pencil2Icon className="w-3 h-3" />
                    Back to editor
                  </button>
                </div>
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
                  <div className="px-3 pt-2 shrink-0">
                    <span className="text-[10px] font-semibold text-[#8fa8a2] uppercase tracking-wide">
                      Features
                    </span>
                  </div>
                  <FeatureEditorFolderInner />
                </div>

                <DebugPanel />

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
          </div>
          <Drop />
          <UrlAPI />
          <Dialogs />
          <Suspense fallback={null}>
            <Keybindings />
          </Suspense>
          <Notifications />
        </MapContext.Provider>
      </T.Provider>
    </main>
  );
}
