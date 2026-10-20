"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import {
  OrderServiceError,
  getOrderService,
  type FulfillmentStatus,
  type GetOrderStatusResponse,
  type PaymentStatus,
} from "@/lib/checkout";
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

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export function OrderStatusView({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrderService()
      .getOrderStatus({ orderNumber, accessToken: token })
      .then((order) => {
        if (!cancelled) setState({ kind: "ready", order });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof OrderServiceError ? e.message : "Ocurrió un error inesperado. Intenta de nuevo.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber, token]);

  async function pay() {
    setRetrying(true);
    setRetryError(null);
    try {
      const payment = await getOrderService().createFlowPayment({ orderNumber, accessToken: token });
      router.push(payment.redirectUrl);
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
        <p className={styles.noticeTitle}>No pudimos mostrar el pedido {orderNumber}</p>
        <p>{state.message}</p>
        <p className={styles.muted}>
          En este prototipo los pedidos se guardan solo en este navegador: ábrelo desde el mismo equipo donde lo creaste.
        </p>
        <Button href="/productos" variant="outline">
          Ver productos
        </Button>
      </div>
    );
  }

  const { order } = state;
  const pending = order.paymentStatus === "pending_payment";
  const rejected = pending && order.paymentMethod === "flow" && order.lastPaymentAttemptRejected === true;

  return (
    <>
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
            <p>Recibimos tu pago (simulado). Estamos preparando tu pedido.</p>
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

        {pending && order.paymentMethod === "transfer" && order.transferInstructions ? (
          <>
            <div className={`${styles.notice} ${styles.noticeWarning}`}>
              <p className={styles.noticeTitle}>Datos bancarios de prueba</p>
              <p>No son una cuenta real: no transfieras dinero.</p>
            </div>
            <dl className={styles.bank}>
              <div>
                <dt>Banco</dt>
                <dd>{order.transferInstructions.bankName}</dd>
              </div>
              <div>
                <dt>Tipo de cuenta</dt>
                <dd>{order.transferInstructions.accountType}</dd>
              </div>
              <div>
                <dt>N° de cuenta</dt>
                <dd>{order.transferInstructions.accountNumber}</dd>
              </div>
              <div>
                <dt>Titular</dt>
                <dd>{order.transferInstructions.holderName}</dd>
              </div>
              <div>
                <dt>RUT del titular</dt>
                <dd>{order.transferInstructions.holderRut}</dd>
              </div>
              <div>
                <dt>Monto exacto</dt>
                <dd>{formatClp(order.transferInstructions.amount)}</dd>
              </div>
              <div>
                <dt>Referencia (glosa)</dt>
                <dd>{order.transferInstructions.reference}</dd>
              </div>
            </dl>
            {order.reservedUntil ? (
              <p>
                <strong>Reservamos tus productos por 48 horas</strong>, hasta el {dateFormat.format(new Date(order.reservedUntil))}.
                Si no recibimos la transferencia a tiempo, la reserva se libera.
              </p>
            ) : null}
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
