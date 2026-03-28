import { purple900 } from "app/lib/constants";
import { usePersistence } from "app/lib/persistence/context";
import debounce from "lodash/debounce";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { selectedFeaturesAtom } from "state/jotai";
import type { IWrappedFeature } from "types";

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

  const fill =
    typeof wrappedFeature.feature.properties?.fill === "string"
      ? wrappedFeature.feature.properties.fill
      : purple900;

  // Keep latest wrappedFeature in a ref so the debounced callback
  // always writes to the current feature without capturing a stale closure.
  const wrappedFeatureRef = useRef(wrappedFeature);
  wrappedFeatureRef.current = wrappedFeature;

  const handleColorChange = useMemo(
    () =>
      debounce((color: string) => {
        const wf = wrappedFeatureRef.current;
        const properties = wf.feature.properties ?? {};
        transact({
          track: "feature-update-style",
          putFeatures: [
            {
              ...wf,
              feature: {
                ...wf.feature,
                properties: { ...properties, fill: color },
              },
            },
          ],
        });
      }, 80),
    [transact],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Style
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700 dark:text-gray-300">Color</span>
        <div
          className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
          style={{ backgroundColor: fill }}
        />
      </div>
      <HexColorPicker color={fill} onChange={handleColorChange} />
      <HexColorInput
        color={fill}
        onChange={handleColorChange}
        prefixed
        className="w-full text-sm font-mono border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white"
      />
    </div>
  );
}
