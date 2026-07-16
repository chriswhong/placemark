import { SquidmapsIcon } from "./elements";

export function LoggedOutNav() {
  return (
    <div className="px-5 py-4 bg-[#eef3f1]">
      <div
        className="flex items-center gap-4 h-16 px-5 bg-white border border-[#dde6e2] rounded-[14px]"
        style={{ boxShadow: "0 2px 16px rgba(18,49,44,0.06)" }}
      >
        <a
          href="/"
          className="flex items-center gap-2 shrink-0 text-[#12312c] hover:opacity-80 transition-opacity"
        >
          <SquidmapsIcon className="w-7 h-7" />
          <span className="text-[17px] font-extrabold tracking-tight">
            squidmaps
          </span>
        </a>

        <div className="flex-1" />

        <a
          href="/login"
          className="text-sm font-semibold text-[#5b7d76] hover:text-[#12312c] transition-colors"
        >
          Log in
        </a>
        <a
          href="/signup"
          className="px-[18px] py-2 bg-[#1f7a6c] text-white text-sm font-extrabold rounded-xl hover:bg-[#196358] transition-colors"
        >
          Sign up free
        </a>
      </div>
    </div>
  );
}
