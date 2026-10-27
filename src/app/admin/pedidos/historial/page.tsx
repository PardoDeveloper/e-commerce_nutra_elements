import type { Metadata } from "next";
import { OrderHistoryView } from "@/components/admin/OrderHistoryView";

export const metadata: Metadata = { title: "Historial de pedidos" };

export default function AdminOrderHistoryPage() {
  return <OrderHistoryView />;
}
