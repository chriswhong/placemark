import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

interface MapTitleBarProps {
  username: string;
  mapSlug: string;
  initialTitle: string;
}

export function MapTitleBar({ username, mapSlug, initialTitle }: MapTitleBarProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  function startEditing() {
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }

  async function save() {
    const trimmed = title.trim() || "Untitled Map";
    setTitle(trimmed);
    setEditing(false);
    setSaving(true);

    try {
      const res = await fetch(`/api/maps/${mapSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        const updated = (await res.json()) as { slug: string };
        if (updated.slug !== mapSlug) {
          navigate(`/@${username}/${updated.slug}`, { replace: true });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setTitle(initialTitle);
      setEditing(false);
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {editing ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
          className="text-sm font-medium bg-white border border-purple-400 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-purple-300 min-w-0 w-48"
          autoFocus
        />
      ) : (
        <button
          onClick={startEditing}
          title="Click to rename"
          className="text-sm font-medium text-gray-700 hover:text-gray-900 truncate max-w-xs"
        >
          {saving ? <span className="opacity-50">{title}</span> : title}
        </button>
      )}
      <span className="text-xs text-gray-400 shrink-0">
        /@{username}/{mapSlug}
      </span>
    </div>
  );
}
