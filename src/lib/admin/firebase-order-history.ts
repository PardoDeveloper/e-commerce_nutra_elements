// Historial de pedidos contra Firestore (/admin/pedidos/historial con Firebase). El admin solo escucha los últimos
// ORDERS_LIMIT pedidos; el historial pide al servidor TODOS los cerrados, de 25 en 25, con cursores (`startAfter`).
//
// Consultas (índices en data-model.md 5):
//  - Entregados: paymentStatus == "paid" && fulfillmentStatus == "delivered", orderBy createdAt desc.
//  - Cancelados / reembolsados / expirados: paymentStatus == X, orderBy createdAt desc.
//  - Todos: OR de las dos anteriores (paymentStatus in [...] || (paid && delivered)).
//  - Fechas: createdAt >= inicio del día "desde" y < día siguiente a "hasta" (America/Santiago).
//  - Búsqueda: número exacto (getDoc por ID) o correo completo (customer.email ==, sin orderBy); el resultado se
//    filtra y pagina en memoria con las mismas reglas que la demo.
import {
  and,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  or,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QueryFilterConstraint,
} from "firebase/firestore";
import { mapOrder } from "./firebase-mappers";
import type { AdminOrder } from "./types";
import {
  CLOSED_STATUSES,
  createHistoryPager,
  filterHistory,
  historyDateRange,
  paginate,
  parseHistorySearch,
  type ClosedStatus,
  type HistoryFilters,
  type HistoryResult,
  type OrderHistorySource,
} from "./order-history";

/** Máximo de pedidos de un mismo correo que se leen para la búsqueda. */
export const EMAIL_SEARCH_LIMIT = 100;

function statusFilter(status: HistoryFilters["status"]): QueryFilterConstraint {
  const delivered = and(where("paymentStatus", "==", "paid"), where("fulfillmentStatus", "==", "delivered"));
  if (status === "delivered") return delivered;
  if (status !== "all") return and(where("paymentStatus", "==", status));
  return or(where("paymentStatus", "in", ["cancelled", "refunded", "expired"]), delivered);
}

/** Consulta de los pedidos cerrados con los filtros de estado y fechas, del más reciente al más antiguo. */
function historyQuery(db: Firestore, f: Pick<HistoryFilters, "status" | "from" | "to">): Query {
  const { start, end } = historyDateRange(f);
  const filters: QueryFilterConstraint[] = [statusFilter(f.status)];
  if (start !== null) filters.push(and(where("createdAt", ">=", Timestamp.fromMillis(start))));
  if (end !== null) filters.push(and(where("createdAt", "<", Timestamp.fromMillis(end))));
  return query(collection(db, "orders"), and(...filters), orderBy("createdAt", "desc"));
}

const mapSnap = (d: QueryDocumentSnapshot) => mapOrder(d.id, d.data({ serverTimestamps: "estimate" }));

export function createFirestoreOrderHistory(db: Firestore): OrderHistorySource {
  // Solo se recuerdan los cursores de los últimos filtros: al cambiarlos se empieza de nuevo.
  let current: { key: string; page: (n: number) => Promise<HistoryResult> } | null = null;

  async function searchPage(f: HistoryFilters, n: number): Promise<HistoryResult> {
    const search = parseHistorySearch(f.query);
    if (search.kind === "unsupported") return { ...paginate([], 1), unsupportedQuery: true };
    let found: AdminOrder[] = [];
    if (search.kind === "number") {
      const snap = await getDoc(doc(db, "orders", search.orderNumber));
      found = snap.exists() ? [mapOrder(snap.id, snap.data({ serverTimestamps: "estimate" }))] : [];
    } else if (search.kind === "email") {
      const snap = await getDocs(query(collection(db, "orders"), where("customer.email", "==", search.email), limit(EMAIL_SEARCH_LIMIT)));
      found = snap.docs.map(mapSnap);
    }
    // El texto ya se resolvió en la consulta; estado y fechas se aplican como en la demo.
    return paginate(filterHistory(found, { ...f, query: "" }), n);
  }

  return {
    async counts() {
      const entries = await Promise.all(
        CLOSED_STATUSES.map(async (s) => [s, (await getCountFromServer(historyQuery(db, { status: s, from: "", to: "" }))).data().count] as const),
      );
      return Object.fromEntries(entries) as Record<ClosedStatus, number>;
    },

    page(f, n) {
      if (f.query.trim()) return searchPage(f, n);
      const key = JSON.stringify([f.status, f.from, f.to]);
      if (current?.key !== key) {
        const base = historyQuery(db, f);
        current = {
          key,
          page: createHistoryPager<QueryDocumentSnapshot>(
            async (after, count) => {
              const snap = await getDocs(after ? query(base, startAfter(after), limit(count)) : query(base, limit(count)));
              return { items: snap.docs.map(mapSnap), last: snap.docs.at(-1) ?? null };
            },
            async () => (await getCountFromServer(base)).data().count,
          ),
        };
      }
      return current.page(n);
    },
  };
}
