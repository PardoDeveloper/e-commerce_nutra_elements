// Textos y datos fijos de las páginas públicas. Sin declaraciones de salud (normativa chilena).
import type { CategoryId } from "@/lib/data/types";

export const STORE_ADDRESS = {
  street: "Av. Concha y Toro 180",
  locality: "Puente Alto",
  region: "Región Metropolitana de Santiago",
  country: "CL",
} as const;

export const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Av.+Concha+y+Toro+180%2C+Puente+Alto%2C+Chile";

/** Plantillas del contrato SEO 03 más la introducción de cada categoría. */
export const CATEGORY_SEO: Record<CategoryId, { title: string; description: string; intro: string }> = {
  vitaminas: {
    title: "Vitaminas en cápsulas: B12, C, D y más | Nutra Elements",
    description:
      "Compra vitaminas en cápsulas de Nutra Elements: B12, B-Complex, C, D, E y multivitamínico. Despacho en la RM y retiro en tienda en Puente Alto.",
    intro:
      "En esta categoría reunimos las vitaminas en cápsulas de Nutra Elements: B12, B-Complex, vitamina C de 1000 mg, vitamina D de 800 UI, vitamina E de 400 UI y un multivitamínico. Cada producto se vende en frascos de distinta cantidad de cápsulas, y cada tamaño tiene su propia ficha con precio y disponibilidad. Son suplementos alimentarios: no reemplazan una alimentación variada. Lee siempre el rótulo del frasco y consulta a un profesional de la salud ante cualquier duda.",
  },
  magnesio: {
    title: "Magnesio en cápsulas: citrato y más | Nutra Elements",
    description:
      "Citrato, bisglicinato, cloruro y triple quelado de magnesio en cápsulas, de Nutra Elements. Despacho en la RM y retiro en tienda en Puente Alto.",
    intro:
      "El magnesio de Nutra Elements se presenta en cuatro formas químicas: citrato, bisglicinato, cloruro y triple magnesio quelado. Todas vienen en cápsulas y en frascos de distinta cantidad, cada uno con su ficha. Las diferencias entre ellas son de presentación y composición, y puedes revisarlas en el rótulo de cada producto. Son suplementos alimentarios: no reemplazan una alimentación variada. Ante cualquier duda, consulta a un profesional de la salud.",
  },
  minerales: {
    title: "Zinc y citrato de potasio en cápsulas | Nutra Elements",
    description:
      "Zinc y citrato de potasio en cápsulas de Nutra Elements, en distintos formatos. Despacho en la RM y retiro en tienda en Puente Alto.",
    intro:
      "Aquí encuentras los minerales en cápsulas de Nutra Elements: Ultra Zinc y citrato de potasio, en frascos de distinta cantidad. Cada tamaño tiene su ficha con precio y disponibilidad actualizados. Son suplementos alimentarios: no reemplazan una alimentación variada. Lee el rótulo antes de usarlos y consulta a un profesional de la salud si tienes dudas.",
  },
  "omega-3": {
    title: "Omega 3 y Omega 369 en cápsulas | Nutra Elements",
    description:
      "Omega 3 y Omega 369 en cápsulas de Nutra Elements, en distintos formatos. Despacho en la RM y retiro en tienda en Puente Alto.",
    intro:
      "Esta categoría agrupa los suplementos de Omega 3 y Omega 369 en cápsulas de Nutra Elements, disponibles en frascos de 30 y 90 cápsulas según el producto. Cada formato tiene su propia ficha con precio y disponibilidad. Son suplementos alimentarios: no reemplazan una alimentación variada. Revisa el rótulo y consulta a un profesional de la salud ante cualquier duda.",
  },
  belleza: {
    title: "Colágeno y biotina en cápsulas | Nutra Elements",
    description:
      "Colágeno 500 mg y biotina en cápsulas de Nutra Elements. Suplementos alimentarios. Despacho en la RM y retiro en tienda en Puente Alto.",
    intro:
      "En belleza encuentras colágeno de 500 mg y biotina, ambos en cápsulas y en distintos tamaños de frasco. Cada tamaño tiene su ficha con precio y disponibilidad. Son suplementos alimentarios: no reemplazan una alimentación variada. Lee el rótulo antes de usarlos y consulta a un profesional de la salud si tienes dudas.",
  },
  bienestar: {
    title: "Suplementos funcionales en cápsulas | Nutra Elements",
    description:
      "Spirulina, melena de león, cúrcuma con pimienta, cranberry y más en cápsulas de Nutra Elements. Despacho en la RM y retiro en tienda en Puente Alto.",
    intro:
      "Bienestar reúne los suplementos funcionales en cápsulas de Nutra Elements: spirulina, melena de león, cúrcuma con pimienta, cranberry con vitaminas C y E, y la línea Ultra (Light, Relax y Lax). Cada producto tiene su ficha con el detalle del rótulo, precio y disponibilidad. Son suplementos alimentarios: no reemplazan una alimentación variada. Lee el rótulo y consulta a un profesional de la salud antes de usarlos.",
  },
};

/** Preguntas frecuentes (contrato 05-C). Solo datos confirmados. Texto plano. */
export const FAQ_SECTIONS: Array<{ title: string; items: Array<{ q: string; a: string }> }> = [
  {
    title: "Despacho",
    items: [
      { q: "¿Cuánto cuesta el despacho?", a: "El despacho a todas las comunas de la Región Metropolitana cuesta $3.990." },
      { q: "¿Despachan fuera de la Región Metropolitana?", a: "Por ahora el despacho es solo dentro de la Región Metropolitana." },
    ],
  },
  {
    title: "Retiro en tienda",
    items: [
      { q: "¿Puedo retirar mi pedido en tienda?", a: "Sí. Puedes retirar en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00." },
      { q: "¿Qué debo llevar para retirar?", a: "Indica tu número de pedido, que tiene el formato NE-xxxxxx, al momento del retiro." },
    ],
  },
  {
    title: "Pagos",
    items: [
      { q: "¿Qué medios de pago aceptan?", a: "Puedes pagar con Flow o con transferencia bancaria." },
      { q: "¿Cuándo se confirma un pago por transferencia?", a: "Las transferencias se confirman de forma manual. Tu pedido queda registrado con su número NE-xxxxxx mientras esperamos el pago." },
    ],
  },
  {
    title: "Pedidos y seguimiento",
    items: [
      { q: "¿Qué es el número NE-xxxxxx?", a: "Es el número de tu pedido. Lo recibes al terminar tu compra y te sirve para retirar en tienda o consultar por tu pedido." },
      { q: "¿Cómo hago un cambio o devolución?", a: "Escríbenos desde la página de contacto o revisa la página de cambios y devoluciones. Las condiciones están en revisión." },
    ],
  },
  {
    title: "Productos y uso responsable",
    items: [
      { q: "¿Los suplementos reemplazan una alimentación variada?", a: "No. Son suplementos alimentarios y no reemplazan una alimentación variada y equilibrada." },
      { q: "¿Dónde veo cómo usar cada producto?", a: "En el rótulo de cada frasco. Si tienes dudas, consulta a un profesional de la salud antes de usarlo." },
    ],
  },
];
