import type { Metadata } from "next";
import { MessagesView } from "@/components/admin/MessagesView";

export const metadata: Metadata = { title: "Mensajes" };

export default function AdminMessagesPage() {
  return <MessagesView />;
}
