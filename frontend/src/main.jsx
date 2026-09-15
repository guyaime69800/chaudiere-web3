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
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
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

          {/* Fiche ouverte depuis un QR code */}
          <Route path="/appareil/:id" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);