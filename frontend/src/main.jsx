import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./context/AuthProvider";
import AuthPage from "./pages/AuthPage.jsx";
import ProSpacePage from "./pages/ProSpacePage.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import EnterpriseQuotePage from "./pages/EnterpriseQuotePage.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import { CookiesPage, FaqPage, LegalNoticePage, PrivacyPage, SalesTermsPage, TermsPage } from "./pages/InfoPages.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import AccountSettingsPage from "./pages/AccountSettingsPage.jsx";
import { registerSW } from "virtual:pwa-register";
const updateSW = registerSW({
  immediate: true,

  onNeedRefresh() {
    const accepter = window.confirm(
      "Une nouvelle version de CarnetPass est disponible. Voulez-vous la charger maintenant ?"
    );

    if (accepter) {
      updateSW(true);
    }
  },

  onOfflineReady() {
    console.info("CarnetPass est prêt à fonctionner hors ligne.");
  },

  onRegisterError(error) {
    console.error(
      "Impossible d’enregistrer la mise à jour CarnetPass :",
      error
    );
  },
});
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/reinitialiser-mot-de-passe"
            element={<ResetPasswordPage />}
          />
          {/* Accueil public */}
          <Route path="/" element={<App />} />
          <Route path="/tarifs" element={<PricingPage />} />
          <Route path="/demande-entreprise" element={<EnterpriseQuotePage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/mentions-legales" element={<LegalNoticePage />} />
          <Route path="/confidentialite" element={<PrivacyPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/conditions-utilisation" element={<TermsPage />} />
          <Route path="/conditions-commerciales" element={<SalesTermsPage />} />

          {/* Authentification professionnelle */}
          <Route
            path="/connexion"
            element={<AuthPage mode="connexion" />}
          />
          <Route
            path="/inscription"
            element={<AuthPage mode="inscription" />}
          />

          {/* Espace professionnel protégé */}
          <Route
            path="/espace-pro"
            element={
              <ProtectedRoute>
                <ProSpacePage />
              </ProtectedRoute>
            }
          />
          <Route path="/parametres-compte" element={<ProtectedRoute><AccountSettingsPage /></ProtectedRoute>} />

          {/* Fiche ouverte depuis un QR code */}
          <Route path="/appareil/:id" element={<App />} />
        </Routes>
        <SiteFooter />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
