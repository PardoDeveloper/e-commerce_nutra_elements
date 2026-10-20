import type { Metadata } from "next";
import { ProductEditor } from "@/components/admin/ProductEditor";

export const metadata: Metadata = { title: "Editar producto" };

export default async function AdminProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return <ProductEditor sku={decodeURIComponent(sku)} />;
}
