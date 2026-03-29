import { ICON_MAP } from "app/lib/icons";

// ---------------------------------------------------------------------------
// Discriminated union types for marker style options
// ---------------------------------------------------------------------------

export type MarkerType = "circle" | "pin" | "emoji";

export interface CircleMarkerOptions {
  type: "circle";
  fill: string;
  stroke: string;
  markerSize: number; // radius in pixels
  strokeWidth: number;
  icon: string | null;
  iconColor: string;
}

export interface PinMarkerOptions {
  type: "pin";
  bodyColor: string;  // outer teardrop fill
  innerColor: string; // inner circle fill
  size: number;       // display height in pixels
  icon: string | null;
}

export interface EmojiMarkerOptions {
  type: "emoji";
  emoji: string;
  size: number;
}

export type AnyMarkerOptions = CircleMarkerOptions | PinMarkerOptions | EmojiMarkerOptions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CIRCLE_FILL = "#7c3aed"; // purple-700 (kept in sync with purple900)
export const DEFAULT_CIRCLE_STROKE = "#ffffff";
export const DEFAULT_MARKER_SIZE = 8;
export const DEFAULT_STROKE_WIDTH = 1;
export const DEFAULT_ICON_COLOR = "#ffffff";

export const DEFAULT_EMOJI = "🚡";
export const DEFAULT_EMOJI_SIZE = 32;
export const EMOJI_CANVAS_SIZE = 64;

export const EMOJI_LIST: { emoji: string; label: string }[] = [
  { emoji: "🚡", label: "Aerial Tramway" },
  { emoji: "🏔️", label: "Mountain" },
  { emoji: "🌊", label: "Wave" },
  { emoji: "🌲", label: "Evergreen Tree" },
  { emoji: "🏠", label: "House" },
  { emoji: "⭐", label: "Star" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "🌸", label: "Cherry Blossom" },
  { emoji: "🎯", label: "Bullseye" },
  { emoji: "📍", label: "Pushpin" },
  { emoji: "🏖️", label: "Beach" },
  { emoji: "🏕️", label: "Camping" },
  { emoji: "🗺️", label: "World Map" },
  { emoji: "☕", label: "Coffee" },
  { emoji: "🍕", label: "Pizza" },
  { emoji: "🐾", label: "Paw Prints" },
  { emoji: "🚲", label: "Bicycle" },
  { emoji: "🎵", label: "Musical Note" },
  { emoji: "🌺", label: "Hibiscus" },
];

export type EmojiIconMapping = Record<
  string,
  { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number }
>;

/**
 * Pre-render all emoji onto a single canvas atlas.
 * Returns the canvas and a DeckGL iconMapping.
 * Call once; result is stable for the lifetime of the app.
 */
