import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { PrototypeBanner } from "@/components/checkout/PrototypeBanner";
import styles from "@/components/checkout/checkout.module.css";
import { Container } from "@/components/Container";
import { loadCheckoutData } from "@/lib/checkout/server";

// Checkout: dinámico y sin indexar (D-022).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const { catalog, settings, transferAvailable } = await loadCheckoutData();
  return (
    <>
      <PrototypeBanner />
      <Container className={styles.page}>
        <h1 className={styles.title}>Finalizar compra</h1>
        <CheckoutForm catalog={catalog} settings={settings} transferAvailable={transferAvailable} />
      </Container>
    </>
  );
}
