// Arranca la tienda en modo demostración con persistencia local de productos (D-030).
// Uso: npm run build && npm run demo:start   (puerto 3000; otro: PORT=3100 npm run demo:start)
// Fija las variables aquí para que funcione igual en Windows, sin dependencias nuevas.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const port = process.env.PORT ?? "3000";
const env = {
  ...process.env,
  DEMO_PERSISTENCE: "true",
  DEMO_FREE_SHIPPING_THRESHOLD: "30000",
};

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

console.log(`[demo] Persistencia local de productos ACTIVA. Tienda: http://localhost:${port}  Admin: http://localhost:${port}/admin`);
const child = spawn(process.execPath, [nextBin, "start", "-p", port], { env, stdio: "inherit" });

// Las páginas generadas en el build no conocen lo guardado en sesiones anteriores: al arrancar se revalidan.
async function syncWhenReady() {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const response = await fetch(`http://localhost:${port}/api/demo-admin/sync`, { method: "POST", headers: { "x-demo-admin": "1" } });
      if (response.ok) return console.log("[demo] Catálogo sincronizado con los cambios guardados.");
      if (response.status === 404) return;
    } catch {
      // El servidor aún no responde.
    }
  }
}
void syncWhenReady();

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
