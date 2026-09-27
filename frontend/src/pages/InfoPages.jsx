import { Link } from "react-router-dom";
import "./InfoPages.css";

function InfoLayout({ title, eyebrow, children }) {
  return <main className="info-page"><Link className="info-page__back" to="/">← Retour à CarnetPass</Link><header><span>{eyebrow}</span><h1>{title}</h1></header><div className="info-page__body">{children}</div></main>;
}

function DraftNotice() {
  return <div className="info-draft" role="note"><strong>Brouillon en Preview</strong><p>Ces informations doivent être complétées et validées avant publication sur le site de Production.</p></div>;
}

function Placeholder({ children }) {
  return <span className="info-placeholder">À compléter : {children}</span>;
}

export function FaqPage() {
  return <InfoLayout title="Questions fréquentes" eyebrow="Aide CarnetPass">
    <section><h2>À quoi sert CarnetPass ?</h2><p>CarnetPass rassemble les informations d’un équipement, son carnet d’entretien, les interventions et les documents techniques disponibles pour son modèle.</p></section>
    <section><h2>Qui peut créer un espace professionnel ?</h2><p>Un professionnel peut créer un compte, rattacher son entreprise et suivre ses équipements. Certaines fonctions techniques demandent une entreprise vérifiée.</p></section>
    <section><h2>Comment retrouver un appareil ?</h2><p>Depuis l’accueil, saisissez son identifiant CarnetPass ou utilisez son QR code. Les informations visibles dépendent de vos droits d’accès.</p></section>
    <section><h2>Comment fonctionne Shiba Bot ?</h2><p>Shiba Bot s’appuie sur les documents techniques disponibles pour le modèle. Si aucun document n’est disponible, une recherche Web peut être proposée et les sources sont indiquées. Vérifiez toujours la référence exacte, la notice et la page citée avant une intervention.</p></section>
    <section><h2>Que se passe-t-il si le quota IA est atteint ?</h2><p>En Preview, le compteur teste une limite de 20 questions par mois pour Découverte et 200 par mois et par technicien pour Pro. Seules les nouvelles questions IA sont suspendues jusqu’à la remise à zéro. Les carnets et documents restent accessibles. Ces limites sont encore à valider.</p></section>
    <section><h2>Peut-on s’abonner ou payer aujourd’hui ?</h2><p>Non. Les offres sont présentées pour recueillir des retours, mais leurs tarifs et le paiement ne sont pas encore activés. Consultez la <Link to="/tarifs">page des offres en préparation</Link>.</p></section>
    <section><h2>Où trouver les informations sur mes données ?</h2><p>Consultez la <Link to="/confidentialite">page Confidentialité</Link> et la page <Link to="/cookies">Cookies et stockage local</Link>. Les modalités de contact et de conservation doivent encore être finalisées avant ouverture commerciale.</p></section>
  </InfoLayout>;
}

export function LegalNoticePage() {
  return <InfoLayout title="Mentions légales" eyebrow="Informations sur l’éditeur">
    <DraftNotice />
    <section><h2>Éditeur de CarnetPass</h2><p><Placeholder>raison sociale ou nom de l’entrepreneur, forme juridique</Placeholder></p><p><Placeholder>adresse du siège, SIREN/SIRET, RCS ou RM le cas échéant, capital social le cas échéant, numéro de TVA intracommunautaire le cas échéant</Placeholder></p><p><Placeholder>e-mail et numéro de téléphone de contact</Placeholder></p></section>
    <section><h2>Direction de la publication</h2><p><Placeholder>nom du directeur ou de la directrice de publication</Placeholder></p></section>
    <section><h2>Hébergement</h2><p>Le site utilise l’infrastructure Vercel. <Placeholder>raison sociale, adresse et téléphone de l’hébergeur contractuel à confirmer depuis le contrat Vercel</Placeholder></p></section>
    <section><h2>Propriété intellectuelle</h2><p>Le nom et les contenus propres à CarnetPass sont réservés à leurs titulaires. Les notices et documents de fabricants conservent leurs droits respectifs. Leur mise à disposition ne signifie pas que les fabricants approuvent CarnetPass.</p></section>
    <section><h2>Contact</h2><p><Placeholder>adresse e-mail de contact et de signalement des contenus</Placeholder></p></section>
  </InfoLayout>;
}

