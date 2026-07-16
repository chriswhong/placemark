import { useEffect, useState } from "react";
import { LoggedOutNav } from "./logged_out_nav";

interface MapRecord {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
}

interface PublicProfilePageProps {
  username: string;
}

function MapThumbnail() {
  return (
    <div
      className="w-full h-[120px] rounded-t-[14px]"
      style={{
        background: "#dce9e5",
        backgroundImage:
          "repeating-linear-gradient(135deg, #c7dbd5 1px, transparent 1px 10px)",
      }}
    />
  );
}

export function PublicProfilePage({ username }: PublicProfilePageProps) {
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${username}/maps`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MapRecord[]) => {
        setMaps(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [username]);

  return (
    <div className="min-h-screen bg-[#eef3f1]">
      <LoggedOutNav />

      <div className="max-w-3xl mx-auto px-6 pb-16">
        {/* Profile header */}
        <div className="flex flex-col items-center text-center py-10 mb-4">
          <div className="w-[72px] h-[72px] rounded-full bg-[#12312c] text-white text-2xl font-bold flex items-center justify-center mb-4 select-none">
            {username[0]?.toUpperCase() ?? "?"}
          </div>
          <h1 className="text-[22px] font-extrabold text-[#12312c]">
            {username}
          </h1>
          <p className="text-[13px] text-[#8fa8a2] mt-0.5">@{username}</p>
          <p className="text-[13px] text-[#5b7d76] mt-3 max-w-[480px]">
            Maps made with squidmaps.
          </p>
        </div>

        {/* Map grid — read-only, published only */}
        {loading ? (
          <div className="text-center py-16 text-[#8fa8a2] text-sm">
            Loading maps…
          </div>
        ) : maps.length === 0 ? (
          <div className="text-center py-16 text-[#8fa8a2]">
            <p className="font-semibold">No published maps yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {maps.map((map) => (
              <a
                key={map.id}
                href={`/@${username}/${map.slug}`}
                className="block bg-white border border-[#dde6e2] rounded-[14px] overflow-hidden hover:shadow-[0_2px_16px_rgba(18,49,44,0.08)] transition-shadow"
                style={{ boxShadow: "0 2px 16px rgba(18,49,44,0.08)" }}
              >
                <MapThumbnail />
                <div className="px-4 py-3">
                  <div className="font-extrabold text-[#12312c] text-sm truncate">
                    {map.title}
                  </div>
                  <div className="text-xs text-[#8fa8a2] mt-0.5 truncate">
                    updated {new Date(map.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
