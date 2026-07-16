import { SquidmapsIcon } from "./elements";

interface NavBarProps {
  username: string;
  onNewMap: () => void;
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function NavBar({ username, onNewMap }: NavBarProps) {
  return (
    <div className="px-5 py-4 bg-[#eef3f1]">
      <div
        className="flex items-center gap-4 h-16 px-5 bg-white border border-[#dde6e2] rounded-[14px]"
        style={{ boxShadow: "0 2px 16px rgba(18,49,44,0.06)" }}
      >
        {/* Wordmark */}
        <a
          href={`/@${username}`}
          className="flex items-center gap-2 shrink-0 text-[#12312c] hover:opacity-80 transition-opacity"
        >
          <SquidmapsIcon className="w-7 h-7" />
          <span className="text-[17px] font-extrabold tracking-tight">
            squidmaps
          </span>
        </a>

        {/* Search — visual only */}
        <div className="flex-1 max-w-sm">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#eef3f1] rounded-full text-[#8fa8a2]">
            <SearchIcon />
            <span className="text-sm select-none">Search your maps…</span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={onNewMap}
          className="px-[18px] py-2 bg-[#1f7a6c] text-white text-sm font-extrabold rounded-xl hover:bg-[#196358] transition-colors shrink-0"
        >
          + New map
        </button>

        {/* Avatar */}
        <div className="w-[34px] h-[34px] rounded-full bg-[#12312c] text-white text-sm font-bold flex items-center justify-center shrink-0 select-none cursor-pointer hover:opacity-80 transition-opacity">
          {username[0]?.toUpperCase() ?? "?"}
        </div>
      </div>
    </div>
  );
}
