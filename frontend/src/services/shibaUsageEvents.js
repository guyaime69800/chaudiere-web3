export function refreshShibaUsage() {
  window.dispatchEvent(new Event("shiba-usage-changed"));
}

export function openShibaRecharge(usage, force = false) {
  window.dispatchEvent(new CustomEvent("shiba-recharge-requested", { detail: { usage, force } }));
}
