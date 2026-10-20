import { LegalPage } from "@/components/store/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Términos y condiciones | Nutra Elements",
  description: "Términos y condiciones de compra en Nutra Elements: precios, pagos, despacho y retiro en tienda.",
  path: "/terminos",
});

export default function TermsPage() {
  return (
    <LegalPage title="Términos y condiciones" lead="Condiciones generales para comprar en este sitio.">
      <h2>1. Quiénes somos</h2>
      <p>
        Este sitio es operado por Nutra Elements, con tienda en Av. Concha y Toro 180, Puente Alto, Región Metropolitana,
        Chile. Al comprar aceptas estas condiciones.
      </p>
      <h2>2. Productos</h2>
      <p>
        Los productos son suplementos alimentarios. No reemplazan una alimentación variada y equilibrada. Revisa siempre
        el rótulo y consulta a un profesional de la salud ante cualquier duda.
      </p>
      <h2>3. Precios y disponibilidad</h2>
      <p>
        Los precios están en pesos chilenos (CLP) e incluyen impuestos. El precio y el stock que ves en el sitio pueden
        tener un breve desfase; al confirmar tu pedido se recalculan con los valores vigentes.
      </p>
      <h2>4. Medios de pago</h2>
      <p>Puedes pagar con Flow o con transferencia bancaria. Las transferencias se confirman de forma manual.</p>
      <h2>5. Despacho y retiro</h2>
      <p>
        Despachamos a las comunas de la Región Metropolitana con un costo de $3.990. También puedes retirar en tienda, de
        lunes a viernes de 9:00 a 20:00.
      </p>
      <h2>6. Cambios y devoluciones</h2>
      <p>Consulta la página de cambios y devoluciones.</p>
      <h2>7. Contacto</h2>
      <p>Puedes escribirnos desde la página de contacto.</p>
    </LegalPage>
  );
}
