import { orderStatusLabel } from "@/lib/admin/labels";
import type { AdminOrder } from "@/lib/admin/types";
import ui from "./admin.module.css";

/** Clave de filtro: el estado logístico si está pagado; si no, el de pago. */
export function orderFilterKey(o: Pick<AdminOrder, "paymentStatus" | "fulfillmentStatus">): string {
  return o.paymentStatus === "paid" && o.fulfillmentStatus ? o.fulfillmentStatus : o.paymentStatus;
}

function tone(o: Pick<AdminOrder, "paymentStatus" | "fulfillmentStatus">): string {
  switch (o.paymentStatus) {
    case "paid":
      return (o.fulfillmentStatus === "delivered" ? ui.badgeOk : ui.badgeNavy) ?? "";
    case "pending_payment":
    case "payment_review":
      return ui.badgeWarn ?? "";
    case "cancelled":
    case "expired":
    case "refunded":
      return ui.badgeDanger ?? "";
    default:
      return "";
  }
}

export function OrderStatusBadge({ order }: { order: Pick<AdminOrder, "paymentStatus" | "fulfillmentStatus"> }) {
  return <span className={`${ui.badge} ${tone(order)}`}>{orderStatusLabel(order)}</span>;
}
