// The single implementation of "may this viewer see this resource?". Pure functions; the tier
// ladder (code -> rank) comes from the `tiers` table so a future top tier is one INSERT.
//
//   effectiveTier: a paid tier past its expiry counts as FREE (evaluated at read time, so access
//                  never depends on a cron job having run)
//   canAccess:     rank(effective viewer tier) >= rank(required tier); unknown codes fail closed

export type TierRanks = ReadonlyMap<string, number>;

export interface TierHolder {
  tier: string;
  tierExpiresAt: Date | null;
}

export function effectiveTier(user: TierHolder | null | undefined, now: Date = new Date()): string {
  if (!user) return "FREE";
  if (user.tier !== "FREE" && user.tierExpiresAt && user.tierExpiresAt.getTime() <= now.getTime()) return "FREE";
  return user.tier;
}

export function isExpired(user: TierHolder | null | undefined, now: Date = new Date()): boolean {
  return !!user && user.tier !== "FREE" && !!user.tierExpiresAt && user.tierExpiresAt.getTime() <= now.getTime();
}

export function rankOf(code: string, ranks: TierRanks): number {
  return ranks.get(code) ?? Number.POSITIVE_INFINITY; // unknown tier: nothing is enough
}

/** Highest rank this viewer can open (FREE rank for anonymous viewers). */
export function viewerRank(user: TierHolder | null | undefined, ranks: TierRanks, now: Date = new Date()): number {
  return ranks.get(effectiveTier(user, now)) ?? ranks.get("FREE") ?? 0;
}

export function canAccess(user: TierHolder | null | undefined, required: string, ranks: TierRanks, now: Date = new Date()): boolean {
  return viewerRank(user, ranks, now) >= rankOf(required, ranks);
}
