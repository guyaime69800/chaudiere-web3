import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./context/AuthProvider";
import AuthPage from "./pages/AuthPage.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
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

          {/* Espace réservé aux professionnels connectés */}
          <Route
            path="/espace-pro"
            element={
              <ProtectedRoute>
                <App initialMode="pro" />
              </ProtectedRoute>
            }
          />

          {/* Fiche ouverte notamment depuis un QR code */}
          <Route path="/appareil/:id" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);