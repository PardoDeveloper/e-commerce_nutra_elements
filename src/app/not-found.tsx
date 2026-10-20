import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Container } from "@/components/Container";
import { getCategories } from "@/lib/data";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const categories = await getCategories();
  return (
    <Container as="div" className="section">
      <h1>Página no encontrada</h1>
      <p>La página que buscas no existe o ya no está disponible.</p>
      <p>
        <Button href="/">Ir al inicio</Button>
      </p>
      <nav aria-label="Categorías">
        <ul>
          <li>
            <Link href="/productos">Todos los productos</Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/categorias/${c.slug}`}>{c.name}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
