// Public QR readers may see the verified event, never the professional's
// free-text notes, client details, technical measurements, or internal IDs.
export function serializePublicIntervention(intervention) {
  return {
    id: intervention.id,
    interventionAt: intervention.intervention_at,
    interventionType: intervention.intervention_type,
    resultStatus: intervention.result_status,
    polygonConfirmedAt: intervention.polygon_confirmed_at,
  };
}
