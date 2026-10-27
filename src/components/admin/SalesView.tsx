"use client";

// Registro de ventas: pedidos pagados (y reembolsados) con filtros por período, estado, medio de pago y texto,
// totales del filtro y comisiones. Cada fila abre el detalle de la venta.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { METHOD_LABELS } from "@/lib/admin/labels";
import { computeMetrics, monthCommission, previousMonth } from "@/lib/admin/metrics";
import { DEFAULT_SALE_FILTERS, filterSales, netCommission, netTotal, salesTotals, units, type SaleFilters, type SalePeriod } from "@/lib/admin/sales";
import { formatClp } from "@/lib/format";
import { useAdminState, useAdminToday, useDataSource } from "./AdminProvider";
import { formatDateTime } from "./format";
import ui from "./admin.module.css";
import styles from "./sales.module.css";

const PAGE = 50;
/** Tope de pedidos que lee el admin con Firebase (firebase-service ORDERS_LIMIT). */
const FIREBASE_ORDERS_LIMIT = 200;

const monthName = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "UTC" });
const nameOf = (month: string) => monthName.format(new Date(`${month}-15T12:00:00Z`));

const PERIODS: { value: SalePeriod; label: string }[] = [
  { value: "month", label: "Este mes" },
  { value: "lastMonth", label: "Mes anterior" },
  { value: "30", label: "Últimos 30 días" },
  { value: "all", label: "Todo" },
  { value: "custom", label: "Rango…" },
];

