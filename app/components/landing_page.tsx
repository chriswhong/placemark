import { LoggedOutNav } from "./logged_out_nav";
import { SquidmapsIcon } from "./elements";

function MapThumbnail({ title }: { title: string }) {
  return (
    <div
      className="bg-white border border-[#dde6e2] rounded-[14px] overflow-hidden"
      style={{ boxShadow: "0 2px 16px rgba(18,49,44,0.08)" }}
    >
      <div
        className="w-full h-[100px]"
        style={{
          background: "#dce9e5",
          backgroundImage:
            "repeating-linear-gradient(135deg, #c7dbd5 1px, transparent 1px 10px)",
        }}
      />
      <div className="px-3 py-2">
        <div className="text-xs font-bold text-[#12312c] truncate">{title}</div>
      </div>
    </div>
  );
}

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-11 h-11 rounded-xl bg-[#eef3f1] flex items-center justify-center text-[#1f7a6c] shrink-0"
    >
      {children}
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

const EXAMPLE_MAPS = [
  "Weekend hiking spots",
  "Best coffee in the city",
  "Road trip: Pacific Coast",
  "Favorite bookshops",
];

const FEATURES = [
  {
    Icon: PinIcon,
    title: "Drop pins & draw routes",
    description: "Add points, lines, and polygons to any map in seconds.",
  },
  {
    Icon: PaletteIcon,
    title: "Style it your way",
    description: "Customize colors, sizes, and labels to match your vision.",
  },
  {
    Icon: ShareIcon,
    title: "Publish with one click",
    description: "Share a link to your map — no account needed to view.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#eef3f1]">
      <LoggedOutNav />

      {/* Hero */}
      <div className="text-center px-6 pt-16 pb-20">
        <div className="flex justify-center mb-6">
          <SquidmapsIcon className="w-16 h-16" />
        </div>
        <h1 className="text-[44px] font-black text-[#12312c] leading-tight max-w-2xl mx-auto">
          Make a map anyone can fall in love with
        </h1>
        <p className="mt-4 text-[17px] text-[#5b7d76] max-w-lg mx-auto">
          Create beautiful, shareable maps for travel, local guides, projects,
          and everything in between.
        </p>
        <a
          href="/signup"
          className="inline-block mt-8 px-8 py-4 bg-[#1f7a6c] text-white text-base font-extrabold rounded-xl hover:bg-[#196358] transition-colors"
        >
          Start mapping — it&rsquo;s free
        </a>
      </div>

      {/* Feature row */}
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-3 gap-8">
          {FEATURES.map(({ Icon, title, description }) => (
            <div key={title} className="flex flex-col gap-3">
              <FeatureIcon>
                <Icon />
              </FeatureIcon>
              <div className="text-base font-bold text-[#12312c]">{title}</div>
              <div className="text-sm text-[#5b7d76]">{description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Made with squidmaps gallery */}
      <div className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="text-lg font-extrabold text-[#12312c] mb-5">
          Made with squidmaps
        </h2>
        <div className="grid grid-cols-4 gap-4">
          {EXAMPLE_MAPS.map((title) => (
            <MapThumbnail key={title} title={title} />
          ))}
        </div>
      </div>
    </div>
  );
}
