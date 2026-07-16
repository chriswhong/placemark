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
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronLeftIcon } from "@radix-ui/react-icons";
import { Tooltip as T } from "radix-ui";
import { SquidmapsIcon, TContent, StyledTooltipArrow } from "./elements";
import { Suspense, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { dialogAtom, selectedFeaturesAtom } from "state/jotai";
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

function RightSidebarContent() {
  const selectedFeatures = useAtomValue(selectedFeaturesAtom);
  if (selectedFeatures.length === 1) {
    return <FeatureStylePanel />;
  }
  return (
    <div className="p-3">
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
        Map configuration
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Select a feature to edit its style.
      </p>
    </div>
  );
}

interface SquidmapsProps {
  username: string;
  mapSlug: string;
  mapTitle: string;
}

const panelShadow = "0 6px 20px rgba(18,49,44,0.14)";

function MapWatermark() {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm pointer-events-none select-none">
      <SquidmapsIcon className="w-4 h-4" />
      <span className="text-[11px] font-extrabold text-[#12312c]/70 tracking-tight">
        squidmaps
      </span>
    </div>
  );
}

export function Squidmaps({ username, mapSlug, mapTitle }: SquidmapsProps) {
  const [map, setMap] = useState<PMap | null>(null);

  return (
    <main className="h-screen flex flex-col">
      <T.Provider>
        <MapContext.Provider value={map}>
          <div className="flex-auto relative">
            <MapComponent setMap={setMap} />
            <Legend />

            {/* Mode toolbar — bottom center pill */}
            <div
              className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center bg-white rounded-full border border-[#dde6e2] px-2"
              style={{ boxShadow: panelShadow }}
            >
              <Modes replaceGeometryForId={null} />
            </div>

            {/* Map watermark */}
            <MapWatermark />

            {/* Left panel */}
            <div
              className="absolute top-3 bottom-3 left-3 z-10 w-[270px] flex flex-col bg-white rounded-2xl border border-[#dde6e2] overflow-hidden"
              style={{ boxShadow: panelShadow }}
            >
              <div className="flex items-center gap-x-2 px-3 py-2.5 border-b border-[#dde6e2] shrink-0">
                <T.Root delayDuration={300}>
                  <T.Trigger asChild>
                    <a
                      href={`/@${username}`}
                      className="text-[#8fa8a2] hover:text-[#12312c] transition-colors shrink-0"
                    >
                      <ChevronLeftIcon className="w-5 h-5" />
                    </a>
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
              <div className="px-3 pt-2 shrink-0">
                <span className="text-[10px] font-semibold text-[#8fa8a2] uppercase tracking-wide">
                  Features
                </span>
              </div>
              <FeatureEditorFolderInner />
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
                <button className="text-xs px-2.5 py-1 rounded-full border border-[#dde6e2] text-[#5b7d76] hover:bg-[#eef3f1] transition-colors font-semibold">
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
