import type { ReactNode } from "react";
import styles from "./SectionHeading.module.css";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  /** Nivel semántico del título (h1 a h3). Por defecto 2. */
  level?: 1 | 2 | 3;
  align?: "start" | "center";
  /** Acción opcional a la derecha (por ejemplo, un enlace "Ver todos"). */
  action?: ReactNode;
  id?: string;
}

/** Título de sección con subtítulo y acción opcionales. */
export function SectionHeading({ title, subtitle, level = 2, align = "start", action, id }: SectionHeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return (
    <div className={`${styles.wrap} ${align === "center" ? styles.center : ""}`}>
      <div>
        <Tag id={id} className={styles.title}>
          {title}
        </Tag>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        <span className={styles.rule} aria-hidden="true" />
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
