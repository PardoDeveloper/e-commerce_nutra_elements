"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { cartActions, toOrderItems, useCart } from "@/lib/cart";
import {
  OrderServiceError,
  computeSummary,
  getOrderService,
  validateCheckout,
  type CatalogEntry,
  type CheckoutFormValues,
  type FieldErrors,
  type FieldKey,
  type MockSettings,
} from "@/lib/checkout";
import { formatClp } from "@/lib/format";
import styles from "./checkout.module.css";
import formStyles from "./forms.module.css";
import { OrderSummary } from "./OrderSummary";

interface CheckoutFormProps {
  catalog: Record<string, CatalogEntry>;
  settings: MockSettings;
  /** Falso con firebase si el banco es de prueba o no hay datos bancarios. */
  transferAvailable?: boolean;
}

const INITIAL: CheckoutFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  rut: "",
  deliveryType: "shipping",
  communeCode: "",
  address: "",
  notes: "",
  paymentMethod: "",
};

const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: "Nombre",
  lastName: "Apellido",
  email: "Correo",
  phone: "Teléfono",
  rut: "RUT",
  deliveryType: "Entrega",
  communeCode: "Comuna",
  address: "Dirección",
  notes: "Indicaciones",
  paymentMethod: "Medio de pago",
};

/** Id del control a enfocar para cada campo con error. */
const fieldId = (key: FieldKey) => `field-${key}`;
const FIELD_ORDER: FieldKey[] = ["firstName", "lastName", "email", "phone", "rut", "deliveryType", "communeCode", "address", "notes", "paymentMethod"];

interface TextFieldProps {
  name: FieldKey;
  label: string;
  value: string;
  error: string | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  hint?: string;
  maxLength?: number;
  autoCapitalize?: string;
}

