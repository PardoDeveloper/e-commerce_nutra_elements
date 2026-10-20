import type { Metadata } from "next";
import { MetricsView } from "@/components/admin/MetricsView";

export const metadata: Metadata = { title: "Resumen" };

export default function AdminHomePage() {
  return <MetricsView />;
}
