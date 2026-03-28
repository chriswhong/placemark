import { purple900 } from "app/lib/constants";
import { usePersistence } from "app/lib/persistence/context";
import debounce from "lodash/debounce";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState, useEffect } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { selectedFeaturesAtom } from "state/jotai";
import type { IWrappedFeature } from "types";
import { ColorPopover } from "./color_popover";
import { inputClass } from "./elements";

const DEFAULT_FILL = purple900;
const DEFAULT_STROKE = "#ffffff";
const DEFAULT_MARKER_SIZE = 8; // radius in pixels
const DEFAULT_STROKE_WIDTH = 1;

export function FeatureStylePanel() {
  const selectedFeatures = useAtomValue(selectedFeaturesAtom);
  if (selectedFeatures.length !== 1) return null;
  return <FeatureStylePanelInner wrappedFeature={selectedFeatures[0]} />;
}

function FeatureStylePanelInner({
  wrappedFeature,
}: {
  wrappedFeature: IWrappedFeature;
}) {
  const rep = usePersistence();
  const transact = rep.useTransact();

  const isPoint = wrappedFeature.feature.geometry?.type === "Point";
  const props = wrappedFeature.feature.properties ?? {};

  const fill = typeof props.fill === "string" ? props.fill : DEFAULT_FILL;
  const stroke = typeof props.stroke === "string" ? props.stroke : DEFAULT_STROKE;
  const markerSize =
    typeof props["marker-size"] === "number"
      ? props["marker-size"]
      : DEFAULT_MARKER_SIZE;
  const strokeWidth =
    typeof props["stroke-width"] === "number"
      ? props["stroke-width"]
      : DEFAULT_STROKE_WIDTH;

  const name = typeof props.name === "string" ? props.name : "";
  const description =
    typeof props.description === "string" ? props.description : "";

  const [localMarkerSize, setLocalMarkerSize] = useState(markerSize);
  const [localStrokeWidth, setLocalStrokeWidth] = useState(strokeWidth);
  const [localName, setLocalName] = useState(name);
  const [localDescription, setLocalDescription] = useState(description);

  const nameFocused = useRef(false);
  const descriptionFocused = useRef(false);

  useEffect(() => { setLocalMarkerSize(markerSize); }, [markerSize]);
  useEffect(() => { setLocalStrokeWidth(strokeWidth); }, [strokeWidth]);
  useEffect(() => { if (!nameFocused.current) setLocalName(name); }, [name]);
  useEffect(() => { if (!descriptionFocused.current) setLocalDescription(description); }, [description]);

  const wrappedFeatureRef = useRef(wrappedFeature);
  wrappedFeatureRef.current = wrappedFeature;

  const updateProps = useMemo(
    () =>
      debounce((updates: Record<string, unknown>) => {
        const wf = wrappedFeatureRef.current;
        const existingProps = wf.feature.properties ?? {};
        transact({
          track: "feature-update-style",
          putFeatures: [
            {
              ...wf,
              feature: {
                ...wf.feature,
                properties: { ...existingProps, ...updates },
              },
            },
          ],
        });
      }, 80),
    [transact],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Details */}
      <div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Details
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
              Name
            </label>
            <input
              type="text"
              value={localName}
              onFocus={() => { nameFocused.current = true; }}
              onBlur={() => { nameFocused.current = false; }}
              onChange={(e) => {
                setLocalName(e.target.value);
                updateProps({ name: e.target.value });
              }}
              placeholder="Add a name…"
              className={inputClass({ _size: "sm" }) + " w-full"}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
              Description
            </label>
            <textarea
              value={localDescription}
              onFocus={() => { descriptionFocused.current = true; }}
              onBlur={() => { descriptionFocused.current = false; }}
              onChange={(e) => {
                setLocalDescription(e.target.value);
                updateProps({ description: e.target.value });
              }}
              placeholder="Add a description…"
              rows={2}
              className="block w-full text-sm border rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Style */}
      <div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Style
        </div>

        {isPoint ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Fill
              </span>
              <ColorPopover
                color={fill}
                onChange={(c) => updateProps({ fill: c })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Outline
              </span>
              <ColorPopover
                color={stroke}
                onChange={(c) => updateProps({ stroke: c })}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Diameter
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {Math.round(localMarkerSize * 2)}px
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={40}
                step={1}
                value={localMarkerSize * 2}
                onChange={(e) => {
                  const v = Number(e.target.value) / 2;
                  setLocalMarkerSize(v);
                  updateProps({ "marker-size": v });
                }}
                className="w-full accent-purple-600"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Outline width
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {localStrokeWidth}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                step={0.5}
                value={localStrokeWidth}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLocalStrokeWidth(v);
                  updateProps({ "stroke-width": v });
                }}
                className="w-full accent-purple-600"
              />
            </div>
          </div>
        ) : (
          <>
            <HexColorPicker color={fill} onChange={(c) => updateProps({ fill: c })} />
            <HexColorInput
              color={fill}
              onChange={(c) => updateProps({ fill: c })}
              prefixed
              className="mt-2 w-full text-sm font-mono border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white"
            />
          </>
        )}
      </div>
    </div>
  );
}
