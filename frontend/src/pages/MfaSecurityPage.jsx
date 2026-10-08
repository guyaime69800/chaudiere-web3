import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../services/supabaseClient";
import { signOut } from "../services/authService";
import { verifyMfaCode } from "../services/mfaService";
import "./MfaSecurityPage.css";

export default function MfaSecurityPage() {
  const { user, security, securityLoading, refreshSecurity } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = useState(null);
  const [selectedFactor, setSelectedFactor] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const factors = security?.factors || [];
  const factorId = enrollment?.id || selectedFactor || factors[0]?.id;
  const origin = location.state?.from;
  const destination = origin?.pathname?.startsWith("/") && !origin.pathname.startsWith("//")
    ? origin.pathname + (origin.search || "") : "/parametres-compte";

  useEffect(() => {
    if (verified && !securityLoading && !security?.error && !security?.needsVerification && origin) {
      navigate(destination, { replace: true });
    }
  }, [verified, securityLoading, security?.error, security?.needsVerification, origin, destination, navigate]);

  async function enroll() {
    setBusy(true); setError(""); setMessage("");
    try {
      const { data: existing, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw new Error("Impossible de préparer l’activation. Réessayez.");
      // Remove abandoned, unverified preparations belonging to this account.
      for (const factor of existing.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
        const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (cleanupError) throw new Error("Impossible de reprendre la préparation. Réessayez.");
      }
      // Enrollment is started by a click, never by an effect (including StrictMode).
      const { data, error: enrollmentError } = await supabase.auth.mfa.enroll({
        factorType: "totp", issuer: "CarnetPass", friendlyName: `CarnetPass ${new Date().toLocaleString("fr-FR")}`,
      });
      if (enrollmentError) throw new Error("Impossible de préparer l’activation. Réessayez.");
      setEnrollment(data); setCode(""); setShowSecret(false);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function cancelEnrollment() {
    setBusy(true); setError("");
    try {
      const { error: cancelError } = await supabase.auth.mfa.unenroll({ factorId: enrollment.id });
      if (cancelError) throw new Error("Impossible d’annuler cette préparation. Réessayez.");
      setEnrollment(null); setCode(""); setShowSecret(false);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function verify(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await verifyMfaCode(factorId, code);
      setEnrollment(null); setCode(""); setShowSecret(false); setVerified(true);
      setMessage("Double authentification validée. Votre session est protégée.");
      refreshSecurity();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function removeFactor(factor) {
    if (!window.confirm(`Retirer l’application « ${factor.friendly_name || "CarnetPass"} » ?`)) return;
    setBusy(true); setError("");
    try {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removeError) throw new Error("Validez votre code avant de retirer cette application.");
      setMessage("Application retirée."); refreshSecurity();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const qr = enrollment?.totp?.qr_code;
  const qrSource = qr?.startsWith("data:image/") ? qr
    : qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : null;
  const needsCode = Boolean(enrollment || (security?.needsVerification && factors.length));

  return <main className="mfa-page">
    <Link className="mfa-brand" to="/">CarnetPass</Link>
    <section className="mfa-card" aria-labelledby="mfa-title">
      <span className="mfa-eyebrow">Sécurité du compte</span>
      <h1 id="mfa-title">Double authentification</h1>
      <p>{user.email}</p>
      {securityLoading ? <p role="status">Vérification de votre protection…</p> : <>
        {security?.error && <div role="alert"><p>{security.error}</p><button type="button" onClick={refreshSecurity}>Réessayer le contrôle</button></div>}
        {security?.admin && <p className="mfa-notice">La double authentification est obligatoire pour accéder à l’administration CarnetPass.</p>}
        {!enrollment && !factors.length && !security?.enrolled && <>
          <p>Ajoutez votre compte dans une application d’authentification. Elle générera le code demandé après votre connexion habituelle.</p>
          <button type="button" disabled={busy || Boolean(security?.error)} onClick={enroll}>Activer la double authentification</button>
        </>}
        {enrollment && <div className="mfa-enrollment">
          <h2>Ajoutez CarnetPass dans votre application</h2>
          <p>Scannez ce QR code avec votre application d’authentification.</p>
          {qrSource && <img className="mfa-qr" src={qrSource} width="240" height="240" alt="QR code pour ajouter votre compte CarnetPass à votre application d’authentification" />}
          <button className="mfa-secondary" type="button" aria-expanded={showSecret} onClick={() => setShowSecret((value) => !value)}>{showSecret ? "Masquer la clé" : "Sur le même téléphone ? Afficher la clé de configuration"}</button>
          {showSecret && <div className="mfa-secret"><p>Dans votre application, choisissez « Ajouter une clé de configuration », nommez le compte CarnetPass et sélectionnez un code basé sur le temps.</p><code>{enrollment.totp.secret}</code><p>Cette clé permet de générer vos codes. Conservez-la dans un endroit sûr et ne la partagez pas.</p></div>}
          <p>L’activation sera terminée après validation du premier code.</p>
        </div>}
        {needsCode && <form onSubmit={verify}>
          {!enrollment && factors.length > 1 && <label>Application<select value={selectedFactor || factors[0].id} onChange={(event) => setSelectedFactor(event.target.value)}>{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendly_name || "Application d’authentification"}</option>)}</select></label>}
          <label htmlFor="mfa-code">Code à six chiffres</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
          <button disabled={busy || !factorId}>{busy ? "Vérification…" : enrollment ? "Confirmer l’activation" : "Valider mon code"}</button>
          {enrollment && <button className="mfa-secondary" type="button" disabled={busy} onClick={cancelEnrollment}>Annuler cette préparation</button>}
        </form>}
        {security?.enrolled && !factors.length && security?.needsVerification && <p role="alert">Aucune application TOTP disponible. Contactez le support pour vérifier votre méthode de connexion.</p>}
        {!enrollment && security?.assurance === "aal2" && <>
          <p className="mfa-success">Double authentification active pour cette session.</p>
          <h2>Applications configurées</h2>
          <ul className="mfa-factors">{factors.map((factor) => <li key={factor.id}><span>{factor.friendly_name || "Application d’authentification"}</span>{(!security.admin || factors.length > 1) && <button className="mfa-secondary" type="button" disabled={busy} onClick={() => removeFactor(factor)}>Retirer</button>}</li>)}</ul>
          <button className="mfa-secondary" type="button" disabled={busy} onClick={enroll}>Ajouter une application de secours</button>
          <Link className="mfa-continue" to={destination}>Continuer vers mon compte →</Link>
        </>}
      </>}
      {message && <p className="mfa-success" role="status">{message}</p>}
      {error && <p className="mfa-error" role="alert">{error}</p>}
      <details className="mfa-recovery"><summary>Si je perds mon téléphone</summary><p>Avant toute perte, configurez une application de secours sur un autre appareil et vérifiez son code. Si vous n’avez plus aucune méthode, un propriétaire du projet Supabase devra vérifier votre identité puis réinitialiser votre facteur. Vous devrez ensuite configurer une nouvelle application avant de retrouver l’accès administrateur. Un e-mail ou un changement de mot de passe ne remplace pas le second facteur.</p></details>
      <button className="mfa-secondary" type="button" disabled={busy} onClick={async () => { await signOut(); navigate("/connexion", { replace: true }); }}>Se déconnecter</button>
    </section>
  </main>;
}
