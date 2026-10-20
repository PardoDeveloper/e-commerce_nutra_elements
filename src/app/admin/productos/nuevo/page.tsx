import type { Metadata } from "next";
import { NewProductForm } from "@/components/admin/NewProductForm";

export const metadata: Metadata = { title: "Nuevo producto" };

export default function AdminNewProductPage() {
  return <NewProductForm />;
}
