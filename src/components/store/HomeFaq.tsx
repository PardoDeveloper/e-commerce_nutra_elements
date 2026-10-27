import { Button } from "@/components/Button";
import { SectionHeading } from "@/components/SectionHeading";
import { FAQ_SECTIONS } from "@/lib/seo";
import styles from "./HomeFaq.module.css";

/** Ancla de la sección: el pie y los enlaces internos apuntan a "/#preguntas-frecuentes". */
export const FAQ_ANCHOR = "preguntas-frecuentes";

/**
 * Preguntas frecuentes al final de la página principal. Acordeón nativo (<details>): funciona sin JavaScript y el
 * texto de las respuestas está en el HTML (los buscadores lo leen). El JSON-LD FAQPage lo agrega la página.
 */
export function HomeFaq() {
  return (
    <section id={FAQ_ANCHOR} className={styles.faq} aria-labelledby="home-faq-titulo">
      <div className={styles.intro}>
        <SectionHeading
          id="home-faq-titulo"
          title="Preguntas frecuentes"
          subtitle="Despacho, retiro en tienda, pagos y pedidos: lo que más nos preguntan."
        />
        <div className={styles.help}>
          <p className={styles.helpTitle}>¿No encontraste tu respuesta?</p>
          <p className={styles.helpText}>Escríbenos y te ayudamos con tu compra.</p>
          <Button href="/contacto" variant="outline">
            Ir a contacto
          </Button>
        </div>
      </div>

      <div className={styles.groups}>
        {FAQ_SECTIONS.map((section, si) => (
          <div key={section.title} className={styles.group}>
            <h3 id={`home-faq-${si}`} className={styles.groupTitle}>
              {section.title}
            </h3>
            <ul className={styles.list} aria-labelledby={`home-faq-${si}`}>
              {section.items.map((item) => (
                <li key={item.q}>
                  <details className={styles.item}>
                    <summary className={styles.question}>
                      <span>{item.q}</span>
                      <span className={styles.icon} aria-hidden="true" />
                    </summary>
                    <p className={styles.answer}>{item.a}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
