const previewDeploymentHost = /^(?:chaudiere-web3|carnetpass)-[a-z0-9]+-chaudiere-web3\.vercel\.app$/;

export function isTrustedCarnetPassQrOrigin(origin, currentOrigin) {
  try {
    const url = new URL(origin);
    if (url.origin === currentOrigin) return true;
    if (url.protocol !== "https:") return false;
    return ["carnetpass.fr", "www.carnetpass.fr", "carnetpass.com", "www.carnetpass.com", "test.carnetpass.fr"].includes(url.hostname)
      || previewDeploymentHost.test(url.hostname);
  } catch {
    return false;
  }
}

export function publicQrUrl(origin, identifier) {
  const url = new URL(origin);
  const hostname = url.hostname.toLowerCase();
  const base = hostname === "test.carnetpass.fr" || previewDeploymentHost.test(hostname)
    ? "https://test.carnetpass.fr"
    : ["carnetpass.fr", "www.carnetpass.fr"].includes(hostname)
      ? "https://www.carnetpass.fr"
      : url.origin;
  return `${base}/appareil/${encodeURIComponent(identifier)}`;
}
