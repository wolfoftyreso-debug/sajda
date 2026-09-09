import { isAnonymousSearchMode } from "@/lib/anonymousSearchMode";

export type ScanMode = "light" | "medium" | "heavy" | "deep";

export interface ScanModeConfig {
  id: ScanMode;
  label: string;
  durationSeconds: number;
}

/**
 * Execution settings belong to the domain layer, not the selector UI. The UI
 * supplies localized copy and icons while scans use these stable identifiers
 * and durations.
 */
export const SCAN_MODES: readonly ScanModeConfig[] = [
  { id: "light", label: "Light", durationSeconds: 60 },
  { id: "medium", label: "Medium", durationSeconds: 90 },
  { id: "heavy", label: "Heavy", durationSeconds: 120 },
  { id: "deep", label: "Deep", durationSeconds: 150 },
];

const ANONYMOUS_SCAN_MODES: readonly ScanModeConfig[] = [
  { id: "light", label: "Direct", durationSeconds: 60 },
  { id: "medium", label: "Playful", durationSeconds: 90 },
  { id: "heavy", label: "Broad", durationSeconds: 120 },
  { id: "deep", label: "Name studio", durationSeconds: 150 },
];

export function getScanModes(anonymousSearchMode = isAnonymousSearchMode()): readonly ScanModeConfig[] {
  return anonymousSearchMode ? ANONYMOUS_SCAN_MODES : SCAN_MODES;
}

export function getScanModeConfig(
  mode: string,
  anonymousSearchMode = isAnonymousSearchMode(),
): ScanModeConfig {
  const modes = getScanModes(anonymousSearchMode);
  return modes.find((candidate) => candidate.id === mode) ?? modes[1]!;
}
