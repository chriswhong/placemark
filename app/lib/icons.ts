import { fas } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface AppIcon {
  name: string;
  label: string;
  definition: IconDefinition;
}

function toLabel(iconName: string): string {
  return iconName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Build the full set of unique icons from the fas library (1,400+ icons).
// Deduplicate by iconName (the fas object has aliases with different camelCase keys).
export const ALL_ICONS: AppIcon[] = [
  ...new Map(
    Object.values(fas).map((def) => [def.iconName, def]),
  ).values(),
]
  .sort((a, b) => a.iconName.localeCompare(b.iconName))
  .map((def) => ({
    name: def.iconName,
    label: toLabel(def.iconName),
    definition: def as IconDefinition,
  }));

// Backward-compat alias
export const ICONS = ALL_ICONS;

export const ICON_MAP = new Map(ALL_ICONS.map((i) => [i.name, i]));

export const COMMON_ICON_NAMES: string[] = [
  "location-dot",
  "map-pin",
  "star",
  "heart",
  "flag",
  "house",
  "building",
  "store",
  "hospital",
  "utensils",
  "mug-hot",
  "camera",
  "tree",
  "car",
  "bicycle",
  "bus",
  "parking",
  "person-hiking",
  "tent",
  "anchor",
];

export const COMMON_ICONS: AppIcon[] = COMMON_ICON_NAMES
  .map((name) => ICON_MAP.get(name))
  .filter((i): i is AppIcon => i !== undefined);

/**
 * Returns a white-on-transparent SVG data URL suitable for use as a DeckGL
 * icon mask. Color tinting is handled by the IconLayer's getColor accessor.
 */
export function iconToDataUrl(def: IconDefinition, size = 64): string {
  const [w, h, , , path] = def.icon;
  const svgPath = Array.isArray(path) ? path.join(" ") : path;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${size}" height="${size}"><path d="${svgPath}" fill="white"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Pre-build icon descriptors for DeckGL (width/height must match the raster size)
const ICON_SIZE = 64;
export const DECK_ICON_DESCRIPTORS = new Map(
  ALL_ICONS.map((icon) => [
    icon.name,
    {
      url: iconToDataUrl(icon.definition, ICON_SIZE),
      width: ICON_SIZE,
      height: ICON_SIZE,
      mask: true,
    },
  ]),
);
