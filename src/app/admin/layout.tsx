import type { Metadata } from "next";
import { AdminProvider } from "@/components/admin/AdminProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { toAdminProduct } from "@/lib/admin/seed";
import { getBaseCatalog, getProducts, getPublicSettings } from "@/lib/data";
import { resolveDataSource } from "@/lib/data-source";
import { applyStoredToAdmin, isPersistenceEnabled, readStoreSync } from "@/lib/demo-store";
import "./admin-global.css";

// Todo el admin es dinámico y nunca se indexa (contrato SEO: /admin/ bloqueado en robots.txt).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Panel de administración", template: "%s | Admin Nutra Elements" },
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Fuente de datos (la misma resolveDataSource() de la capa de datos pública; en la nube siempre es firebase). Con "firebase" el admin lee y escribe
  // en Firestore/Storage/Functions desde el navegador, con la sesión real: no hay semilla ni login simulado (D-031).
  const dataSource = resolveDataSource();
  if (dataSource === "firebase") {
    return (
      <AdminProvider dataSource="firebase" seed={null}>
        <AdminShell>{children}</AdminShell>
      </AdminProvider>
    );
  }
  // Modo demostración (D-028): el catálogo público siembra los datos del panel.
  // Con la persistencia local (D-030) el estado inicial de productos es el catálogo base más lo guardado
  // en el servidor (incluye borradores y eliminados); los pedidos de demostración salen del catálogo base.
  const persistent = isPersistenceEnabled();
  const [products, settings] = await Promise.all([persistent ? Promise.resolve(getBaseCatalog()) : getProducts(), getPublicSettings()]);
  const stored = persistent ? readStoreSync().data.products : {};
  const persistence = persistent
    ? { products: products.map(toAdminProduct).map((p) => (stored[p.sku] ? applyStoredToAdmin(p, stored[p.sku]!) : p)) }
    : undefined;
  return (
    <AdminProvider
      dataSource="demo"
      seed={{
        products,
        settings: {
          shippingFee: settings.shippingFee,
          freeShippingThreshold: settings.freeShippingThreshold,
          pickup: settings.pickup,
          maxQtyPerItem: settings.maxQtyPerItem,
        },
        communes: settings.communes,
        persistence,
      }}
    >
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
