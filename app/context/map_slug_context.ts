import { createContext, useContext } from "react";

export const MapSlugContext = createContext<string>("");

export function useMapSlug() {
  return useContext(MapSlugContext);
}
