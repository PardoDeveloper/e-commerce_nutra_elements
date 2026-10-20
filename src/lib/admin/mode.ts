// Fuente de datos del admin: "demo" (simulada, por defecto) o "firebase" (Auth, Firestore, Storage y Functions reales).
//
// Selector: la MISMA variable de servidor que usa la capa de datos pública, `DATA_SOURCE`. El admin corre en el
// navegador, pero NO se duplica la variable como NEXT_PUBLIC_*: el layout del admin (Server Component dinámico) la lee
// en cada petición y la pasa por props a `AdminProvider`. Así un solo valor decide todo y puede cambiar sin recompilar.
//
// La decisión la toma `resolveDataSource()` (src/lib/data-source.ts), única para todo el sitio: falla cerrado, así que en
// la nube (K_SERVICE o FIREBASE_CONFIG) siempre es "firebase" y el login simulado solo existe con "demo".
import type { DataSource } from "@/lib/data-source";

export type { DataSource };

/** ¿Existe el login simulado con esta fuente de datos? Solo en demo (D-028 y D-031). */
export function isDemoLoginAvailable(source: DataSource): boolean {
  return source === "demo";
}

// Fuente activa en el navegador. La fija `AdminProvider` al renderizar; sirve para los textos de los avisos
// (que se arman en manejadores de eventos, fuera del árbol de React).
let activeSource: DataSource = "demo";

export function setActiveDataSource(source: DataSource): void {
  activeSource = source;
}

export function getActiveDataSource(): DataSource {
  return activeSource;
}

/**
 * Quita de un texto de aviso las marcas de la demostración ("(simulado)", "se pierden al recargar"…)
 * cuando el admin trabaja contra Firebase. Con "demo" devuelve el texto tal cual.
 */
export function sim(text: string): string {
  if (activeSource !== "firebase") return text;
  return text
    .replace(/ \(simulado\)/g, "")
    .replace(/\(simulado\) ?/g, "")
    .replace(/ Nada se guardó fuera de esta pestaña\./g, "")
    .replace(/ Se pierden al recargar la página\./g, "")
    .replace(/ Es una simulación: nada se guarda al recargar\./g, "");
}
