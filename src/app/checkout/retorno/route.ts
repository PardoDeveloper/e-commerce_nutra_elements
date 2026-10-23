// Retorno desde Flow (functions.md 3.3.1). Flow devuelve al comprador con un POST (y el `token` de Flow
// en el cuerpo, que se ignora: el estado real lo confirma el servidor con `getStatus`). Aquí solo se
// redirige con 303 a la página del pedido, que lee el token de acceso guardado en el navegador (A2).
const ORDER_NUMBER = /^NE-\d{6,9}$/;

function redirectToOrder(request: Request): Response {
  const raw = new URL(request.url).searchParams.get("o")?.trim().toUpperCase() ?? "";
  const target = ORDER_NUMBER.test(raw) ? `/pedido/${raw}` : "/";
  return new Response(null, {
    status: 303,
    headers: {
      // Ruta relativa: sirve igual en App Hosting, con dominio propio y en local.
      Location: target,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const dynamic = "force-dynamic";
export const GET = redirectToOrder;
export const POST = redirectToOrder;
