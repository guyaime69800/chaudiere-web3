// Test-only Vite entry. Not included in the production build.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import PlateScanner from '../../src/components/PlateScanner.jsx';
import CompanyRgePanel from '../../src/components/CompanyRgePanel.jsx';
import '../../src/index.css';
import '../../src/pages/ShibaDevisPage.css';
function Fixture(){const [confirmation,setConfirmation]=useState(null);return <main className="devis-page"><h1>Création d’équipement — fixture de test</h1><form><PlateScanner onConfirm={setConfirmation}/><label className="devis-field">Marque en saisie manuelle<input name="manualBrand"/></label><button type="button">Enregistrer l’équipement</button></form>{confirmation&&<p role="status">Fiche préremplie : {confirmation.fields.brand} {confirmation.fields.model}. Équipement non enregistré.</p>}<CompanyRgePanel equipments={[]}/></main>;}createRoot(document.getElementById('root')).render(<Fixture/>);
