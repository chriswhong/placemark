import {
  faMapPin,
  faLocationDot,
  faStar,
  faHouse,
  faFlag,
  faCar,
  faCamera,
  faTree,
  faBuilding,
  faHeart,
  faCableCar
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface AppIcon {
  name: string;
  label: string;
  definition: IconDefinition;
}

export const ICONS: AppIcon[] = [
  { name: "map-pin", label: "Pin", definition: faMapPin },
  { name: "location-dot", label: "Location", definition: faLocationDot },
  { name: "star", label: "Star", definition: faStar },
  { name: "house", label: "House", definition: faHouse },
  { name: "flag", label: "Flag", definition: faFlag },
  { name: "car", label: "Car", definition: faCar },
  { name: "camera", label: "Camera", definition: faCamera },
  { name: "tree", label: "Tree", definition: faTree },
  { name: "building", label: "Building", definition: faBuilding },
  { name: "heart", label: "Heart", definition: faHeart },
  { name: "cable-car", label: "Cable Car", definition: faCableCar },
];

export const ICON_MAP = new Map(ICONS.map((i) => [i.name, i]));

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
  ICONS.map((icon) => [
    icon.name,
    {
      url: iconToDataUrl(icon.definition, ICON_SIZE),
      width: ICON_SIZE,
      height: ICON_SIZE,
      mask: true,
    },
  ]),
);
