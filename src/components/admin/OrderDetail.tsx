"use client";

import Link from "next/link";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { FULFILLMENT_LABELS, METHOD_LABELS, PAYMENT_LABELS, statusLabel } from "@/lib/admin/labels";
import { allowedActions } from "@/lib/admin/orders";
import type { AdminOrder, RefundMethod, StatusHistoryEntry } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { useAdminService, useAdminState } from "./AdminProvider";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { formatDateTime, toLocalInput } from "./format";
import ui from "./admin.module.css";
import { getActiveDataSource, sim } from "@/lib/admin/mode";

type Notice = { kind: "ok" | "error"; text: string } | null;

export function OrderDetail({ orderNumber }: { orderNumber: string }) {
  const { orders } = useAdminState();
  const order = orders.find((o) => o.orderNumber === orderNumber);
  if (!order) {
    return (
      <div className={ui.page}>
        <h1>Pedido no encontrado</h1>
        <p className={ui.empty}>No existe el pedido «{orderNumber}».</p>
        <Link href="/admin/pedidos" className={ui.btn}>
          Volver a pedidos
        </Link>
      </div>
    );
  }
  return <Detail key={order.orderNumber} order={order} />;
}

function historyText(h: StatusHistoryEntry): string {
  const from = statusLabel(h.from, h.kind);
  const to = statusLabel(h.to, h.kind);
  const prefix = h.kind === "payment" ? "Pago" : h.kind === "fulfillment" ? "Entrega" : "Stock";
  return h.from === null ? `${prefix}: ${to}` : `${prefix}: ${from} → ${to}`;
}

function actor(by: string): string {
  if (by === "system") return "sistema";
  if (by === "flow") return "Flow";
  return getActiveDataSource() === "firebase" ? "administrador" : "administrador (demo)";
}

