export function refreshShibaUsage() {
  window.dispatchEvent(new Event("shiba-usage-changed"));
}
