export class AccountAccessError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "AccountAccessError";
  }
}
