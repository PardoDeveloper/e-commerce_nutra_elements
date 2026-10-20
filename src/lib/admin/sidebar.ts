// Preferencia de la barra lateral plegada del admin, guardada en localStorage.
// Se expone como store externo para usarla con useSyncExternalStore.
const KEY = "nutra-admin-sidebar-collapsed";
const listeners = new Set<() => void>();

export function subscribeSidebar(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // almacenamiento bloqueado: se queda desplegada
  }
}

// En el servidor siempre desplegada; el shell solo se pinta tras conocer la sesión del navegador.
export function getServerSidebarCollapsed(): boolean {
  return false;
}

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // sin almacenamiento: el cambio no se recuerda
  }
  listeners.forEach((l) => l());
}
