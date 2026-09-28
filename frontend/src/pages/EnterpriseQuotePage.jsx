import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./EnterpriseQuotePage.css";

export default function EnterpriseQuotePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ company: "", name: "", email: user?.email || "", phone: "", technicians: "", equipment: "", needs: "", timing: "", website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  function change(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/enterprise-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "L’envoi a échoué. Réessayez plus tard.");
      setState("sent");
    } catch (requestError) {
      setError(requestError.message);
      setState("idle");
    }
  }

  return (
    <main className="enterprise-quote">
      <Link to="/tarifs" className="enterprise-quote__back">← Retour aux formules</Link>
      <div className="enterprise-quote__intro"><span>Offre Entreprise</span><h1>Parlons de votre projet.</h1><p>Décrivez votre équipe et vos besoins. Nous étudierons votre demande pour vous proposer une formule adaptée.</p></div>
      {state === "sent" ? <div className="enterprise-quote__success" role="status"><h2>Demande envoyée</h2><p>Merci. Nous avons reçu votre questionnaire et vous répondrons à l’adresse indiquée.</p><Link to="/tarifs">Retour aux formules</Link></div> :
        <form onSubmit={submit} className="enterprise-quote__form">
          <div className="enterprise-quote__grid">
            <label>Entreprise ou réseau *<input name="company" value={form.company} onChange={change} required maxLength={120} autoComplete="organization" /></label>
            <label>Votre nom *<input name="name" value={form.name} onChange={change} required maxLength={100} autoComplete="name" /></label>
            <label>Adresse e-mail professionnelle *<input name="email" type="email" value={form.email} onChange={change} required maxLength={254} autoComplete="email" /></label>
            <label>Téléphone<input name="phone" type="tel" value={form.phone} onChange={change} maxLength={40} autoComplete="tel" /></label>
            <label>Nombre de techniciens *<input name="technicians" type="number" min="1" max="100000" value={form.technicians} onChange={change} required /></label>
            <label>Nombre approximatif d’équipements<input name="equipment" type="number" min="0" max="10000000" value={form.equipment} onChange={change} /></label>
            <label>Échéance souhaitée<select name="timing" value={form.timing} onChange={change}><option value="">À préciser</option><option value="Dès que possible">Dès que possible</option><option value="Sous 1 à 3 mois">Sous 1 à 3 mois</option><option value="Plus tard">Plus tard</option></select></label>
          </div>
          <label>Vos besoins et contraintes *<textarea name="needs" value={form.needs} onChange={change} required minLength={20} maxLength={3000} rows={6} placeholder="Sites concernés, utilisateurs, documents, intégrations ou accompagnement souhaité…" /></label>
          <div className="enterprise-quote__trap" aria-hidden="true"><label>Site web<input name="website" value={form.website} onChange={change} tabIndex={-1} autoComplete="off" /></label></div>
          <p className="enterprise-quote__privacy">Ces informations servent uniquement à répondre à votre demande. Voir notre <Link to="/confidentialite">politique de confidentialité</Link>.</p>
          {error && <p className="enterprise-quote__error" role="alert">{error}</p>}
          <button type="submit" disabled={state === "sending"}>{state === "sending" ? "Envoi en cours…" : "Envoyer ma demande"}</button>
        </form>}
    </main>
  );
}
