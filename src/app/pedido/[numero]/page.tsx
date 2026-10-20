import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderStatusView } from "@/components/checkout/OrderStatusView";
import { PrototypeBanner } from "@/components/checkout/PrototypeBanner";
import styles from "@/components/checkout/checkout.module.css";
import { Container } from "@/components/Container";

// Confirmación del pedido: dinámica y sin indexar. Necesita el token (?t=) además del número.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  return (
    <>
      <PrototypeBanner />
      <Container size="narrow" className={styles.page}>
        <h1 className={styles.title}>Tu pedido</h1>
        <Suspense fallback={<p role="status">Cargando tu pedido…</p>}>
          <OrderStatusView orderNumber={numero.toUpperCase()} />
        </Suspense>
      </Container>
    </>
  );
}
