import {
  KeyboardIcon,
  ReaderIcon,
} from "@radix-ui/react-icons";
import { FileInfo } from "app/components/file_info";
import { MapTitleBar } from "app/components/map_title_bar";
import { useSetAtom } from "jotai";
import { DropdownMenu as DD } from "radix-ui";
import { memo } from "react";
import { dialogAtom } from "state/jotai";
import { Button, DDContent, StyledItem } from "./elements";

interface MenuBarPlayProps {
  username: string;
  mapSlug: string;
  mapTitle: string;
}

export const MenuBarPlay = memo(function MenuBar({
  username,
  mapSlug,
  mapTitle,
}: MenuBarPlayProps) {
  return (
    <div className="flex justify-between h-12 pr-2 text-black dark:text-white border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-x-3 px-3">
        <a
          href={`/@${username}`}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          title="All maps"
        >
          ← Maps
        </a>
        <MapTitleBar
          username={username}
          mapSlug={mapSlug}
          initialTitle={mapTitle}
        />
      </div>
      <div className="flex items-center gap-x-2">
        <FileInfo />
      </div>
    </div>
  );
});

function HelpDot() {
  const setDialogState = useSetAtom(dialogAtom);
  return (
    <DD.Root>
      <DD.Trigger asChild>
        <Button variant="quiet">Help</Button>
      </DD.Trigger>
      <DDContent>
        <StyledItem
          onSelect={() => {
            setDialogState({ type: "cheatsheet" });
          }}
        >
          <KeyboardIcon />
          Keyboard shorcuts
        </StyledItem>
        <StyledItem
          onSelect={() => {
            window.open("https://www.squidmaps.io/documentation-index");
          }}
        >
          <ReaderIcon /> Documentation
        </StyledItem>
      </DDContent>
    </DD.Root>
  );
}
