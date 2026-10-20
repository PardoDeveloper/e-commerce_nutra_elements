// Compresión de imágenes de producto en el navegador: WebP, lado largo <= 1600 px y <= 2 MiB.
// La parte de cálculo es pura (con tests); `compressToWebp` usa canvas y solo corre en el cliente.

export const MAX_SIDE = 1600;
export const MAX_BYTES = 2 * 1024 * 1024;
/** Tope del archivo original antes de comprimir (protege la memoria del navegador). */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 8;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Reduce proporcionalmente para que el lado largo no pase de `max`; nunca agranda. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type FileCheck = { ok: true } | { ok: false; message: string };

export function validateImageFile(file: { type: string; size: number }, currentCount: number): FileCheck {
  if (currentCount >= MAX_IMAGES_PER_PRODUCT) return { ok: false, message: `Máximo ${MAX_IMAGES_PER_PRODUCT} imágenes por producto.` };
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: "Formato no admitido. Usa JPG, PNG, WebP o GIF." };
  if (file.size <= 0) return { ok: false, message: "El archivo está vacío." };
  if (file.size > MAX_INPUT_BYTES) return { ok: false, message: "El archivo supera los 20 MiB." };
  return { ok: true };
}

/** Pasos de calidad (de mejor a peor) que se prueban antes de reducir las dimensiones. */
export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45] as const;
/** Factor con el que se reducen las dimensiones si ni la calidad mínima alcanza. */
export const SHRINK_FACTOR = 0.85;
const MIN_SIDE_ALLOWED = 200;

/**
 * Algoritmo de ajuste: dado un `encode(width, height, quality)` que devuelve el peso en bytes,
 * busca la mejor combinación que quede bajo `maxBytes`. Separado del canvas para poder probarlo.
 */
export async function fitToBudget(
  size: { width: number; height: number },
  encode: (width: number, height: number, quality: number) => Promise<number>,
  maxBytes: number = MAX_BYTES,
): Promise<{ width: number; height: number; quality: number; bytes: number } | null> {
  let { width, height } = size;
  while (Math.max(width, height) >= MIN_SIDE_ALLOWED) {
    for (const quality of QUALITY_STEPS) {
      const bytes = await encode(width, height, quality);
      if (bytes <= maxBytes) return { width, height, quality, bytes };
    }
    width = Math.round(width * SHRINK_FACTOR);
    height = Math.round(height * SHRINK_FACTOR);
  }
  return null;
}

export interface CompressedImage {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes: number;
}

/** Solo cliente. Convierte a WebP con canvas respetando los límites. */
export async function compressToWebp(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const start = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    const blobCache = new Map<string, Blob>();

    const encodeBlob = (width: number, height: number, quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("El navegador no permite procesar imágenes."));
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.type !== "image/webp") reject(new Error("Tu navegador no puede generar WebP."));
            else resolve(blob);
          },
          "image/webp",
          quality,
        );
      });

    const best = await fitToBudget(start, async (w, h, q) => {
      const blob = await encodeBlob(w, h, q);
      blobCache.set(`${w}x${h}@${q}`, blob);
      return blob.size;
    });
    if (!best) throw new Error("No se pudo reducir la imagen a menos de 2 MiB.");
    const blob = blobCache.get(`${best.width}x${best.height}@${best.quality}`);
    if (!blob) throw new Error("Error al comprimir la imagen.");
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      width: best.width,
      height: best.height,
      bytes: blob.size,
      originalBytes: file.size,
    };
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
