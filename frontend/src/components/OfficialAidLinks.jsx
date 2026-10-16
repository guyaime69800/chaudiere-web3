import "./OfficialAidLinks.css";

const services = [
  ["Estimer mes aides avec France Rénov’", "https://france-renov.gouv.fr/aides/simulation", "Renseignez votre situation sur le simulateur du service public."],
  ["Mes Aides Réno", "https://mesaides.france-renov.gouv.fr/", "Simulateur officiel des aides à la rénovation énergétique."],
  ["Trouver un professionnel RGE", "https://france-renov.gouv.fr/annuaire-rge/recherche", "Recherchez une entreprise selon votre localisation et vos travaux."],
  ["Vérifier une qualification RGE", "https://france-renov.gouv.fr/annuaire-rge/identifier", "Vérifiez les domaines de travaux et la qualification à la date concernée."],
];

export default function OfficialAidLinks() {
  return <section className="official-aids" aria-label="Aides aux travaux et qualifications RGE">
    <h3>Aides aux travaux et qualifications RGE</h3>
    <p>Ces services publics externes réalisent leurs propres estimations. CarnetPass ne calcule pas d’aides et ne reçoit pas les informations que vous y saisissez. Les estimations restent indicatives.</p>
    <div className="official-aids__links">
      {services.map(([title, url, description]) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">
        <strong>{title} ↗</strong><span>{description}</span><small>{new URL(url).hostname} · nouvel onglet</small>
      </a>)}
    </div>
  </section>;
}
