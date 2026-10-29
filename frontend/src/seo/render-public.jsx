import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import HomeLanding from "../components/HomeLanding";
import SiteFooter from "../components/SiteFooter";
import { CookiesPage, FaqPage, LegalNoticePage, PrivacyPage, SalesTermsPage, TermsPage } from "../pages/InfoPages";

const pages = { "/faq": FaqPage, "/mentions-legales": LegalNoticePage, "/confidentialite": PrivacyPage,
  "/cookies": CookiesPage, "/conditions-utilisation": TermsPage, "/conditions-commerciales": SalesTermsPage };
export function renderPublic(pathname, maintenance) {
  const Page = pages[pathname];
  return renderToStaticMarkup(<StaticRouter location={pathname}>
    <a className="seo-skip" href="#contenu">Aller au contenu</a>
    <header className="seo-header"><a href="/" aria-label="CarnetPass, accueil">CarnetPass</a><nav aria-label="Présentation"><a href="/faq">Questions fréquentes</a><a href="mailto:contact@carnetpass.fr">Contact</a></nav></header>
    {pathname === "/" ? <main id="contenu"><HomeLanding presentation maintenance={maintenance} /></main> : <div id="contenu"><Page /></div>}
    <SiteFooter />
  </StaticRouter>);
}
