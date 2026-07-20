import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "./nav_bar";

interface MapRecord {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
  has_thumbnail: boolean;
}

interface MapsListPageProps {
  username: string;
}

interface DeleteDialogProps {
  map: MapRecord;
  onCancel: () => void;
  onDeleted: () => void;
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function MapThumbnail({ slug, hasThumbnail }: { slug: string; hasThumbnail: boolean }) {
  if (hasThumbnail) {
    return (
      <div className="w-full h-[120px] rounded-t-[14px] overflow-hidden bg-[#dce9e5]">
        <img
          src={`/api/maps/${slug}/thumbnail`}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
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

function DeleteDialog({ map, onCancel, onDeleted }: DeleteDialogProps) {
  const [input, setInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleDelete() {
    if (input !== map.slug) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${map.slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleDelete();
    if (e.key === "Escape") onCancel();
  }

  const confirmed = input === map.slug;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-[#12312c] mb-1">
          Delete &ldquo;{map.title}&rdquo;?
        </h2>
        <p className="text-sm text-[#5b7d76] mb-4">
          This will permanently delete the map and all its features. This action
          cannot be undone.
        </p>

        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          Type <span className="font-mono font-semibold">{map.slug}</span> to
          confirm deletion.
        </div>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={map.slug}
          className="w-full border border-[#dde6e2] rounded-xl px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-[#1f7a6c]/30 focus:border-[#1f7a6c] mb-4"
        />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-semibold text-[#5b7d76] bg-[#eef3f1] rounded-full hover:bg-[#dde6e2] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-full hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting…" : "Delete map"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MapsListPage({ username }: MapsListPageProps) {
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingMap, setDeletingMap] = useState<MapRecord | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch("/api/maps")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load maps: ${r.status}`);
        return r.json();
      })
      .then((data: MapRecord[]) => {
        setMaps(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load maps");
        setLoading(false);
      });
  }, []);

  async function createNewMap() {
    const res = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Map" }),
    });
    if (!res.ok) return;
    const map = (await res.json()) as MapRecord;
    navigate(`/@${username}/${map.slug}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-[#8fa8a2] text-sm bg-[#eef3f1]">
        Loading maps…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600 text-sm bg-[#eef3f1]">
        {error}
      </div>
    );
  }

  return (
    <>
      {deletingMap && (
        <DeleteDialog
          map={deletingMap}
          onCancel={() => setDeletingMap(null)}
          onDeleted={() => {
            setMaps((prev) => prev.filter((m) => m.id !== deletingMap.id));
            setDeletingMap(null);
          }}
        />
      )}

      <div className="min-h-screen bg-[#eef3f1]">
        <NavBar username={username} onNewMap={createNewMap} />

        <div className="max-w-3xl mx-auto px-6 pb-10">
          <h1 className="text-[22px] font-extrabold text-[#12312c] mb-6">
            @{username}&rsquo;s maps
          </h1>

          {/* Map grid */}
          {maps.length === 0 ? (
            <div className="text-center py-20 text-[#8fa8a2]">
              <p className="text-lg mb-6 font-semibold">No maps yet</p>
              <button
                onClick={createNewMap}
                className="px-[18px] py-[10px] bg-[#1f7a6c] text-white text-sm font-extrabold rounded-xl hover:bg-[#196358] transition-colors"
              >
                Create your first map
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {maps.map((map) => (
                <div
                  key={map.id}
                  className="relative group bg-white border border-[#dde6e2] rounded-[14px] overflow-hidden hover:shadow-[0_2px_16px_rgba(18,49,44,0.08)] transition-shadow"
                  style={{ boxShadow: "0 2px 16px rgba(18,49,44,0.08)" }}
                >
                  <a href={`/@${username}/${map.slug}`} className="block">
                    <MapThumbnail slug={map.slug} hasThumbnail={map.has_thumbnail} />
                    <div className="px-4 py-3">
                      <div className="font-extrabold text-[#12312c] text-sm truncate">
                        {map.title}
                      </div>
                      <div className="text-xs text-[#8fa8a2] mt-0.5 truncate">
                        updated {new Date(map.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </a>
                  <button
                    onClick={() => setDeletingMap(map)}
                    className="absolute top-2 right-2 p-1.5 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete map"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
