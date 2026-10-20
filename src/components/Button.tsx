import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "md" | "lg";

interface CommonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & { href?: undefined };
type ButtonAsLink = CommonProps & { href: string; prefetch?: boolean; "aria-label"?: string };

/**
 * Botón accesible (alto mínimo 44 px). Con `href` renderiza un enlace de Next
 * (navegación); sin `href`, un `<button>` (acción). Por defecto `type="button"`.
 */
export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { children, variant = "primary", size = "md", fullWidth = false, className, ...rest } = props;
  const classes = [styles.button, styles[variant], styles[size], fullWidth ? styles.full : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  if (typeof rest.href === "string") {
    const { href, prefetch, ...linkRest } = rest as Omit<ButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} prefetch={prefetch} className={classes} aria-label={linkRest["aria-label"]}>
        {children}
      </Link>
    );
  }
  const { type, ...buttonRest } = rest as Omit<ButtonAsButton, keyof CommonProps>;
  return (
    <button type={type ?? "button"} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
