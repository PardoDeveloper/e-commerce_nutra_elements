"use client";

// Compuerta de datos del admin con Firebase: muestra "Cargando…" hasta la primera lectura de Firestore y un
// error claro si las reglas o la red la impiden. Con la demo no hace nada (los datos están en memoria).
import { useAdminState, useDataSource } from "./AdminProvider";
import ui from "./admin.module.css";
import type { ReactNode } from "react";

export function DataGate({ children }: { children: ReactNode }) {
  const source = useDataSource();
  if (source !== "firebase") return <>{children}</>;
  return <FirebaseGate>{children}</FirebaseGate>;
}

function FirebaseGate({ children }: { children: ReactNode }) {
  const state = useAdminState();
  if (state.status === "error") {
    return (
      <div className={ui.page}>
        <p className={`${ui.alert} ${ui.alertError}`} role="alert">
          No se pudieron cargar los datos. {state.loadError}
        </p>
        <p className={ui.help}>Recarga la página. Si sigue igual, revisa que tu cuenta tenga el permiso de administrador y que las reglas de Firestore estén desplegadas.</p>
      </div>
    );
  }
  if (state.status === "loading") {
    return (
      <p role="status" className={ui.empty}>
        Cargando datos del panel…
      </p>
    );
  }
  return <>{children}</>;
}
