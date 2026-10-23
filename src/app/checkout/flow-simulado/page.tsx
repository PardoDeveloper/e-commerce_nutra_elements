import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlowSimulatedView } from "@/components/checkout/FlowSimulatedView";
import { PrototypeBanner } from "@/components/checkout/PrototypeBanner";
import styles from "@/components/checkout/checkout.module.css";
import { Container } from "@/components/Container";
import { resolvePaymentsMode } from "@/lib/checkout/payments-mode";
import { resolveDataSource } from "@/lib/data-source";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pago con Flow (simulado)",
  robots: { index: false, follow: false },
};

export default function FlowSimulatedPage() {
  // Solo existe en el modo demo: con Firebase el pago es en Flow de verdad.
  if (resolveDataSource() !== "demo") notFound();
  return (
    <>
      <PrototypeBanner mode={resolvePaymentsMode(resolveDataSource())} />
      <Container size="narrow" className={styles.page}>
        <Suspense fallback={<p role="status">Cargando…</p>}>
          <FlowSimulatedView />
        </Suspense>
      </Container>
    </>
  );
}
