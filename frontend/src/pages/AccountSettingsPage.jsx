import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../services/supabaseClient";
import { getMyCompany } from "../services/companyService";
import { signOut } from "../services/authService";
import { getDiscoveryAccess } from "../../shared/discovery-access.js";
import PasswordField from "../components/PasswordField";
import { startBilling } from "../services/billingService";
import "./AccountSettingsPage.css";

async function accountRequest(method, token, body) {
  const response = await fetch("/api/account", {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || "Opération indisponible. Réessayez.");
  return result.message;
}

export default function AccountSettingsPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [testSubscription, setTestSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [profileResult, companyResult] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        getMyCompany(user.id),
      ]);
      if (!active) return;
      if (profileResult.error) setError("Impossible de charger le profil.");
      setName(profileResult.data?.full_name || "");
      setCompany(companyResult);
      if (import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true" && companyResult?.id) {
        const { data: stripeTest, error: stripeError } = await supabase.from("stripe_test_subscriptions")
          .select("plan, status, current_period_end, cancel_at_period_end, stripe_subscription_id")
          .eq("company_id", companyResult.id).maybeSingle();
        if (!active) return;
        if (stripeError) setError("Impossible de charger l'abonnement Stripe de test.");
        else setTestSubscription(stripeTest);
      }
      setLoading(false);
    }
    load().catch(() => { if (active) { setError("Impossible de charger les paramètres."); setLoading(false); } });
    return () => { active = false; };
  }, [user.id]);

  async function run(action, callback) {
    setBusy(action);
    setError("");
    setMessage("");
    try { setMessage(await callback()); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  const subscription = company?.subscription;
  const testBilling = import.meta.env.VITE_STRIPE_TEST_BILLING_ENABLED === "true";
  const discovery = company && subscription?.plan === "free"
    ? getDiscoveryAccess({ plan: subscription.plan, status: subscription.status,
      createdAt: company.created_at, trialEndsAt: subscription.trial_ends_at,
      verificationStatus: company.verification?.status })
    : null;

  return (
    <main className="account-settings">
      <header><Link to="/espace-pro">← Retour à mon espace</Link><h1>Paramètres du compte</h1><p>{user.email}</p></header>
      {loading ? <p>Chargement…</p> : <div className="account-settings-grid">
        <section className="account-settings-card">
          <h2>Mon profil</h2>
          <form onSubmit={(event) => { event.preventDefault(); run("profile", async () => {
            const trimmed = name.trim();
            if (trimmed.length < 2) throw new Error("Indiquez un nom d’au moins 2 caractères.");
            const { error: updateError } = await supabase.from("profiles").update({ full_name: trimmed, updated_at: new Date().toISOString() }).eq("id", user.id);
            if (updateError) throw new Error("Impossible d’enregistrer votre nom.");
            return "Nom enregistré.";
          }); }}>
            <label>Nom affiché<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
            <button disabled={Boolean(busy)}>Enregistrer</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); run("email", async () => {
            const nextEmail = newEmail.trim().toLowerCase();
            if (!nextEmail || nextEmail === user.email?.toLowerCase()) throw new Error("Indiquez une nouvelle adresse e-mail.");
            const { error: updateError } = await supabase.auth.updateUser({ email: nextEmail });
            if (updateError) throw new Error(updateError.message);
            setNewEmail("");
            return "Vérifiez votre nouvelle boîte e-mail pour confirmer le changement.";
          }); }}>
            <label>Nouvelle adresse e-mail<input type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required /></label>
            <button disabled={Boolean(busy)}>Modifier l’adresse e-mail</button>
          </form>
        </section>
        <section className="account-settings-card">
          <h2>Sécurité</h2>
          <p>Adresse e-mail confirmée : {user.email_confirmed_at ? "oui" : "non"}.</p>
          <form onSubmit={(event) => { event.preventDefault(); run("password", async () => {
            if (newPassword.length < 12) throw new Error("Choisissez au moins 12 caractères.");
            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
            if (updateError) throw new Error(updateError.message);
            setNewPassword("");
            return "Mot de passe modifié.";
          }); }}>
            <PasswordField label="Nouveau mot de passe" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            <button disabled={Boolean(busy)}>Changer le mot de passe</button>
          </form>
          <button className="account-settings-secondary" type="button" disabled={Boolean(busy)} onClick={() => run("logout", async () => { await signOut(); navigate("/connexion"); return "Déconnexion effectuée."; })}>Se déconnecter</button>
        </section>
        <section className="account-settings-card" id="formule">
          <h2>Formule et essai</h2>
          {!company ? <p>Aucune entreprise associée.</p> : <>
            <p>Entreprise : <strong>{company.name}</strong></p>
            <p>Formule : <strong>{subscription?.plan === "free" ? "Découverte gratuite" : subscription?.plan === "team" ? "Équipe" : subscription?.plan === "pro" ? "Pro" : subscription?.plan || "Non disponible"}</strong></p>
            <p>État : <strong>{subscription?.status === "canceled" ? "arrêté" : discovery?.active ? "essai actif" : subscription?.status || "terminé"}</strong></p>
            {discovery?.endsAt && subscription?.status !== "canceled" && <p>Fin prévue : {new Date(discovery.endsAt).toLocaleDateString("fr-FR")}</p>}
            {subscription?.plan === "free" && <p>Aucune carte bancaire ni aucun prélèvement n’est associé à l’essai Découverte.</p>}
            <Link className="account-settings-plan-link" to="/tarifs?from=account">Voir les formules et demander un changement →</Link>
            {testBilling && <p>Stripe test : <strong>{testSubscription?.plan === "team" ? "Équipe" : testSubscription?.plan === "pro" ? "Pro" : "aucune formule test"}</strong>{testSubscription?.status ? ` · ${testSubscription.status}` : ""}. Ce test ne change pas encore vos droits réels.</p>}
            {testBilling && testSubscription?.stripe_subscription_id && ["owner", "admin"].includes(company.role) &&
              <button type="button" className="account-settings-secondary" disabled={Boolean(busy)} onClick={() => run("portal", async () => {
                window.location.assign(await startBilling(session.access_token, "portal"));
                return "Ouverture du portail Stripe.";
              })}>Gérer mon abonnement et télécharger mes factures test</button>}
            {testBilling && testSubscription?.stripe_subscription_id && <p>Les factures sont téléchargeables dans le portail Stripe. Les montants HT, TVA et TTC affichés sur chaque facture correspondent aux taxes réellement appliquées par Stripe.</p>}
            {subscription?.plan === "free" && subscription.status !== "canceled" && company.role === "admin" &&
              <button className="account-settings-secondary" type="button" disabled={Boolean(busy)} onClick={() => {
                if (!window.confirm("Arrêter l’essai Découverte maintenant ? La création de nouveaux appareils sera désactivée.")) return;
                run("cancel", async () => {
                  const result = await accountRequest("POST", session.access_token, { action: "cancel-discovery" });
                  setCompany((current) => ({ ...current, subscription: { ...current.subscription, status: "canceled" } }));
                  return result;
                });
              }}>Arrêter l’essai</button>}
            {subscription?.plan !== "free" && !testBilling && <p>Pour une formule payante, contactez <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a> afin d’obtenir la procédure de résiliation.</p>}
          </>}
        </section>
        <section className="account-settings-card account-settings-danger">
          <h2>Supprimer mon compte</h2>
          <p>Cette action supprime votre accès et anonymise votre profil. Les carnets, interventions et attestations déjà établis restent conservés pour leur traçabilité. Un historique signé peut encore contenir le nom du technicien au moment de son émission.</p>
          <form onSubmit={(event) => { event.preventDefault();
            if (deleteConfirmation !== user.email) { setError("Recopiez exactement votre adresse e-mail."); return; }
            if (!window.confirm("Confirmer la suppression définitive de votre accès CarnetPass ?")) return;
            run("delete", async () => {
              const result = await accountRequest("DELETE", session.access_token, { password: deletePassword });
              await signOut().catch(() => {});
              navigate("/");
              return result;
            });
          }}>
            <label>Recopiez votre adresse e-mail<input type="email" autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} required /></label>
            <PasswordField label="Votre mot de passe" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required />
            <button className="account-settings-delete" disabled={Boolean(busy)}>Supprimer définitivement mon compte</button>
          </form>
          <p>Pour une demande concernant les données conservées : <a href="mailto:contact@carnetpass.fr">contact@carnetpass.fr</a>.</p>
        </section>
      </div>}
      {message && <p className="account-settings-message" role="status">{message}</p>}
      {error && <p className="account-settings-error" role="alert">{error}</p>}
    </main>
  );
}
