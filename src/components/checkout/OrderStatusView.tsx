"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/Button";
import {
  OrderServiceError,
  browserStorage,
  getOrderService,
  isExternalUrl,
  recallOrderToken,
  rememberOrderToken,
  resolvePaymentsMode,
  type FulfillmentStatus,
  type GetOrderStatusResponse,
  type PaymentStatus,
} from "@/lib/checkout";
import type { DataSource } from "@/lib/data-source";
import { formatClp } from "@/lib/format";
import styles from "./checkout.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; order: GetOrderStatusResponse }
  | { kind: "error"; message: string };

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending_payment: "Pago pendiente",
  paid: "Pago aprobado",
  payment_review: "Pago en revisión",
  expired: "Reserva vencida",
  cancelled: "Pedido cancelado",
  refunded: "Pedido reembolsado",
};

const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  preparing: "Preparando tu pedido",
  ready_for_pickup: "Listo para retirar",
  on_route: "En camino",
  delivered: "Entregado",
};

/** Estados en que el pago ya se recibió (aunque esté en revisión o se haya reembolsado). */
const PAYMENT_RECEIVED: ReadonlySet<PaymentStatus> = new Set(["paid", "payment_review", "refunded"]);

const NO_TOKEN_MESSAGE =
  "Para ver este pedido ábrelo desde el navegador donde lo compraste, o con el enlace completo que se mostró al comprar.";

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

/** Tras volver de Flow la confirmación puede tardar: se consulta cada 4 s, hasta 90 s (functions.md 3.3.1). */
const POLL_INTERVAL_MS = 4000;
const POLL_WINDOW_MS = 90_000;

/** Token del pedido: el de la URL (?t=) o, al volver de Flow, el guardado en este navegador (A2). */
function useOrderToken(orderNumber: string): string | null {
  const fromUrl = useSearchParams().get("t") ?? "";
  // En el servidor no hay almacenamiento: `null` hasta hidratar. En el navegador, "" si no hay token guardado.
  const stored = useSyncExternalStore(
    noopSubscribe,
    () => {
      const storage = browserStorage();
      return (storage && recallOrderToken(storage, orderNumber)) || "";
    },
    () => null,
  );
  useEffect(() => {
    const storage = browserStorage();
    if (fromUrl && storage) rememberOrderToken(storage, orderNumber, fromUrl);
  }, [orderNumber, fromUrl]);
  return fromUrl || stored;
}

const noopSubscribe = () => () => undefined;

