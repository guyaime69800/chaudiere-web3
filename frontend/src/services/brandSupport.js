// Contacts France : sources constructeur, vérifiés le 20 octobre 2026.
const technical = (phone, source, tariff = "Service 0,15 €/min + prix d’appel") => ({ phone, source, tariff, label: "Assistance technique professionnelle" });
const contacts = {
  vaillant: technical("08 26 27 03 03", "https://www.myvaillantpro.fr/nous-contacter/le-service-technique-vaillant"),
  chappee: technical("08 25 95 01 01", "https://www.chappee.com/media/files/catalogue-tarif/chapitres-catalogue-2024/univers-chappee-2025"),
  dedietrich: technical("08 25 33 82 82", "https://aleziom.dedietrich-thermique.fr/medias/fichiers/doc_pro_alezio_m_installateurs.pdf"),
  saunierduval: technical("08 20 200 820", "https://www.saunierduval.fr/france/download/guide/livret-tarifs/sd-tarif-24-maj-240201-2810591.pdf"),
  elmleblanc: technical("08 20 00 40 00", "https://www.elmleblanc.fr/media/country_pool_1/leblanc/documents_page/pdf/bd_elm_optibox_plaquette_8-pages.pdf", "Service 0,12 €/min + prix d’appel"),
  bosch: technical("08 20 00 40 00", "https://www.bosch-industrial.com/fr/fr/tertiaire-et-industrie/services/contact-service-apres-vente/", "Service 0,12 €/min + prix d’appel"),
  chaffoteaux: { phone: "01 55 84 94 94", label: "Contact constructeur", source: "https://chaffoteaux.fr/mentions-legales-credits/" },
  frisquet: { phone: "01 60 09 91 00", label: "Contact constructeur", source: "https://pro.frisquet.com/fr/mention-legales_2506.html" },
  viessmann: { label: "Assistance professionnelle", note: "Numéro réservé aux partenaires, disponible dans le portail professionnel, rubrique Informer.", source: "https://www.viessmann.fr/fr/professionnels/service-technique.html" },
};
export function getBrandSupport(brand, category) {
  const key = String(brand || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "atlantic" && ["boiler", "heat_pump", "heat_pump_indoor", "heat_pump_outdoor"].includes(category)) {
    return { phone: "03 51 42 70 42", label: "Assistance PAC et chaudières", source: "https://www.atlantic-pros.fr/Services-pros/Atlantic-PRO-Assistance/Assistance-telephonique" };
  }
  return contacts[key] || null;
}
