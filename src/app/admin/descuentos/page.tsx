import type { Metadata } from "next";
import { DiscountsView } from "@/components/admin/DiscountsView";

export const metadata: Metadata = { title: "Descuentos" };

export default function AdminDiscountsPage() {
  return <DiscountsView />;
}
