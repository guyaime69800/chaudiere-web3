import "./EmergencyContacts.css";

export default function EmergencyContacts() {
  return (
    <aside id="contacts-urgence" className="emergency-contacts" aria-labelledby="emergency-contacts-title">
      <h3 id="emergency-contacts-title">Urgences et sécurité</h3>
      <p>En cas de danger immédiat, éloignez-vous et appelez les secours. Ces contacts ne remplacent pas l’entreprise qui entretient votre appareil.</p>
      <div className="emergency-contacts__list">
        <a href="tel:112"><strong>112</strong><span>Urgence européenne</span></a>
        <a href="tel:18"><strong>18</strong><span>Pompiers · incendie</span></a>
        <a href="tel:15"><strong>15</strong><span>SAMU · urgence médicale</span></a>
        <a href="sms:114"><strong>114</strong><span>Urgence par SMS · personnes sourdes ou malentendantes</span></a>
        <a href="tel:0800473333"><strong>0 800 47 33 33</strong><span>GRDF · fuite ou odeur de gaz naturel</span></a>
      </div>
      <p>Danger électrique sur le réseau : Enedis au <strong>09 72 67 50 + les deux chiffres du département</strong>. Ne touchez pas à l’installation dangereuse.</p>
      <p>Fuite d’eau, panne de chauffage ou plomberie sans danger immédiat : contactez d’abord <strong>l’entreprise chargée de votre installation</strong>, puis votre assurance ou votre syndic si nécessaire. Aucun numéro de dépanneur concurrent n’est proposé ici.</p>
      <small>Numéros indiqués pour la France métropolitaine. Si vous êtes ailleurs, utilisez les services d’urgence locaux.</small>
    </aside>
  );
}
