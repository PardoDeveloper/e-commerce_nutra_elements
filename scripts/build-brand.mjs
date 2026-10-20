// Genera los recursos de marca recortados y optimizados desde los originales de img/.
// Uso: npm run brand:build. No modifica los originales.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT = "public/brand";
await mkdir(OUT, { recursive: true });

// Recorta el margen blanco (tolerancia para el suavizado de bordes).
async function trimmed(src) {
  return sharp(src).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 12 });
}

const icon = await trimmed("img/elements.png");
await icon.clone().resize({ height: 160 }).png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/logo-icon.png`);
await icon.clone().resize({ height: 320 }).webp({ quality: 90 }).toFile(`${OUT}/logo-icon.webp`);

const text = await trimmed("img/elements_2.png");
await text.clone().resize({ height: 120 }).png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/logo-text.png`);

// Ícono cuadrado con margen para favicon y apple-touch-icon.
const iconBuf = await icon.clone().resize({ width: 400, height: 400, fit: "inside" }).png().toBuffer();
for (const [file, size] of [["src/app/icon.png", 512], ["src/app/apple-icon.png", 180]]) {
  const inner = Math.round(size * 0.78);
  const pad = Math.round((size - inner) / 2);
  const small = await sharp(iconBuf).resize({ width: inner, height: inner, fit: "inside" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: small, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  void pad;
}
for (const f of ["logo-icon.png", "logo-icon.webp", "logo-text.png"]) {
  const m = await sharp(`${OUT}/${f}`).metadata();
  console.log(f, m.width + "x" + m.height);
}
