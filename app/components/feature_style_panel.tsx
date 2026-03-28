import { ColorPopover } from "app/components/color_popover";
import { purple900 } from "app/lib/constants";
import { usePersistence } from "app/lib/persistence/context";
import { useAtomValue } from "jotai";
import { selectedFeaturesAtom } from "state/jotai";

export function FeatureStylePanel() {
  const selectedFeatures = useAtomValue(selectedFeaturesAtom);
  const rep = usePersistence();
  const transact = rep.useTransact();

  if (selectedFeatures.length !== 1) return null;

  const wrappedFeature = selectedFeatures[0];
  const properties = wrappedFeature.feature.properties ?? {};
  const fill =
    typeof properties.fill === "string" ? properties.fill : purple900;

  function handleColorChange(color: string) {
    transact({
      track: "feature-update-style",
      putFeatures: [
        {
          ...wrappedFeature,
          feature: {
            ...wrappedFeature.feature,
            properties: {
              ...properties,
              fill: color,
            },
          },
        },
      ],
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Style
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700 dark:text-gray-300">Color</span>
        <ColorPopover color={fill} onChange={handleColorChange} />
      </div>
    </div>
  );
}
