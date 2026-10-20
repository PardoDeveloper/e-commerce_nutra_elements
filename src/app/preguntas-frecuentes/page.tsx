import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { breadcrumbList, FAQ_SECTIONS, graph, pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Preguntas frecuentes de compra | Nutra Elements",
  description:
    "Resuelve tus dudas sobre despacho en la RM, retiro en tienda en Puente Alto, medios de pago, stock y seguimiento de tu pedido en Nutra Elements.",
  path: "/preguntas-frecuentes",
});

export default function FaqPage() {
  return (
    <Container as="div" size="narrow" className={styles.page}>
      <JsonLd
        data={graph(
          {
            "@type": "FAQPage",
            mainEntity: FAQ_SECTIONS.flatMap((s) =>
              s.items.map((i) => ({
                "@type": "Question",
                name: i.q,
                acceptedAnswer: { "@type": "Answer", text: i.a },
              })),
            ),
          },
          breadcrumbList([{ name: "Inicio", path: "/" }, { name: "Preguntas frecuentes" }]),
        )}
      />
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Preguntas frecuentes" }]} />
      <header className={styles.pageHead}>
        <h1>Preguntas frecuentes</h1>
        <p className={styles.lead}>Despacho, retiro, pagos y pedidos. Si no encuentras tu respuesta, escríbenos desde <Link href="/contacto" className={styles.inlineLink}>contacto</Link>.</p>
      </header>

      {FAQ_SECTIONS.map((section, si) => (
        <section key={section.title} className={`${styles.block} ${styles.faq}`} aria-labelledby={`faq-${si}`}>
          <h2 id={`faq-${si}`}>{section.title}</h2>
          {section.items.map((item) => (
            <details key={item.q}>
              <summary>
                <h3 className={styles.faqQ}>{item.q}</h3>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      ))}
    </Container>
  );
}
