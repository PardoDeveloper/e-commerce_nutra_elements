"use client";

// Historial de pedidos: los cerrados (entregados, cancelados, reembolsados y expirados), con filtro por estado,
// rango de fechas del pedido y búsqueda, en páginas de 25. Con Firebase se consulta Firestore por páginas
// (firebase-order-history.ts): no depende de los últimos pedidos que escucha el admin.
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { METHOD_LABELS } from "@/lib/admin/labels";
import {
  CLOSED_STATUSES,
  countByClosedStatus,
  DEFAULT_HISTORY_FILTERS,
  filterHistory,
  paginate,
  type ClosedStatus,
  type HistoryFilters,
  type HistoryResult,
  type OrderHistorySource,
} from "@/lib/admin/order-history";
import { formatClp } from "@/lib/format";
import { useAdminService, useAdminState, useAdminToday, useDataSource } from "./AdminProvider";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { Pagination } from "./Pagination";
import { formatDateTime } from "./format";
import ui from "./admin.module.css";
import styles from "./orders.module.css";

const STATUS_LABELS: Record<ClosedStatus, string> = {
  delivered: "Entregados",
  cancelled: "Cancelados",
  refunded: "Reembolsados",
  expired: "Expirados",
};

/** Espera tras la última tecla antes de buscar en Firestore. */
const SEARCH_DEBOUNCE_MS = 400;

interface HistoryView {
  result: HistoryResult;
  counts: Record<ClosedStatus, number> | null;
  loading: boolean;
  error: string | null;
}

/** Con Firebase, el historial se pide al servidor por páginas; en la demo se filtran los pedidos en memoria. */
function useHistory(filters: HistoryFilters, page: number): HistoryView {
  const service = useAdminService();
  const { orders } = useAdminState();
  const source = useMemo<OrderHistorySource | null>(() => service.createOrderHistory?.() ?? null, [service]);

  // Demo: lo de siempre, sobre los pedidos del estado.
  const demoCounts = useMemo(() => countByClosedStatus(orders), [orders]);
  const demoFiltered = useMemo(() => filterHistory(orders, filters), [orders, filters]);

  // Firebase: la búsqueda espera a que se deje de escribir.
  const [query, setQuery] = useState(filters.query);
  useEffect(() => {
    if (!source) return;
    const t = setTimeout(() => setQuery(filters.query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [source, filters.query]);

  const [counts, setCounts] = useState<Record<ClosedStatus, number> | null>(null);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    source.counts().then(
      (c) => !cancelled && setCounts(c),
      () => undefined, // los contadores son informativos: sin ellos, los chips van sin número
    );
    return () => {
      cancelled = true;
    };
  }, [source]);

  const { status, from, to } = filters;
  const requestKey = JSON.stringify([status, from, to, query, page]);
  const [loaded, setLoaded] = useState<{ key: string; result: HistoryResult | null; error: string | null } | null>(null);
  const [lastResult, setLastResult] = useState<HistoryResult | null>(null);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    source.page({ status, from, to, query }, page).then(
      (result) => {
        if (cancelled) return;
        setLoaded({ key: requestKey, result, error: null });
        setLastResult(result);
      },
      (e: unknown) => !cancelled && setLoaded({ key: requestKey, result: null, error: errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [source, status, from, to, query, page, requestKey]);

  if (!source) return { result: paginate(demoFiltered, page), counts: demoCounts, loading: false, error: null };
  const fresh = loaded?.key === requestKey ? loaded : null;
  return {
    // Mientras carga se sigue mostrando la página anterior.
    result: fresh?.result ?? lastResult ?? paginate([], 1),
    counts,
    loading: fresh === null || query !== filters.query,
    error: fresh?.error ?? null,
  };
}

export function OrderHistoryView() {
  const demo = useDataSource() === "demo";
  const today = useAdminToday();
  const id = useId();
  const topRef = useRef<HTMLHeadingElement>(null);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [page, setPage] = useState(1);

  const { result: current, counts, loading, error } = useHistory(filters, page);
  const filtersActive = filters.status !== "all" || filters.from !== "" || filters.to !== "" || filters.query.trim() !== "";
  const count = (n: number | undefined) => (n === undefined ? null : <span className={styles.chipCount}>{n}</span>);

  const update = (patch: Partial<HistoryFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const goTo = (n: number) => {
    setPage(n);
    topRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className={ui.page}>
      <Link href="/admin/pedidos" className={styles.back}>
        ← Pedidos activos
      </Link>
      <div>
        <h1 ref={topRef}>Historial de pedidos</h1>
        <p className={ui.lead}>Pedidos cerrados: entregados, cancelados, reembolsados y expirados.{demo ? " Datos de demostración." : ""}</p>
      </div>

      <div className={styles.statusChips} role="group" aria-label="Estado">
        <button type="button" className={styles.chip} aria-pressed={filters.status === "all"} onClick={() => update({ status: "all" })}>
          Todos {count(counts ? CLOSED_STATUSES.reduce((sum, k) => sum + counts[k], 0) : undefined)}
        </button>
        {CLOSED_STATUSES.map((s) => (
          <button key={s} type="button" className={styles.chip} aria-pressed={filters.status === s} onClick={() => update({ status: s })}>
            {STATUS_LABELS[s]} {count(counts?.[s])}
          </button>
        ))}
      </div>

      <form className={styles.historyFilters} role="search" aria-label="Filtrar historial" onSubmit={(e) => e.preventDefault()}>
        <div className={`${ui.field} ${styles.search}`}>
          <label className={ui.label} htmlFor={`${id}-q`}>
            {demo ? "Buscar por número, cliente o correo" : "Buscar por número de pedido o correo"}
          </label>
          <input id={`${id}-q`} type="search" className={ui.input} value={filters.query} onChange={(e) => update({ query: e.target.value })} />
        </div>
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
        <div className={styles.clearCell}>
          {filtersActive ? (
            <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => update(DEFAULT_HISTORY_FILTERS)}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </form>

      <p className={ui.help} role="status">
        {loading
          ? "Cargando…"
          : current.unsupportedQuery
            ? "Busca por el número exacto del pedido (por ejemplo NE-000123) o por el correo completo del cliente."
            : current.total === 0
              ? "Sin resultados"
              : `Mostrando ${current.from}–${current.to} de ${current.total} ${current.total === 1 ? "pedido" : "pedidos"}`}
      </p>

      {error ? (
        <p className={`${ui.alert} ${ui.alertError}`} role="alert">
          {error}
        </p>
      ) : null}

      {current.total === 0 && loading ? null : current.total === 0 ? (
        <p className={ui.empty}>{filtersActive ? "No hay pedidos con estos filtros." : "Aún no hay pedidos cerrados."}</p>
      ) : (
        <div className={`${ui.tableWrap} ${styles.tableCard}`} role="region" aria-label="Historial de pedidos" tabIndex={0}>
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
              {current.items.map((o) => (
                <tr key={o.orderNumber}>
                  <td className={ui.nowrap}>
                    <Link className={ui.linkCell} href={`/admin/pedidos/${encodeURIComponent(o.orderNumber)}`}>
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className={ui.nowrap}>{formatDateTime(o.createdAt)}</td>
                  <td>
                    {o.customer.firstName} {o.customer.lastName}
                    <br />
                    <span className={ui.help}>{o.customer.email}</span>
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
      )}

      <Pagination page={current.page} pages={current.pages} onChange={goTo} label="Páginas del historial" />
    </div>
  );
}
