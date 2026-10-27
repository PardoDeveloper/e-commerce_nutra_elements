"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { FULFILLMENT_LABELS, METHOD_LABELS, PAYMENT_LABELS } from "@/lib/admin/labels";
import { countByClosedStatus, isActiveOrder } from "@/lib/admin/order-history";
import { formatClp } from "@/lib/format";
import { useAdminState, useDataSource } from "./AdminProvider";
import { OrderStatusBadge, orderFilterKey } from "./OrderStatusBadge";
import { formatDateTime } from "./format";
import ui from "./admin.module.css";
import styles from "./orders.module.css";

const PAGE = 25;

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Todos los estados" },
  { value: "pending_payment", label: PAYMENT_LABELS.pending_payment },
  { value: "preparing", label: FULFILLMENT_LABELS.preparing },
  { value: "ready_for_pickup", label: FULFILLMENT_LABELS.ready_for_pickup },
  { value: "on_route", label: FULFILLMENT_LABELS.on_route },
  { value: "payment_review", label: PAYMENT_LABELS.payment_review },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function OrdersView() {
  const { orders: allOrders } = useAdminState();
  // Solo los activos: entregados, cancelados, reembolsados y expirados viven en el Historial.
  const orders = useMemo(() => allOrders.filter(isActiveOrder), [allOrders]);
  const closedCount = useMemo(() => Object.values(countByClosedStatus(allOrders)).reduce((a, b) => a + b, 0), [allOrders]);
  const demo = useDataSource() === "demo";
  const id = useId();
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return orders
      .filter((o) => {
        if (status !== "all" && orderFilterKey(o) !== status) return false;
        if (!q) return true;
        const haystack = normalize(`${o.orderNumber} ${o.customer.firstName} ${o.customer.lastName} ${o.customer.email}`);
        return haystack.includes(q);
      })
      .sort((a, b) => b.number - a.number);
  }, [orders, status, query]);

  const shown = filtered.slice(0, limit);

  return (
    <div className={ui.page}>
      <div>
        <h1>Pedidos</h1>
        <p className={ui.lead}>{orders.length} {orders.length === 1 ? "pedido activo" : "pedidos activos"}{demo ? " de demostración" : ""}: pendientes de pago, en revisión, en preparación, listos para retirar o en ruta.</p>
      </div>

      <form className={styles.toolbar} role="search" aria-label="Filtrar pedidos" onSubmit={(e) => e.preventDefault()}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-q`}>
            Buscar por número, cliente o correo
          </label>
          <input
            id={`${id}-q`}
            type="search"
            className={ui.input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-status`}>
            Estado
          </label>
          <select
            id={`${id}-status`}
            className={ui.select}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setLimit(PAGE);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <Link href="/admin/pedidos/historial" className={styles.historyButton}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
            <path d="M3.5 4.5V9H8" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          Historial de pedidos
          <span className={styles.historyCount}>{closedCount}</span>
        </Link>
      </form>

      <p className={ui.help} role="status">
        {filtered.length} {filtered.length === 1 ? "pedido" : "pedidos"}
      </p>

      {filtered.length === 0 ? (
        <p className={ui.empty}>{orders.length === 0 ? "No hay pedidos activos. Revisa el Historial de pedidos para ver los cerrados." : "No hay pedidos con ese estado o búsqueda."}</p>
      ) : (
        <>
          <div className={ui.tableWrap} role="region" aria-label="Tabla de pedidos" tabIndex={0}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Pago</th>
                  <th scope="col" className={ui.num}>
                    Total
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.orderNumber}>
                    <td>
                      <Link className={ui.linkCell} href={`/admin/pedidos/${encodeURIComponent(o.orderNumber)}`}>
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className={ui.nowrap}>{formatDateTime(o.createdAt)}</td>
                    <td>
                      {o.customer.firstName} {o.customer.lastName}
                    </td>
                    <td>{METHOD_LABELS[o.paymentMethod]}</td>
                    <td className={ui.num}>{formatClp(o.total)}</td>
                    <td>
                      <OrderStatusBadge order={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > shown.length ? (
            <div className={ui.actions}>
              <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setLimit(limit + PAGE)}>
                Mostrar más ({filtered.length - shown.length} restantes)
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
