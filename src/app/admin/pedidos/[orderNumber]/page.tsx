import type { Metadata } from "next";
import { OrderDetail } from "@/components/admin/OrderDetail";

export const metadata: Metadata = { title: "Detalle del pedido" };

export default async function AdminOrderPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return <OrderDetail orderNumber={decodeURIComponent(orderNumber)} />;
}
