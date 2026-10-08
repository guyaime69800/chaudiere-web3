import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ShibaDevisPage from "./pages/ShibaDevisPage.jsx";
import IndividualHomePage from "./pages/IndividualHomePage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./context/AuthProvider";
import MfaSecurityPage from "./pages/MfaSecurityPage";
import AuthPage from "./pages/AuthPage.jsx";
import ProSpacePage from "./pages/ProSpacePage.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import EnterpriseQuotePage from "./pages/EnterpriseQuotePage.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import { CookiesPage, FaqPage, LegalNoticePage, PrivacyPage, SalesTermsPage, TermsPage } from "./pages/InfoPages.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import AccountSettingsPage from "./pages/AccountSettingsPage.jsx";
import PlatformAdminPage from "./pages/PlatformAdminPage.jsx";
import MaintenanceAdminPage from "./pages/MaintenanceAdminPage.jsx";
import AidAdminPage from "./pages/AidAdminPage.jsx";
import ShibaRechargeModal from "./components/ShibaRechargeModal.jsx";
import PublicMaintenanceReminderPage from "./pages/PublicMaintenanceReminderPage.jsx";
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
          <Route path="/shiba-devis" element={<ShibaDevisPage />} />
          <Route path="/espace-particulier" element={<IndividualHomePage />} />
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
          <Route path="/securite-compte" element={<ProtectedRoute allowMfaSetup><MfaSecurityPage /></ProtectedRoute>} />
          <Route path="/administration-interne" element={<ProtectedRoute><PlatformAdminPage /></ProtectedRoute>} />
          <Route path="/administration-maintenance" element={<ProtectedRoute><MaintenanceAdminPage /></ProtectedRoute>} />
          <Route path="/administration-aides" element={<ProtectedRoute><AidAdminPage /></ProtectedRoute>} />
          <Route path="/rappel/activer" element={<PublicMaintenanceReminderPage mode="activate" />} />
          <Route path="/rappel/gerer" element={<PublicMaintenanceReminderPage mode="manage" />} />

          {/* Fiche ouverte depuis un QR code */}
          <Route path="/appareil/:id" element={<App />} />
        </Routes>
        <ShibaRechargeModal />
        <SiteFooter />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
