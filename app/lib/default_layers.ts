import type { ILayerConfig } from "types";

const defaults = {
  type: "MAPBOX",
  token: "",
} as const;

export type LayerConfigTemplate = Pick<
  ILayerConfig,
  "name" | "url" | "type" | "token"
>;

const LAYERS: Record<string, LayerConfigTemplate> = {
  MONOCHROME: {
    name: "Positron",
    url: "https://tiles.openfreemap.org/styles/positron",
    ...defaults,
  },
  DARK: {
    name: "Dark",
    url: "https://tiles.openfreemap.org/styles/dark",
    ...defaults,
  },
  SATELLITE: {
    name: "Liberty",
    url: "https://tiles.openfreemap.org/styles/liberty",
    ...defaults,
  },
  STREETS: {
    name: "Bright",
    url: "https://tiles.openfreemap.org/styles/bright",
    ...defaults,
  },
};

export default LAYERS;
