import type { PaymentsMode } from "@/lib/checkout/payments-mode";
import styles from "./checkout.module.css";

const TEXT: Record<Exclude<PaymentsMode, "live">, string> = {
  simulated: "Prototipo: los pagos son simulados. No se realiza ningún cobro real.",
  sandbox: "Ambiente de pruebas: Flow en modo sandbox. No se realiza ningún cobro real.",
};

/** Aviso de las pantallas de compra mientras los pagos no son reales (D-028, D-036). En producción no se muestra. */
export function PrototypeBanner({ mode }: { mode: PaymentsMode }) {
  if (mode === "live") return null;
  return (
    <div className={styles.banner} role="note">
      {TEXT[mode]}
    </div>
  );
}
