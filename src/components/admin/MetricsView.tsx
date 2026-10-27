"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeMetrics, RANGES, summarizeAggregates, type RangeDays } from "@/lib/admin/metrics";
import { formatClp } from "@/lib/format";
import { useAdminState, useAdminToday, useDataSource } from "./AdminProvider";
import { DailyChart } from "./DailyChart";
import { shortDay } from "./format";
import ui from "./admin.module.css";


export function MetricsView() {
  const { orders, products, metrics: aggregates } = useAdminState();
  const demo = useDataSource() === "demo";
  const today = useAdminToday();
  const [range, setRange] = useState<RangeDays>(30);
  // Con Firebase se usan los agregados reales si existen; si no, se calcula desde los pedidos cargados.
  const metrics = useMemo(
    () => (aggregates ? summarizeAggregates(aggregates, range, today) : computeMetrics(orders, range, today)),
    [aggregates, orders, range, today],
  );
  const outOfStock = useMemo(() => products.filter((p) => p.active && p.deletedAt === null && p.stock === 0), [products]);
  const pending = orders.filter((o) => o.paymentStatus === "pending_payment").length;

  return (
    <div className={ui.page}>
      <div className={ui.pageHeader}>
        <div>
          <h1>Resumen</h1>
          <p className={ui.lead}>Ventas netas de reembolsos, según la fecha de pago.{demo ? " Datos de demostración." : ""}</p>
        </div>
        <div role="group" aria-label="Rango de días">
          <ul className={ui.tabs}>
            {RANGES.map((r) => (
              <li key={r}>
                <button type="button" className={ui.tab} aria-pressed={range === r} onClick={() => setRange(r)}>
                  {r} días
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ul className={ui.cards} aria-label={`Indicadores de los últimos ${range} días`}>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Ventas netas</p>
          <p className={ui.cardValue}>{formatClp(metrics.sales)}</p>
          <p className={ui.cardHint}>Incluye envío, menos reembolsos</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Pedidos pagados</p>
          <p className={ui.cardValue}>{metrics.orders}</p>
          <p className={ui.cardHint}>{pending} con pago pendiente</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Ticket promedio</p>
          <p className={ui.cardValue}>{metrics.orders > 0 ? formatClp(metrics.averageTicket) : "—"}</p>
          <p className={ui.cardHint}>Neto / pedidos</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Reembolsos</p>
          <p className={ui.cardValue}>{metrics.refundsCount}</p>
          <p className={ui.cardHint}>Pedidos reembolsados</p>
        </li>
        <li className={ui.card}>
          <p className={ui.cardLabel}>Monto reembolsado</p>
          <p className={ui.cardValue}>{formatClp(metrics.refundedAmount)}</p>
          <p className={ui.cardHint}>Registrado a mano</p>
        </li>
      </ul>

      <section className={`${ui.card} ${ui.section}`} aria-labelledby="chart-title">
        <h2 id="chart-title">Ventas por día</h2>
        {metrics.orders === 0 ? (
          <p className={ui.empty}>No hay ventas en este rango.</p>
        ) : (
          <>
            <DailyChart days={metrics.days} />
            <details>
              <summary>Ver los datos por día en una tabla</summary>
              <div className={`${ui.scroll}`} role="region" aria-label="Datos por día" tabIndex={0}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">Día</th>
                      <th scope="col" className={ui.num}>
                        Pedidos
                      </th>
                      <th scope="col" className={ui.num}>
                        Ventas netas
                      </th>
                      <th scope="col" className={ui.num}>
                        Reembolsado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...metrics.days].reverse().map((d) => (
                      <tr key={d.date}>
                        <th scope="row">{shortDay(d.date)}</th>
                        <td className={ui.num}>{d.ordersCount}</td>
                        <td className={ui.num}>{formatClp(d.revenue)}</td>
                        <td className={ui.num}>{formatClp(d.refundedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      <div className={ui.twoCols}>
        <section className={ui.section} aria-labelledby="top-title">
          <h2 id="top-title">Top 10 más vendidos</h2>
          {metrics.top.length === 0 ? (
            <p className={ui.empty}>Aún no hay ventas en este rango.</p>
          ) : (
            <div className={ui.tableWrap} role="region" aria-label="Más vendidos" tabIndex={0}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Producto</th>
                    <th scope="col" className={ui.num}>
                      Unidades
                    </th>
                    <th scope="col" className={ui.num}>
                      Mercadería
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.top.map((p, i) => (
                    <tr key={p.sku}>
                      <td>{i + 1}</td>
                      <td>
                        <Link href={`/admin/productos/${encodeURIComponent(p.sku)}`}>{p.name}</Link>
                        <br />
                        <span className={ui.help}>SKU {p.sku}</span>
                      </td>
                      <td className={ui.num}>{p.unitsSold}</td>
                      <td className={ui.num}>{formatClp(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={ui.section} aria-labelledby="stock-title">
          <h2 id="stock-title">Productos sin stock</h2>
          {outOfStock.length === 0 ? (
            <p className={ui.empty}>Todos los productos activos tienen stock.</p>
          ) : (
            <div className={ui.tableWrap} role="region" aria-label="Productos sin stock" tabIndex={0}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfStock.map((p) => (
                    <tr key={p.sku}>
                      <td>
                        <Link href={`/admin/productos/${encodeURIComponent(p.sku)}`}>{p.name}</Link>
                        <br />
                        <span className={ui.help}>SKU {p.sku}</span>
                      </td>
                      <td>
                        <span className={`${ui.badge} ${ui.badgeDanger}`}>Sin stock</span>
                        {p.published ? null : (
                          <>
                            {" "}
                            <span className={ui.badge}>No publicado</span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
