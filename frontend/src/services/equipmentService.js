import { supabase } from "./supabaseClient";

function getEquipmentErrorMessage(error) {
  const message = error?.message || "";

  if (message.includes("doit être validée")) {
    return "Votre entreprise doit être validée avant d’ajouter un équipement.";
  }

  if (
    message.includes("numéro de série existe déjà") ||
    error?.code === "23505"
  ) {
    return "Ce numéro de série existe déjà dans votre entreprise.";
  }

  if (error?.code === "42501") {
    return "Votre compte ne permet pas d’ajouter cet équipement.";
  }

  if (error?.code === "22023") {
    return message || "Vérifiez les informations de l’équipement.";
  }

  return "Impossible d’enregistrer l’équipement. Veuillez réessayer.";
}

export async function getCompanyEquipments(companyId) {
  if (!companyId) {
    return [];
  }

  const { data, error } = await supabase
    .from("equipments")
    .select(
      "id, brand, model, product_reference, serial_number, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Impossible de charger les équipements.");
  }

  return data || [];
}

export async function createCompanyEquipment(companyId, equipment) {
  const { data, error } = await supabase.rpc(
    "create_company_equipment",
    {
      p_company_id: companyId,
      p_brand: equipment.brand.trim(),
      p_model: equipment.model.trim(),
      p_product_reference:
        equipment.productReference.trim() || null,
      p_serial_number: equipment.serialNumber.trim(),
    }
  );

  if (error) {
    throw new Error(getEquipmentErrorMessage(error));
  }

  return data;
}