// Configuración y reglas de la persistencia local del prototipo (D-030). Sin acceso a disco.

/**
 * La persistencia solo se activa con DEMO_PERSISTENCE="true" y NUNCA en un entorno de nube.
 * `K_SERVICE` (Cloud Run / App Hosting) y `FIREBASE_CONFIG` (Firebase) existen en esos entornos y
 * la desactivan aunque alguien deje la variable puesta. Con NODE_ENV=production sí se permite:
 * `npm run demo:start` usa `next start` en el PC de Carlos.
 */
export function isPersistenceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_PERSISTENCE !== "true") return false;
  if (env.K_SERVICE || env.FIREBASE_CONFIG) return false;
  return true;
}

export const SKU_RE = /^[A-Za-z0-9_-]{1,32}$/;
/** Nombre de archivo generado por el servidor: 16 hex + extensión. */
export const IMAGE_FILE_RE = /^[a-f0-9]{16}\.(webp|jpg|png)$/;
/** Ruta tipo Storage de una imagen guardada. */
export const IMAGE_PATH_RE = /^products\/([A-Za-z0-9_-]{1,32})\/([a-f0-9]{16}\.(?:webp|jpg|png))$/;

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Tope de archivos por SKU en disco (evita llenar el disco con subidas repetidas). */
export const MAX_IMAGE_FILES_PER_SKU = 60;
export const MAX_PRODUCTS_PER_REQUEST = 2000;

export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
};

/** URL pública (ruta propia de la app) de una imagen guardada. */
export function demoImageUrl(sku: string, file: string): string {
  return `/api/demo-images/${sku}/${file}`;
}

/** URL pública a partir de la ruta tipo Storage, o null si no tiene el formato esperado. */
export function demoImageUrlFromPath(path: string): string | null {
  const m = IMAGE_PATH_RE.exec(path);
  return m ? demoImageUrl(m[1]!, m[2]!) : null;
}

/** Cabecera obligatoria en las escrituras: una página de otro sitio no puede enviarla sin preflight. */
export const WRITE_HEADER = "x-demo-admin";
