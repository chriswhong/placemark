import LAYERS from "app/lib/default_layers";
import { useAtom } from "jotai";
import { layerConfigAtom } from "state/jotai";
import { NIL } from "uuid";

const BASEMAP_OPTIONS = [
  { key: "LIBERTY", label: "Liberty" },
  { key: "BRIGHT", label: "Bright" },
  { key: "POSITRON", label: "Positron" },
  { key: "DARK", label: "Dark" },
  { key: "FJORD", label: "Fjord" },
  { key: "THREE_D", label: "3D" },
] as const;

export function BasemapToggle() {
  const [layerConfigs, setLayerConfigs] = useAtom(layerConfigAtom);

  const currentUrl = layerConfigs.get(NIL)?.url;

  function setBasemap(key: string) {
    const template = LAYERS[key];
    if (!template) return;
    setLayerConfigs(
      new Map([
        [
          NIL,
          {
            ...template,
            at: "a0",
            opacity: 1,
            tms: false,
            visibility: true,
            labelVisibility: true,
            id: NIL,
          },
        ],
      ]),
    );
  }

  return (
    <div className="p-3">
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
        Basemap
      </div>
      <div className="grid grid-cols-3 gap-1">
        {BASEMAP_OPTIONS.map(({ key, label }) => {
          const isActive = currentUrl === LAYERS[key]?.url;
          return (
            <button
              key={key}
              onClick={() => setBasemap(key)}
              className={`text-xs py-1.5 px-2 rounded border transition-colors ${
                isActive
                  ? "bg-purple-600 border-purple-600 text-white"
                  : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
