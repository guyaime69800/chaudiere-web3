// Reject conflicting rewrite selectors before dispatch. An allowed maintenance
// path must never be repurposed as a public API by adding another route flag.
export function ambiguousApiRoute(query = {}) {
  return Object.entries(query).filter(([key, value]) => key.endsWith('_route') && value === '1').length > 1;
}
