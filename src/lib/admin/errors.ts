// Error de las operaciones del admin. Calca el `HttpsError` con `details.code` del contrato.
export class AdminServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminServiceError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof AdminServiceError) return `${error.message} (${error.code})`;
  if (error instanceof Error) return error.message;
  return "Error desconocido.";
}
