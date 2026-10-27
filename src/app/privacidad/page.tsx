import { LegalPage } from "@/components/store/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Política de privacidad | Nutra Elements",
  description: "Cómo Nutra Elements recopila, usa y protege tus datos personales al comprar en el sitio.",
  path: "/privacidad",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" lead="Qué datos pedimos, para qué los usamos y cómo los cuidamos.">
      <h2>1. Datos que recopilamos</h2>
      <p>
        Al comprar te pedimos tu nombre, correo, teléfono y la dirección de despacho (o la de retiro en tienda), solo
        para gestionar tu pedido.
      </p>
      <h2>2. Para qué los usamos</h2>
      <p>
        Usamos tus datos para preparar y entregar tu pedido, confirmar el pago y contactarte si hay algún problema con
        él. No los vendemos a terceros.
      </p>
      <h2>3. Pagos</h2>
      <p>
        Los pagos con tarjeta se realizan en Flow. Nutra Elements no almacena los datos de tu tarjeta.
      </p>
      <h2>4. Tus derechos</h2>
      <p>
        Conforme a la normativa chilena de protección de datos personales, puedes pedir acceso, rectificación o
        eliminación de tus datos escribiéndonos desde la página de contacto.
      </p>
      <h2>5. Cookies y analítica</h2>
      <p>El sitio guarda tu carrito en tu propio navegador. No usamos Google Analytics.</p>
    </LegalPage>
  );
}
