// Segundos que faltan para poder sumar otro sello (0 si no hay cooldown).
export function cooldownRemainingSeconds(
  lastStampAt: Date | null,
  cooldownMinutes: number,
  now: Date,
): number {
  if (!lastStampAt) return 0;
  const endsAt = lastStampAt.getTime() + cooldownMinutes * 60_000;
  return Math.max(0, Math.ceil((endsAt - now.getTime()) / 1000));
}

export function cooldownStatus(
  lastStampAt: Date | null,
  cooldownMinutes: number,
  now: Date,
) {
  const retryAfterSeconds = cooldownRemainingSeconds(
    lastStampAt,
    cooldownMinutes,
    now,
  );
  return {
    active: retryAfterSeconds > 0,
    lastStampAt: lastStampAt?.toISOString() ?? null,
    retryAfterSeconds,
  };
}
