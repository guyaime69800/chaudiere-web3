import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import cgvB2B from "../content/cgv-b2b.md?raw";
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
    <section><h2>Combien de temps dure la formule Découverte ?</h2><p>L’essai Découverte dure 5 jours et permet de créer jusqu’à 5 équipements. Sa date de fin est affichée dans les paramètres du compte. Aucune carte bancaire n’est nécessaire pour cet essai.</p></section>
    <section><h2>Que se passe-t-il si les crédits IA sont épuisés ?</h2><p>En Preview, les questions sur les documents et les recherches Web partagent les crédits Shiba Bot de la formule. Une fenêtre propose alors des recharges ponctuelles à 10 € ou 20 €{import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true" ? ", payables uniquement avec Stripe en mode test" : ", encore indisponibles à l’achat"}. Seules les nouvelles questions IA sont suspendues. La formule professionnelle se réinitialise le premier jour du mois en UTC ; l’essai Découverte ne se réinitialise pas. Les crédits ponctuels restants sont conservés. Les carnets, documents et historiques restent accessibles.</p></section>
    <section><h2>Peut-on tester l’abonnement professionnel ?</h2><p>Oui, pour un utilisateur sur la Preview lorsque le paiement de test est activé. Stripe affiche clairement son environnement de test : aucune somme réelle n’est prélevée et ce test ne modifie pas encore les droits CarnetPass. Vous pouvez gérer l’abonnement test depuis les paramètres du compte. Consultez les <Link to="/tarifs">tarifs</Link>.</p></section>
    <section><h2>Comment ajouter des utilisateurs à mon entreprise ?</h2><p>Le tarif prévu est de 28 € TTC par utilisateur et par mois. L’ajout autonome de comptes et l’ajustement de la facturation au nombre d’utilisateurs sont encore en préparation. Pour un besoin particulier, écrivez à <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>.</p></section>
    <section><h2>Comment nous contacter ou demander la suppression de mon compte ?</h2><p>Écrivez à <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>. La suppression de l’accès est aussi disponible dans les paramètres du compte. Les historiques techniques déjà établis peuvent être conservés pour leur traçabilité.</p></section>
  </InfoLayout>;
}

export function LegalNoticePage() {
  return <InfoLayout title="Mentions légales" eyebrow="Informations sur l’éditeur">
    <DraftNotice />
    <section><h2>Éditeur de CarnetPass</h2><p><Placeholder>raison sociale ou nom de l’entrepreneur et forme juridique</Placeholder></p><p><Placeholder>adresse du siège, SIREN/SIRET, immatriculation, capital social et numéro de TVA si applicables</Placeholder></p><p>Contact : <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>. <Placeholder>numéro de téléphone professionnel</Placeholder></p></section>
    <section><h2>Direction de la publication</h2><p><Placeholder>nom du directeur ou de la directrice de publication</Placeholder></p></section>
    <section><h2>Hébergement</h2><p>Le site utilise l’infrastructure Vercel. <Placeholder>raison sociale, adresse et téléphone de l’hébergeur contractuel à confirmer depuis le contrat Vercel</Placeholder></p></section>
    <section><h2>Propriété intellectuelle</h2><p>© {new Date().getFullYear()} CarnetPass. Les textes, interfaces, visuels et contenus originaux de CarnetPass sont réservés à leurs titulaires. Les noms de marques, notices, schémas et autres documents de fabricants conservent leurs droits respectifs. Leur consultation dans CarnetPass ne signifie pas que les fabricants approuvent le service.</p><p>Pour demander la correction, le retrait ou l’attribution d’un document, écrivez à <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a> en indiquant le document concerné et vos droits.</p></section>
    <section><h2>Contact</h2><p>Pour toute question ou pour signaler un contenu : <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>.</p></section>
  </InfoLayout>;
}

