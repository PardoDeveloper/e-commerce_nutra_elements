import type { Metadata } from "next";
import { CartView } from "@/components/checkout/CartView";
import { PrototypeBanner } from "@/components/checkout/PrototypeBanner";
import styles from "@/components/checkout/checkout.module.css";
import { Container } from "@/components/Container";
import { loadCheckoutData } from "@/lib/checkout/server";

// Carrito: dinámico y sin indexar (D-022).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const { catalog, settings } = await loadCheckoutData();
  return (
    <>
      <PrototypeBanner />
      <Container className={styles.page}>
        <h1 className={styles.title}>Carrito</h1>
        <CartView
          catalog={catalog}
          settings={{ shippingFee: settings.shippingFee, freeShippingThreshold: settings.freeShippingThreshold }}
        />
      </Container>
    </>
  );
}
