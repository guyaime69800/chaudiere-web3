import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const loadingPageStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "#f8f5f2",
  color: "#4e3b34",
  fontFamily: "Inter, system-ui, sans-serif",
};

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <p role="status">Chargement de votre espace professionnel…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/connexion"
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}