export function PrivacyPage() {
  return <InfoLayout title="Confidentialité" eyebrow="Données personnelles">
    <DraftNotice />
    <section><h2>Téléphone professionnel et essai</h2><p>Le numéro de téléphone déclaré à l’inscription sert de contact et à limiter les essais Découverte répétés. Aucun SMS de vérification n’est envoyé à ce stade. Une empreinte du numéro peut être conservée pour empêcher sa réutilisation pour un nouvel essai ; elle ne permet pas de garantir l’identité d’une personne.</p></section>
    <section><h2>Responsable et contact</h2><p><Placeholder>identité juridique et adresse du responsable du traitement</Placeholder>. Pour toute question sur vos données ou pour exercer vos droits, écrivez à <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>.</p></section>
    <section><h2>Données utilisées et finalités</h2><p>Pour fournir le service, CarnetPass traite les données du compte professionnel (nom, e-mail, identifiant), de l’entreprise, des équipements, des interventions, des carnets et des fichiers envoyés. Les questions posées à Shiba Bot et les extraits techniques utiles sont transmis au service d’IA pour générer une réponse. Des données techniques de sécurité, telles que l’adresse IP et les compteurs de requêtes, servent à protéger le service.</p><p>Pour une demande de formule Entreprise, le questionnaire recueille votre nom, vos coordonnées professionnelles, l’entreprise, la taille de l’équipe et les besoins décrits. Ces informations servent à étudier votre demande et à vous répondre par e-mail.</p><p>Les bases juridiques envisagées sont l’exécution du service demandé, les démarches précontractuelles pour une demande de devis et l’intérêt légitime de sécuriser la plateforme. <Placeholder>validation des bases juridiques et du rôle de CarnetPass lorsque les entreprises saisissent des données concernant leurs propres clients</Placeholder></p></section>
    <section><h2>Destinataires et prestataires</h2><p>Les fonctions du service s’appuient notamment sur Supabase pour les comptes et la base de données, Vercel pour l’hébergement et certains fichiers, Upstash pour la limitation des requêtes, OpenAI pour Shiba Bot, Stripe pour le paiement de test et Resend pour l’envoi des demandes Entreprise une fois ce service configuré. La recherche Web de Shiba peut consulter des sources externes. Une fonction distincte peut inscrire des informations sur la blockchain Polygon après action explicite de l’utilisateur : ces données publiques peuvent être difficilement effaçables.</p><p><Placeholder>liste contractuelle des sous-traitants, lieux d’hébergement, transferts éventuels hors EEE et garanties applicables</Placeholder></p></section>
    <section><h2>Durées de conservation</h2><p><Placeholder>durées ou critères pour comptes, carnets, pièces jointes, questions IA, journaux techniques et sauvegardes</Placeholder></p></section>
    <section><h2>Vos droits</h2><p>Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité de vos données lorsque ces droits s’appliquent, ainsi que vous opposer à certains traitements. Adressez votre demande à <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>. Une vérification de votre identité peut être nécessaire avant de traiter la demande. Vous pouvez également saisir la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">CNIL</a>.</p></section>
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
    <section><h2>Assistance et réclamations</h2><p>Pour signaler un problème ou formuler une réclamation, écrivez à <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>.</p></section>
    <section><h2>Fin d’accès et données</h2><p>La suppression du compte est accessible depuis les paramètres. Elle supprime l’accès et anonymise le profil ; les historiques techniques déjà établis peuvent rester conservés pour leur traçabilité. Pour toute demande sur les données conservées, contactez-nous à l’adresse indiquée ci-dessus.</p></section>
    <section><h2>Conditions à finaliser</h2><p><Placeholder>engagement de disponibilité, modalités d’assistance, suspension, export des données, droit applicable et juridiction compétente</Placeholder></p></section>
  </InfoLayout>;
}

export function SalesTermsPage() {
  const stripeTest = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";
  return <InfoLayout title="Conditions générales de vente B2B" eyebrow="Projet avant paiement">
    <DraftNotice />
    <section><h2>{stripeTest ? "Paiement de test" : "Paiement fermé"}</h2><p>{stripeTest ? "Seul l'environnement de test Stripe est disponible depuis cette Preview. Aucun paiement réel n'est prélevé et les droits payants ne sont pas activés par ce test." : "Aucun abonnement payant ne peut être souscrit depuis cette Preview. Les offres et les tarifs envisagés ne constituent pas une proposition contractuelle."}</p></section>
    <section><h2>Points à compléter avant publication</h2><p>Le document ci-dessous reprend votre projet de CGV B2B. Les champs entre crochets, notamment l’identité du fournisseur, la date de version et la durée d’export des données, restent à définir. Il ne constitue pas encore une version acceptée lors d’une souscription. Les offres actuellement présentées figurent sur la <Link to="/tarifs">page des formules</Link>.</p></section>
    <article className="info-page__markdown"><ReactMarkdown>{cgvB2B.replace(/^# Conditions générales de vente B2B — CarnetPass\s*/, "")}</ReactMarkdown></article>
  </InfoLayout>;
}
