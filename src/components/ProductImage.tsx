import type { CategoryId } from "@/lib/data/types";
import styles from "./ProductImage.module.css";

interface ProductImageProps {
  /** Nombre para mostrar del producto (se dibuja en la etiqueta del frasco). */
  name: string;
  categoryId?: CategoryId | null;
  /** Texto alternativo. Por defecto describe el marcador. */
  alt?: string;
  className?: string;
  /**
   * Foto real (D-030). Si existe, se muestra en lugar del marcador SVG, con su propio texto alternativo.
   * Se usa `<img>` y no `next/image`: las fotos ya vienen comprimidas (WebP, máx. 1600 px) desde el admin,
   * están en una ruta dinámica fuera de `public/` y el optimizador de imágenes solo agregaría un paso y
   * una caché más que podrían quedar desactualizadas. Con Storage se puede pasar a `next/image`.
   */
  image?: { url: string; alt: string } | null;
}

const CATEGORY_CLASS: Record<string, string> = {
  vitaminas: styles.vitaminas ?? "",
  magnesio: styles.magnesio ?? "",
  minerales: styles.minerales ?? "",
  "omega-3": styles.omega3 ?? "",
  belleza: styles.belleza ?? "",
  bienestar: styles.bienestar ?? "",
};

/** Parte el nombre en hasta 3 líneas cortas para la etiqueta. */
function wrap(text: string, maxChars = 12, maxLines = 3): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

/**
 * Marcador de imagen de producto (SVG con los colores de la marca) mientras no
 * existan fotos reales. Cuadrado: el contenedor define el ancho.
 */
export function ProductImage({ name, categoryId, alt, className, image }: ProductImageProps) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image.url} alt={image.alt} width={800} height={800} loading="lazy" decoding="async" className={`${styles.photo} ${className ?? ""}`} />
    );
  }
  const base = name.replace(/\s+(x\s+)?\d+\s*cápsulas$/i, "").trim();
  const pack = /(\d+)\s*cápsulas$/i.exec(name)?.[1];
  const lines = wrap(base);
  const startY = 232 - ((lines.length - 1) * 19) / 2;
  const categoryClass = CATEGORY_CLASS[categoryId ?? ""] ?? "";

  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label={alt ?? `Imagen ilustrativa de ${name}`}
      className={`${styles.svg} ${categoryClass} ${className ?? ""}`}
      focusable="false"
    >
      <rect width="400" height="400" className={styles.bg} />
      <circle cx="330" cy="80" r="90" className={styles.glow} />
      <circle cx="60" cy="350" r="70" className={styles.glow} />
      {/* Frasco */}
      <rect x="140" y="38" width="120" height="44" rx="10" className={styles.cap} />
      <path d="M150 82h100v22c0 8 18 18 18 40v176c0 14-10 24-24 24H156c-14 0-24-10-24-24V144c0-22 18-32 18-40z" className={styles.bottle} />
      {/* Etiqueta */}
      <rect x="146" y="150" width="108" height="170" rx="10" className={styles.label} />
      <g aria-hidden="true" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif">
        <text x="200" y="176" fontSize="8" letterSpacing="1" className={styles.brand}>
          NUTRA ELEMENTS
        </text>
        <path d="M190 200c0-9 6-16 20-18 0 12-6 18-20 18z" className={styles.leaf} />
        {lines.map((line, i) => (
          <text key={`${line}-${i}`} x="200" y={startY + 18 + i * 19} fontSize="14" fontWeight="700" className={styles.name}>
            {line}
          </text>
        ))}
        {pack ? (
          <text x="200" y="304" fontSize="11" className={styles.pack}>
            {pack} cápsulas
          </text>
        ) : null}
      </g>
    </svg>
  );
}
