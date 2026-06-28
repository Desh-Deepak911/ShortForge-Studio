/**
 * Planned StatsBomb data domains — not implemented yet.
 * @see StatsBombProvider
 */
export const STATSBOMB_FUTURE_OPERATIONS = [
  "events",
  "lineups",
  "xG",
  "passes",
  "pressures",
  "shots",
  "360",
] as const;

export type StatsBombFutureOperation = (typeof STATSBOMB_FUTURE_OPERATIONS)[number];

/** Returned for every StatsBomb operation until API integration lands. */
export const STATSBOMB_UNSUPPORTED = "Unsupported" as const;

export const STATSBOMB_INTEGRATION_MISSING_INPUT = "statsbomb_integration";