export function buildEmojiAtlas(): {
  atlas: string;
  mapping: EmojiIconMapping;
} {
  const COLS = 5;
  const ROWS = Math.ceil(EMOJI_LIST.length / COLS);
  const canvas = document.createElement("canvas");
  canvas.width = COLS * EMOJI_CANVAS_SIZE;
  canvas.height = ROWS * EMOJI_CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${Math.round(EMOJI_CANVAS_SIZE * 0.8)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const mapping: EmojiIconMapping = {};
  EMOJI_LIST.forEach(({ emoji }, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * EMOJI_CANVAS_SIZE;
    const y = row * EMOJI_CANVAS_SIZE;
    ctx.fillText(emoji, x + EMOJI_CANVAS_SIZE / 2, y + EMOJI_CANVAS_SIZE / 2);
    mapping[emoji] = {
      x,
      y,
      width: EMOJI_CANVAS_SIZE,
      height: EMOJI_CANVAS_SIZE,
      anchorX: EMOJI_CANVAS_SIZE / 2,
      anchorY: EMOJI_CANVAS_SIZE / 2,
    };
  });

  return { atlas: canvas.toDataURL(), mapping };
}

export const DEFAULT_PIN_BODY_COLOR = "#43538D";
export const DEFAULT_PIN_INNER_COLOR = "#6B82D6";
export const DEFAULT_PIN_SIZE = 28; // height in pixels

// ---------------------------------------------------------------------------
// Read marker options from raw GeoJSON properties
// ---------------------------------------------------------------------------

export function getMarkerOptions(
  props: Record<string, unknown>,
): AnyMarkerOptions {
  if (props["marker-type"] === "emoji") {
    return {
      type: "emoji",
      emoji: typeof props["emoji"] === "string" ? props["emoji"] : DEFAULT_EMOJI,
      size: typeof props["emoji-size"] === "number" ? props["emoji-size"] : DEFAULT_EMOJI_SIZE,
    };
  }
  if (props["marker-type"] === "pin") {
    return {
      type: "pin",
      bodyColor:
        typeof props["pin-body-color"] === "string"
          ? props["pin-body-color"]
          : DEFAULT_PIN_BODY_COLOR,
      innerColor:
        typeof props["pin-inner-color"] === "string"
          ? props["pin-inner-color"]
          : DEFAULT_PIN_INNER_COLOR,
      size:
        typeof props["pin-size"] === "number"
          ? props["pin-size"]
          : DEFAULT_PIN_SIZE,
      icon: typeof props.icon === "string" ? props.icon : null,
    };
  }
  return {
    type: "circle",
    fill:
      typeof props.fill === "string" ? props.fill : DEFAULT_CIRCLE_FILL,
    stroke:
      typeof props.stroke === "string" ? props.stroke : DEFAULT_CIRCLE_STROKE,
    markerSize:
      typeof props["marker-size"] === "number"
        ? props["marker-size"]
        : DEFAULT_MARKER_SIZE,
    strokeWidth:
      typeof props["stroke-width"] === "number"
        ? props["stroke-width"]
        : DEFAULT_STROKE_WIDTH,
    icon: typeof props.icon === "string" ? props.icon : null,
    iconColor:
      typeof props["icon-color"] === "string"
        ? props["icon-color"]
        : DEFAULT_ICON_COLOR,
  };
}

// ---------------------------------------------------------------------------
// Pin SVG geometry constants (based on the 88×106 viewBox)
// ---------------------------------------------------------------------------

export const PIN_VIEWBOX_W = 88;
export const PIN_VIEWBOX_H = 106;
const PIN_TIP_Y = 100; // y-coordinate of the pin tip in the viewBox

// Where the inner circle sits in the viewBox
const PIN_INNER_CX = 43.7288;
const PIN_INNER_CY = 40.8983;
const PIN_INNER_R = 33.8983;

// anchorY for DeckGL IconLayer: position in the source image that maps to the
// feature coordinate (the tip of the pin).
export const PIN_ANCHOR_X = PIN_VIEWBOX_W / 2; // ≈ 44
export const PIN_ANCHOR_Y = PIN_TIP_Y;          // 100

// Fraction of display height that the inner-circle centre sits ABOVE the tip.
// Used to position labels at the inner-circle level.
export const PIN_INNER_CENTER_ABOVE_TIP_FRACTION =
  (PIN_TIP_Y - PIN_INNER_CY) / PIN_VIEWBOX_H; // ≈ 0.557

// Half the display width at the widest point, as a fraction of height.
export const PIN_HALF_WIDTH_FRACTION =
  (PIN_VIEWBOX_W / 2) / PIN_VIEWBOX_H; // ≈ 0.415

const PIN_BODY_PATH =
  "M84.3559 40.7407C84.3559 63.2412 53.8475 100 43.678 100C32.584 100 3 63.2412 3 40.7407C3 18.2402 21.2121 0 43.678 0C66.1438 0 84.3559 18.2402 84.3559 40.7407Z";

const PIN_FILTER = `<filter id="s" x="0" y="0" width="${PIN_VIEWBOX_W}" height="${PIN_VIEWBOX_H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="b"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="h"/><feOffset dy="3"/><feGaussianBlur stdDeviation="1.5"/><feComposite in2="h" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="b" result="e"/><feBlend mode="normal" in="SourceGraphic" in2="e" result="shape"/></filter>`;

// ---------------------------------------------------------------------------
// Pin SVG generation
// ---------------------------------------------------------------------------

export function generatePinOutlineSvg(strokeColor: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_VIEWBOX_W}" height="${PIN_VIEWBOX_H}" viewBox="0 0 ${PIN_VIEWBOX_W} ${PIN_VIEWBOX_H}" fill="none">`,
    `<path d="${PIN_BODY_PATH}" fill="none" stroke="${strokeColor}" stroke-width="5" stroke-linejoin="round"/>`,
    `</svg>`,
  ].join("");
}

export function generatePinSvg(
  bodyColor: string,
  innerColor: string,
  iconName: string | null,
): string {
  let iconContent = "";
  if (iconName) {
    const appIcon = ICON_MAP.get(iconName);
    if (appIcon) {
      const [w, h, , , pathData] = appIcon.definition.icon;
      const svgPath = Array.isArray(pathData)
        ? pathData.join(" ")
        : (pathData as string);
      // Scale the icon to 65% of the inner circle diameter
      const maxSize = PIN_INNER_R * 2 * 0.65;
      const scale = maxSize / Math.max(w, h);
      const iW = w * scale;
      const iH = h * scale;
      const ix = PIN_INNER_CX - iW / 2;
      const iy = PIN_INNER_CY - iH / 2;
      iconContent = `<g transform="translate(${ix},${iy}) scale(${scale})"><path d="${svgPath}" fill="white"/></g>`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_VIEWBOX_W}" height="${PIN_VIEWBOX_H}" viewBox="0 0 ${PIN_VIEWBOX_W} ${PIN_VIEWBOX_H}" fill="none">`,
    `<defs>${PIN_FILTER}</defs>`,
    `<g filter="url(#s)"><path d="${PIN_BODY_PATH}" fill="${bodyColor}"/></g>`,
    `<circle cx="${PIN_INNER_CX}" cy="${PIN_INNER_CY}" r="${PIN_INNER_R}" fill="${innerColor}"/>`,
    iconContent,
    `</svg>`,
  ].join("");
}

export function pinSvgDataUrl(
  bodyColor: string,
  innerColor: string,
  iconName: string | null,
): string {
  return `data:image/svg+xml,${encodeURIComponent(
    generatePinSvg(bodyColor, innerColor, iconName),
  )}`;
}
