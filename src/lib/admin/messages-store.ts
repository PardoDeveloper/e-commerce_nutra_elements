// Almacén de mensajes de contacto del admin. Misma interfaz para la demo (localStorage, D-028) y para
// Firebase (`contactMessages` con onSnapshot como admin; marcar, archivar y eliminar son escrituras
// directas validadas por las reglas). Solo navegador.
import type { ContactMessage } from "@/lib/contact/types";
import { DEMO_MESSAGES_KEY, readDemoMessages, writeDemoMessages } from "@/lib/contact/demo-store";
import type { DataSource } from "./mode";
import { toContactMessage } from "./messages";

export interface MessagesState {
  status: "loading" | "ready" | "error";
  messages: readonly ContactMessage[];
  error?: string;
}

export interface MessagesStore {
  getState(): MessagesState;
  subscribe(listener: () => void): () => void;
  /** Cambia `read` y/o `archived` de varios mensajes. */
  update(ids: readonly string[], patch: Partial<Pick<ContactMessage, "read" | "archived">>): Promise<void>;
  /** Elimina definitivamente. */
  remove(ids: readonly string[]): Promise<void>;
  dispose?(): void;
}

/** Tope de mensajes que se cargan (los más recientes). */
export const MESSAGES_LIMIT = 500;

function createDemoStore(): MessagesStore {
  const listeners = new Set<() => void>();
  let state: MessagesState = { status: "ready", messages: readDemoMessages(window.localStorage) };
  const refresh = () => {
    state = { status: "ready", messages: readDemoMessages(window.localStorage) };
    listeners.forEach((l) => l());
  };
  // Mensajes enviados desde /contacto en otra pestaña.
  window.addEventListener("storage", (e) => {
    if (e.key === DEMO_MESSAGES_KEY || e.key === null) refresh();
  });
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async update(ids, patch) {
      const set = new Set(ids);
      writeDemoMessages(
        window.localStorage,
        readDemoMessages(window.localStorage).map((m) => (set.has(m.id) ? { ...m, ...patch } : m)),
      );
      refresh();
    },
    async remove(ids) {
      const set = new Set(ids);
      writeDemoMessages(window.localStorage, readDemoMessages(window.localStorage).filter((m) => !set.has(m.id)));
      refresh();
    },
  };
}

function createFirebaseStore(): MessagesStore {
  const listeners = new Set<() => void>();
  let state: MessagesState = { status: "loading", messages: [] };
  const emit = (next: MessagesState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  let unsubscribe: (() => void) | null = null;
  // El SDK se carga de forma diferida: solo quien abre /admin/mensajes lo necesita aquí.
  const sdk = Promise.all([import("firebase/firestore"), import("@/lib/firebase/client")]);
  void sdk.then(([fs, client]) => {
    const db = client.getFirebaseDb();
    unsubscribe = fs.onSnapshot(
      fs.query(fs.collection(db, "contactMessages"), fs.orderBy("createdAt", "desc"), fs.limit(MESSAGES_LIMIT)),
      (snap) => {
        const messages = snap.docs.flatMap((d) => {
          const m = toContactMessage(d.id, d.data());
          return m ? [m] : [];
        });
        emit({ status: "ready", messages });
      },
      () => emit({ status: "error", messages: state.messages, error: "No se pudieron cargar los mensajes. Recarga la página." }),
    );
  });
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async update(ids, patch) {
      const [fs, client] = await sdk;
      const db = client.getFirebaseDb();
      const batch = fs.writeBatch(db);
      for (const id of ids) batch.update(fs.doc(db, "contactMessages", id), { ...patch, updatedAt: fs.serverTimestamp() });
      await batch.commit();
    },
    async remove(ids) {
      const [fs, client] = await sdk;
      const db = client.getFirebaseDb();
      const batch = fs.writeBatch(db);
      for (const id of ids) batch.delete(fs.doc(db, "contactMessages", id));
      await batch.commit();
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

let singleton: { source: DataSource; store: MessagesStore } | null = null;

/** Instancia única por pestaña (sobrevive a la navegación dentro del admin). */
export function getMessagesStore(source: DataSource): MessagesStore {
  if (singleton?.source === source) return singleton.store;
  singleton?.store.dispose?.();
  singleton = { source, store: source === "firebase" ? createFirebaseStore() : createDemoStore() };
  return singleton.store;
}

/** Cierra el listener (al cerrar la sesión). */
export function resetMessagesStore(): void {
  singleton?.store.dispose?.();
  singleton = null;
}
