"use client";

// Detalle de una venta: productos, cantidades, precios, descuentos, comisión por línea, totales, reembolso,
// cliente, entrega y pago. La gestión del pedido (estados, reembolsos) sigue en /admin/pedidos/[n].
import Link from "next/link";
import { orderCommission, refundedCommission } from "@/lib/admin/commission";
import { FULFILLMENT_LABELS, METHOD_LABELS } from "@/lib/admin/labels";
import { isSale, netCommission, netTotal, units } from "@/lib/admin/sales";
import type { OrderItem } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { useAdminState } from "./AdminProvider";
import { formatDateTime } from "./format";
import ui from "./admin.module.css";
import styles from "./sales.module.css";

function discountLabel(it: OrderItem): string {
  if (!it.discount) return "—";
  return it.discount.type === "percent" ? `${it.discount.value} %` : formatClp(it.discount.value);
}

export function SaleDetail({ orderNumber }: { orderNumber: string }) {
  const { orders } = useAdminState();
  const order = orders.find((o) => o.orderNumber === orderNumber);

  if (!order || !isSale(order)) {
    return (
      <div className={ui.page}>
        <Link href="/admin/ventas" className={styles.back}>
          ← Ventas
        </Link>
        <p className={ui.empty}>
          {order ? `El pedido ${orderNumber} aún no es una venta (no está pagado).` : `No encontramos la venta ${orderNumber}.`}{" "}
          {order ? <Link href={`/admin/pedidos/${encodeURIComponent(orderNumber)}`}>Ver el pedido</Link> : null}
        </p>
      </div>
    );
  }

  const refunded = order.paymentStatus === "refunded" && order.refund ? order.refund : null;
  const gross = orderCommission(order);
  const reversed = refunded ? refundedCommission(gross, refunded.amount, order.total) : 0;
  const listTotal = order.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const discounts = listTotal - order.subtotal;

  return (
    <div className={ui.page}>
      <Link href="/admin/ventas" className={styles.back}>
        ← Ventas
      </Link>

      <div className={ui.pageHeader}>
        <div>
          <h1>Venta {order.orderNumber}</h1>
          <p className={ui.lead}>
            Pagada el {formatDateTime(order.paidAt)} con {METHOD_LABELS[order.paymentMethod]}.{" "}
            {refunded ? (
              <span className={`${ui.badge} ${ui.badgeDanger}`}>Reembolsada</span>
            ) : (
              <span className={`${ui.badge} ${ui.badgeOk}`}>Pagada</span>
            )}
          </p>
        </div>
        <div className={ui.actions}>
          <Link href={`/admin/pedidos/${encodeURIComponent(order.orderNumber)}`} className={`${ui.btn} ${ui.btnOutline}`}>
            Gestionar pedido
          </Link>
        </div>
      </div>

      <ul className={`${ui.cards} ${styles.fourCards}`} aria-label="Resumen de la venta">
        <li className={ui.card}>
          <p className={ui.cardLabel}>{refunded ? "Total neto" : "Total pagado"}</p>
          <p className={ui.cardValue}>{formatClp(netTotal(order))}</p>
          <p className={ui.cardHint}>{refunded ? `Pagó ${formatClp(order.total)}, reembolso ${formatClp(refunded.amount)}` : order.shipping > 0 ? `Incluye envío ${formatClp(order.shipping)}` : "Sin costo de envío"}</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Tu comisión</p>
          <p className={`${ui.cardValue} ${styles.accent}`}>{formatClp(netCommission(order))}</p>
          <p className={ui.cardHint}>{refunded && reversed > 0 ? `${formatClp(gross)} menos ${formatClp(reversed)} por el reembolso` : "Sobre la mercadería, sin envío"}</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Unidades</p>
          <p className={ui.cardValue}>{units(order)}</p>
          <p className={ui.cardHint}>{order.items.length === 1 ? "1 producto" : `${order.items.length} productos`}</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Descuentos</p>
          <p className={ui.cardValue}>{formatClp(discounts)}</p>
          <p className={ui.cardHint}>Sobre el precio de lista</p>
        </li>
      </ul>

      <section className={ui.section} aria-labelledby="sale-items">
        <h2 id="sale-items">Productos</h2>
        <div className={`${ui.tableWrap} ${styles.tableCard}`} role="region" aria-label="Productos de la venta" tabIndex={0}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col" className={ui.num}>
                  Precio lista
                </th>
                <th scope="col" className={ui.num}>
                  Descuento
                </th>
                <th scope="col" className={ui.num}>
                  Precio unitario
                </th>
                <th scope="col" className={ui.num}>
                  Cantidad
                </th>
                <th scope="col" className={ui.num}>
                  Subtotal
                </th>
                <th scope="col" className={ui.num}>
                  Comisión c/u
                </th>
                <th scope="col" className={ui.num}>
                  Comisión
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.sku}>
                  <td>
                    <Link href={`/admin/productos/${encodeURIComponent(it.sku)}`}>{it.name}</Link>
                    <br />
                    <span className={ui.help}>SKU {it.sku}</span>
                  </td>
                  <td className={ui.num}>{formatClp(it.unitPrice)}</td>
                  <td className={ui.num}>{discountLabel(it)}</td>
                  <td className={ui.num}>{formatClp(it.unitFinalPrice)}</td>
                  <td className={ui.num}>{it.qty}</td>
                  <td className={ui.num}>{formatClp(it.lineTotal)}</td>
                  <td className={ui.num}>{it.commissionPerUnit === null ? <span className={ui.help}>—</span> : formatClp(it.commissionPerUnit)}</td>
                  <td className={ui.num}>{formatClp(it.commission)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5} className={ui.num}>
                  Mercadería
                </th>
                <td className={ui.num}>{formatClp(order.subtotal)}</td>
                <th scope="row" className={ui.num}>
                  Comisión
                </th>
                <td className={ui.num}>{formatClp(gross)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={5} className={ui.num}>
                  Envío{order.freeShippingApplied ? " (gratis)" : ""}
                </th>
                <td className={ui.num}>{formatClp(order.shipping)}</td>
                <td colSpan={2} />
              </tr>
              {refunded ? (
                <tr>
                  <th scope="row" colSpan={5} className={ui.num}>
                    Reembolso
                  </th>
                  <td className={ui.num}>−{formatClp(refunded.amount)}</td>
                  <th scope="row" className={ui.num}>
                    Revertida
                  </th>
                  <td className={ui.num}>−{formatClp(reversed)}</td>
                </tr>
              ) : null}
              <tr className={styles.grand}>
                <th scope="row" colSpan={5} className={ui.num}>
                  Total
                </th>
                <td className={ui.num}>{formatClp(netTotal(order))}</td>
                <th scope="row" className={ui.num}>
                  Tu comisión
                </th>
                <td className={ui.num}>{formatClp(netCommission(order))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className={styles.infoGrid}>
        <section className={`${ui.card} ${ui.section}`} aria-labelledby="sale-customer">
          <h2 id="sale-customer">Cliente</h2>
          <dl className={styles.dl}>
            <dt>Nombre</dt>
            <dd>
              {order.customer.firstName} {order.customer.lastName}
            </dd>
            <dt>Correo</dt>
            <dd>
              <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a>
            </dd>
            <dt>Teléfono</dt>
            <dd>{order.customer.phone || "—"}</dd>
            {order.customer.rut ? (
              <>
                <dt>RUT</dt>
                <dd>{order.customer.rut}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className={`${ui.card} ${ui.section}`} aria-labelledby="sale-delivery">
          <h2 id="sale-delivery">Entrega</h2>
          <dl className={styles.dl}>
            <dt>Tipo</dt>
            <dd>{order.delivery.type === "shipping" ? "Despacho" : "Retiro en tienda"}</dd>
            {order.delivery.type === "shipping" ? (
              <>
                <dt>Dirección</dt>
                <dd>
                  {order.delivery.address}, {order.delivery.communeName}
                </dd>
                {order.delivery.notes ? (
                  <>
                    <dt>Notas</dt>
                    <dd>{order.delivery.notes}</dd>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <dt>Tienda</dt>
                <dd>{order.delivery.storeAddress}</dd>
              </>
            )}
            <dt>Estado</dt>
            <dd>{order.fulfillmentStatus ? FULFILLMENT_LABELS[order.fulfillmentStatus] : "—"}</dd>
          </dl>
        </section>

        <section className={`${ui.card} ${ui.section}`} aria-labelledby="sale-payment">
          <h2 id="sale-payment">Pago</h2>
          <dl className={styles.dl}>
            <dt>Medio</dt>
            <dd>{METHOD_LABELS[order.paymentMethod]}</dd>
            <dt>Pedido creado</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
            <dt>Pagado</dt>
            <dd>{formatDateTime(order.paidAt)}</dd>
            {refunded ? (
              <>
                <dt>Reembolso</dt>
                <dd>
                  {formatClp(refunded.amount)} el {formatDateTime(refunded.refundedAt)}
                  {refunded.note ? ` · ${refunded.note}` : ""}
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}