export function OrderStatusView({ orderNumber, dataSource = "demo" }: { orderNumber: string; dataSource?: DataSource }) {
  const router = useRouter();
  // null = aún no se sabe; "" = no hay token en este navegador.
  const token = useOrderToken(orderNumber);
  const mode = resolvePaymentsMode(dataSource);
  const [loaded, setState] = useState<LoadState>({ kind: "loading" });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const pollUntil = useRef(0);
  const state: LoadState = token === "" ? { kind: "error", message: NO_TOKEN_MESSAGE } : loaded;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    pollUntil.current = Date.now() + POLL_WINDOW_MS;
    const load = () =>
      getOrderService(dataSource)
        .getOrderStatus({ orderNumber, accessToken: token })
        .then((order) => {
          if (cancelled) return;
          setState({ kind: "ready", order });
          const waitingForFlow = dataSource === "firebase" && order.paymentMethod === "flow" && order.paymentStatus === "pending_payment";
          if (waitingForFlow && Date.now() < pollUntil.current) timer = setTimeout(load, POLL_INTERVAL_MS);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setState({
            kind: "error",
            message: e instanceof OrderServiceError ? e.message : "Ocurrió un error inesperado. Intenta de nuevo.",
          });
        });
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderNumber, token, dataSource]);

  async function pay() {
    if (!token) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const payment = await getOrderService(dataSource).createFlowPayment({ orderNumber, accessToken: token });
      if (isExternalUrl(payment.redirectUrl)) window.location.assign(payment.redirectUrl);
      else router.push(payment.redirectUrl);
    } catch (e) {
      setRetrying(false);
      setRetryError(e instanceof OrderServiceError ? e.message : "Ocurrió un error inesperado. Intenta de nuevo.");
    }
  }

  if (state.kind === "loading") {
    return (
      <div className={styles.skeleton} role="status">
        <span className="visually-hidden">Cargando tu pedido…</span>
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
        <p className={styles.noticeTitle}>No pudimos mostrar tu pedido</p>
        <p>{state.message}</p>
        {mode === "simulated" ? (
          <p className={styles.muted}>
            En este prototipo los pedidos se guardan solo en este navegador: ábrelo desde el mismo equipo donde lo creaste.
          </p>
        ) : null}
        <Button href="/productos" variant="outline">
          Ver productos
        </Button>
      </div>
    );
  }

  const { order } = state;
  const pending = order.paymentStatus === "pending_payment";
  const rejected = pending && order.paymentMethod === "flow" && order.lastPaymentAttemptRejected === true;
  // El número de pedido se entrega solo cuando hay un pago recibido.
  const showNumber = PAYMENT_RECEIVED.has(order.paymentStatus);

  return (
    <>
      {showNumber ? (
        <div className={styles.orderBox}>
          <p className={styles.orderLabel}>Número de pedido</p>
          <strong className={styles.orderNumber} aria-label={`Número de pedido ${order.orderNumber}`}>
            {order.orderNumber}
          </strong>
          <p>
            <strong>Guarda este número.</strong> {order.trackingNote} Como no enviamos correos, es la única forma de
            consultar tu pedido.
          </p>
        </div>
      ) : pending ? (
        <div className={styles.orderBox} role="status">
          <p className={styles.orderLabel}>Tu compra aún no está pagada</p>
          <p>Completa el pago con Flow para confirmar tu compra. Te mostraremos tu número de pedido cuando recibamos el pago.</p>
        </div>
      ) : null}

      <section className={styles.panel} aria-labelledby="pay-status-title">
        <h2 id="pay-status-title" className={styles.panelTitle}>
          Estado del pago
        </h2>
        <p>
          <strong>{PAYMENT_LABEL[order.paymentStatus]}</strong>
          {order.paymentStatus === "paid" && order.fulfillmentStatus ? ` · ${FULFILLMENT_LABEL[order.fulfillmentStatus]}` : null}
        </p>

        {order.paymentStatus === "paid" ? (
          <div className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
            <p>Recibimos tu pago{mode === "simulated" ? " (simulado)" : ""}. Estamos preparando tu pedido.</p>
          </div>
        ) : null}

        {rejected ? (
          <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
            <p className={styles.noticeTitle}>El pago fue rechazado</p>
            <p>No se realizó ningún cobro. Tus productos siguen reservados; puedes reintentar el pago.</p>
          </div>
        ) : null}

        {pending && order.paymentMethod === "flow" ? (
          <>
            {!rejected ? <p>Aún no completas el pago con Flow.</p> : null}
            {order.reservedUntil ? (
              <p className={styles.muted}>Reservamos tus productos hasta el {dateFormat.format(new Date(order.reservedUntil))}.</p>
            ) : null}
            {retryError ? (
              <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                <p>{retryError}</p>
              </div>
            ) : null}
            <Button onClick={pay} disabled={retrying} size="lg">
              {retrying ? "Conectando con Flow…" : rejected ? "Reintentar pago con Flow" : "Pagar con Flow"}
            </Button>
          </>
        ) : null}

        {order.paymentStatus === "expired" ? (
          <div className={`${styles.notice} ${styles.noticeWarning}`} role="status">
            <p>La reserva de tus productos venció. Crea un pedido nuevo para comprarlos.</p>
            <Button href="/productos" variant="outline">
              Volver a la tienda
            </Button>
          </div>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="delivery-title">
        <h2 id="delivery-title" className={styles.panelTitle}>
          Entrega
        </h2>
        {order.delivery.type === "pickup" ? (
          <>
            <p>
              <strong>Retiro en tienda</strong>
            </p>
            <p>{order.delivery.storeAddress}</p>
            <p>{order.delivery.storeHours}</p>
          </>
        ) : (
          <>
            <p>
              <strong>Despacho a domicilio</strong>
            </p>
            <p>Comuna de {order.delivery.communeName}, Región Metropolitana.</p>
          </>
        )}
      </section>

      <section className={`${styles.panel} ${styles.soft}`} aria-labelledby="order-summary-title">
        <h2 id="order-summary-title" className={styles.panelTitle}>
          Resumen del pedido
        </h2>
        <p className={styles.muted}>Creado el {dateFormat.format(new Date(order.createdAt))}.</p>
        <ul className={styles.miniLines}>
          {order.items.map((i) => (
            <li key={i.name} className={styles.miniLine}>
              <span>
                {i.qty} × {i.name}
              </span>
              <span>{formatClp(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>Subtotal</dt>
            <dd>{formatClp(order.subtotal)}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{order.delivery.type === "pickup" ? "Retiro en tienda" : "Despacho"}</dt>
            <dd>{order.shipping === 0 ? "Gratis" : formatClp(order.shipping)}</dd>
          </div>
          <div className={`${styles.summaryRow} ${styles.totalRow}`}>
            <dt>Total</dt>
            <dd>{formatClp(order.total)}</dd>
          </div>
        </dl>
      </section>

      <p>
        <Link href="/productos">Seguir comprando</Link>
      </p>
    </>
  );
}
