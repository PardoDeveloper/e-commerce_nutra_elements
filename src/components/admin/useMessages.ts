"use client";

import { useSyncExternalStore } from "react";
import { getMessagesStore, type MessagesState, type MessagesStore } from "@/lib/admin/messages-store";
import { useDataSource } from "./AdminProvider";

const SERVER_STATE: MessagesState = { status: "loading", messages: [] };
const serverState = () => SERVER_STATE;

/** Almacén de mensajes de contacto de la fuente activa (solo navegador, con sesión iniciada). */
export function useMessagesStore(): MessagesStore {
  return getMessagesStore(useDataSource());
}

export function useMessagesState(): MessagesState {
  const store = useMessagesStore();
  return useSyncExternalStore(store.subscribe, store.getState, serverState);
}
