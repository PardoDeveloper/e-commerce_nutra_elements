"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { OrderServiceError, getMockOrderService } from "@/lib/checkout";
import styles from "./checkout.module.css";

/** Pantalla que representa la página de pago de Flow. No cobra nada (D-028). */
export function FlowSimulatedView() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNumber = params.get("o") ?? "";
  const accessToken = params.get("t") ?? "";
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!orderNumber || !accessToken) {
    return (
      <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
        <p className={styles.noticeTitle}>No encontramos el pedido</p>
        <p>El enlace está incompleto. Revisa el número de pedido y el enlace.</p>
        <Button href="/carrito" variant="outline">
          Volver al carrito
        </Button>
      </div>
    );
  }

  async function simulate(result: "approved" | "rejected") {
    setBusy(result);
    setError(null);
    try {
      await getMockOrderService().simulateFlowResult({ orderNumber, accessToken }, result);
      const query = new URLSearchParams({ t: accessToken });
      router.push(`/pedido/${orderNumber}?${query.toString()}`);
    } catch (e) {
      setBusy(null);
      setError(e instanceof OrderServiceError ? e.message : "Ocurrió un error inesperado. Intenta de nuevo.");
    }
  }

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Redirigiendo a Flow (simulado)</h1>
      <p>
        En producción aquí verías la página de pago de Flow. Para el pedido <strong>{orderNumber}</strong>, elige el
        resultado que quieres probar:
      </p>
      {error ? (
        <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
          <p className={styles.noticeTitle}>No pudimos registrar el resultado</p>
          <p>{error}</p>
        </div>
      ) : null}
      <div className={styles.actions}>
        <Button onClick={() => simulate("approved")} disabled={busy !== null} size="lg">
          {busy === "approved" ? "Procesando…" : "Simular pago aprobado"}
        </Button>
        <Button onClick={() => simulate("rejected")} disabled={busy !== null} variant="outline" size="lg">
          {busy === "rejected" ? "Procesando…" : "Simular pago rechazado"}
        </Button>
      </div>
      <p className={styles.summaryNote}>
        <Link href={`/pedido/${orderNumber}?t=${encodeURIComponent(accessToken)}`}>Volver a mi pedido sin pagar</Link>
      </p>
    </div>
  );
}
