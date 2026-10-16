import { useEffect, useState } from "react";
import { companyDataRequest, downloadCompanyExport } from "../services/accountExportService.js";
import PasswordField from "./PasswordField";
export default function CompanyDataControls({company,token}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[operations,setOperations]=useState([]),[ready,setReady]=useState(false);
 const [equipments,setEquipments]=useState([]),[equipmentId,setEquipmentId]=useState(""),[confirmation,setConfirmation]=useState(""),[password,setPassword]=useState(""),[archived,setArchived]=useState(false);
 const responsible=company && ["admin","owner"].includes(company.role);
 async function refresh(){const result=await companyDataRequest(token,"data-status");setOperations(result.operations);setReady(true);}
 useEffect(()=>{if(!responsible)return;let active=true;
  companyDataRequest(token,"data-status").then(result=>{if(active){setOperations(result.operations);setReady(true);}}).catch(()=>{});
  (async()=>{let offset=0,rows=[];do{const page=await companyDataRequest(token,"export-page",{table:"equipments",offset:String(offset)});rows.push(...page.rows);offset=page.next;}while(offset!==null);if(active)setEquipments(rows);})().catch(()=>{});
  return()=>{active=false;};
 },[responsible,token]);
 async function run(callback){setBusy(true);setError("");setMessage("");try{await callback();}catch(e){setError(e.message);}finally{setBusy(false);setPassword("");}}
 return <section className="account-settings-card" id="donnees">
  <h2>Mes données et mes dossiers</h2>
  <p>Le responsable récupère les dossiers de l’entreprise et leurs pièces privées directement ici, y compris après la fin de l’essai. Les factures CarnetPass sont disponibles dans « Mes factures ».</p>
  {!responsible?<p>Ces actions sont réservées au responsable de votre entreprise.</p>:<>
   <button type="button" disabled={busy} onClick={()=>run(()=>downloadCompanyExport(token,setMessage))}>Télécharger mes dossiers et mes fichiers</button>
   <p>Archive ZIP : équipements, interventions, attestations, rappels, simulations Shiba et pièces privées. Conservez toutes les parties si plusieurs archives sont téléchargées. Évitez de modifier les dossiers pendant l’export.</p>
   <details className="account-settings-danger"><summary>Supprimer des dossiers de mon entreprise</summary>
    <p>Cette suppression est définitive. Choisissez un dossier ou tous les dossiers techniques. Le compte, l’entreprise, l’abonnement et les factures CarnetPass restent en place. Les notices constructeur communes restent disponibles.</p>
    <p>Exportez d’abord les documents que votre entreprise doit conserver. Les preuves inscrites sur la blockchain ne peuvent pas être effacées. Les sauvegardes techniques expirent selon le cycle du prestataire et ne sont pas utilisées pour rétablir les dossiers effacés.</p>
    {!ready?<p>La suppression autonome est en cours d’installation ; aucune suppression n’est possible tant que le service n’est pas prêt.</p>:<form onSubmit={event=>{event.preventDefault();run(async()=>{
     if(!window.confirm("Effacer définitivement les dossiers sélectionnés et leurs fichiers privés ?"))return;
     const result=await companyDataRequest(token,"erase-company-data",{equipmentId,confirmation,password,archived},"POST");
     setMessage(result.message);setConfirmation("");setArchived(false);await refresh();setEquipments(current=>equipmentId?current.filter(e=>e.id!==equipmentId):[]);setEquipmentId("");
    });}}>
     <label>Dossiers à supprimer<select value={equipmentId} onChange={event=>setEquipmentId(event.target.value)}><option value="">Tous les dossiers techniques de l’entreprise</option>{equipments.map(e=><option key={e.id} value={e.id}>{e.brand} {e.model} - {e.serial_number||e.id}</option>)}</select></label>
     <label>Recopiez le nom de l’entreprise : {company.name}<input autoComplete="off" value={confirmation} onChange={event=>setConfirmation(event.target.value)} required /></label>
     <PasswordField label="Votre mot de passe" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required />
     <label><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)} required /> J’ai récupéré les documents que mon entreprise doit conserver et je confirme cet effacement.</label>
     <button className="account-settings-delete" disabled={busy||confirmation!==company.name||!archived}>Effacer les dossiers sélectionnés</button>
    </form>}
   </details>
   {ready&&<><h3>Suivi des suppressions</h3><button type="button" disabled={busy} onClick={()=>run(refresh)}>Actualiser le suivi</button>
    {operations.length?operations.map(op=><p key={op.id}>{new Date(op.created_at).toLocaleString("fr-FR")} : {op.completed_at?"Dossiers, fichiers privés et fiches QR effacés.":"Dossiers effacés ; nettoyage des fichiers et des QR en cours."}</p>):<p>Aucune suppression récente.</p>}</>}
  </>}
  {message&&<p role="status" className="account-settings-message">{message}</p>}{error&&<p role="alert" className="account-settings-error">{error}</p>}
 </section>;
}
