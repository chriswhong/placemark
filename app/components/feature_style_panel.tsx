import { usePersistence } from "app/lib/persistence/context";
import {
  getMarkerOptions,
  DEFAULT_PIN_SIZE,
  DEFAULT_EMOJI_SIZE,
  EMOJI_LIST,
  COMMON_EMOJI_LIST,
  pinSvgDataUrl,
  type AnyMarkerOptions,
} from "app/lib/marker_types";
import { ALL_ICONS, COMMON_ICONS, iconToDataUrl } from "app/lib/icons";
import debounce from "lodash/debounce";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { Popover as P } from "radix-ui";
import { selectedFeaturesAtom } from "state/jotai";
import type { JsonValue } from "type-fest";
import type { IWrappedFeature } from "types";
import { GeometryIcon } from "./panels/feature_editor/feature_editor_folder/items";
import { PopoverContent2, Button, inputClass } from "./elements";

// ---------------------------------------------------------------------------
// Compact color swatch — circle trigger opens full picker popover
// ---------------------------------------------------------------------------

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <P.Root>
      <P.Trigger asChild>
        <button
          className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 hover:scale-110 transition-transform"
          style={{ backgroundColor: color }}
          title={color}
        />
      </P.Trigger>
      <PopoverContent2 size="no-width">
        <div className="space-y-2 p-1">
          <HexColorPicker color={color} onChange={onChange} />
          <HexColorInput
            className={inputClass({ _size: "sm" })}
            prefixed
            color={color}
            onChange={onChange}
          />
          <P.Close asChild>
            <Button>Done</Button>
          </P.Close>
        </div>
      </PopoverContent2>
    </P.Root>
  );
}

// ---------------------------------------------------------------------------
// Inline slider row — label | range | value on one line
// ---------------------------------------------------------------------------

function SliderControl({
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 w-full h-5 min-w-0">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-0 accent-purple-600 h-3"
      />
      <span className="text-[10px] text-gray-500 dark:text-gray-400 w-7 text-right shrink-0">
        {display}
      </span>
    </div>
  );
}

function SliderPopover({
  value,
  min,
  max,
  step,
  display,
  onChange,
  icon,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <P.Root>
      <P.Trigger asChild>
        <button className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-colors px-1.5 h-5 shrink-0">
          {icon ?? (
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          )}
          <span className="text-[10px] text-gray-600 dark:text-gray-300">{display}</span>
        </button>
      </P.Trigger>
      <PopoverContent2 size="no-width">
        <div className="flex items-center gap-2 p-2" style={{ width: 180 }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 min-w-0 accent-purple-600"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right shrink-0">
            {display}
          </span>
        </div>
      </PopoverContent2>
    </P.Root>
  );
}

// ---------------------------------------------------------------------------
// Icon popover picker — compact trigger + popover grid
// ---------------------------------------------------------------------------

function IconPopoverPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const iconDef = selected ? ALL_ICONS.find((i) => i.name === selected) : null;

  return (
    <P.Root>
      <P.Trigger asChild>
        <button className="flex items-center gap-1.5 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-colors px-1.5 h-7">
          {iconDef ? (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[100px]">
                {iconDef.label}
              </span>
              <img
                src={iconToDataUrl(iconDef.definition, 32)}
                width={14}
                height={14}
                style={{ filter: "invert(0.4)" }}
                alt={iconDef.label}
              />
            </>
          ) : (
            <span className="text-gray-400 px-0.5">—</span>
          )}
        </button>
      </P.Trigger>
      <PopoverContent2 size="no-width">
        <IconPickerContent selected={selected} onSelect={onSelect} />
      </PopoverContent2>
    </P.Root>
  );
}

