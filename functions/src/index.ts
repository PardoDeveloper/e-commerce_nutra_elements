// Punto de entrada: solo exporta las funciones. La lógica vive en las carpetas de dominio.
import "./common/options.js";

// Las funciones del contrato (docs/team/contracts/functions.md, sección 2) se exportan aquí
// a medida que se implementen:
//   orders/    -> createOrder, getOrderStatus, resolvePaymentReview,
//                 cancelOrder, updateFulfillment, recordManualRefund, releaseExpiredReservations
//   payments/  -> createFlowPayment, flowConfirm
//   metrics/   -> lógica de métricas (compartida por orders/)
//   common/    -> opciones globales, errores, validación, autorización, utilidades puras

// catalog/: importCatalog, importPrices, importStock, applyDiscount, setProductsPublished,
// createProduct, updateProductCommerce, deleteProducts, restoreProducts.
export * from "./catalog/index.js";
// admin/: claimAdmin, grantAdmin, revokeAdmin (otro agente).
export * from "./admin/index.js";
// triggers/: revalidación ISR (otro agente).
export * from "./triggers/index.js";
// orders/: createOrder, getOrderStatus, resolvePaymentReview, cancelOrder,
// updateFulfillment, recordManualRefund, releaseExpiredReservations.
export * from "./orders/index.js";
// payments/: createFlowPayment, flowConfirm, getFlowCredentialsStatus, setFlowCredentials.
export * from "./payments/index.js";
// contact/: submitContactMessage (formulario de /contacto).
export * from "./contact/index.js";
