import { create } from 'zustand';
import type { EventItem, Stats } from '@/types';

interface EventStore {
  events: EventItem[];
  stats: Stats | null;
  connected: boolean;
  addEvent: (event: EventItem) => void;
  setEvents: (events: EventItem[]) => void;
  setStats: (stats: Stats) => void;
  setConnected: (connected: boolean) => void;
  clearEvents: () => void;
}

const MAX_EVENTS = 500;

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  stats: null,
  connected: false,

  addEvent: (event) =>
    set((state) => {
      // Avoid duplicates by checking event id
      if (state.events.some(e => e.id === event.id)) {
        return state;
      }
      return {
        events: [event, ...state.events].slice(0, MAX_EVENTS),
      };
    }),

  setEvents: (events) => set({ events }),

  setStats: (stats) => set({ stats }),

  setConnected: (connected) => set({ connected }),

  clearEvents: () => set({ events: [] }),
}));
