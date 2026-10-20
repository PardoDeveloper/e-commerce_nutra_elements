import styles from "./checkout.module.css";

/** Aviso permanente de las pantallas de compra mientras los pagos son simulados (D-028). */
export function PrototypeBanner() {
  return (
    <div className={styles.banner} role="note">
      Prototipo: los pagos son simulados. No se realiza ningún cobro real.
    </div>
  );
}
