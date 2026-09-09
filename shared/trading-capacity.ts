/** Server-owned, persisted for each run. Limits are ceilings, not promised findings. */
export const TRADING_CAPACITY = Object.freeze({
  profile: "trading-research-v3",
  sourceLimit: 24,
  candidateLimit: 600,
  candidatesPerSource: 25,
  attemptsPerRun: 900,
  runLifetimeSeconds: 259200,
  verificationMaxRounds: 3,
  verificationGapSeconds: Object.freeze([1200, 7200, 43200]),
  reportLimit: 30,
});
