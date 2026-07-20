import { MapContext } from "app/context/map_context";
import { deleteFeatures } from "app/lib/map_operations/delete_features";
import { newFeatureId } from "app/lib/id";
import { usePersistence } from "app/lib/persistence/context";
import { fMoment } from "app/lib/persistence/moment";
import { allowNativeCopy, allowNativePaste } from "app/lib/utils";
import { generateKeyBetween } from "fractional-indexing";
import { useAtomCallback } from "jotai/utils";
import { Maybe } from "purify-ts/Maybe";
import { useCallback, useContext, useEffect } from "react";
import toast from "react-hot-toast";
import { USelection } from "state";
import { dataAtom, selectedFeaturesAtom, selectionAtom } from "state/jotai";
import { type IWrappedFeature, UWrappedFeature } from "types";
import type { Feature } from "types";

export function stringifyFeatures(selectedFeatures: IWrappedFeature[]): Maybe<{
  data: string;
  message: string;
}> {
  switch (selectedFeatures.length) {
    case 0: {
      return Maybe.empty();
    }
    case 1: {
      return Maybe.of({
        data: JSON.stringify(selectedFeatures[0].feature),
        message: "Copied feature as GeoJSON",
      });
    }
    default: {
      return Maybe.of({
        data: JSON.stringify(
          UWrappedFeature.toFeatureCollection(selectedFeatures),
        ),
        message: "Copied features as GeoJSON",
      });
    }
  }
}

/**
 * Pixel offset applied to pasted point features (bottom-right).
 */
const PASTE_OFFSET_PX = 20;

/**
 * Offset a GeoJSON feature's geometry so the paste doesn't land
 * exactly on top of the original.  For Point features we shift by
 * a fixed screen-pixel amount so the offset looks the same at every
 * zoom level. Non-point geometries are returned unchanged.
 */
function offsetFeature(
  feature: Feature,
  map: { project: (lngLat: [number, number]) => { x: number; y: number }; unproject: (point: [number, number]) => { lng: number; lat: number } } | null,
): Feature {
  if (!map || feature.geometry?.type !== "Point") return feature;
  const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
  const px = map.project(coords);
  const shifted = map.unproject([px.x + PASTE_OFFSET_PX, px.y + PASTE_OFFSET_PX]);
  return {
    ...feature,
    geometry: {
      type: "Point",
      coordinates: [shifted.lng, shifted.lat],
    },
  };
}

/**
 * Find the `at` key that sits immediately after `sourceAt` among
 * features that share the same `folderId`.  Returns `null` if
 * `sourceAt` is the last item (so the new key will sort to the end).
 */
function findNextAt(
  featureMap: Map<string, IWrappedFeature>,
  sourceAt: string,
  folderId: string | null,
): string | null {
  let best: string | null = null;
  for (const f of featureMap.values()) {
    if (f.folderId !== folderId) continue;
    if (f.at > sourceAt && (best === null || f.at < best)) {
      best = f.at;
    }
  }
  return best;
}

export function useClipboard() {
  const rep = usePersistence();
  const transact = rep.useTransact();
  const pmap = useContext(MapContext);

  const onCut = useAtomCallback(
    useCallback(
      (get, set, e: ClipboardEvent) => {
        if (!e.clipboardData || allowNativeCopy(e)) return;

        const selectedFeatures = get(selectedFeaturesAtom);

        if (selectedFeatures.length) {
          e.clipboardData.setData(
            "text/plain",
            JSON.stringify(
              UWrappedFeature.toFeatureCollection(selectedFeatures),
            ),
          );
          const { newSelection, moment } = deleteFeatures(get(dataAtom));
          set(selectionAtom, newSelection);
          e.preventDefault();
          void toast.promise(
            transact({
              ...moment,
              track: "cut-features",
            }),
            {
              loading: "Cutting features…",
              error: "Failed to cut features",
              success: "Cut features",
            },
          );
          return;
        }
      },
      [transact],
    ),
  );

  const onCopy = useAtomCallback(
    useCallback((get, _set, e: ClipboardEvent) => {
      if (!e.clipboardData || allowNativeCopy(e)) return;

      const selectedFeatures = get(selectedFeaturesAtom);
      const clipboardData = e.clipboardData;

      stringifyFeatures(selectedFeatures).ifJust(({ data, message }) => {
        e.preventDefault();
        clipboardData.setData("text/plain", data);
        toast.success(message);
      });
    }, []),
  );

  const onPaste = useAtomCallback(
    useCallback(
      (get, _set, e: ClipboardEvent) => {
        const data = get(dataAtom);
        if (!e.clipboardData || allowNativePaste(e)) return;
        e.preventDefault();
        const textContent = e.clipboardData.getData("text");
        if (!textContent) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(textContent);
        } catch {
          toast.error("Clipboard does not contain valid GeoJSON");
          return;
        }

        // Collect GeoJSON features from either a Feature or FeatureCollection
        let features: Feature[];
        if (
          parsed &&
          typeof parsed === "object" &&
          (parsed as { type?: string }).type === "FeatureCollection" &&
          Array.isArray((parsed as { features?: unknown }).features)
        ) {
          features = (parsed as { features: Feature[] }).features;
        } else if (
          parsed &&
          typeof parsed === "object" &&
          (parsed as { type?: string }).type === "Feature"
        ) {
          features = [parsed as Feature];
        } else {
          toast.error("Clipboard does not contain a GeoJSON Feature");
          return;
        }

        if (features.length === 0) return;

        // Determine the source feature (for positioning) from the current selection
        const selected = USelection.getSelectedFeatures(data);
        const sourceFeature = selected.length ? selected[selected.length - 1] : null;

        // Place pasted features in the same folder as the source, or at the top level
        const folderId = sourceFeature?.folderId ?? null;

        // Generate `at` keys just after the source feature's position
        const sourceAt = sourceFeature?.at ?? null;
        const nextAt = sourceAt
          ? findNextAt(data.featureMap, sourceAt, folderId)
          : null;

        const mapRef = pmap?.map ?? null;
        const moment = fMoment("Paste features");
        for (let i = 0; i < features.length; i++) {
          // For each successive feature, generate a key between the
          // previous insertion point and the next sibling.
          const prevAt = i === 0 ? sourceAt : moment.putFeatures[i - 1].at;
          const at = generateKeyBetween(prevAt, nextAt);
          moment.putFeatures.push({
            id: newFeatureId(),
            folderId,
            at,
            feature: offsetFeature(features[i], mapRef),
          });
        }

        // Select the newly pasted feature(s)
        const pastedIds = moment.putFeatures.map((f) => f.id);
        if (pastedIds.length === 1) {
          _set(selectionAtom, { type: "single", id: pastedIds[0], parts: [] });
        } else if (pastedIds.length > 1) {
          _set(selectionAtom, { type: "multi", ids: pastedIds });
        }

        void transact({ ...moment, track: "paste-features" }).then(() => {
          toast.success(
            features.length === 1 ? "Pasted feature" : `Pasted ${features.length} features`,
          );
        });
      },
      [transact, pmap],
    ),
  );

  useEffect(() => {
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);

    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [onCopy, onCut, onPaste]);
}
