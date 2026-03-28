import { usePersistence } from "app/lib/persistence/context";
import {
  getMarkerOptions,
  DEFAULT_PIN_BODY_COLOR,
  DEFAULT_PIN_INNER_COLOR,
  DEFAULT_PIN_SIZE,
  type AnyMarkerOptions,
} from "app/lib/marker_types";
import { ICONS, iconToDataUrl } from "app/lib/icons";
import debounce from "lodash/debounce";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { selectedFeaturesAtom } from "state/jotai";
import type { IWrappedFeature } from "types";
import { ColorPopover } from "./color_popover";
import { inputClass } from "./elements";

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
  const props = (wrappedFeature.feature.properties ?? {}) as Record<string, unknown>;

  const markerOptions: AnyMarkerOptions = getMarkerOptions(props);

  const name = typeof props.name === "string" ? props.name : "";
  const description =
    typeof props.description === "string" ? props.description : "";

  // Local state for inputs/sliders that need immediate feedback
  const [localName, setLocalName] = useState(name);
  const [localDescription, setLocalDescription] = useState(description);

  // Circle-specific
  const circleOpts = markerOptions.type === "circle" ? markerOptions : null;
  const [localMarkerSize, setLocalMarkerSize] = useState(circleOpts?.markerSize ?? 8);
  const [localStrokeWidth, setLocalStrokeWidth] = useState(circleOpts?.strokeWidth ?? 1);

  // Pin-specific
  const pinOpts = markerOptions.type === "pin" ? markerOptions : null;
  const [localPinSize, setLocalPinSize] = useState(pinOpts?.size ?? DEFAULT_PIN_SIZE);

  // Refs to suppress useEffect sync while the user is typing
  const nameFocused = useRef(false);
  const descriptionFocused = useRef(false);

  useEffect(() => { if (!nameFocused.current) setLocalName(name); }, [name]);
  useEffect(() => { if (!descriptionFocused.current) setLocalDescription(description); }, [description]);
  useEffect(() => { setLocalMarkerSize(circleOpts?.markerSize ?? 8); }, [circleOpts?.markerSize]);
  useEffect(() => { setLocalStrokeWidth(circleOpts?.strokeWidth ?? 1); }, [circleOpts?.strokeWidth]);
  useEffect(() => { setLocalPinSize(pinOpts?.size ?? DEFAULT_PIN_SIZE); }, [pinOpts?.size]);

  const wrappedFeatureRef = useRef(wrappedFeature);
  wrappedFeatureRef.current = wrappedFeature;

  // Debounced write — for sliders and text inputs
  const updateProps = useMemo(
    () =>
      debounce((updates: Record<string, unknown>) => {
        const wf = wrappedFeatureRef.current;
        const existingProps = wf.feature.properties ?? {};
        void transact({
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

  // Immediate write — for discrete button actions (type switcher, icon picker)
  const setProps = useCallback(
    (updates: Record<string, unknown>) => {
      const wf = wrappedFeatureRef.current;
      const existingProps = wf.feature.properties ?? {};
      void transact({
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
    },
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
            {/* Marker type switcher */}
            <div className="flex rounded overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setProps({ "marker-type": "circle" })}
                className={`flex-1 text-sm py-1 px-3 transition-colors ${
                  markerOptions.type === "circle"
                    ? "bg-purple-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Circle
              </button>
              <button
                onClick={() => setProps({ "marker-type": "pin" })}
                className={`flex-1 text-sm py-1 px-3 transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  markerOptions.type === "pin"
                    ? "bg-purple-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Pin
              </button>
            </div>

            {/* ── Circle controls ── */}
            {markerOptions.type === "circle" && (
              <>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Fill</span>
                  <ColorPopover
                    color={markerOptions.fill}
                    onChange={(c) => updateProps({ fill: c })}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Outline</span>
                  <ColorPopover
                    color={markerOptions.stroke}
                    onChange={(c) => updateProps({ stroke: c })}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Diameter</span>
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
                    <span className="text-sm text-gray-700 dark:text-gray-300">Outline width</span>
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

                <IconPicker
                  selected={markerOptions.icon}
                  onSelect={(name) => setProps({ icon: name })}
                />

                {markerOptions.icon !== null && (
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Icon color</span>
                    <ColorPopover
                      color={markerOptions.iconColor}
                      onChange={(c) => updateProps({ "icon-color": c })}
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Pin controls ── */}
            {markerOptions.type === "pin" && (
              <>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Body</span>
                  <ColorPopover
                    color={markerOptions.bodyColor}
                    onChange={(c) => updateProps({ "pin-body-color": c })}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Inner</span>
                  <ColorPopover
                    color={markerOptions.innerColor}
                    onChange={(c) => updateProps({ "pin-inner-color": c })}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Size</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {localPinSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={24}
                    max={80}
                    step={2}
                    value={localPinSize}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLocalPinSize(v);
                      updateProps({ "pin-size": v });
                    }}
                    className="w-full accent-purple-600"
                  />
                </div>

                <IconPicker
                  selected={markerOptions.icon}
                  onSelect={(name) => setProps({ icon: name })}
                />
              </>
            )}
          </div>
        ) : (
          <>
            <HexColorPicker
              color={typeof props.fill === "string" ? props.fill : "#7c3aed"}
              onChange={(c) => updateProps({ fill: c })}
            />
            <HexColorInput
              color={typeof props.fill === "string" ? props.fill : "#7c3aed"}
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

// ---------------------------------------------------------------------------
// Shared icon picker (used by both Circle and Pin sections)
// ---------------------------------------------------------------------------

function IconPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  return (
    <div>
      <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">Icon</div>
      <div className="grid grid-cols-5 gap-1.5">
        <button
          title="No icon"
          onClick={() => onSelect(null)}
          className={`flex items-center justify-center rounded h-9 border text-xs text-gray-400 ${
            selected === null
              ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
              : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
          }`}
        >
          —
        </button>
        {ICONS.map((icon) => {
          const isSelected = selected === icon.name;
          return (
            <button
              key={icon.name}
              title={icon.label}
              onClick={() => onSelect(icon.name)}
              className={`flex items-center justify-center rounded h-9 border ${
                isSelected
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
              }`}
            >
              <img
                src={iconToDataUrl(icon.definition, 32)}
                alt={icon.label}
                width={16}
                height={16}
                style={{ filter: "invert(0.4)" }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
