export interface FactSignalFeedInput {
  tld?: string;
  limit?: number;
  environment?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: number;
}

export function getFactSignalFeed(input?: FactSignalFeedInput): Promise<unknown>;

export const factSignalSourcePolicy: {
  approvedSourceIds: string[];
  namebio: {
    id: string;
    mode: string;
    endpoint: string;
    documentationUrl: string;
    cacheTtlMs: number;
    minimumRequestIntervalMs: number;
  };
};
