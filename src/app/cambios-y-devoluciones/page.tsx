import { LegalPage } from "@/components/store/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Cambios y devoluciones | Nutra Elements",
  description: "Información sobre cambios y devoluciones de productos comprados en Nutra Elements.",
  path: "/cambios-y-devoluciones",
});

export default function ReturnsPage() {
  return (
    <LegalPage title="Cambios y devoluciones" lead="Qué hacer si tu pedido llega con algún problema.">
      <h2>1. Producto con problemas</h2>
      <p>
        Si recibes un producto dañado, vencido o distinto al que solicitaste, escríbenos desde la página de contacto
        indicando tu número de pedido (NE-xxxxxx) para gestionar la solución a la brevedad.
      </p>
      <h2>2. Plazos y condiciones</h2>
      <p>
        Dispones de un plazo máximo de <strong>5 días hábiles</strong> desde la recepción o retiro de tu compra para
        solicitar un cambio o devolución. Este beneficio aplica exclusivamente cuando:
      </p>
      <ul>
        <li>
          <strong>Producto mal despachado:</strong> recibiste una referencia o formato distinto al registrado en tu
          pedido.
        </li>
        <li>
          <strong>Producto dañado:</strong> el envase o su sello de seguridad llegó roto o deteriorado al momento de la
          entrega.
        </li>
        <li>
          <strong>Vencimiento:</strong> el suplemento presenta una fecha de expiración vencida al momento de recibirlo.
        </li>
      </ul>
      <p>
        Por tratarse de suplementos alimentarios y por razones de inocuidad y seguridad sanitaria, no se admiten cambios
        ni devoluciones por retracto ni de envases que hayan sido abiertos o manipulados después de su entrega.
      </p>
      <h2>3. Derechos del consumidor</h2>
      <p>
        En Nutra Elements respaldamos la calidad y trazabilidad de cada uno de nuestros suplementos. Esta política no
        limita ni restringe en modo alguno los derechos irrenunciables que te reconoce la{" "}
        <strong>Ley N.º 19.496 sobre Protección de los Derechos de los Consumidores</strong> en Chile.
      </p>
      <p>
        Ante cualquier falla de origen, defecto de fabricación o incumplimiento de las condiciones informadas que impida
        el uso normal y seguro del producto, cuentas con las garantías legales vigentes para solicitar el cambio sin
        costo o la devolución íntegra del monto pagado, presentando tu comprobante de compra.
      </p>
    </LegalPage>
  );
}
