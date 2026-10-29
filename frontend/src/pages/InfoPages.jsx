import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import faq from "../content/faq.md?raw";
import legal from "../content/legal.md?raw";
import privacy from "../content/privacy.md?raw";
import cookies from "../content/cookies.md?raw";
import terms from "../content/terms.md?raw";
import sales from "../content/cgv-b2b.md?raw";
import "./InfoPages.css";

function InfoLayout({ title, children, version = "12 octobre 2026" }) {
  return <main className="info-page"><Link className="info-page__back" to="/">← Retour à CarnetPass</Link><header><span>Informations CarnetPass</span><h1>{title}</h1></header><div className="info-page__body"><p>Version du {version}</p><article className="info-page__markdown"><ReactMarkdown>{children}</ReactMarkdown></article></div></main>;
}
export function FaqPage() { return <InfoLayout title="Questions fréquentes">{faq}</InfoLayout>; }
export function LegalNoticePage() { return <InfoLayout title="Mentions légales" version="20 octobre 2026">{legal}</InfoLayout>; }
export function PrivacyPage() { return <InfoLayout title="Confidentialité" version="20 octobre 2026">{privacy}</InfoLayout>; }
export function CookiesPage() { return <InfoLayout title="Cookies et stockage local">{cookies}</InfoLayout>; }
export function TermsPage() { return <InfoLayout title="Conditions d’utilisation" version="20 octobre 2026">{terms}</InfoLayout>; }
export function SalesTermsPage() { return <InfoLayout title="Conditions générales de vente B2B" version="20 octobre 2026">{sales}</InfoLayout>; }
