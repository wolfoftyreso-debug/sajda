/** Public account identity. Authentication credentials stay in HttpOnly cookies. */
export interface AccountUser {
  id: string;
  email?: string | null;
  email_verified?: boolean;
  created_at: string;
  last_sign_in_at?: string | null;
}

export interface AccountSession {
  user: AccountUser;
  /** Unavailable to legacy integrations. Never populated or read from cookies. */
  access_token?: never;
  expires_at?: number | null;
}
