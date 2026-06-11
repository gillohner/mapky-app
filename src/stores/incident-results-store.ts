import { create } from "zustand";
import type { IncidentDetails } from "@/types/mapky";

function stripAuthorPrefix(authorId: string, incidentId: string): string {
  const prefix = `${authorId}:`;
  return incidentId.startsWith(prefix) ? incidentId.slice(prefix.length) : incidentId;
}

export function incidentResultKey(incident: IncidentDetails): string {
  return `${incident.author_id}:${stripAuthorPrefix(incident.author_id, incident.id)}`;
}

interface IncidentResultsState {
  active: boolean;
  resultKeys: Set<string>;
  setResults: (keys: Set<string>) => void;
  clearResults: () => void;
}

export const useIncidentResultsStore = create<IncidentResultsState>((set) => ({
  active: false,
  resultKeys: new Set(),
  setResults: (keys) => set({ active: true, resultKeys: keys }),
  clearResults: () => set({ active: false, resultKeys: new Set() }),
}));
