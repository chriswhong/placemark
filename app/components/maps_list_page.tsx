import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

interface MapRecord {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MapsListPageProps {
  username: string;
}

interface DeleteDialogProps {
  map: MapRecord;
  onCancel: () => void;
  onDeleted: () => void;
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Delete &ldquo;{map.title}&rdquo;?
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          This will permanently delete the map and all its features. This action
          cannot be undone.
        </p>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          Type <span className="font-mono font-semibold">{map.slug}</span> to
          confirm deletion.
        </div>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={map.slug}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 mb-4"
        />

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
        Loading maps…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600 text-sm">
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

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            @{username}&rsquo;s Maps
          </h1>
          <button
            onClick={createNewMap}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            New Map
          </button>
        </div>

        {maps.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-4">No maps yet</p>
            <button
              onClick={createNewMap}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
            >
              Create your first map
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {maps.map((map) => (
              <div
                key={map.id}
                className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
              >
                <a
                  href={`/@${username}/${map.slug}`}
                  className="flex-1 min-w-0"
                >
                  <div className="font-medium text-gray-900">{map.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    /@{username}/{map.slug} &middot; updated{" "}
                    {new Date(map.updated_at).toLocaleDateString()}
                  </div>
                </a>
                <button
                  onClick={() => setDeletingMap(map)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete map"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
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
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
