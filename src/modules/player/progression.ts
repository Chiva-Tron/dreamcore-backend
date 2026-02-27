type ProgressionTiers = {
  cardsTier: number;
  relicsTier: number;
  classesTier: number;
};

export type PlayerProgressionState = {
  nether_points: number;
  cards_tier: number;
  relics_tier: number;
  classes_tier: number;
};

const CARDS_TIER_THRESHOLDS = [0, 40, 100, 180];
const RELICS_TIER_THRESHOLDS = [0, 30, 80, 150];
const CLASSES_TIER_THRESHOLDS = [0, 60, 140, 240];

const UNLOCKABLE_CLASSES_BY_TIER: Record<number, string[]> = {
  1: ["no_class"],
  2: ["no_class", "titan"],
  3: ["no_class", "titan", "arcane"],
  4: ["no_class", "titan", "arcane", "umbralist"]
};

function resolveTierFromThresholds(points: number, thresholds: number[]): number {
  const safePoints = Math.max(0, Math.trunc(points));

  for (let index = thresholds.length - 1; index >= 0; index -= 1) {
    if (safePoints >= thresholds[index]) {
      return index + 1;
    }
  }

  return 1;
}

function sanitizeTier(value: number | undefined): number {
  const numeric = Number(value ?? 1);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.max(1, Math.trunc(numeric));
}

function parseCardTierValue(rawTier: string): number {
  const normalized = rawTier.trim().toLowerCase();
  if (!normalized || normalized === "none") {
    return 1;
  }

  if (normalized.includes("inicial")) {
    return 1;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  if (parsed <= 2) {
    return 1;
  }

  if (parsed <= 3) {
    return 2;
  }

  if (parsed <= 5) {
    return 3;
  }

  return 4;
}

function parseRelicTierValue(rawTier: string): number {
  const normalized = rawTier.trim().toLowerCase();
  if (!normalized || normalized === "none") {
    return 1;
  }

  if (normalized.includes("inicial")) {
    return 1;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.min(4, parsed);
}

export function calculateNetherPointsGain(score: number, currentFloor: number): number {
  const normalizedScore = Math.max(0, Math.trunc(score));
  const normalizedFloor = Math.max(1, Math.trunc(currentFloor));

  const scorePoints = Math.floor(normalizedScore / 100);
  const floorPoints = Math.floor(normalizedFloor / 5);

  return Math.max(1, scorePoints + floorPoints);
}

export function deriveTiersFromNetherPoints(netherPoints: number): ProgressionTiers {
  return {
    cardsTier: resolveTierFromThresholds(netherPoints, CARDS_TIER_THRESHOLDS),
    relicsTier: resolveTierFromThresholds(netherPoints, RELICS_TIER_THRESHOLDS),
    classesTier: resolveTierFromThresholds(netherPoints, CLASSES_TIER_THRESHOLDS)
  };
}

export function normalizePlayerProgression(state: PlayerProgressionState): PlayerProgressionState {
  return {
    nether_points: Math.max(0, Math.trunc(state.nether_points)),
    cards_tier: sanitizeTier(state.cards_tier),
    relics_tier: sanitizeTier(state.relics_tier),
    classes_tier: sanitizeTier(state.classes_tier)
  };
}

export function getUnlockedClasses(classesTier: number): string[] {
  const safeTier = Math.min(4, sanitizeTier(classesTier));
  return UNLOCKABLE_CLASSES_BY_TIER[safeTier] ?? UNLOCKABLE_CLASSES_BY_TIER[1];
}

export function isCardUnlocked(cardTier: string, playerCardsTier: number): boolean {
  const requiredTier = parseCardTierValue(cardTier);
  return requiredTier <= sanitizeTier(playerCardsTier);
}

export function isRelicUnlocked(relicTier: string, playerRelicsTier: number): boolean {
  const requiredTier = parseRelicTierValue(relicTier);
  return requiredTier <= sanitizeTier(playerRelicsTier);
}
