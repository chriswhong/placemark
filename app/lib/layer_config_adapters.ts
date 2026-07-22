import { getStyleURL, getTileJSON } from "app/lib/utils";
import once from "lodash/once";
import type { StyleSpecification, LayerSpecification, RasterLayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { toast } from "react-hot-toast";
import type { ILayerConfig } from "types";

const warnOffline = once(() => {
  toast.error("Offline: falling back to blank background");
});

export async function addMapboxStyle(
  _base: StyleSpecification,
  layer: ILayerConfig,
): Promise<StyleSpecification> {
  const url = getStyleURL(layer);

  const style: StyleSpecification = await fetch(url)
    .then((res) => {
      if (!res?.ok) {
        throw new Error("Could not fetch layer");
      }
      return res.json();
    })
    .catch(() => {
      warnOffline();
      return {
        version: 8,
        name: "Empty",
        sources: {},
        layers: [],
      };
    });

  const updatedStyle = updateMapboxStyle(style, {
    labelVisibility: layer.labelVisibility,
    rasterOpacity: layer.opacity,
  });
  return updatedStyle;
}

function updateMapboxStyle(
  style: StyleSpecification,
  options: {
    labelVisibility?: boolean;
    rasterOpacity?: number;
  },
): StyleSpecification {
  const { labelVisibility = true, rasterOpacity } = options;

  if (!style.layers) {
    return style;
  }

  const isSatelliteStyle =
    style.name === "Mapbox Satellite Streets" ||
    style.name === "Mapbox Satellite";

  const updatedLayers = style.layers
    .map((layer) => {
      // Identify label layers
      const isLabelLayer =
        layer.type === "symbol" && layer.layout?.["text-field"] !== undefined;

      if (!labelVisibility && isLabelLayer) {
        return null;
      }

      if (
        isSatelliteStyle &&
        layer.type === "raster" &&
        rasterOpacity !== undefined
      ) {
        return {
          ...layer,
          paint: {
            ...(layer.paint || {}),
            "raster-opacity": rasterOpacity,
          },
        };
      }

      if (isSatelliteStyle && layer.type === "background" && layer.paint) {
        return {
          ...layer,
          paint: {
            ...layer.paint,
            "background-color": "#ffffff",
          },
        };
      }

      return layer;
    })
    .filter(Boolean) as LayerSpecification[];

  // Strip globe projection and fog from styles so that deck.gl uses
  // a flat mercator view.
  const { projection: _p, fog: _f, ...rest } = style as Record<string, unknown>;

  return {
    ...rest,
    layers: updatedLayers,
  } as StyleSpecification;
}
function paintLayoutFromRasterLayer(
  layer: ILayerConfig,
): Pick<RasterLayerSpecification, "type" | "paint" | "layout"> {
  return {
    type: "raster",
    paint: {
      "raster-opacity": layer.opacity,
    },
    layout: {
      visibility: layer.visibility ? "visible" : "none",
    },
  };
}

export async function addTileJSONStyle(
  style: StyleSpecification,
  layer: ILayerConfig,
  id: number,
) {
  const sourceId = `squidmapsInternalSource${id}`;
  const layerId = `squidmapsInternalLayer${id}`;

  try {
    const resp = await getTileJSON(layer.url);

    style.sources[sourceId] = {
      type: "raster",
      tiles: resp.tiles,
      scheme: resp.scheme || "xyz",
      tileSize: 256,
      minzoom: resp.minzoom,
      maxzoom: resp.maxzoom,
    };

    const newLayer = {
      id: layerId,
      source: sourceId,
      ...paintLayoutFromRasterLayer(layer),
    } as LayerSpecification;

    style.layers.push(newLayer);
  } catch (_e) {
    toast.error(
      "A TileJSON layer failed to load: the server it depends on may be down",
    );
  }
  return style;
}

export function addXYZStyle(
  style: StyleSpecification,
  layer: ILayerConfig,
  id: number,
) {
  const sourceId = `squidmapsInternalSource${id}`;
  const layerId = `squidmapsInternalLayer${id}`;

  style.sources[sourceId] = {
    type: "raster",
    tiles: [layer.url],
    scheme: layer.tms ? "tms" : "xyz",
    tileSize: 256,
  };

  const newLayer = {
    id: layerId,
    source: sourceId,
    ...paintLayoutFromRasterLayer(layer),
  } as LayerSpecification;

  style.layers.push(newLayer);

  return style;
}
