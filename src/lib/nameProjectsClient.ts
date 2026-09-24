import { z } from "zod";
import { accountRequest, readAccountSession } from "@/integrations/neon/auth";
import { assertAccountSessionOwner, type AccountRequestScope } from "./accountRequestScope";
import { throwIfCancelled } from "./abort";
import { NAME_PROJECT_LIMIT, nameProjectBriefSchema, nameProjectInputSchema, nameProjectSchema, type NameProject, type NameProjectInput } from "../../shared/name-projects";

const snapshotSchema = z.object({ accountId: z.string().min(1).max(200), requestId: z.string().regex(/^req_[A-Za-z0-9_-]{16}$/u), projects: z.array(nameProjectSchema).max(NAME_PROJECT_LIMIT) }).strict();
export type NameProjectsSnapshot = { accountId: string; requestId: string; projects: NameProject[] };
export type NameProjectsErrorCode = "unavailable" | "disabled" | "conflict" | "invalid" | "invalid_response" | "account_changed" | "unauthenticated" | "verification_required" | "limit" | "saved_domain_required" | "rate_limited";
export class NameProjectsError extends Error {
  constructor(readonly code: NameProjectsErrorCode, readonly requestId?: string) { super(code); this.name = "NameProjectsError"; }
}
export function parseNameProjectsSnapshot(value: unknown, accountId: string): NameProjectsSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new NameProjectsError("invalid_response");
  if (parsed.data.accountId !== accountId) throw new NameProjectsError("account_changed");
  const rows = parsed.data.projects;
  if (new Set(rows.map(row => row.id.toLowerCase())).size !== rows.length || rows.some(row =>
    new Set(row.shortlistDomains).size !== row.shortlistDomains.length || Date.parse(row.updatedAt) < Date.parse(row.createdAt))) throw new NameProjectsError("invalid_response");
  return parsed.data as NameProjectsSnapshot;
}
/** An idempotent retry may lose deleted saved-domain references, but never add or reorder them. */
export function confirmNameProjectSave(snapshot: NameProjectsSnapshot, input: NameProjectInput): NameProject {
  const row = snapshot.projects.find(project => project.id === input.id);
  const brief = (value: NameProject | NameProjectInput) => {
    const parsed = nameProjectBriefSchema.parse(Object.fromEntries(Object.entries(value).filter(([key]) => Object.prototype.hasOwnProperty.call(nameProjectBriefSchema.shape, key))));
    // An older editor can omit brandShortlist. The store preserves that field;
    // a caller supplying it must receive the exact configuration it saved.
    if (input.brandShortlist === undefined) delete parsed.brandShortlist;
    return parsed;
  };
  if (!row || row.version !== input.expectedVersion + 1 || JSON.stringify(brief(row)) !== JSON.stringify(brief(input))) throw new NameProjectsError("invalid_response");
  const positions = row.shortlistDomains.map(domain => input.shortlistDomains.indexOf(domain));
  if (positions.some((position, index) => position < 0 || index > 0 && position <= positions[index - 1])) throw new NameProjectsError("invalid_response");
  return row;
}
async function request(scope: AccountRequestScope, raw?: NameProjectInput, save = false): Promise<NameProjectsSnapshot> {
  const accountId = scope?.accountId, signal = scope?.signal;
  try {
    throwIfCancelled(signal);
    if (typeof accountId !== "string" || !accountId.trim()) throw new NameProjectsError("unauthenticated");
    const parsed = save ? nameProjectInputSchema.safeParse(raw) : null;
    if (parsed && !parsed.success) throw new NameProjectsError("invalid");
    // Schema parsing deep-copies and normalizes before the first asynchronous boundary.
    const input = parsed?.success ? parsed.data as NameProjectInput : null;
    // Match the server's UTF-8 envelope limit before transport. A rejected body
    // is editable input, not an uncertain write that should be retried forever.
    if (input && new TextEncoder().encode(JSON.stringify({ action: "save", project: input })).byteLength > 32768) throw new NameProjectsError("invalid");
    const value = await accountRequest<unknown>("/api/account/name-projects", { accountId, signal, ...(input ? { method: "POST", body: { action: "save", project: input } } : {}) });
    throwIfCancelled(signal);
    const snapshot = parseNameProjectsSnapshot(value, accountId);
    const session = await readAccountSession();
    throwIfCancelled(signal);
    if (!session || typeof session.expires_at !== "number" || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now() / 1000) throw new NameProjectsError("unauthenticated");
    assertAccountSessionOwner(session.user?.id, accountId);
    if (input) confirmNameProjectSave(snapshot, input);
    return snapshot;
  } catch (cause) {
    if (signal?.aborted || cause instanceof NameProjectsError) throw cause;
    const detail = (cause && typeof cause === "object" ? cause : {}) as { status?: number; code?: string; requestId?: string };
    const code: NameProjectsErrorCode = detail.code === "account_changed" ? "account_changed" : detail.status === 401 ? "unauthenticated" :
      detail.status === 403 ? "verification_required" : detail.status === 404 ? "disabled" : detail.code === "project_limit" ? "limit" :
      detail.code === "saved_domain_required" ? "saved_domain_required" : detail.status === 409 ? "conflict" : detail.status === 429 ? "rate_limited" : detail.status === 400 || detail.status === 413 ? "invalid" : "unavailable";
    throw new NameProjectsError(code, typeof detail.requestId === "string" && /^req_[A-Za-z0-9_-]{16}$/u.test(detail.requestId) ? detail.requestId : undefined);
  }
}
export const getNameProjects = (scope: AccountRequestScope) => request(scope);
export const saveNameProject = (scope: AccountRequestScope, input: NameProjectInput) => request(scope, input, true);
