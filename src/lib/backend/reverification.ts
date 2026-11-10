/** Match the database's conservative first-factor age check. This does not grant incident access. */
export function recentlyVerified(authenticatedAt: number, nowSeconds: number) {
  return Number.isFinite(authenticatedAt) && Number.isFinite(nowSeconds) &&
    authenticatedAt > 0 && authenticatedAt <= nowSeconds && nowSeconds - authenticatedAt <= 900;
}
