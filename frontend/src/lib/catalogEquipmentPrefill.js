const EQUIPMENT_TYPES = new Set(["boiler", "heat_pump", "air_conditioning", "vmc", "rooftop"]);

export function catalogEquipmentPrefill(model) {
  const category = String(model?.type || "");
  const equipmentType = category.startsWith("heat_pump_") ? "heat_pump"
    : category.startsWith("air_conditioning_") ? "air_conditioning"
      : EQUIPMENT_TYPES.has(category) ? category : "other";

  return {
    equipmentType,
    brand: String(model?.brand || "").trim(),
    model: String(model?.model || "").trim(),
    productReference: String(model?.manufacturerReference || "").trim(),
    serialNumber: "",
  };
}
