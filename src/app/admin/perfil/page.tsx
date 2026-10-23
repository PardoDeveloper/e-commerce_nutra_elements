import type { Metadata } from "next";
import { ProfileView } from "@/components/admin/ProfileView";

export const metadata: Metadata = { title: "Mi perfil" };

export default function AdminProfilePage() {
  return <ProfileView />;
}
