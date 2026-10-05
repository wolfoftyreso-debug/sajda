export function indexNowPayload(origin: string, key: string, host: string): {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export function submitIndexNow(
  environment?: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
): Promise<{ submitted: boolean; reason: string; count?: number }>;
