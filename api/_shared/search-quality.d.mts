export interface NameQualitySignals {
  score: number;
  length: number;
  pronunciation: number;
  spelling: number;
}

export function asciiNameToken(value: string): string;
export function joinNameWords(left: string, right: string): string;
export function nameQualitySignals(label: string): NameQualitySignals;
export function interpretRdapResponse(
  status: number,
  contentType: string | null,
  text: string,
  domain: string,
): "available" | "taken" | "unknown";
export function registryRetryAt(retryAfter: string | null, now?: number): number;
export function readRegistryResponse(response: Response, maximumBytes?: number): Promise<string>;