export function SalesView() {
  const { orders, products, metrics: aggregates } = useAdminState();
  const demo = useDataSource() === "demo";
  const today = useAdminToday();
  const router = useRouter();
  const id = useId();
  const [filters, setFilters] = useState<SaleFilters>(DEFAULT_SALE_FILTERS);
  const [limit, setLimit] = useState(PAGE);

  const sales = useMemo(() => filterSales(orders, filters, today), [orders, filters, today]);
  const totals = useMemo(() => salesTotals(sales), [sales]);
  const shown = sales.slice(0, limit);

  // Comisión del mes calendario: con Firebase sale de los agregados diarios (no depende del tope de pedidos cargados).
  const month = today.slice(0, 7);
  const lastMonth = previousMonth(month);
  const monthly = useMemo(() => {
    const days = aggregates ? aggregates.days : computeMetrics(orders, 62, today).days;
    return { current: monthCommission(days, month), previous: monthCommission(days, lastMonth) };
  }, [aggregates, orders, today, month, lastMonth]);
  const change = monthly.previous > 0 ? Math.round(((monthly.current - monthly.previous) / monthly.previous) * 100) : null;
  const withoutRate = useMemo(() => products.filter((p) => p.active && p.deletedAt === null && p.commissionPerUnit === null).length, [products]);

  const update = (patch: Partial<SaleFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(PAGE);
  };
  const open = (orderNumber: string) => router.push(`/admin/ventas/${encodeURIComponent(orderNumber)}`);

  return (
    <div className={ui.page}>
      <div>
        <h1>Ventas</h1>
        <p className={ui.lead}>Registro de los pedidos pagados, con sus productos y comisiones.{demo ? " Datos de demostración." : ""}</p>
      </div>

      <ul className={ui.cards} aria-label="Indicadores de ventas">
        <li className={ui.card}>
          <p className={ui.cardLabel}>Comisión de {nameOf(month)}</p>
          <p className={`${ui.cardValue} ${styles.accent}`}>{formatClp(monthly.current)}</p>
          <p className={ui.cardHint}>
            {nameOf(lastMonth).replace(/^./, (c) => c.toUpperCase())}: {formatClp(monthly.previous)}
            {change !== null ? (
              <span className={change >= 0 ? styles.up : styles.down}>
                {" "}
                {change >= 0 ? "▲" : "▼"} {Math.abs(change)} %
              </span>
            ) : null}
          </p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Ventas del filtro</p>
          <p className={ui.cardValue}>{totals.count}</p>
          <p className={ui.cardHint}>{totals.units} unidades</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Ingresos netos</p>
          <p className={ui.cardValue}>{formatClp(totals.revenue)}</p>
          <p className={ui.cardHint}>Incluye envío, menos reembolsos</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Comisión del filtro</p>
          <p className={ui.cardValue}>{formatClp(totals.commission)}</p>
          <p className={ui.cardHint}>Neta de reembolsos</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Productos sin comisión</p>
          <p className={ui.cardValue}>{withoutRate}</p>
          <p className={ui.cardHint}>
            {withoutRate === 0 ? "Todos tienen comisión" : <Link href="/admin/productos?comision=sin">Completar en Productos</Link>}
          </p>
        </li>
      </ul>

      <form className={styles.filters} role="search" aria-label="Filtrar ventas" onSubmit={(e) => e.preventDefault()}>
        <div className={`${ui.field} ${styles.search}`}>
          <label className={ui.label} htmlFor={`${id}-q`}>
            Buscar
          </label>
          <input
            id={`${id}-q`}
            type="search"
            className={ui.input}
            placeholder="N.º de venta, cliente, producto o SKU"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-period`}>
            Período
          </label>
          <select id={`${id}-period`} className={ui.select} value={filters.period} onChange={(e) => update({ period: e.target.value as SalePeriod })}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {filters.period === "custom" ? (
          <>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-from`}>
                Desde
              </label>
              <input id={`${id}-from`} type="date" className={ui.input} value={filters.from} max={today} onChange={(e) => update({ from: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-to`}>
                Hasta
              </label>
              <input id={`${id}-to`} type="date" className={ui.input} value={filters.to} max={today} onChange={(e) => update({ to: e.target.value })} />
            </div>
          </>
        ) : null}
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-status`}>
            Estado
          </label>
          <select id={`${id}-status`} className={ui.select} value={filters.status} onChange={(e) => update({ status: e.target.value as SaleFilters["status"] })}>
            <option value="all">Todas</option>
            <option value="paid">Pagadas</option>
            <option value="refunded">Reembolsadas</option>
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-method`}>
            Medio de pago
          </label>
          <select id={`${id}-method`} className={ui.select} value={filters.method} onChange={(e) => update({ method: e.target.value as SaleFilters["method"] })}>
            <option value="all">Todos</option>
            <option value="flow">{METHOD_LABELS.flow}</option>
            <option value="transfer">{METHOD_LABELS.transfer}</option>
          </select>
        </div>
      </form>

      {!demo && orders.length >= FIREBASE_ORDERS_LIMIT ? (
        <p className={ui.help}>Se muestran las ventas de los últimos {FIREBASE_ORDERS_LIMIT} pedidos. La comisión del mes considera todas las ventas.</p>
      ) : null}

      {sales.length === 0 ? (
        <p className={ui.empty}>No hay ventas con estos filtros.</p>
      ) : (
        <div className={`${ui.tableWrap} ${styles.tableCard}`} role="region" aria-label="Tabla de ventas" tabIndex={0}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Venta</th>
                <th scope="col">Fecha de pago</th>
                <th scope="col">Cliente</th>
                <th scope="col">Productos</th>
                <th scope="col" className={ui.num}>
                  Total
                </th>
                <th scope="col" className={ui.num}>
                  Comisión
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const first = o.items[0];
                return (
                  <tr key={o.orderNumber} className={styles.row} onClick={() => open(o.orderNumber)}>
                    <td className={ui.nowrap}>
                      <Link className={ui.linkCell} href={`/admin/ventas/${encodeURIComponent(o.orderNumber)}`} onClick={(e) => e.stopPropagation()}>
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className={ui.nowrap}>{formatDateTime(o.paidAt)}</td>
                    <td>
                      {o.customer.firstName} {o.customer.lastName}
                      <br />
                      <span className={ui.help}>{METHOD_LABELS[o.paymentMethod]}</span>
                    </td>
                    <td>
                      {first?.name}
                      {o.items.length > 1 ? <span className={ui.help}> y {o.items.length - 1} más</span> : null}
                      <br />
                      <span className={ui.help}>{units(o) === 1 ? "1 unidad" : `${units(o)} unidades`}</span>
                    </td>
                    <td className={ui.num}>
                      {formatClp(netTotal(o))}
                      {o.paymentStatus === "refunded" ? (
                        <>
                          <br />
                          <s className={ui.help}>{formatClp(o.total)}</s>
                        </>
                      ) : null}
                    </td>
                    <td className={ui.num}>
                      <strong>{formatClp(netCommission(o))}</strong>
                      <br />
                      <span className={ui.help}>
                        {o.items.every((i) => i.commissionPerUnit === null)
                          ? "Sin comisión"
                          : o.items.length === 1 && first?.commissionPerUnit != null
                            ? `${formatClp(first.commissionPerUnit)} × ${first.qty}`
                            : "Varios productos"}
                      </span>
                    </td>
                    <td>
                      {o.paymentStatus === "refunded" ? (
                        <span className={`${ui.badge} ${ui.badgeDanger}`}>Reembolsada</span>
                      ) : (
                        <span className={`${ui.badge} ${ui.badgeOk}`}>Pagada</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>
                  {totals.count === 1 ? "1 venta" : `${totals.count} ventas`} · {totals.units} unidades
                </th>
                <td className={ui.num}>
                  <strong>{formatClp(totals.revenue)}</strong>
                </td>
                <td className={ui.num}>
                  <strong>{formatClp(totals.commission)}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {sales.length > shown.length ? (
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setLimit(limit + PAGE)}>
            Mostrar más ({sales.length - shown.length} restantes)
          </button>
        </div>
      ) : null}
    </div>
  );
}