function IconPickerContent({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? ALL_ICONS.filter(
        (i) =>
          i.name.includes(trimmed) ||
          i.label.toLowerCase().includes(trimmed),
      )
    : null;

  const displayIcons = results ?? COMMON_ICONS;
  const heading = results
    ? results.length === 0
      ? `No icons found for "${query.trim()}"`
      : `${results.length} icon${results.length !== 1 ? "s" : ""} found matching "${query.trim()}"`
    : "Common Map Icons";

  const cellCls = (active: boolean) =>
    `flex items-center justify-center rounded w-7 h-7 border text-xs transition-colors ${
      active
        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
        : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
    }`;

  return (
    <div className="flex flex-col gap-2 p-2" style={{ width: 220 }}>
      <input
        type="text"
        placeholder="Search icons…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        autoFocus
      />
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
        {heading}
      </div>
      {results?.length !== 0 && (
        <div className="overflow-y-auto squidmaps-scrollbar" style={{ maxHeight: 200 }}>
        <div className="grid grid-cols-6 gap-1">
          {!trimmed && (
            <P.Close asChild>
              <button
                title="No icon"
                onClick={() => onSelect(null)}
                className={cellCls(selected === null)}
              >
                —
              </button>
            </P.Close>
          )}
          {displayIcons.map((icon) => (
            <P.Close asChild key={icon.name}>
              <button
                title={icon.label}
                onClick={() => onSelect(icon.name)}
                className={cellCls(selected === icon.name)}
              >
                <img
                  src={iconToDataUrl(icon.definition, 32)}
                  width={14}
                  height={14}
                  style={{ filter: "invert(0.4)" }}
                  alt={icon.label}
                />
              </button>
            </P.Close>
          ))}
        </div>
        </div>
      )}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-2 mt-1">
        Icons by{" "}
        <a
          href="https://fontawesome.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-gray-600 dark:hover:text-gray-300"
        >
          Font Awesome
        </a>
        {" · "}
        <a
          href="https://fontawesome.com/search?s=solid&ic=free-collection"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-gray-600 dark:hover:text-gray-300"
        >
          See all 1,400+ icons
        </a>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marker preview (header icon that reflects actual marker settings)
// ---------------------------------------------------------------------------

function MarkerPreview({ markerOptions }: { markerOptions: AnyMarkerOptions }) {
  if (markerOptions.type === "circle") {
    const sw = Math.min(markerOptions.strokeWidth, 1.5);
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
        <circle
          cx="7"
          cy="7"
          r={5 - sw / 2}
          fill={markerOptions.fill}
          stroke={markerOptions.stroke}
          strokeWidth={sw}
        />
      </svg>
    );
  }
  if (markerOptions.type === "pin") {
    return (
      <img
        src={pinSvgDataUrl(markerOptions.bodyColor, markerOptions.innerColor, markerOptions.icon, markerOptions.iconColor)}
        width={11}
        height={14}
        className="shrink-0"
        alt=""
      />
    );
  }
  if (markerOptions.type === "emoji") {
    return <span className="text-sm leading-none shrink-0">{markerOptions.emoji}</span>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Label cell for the two-column style grid
// ---------------------------------------------------------------------------

function PropLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap h-7 flex items-center">
      {children}
    </span>
  );
}

function ControlCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end h-7 w-full">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Name anchor popover — controls label placement for point features
// ---------------------------------------------------------------------------

const NAME_ANCHORS = [
  {
    label: "Right",
    value: "right",
    icon: (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 16 16" className={active ? "text-purple-600" : "text-gray-400"}>
        <circle cx="6" cy="8" r="3" fill="currentColor" />
        <line x1="10" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1="10" y1="9.5" x2="14" y2="9.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Left",
    value: "left",
    icon: (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 16 16" className={active ? "text-purple-600" : "text-gray-400"}>
        <circle cx="10" cy="8" r="3" fill="currentColor" />
        <line x1="1" y1="7" x2="6" y2="7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1="2" y1="9.5" x2="6" y2="9.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Bottom",
    value: "bottom",
    icon: (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 16 16" className={active ? "text-purple-600" : "text-gray-400"}>
        <circle cx="8" cy="5" r="3" fill="currentColor" />
        <line x1="5" y1="11" x2="11" y2="11" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1="6" y1="13.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "None",
    value: "none",
    icon: (active: boolean) => (
      <svg width="16" height="16" viewBox="0 0 16 16" className={active ? "text-purple-600" : "text-gray-400"}>
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
  },
] as const;

function nameAnchorLabel(value: string): string {
  return NAME_ANCHORS.find((a) => a.value === value)?.label ?? "Right";
}

function NameAnchorPopover({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const current = NAME_ANCHORS.find((a) => a.value === value) ?? NAME_ANCHORS[0];

  return (
    <P.Root>
      <P.Trigger asChild>
        <button className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-colors px-1.5 h-5 text-gray-600 dark:text-gray-300">
          {current.icon(false)}
          <span className="text-[10px]">{current.label}</span>
        </button>
      </P.Trigger>
      <PopoverContent2 size="no-width">
        <div className="flex flex-col gap-0.5 p-1.5" style={{ width: 140 }}>
          {NAME_ANCHORS.map((anchor) => (
            <P.Close asChild key={anchor.value}>
              <button
                onClick={() => onChange(anchor.value)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  value === anchor.value
                    ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                {anchor.icon(value === anchor.value)}
                <span>{anchor.label}</span>
              </button>
            </P.Close>
          ))}
        </div>
      </PopoverContent2>
    </P.Root>
  );
}

// ---------------------------------------------------------------------------
// Style presets for circle and pin markers
// ---------------------------------------------------------------------------

interface CirclePreset {
  fill: string;
  stroke: string;
  iconColor: string;
}

interface PinPreset {
  bodyColor: string;
  innerColor: string;
  iconColor: string;
}

const CIRCLE_PRESETS: CirclePreset[] = [
  // Classic cartographic palette — high contrast, map-friendly
  { fill: "#7c3aed", stroke: "#ffffff", iconColor: "#ffffff" },  // Purple (default)
  { fill: "#dc2626", stroke: "#ffffff", iconColor: "#ffffff" },  // Vermilion
  { fill: "#ea580c", stroke: "#ffffff", iconColor: "#ffffff" },  // Burnt orange
  { fill: "#d97706", stroke: "#ffffff", iconColor: "#ffffff" },  // Amber
  { fill: "#16a34a", stroke: "#ffffff", iconColor: "#ffffff" },  // Forest green
  { fill: "#0d9488", stroke: "#ffffff", iconColor: "#ffffff" },  // Teal
  { fill: "#2563eb", stroke: "#ffffff", iconColor: "#ffffff" },  // Cobalt
  { fill: "#7c3aed", stroke: "#c4b5fd", iconColor: "#ffffff" },  // Purple on lavender
  { fill: "#0f172a", stroke: "#ffffff", iconColor: "#ffffff" },  // Near-black
  { fill: "#ffffff", stroke: "#374151", iconColor: "#374151" },  // White
  { fill: "#fbbf24", stroke: "#92400e", iconColor: "#92400e" },  // Gold
  { fill: "#f0abfc", stroke: "#a21caf", iconColor: "#a21caf" },  // Pink
];

const PIN_PRESETS: PinPreset[] = [
  // Body + inner circle pairs — darker body, lighter inner
  { bodyColor: "#43538D", innerColor: "#6B82D6", iconColor: "#ffffff" },  // Indigo (default)
  { bodyColor: "#b91c1c", innerColor: "#fca5a5", iconColor: "#7f1d1d" },  // Crimson
  { bodyColor: "#c2410c", innerColor: "#fdba74", iconColor: "#7c2d12" },  // Rust
  { bodyColor: "#a16207", innerColor: "#fde68a", iconColor: "#78350f" },  // Ochre
  { bodyColor: "#15803d", innerColor: "#86efac", iconColor: "#14532d" },  // Emerald
  { bodyColor: "#0f766e", innerColor: "#99f6e4", iconColor: "#134e4a" },  // Teal
  { bodyColor: "#1d4ed8", innerColor: "#93c5fd", iconColor: "#1e3a8a" },  // Royal blue
  { bodyColor: "#7e22ce", innerColor: "#d8b4fe", iconColor: "#581c87" },  // Violet
  { bodyColor: "#1e293b", innerColor: "#94a3b8", iconColor: "#0f172a" },  // Slate
  { bodyColor: "#78350f", innerColor: "#fcd34d", iconColor: "#451a03" },  // Bronze
  { bodyColor: "#9f1239", innerColor: "#fda4af", iconColor: "#881337" },  // Rose
  { bodyColor: "#374151", innerColor: "#ffffff", iconColor: "#374151" },  // Charcoal
];

function CirclePresetPicker({
  onSelect,
}: {
  onSelect: (preset: CirclePreset) => void;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
        Presets
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CIRCLE_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => onSelect(preset)}
            className="shrink-0 rounded-full hover:scale-125 transition-transform"
            title={`${preset.fill} / ${preset.stroke}`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="7" fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function PinPresetPicker({
  onSelect,
}: {
  onSelect: (preset: PinPreset) => void;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
        Presets
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PIN_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => onSelect(preset)}
            className="shrink-0 hover:scale-125 transition-transform"
            title={`${preset.bodyColor} / ${preset.innerColor}`}
          >
            <img
              src={pinSvgDataUrl(preset.bodyColor, preset.innerColor, null, "#ffffff")}
              width={13}
              height={18}
              alt=""
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dash pattern popover — trigger shows line preview + label, popover has presets + custom input
// ---------------------------------------------------------------------------

const DASH_PRESETS = [
  { label: "Solid", value: "", dasharray: "none" },
  { label: "Dashed", value: "8 4", dasharray: "8 4" },
  { label: "Dotted", value: "2 2", dasharray: "2 2" },
] as const;

function dashLabel(value: string): string {
  const preset = DASH_PRESETS.find((p) => p.value === value);
  return preset?.label ?? value;
}

function DashPreviewLine({ dasharray, className }: { dasharray: string; className?: string }) {
  return (
    <svg width="32" height="6" viewBox="0 0 32 6" className={className}>
      <line
        x1="1" y1="3" x2="31" y2="3"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dasharray === "none" ? undefined : dasharray}
      />
    </svg>
  );
}

function DashPopover({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [customValue, setCustomValue] = useState(value);

  useEffect(() => { setCustomValue(value); }, [value]);

  const isPreset = DASH_PRESETS.some((p) => p.value === value);

  return (
    <P.Root>
      <P.Trigger asChild>
        <button className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-colors px-1.5 h-5 text-gray-600 dark:text-gray-300">
          <DashPreviewLine dasharray={value || "none"} />
          <span className="text-[10px] truncate max-w-[80px]">{dashLabel(value)}</span>
        </button>
      </P.Trigger>
      <PopoverContent2 size="no-width">
        <div className="flex flex-col gap-1 p-2" style={{ width: 200 }}>
          {DASH_PRESETS.map((preset) => (
            <P.Close asChild key={preset.value}>
              <button
                onClick={() => onChange(preset.value)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  value === preset.value
                    ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                <DashPreviewLine dasharray={preset.dasharray} className="text-gray-500 dark:text-gray-400 shrink-0" />
                <span>{preset.label}</span>
              </button>
            </P.Close>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1.5">
            <label className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1 block">
              Custom pattern
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onChange(customValue.trim());
                  }
                }}
                placeholder="e.g. 4 2 1 2"
                className="flex-1 min-w-0 text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={() => onChange(customValue.trim())}
                className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors shrink-0"
              >
                Apply
              </button>
            </div>
            {!isPreset && value && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <DashPreviewLine dasharray={value} className="text-gray-500 dark:text-gray-400" />
                <span className="text-[10px] text-gray-400">Current</span>
              </div>
            )}
          </div>
        </div>
      </PopoverContent2>
    </P.Root>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

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

  const isPoint = wrappedFeature.feature.geometry?.type === "Point";
  const isLine =
    wrappedFeature.feature.geometry?.type === "LineString" ||
    wrappedFeature.feature.geometry?.type === "MultiLineString";
  const props = (wrappedFeature.feature.properties ?? {}) as Record<string, unknown>;
  const markerOptions: AnyMarkerOptions = getMarkerOptions(props);

  const name = typeof props.name === "string" ? props.name : "";
  const description = typeof props.description === "string" ? props.description : "";

  const [localName, setLocalName] = useState(name);
  const [localDescription, setLocalDescription] = useState(description);

  const circleOpts = markerOptions.type === "circle" ? markerOptions : null;
  const [localMarkerSize, setLocalMarkerSize] = useState(circleOpts?.markerSize ?? 8);
  const [localStrokeWidth, setLocalStrokeWidth] = useState(circleOpts?.strokeWidth ?? 1);

  const pinOpts = markerOptions.type === "pin" ? markerOptions : null;
  const [localPinSize, setLocalPinSize] = useState(pinOpts?.size ?? DEFAULT_PIN_SIZE);

  const emojiOpts = markerOptions.type === "emoji" ? markerOptions : null;
  const [localEmojiSize, setLocalEmojiSize] = useState(emojiOpts?.size ?? DEFAULT_EMOJI_SIZE);

  const [localLineWidth, setLocalLineWidth] = useState(typeof props["stroke-width"] === "number" ? props["stroke-width"] : 2);
  const [localLineOpacity, setLocalLineOpacity] = useState(typeof props["stroke-opacity"] === "number" ? props["stroke-opacity"] : 1);
  const [localFillOpacity, setLocalFillOpacity] = useState(typeof props["fill-opacity"] === "number" ? props["fill-opacity"] : 0.3);

  const nameFocused = useRef(false);
  const descriptionFocused = useRef(false);

  useEffect(() => { if (!nameFocused.current) setLocalName(name); }, [name]);
  useEffect(() => { if (!descriptionFocused.current) setLocalDescription(description); }, [description]);
  useEffect(() => { setLocalMarkerSize(circleOpts?.markerSize ?? 8); }, [circleOpts?.markerSize]);
  useEffect(() => { setLocalStrokeWidth(circleOpts?.strokeWidth ?? 1); }, [circleOpts?.strokeWidth]);
  useEffect(() => { setLocalPinSize(pinOpts?.size ?? DEFAULT_PIN_SIZE); }, [pinOpts?.size]);
  useEffect(() => { setLocalEmojiSize(emojiOpts?.size ?? DEFAULT_EMOJI_SIZE); }, [emojiOpts?.size]);
  useEffect(() => { setLocalLineWidth(typeof props["stroke-width"] === "number" ? props["stroke-width"] : 2); }, [props["stroke-width"]]);
  useEffect(() => { setLocalLineOpacity(typeof props["stroke-opacity"] === "number" ? props["stroke-opacity"] : 1); }, [props["stroke-opacity"]]);
  useEffect(() => { setLocalFillOpacity(typeof props["fill-opacity"] === "number" ? props["fill-opacity"] : 0.3); }, [props["fill-opacity"]]);

  const wrappedFeatureRef = useRef(wrappedFeature);
  wrappedFeatureRef.current = wrappedFeature;

  const updateProps = useMemo(
    () =>
      debounce((updates: Record<string, JsonValue>) => {
        const wf = wrappedFeatureRef.current;
        const existingProps = wf.feature.properties ?? {};
        void transact({
          track: "feature-update-style",
          putFeatures: [{ ...wf, feature: { ...wf.feature, properties: { ...existingProps, ...updates } } }],
        });
      }, 80),
    [transact],
  );

  const setProps = useCallback(
    (updates: Record<string, JsonValue>) => {
      const wf = wrappedFeatureRef.current;
      const existingProps = wf.feature.properties ?? {};
      void transact({
        track: "feature-update-style",
        putFeatures: [{ ...wf, feature: { ...wf.feature, properties: { ...existingProps, ...updates } } }],
      });
    },
    [transact],
  );

  const geometryType = wrappedFeature.feature.geometry?.type;
  const displayType =
    geometryType === "Point" || geometryType === "MultiPoint" ? "Point"
    : geometryType === "LineString" || geometryType === "MultiLineString" ? "Line"
    : geometryType === "Polygon" || geometryType === "MultiPolygon" ? "Polygon"
    : "Feature";

  return (
    <div className="flex flex-col gap-3 p-3 min-w-0 overflow-hidden">
      {/* Header: marker preview + name input */}
      <div className="flex items-center gap-1.5">
        {isPoint ? <MarkerPreview markerOptions={markerOptions} /> : <GeometryIcon type={geometryType} />}
        <input
          type="text"
          value={localName}
          onFocus={() => { nameFocused.current = true; }}
          onBlur={() => { nameFocused.current = false; }}
          onChange={(e) => { setLocalName(e.target.value); updateProps({ name: e.target.value }); }}
          placeholder={displayType}
          className={inputClass({ _size: "sm" }) + " w-full"}
        />
      </div>

      {/* Label anchor for point features */}
      {isPoint && (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
          <PropLabel>Show name</PropLabel>
          <ControlCell>
            <NameAnchorPopover
              value={typeof props["name-anchor"] === "string" ? props["name-anchor"] : "right"}
              onChange={(v) => setProps({ "name-anchor": v })}
            />
          </ControlCell>
        </div>
      )}

      {/* Description */}
      <textarea
        value={localDescription}
        onFocus={() => { descriptionFocused.current = true; }}
        onBlur={() => { descriptionFocused.current = false; }}
        onChange={(e) => { setLocalDescription(e.target.value); updateProps({ description: e.target.value }); }}
        placeholder="add a description"
        rows={2}
        className="block w-full text-sm border rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white border-gray-200 dark:border-gray-700 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
      />

      {/* Style */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Style
        </div>

        {isPoint ? (
          <>
            {/* Marker type switcher */}
            <div className="flex rounded overflow-hidden border border-gray-200 dark:border-gray-700">
              {(["circle", "pin", "emoji"] as const).map((type, i) => (
                <button
                  key={type}
                  onClick={() => setProps({ "marker-type": type })}
                  className={`flex-1 text-xs py-1 px-2 transition-colors capitalize ${
                    i > 0 ? "border-l border-gray-200 dark:border-gray-700" : ""
                  } ${
                    markerOptions.type === type
                      ? "bg-purple-600 text-white"
                      : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Circle controls ── */}
            {markerOptions.type === "circle" && (
              <div className="flex flex-col gap-2 min-w-0">
              <CirclePresetPicker onSelect={(p) => setProps({ fill: p.fill, stroke: p.stroke, "icon-color": p.iconColor })} />
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
                <PropLabel>Size &amp; Color</PropLabel>
                <ControlCell>
                  <div className="flex items-center gap-1.5">
                    <SliderPopover
                      value={localMarkerSize * 2}
                      min={4} max={40} step={1}
                      display={`${Math.round(localMarkerSize * 2)}px`}
                      onChange={(v: number) => { setLocalMarkerSize(v / 2); updateProps({ "marker-size": v / 2 }); }}
                      icon={<svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth={1.2} /></svg>}
                    />
                    <ColorSwatch color={markerOptions.fill} onChange={(c) => updateProps({ fill: c })} />
                  </div>
                </ControlCell>
                <PropLabel>Stroke</PropLabel>
                <ControlCell>
                  <div className="flex items-center gap-1.5">
                    <SliderPopover
                      value={localStrokeWidth}
                      min={0} max={8} step={0.5}
                      display={`${localStrokeWidth}px`}
                      onChange={(v: number) => { setLocalStrokeWidth(v); updateProps({ "stroke-width": v }); }}
                    />
                    <ColorSwatch color={markerOptions.stroke} onChange={(c) => updateProps({ stroke: c })} />
                  </div>
                </ControlCell>
                <PropLabel>Icon</PropLabel>
                <ControlCell>
                  <div className="flex items-center gap-1.5">
                    <IconPopoverPicker selected={markerOptions.icon} onSelect={(n) => setProps({ icon: n })} />
                    {markerOptions.icon !== null && (
                      <ColorSwatch color={markerOptions.iconColor} onChange={(c) => updateProps({ "icon-color": c })} />
                    )}
                  </div>
                </ControlCell>
              </div>
              </div>
            )}

            {/* ── Pin controls ── */}
            {markerOptions.type === "pin" && (
              <div className="flex flex-col gap-2 min-w-0">
              <PinPresetPicker onSelect={(p) => setProps({ "pin-body-color": p.bodyColor, "pin-inner-color": p.innerColor, "icon-color": p.iconColor })} />
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
                <PropLabel>Size &amp; Color</PropLabel>
                <ControlCell>
                  <div className="flex items-center gap-1.5">
                    <SliderPopover
                      value={localPinSize}
                      min={24} max={80} step={2}
                      display={`${localPinSize}px`}
                      onChange={(v: number) => { setLocalPinSize(v); updateProps({ "pin-size": v }); }}
                      icon={<svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth={1.2} /></svg>}
                    />
                    <ColorSwatch color={markerOptions.bodyColor} onChange={(c) => updateProps({ "pin-body-color": c })} />
                    <ColorSwatch color={markerOptions.innerColor} onChange={(c) => updateProps({ "pin-inner-color": c })} />
                  </div>
                </ControlCell>
                <PropLabel>Icon</PropLabel>
                <ControlCell>
                  <div className="flex items-center gap-1.5">
                    <IconPopoverPicker selected={markerOptions.icon} onSelect={(n) => setProps({ icon: n })} />
                    {markerOptions.icon !== null && (
                      <ColorSwatch color={markerOptions.iconColor} onChange={(c) => updateProps({ "icon-color": c })} />
                    )}
                  </div>
                </ControlCell>
              </div>
              </div>
            )}

            {/* ── Emoji controls ── */}
            {markerOptions.type === "emoji" && (
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
                <PropLabel>Size</PropLabel>
                <ControlCell>
                  <SliderPopover
                    value={localEmojiSize}
                    min={16} max={80} step={2}
                    display={`${localEmojiSize}px`}
                    onChange={(v: number) => { setLocalEmojiSize(v); updateProps({ "emoji-size": v }); }}
                    icon={<svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth={1.2} /></svg>}
                  />
                </ControlCell>
                <PropLabel>Emoji</PropLabel>
                <ControlCell>
                  <EmojiPopoverPicker
                    selected={markerOptions.emoji}
                    onSelect={(e) => setProps({ emoji: e })}
                  />
                </ControlCell>
              </div>
            )}
          </>
        ) : isLine ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
            <PropLabel>Stroke</PropLabel>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-end gap-1.5 h-7">
                <SliderPopover
                  value={localLineWidth}
                  min={0} max={10} step={0.5}
                  display={`${localLineWidth}`}
                  onChange={(v) => { setLocalLineWidth(v); updateProps({ "stroke-width": v }); }}
                />
                <SliderPopover
                  value={localLineOpacity}
                  min={0} max={1} step={0.05}
                  display={`${Math.round(localLineOpacity * 100)}%`}
                  onChange={(v) => { setLocalLineOpacity(v); updateProps({ "stroke-opacity": v }); }}
                  icon={<svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400"><circle cx="5" cy="5" r="4" fill="currentColor" fillOpacity={0.4} stroke="currentColor" strokeWidth={1} /></svg>}
                />
                <ColorSwatch
                  color={typeof props.stroke === "string" ? props.stroke : "#7c3aed"}
                  onChange={(c) => updateProps({ stroke: c })}
                />
              </div>
              <div className="flex items-center justify-end h-7">
                <DashPopover
                  value={typeof props["stroke-dasharray"] === "string" ? props["stroke-dasharray"] : ""}
                  onChange={(v) => updateProps({ "stroke-dasharray": v })}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
            <PropLabel>Fill</PropLabel>
            <ControlCell>
              <div className="flex items-center gap-1.5">
                <SliderPopover
                  value={localFillOpacity}
                  min={0} max={1} step={0.05}
                  display={`${Math.round(localFillOpacity * 100)}%`}
                  onChange={(v) => { setLocalFillOpacity(v); updateProps({ "fill-opacity": v }); }}
                  icon={<svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400"><circle cx="5" cy="5" r="4" fill="currentColor" fillOpacity={0.4} stroke="currentColor" strokeWidth={1} /></svg>}
                />
                <ColorSwatch
                  color={typeof props.fill === "string" ? props.fill : "#7c3aed"}
                  onChange={(c) => updateProps({ fill: c })}
                />
              </div>
            </ControlCell>
            <PropLabel>Stroke</PropLabel>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-end gap-1.5 h-7">
                <SliderPopover
                  value={localLineWidth}
                  min={0} max={10} step={0.5}
                  display={`${localLineWidth}`}
                  onChange={(v) => { setLocalLineWidth(v); updateProps({ "stroke-width": v }); }}
                />
                <SliderPopover
                  value={localLineOpacity}
                  min={0} max={1} step={0.05}
                  display={`${Math.round(localLineOpacity * 100)}%`}
                  onChange={(v) => { setLocalLineOpacity(v); updateProps({ "stroke-opacity": v }); }}
                  icon={<svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-500 dark:text-gray-400"><circle cx="5" cy="5" r="4" fill="currentColor" fillOpacity={0.4} stroke="currentColor" strokeWidth={1} /></svg>}
                />
                <ColorSwatch
                  color={typeof props.stroke === "string" ? props.stroke : "#7c3aed"}
                  onChange={(c) => updateProps({ stroke: c })}
                />
              </div>
              <div className="flex items-center justify-end h-7">
                <DashPopover
                  value={typeof props["stroke-dasharray"] === "string" ? props["stroke-dasharray"] : ""}
                  onChange={(v) => updateProps({ "stroke-dasharray": v })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emoji popover picker — compact trigger showing current emoji
// ---------------------------------------------------------------------------

function EmojiPopoverPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (emoji: string) => void;
}) {
  return (
    <P.Root>
      <P.Trigger asChild>
        <button className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-colors px-1.5 h-7">
          <span className="text-sm leading-none">{selected}</span>
          <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[100px]">
            {EMOJI_LIST.find((e) => e.emoji === selected)?.label ?? ""}
          </span>
        </button>
      </P.Trigger>
      <PopoverContent2 size="no-width">
        <div className="p-2" style={{ width: 220 }}>
          <EmojiPickerContent selected={selected} onSelect={onSelect} />
        </div>
      </PopoverContent2>
    </P.Root>
  );
}

// ---------------------------------------------------------------------------
// Emoji picker content (shared by popover)
// ---------------------------------------------------------------------------

function EmojiPickerContent({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? EMOJI_LIST.filter(({ label }) => label.toLowerCase().includes(trimmed))
    : null;

  const displayEmojis = results ?? COMMON_EMOJI_LIST;
  const heading = results
    ? results.length === 0
      ? `No emojis found for "${query.trim()}"`
      : `${results.length} emoji${results.length !== 1 ? "s" : ""} found matching "${query.trim()}"`
    : "Commonly Used";

  const cellCls = (active: boolean) =>
    `flex items-center justify-center rounded w-8 h-8 border text-lg transition-colors ${
      active
        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
        : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Search emojis…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
        {heading}
      </div>
      {results?.length !== 0 && (
        <div className="overflow-y-auto squidmaps-scrollbar" style={{ maxHeight: 200 }}>
          <div className="grid grid-cols-5 gap-1">
            {displayEmojis.map(({ emoji, label }) => (
              <button key={emoji} title={label} onClick={() => onSelect(emoji)} className={cellCls(selected === emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
