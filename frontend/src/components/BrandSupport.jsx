import { getBrandSupport } from "../services/brandSupport";

export default function BrandSupport({ brand, category }) {
  const contact = getBrandSupport(brand, category);
  return <aside className="technical-catalog-brand-support" aria-label={`Assistance ${brand}`}>
    {contact ? <>
      <strong>Hotline{contact.phone && <> : <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a></>}</strong>
      {contact.tariff && <small>{contact.tariff}</small>}
      {contact.note && <p>{contact.note}</p>}
      <a href={contact.source} target="_blank" rel="noopener noreferrer">Coordonnées du constructeur ↗</a>
    </> : <p>Le numéro d’assistance de cette marque reste à vérifier.</p>}
  </aside>;
}
