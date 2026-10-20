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
        Si recibes un producto dañado o distinto al que pediste, escríbenos desde la página de contacto indicando tu
        número de pedido (NE-xxxxxx).
      </p>
      <h2>2. Plazos y condiciones</h2>
      <p>
        Los plazos y condiciones definitivos están en revisión y se publicarán aquí. Por tratarse de suplementos
        alimentarios, los productos abiertos no admiten devolución por razones de inocuidad.
      </p>
      <h2>3. Derechos del consumidor</h2>
      <p>Esta política no limita los derechos que te reconoce la ley chilena del consumidor.</p>
    </LegalPage>
  );
}
