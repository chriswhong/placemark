import { Squidmaps } from "app/components/squidmaps";
import { MapsListPage } from "app/components/maps_list_page";
import { LandingPage } from "app/components/landing_page";
import { PublicProfilePage } from "app/components/public_profile_page";
import { StrictMode, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Route, Switch, useLocation } from "wouter";
import Converter from "./converter";
import "../styles/globals.css";
import { StyleGuide } from "app/components/style_guide";
import { UIDMap } from "app/lib/id_mapper";
import { PersistenceContext } from "app/lib/persistence/context";
import { ServerPersistence } from "app/lib/persistence/server";
import { createStore, Provider } from "jotai";
import { Tooltip as T } from "radix-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

interface MapAppProps {
  username: string;
  mapSlug: string;
}

interface MapMeta {
  slug: string;
  title: string;
}

function MapApp({ username, mapSlug }: MapAppProps) {
  const storeRef = useRef(createStore());
  const idMap = useRef(UIDMap.empty());
  const persistenceRef = useRef<ServerPersistence | null>(null);
  const [ready, setReady] = useState(false);
  const [mapMeta, setMapMeta] = useState<MapMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    // Reset state when mapSlug changes
    storeRef.current = createStore();
    idMap.current = UIDMap.empty();
    persistenceRef.current = null;
    setReady(false);
    setMapMeta(null);
    setError(null);

    // If this is a "new" map slug, create it first
    const init = async () => {
      let slug = mapSlug;

      if (mapSlug === "new") {
        const res = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Untitled Map" }),
        });
        if (!res.ok) throw new Error("Failed to create map");
        const created = (await res.json()) as MapMeta;
        navigate(`/@${username}/${created.slug}`, { replace: true });
        return; // useEffect will re-run with the new slug
      }

      // Fetch map metadata
      const metaRes = await fetch(`/api/maps/${slug}`);
      if (!metaRes.ok) throw new Error(`Map not found: ${slug}`);
      const meta = (await metaRes.json()) as MapMeta;
      setMapMeta(meta);

      const p = new ServerPersistence(idMap.current, storeRef.current, slug);
      await p.initialize();
      persistenceRef.current = p;
      setReady(true);
    };

    init().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load map");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSlug]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-center p-8">
        <div>
          <p className="font-semibold text-red-600 mb-2">Error</p>
          <p className="text-sm text-gray-600 max-w-sm">{error}</p>
          <a
            href={`/@${username}`}
            className="text-sm text-[#1f7a6c] underline mt-3 block"
          >
            ← Back to maps
          </a>
        </div>
      </div>
    );
  }

  if (!ready || !persistenceRef.current || !mapMeta) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <Provider store={storeRef.current}>
      <PersistenceContext.Provider value={persistenceRef.current}>
        <Squidmaps
          username={username}
          mapSlug={mapMeta.slug}
          mapTitle={mapMeta.title}
        />
      </PersistenceContext.Provider>
    </Provider>
  );
}

interface CurrentUser {
  id: string;
  username: string;
}

function BackendCheck({
  children,
}: {
  children: (user: CurrentUser) => React.ReactNode;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<"loading" | "authed" | "unauthed" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => {
        if (r.status === 401) { setStatus("unauthed"); return null; }
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        return r.json() as Promise<CurrentUser>;
      })
      .then((u) => { if (u) { setUser(u); setStatus("authed"); } })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not reach backend");
        setStatus("error");
      });
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
        Connecting…
      </div>
    );
  }

  if (status === "unauthed") {
    return <LandingPage />;
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-screen text-center p-8">
        <div>
          <p className="font-semibold text-red-600 mb-2">Backend unavailable</p>
          <p className="text-sm text-gray-600 max-w-sm">{error}</p>
          <p className="text-xs text-gray-400 mt-3">
            Make sure the backend is running:{" "}
            <code className="bg-gray-100 px-1 rounded">pnpm dev</code>
          </p>
        </div>
      </div>
    );
  }

  return <>{children(user!)}</>;
}

// regexparam (used by Wouter) only treats :param as a parameter when preceded by /.
// So /@:username won't work — the @ breaks param detection.
// Instead, use a plain path param and match the @ manually.
function AppRoutes({ currentUser }: { currentUser: CurrentUser }) {
  const [location] = useLocation();

  // /@username or /@username/mapSlug
  const atMatch = location.match(/^\/@([^/]+?)(?:\/([^/]+))?$/);
  if (atMatch) {
    const username = atMatch[1];
    const mapSlug = atMatch[2];
    if (mapSlug) {
      return (
        <>
          <title>Squidmaps</title>
          <MapApp username={username} mapSlug={mapSlug} />
        </>
      );
    }
    // Viewing another user's profile → public read-only view
    if (username !== currentUser.username) {
      return (
        <>
          <title>@{username} — squidmaps</title>
          <PublicProfilePage username={username} />
        </>
      );
    }
    return (
      <>
        <title>Maps — @{username}</title>
        <MapsListPage username={username} />
      </>
    );
  }

  return (
    <Switch>
      <Route path="/converter">
        <title>Converter</title>
        <Converter />
      </Route>
      <Route path="/secret-styleguide">
        <StyleGuide />
      </Route>
      <Route path="/secret-landing">
        <LandingPage />
      </Route>
      <Route path="/secret-profile">
        <PublicProfilePage username={currentUser.username} />
      </Route>
      <Route>
        <RedirectToUser username={currentUser.username} />
      </Route>
    </Switch>
  );
}

function Root() {
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.(".squidmaps-scrollbar");
      if (el) el.classList.add("scrollbar-hovered");
    };
    const onOut = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.(".squidmaps-scrollbar");
      if (el && !el.contains(e.relatedTarget as Node)) {
        el.classList.remove("scrollbar-hovered");
      }
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return (
    <Suspense fallback={null}>
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <T.Provider>
            <BackendCheck>
              {(currentUser) => <AppRoutes currentUser={currentUser} />}
            </BackendCheck>
          </T.Provider>
        </QueryClientProvider>
      </StrictMode>
    </Suspense>
  );
}

function RedirectToUser({ username }: { username: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/@${username}`, { replace: true });
  }, [username, navigate]);
  return null;
}

createRoot(document.getElementById("root")!).render(<Root />);
