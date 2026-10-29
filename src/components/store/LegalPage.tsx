import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { breadcrumbList, graph } from "@/lib/seo";
import { JsonLd } from "./JsonLd";
import styles from "./store.module.css";

interface LegalPageProps {
  title: string;
  lead: string;
  children: ReactNode;
}

/** Plantilla de las páginas legales (borrador pendiente de revisión legal). */
export function LegalPage({ title, lead, children }: LegalPageProps) {
  return (
    <Container as="div" size="narrow" className={styles.page}>
      <JsonLd data={graph(breadcrumbList([{ name: "Inicio", path: "/" }, { name: title }]))} />
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: title }]} />
      <header className={styles.pageHead}>
        <h1>{title}</h1>
        <p className={styles.lead}>{lead}</p>
      </header>
      <div className={styles.text}>{children}</div>
    </Container>
  );
}
