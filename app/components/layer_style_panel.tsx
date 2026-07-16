import { useAtom } from "jotai";
import { folderLayersAtom } from "state/jotai";
import type { IFolderLayer } from "types";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { Popover as P } from "radix-ui";
import { PopoverContent2, Button, inputClass } from "./elements";

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
    <div className="flex items-center gap-2 w-full h-7 min-w-0">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-0 accent-purple-600"
      />
      <span className="text-xs text-gray-500 dark:text-gray-400 w-9 text-right shrink-0">
        {display}
      </span>
    </div>
  );
}

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

export function LayerStylePanel({ layer }: { layer: IFolderLayer }) {
  const [folderLayers, setFolderLayers] = useAtom(folderLayersAtom);

  function updatePaint(key: keyof IFolderLayer["paint"], value: string | number) {
    setFolderLayers(layers =>
      layers.map(l =>
        l.id === layer.id
          ? { ...l, paint: { ...l.paint, [key]: value } }
          : l
      )
    );
  }

  const paint = layer.paint;

  return (
    <div className="flex flex-col gap-3 p-3 min-w-0 overflow-hidden">
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
          Circle Layer
        </div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{layer.name}</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Paint
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 min-w-0">
          <PropLabel>Radius</PropLabel>
          <SliderControl
            value={paint["circle-radius"]}
            min={1}
            max={30}
            step={1}
            display={`${paint["circle-radius"]}px`}
            onChange={(v) => updatePaint("circle-radius", v)}
          />
          <PropLabel>Color</PropLabel>
          <ControlCell>
            <ColorSwatch
              color={paint["circle-color"]}
              onChange={(c) => updatePaint("circle-color", c)}
            />
          </ControlCell>
          <PropLabel>Opacity</PropLabel>
          <SliderControl
            value={paint["circle-opacity"]}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(paint["circle-opacity"] * 100)}%`}
            onChange={(v) => updatePaint("circle-opacity", v)}
          />
          <PropLabel>Stroke Width</PropLabel>
          <SliderControl
            value={paint["circle-stroke-width"]}
            min={0}
            max={10}
            step={0.5}
            display={`${paint["circle-stroke-width"]}px`}
            onChange={(v) => updatePaint("circle-stroke-width", v)}
          />
          <PropLabel>Stroke Color</PropLabel>
          <ControlCell>
            <ColorSwatch
              color={paint["circle-stroke-color"]}
              onChange={(c) => updatePaint("circle-stroke-color", c)}
            />
          </ControlCell>
        </div>
      </div>
    </div>
  );
}
