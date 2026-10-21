import { FlowApiError, type CreatePaymentParams, type CreatePaymentResult, type FlowClient, type FlowPaymentStatus } from "../flow-client.js";

/** Cliente de Flow simulado e inyectable para los tests (no hace llamadas de red). */
export class FakeFlow implements FlowClient {
  /** Estados que `getStatus` conoce, por token. Un token ausente simula "Flow no lo reconoce" (400). */
  readonly statuses = new Map<string, FlowPaymentStatus>();
  readonly created: CreatePaymentParams[] = [];
  readonly statusCalls: string[] = [];
  /** Si se define, `getStatus` y `createPayment` lanzan este error. */
  failWith: FlowApiError | undefined;
  failCreateWith: FlowApiError | undefined;
  private seq = 0;

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    if (this.failWith) throw this.failWith;
    if (this.failCreateWith) throw this.failCreateWith;
    this.created.push(params);
    this.seq++;
    return { url: "https://sandbox.flow.cl/app/web/pay.php", token: `FLOWTOKEN${this.seq}`, flowOrder: 5000 + this.seq };
  }

  async getStatus(token: string): Promise<FlowPaymentStatus> {
    this.statusCalls.push(token);
    if (this.failWith) throw this.failWith;
    const status = this.statuses.get(token);
    if (!status) throw new FlowApiError("client", 400, 400);
    return status;
  }

  setStatus(token: string, status: Partial<FlowPaymentStatus> & { commerceOrder: string }): void {
    this.statuses.set(token, { flowOrder: 111, status: 2, amount: 32762, currency: "CLP", ...status });
  }
}
