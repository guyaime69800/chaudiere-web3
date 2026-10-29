export function proInvitationDestination(location) {
  if (location?.pathname !== '/parametres-compte') return null;
  const token = new URLSearchParams(location.search || '').get('invitation');
  return /^[a-f0-9]{64}$/.test(token || '') ? `/parametres-compte?invitation=${token}#comptes` : null;
}