function Detail({ order }: { order: AdminOrder }) {
  const actions = allowedActions(order);
  const hasActions = actions.confirmTransfer || actions.cancel || actions.advanceTo || actions.backTo || actions.refund;
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <div className={ui.page}>
      <nav aria-label="Ruta de navegación" className={ui.help}>
        <Link href="/admin/pedidos">Pedidos</Link> / {order.orderNumber}
      </nav>
      <div className={ui.pageHeader}>
        <div>
          <h1>Pedido {order.orderNumber}</h1>
          <p className={ui.lead}>
            <OrderStatusBadge order={order} /> · {formatDateTime(order.createdAt)} · {METHOD_LABELS[order.paymentMethod]}
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {notice ? (
          <p className={`${ui.alert} ${notice.kind === "ok" ? ui.alertOk : ui.alertError}`} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}
      </div>

      <div className={ui.twoCols}>
        <section className={`${ui.card} ${ui.section}`} aria-labelledby="cust">
          <h2 id="cust">Cliente</h2>
          <dl className={ui.dl}>
            <dt>Nombre</dt>
            <dd>
              {order.customer.firstName} {order.customer.lastName}
            </dd>
            <dt>RUT</dt>
            <dd className={ui.mono}>{order.customer.rut}</dd>
            <dt>Correo</dt>
            <dd>{order.customer.email}</dd>
            <dt>Teléfono</dt>
            <dd>{order.customer.phone}</dd>
          </dl>
        </section>
        <section className={`${ui.card} ${ui.section}`} aria-labelledby="deliv">
          <h2 id="deliv">Entrega</h2>
          {order.delivery.type === "shipping" ? (
            <dl className={ui.dl}>
              <dt>Tipo</dt>
              <dd>Despacho a domicilio</dd>
              <dt>Comuna</dt>
              <dd>{order.delivery.communeName}</dd>
              <dt>Dirección</dt>
              <dd>{order.delivery.address}</dd>
              {order.delivery.notes ? (
                <>
                  <dt>Notas</dt>
                  <dd>{order.delivery.notes}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <dl className={ui.dl}>
              <dt>Tipo</dt>
              <dd>Retiro en tienda</dd>
              <dt>Dirección</dt>
              <dd>{order.delivery.storeAddress}</dd>
              <dt>Horario</dt>
              <dd>{order.delivery.storeHours}</dd>
            </dl>
          )}
          <p className={ui.help}>Usa el número {order.orderNumber} para el seguimiento en DispatchTrack.</p>
        </section>
      </div>

      <section className={ui.section} aria-labelledby="items">
        <h2 id="items">Productos</h2>
        <div className={ui.tableWrap} role="region" aria-label="Productos del pedido" tabIndex={0}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col" className={ui.num}>
                  Precio unitario
                </th>
                <th scope="col" className={ui.num}>
                  Cantidad
                </th>
                <th scope="col" className={ui.num}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.sku}>
                  <td>
                    {it.name}
                    <br />
                    <span className={ui.help}>SKU {it.sku}</span>
                  </td>
                  <td className={ui.num}>
                    {formatClp(it.unitFinalPrice)}
                    {it.unitFinalPrice < it.unitPrice ? (
                      <>
                        <br />
                        <s className={ui.help}>{formatClp(it.unitPrice)}</s>
                      </>
                    ) : null}
                  </td>
                  <td className={ui.num}>{it.qty}</td>
                  <td className={ui.num}>{formatClp(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} className={ui.num}>
                  Subtotal
                </th>
                <td className={ui.num}>{formatClp(order.subtotal)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={3} className={ui.num}>
                  Envío{order.freeShippingApplied ? " (gratis)" : ""}
                </th>
                <td className={ui.num}>{formatClp(order.shipping)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={3} className={ui.num}>
                  Total
                </th>
                <td className={ui.num}>
                  <strong>{formatClp(order.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {order.refund ? (
        <section className={`${ui.card} ${ui.section}`} aria-labelledby="refund">
          <h2 id="refund">Reembolso registrado</h2>
          <dl className={ui.dl}>
            <dt>Monto</dt>
            <dd>{formatClp(order.refund.amount)}</dd>
            <dt>Medio</dt>
            <dd>{METHOD_LABELS[order.refund.method]}</dd>
            <dt>Fecha</dt>
            <dd>{formatDateTime(order.refund.refundedAt)}</dd>
            <dt>Nota</dt>
            <dd>{order.refund.note}</dd>
            <dt>Stock</dt>
            <dd>{order.refund.restocked ? "Se repuso el stock" : "No se repuso el stock"}</dd>
          </dl>
        </section>
      ) : null}
      {order.transfer ? (
        <section className={`${ui.card} ${ui.section}`} aria-labelledby="transfer">
          <h2 id="transfer">Transferencia confirmada</h2>
          <dl className={ui.dl}>
            <dt>Fecha</dt>
            <dd>{formatDateTime(order.transfer.confirmedAt)}</dd>
            {order.transfer.reference ? (
              <>
                <dt>Referencia</dt>
                <dd>{order.transfer.reference}</dd>
              </>
            ) : null}
            {order.transfer.note ? (
              <>
                <dt>Nota</dt>
                <dd>{order.transfer.note}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className={ui.section} aria-labelledby="acts">
        <h2 id="acts">Acciones</h2>
        {!hasActions ? (
          <p className={ui.empty}>
            Este pedido está en estado «{PAYMENT_LABELS[order.paymentStatus]}»: no admite más acciones.
          </p>
        ) : (
          <div className={ui.stack}>
            {actions.confirmTransfer ? <ConfirmTransferForm order={order} onNotice={setNotice} /> : null}
            {actions.advanceTo ? <AdvanceButton order={order} to={actions.advanceTo} onNotice={setNotice} /> : null}
            {actions.backTo ? <BackwardForm order={order} to={actions.backTo} onNotice={setNotice} /> : null}
            {actions.refund ? <RefundForm order={order} onNotice={setNotice} /> : null}
            {actions.cancel ? <CancelForm order={order} onNotice={setNotice} /> : null}
          </div>
        )}
      </section>

      <section className={ui.section} aria-labelledby="hist">
        <h2 id="hist">Historial de estados</h2>
        <ol className={ui.timeline}>
          {[...order.statusHistory].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <time dateTime={h.at}>{formatDateTime(h.at)}</time>
              <strong>{historyText(h)}</strong>
              {h.direction === "backward" ? <> <span className={`${ui.badge} ${ui.badgeWarn}`}>Retroceso</span></> : null}
              <span className={ui.help}> · {actor(h.by)}</span>
              {h.reason ? <div>Motivo: {h.reason}</div> : null}
              {h.note ? <div>Nota: {h.note}</div> : null}
              {h.refund ? (
                <div>
                  Reembolso de {formatClp(h.refund.amount)} por {METHOD_LABELS[h.refund.method]}
                  {h.refund.restock ? ", con reposición de stock" : ", sin reposición de stock"}.
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

interface ActionProps {
  order: AdminOrder;
  onNotice: (n: Notice) => void;
}

function ActionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={ui.group}>
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function ConfirmTransferForm({ order, onNotice }: ActionProps) {
  const service = useAdminService();
  const id = useId();
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const r = await service.confirmTransferPayment({
        orderNumber: order.orderNumber,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      onNotice({ kind: "ok", text: r.message ?? sim("Transferencia confirmada (simulado): el pedido quedó pagado y en preparación.") });
    } catch (e) {
      onNotice({ kind: "error", text: errorMessage(e) });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <ActionBox title="Confirmar transferencia">
        <p className={ui.help}>
          Verifica el depósito en la cartola antes de confirmar.
          {order.paymentStatus === "expired" ? " La reserva había expirado: se volverá a reservar el stock; si no alcanza, el pedido pasa a revisión de pago." : ""}
        </p>
        <div className={ui.fields}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-ref`}>
              Referencia (opcional)
            </label>
            <input id={`${id}-ref`} className={ui.input} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-note`}>
              Nota (opcional)
            </label>
            <input id={`${id}-note`} className={ui.input} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className={ui.actions}>
          <button type="submit" className={ui.btn}>
            Confirmar transferencia recibida
          </button>
        </div>
      </ActionBox>
    </form>
  );
}

function AdvanceButton({ order, to, onNotice }: ActionProps & { to: keyof typeof FULFILLMENT_LABELS }) {
  const service = useAdminService();
  return (
    <ActionBox title="Estado de entrega">
      <p className={ui.help}>Estado actual: {order.fulfillmentStatus ? FULFILLMENT_LABELS[order.fulfillmentStatus] : "—"}.</p>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.btn}
          onClick={async () => {
            try {
              await service.updateFulfillment({ orderNumber: order.orderNumber, to });
              onNotice({ kind: "ok", text: sim(`Estado actualizado a «${FULFILLMENT_LABELS[to]}» (simulado).`) });
            } catch (e) {
              onNotice({ kind: "error", text: errorMessage(e) });
            }
          }}
        >
          Avanzar a «{FULFILLMENT_LABELS[to]}»
        </button>
      </div>
    </ActionBox>
  );
}

function BackwardForm({ order, to, onNotice }: ActionProps & { to: keyof typeof FULFILLMENT_LABELS }) {
  const service = useAdminService();
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (reason.trim() === "") {
      setError("REASON_REQUIRED: retroceder un estado exige un motivo.");
      return;
    }
    try {
      await service.updateFulfillment({ orderNumber: order.orderNumber, to, reason: reason.trim() });
      onNotice({ kind: "ok", text: sim(`Estado retrocedido a «${FULFILLMENT_LABELS[to]}» (simulado). Quedó registrado el motivo.`) });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <ActionBox title="Corregir: retroceder un paso">
        <p className={ui.help}>Solo se retrocede de a un paso y con un motivo, que queda en el historial.</p>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-reason`}>
            Motivo (obligatorio)
          </label>
          <textarea
            id={`${id}-reason`}
            className={ui.textarea}
            maxLength={300}
            value={reason}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error ? (
          <p id={`${id}-err`} className={`${ui.alert} ${ui.alertError}`} role="alert">
            {error}
          </p>
        ) : null}
        <div className={ui.actions}>
          <button type="submit" className={`${ui.btn} ${ui.btnOutline}`}>
            Retroceder a «{FULFILLMENT_LABELS[to]}»
          </button>
        </div>
      </ActionBox>
    </form>
  );
}

function CancelForm({ order, onNotice }: ActionProps) {
  const service = useAdminService();
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await service.cancelOrder({ orderNumber: order.orderNumber, reason });
      onNotice({ kind: "ok", text: sim("Pedido cancelado (simulado). Se liberó el stock reservado.") });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <ActionBox title="Cancelar pedido">
        <p className={ui.help}>Solo se cancela un pedido con pago pendiente. Un pedido pagado se reembolsa.</p>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-reason`}>
            Motivo (obligatorio)
          </label>
          <textarea id={`${id}-reason`} className={ui.textarea} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error ? (
          <p className={`${ui.alert} ${ui.alertError}`} role="alert">
            {error}
          </p>
        ) : null}
        <div className={ui.actions}>
          <button type="submit" className={`${ui.btn} ${ui.btnDangerOutline}`}>
            Cancelar pedido
          </button>
        </div>
      </ActionBox>
    </form>
  );
}

function RefundForm({ order, onNotice }: ActionProps) {
  const service = useAdminService();
  const id = useId();
  const [amount, setAmount] = useState(String(order.total));
  const [method, setMethod] = useState<RefundMethod>(order.paymentMethod);
  const [refundedAt, setRefundedAt] = useState(() => toLocalInput(new Date(Math.ceil(Date.now() / 60_000) * 60_000)));
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const when = new Date(refundedAt);
    if (Number.isNaN(when.getTime())) {
      setError("INVALID_REFUND_DATE: indica la fecha en que se hizo el reembolso.");
      return;
    }
    try {
      const r = await service.recordManualRefund({
        orderNumber: order.orderNumber,
        amount: Number(amount.replace(/[$.\s]/g, "")),
        method,
        refundedAt: when.toISOString(),
        note,
        restock,
      });
      onNotice({ kind: "ok", text: r.message ?? sim("Reembolso registrado (simulado).") });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <ActionBox title="Registrar reembolso manual">
        <p className={ui.help}>
          El dinero se devuelve fuera del sistema (panel de Flow o transferencia). Aquí solo se registra. Es definitivo: el pedido queda «Reembolsado».
        </p>
        <div className={ui.fields}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-amount`}>
              Monto reembolsado (CLP)
            </label>
            <input id={`${id}-amount`} className={ui.input} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className={ui.help}>Entre 1 y {formatClp(order.total)}.</span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-method`}>
              Medio
            </label>
            <select id={`${id}-method`} className={ui.select} value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
              <option value="flow">Flow</option>
              <option value="transfer">Transferencia bancaria</option>
            </select>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-date`}>
              Fecha y hora del reembolso
            </label>
            <input id={`${id}-date`} className={ui.input} type="datetime-local" value={refundedAt} onChange={(e) => setRefundedAt(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-note`}>
              Nota (obligatoria)
            </label>
            <input id={`${id}-note`} className={ui.input} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className={ui.checkRow}>
          <input id={`${id}-restock`} type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          <label htmlFor={`${id}-restock`}>Reponer el stock de los productos de este pedido</label>
        </div>
        {error ? (
          <p className={`${ui.alert} ${ui.alertError}`} role="alert">
            {error}
          </p>
        ) : null}
        <div className={ui.actions}>
          <button type="submit" className={`${ui.btn} ${ui.btnDanger}`}>
            Registrar reembolso
          </button>
        </div>
      </ActionBox>
    </form>
  );
}
