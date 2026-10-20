import type { Metadata } from "next";
import { Suspense } from "react";
import { FlowSimulatedView } from "@/components/checkout/FlowSimulatedView";
import { PrototypeBanner } from "@/components/checkout/PrototypeBanner";
import styles from "@/components/checkout/checkout.module.css";
import { Container } from "@/components/Container";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pago con Flow (simulado)",
  robots: { index: false, follow: false },
};

export default function FlowSimulatedPage() {
  return (
    <>
      <PrototypeBanner />
      <Container size="narrow" className={styles.page}>
        <Suspense fallback={<p role="status">Cargando…</p>}>
          <FlowSimulatedView />
        </Suspense>
      </Container>
    </>
  );
}
