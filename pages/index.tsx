import { PlacemarkPlay } from "app/components/placemark_play";
import { StrictMode, Suspense, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Route, Switch } from "wouter";
import Converter from "./converter";
import "../styles/globals.css";
import { StyleGuide } from "app/components/style_guide";
import { UIDMap } from "app/lib/id_mapper";
import { PersistenceContext } from "app/lib/persistence/context";
import { MemPersistence } from "app/lib/persistence/memory";
import { createStore, Provider } from "jotai";
import { Tooltip as T } from "radix-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dataAtom } from "state/jotai";

const queryClient = new QueryClient();
const store = createStore();

// DEV: restore features from localStorage so they survive hot-reloads
try {
  const saved = localStorage.getItem("placemark_dev_data");
  if (saved) {
    const { features, folders } = JSON.parse(saved);
    store.set(dataAtom, {
      featureMap: new Map(features),
      folderMap: new Map(folders),
      selection: { type: "none" },
    });
  }
} catch (_) {}

function App() {
  const idMap = useRef(UIDMap.empty());
  return (
    <Suspense fallback={null}>
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <T.Provider>
            <Switch>
              <Route path="/">
                <Provider store={store}>
                  <PersistenceContext.Provider
                    value={new MemPersistence(idMap.current, store)}
                  >
                    <title>Placemark Play</title>
                    <PlacemarkPlay />
                  </PersistenceContext.Provider>
                </Provider>
              </Route>
              <Route path="/converter">
                <title>Converter</title>
                <Converter />
              </Route>
              <Route path="/secret-styleguide">
                <StyleGuide />
              </Route>
            </Switch>
          </T.Provider>
        </QueryClientProvider>
      </StrictMode>
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