export function PrivacyPage() {
  return <InfoLayout title="Confidentialité" eyebrow="Données personnelles">
    <DraftNotice />
    <section><h2>Responsable et contact</h2><p><Placeholder>identité et coordonnées du responsable du traitement, contact pour les droits, délégué à la protection des données si désigné</Placeholder></p></section>
    <section><h2>Données utilisées et finalités</h2><p>Pour fournir le service, CarnetPass traite les données du compte professionnel (nom, e-mail, identifiant), de l’entreprise, des équipements, des interventions, des carnets et des fichiers envoyés. Les questions posées à Shiba Bot et les extraits techniques utiles sont transmis au service d’IA pour générer une réponse. Des données techniques de sécurité, telles que l’adresse IP et les compteurs de requêtes, servent à protéger le service.</p><p>Les bases juridiques envisagées sont l’exécution du service demandé et l’intérêt légitime de sécuriser la plateforme. <Placeholder>validation des bases juridiques et du rôle de CarnetPass lorsque les entreprises saisissent des données concernant leurs propres clients</Placeholder></p></section>
    <section><h2>Destinataires et prestataires</h2><p>Les fonctions du service s’appuient notamment sur Supabase pour les comptes et la base de données, Vercel pour l’hébergement et certains fichiers, Upstash pour la limitation des requêtes, et OpenAI pour Shiba Bot. La recherche Web de Shiba peut consulter des sources externes. Une fonction distincte peut inscrire des informations sur la blockchain Polygon après action explicite de l’utilisateur : ces données publiques peuvent être difficilement effaçables.</p><p><Placeholder>liste contractuelle des sous-traitants, lieux d’hébergement, transferts éventuels hors EEE et garanties applicables</Placeholder></p></section>
    <section><h2>Durées de conservation</h2><p><Placeholder>durées ou critères pour comptes, carnets, pièces jointes, questions IA, journaux techniques et sauvegardes</Placeholder></p></section>
    <section><h2>Vos droits</h2><p>Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité de vos données lorsque ces droits s’appliquent, ainsi que vous opposer à certains traitements. Vous pouvez également saisir la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">CNIL</a>. <Placeholder>adresse de contact et procédure de vérification des demandes</Placeholder></p></section>
    <section><h2>Précaution pour les données inscrites sur la blockchain</h2><p>Ne saisissez pas de nom, adresse, téléphone, e-mail ou autre donnée personnelle dans un champ destiné à une inscription sur la blockchain. Le contrôle automatique de l’application ne peut pas garantir la détection de toutes les données personnelles.</p></section>
  </InfoLayout>;
}

export function CookiesPage() {
  return <InfoLayout title="Cookies et stockage local" eyebrow="Fonctionnement du site">
    <DraftNotice />
    <section><h2>Ce que l’application utilise</h2><p>La connexion professionnelle utilise un stockage local du navigateur pour conserver la session. Le service worker de l’application peut mettre en cache des fichiers nécessaires à l’affichage et à l’usage hors ligne. Des éléments techniques de sécurité peuvent être utilisés par les prestataires d’hébergement et d’authentification.</p></section>
    <section><h2>Mesure d’audience et publicité</h2><p>L’audit du code de cette Preview n’a identifié aucun traceur publicitaire ni outil de mesure d’audience intégré à l’application. Aucun cookie optionnel n’est activé par cette page. <Placeholder>vérification finale des réglages Vercel, Supabase et de tout outil ajouté avant Production</Placeholder></p></section>
    <section><h2>Gérer le stockage</h2><p>Vous pouvez supprimer les données du site dans les réglages de votre navigateur. Cela peut vous déconnecter et effacer des fichiers gardés pour une utilisation hors ligne. Si des traceurs optionnels sont ajoutés plus tard, un choix préalable et modifiable sera mis en place selon leur finalité.</p></section>
  </InfoLayout>;
}

export function TermsPage() {
  return <InfoLayout title="Conditions d’utilisation" eyebrow="Projet de conditions">
    <DraftNotice />
    <section><h2>Objet</h2><p>CarnetPass permet aux professionnels de suivre des équipements, de créer des carnets et d’accéder à des documents techniques et à Shiba Bot. Les fonctions accessibles peuvent évoluer pendant la Preview.</p></section>
    <section><h2>Compte et accès</h2><p>Chaque utilisateur doit fournir des informations exactes, protéger ses identifiants et utiliser le service dans le cadre de son activité autorisée. Les droits d’équipe et la vérification de l’entreprise conditionnent certaines opérations.</p></section>
    <section><h2>Contenus déposés et données d’autrui</h2><p>L’entreprise doit disposer des droits nécessaires sur les documents et informations qu’elle ajoute et informer les personnes concernées lorsque leurs données sont saisies. Elle ne doit pas placer de données personnelles dans les champs inscrits sur la blockchain.</p></section>
    <section><h2>Documents techniques et IA</h2><p>Les documents doivent être rapprochés de la marque, du modèle et de la variante exacts. Shiba Bot aide à retrouver une information, mais ses réponses peuvent être incomplètes ou erronées. Un professionnel qualifié reste responsable de la vérification de la notice et de l’intervention.</p></section>
    <section><h2>Disponibilité, fin d’accès et litiges</h2><p><Placeholder>engagement de service, assistance, suspension, export et suppression des données, droit applicable, juridiction compétente et modalités de réclamation</Placeholder></p></section>
  </InfoLayout>;
}

export function SalesTermsPage() {
  return <InfoLayout title="Conditions commerciales" eyebrow="Projet avant paiement">
    <DraftNotice />
    <section><h2>Paiement fermé</h2><p>Aucun abonnement payant ne peut être souscrit depuis cette Preview. Les offres et les tarifs envisagés ne constituent pas une proposition contractuelle.</p></section>
    <section><h2>Points à arrêter avant l’ouverture</h2><ul><li>Prix validés, unité de facturation par technicien, devise, TVA, essai et date de facturation.</li><li>Modalités de paiement, factures, retard de paiement et éventuels frais applicables.</li><li>Durée, renouvellement, changement du nombre de techniciens, résiliation en ligne et effet de la résiliation.</li><li>Accès aux carnets et documents, export et conservation des données après la fin du contrat.</li><li>Responsabilités, assistance, disponibilité et traitement des réclamations.</li></ul></section>
    <section><h2>Version contractuelle</h2><p><Placeholder>CGV B2B complètes et validées avant tout paiement, avec identité du vendeur et barème des prix</Placeholder></p></section>
  </InfoLayout>;
}
