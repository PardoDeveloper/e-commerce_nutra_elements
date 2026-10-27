import type { Metadata } from "next";
import { SaleDetail } from "@/components/admin/SaleDetail";

export const metadata: Metadata = { title: "Detalle de la venta" };

export default async function AdminSalePage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return <SaleDetail orderNumber={decodeURIComponent(orderNumber)} />;
}
