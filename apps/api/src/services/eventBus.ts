import type { AppEvent } from "@eha/shared";

export function createEventBus() {
  const listeners = new Set<(event: AppEvent) => void>();

  function publish(event: AppEvent) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function subscribe(listener: (event: AppEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { publish, subscribe };
}

