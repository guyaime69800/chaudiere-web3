export const PLATE_FIELDS = [
  "brand",
  "model",
  "productReference",
  "serialNumber",
  "manufactureYear",
  "equipmentType",
];
export const EQUIPMENT_TYPES = [
  "boiler",
  "heat_pump",
  "air_conditioning",
  "water_heater",
  "vmc",
  "other",
];
const compact = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const aliases = new Map([
  ["elmleblanc", "elmleblanc"],
  ["elm", "elmleblanc"],
  ["saunierduval", "saunierduval"],
  ["dedietrich", "dedietrich"],
]);
const brandKey = (v) => aliases.get(compact(v)) || compact(v);
export function plateCandidates(fields, catalog) {
  const brand = brandKey(fields.brand),
    ref = compact(fields.productReference),
    model = compact(fields.model);
  if (!brand) return [];
  return catalog
    .filter(
      (c) =>
        brandKey(c.brand) === brand &&
        (ref
          ? compact(c.manufacturerReference) === ref
          : Boolean(model && compact(c.model) === model)),
    )
    .map((c) => ({
      equipmentId: c.equipmentId,
      brand: c.brand,
      model: c.model,
      manufacturerReference: c.manufacturerReference,
    }));
}
export function sanitizePlateResult(raw) {
  const fields = {};
  for (const name of PLATE_FIELDS) {
    const source = raw?.fields?.[name];
    const value =
      typeof source?.value === "string"
        ? source.value.trim().slice(0, name === "serialNumber" ? 128 : 100)
        : "";
    const evidence =
      typeof source?.evidence === "string"
        ? source.evidence.trim().slice(0, 300)
        : "";
    let acceptable =
      value && evidence && compact(evidence).includes(compact(value));
    if (name === "manufactureYear")
      acceptable =
        acceptable &&
        /^(19|20)\d{2}$/.test(value) &&
        Number(value) <= new Date().getUTCFullYear() &&
        /fabric|manufact|production|baujahr|anno/i.test(evidence);
    if (name === "equipmentType")
      acceptable = value && EQUIPMENT_TYPES.includes(value) && evidence;
    fields[name] = {
      value: acceptable ? value : "",
      provenance: acceptable ? "plate_read" : "missing",
      evidence: acceptable ? evidence : "",
      uncertain: true,
    };
  }
  return {
    fields,
    warnings: [
      "Extraction à confirmer champ par champ. Une lecture IA ne garantit pas l’exactitude.",
      "Aucune année n’est déduite du numéro de série.",
    ],
  };
}
export function confirmPlateFields(values, analysis, candidate = null) {
  const fields = {};
  for (const name of PLATE_FIELDS) {
    const value = typeof values?.[name] === "string" ? values[name].trim() : "";
    if (value.length > (name === "serialNumber" ? 128 : 100))
      throw new Error("Champ trop long.");
    if (
      name === "manufactureYear" &&
      value &&
      (!/^(19|20)\d{2}$/.test(value) ||
        Number(value) > new Date().getUTCFullYear())
    )
      throw new Error("Année de fabrication invalide.");
    if (name === "equipmentType" && value && !EQUIPMENT_TYPES.includes(value))
      throw new Error("Type invalide.");
    const catalogValue =
      candidate?.[name === "productReference" ? "manufacturerReference" : name];
    const original = analysis?.fields?.[name];
    fields[name] = {
      value,
      provenance: !value
        ? "missing"
        : original?.value === value && original?.provenance === "plate_read"
          ? "plate_read"
          : catalogValue === value
            ? "catalog"
            : "manual",
      confirmed: true,
    };
  }
  return fields;
}
