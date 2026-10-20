// Modo demostración del admin (D-028).
//
// El modo demo depende del entorno, no de una constante: `isDemoMode()` es `resolveDataSource() === "demo"`
// (src/lib/data-source.ts). En la nube (K_SERVICE o FIREBASE_CONFIG) siempre es false, sin importar DATA_SOURCE, y
// entonces NO existen el login simulado, la semilla demo ni los banners de demostración. Solo se evalúa en el
// servidor (el layout del admin); el navegador recibe la fuente por props.
export { isDemoMode } from "@/lib/data-source";

/** Clave de sessionStorage con la sesión simulada. */
export const DEMO_SESSION_KEY = "ne.admin.demo-session";

export const DEMO_BANNER_TEXT = "Modo demostración: los cambios no se guardan";

/** Banner cuando la persistencia local de productos está activa (D-030). */
export const DEMO_BANNER_PERSISTENT_TEXT = "Modo demostración: los cambios de productos se guardan solo en este PC";
