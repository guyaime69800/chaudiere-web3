import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* BrowserRouter = le "routeur d'adresses" : il regarde l'URL et affiche la bonne page */}
    <BrowserRouter>
      <Routes>
        {/* Accueil : recherche, hero, espace pro */}
        <Route path="/" element={<App />} />
        {/* Fiche d'un appareil precis — c'est ce que vise le QR code */}
        <Route path="/appareil/:id" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);