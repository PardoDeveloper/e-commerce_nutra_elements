// ¿Cómo se paga en este ambiente? Decide los avisos de las pantallas de compra y del admin.
//  - "simulated": modo demo, sin Flow (pantalla de pago simulada, D-028).
//  - "sandbox":   Firebase con Flow sandbox (staging): pagos de prueba, sin cobro real.
//  - "live":      Firebase con Flow de producción: cobros reales, sin avisos de prueba.
// `NEXT_PUBLIC_FLOW_ENV` (apphosting.yaml) debe coincidir con `APP_ENV`/`FLOW_API_BASE` de Functions.
// Si falta, NO se afirma que el pago sea de prueba: decir "no se cobra" cuando sí se cobra sería peor.
import type { DataSource } from "@/lib/data-source";

export type PaymentsMode = "simulated" | "sandbox" | "live";

export function resolvePaymentsMode(source: DataSource, flowEnv: string | undefined = process.env.NEXT_PUBLIC_FLOW_ENV): PaymentsMode {
  if (source === "demo") return "simulated";
  return flowEnv?.trim().toLowerCase() === "sandbox" ? "sandbox" : "live";
}
