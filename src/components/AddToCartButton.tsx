"use client";

import { useEffect, useRef, useState } from "react";
import { cartActions } from "@/lib/cart";
import type { Product } from "@/lib/data/types";
import { Button } from "./Button";

type CartProduct = Pick<Product, "sku" | "name" | "slug" | "categoryId" | "price" | "finalPrice" | "inStock">;

interface AddToCartButtonProps {
  product: CartProduct;
  /** Unidades a agregar por clic. Por defecto 1. */
  qty?: number;
  size?: "md" | "lg";
  fullWidth?: boolean;
  variant?: "primary" | "outline";
  /** Texto visible del botón (el nombre accesible siempre incluye el producto). */
  label?: string;
}

/** Botón "Agregar al carrito". Anuncia el resultado con aria-live y se deshabilita sin stock. */
export function AddToCartButton({ product, qty = 1, size = "md", fullWidth = false, variant = "primary", label = "Agregar al carrito" }: AddToCartButtonProps) {
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleClick() {
    cartActions.add(
      {
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        categoryId: product.categoryId,
        unitPrice: product.price,
        finalPrice: product.finalPrice,
      },
      qty,
    );
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 2000);
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        onClick={handleClick}
        disabled={!product.inStock}
        aria-label={`Agregar al carrito: ${product.name}`}
      >
        {product.inStock ? (added ? "Agregado" : label) : "Sin stock"}
      </Button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {added ? `${product.name} agregado al carrito` : ""}
      </span>
    </>
  );
}
