// Heurística liviana y best-effort: no bloquea nada, solo marca la fila
// para que las estadísticas puedan excluir tráfico obviamente automático.
const BOT_PATTERN =
  /bot|crawler|spider|facebookexternalhit|whatsapp|slurp|preview|headless/i;

export function isLikelyBot(userAgent?: string): boolean {
  return userAgent ? BOT_PATTERN.test(userAgent) : false;
}
