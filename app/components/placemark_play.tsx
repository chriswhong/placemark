import { Dialogs } from "app/components/dialogs";
import Drop from "app/components/drop";
import { MapComponent } from "app/components/map_component";
import { MenuBarPlay } from "app/components/menu_bar";
import type PMap from "app/lib/pmap";
import "styles/globals.css";
import "core-js/features/array/at";
import { ErrorBoundary } from "app/components/elements";
import { Keybindings } from "app/components/keybindings";
import { Legend } from "app/components/legend";
import Notifications from "app/components/notifications";
import { MapContext } from "app/context/map_context";
import { useImportFile, useImportString } from "app/hooks/use_import";
import { DEFAULT_IMPORT_OPTIONS, detectType } from "app/lib/convert";
import { useSetAtom } from "jotai";
import { Tooltip as T } from "radix-ui";
import { Suspense, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { dialogAtom } from "state/jotai";
import { match } from "ts-pattern";
import { useSearchParams } from "wouter";
import { UpdateIcon } from "@radix-ui/react-icons";
import Modes from "app/components/modes";
import { Button } from "./elements";
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

interface PlacemarkPlayProps {
  username: string;
  mapSlug: string;
  mapTitle: string;
}

export function PlacemarkPlay({ username, mapSlug, mapTitle }: PlacemarkPlayProps) {
  const [map, setMap] = useState<PMap | null>(null);

  return (
    <main className="h-screen flex flex-col bg-white dark:bg-gray-800">
      <T.Provider>
        <MapContext.Provider value={map}>
          <ErrorBoundary
            fallback={(props) => {
              return (
                <div className="h-20 flex items-center justify-center px-2 gap-x-2">
                  An error occurred
                  <Button onClick={() => props.resetError()}>
                    <UpdateIcon /> Try again
                  </Button>
                </div>
              );
            }}
          >
            <MenuBarPlay username={username} mapSlug={mapSlug} mapTitle={mapTitle} />
          </ErrorBoundary>
          <div className="flex-auto relative">
            <MapComponent setMap={setMap} />
            <Legend />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 shadow-md px-1">
              <Modes replaceGeometryForId={null} />
            </div>
            <div className="absolute top-4 bottom-4 left-4 z-10 w-64 flex flex-col bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden">
              <FeatureEditorFolderInner />
            </div>
            <div className="absolute top-4 left-[288px] z-10 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 shadow-md">
              <FeatureStylePanel />
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
