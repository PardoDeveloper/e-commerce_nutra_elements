import type { ElementType, ReactNode } from "react";
import styles from "./Container.module.css";

interface ContainerProps {
  children: ReactNode;
  /** Elemento HTML a renderizar. Por defecto `div`. */
  as?: ElementType;
  /** `narrow` para texto largo (formularios, artículos). */
  size?: "default" | "narrow";
  className?: string;
  id?: string;
}

/** Contenedor centrado con ancho máximo y margen lateral responsive. */
export function Container({ children, as: Tag = "div", size = "default", className, id }: ContainerProps) {
  const classes = [styles.container, size === "narrow" ? styles.narrow : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} id={id}>
      {children}
    </Tag>
  );
}
