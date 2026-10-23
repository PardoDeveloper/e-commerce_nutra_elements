import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderStatusView } from "@/components/checkout/OrderStatusView";
import { PrototypeBanner } from "@/components/checkout/PrototypeBanner";
import styles from "@/components/checkout/checkout.module.css";
import { Container } from "@/components/Container";
import { resolvePaymentsMode } from "@/lib/checkout/payments-mode";
import { resolveDataSource } from "@/lib/data-source";

// Confirmación del pedido: dinámica y sin indexar. Necesita el token: de ?t= o, al volver de Flow,
// del almacenamiento del navegador (A2, D-036).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  return (
    <>
      <PrototypeBanner mode={resolvePaymentsMode(resolveDataSource())} />
      <Container size="narrow" className={styles.page}>
        <h1 className={styles.title}>Tu pedido</h1>
        <Suspense fallback={<p role="status">Cargando tu pedido…</p>}>
          <OrderStatusView orderNumber={numero.toUpperCase()} dataSource={resolveDataSource()} />
        </Suspense>
      </Container>
    </>
  );
}
