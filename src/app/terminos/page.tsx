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
        En Nutra Elements creemos que el bienestar verdadero nace del equilibrio natural y el cuidado consciente de la salid. Somos una Marca de suplementos alimenticios, comprometida con ofrecer formulas con altos estándares de calidad, seguridad y pureza.
          <br />
          Nuestro proposito es acompañarte en tu día a día a través de soluciones confiables, incluyendo nuestras vitaminas y minerales esenciales, diseñadas para potenciar tu vitalidad, complementar tus tratamientos y mejorar tu calidad de vida.
          <br />
          Descubre nuestra línea de suplementos y da el primer paso hacia una vida más saludable.
          <br />
         Nos encontramos en con tienda en Av. Concha y Toro 180, Puente Alto, Región Metropolitana,
        Chile. 
        <br />
        
        <strong>Al comprar aceptas estas condiciones.</strong>
      </p>
      <h2>2. Productos</h2>
      <p>
        Los productos son suplementos alimentarios. No reemplazan una alimentación variada y equilibrada. Revisa siempre
        el rótulo y consulta a un profesional de la salud o un quimico farmacéutico ante cualquier duda.
      </p>
      <h2>3. Precios y disponibilidad</h2>
      <p>
        Los precios están en pesos chilenos (CLP) e incluyen impuestos. El precio y el stock que ves en el sitio pueden
        tener un breve desfase; al confirmar tu pedido se recalculan con los valores vigentes.
      </p>
      <h2>4. Medios de pago</h2>
      <p>Puedes pagar unicamente con la pasarela de pago "Flow" la cual permite diferentes tipos de pago.</p>
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