/** Campo de texto con etiqueta, ayuda y error accesibles. Definido fuera del formulario para no remontarse al escribir. */
function TextField({ name, label, value, error, onChange, disabled, type = "text", autoComplete, inputMode, hint, maxLength, autoCapitalize }: TextFieldProps) {
  const id = fieldId(name);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={formStyles.field}>
      <label htmlFor={id} className={formStyles.label}>
        {label}{" "}
        <span className={formStyles.required} aria-hidden="true">
          *
        </span>
      </label>
      {hint ? (
        <span id={`${id}-hint`} className={formStyles.hint}>
          {hint}
        </span>
      ) : null}
      <input
        id={id}
        name={name}
        type={type}
        className={formStyles.input}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        spellCheck={false}
        required
        aria-required="true"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
      />
      {error ? (
        <span id={`${id}-error`} className={formStyles.error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function CheckoutForm({ catalog, settings, transferAvailable = true }: CheckoutFormProps) {
  const router = useRouter();
  const cart = useCart();
  const [values, setValues] = useState<CheckoutFormValues>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "submitting" | "redirecting">("form");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const summaryRef = useRef<HTMLDivElement>(null);

  if (phase === "redirecting") {
    return (
      <div className={styles.panel} role="status">
        <h2 className={styles.panelTitle}>Creando tu pedido…</h2>
        <p>Un momento, te llevamos al siguiente paso.</p>
      </div>
    );
  }

  if (!cart.hydrated) {
    return (
      <div className={styles.skeleton} role="status">
        <span className="visually-hidden">Cargando tu carrito…</span>
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className={`${styles.panel} ${styles.empty}`}>
        <h2 className={styles.panelTitle}>Tu carrito está vacío</h2>
        <p>Agrega productos para continuar con el pago.</p>
        <Button href="/productos">Ver productos</Button>
      </div>
    );
  }

  const items = toOrderItems(cart.lines);
  const summary = computeSummary({
    items,
    catalog,
    settings: { shippingFee: settings.shippingFee, freeShippingThreshold: settings.freeShippingThreshold },
    delivery: values.deliveryType,
  });
  const cartBlocked = summary.missingSkus.length > 0 || summary.lines.some((l) => !l.inStock);
  const busy = phase === "submitting";

  function onChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const name = e.target.name as FieldKey;
    const value = e.target.value;
    setValues((prev) => ({ ...prev, [name]: value }) as CheckoutFormValues);
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function focusSummary() {
    // Espera al render del resumen de errores.
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    if (cartBlocked) {
      setFormError("Hay productos sin stock o que ya no están disponibles. Vuelve al carrito para quitarlos.");
      focusSummary();
      return;
    }

    const result = validateCheckout(values, {
      communeCodes: settings.communes.map((c) => c.code),
      pickupEnabled: settings.pickup.enabled,
    });
    if (!result.ok) {
      setErrors(result.errors);
      focusSummary();
      return;
    }
    setErrors({});
    setPhase("submitting");

    try {
      const service = getOrderService({ catalog, settings });
      const order = await service.createOrder({
        clientRequestId: requestId,
        items,
        paymentMethod: result.paymentMethod,
        customer: result.customer,
        delivery: result.delivery,
      });
      // Pedido creado: se vacía el carrito y se sigue al pago.
      setPhase("redirecting");
      cartActions.clear();
      const query = new URLSearchParams({ t: order.accessToken });
      if (order.next === "pay_with_flow") {
        const payment = await service.createFlowPayment({ orderNumber: order.orderNumber, accessToken: order.accessToken });
        router.push(payment.redirectUrl);
      } else {
        router.push(`/pedido/${order.orderNumber}?${query.toString()}`);
      }
    } catch (error) {
      setPhase("form");
      setRequestId(crypto.randomUUID());
      if (error instanceof OrderServiceError) {
        if (error.code === "INVALID_RUT") setErrors({ rut: "Revisa tu RUT. Ejemplo: 12.345.678-5." });
        setFormError(error.message);
      } else {
        setFormError("Ocurrió un error inesperado. Intenta de nuevo.");
      }
      focusSummary();
    }
  }

  const errorKeys = FIELD_ORDER.filter((k) => errors[k]);

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy}>
      <div className={styles.layout}>
        <div>
          {errorKeys.length > 0 || formError ? (
            <div ref={summaryRef} tabIndex={-1} role="alert" className={formStyles.errorSummary}>
              <p className={styles.noticeTitle}>
                {formError ?? "Revisa estos campos para continuar:"}
              </p>
              {errorKeys.length > 0 ? (
                <ul>
                  {errorKeys.map((k) => (
                    <li key={k}>
                      <a href={`#${fieldId(k)}`}>
                        {FIELD_LABELS[k]}: {errors[k]}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {cartBlocked ? (
                <p>
                  <Link href="/carrito">Volver al carrito</Link>
                </p>
              ) : null}
            </div>
          ) : null}

          <fieldset className={formStyles.fieldset}>
            <legend className={formStyles.legend}>Tus datos</legend>
            <div className={`${formStyles.grid} ${formStyles.grid2}`}>
              <TextField name="firstName" label="Nombre" autoComplete="given-name" maxLength={60} value={values.firstName} error={errors.firstName} onChange={onChange} disabled={busy} />
              <TextField name="lastName" label="Apellido" autoComplete="family-name" maxLength={60} value={values.lastName} error={errors.lastName} onChange={onChange} disabled={busy} />
              <TextField name="email" label="Correo" type="email" autoComplete="email" inputMode="email" maxLength={254} value={values.email} error={errors.email} onChange={onChange} disabled={busy} />
              <TextField name="phone" label="Teléfono" type="tel" autoComplete="tel" inputMode="tel" hint="Ej: +56 9 1234 5678" maxLength={20} value={values.phone} error={errors.phone} onChange={onChange} disabled={busy} />
              <TextField
                name="rut"
                label="RUT"
                autoComplete="off"
                inputMode="text"
                autoCapitalize="characters"
                hint="Obligatorio. Con o sin puntos y guion, por ejemplo 12.345.678-5. No se muestra en la confirmación."
                maxLength={12}
                value={values.rut}
                error={errors.rut}
                onChange={onChange}
                disabled={busy}
              />
            </div>
          </fieldset>

          <fieldset className={formStyles.fieldset} aria-describedby={errors.deliveryType ? "field-deliveryType-error" : undefined}>
            <legend className={formStyles.legend}>Entrega</legend>
            <div className={formStyles.options} id={fieldId("deliveryType")}>
              <label className={formStyles.option}>
                <input
                  type="radio"
                  name="deliveryType"
                  value="shipping"
                  checked={values.deliveryType === "shipping"}
                  onChange={onChange}
                  className={formStyles.radio}
                  disabled={busy}
                />
                <span className={formStyles.optionText}>
                  <span className={formStyles.optionTitle}>Despacho a domicilio en la Región Metropolitana</span>
                  <span className={formStyles.hint}>
                    {summary.threshold !== null ? `Gratis desde ${formatClp(summary.threshold)} en compras.` : "Entrega en tu dirección."}
                  </span>
                </span>
                <span className={formStyles.optionPrice}>
                  {summary.freeShippingApplied ? "Gratis" : formatClp(settings.shippingFee)}
                </span>
              </label>
              {settings.pickup.enabled ? (
                <label className={formStyles.option}>
                  <input
                    type="radio"
                    name="deliveryType"
                    value="pickup"
                    checked={values.deliveryType === "pickup"}
                    onChange={onChange}
                    className={formStyles.radio}
                    disabled={busy}
                  />
                  <span className={formStyles.optionText}>
                    <span className={formStyles.optionTitle}>Retiro en tienda</span>
                    <span className={formStyles.hint}>
                      {settings.pickup.address}. {settings.pickup.hours}.
                    </span>
                  </span>
                  <span className={formStyles.optionPrice}>Gratis</span>
                </label>
              ) : null}
            </div>
            {errors.deliveryType ? (
              <span id="field-deliveryType-error" className={formStyles.error}>
                {errors.deliveryType}
              </span>
            ) : null}

            {values.deliveryType === "shipping" ? (
              <div className={`${formStyles.grid} ${formStyles.conditional}`}>
                <div className={formStyles.field}>
                  <label htmlFor={fieldId("communeCode")} className={formStyles.label}>
                    Comuna <span className={formStyles.required} aria-hidden="true">*</span>
                  </label>
                  <select
                    id={fieldId("communeCode")}
                    name="communeCode"
                    className={formStyles.input}
                    value={values.communeCode}
                    onChange={onChange}
                    autoComplete="address-level2"
                    required
                    aria-required="true"
                    aria-invalid={errors.communeCode ? "true" : undefined}
                    aria-describedby={errors.communeCode ? "field-communeCode-error" : undefined}
                    disabled={busy}
                  >
                    <option value="">Elige tu comuna</option>
                    {settings.communes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.communeCode ? (
                    <span id="field-communeCode-error" className={formStyles.error}>
                      {errors.communeCode}
                    </span>
                  ) : null}
                </div>
                <TextField name="address" label="Dirección" autoComplete="street-address" hint="Calle, número y departamento." maxLength={200} value={values.address} error={errors.address} onChange={onChange} disabled={busy} />
                <div className={formStyles.field}>
                  <label htmlFor={fieldId("notes")} className={formStyles.label}>
                    Indicaciones para la entrega (opcional)
                  </label>
                  <textarea
                    id={fieldId("notes")}
                    name="notes"
                    className={`${formStyles.input} ${formStyles.textarea}`}
                    value={values.notes}
                    onChange={onChange}
                    maxLength={300}
                    aria-invalid={errors.notes ? "true" : undefined}
                    aria-describedby={errors.notes ? "field-notes-error" : undefined}
                    disabled={busy}
                  />
                  {errors.notes ? (
                    <span id="field-notes-error" className={formStyles.error}>
                      {errors.notes}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </fieldset>

          <fieldset className={formStyles.fieldset} aria-describedby={errors.paymentMethod ? "field-paymentMethod-error" : undefined}>
            <legend className={formStyles.legend}>Pago</legend>
            <div className={formStyles.options} id={fieldId("paymentMethod")}>
              <label className={formStyles.option}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="flow"
                  checked={values.paymentMethod === "flow"}
                  onChange={onChange}
                  className={formStyles.radio}
                  disabled={busy}
                />
                <span className={formStyles.optionText}>
                  <span className={formStyles.optionTitle}>Pagar con Flow</span>
                  <span className={formStyles.hint}>Pago en línea. Reservamos tus productos por 30 minutos (simulado).</span>
                </span>
              </label>
              {transferAvailable ? (
                <label className={formStyles.option}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={values.paymentMethod === "transfer"}
                    onChange={onChange}
                    className={formStyles.radio}
                    disabled={busy}
                  />
                  <span className={formStyles.optionText}>
                    <span className={formStyles.optionTitle}>Transferencia bancaria</span>
                    <span className={formStyles.hint}>Reservamos tus productos por 48 horas para que transfieras.</span>
                  </span>
                </label>
              ) : null}
            </div>
            {transferAvailable ? null : (
              <p className={formStyles.hint}>La transferencia bancaria no está disponible por ahora.</p>
            )}
            {errors.paymentMethod ? (
              <span id="field-paymentMethod-error" className={formStyles.error}>
                {errors.paymentMethod}
              </span>
            ) : null}
          </fieldset>
        </div>

        <div className={styles.aside}>
          <OrderSummary summary={summary} delivery={values.deliveryType} showLines headingId="checkout-summary-title" />
          <div className={formStyles.submitRow}>
            <Button type="submit" size="lg" fullWidth disabled={busy}>
              {busy ? "Creando pedido…" : "Confirmar pedido"}
            </Button>
            <Button href="/carrito" variant="outline" fullWidth>
              Volver al carrito
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
