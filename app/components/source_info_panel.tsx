import { useAtomValue } from "jotai";
import { dataAtom } from "state/jotai";

export function SourceInfoPanel({ folderId }: { folderId: string }) {
  const { featureMap, folderMap } = useAtomValue(dataAtom);
  const folder = folderMap.get(folderId);
  const features = Array.from(featureMap.values()).filter(
    (f) => f.folderId === folderId,
  );

  const counts = { Point: 0, LineString: 0, Polygon: 0, other: 0 };
  for (const f of features) {
    const type = f.feature.geometry?.type;
    if (type === "Point" || type === "MultiPoint") counts.Point++;
    else if (type === "LineString" || type === "MultiLineString")
      counts.LineString++;
    else if (type === "Polygon" || type === "MultiPolygon") counts.Polygon++;
    else counts.other++;
  }

  return (
    <div className="p-3 space-y-3">
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
          GeoJSON Source
        </div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {folder?.name ?? folderId}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
          Features
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300">
          {features.length} total
        </div>
        <div className="mt-1 space-y-0.5">
          {counts.Point > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {counts.Point} Point{counts.Point !== 1 ? "s" : ""}
            </div>
          )}
          {counts.LineString > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {counts.LineString} LineString{counts.LineString !== 1 ? "s" : ""}
            </div>
          )}
          {counts.Polygon > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {counts.Polygon} Polygon{counts.Polygon !== 1 ? "s" : ""}
            </div>
          )}
          {counts.other > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {counts.other} Other
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
