import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom"; // lire l'ID dans l'URL + changer de page
// NOUVEAU (perf) : le scanner n'est telecharge QU'AU MOMENT du clic sur le bouton.
// Resultat : la page d'accueil s'ouvre bien plus vite, surtout en 4G faible.
const ScannerQR = lazy(() => import("./ScannerQR"));
import { QRCodeCanvas } from "qrcode.react"; // NOUVEAU (QR) : fabrique l'image du QR code
import { ethers } from "ethers";
import { RPC_URL, CONTRACT_ADDRESS } from "./blockchain/config";
import EquipmentRegistryABI from "./blockchain/EquipmentRegistry.json";
import { useWallet } from "./blockchain/useWallet";
import {
  findErrorCodeForEquipment,
  loadEquipmentKnowledge,
} from "./services/equipmentKnowledge";
import ReactMarkdown from "react-markdown";
import "./App.css";

function App() {
  // Mode d'affichage : "public" (consultation, sans wallet) ou "pro" (technicien, avec wallet)
  const [mode, setMode] = useState("public");
  const [technicalResult, setTechnicalResult] = useState(null);
  const [equipmentKnowledge, setEquipmentKnowledge] = useState(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);





  // NOUVEAU (routeur) : si l'URL est /appareil/CHAUD-DEMO, on recupere l'ID ici.
  // Sur la page d'accueil "/", idDepuisURL vaut undefined (c'est normal).
  const { id: idDepuisURL } = useParams();
  // NOUVEAU (scan) : navigation interne + ouverture/fermeture de la camera
  const navigate = useNavigate();
  const [scanOuvert, setScanOuvert] = useState(false);
  // Installation PWA : mémorise la proposition d'installation du navigateur.
  const [installPrompt, setInstallPrompt] = useState(null);

  // Permet de savoir si CarnetPass est déjà installé comme application.
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  // Détecte si CarnetPass peut être installé comme application PWA.
  useEffect(() => {
    // Si CarnetPass est déjà ouvert comme une application installée,
    // inutile de proposer une nouvelle installation.
    const alreadyInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;

    if (alreadyInstalled) {
      setIsAppInstalled(true);
    }

    // Chrome/Android déclenche cet événement lorsque la PWA
    // peut être installée.
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    // Déclenché une fois l'installation terminée.
    function handleAppInstalled() {
      setIsAppInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleAppInstalled
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );

      window.removeEventListener(
        "appinstalled",
        handleAppInstalled
      );
    };
  }, []);
  // Lance réellement la fenêtre d'installation de CarnetPass.
  async function installerCarnetPass() {
    if (!installPrompt) {
      return;
    }

    // Demande à Chrome d'afficher sa fenêtre officielle d'installation.
    await installPrompt.prompt();

    // Attend le choix de l'utilisateur : installer ou annuler.
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }

  const [owner, setOwner] = useState("");
  const [boiler, setBoiler] = useState(null);
  const [searchId, setSearchId] = useState("");
  const [message, setMessage] = useState("");

  // Recherche universelle :
  // mémorise les équipements génériques trouvés par modèle,
  // gamme ou référence constructeur.
  const [searchResults, setSearchResults] = useState([]);
  const [searchType, setSearchType] = useState("");

  // Équipement constructeur générique sélectionné.
  // Important : ce n'est PAS encore un CarnetPass physique.
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [personalSerialNumber, setPersonalSerialNumber] = useState("");
  const [isCreatingCarnetPass, setIsCreatingCarnetPass] = useState(false);
  const [carnetPassCreationMessage, setCarnetPassCreationMessage] = useState("");
  // NOUVEAU (perf) : useMemo = "fabrique-le UNE fois, puis reutilise".
  // Sans ca, la connexion blockchain etait recreee a chaque lettre tapee dans un champ.
  const provider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), []);
  const contract = useMemo(
    () => new ethers.Contract(CONTRACT_ADDRESS, EquipmentRegistryABI.abi, provider),
    [provider]
  );

  const {
    account, connectWallet, isConnecting, error, isCorrectNetwork,
    getWriteContract, addMaintenance, getMaintenances,
    isMobile, hasInjectedWallet, metamaskDeepLink,
  } = useWallet();

  // Formulaire d'enregistrement d'un appareil
  const [formId, setFormId] = useState("");
  const [formQr, setFormQr] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formProductReference, setFormProductReference] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [writeMsg, setWriteMsg] = useState("");

  // Carnet d'entretien
  const [maintenances, setMaintenances] = useState([]);
  const [isLoadingCarnet, setIsLoadingCarnet] = useState(false);
  const [carnetError, setCarnetError] = useState("");

  // Formulaire d'ajout d'intervention
  const [mType, setMType] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mTech, setMTech] = useState("");
  const [mPart, setMPart] = useState("");
  const [isAddingM, setIsAddingM] = useState(false);
  const [mMsg, setMMsg] = useState("");

  // Au chargement : on lit l'administrateur (owner) du contrat
  useEffect(() => {
    async function lireOwner() {
      const adresseOwner = await contract.owner();
      setOwner(adresseOwner);
    }
    lireOwner();
  }, []);

  // Transforme un timestamp blockchain (secondes) en date lisible FR
  function formatDate(timestampBigInt) {
    const ms = Number(timestampBigInt) * 1000;
    return new Date(ms).toLocaleString("fr-FR");
  }
  async function demanderIA() {
    // -------------------------------------------------------
    // IDENTIFIANT TECHNIQUE POUR L'IA
    // -------------------------------------------------------
    //
    // Cas 1 :
    // fiche équipement générique
    // -> selectedEquipment.equipmentId
    //
    // Cas 2 :
    // CarnetPass physique Redis
    // -> boiler.technicalEquipmentId
    //
    // Cas 3 :
    // ancien appareil du prototype
    // -> boiler.equipmentId
    // -------------------------------------------------------

    const technicalEquipmentId =
      selectedEquipment?.equipmentId ??
      boiler?.technicalEquipmentId ??
      boiler?.equipmentId;

    if (
      !technicalEquipmentId ||
      !aiQuestion.trim()
    ) {
      return;
    }

    try {
      setIsAiLoading(true);
      setAiAnswer("");

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          equipmentId:
            technicalEquipmentId,

          question:
            aiQuestion,
        }),
      });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          data.error ||
          "Erreur lors de la réponse IA"
        );
      }

      setAiAnswer(
        data.answer ||
        "Aucune réponse reçue."
      );
    } catch (error) {
      console.error(
        "Erreur Assistant IA CarnetPass :",
        error
      );

      setAiAnswer(
        error?.message ||
        "Impossible d'obtenir une réponse de l'assistant pour le moment."
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  // PDF : genere le carnet d'entretien complet de l'equipement affiche
  async function telechargerCarnetPDF() {
    if (!boiler) return;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    let y = 20;

    // Titre
    doc.setFontSize(20);
    doc.text("CarnetPass", 20, y);

    y += 10;
    doc.setFontSize(14);
    doc.text("Carnet d'entretien de l'equipement", 20, y);

    // Informations de l'appareil
    y += 15;
    doc.setFontSize(11);
    doc.text(`ID : ${boiler.equipmentId}`, 20, y);

    y += 7;
    doc.text(`Marque : ${boiler.brand}`, 20, y);

    y += 7;
    doc.text(`Modele : ${boiler.model}`, 20, y);

    y += 7;
    doc.text(`Reference produit : ${boiler.productReference}`, 20, y);

    y += 12;
    doc.line(20, y, 190, y);

    y += 10;
    doc.setFontSize(14);
    doc.text("Historique des interventions", 20, y);

    if (maintenances.length === 0) {
      y += 10;
      doc.setFontSize(11);
      doc.text("Aucune intervention enregistree.", 20, y);
    } else {
      maintenances.forEach((m, index) => {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }

        y += 12;
        doc.setFontSize(12);
        doc.text(`Intervention ${index + 1}`, 20, y);

        y += 7;
        doc.setFontSize(10);
        doc.text(`Enregistrement Polygon : ${formatDate(m.date)}`, 20, y);

        y += 6;
        doc.text(`Type : ${m.interventionType}`, 20, y);

        y += 6;
        doc.text(`Entreprise / technicien : ${m.technician}`, 20, y);

        y += 6;
        const description = doc.splitTextToSize(
          `Description : ${m.description}`,
          165
        );
        doc.text(description, 20, y);

        y += description.length * 5;

        if (m.partChanged) {
          y += 6;
          const piece = doc.splitTextToSize(
            `Piece remplacee : ${m.partChanged}`,
            165
          );
          doc.text(piece, 20, y);
          y += piece.length * 5;
        }

        y += 5;
        doc.line(20, y, 190, y);
      });
    }

    doc.save(`CarnetPass-${boiler.equipmentId}.pdf`);
  }
  // NOUVEAU (QR) : telecharge le QR affiche en fichier PNG (pret a imprimer)
  function telechargerQR(boilerId) {
    // On recupere l'image QR dessinee a l'ecran (une balise <canvas>)
    const canvas = document.getElementById(`qr-${boilerId}`);
    if (!canvas) return;
    // On la transforme en fichier image
    const url = canvas.toDataURL("image/png");
    // On cree un lien invisible et on "clique" dessus pour declencher le telechargement
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `QR-${boilerId}.png`; // nom du fichier : QR-CHAUD-DEMO.png
    lien.click();
  }

  // PARTAGE : ouvre le menu natif du téléphone (WhatsApp, SMS, Mail...)
  // Si le navigateur ne sait pas partager, on copie simplement le lien.
  async function partagerCarnetPass(url, titre, texte) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: titre,
          text: texte,
          url: url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("✅ Lien copié. Tu peux maintenant le partager.");
    } catch (err) {
      // Si l'utilisateur ferme simplement le menu de partage,
      // ce n'est pas considéré comme une erreur.
      if (err?.name !== "AbortError") {
        console.error("[partage] Échec :", err);
        setMessage("❌ Impossible de partager ce lien.");
      }
    }
  }
  // Charge le carnet d'un appareil
  async function chargerCarnet(boilerId) {
    setIsLoadingCarnet(true);
    setCarnetError("");
    try {
      const liste = await getMaintenances(CONTRACT_ADDRESS, EquipmentRegistryABI.abi, boilerId);
      setMaintenances(liste);
    } catch (err) {
      console.error("[carnet] ECHEC :", err);
      setMaintenances([]);
      setCarnetError("Impossible de lire le carnet. La blockchain n'a pas repondu correctement.");
    } finally {
      setIsLoadingCarnet(false);
    }
  }

  // Recherche : on charge la fiche de l'appareil.
  // NOUVEAU : on accepte un ID explicite (venant du QR / de l'URL).
  // Sinon on prend celui tape dans le champ de recherche.
  // ---------------------------------------------------------
  // RECHERCHE UNIVERSELLE CARNETPASS
  // ---------------------------------------------------------
  //
  // Accepte :
  //
  // - CarnetPass ID
  // - référence constructeur
  // - modèle / gamme
  // - numéro de série
  //
  // Les anciens appareils enregistrés directement sur Polygon
  // restent compatibles grâce au fallback blockchain.
  // ---------------------------------------------------------

  async function chercherChaudiere(idExplicite) {
    const valeurRecherche = String(
      idExplicite ?? searchId ?? ""
    ).trim();

    if (!valeurRecherche) {
      return;
    }

    // On remet l'écran de recherche à zéro
    // avant d'afficher le nouveau résultat.
    setMessage("");
    setBoiler(null);
    setMaintenances([]);
    setTechnicalResult(null);
    setEquipmentKnowledge(null);
    setSearchResults([]);
    setSearchType("");
    setSelectedEquipment(null);
    setAiAnswer("");

    try {
      // ---------------------------------------------------
      // 1. RECHERCHE UNIVERSELLE
      // ---------------------------------------------------

      const response = await fetch(
        `/api/search?q=${encodeURIComponent(
          valeurRecherche
        )}`
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
          "Erreur pendant la recherche."
        );
      }

      const results = Array.isArray(
        result.results
      )
        ? result.results
        : [];

      setSearchType(
        result.searchType ?? ""
      );

      // ---------------------------------------------------
      // 2. CARNETPASS PHYSIQUE
      // ---------------------------------------------------

      const carnetPassResult =
        results.find(
          (item) =>
            item.resultType ===
            "carnetpass"
        );

      if (carnetPassResult) {
        const identity =
          carnetPassResult.identity ?? {};

        const boilerFromCarnetPass = {
          exists: true,

          // Identifiant public :
          // CP-2026-000003
          equipmentId:
            carnetPassResult.carnetPassId,

          // Identifiant technique utilisé
          // par le RAG :
          technicalEquipmentId:
            carnetPassResult.equipmentId,

          carnetPassId:
            carnetPassResult.carnetPassId,

          qrCode:
            carnetPassResult.carnetPassId,

          brand:
            identity.brand ?? "",

          model:
            identity.model ?? "",

          productReference:
            carnetPassResult.manufacturerReference ??
            "",

          manufacturerReference:
            carnetPassResult.manufacturerReference ??
            "",

          serialNumber:
            carnetPassResult.serialNumber ??
            "Non renseigné",

          source:
            "universal_search",
        };

        setBoiler(
          boilerFromCarnetPass
        );

        // Le RAG travaille avec l'identifiant
        // technique du modèle, pas avec CP-xxxx.
        if (
          carnetPassResult.equipmentId
        ) {
          const knowledge =
            await loadEquipmentKnowledge(
              carnetPassResult.equipmentId
            );

          setEquipmentKnowledge(
            knowledge
          );
        }

        return;
      }

      // ---------------------------------------------------
      // 3. ÉQUIPEMENT(S) GÉNÉRIQUE(S)
      // ---------------------------------------------------
      //
      // Une recherche par référence ou modèle
      // NE CRÉE PAS de CarnetPass.
      //
      // Elle renvoie seulement les modèles
      // correspondants.
      // ---------------------------------------------------

      const equipmentResults =
        results.filter(
          (item) =>
            item.resultType ===
            "equipment"
        );

      if (
        equipmentResults.length > 0
      ) {
        setSearchResults(
          equipmentResults
        );

        return;
      }

      // ---------------------------------------------------
      // 4. FALLBACK POLYGON
      // ---------------------------------------------------
      //
      // Compatibilité avec les anciens appareils
      // du prototype enregistrés directement
      // dans le smart contract.
      // ---------------------------------------------------

      try {
        const polygonData =
          await contract.equipments(
            valeurRecherche
          );

        if (polygonData.exists) {
          setBoiler(
            polygonData
          );

          const knowledge =
            await loadEquipmentKnowledge(
              valeurRecherche
            );

          setEquipmentKnowledge(
            knowledge
          );

          setSearchType(
            "polygon_legacy"
          );

          return;
        }
      } catch (polygonError) {
        console.warn(
          "Recherche Polygon non concluante :",
          polygonError
        );
      }

      // ---------------------------------------------------
      // 5. AUCUN RÉSULTAT
      // ---------------------------------------------------

      setMessage(
        "Aucun CarnetPass ou équipement trouvé."
      );
    } catch (error) {
      console.error(
        "Erreur recherche universelle CarnetPass :",
        error
      );

      setMessage(
        error?.message ||
        "Impossible d'effectuer la recherche pour le moment."
      );
    }
  }
  // ---------------------------------------------------------
  // OUVERTURE D'UNE FICHE ÉQUIPEMENT GÉNÉRIQUE
  // ---------------------------------------------------------
  //
  // Cette fiche représente un modèle constructeur.
  //
  // Ce n'est PAS encore un appareil physique CarnetPass.
  // ---------------------------------------------------------

  async function ouvrirFicheEquipement(equipment) {
    if (!equipment?.equipmentId) {
      return;
    }

    try {
      setMessage("");
      setSelectedEquipment(equipment);
      setSearchResults([]);
      setEquipmentKnowledge(null);
      setAiAnswer("");
      setAiQuestion("");

      const knowledge =
        await loadEquipmentKnowledge(
          equipment.equipmentId
        );

      setEquipmentKnowledge(
        knowledge
      );
    } catch (error) {
      console.error(
        "Erreur ouverture fiche équipement :",
        error
      );

      setMessage(
        "Impossible de charger la fiche technique de cet équipement."
      );
    }
  }
  async function creerCarnetPassPersonnel() {
    if (
      !selectedEquipment?.manufacturerReference ||
      !personalSerialNumber.trim()
    ) {
      setCarnetPassCreationMessage(
        "Renseigne le numéro de série de l'appareil."
      );
      return;
    }

    try {
      setIsCreatingCarnetPass(true);
      setCarnetPassCreationMessage("");

      const response = await fetch("/api/carnetpass", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          manufacturerReference:
            selectedEquipment.manufacturerReference,
          serialNumber:
            personalSerialNumber.trim(),
        }),
      });

      const data = await response.json();

      // Si ce numéro de série possède déjà un CarnetPass,
      // on ouvre simplement le CarnetPass existant.
      if (
        response.status === 409 &&
        data?.carnetPassId
      ) {
        setCarnetPassCreationMessage(
          "Cet appareil possède déjà un CarnetPass. Ouverture..."
        );

        setSearchId(data.carnetPassId);

        navigate(
          `/appareil/${data.carnetPassId}`
        );

        await chercherChaudiere(
          data.carnetPassId
        );

        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          "Impossible de créer le CarnetPass."
        );
      }

      const carnetPassId =
        data?.carnetPassId;

      if (!carnetPassId) {
        throw new Error(
          "Le serveur n'a pas retourné d'identifiant CarnetPass."
        );
      }

      setCarnetPassCreationMessage(
        `CarnetPass ${carnetPassId} créé avec succès.`
      );

      setPersonalSerialNumber("");

      setSearchId(carnetPassId);

      navigate(
        `/appareil/${carnetPassId}`
      );

      await chercherChaudiere(
        carnetPassId
      );
    } catch (error) {
      console.error(
        "Erreur création CarnetPass personnel :",
        error
      );

      setCarnetPassCreationMessage(
        error?.message ||
        "Impossible de créer le CarnetPass."
      );
    } finally {
      setIsCreatingCarnetPass(false);
    }
  }
  // NOUVEAU (scan) : appelee quand la camera a lu un QR CarnetPass valide
  function ouvrirDepuisScan(idScanne) {
    setScanOuvert(false);              // ferme la camera (et la coupe)
    setSearchId(idScanne);             // le champ de recherche affiche l'ID lu
    navigate(`/appareil/${idScanne}`); // l'adresse devient partageable, le bouton Retour marche
    chercherChaudiere(idScanne);       // charge la fiche tout de suite, meme si on est deja sur cette adresse
  }
  // Dès qu'un appareil est affiche, on charge son carnet automatiquement
  useEffect(() => {
    if (boiler && boiler.equipmentId) {
      chargerCarnet(boiler.equipmentId);
    }
  }, [boiler]);

  // NOUVEAU (QR/routeur) : arrivee via une URL directe (ou un QR scanne)
  // -> on ouvre la fiche de l'appareil automatiquement.
  useEffect(() => {
    if (idDepuisURL) {
      setSearchId(idDepuisURL);       // le champ affiche l'ID scanne
      chercherChaudiere(idDepuisURL); // ID passe explicitement = pas de course d'etat (le piege du "await")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDepuisURL]);

  // ECRITURE : enregistrer un nouvel appareil (reserve a l'admin, cote contrat)
  async function enregistrerChaudiere() {
    setWriteMsg("");

    if (!account) {
      setWriteMsg("⚠️ Connecte d'abord ton wallet.");
      return;
    }

    if (!isCorrectNetwork) {
      setWriteMsg("⚠️ Mauvais réseau.");
      return;
    }

    if (
      !formId ||
      !formQr ||
      !formBrand ||
      !formModel ||
      !formProductReference ||
      !formSerialNumber
    ) {
      setWriteMsg("⚠️ Remplis les 6 champs.");
      return;
    }

    try {
      setIsWriting(true);
      setWriteMsg("Transaction en cours... confirme dans MetaMask.");

      const writeContract = getWriteContract(
        CONTRACT_ADDRESS,
        EquipmentRegistryABI.abi
      );

      const tx = await writeContract.registerEquipment(
        formId,
        formQr,
        formBrand,
        formModel,
        formProductReference,
        formSerialNumber
      );

      setWriteMsg("Envoyée, attente de confirmation...");
      await tx.wait();

      setWriteMsg(`✅ Appareil ${formId} enregistré !`);

      setFormId("");
      setFormQr("");
      setFormBrand("");
      setFormModel("");
      setFormProductReference("");
      setFormSerialNumber("");
    } catch (err) {
      console.error(err);

      if (err.code === "ACTION_REJECTED") {
        setWriteMsg("❌ Signature refusée.");
      } else if (err.reason) {
        setWriteMsg(`❌ Refusé par le contrat : ${err.reason}`);
      } else {
        setWriteMsg("❌ Échec (voir console).");
      }
    } finally {
      setIsWriting(false);
    }
  }

  // ECRITURE : ajouter une intervention a l'appareil affiche
  async function ajouterIntervention() {
    setMMsg("");
    if (!account) { setMMsg("⚠️ Connecte d'abord ton wallet."); return; }
    if (!isCorrectNetwork) { setMMsg("⚠ Mauvais reseau. Passe sur Polygon (chainId 137)."); return; }
    if (!boiler) { setMMsg("⚠️ Cherche d'abord un appareil."); return; }
    if (!mType || !mDesc || !mTech) { setMMsg("⚠️ Type, description et technicien sont requis."); return; }
    // RGPD : bloque quelques formes évidentes de données personnelles
    // avant qu'elles ne soient inscrites de façon permanente sur Polygon.
    const texteIntervention = `${mType} ${mDesc} ${mTech}`;

    const contientEmail =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(texteIntervention);

    const contientAdresse =
      /\b(rue|avenue|boulevard|chemin|impasse|allée|allee|place)\b/i.test(
        texteIntervention
      );

    const contientTelephone =
      /(?:\+33[ .-]?[1-9](?:[ .-]?\d{2}){4}|0[1-9](?:[ .-]\d{2}){4})/.test(
        texteIntervention
      );

    if (contientEmail || contientAdresse || contientTelephone) {
      setMMsg(
        "❌ Donnée personnelle détectée. Retire toute adresse, téléphone ou e-mail avant l'inscription sur la blockchain."
      );
      return;
    }

    try {
      setIsAddingM(true);
      setMMsg("Transaction en cours... confirme dans MetaMask.");
      await addMaintenance(CONTRACT_ADDRESS, EquipmentRegistryABI.abi, boiler.equipmentId, mType, mDesc, mTech, mPart);
      setMMsg("✅ Intervention ajoutee !");
      setMType(""); setMDesc(""); setMTech(""); setMPart("");
      chargerCarnet(boiler.equipmentId); // on rafraichit le carnet
    } catch (err) {
      console.error(err);
      if (err.code === "ACTION_REJECTED") setMMsg("❌ Signature refusee.");
      else if (err.reason) setMMsg(`❌ Refuse par le contrat : ${err.reason}`);
      else setMMsg("❌ Echec (voir console).");
    } finally {
      setIsAddingM(false);
    }
  }

  return (
    <div className="app">
      {/* ---------- BARRE DU HAUT ---------- */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#fff">
              <path d="M12 2c.5 3-1 4.3-2.2 5.8C8.4 9.5 7.5 10.8 7.5 13a4.5 4.5 0 0 0 9 0c0-1.4-.5-2.6-1.3-3.7 1.6.8 2.8 2.9 2.8 5.2a7 7 0 0 1-14 0c0-4.3 4-6.5 8-12.5z" />
            </svg>
          </span>
          <span className="brand-name">CarnetPass</span>
        </div>

        {mode === "public" ? (
          <button className="btn btn-ghost" onClick={() => setMode("pro")}>
            🔒 Espace pro
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setMode("public")}>
            ← Retour à la consultation
          </button>
        )}
      </header>

      {/* ---------- HERO + RECHERCHE (toujours visible) ---------- */}
      <section className="hero">
        <h1>Le carnet d'entretien infalsifiable de vos équipements</h1>
        <p>Chaudière, climatisation, pompe à chaleur, VMC — un registre vérifiable qui suit l'appareil, pas son propriétaire.</p>

        <div className="search">
          <input
            className="field"
            type="text"
            placeholder="Entrez un ID équipement (ex : CHAUD-DEMO)"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (!searchId) return;
                navigate(`/appareil/${searchId}`);
                chercherChaudiere(searchId);
              }
            }}
          />
          {/* NOUVEAU : la fleche () => evite d'envoyer l'evenement du clic comme ID */}
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!searchId) return;
              navigate(`/appareil/${searchId}`);
              chercherChaudiere(searchId);
            }}
          >
            Rechercher
          </button>
        </div>

        <div className="hero-foot">
          <button className="linklike" onClick={() => setScanOuvert(true)}>
            📷 ou scanner un QR code
          </button>
          <span className="trust">🛡️ Registre public vérifié sur Polygon · aligné DPP / ESPR</span>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() =>
            partagerCarnetPass(
              "https://www.carnetpass.fr",
              "CarnetPass",
              "Découvrez CarnetPass, le carnet d'entretien vérifiable de vos équipements."
            )
          }
        >
          📤 Partager CarnetPass
        </button>
      </section>

      {/* ---------- ESPACE PRO (uniquement en mode pro) ---------- */}
      {mode === "pro" && (
        <section className="pro-zone">
          <div className="pro-bar">
            {account ? (
              <span className="status-ok"><span className="dot" /> Connecté : {account.slice(0, 6)}...{account.slice(-4)}</span>
            ) : hasInjectedWallet ? (
              <button className="btn btn-primary" onClick={connectWallet} disabled={isConnecting}>
                {isConnecting ? "Connexion..." : "🦊 Connecter mon wallet"}
              </button>
            ) : isMobile ? (
              <a className="btn btn-primary" href={metamaskDeepLink}>
                🦊 Ouvrir dans l'app MetaMask
              </a>
            ) : (
              <a className="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
                🦊 Installer MetaMask
              </a>
            )}
            {account && !isCorrectNetwork && <span className="warn">⚠️ Passe sur Polygon (chainId 137).</span>}
            {error && <span className="err">{error}</span>}
            {isMobile && !hasInjectedWallet && (
              <span className="muted">Astuce : sur mobile, la connexion se fait dans le navigateur de l'app MetaMask.</span>
            )}
          </div>

          {account && (
            <div className="form-card">
              <h3>Enregistrer un appareil</h3>
              <input
                className="field"
                placeholder="ID équipement (ex : CHAUD-002)"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
              />

              <input
                className="field"
                placeholder="QR Code (ex : QR-002)"
                value={formQr}
                onChange={(e) => setFormQr(e.target.value)}
              />

              <input
                className="field"
                placeholder="Marque (ex : Saunier Duval)"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />

              <input
                className="field"
                placeholder="Modèle (ex : ThemaPlus Condens 30-A)"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />

              <input
                className="field"
                placeholder="Référence produit"
                value={formProductReference}
                onChange={(e) => setFormProductReference(e.target.value)}
              />

              <input
                className="field"
                placeholder="Numéro de série"
                value={formSerialNumber}
                onChange={(e) => setFormSerialNumber(e.target.value)}
              />
              <button className="btn btn-primary" onClick={enregistrerChaudiere} disabled={isWriting}>
                {isWriting ? "Enregistrement..." : "Enregistrer"}
              </button>
              {writeMsg && <p className="form-msg">{writeMsg}</p>}
            </div>
          )}
        </section>
      )}
      {/* ---------- RÉSULTATS RECHERCHE ÉQUIPEMENTS ---------- */}
      {searchResults.length > 0 && (
        <section className="result">
          <div className="appareil">
            <div className="appareil-head">
              <div>
                <span className="appareil-type">
                  Équipement constructeur
                </span>

                <h2 className="appareil-name">
                  {searchResults.length === 1
                    ? "Équipement trouvé"
                    : `${searchResults.length} équipements trouvés`}
                </h2>

                <p className="appareil-loc">
                  Sélectionne le modèle correspondant à ton appareil.
                </p>
              </div>
            </div>

            {searchResults.map((equipment) => (
              <div
                className="form-card"
                key={equipment.equipmentId}
              >
                <h3>
                  {equipment.brand} · {equipment.model}
                </h3>

                {equipment.range && (
                  <p>
                    <strong>Gamme :</strong>{" "}
                    {equipment.range}
                  </p>
                )}

                {equipment.variant && (
                  <p>
                    <strong>Version :</strong>{" "}
                    {equipment.variant}
                  </p>
                )}

                <p>
                  <strong>Référence constructeur :</strong>{" "}
                  {equipment.manufacturerReference}
                </p>

                <p className="muted">
                  Fiche équipement générique — aucun CarnetPass
                  personnel n'est créé par cette recherche.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => ouvrirFicheEquipement(equipment)}
                >
                  Ouvrir la fiche
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* ---------- FICHE ÉQUIPEMENT GÉNÉRIQUE ---------- */}
      {selectedEquipment && (
        <section className="result">
          <div className="appareil">
            <div className="appareil-head">
              <div>
                <span className="appareil-type">
                  Fiche équipement constructeur
                </span>

                <h2 className="appareil-name">
                  {selectedEquipment.brand} · {selectedEquipment.model}
                </h2>

                <p className="appareil-loc">
                  {selectedEquipment.range}
                  {selectedEquipment.variant
                    ? ` · ${selectedEquipment.variant}`
                    : ""}
                </p>
              </div>

              <span className="badge-verified">
                ✔ Documentation vérifiée
              </span>
            </div>

            <div className="appareil-grid">
              <div>
                <span className="k">Marque</span>
                <span className="v">
                  {selectedEquipment.brand}
                </span>
              </div>

              <div>
                <span className="k">Modèle</span>
                <span className="v">
                  {selectedEquipment.model}
                </span>
              </div>

              <div>
                <span className="k">Version</span>
                <span className="v">
                  {selectedEquipment.variant || "—"}
                </span>
              </div>

              <div>
                <span className="k">
                  Référence constructeur
                </span>
                <span className="v">
                  {selectedEquipment.manufacturerReference}
                </span>
              </div>
            </div>

            <p className="muted">
              Cette fiche décrit un modèle constructeur.
              Aucun CarnetPass personnel ni QR individuel
              n'est encore créé.
            </p>
            {/* ---------- CRÉATION CARNETPASS PERSONNEL ---------- */}
            <div className="technical-docs">
              <h3>🏷️ C’est mon appareil</h3>

              <p className="muted">
                Renseigne le numéro de série indiqué sur l’appareil pour créer son CarnetPass personnel.
              </p>

              <input
                type="text"
                value={personalSerialNumber}
                onChange={(e) => {
                  setPersonalSerialNumber(e.target.value);
                  setCarnetPassCreationMessage("");
                }}
                placeholder="Numéro de série"
                disabled={isCreatingCarnetPass}
              />

              <button
                className="btn btn-primary"
                onClick={creerCarnetPassPersonnel}
                disabled={
                  isCreatingCarnetPass ||
                  !personalSerialNumber.trim()
                }
              >
                {isCreatingCarnetPass
                  ? "Création en cours..."
                  : "Créer mon CarnetPass"}
              </button>

              {carnetPassCreationMessage && (
                <p className="muted">
                  {carnetPassCreationMessage}
                </p>
              )}
            </div>
            {/* ---------- DOCUMENTATION ---------- */}
            {equipmentKnowledge?.data?.documents?.length > 0 && (
              <div className="technical-docs">
                <h3>📚 Documentation technique</h3>

                {equipmentKnowledge.data.documents.map(
                  (document) => (
                    <div
                      className="technical-doc-card"
                      key={document.documentId}
                    >
                      <p>
                        <strong>
                          {document.documentType === "exploded_view"
                            ? "🔧 Vue éclatée"
                            : document.documentType === "user_manual"
                              ? "📗 Notice utilisateur"
                              : "📘 Notice installation / maintenance"}
                        </strong>
                      </p>

                      <p>{document.title}</p>

                      {document.documentCode && (
                        <p>
                          Référence document :{" "}
                          <strong>
                            {document.documentCode}
                          </strong>
                        </p>
                      )}

                      {document.pageCount && (
                        <p>
                          Nombre de pages :{" "}
                          <strong>
                            {document.pageCount}
                          </strong>
                        </p>
                      )}

                      {document.documentUrl && (
                        <a
                          className="btn btn-ghost"
                          href={document.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ouvrir le document
                        </a>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* ---------- ASSISTANT IA ---------- */}
          <div className="ai-assistant">
            <p className="ai-title">
              🤖 Assistant technique CarnetPass
            </p>

            <p className="muted">
              Pose une question technique sur ce modèle.
            </p>

            <textarea
              className="ai-question"
              value={aiQuestion}
              onChange={(e) => {
                setAiQuestion(e.target.value);
                setAiAnswer("");
              }}
              placeholder="Ex : Défaut F28 : que dois-je vérifier ?"
              rows={3}
            />

            <button
              className="btn"
              onClick={demanderIA}
              disabled={
                isAiLoading ||
                !aiQuestion.trim()
              }
            >
              {isAiLoading
                ? "Analyse en cours..."
                : "🤖 Demander à l’IA"}
            </button>

            {aiAnswer && (
              <div className="ai-answer">
                <ReactMarkdown>
                  {aiAnswer}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </section>
      )}
      {/* ---------- MESSAGE "NON TROUVE" ---------- */}
      {message && !technicalResult && <p className="notfound">{message}</p>}
      {technicalResult && (
        <section className="technical-result">
          <h2>
            ⚠️ {technicalResult.code} — {technicalResult.title}
          </h2>

          <h3>Signification</h3>
          <p>{technicalResult.manufacturerData.meaning}</p>

          <h3>Causes possibles</h3>
          <ul>
            {technicalResult.manufacturerData.possibleCauses.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>

          <h3>Contrôles professionnels</h3>
          <ul>
            {technicalResult.manufacturerData.professionalChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>

          <h3>Consignes de sécurité</h3>
          <ul>
            {technicalResult.userGuidance.allowedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>

          <p>
            <strong>Source :</strong> document constructeur Saunier Duval —
            page {technicalResult.source.page}
          </p>
        </section>
      )}

      {/* ---------- FICHE APPAREIL + CARNET (si un appareil est trouve) ---------- */}
      {boiler && (
        <section className="result">
          <div className="appareil">
            <div className="appareil-head">
              <div>
                <span className="appareil-type">Équipement</span>
                <h2 className="appareil-name">{boiler.equipmentId}</h2>
                <p className="appareil-loc">{boiler.brand} · {boiler.model}</p>
              </div>
              <span className="badge-verified">✔ Vérifié</span>
            </div>

            <div className="appareil-grid">
              <div>
                <span className="k">QR Code</span>
                <span className="v">{boiler.qrCode}</span>
              </div>

              <div>
                <span className="k">Marque</span>
                <span className="v">{boiler.brand}</span>
              </div>

              <div>
                <span className="k">Modèle</span>
                <span className="v">{boiler.model}</span>
              </div>

              <div>
                <span className="k">Référence produit</span>
                <span className="v">{boiler.productReference}</span>
              </div>

              <div>
                <span className="k">Numéro de série</span>
                <span className="v">{boiler.serialNumber}</span>
              </div>
            </div>

            {/* NOUVEAU (QR) : le QR code physique a coller sur l'appareil.
                Il pointe vers l'adresse EN LIGNE de la fiche -> scannable depuis n'importe quel telephone. */}
            <div className="qr-zone">
              <p className="qr-title">QR à coller sur l'appareil</p>
              <div className="qr-box">
                <QRCodeCanvas
                  id={`qr-${boiler.equipmentId}`}
                  value={`https://carnetpass.fr/appareil/${boiler.equipmentId}`}
                  size={160}
                  level="M"                  /* niveau de correction d'erreur : lisible meme un peu abime */
                  includeMargin={true}
                />
              </div>
              <button className="btn btn-ghost" onClick={() => telechargerQR(boiler.equipmentId)}>
                ⬇️ Télécharger le QR
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  partagerCarnetPass(
                    `https://www.carnetpass.fr/appareil/${boiler.equipmentId}`,
                    `CarnetPass - ${boiler.brand} ${boiler.model}`,
                    `Consultez le carnet d'entretien de l'équipement ${boiler.equipmentId}.`
                  )
                }
              >
                📤 Partager cette fiche
              </button>
              {isAppInstalled ? (
                <button
                  className="btn btn-ghost"
                  disabled
                >
                  ✅ CarnetPass installé
                </button>
              ) : installPrompt ? (
                <button
                  className="btn btn-primary"
                  onClick={installerCarnetPass}
                >
                  📲 Installer CarnetPass
                </button>
              ) : null}


              <p className="qr-hint">Imprime-le et colle-le sur l'appareil. Un scan ouvre cette fiche.</p>
            </div>
            {/* ---------- DOCUMENTATION TECHNIQUE ---------- */}
            {equipmentKnowledge?.data?.documents?.length > 0 && (
              <div className="technical-docs">
                <h3>📚 Documentation technique</h3>

                {equipmentKnowledge.data.documents.map((document) => (
                  <div className="technical-doc-card" key={document.documentId}>
                    <p>
                      <strong>
                        {document.documentType === "exploded_view"
                          ? "🔧 Vue éclatée"
                          : "📘 Notice constructeur"}
                      </strong>
                    </p>

                    <p>{document.title}</p>

                    {document.documentCode && (
                      <p>
                        Référence document : <strong>{document.documentCode}</strong>
                      </p>
                    )}

                    <p>
                      Nombre de pages : <strong>{document.pageCount}</strong>
                    </p>
                    {document.documentUrl && (
                      <a
                        className="btn btn-ghost"
                        href={document.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {document.documentType === "exploded_view"
                          ? "🔧 Ouvrir la vue éclatée"
                          : "📘 Ouvrir la notice"}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* ASSISTANT IA CARNETPASS */}
          <div className="ai-assistant">
            <p className="ai-title">🤖 Assistant technique CarnetPass</p>

            <p className="muted">
              Pose une question technique sur cet équipement.
            </p>

            <textarea
              className="ai-question"
              value={aiQuestion}
              onChange={(e) => {
                setAiQuestion(e.target.value);
                setAiAnswer("");
              }}
              placeholder="Ex : Défaut F28 : que dois-je vérifier ?"
              rows={3}
            />

            <button
              className="btn"
              onClick={demanderIA}
              disabled={isAiLoading || !aiQuestion.trim()}
            >
              {isAiLoading ? "Analyse en cours..." : "🤖 Demander à l’IA"}
            </button>

            {aiAnswer && (
              <div className="ai-answer">
                <ReactMarkdown>{aiAnswer}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* CARNET EN FRISE */}
          <div className="carnet">
            <p className="carnet-title">Carnet d'entretien</p>
            <button
              className="btn btn-ghost"
              onClick={telechargerCarnetPDF}
              disabled={isLoadingCarnet}
            >
              📄 Télécharger le carnet PDF
            </button>
            {isLoadingCarnet ? (
              <p className="muted">Chargement du carnet...</p>
            ) : carnetError ? (
              <p className="err">❌ {carnetError}</p>
            ) : maintenances.length === 0 ? (
              <p className="muted">Aucune intervention enregistrée pour cet appareil.</p>
            ) : (
              <div className="timeline">
                {maintenances.map((m, index) => (
                  <div className="tl-item" key={index}>
                    <div className="tl-marker">
                      <span className="tl-dot" />
                      {index < maintenances.length - 1 && <span className="tl-line" />}
                    </div>
                    <div className="tl-body">
                      <p className="tl-date">{formatDate(m.date)}</p>
                      <p className="tl-type">{m.interventionType}</p>
                      <p className="tl-desc">{m.description} — {m.technician}</p>
                      {m.partChanged && <p className="tl-part">Pièce changée : {m.partChanged}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AJOUT D'INTERVENTION (mode pro + wallet connecte) */}
            {mode === "pro" && account && (
              <div className="form-card">
                <h3>Ajouter une intervention</h3>

                <p className="muted">
                  🔒 Données techniques uniquement. N'indiquez aucun nom de client,
                  adresse, téléphone, e-mail ou autre donnée personnelle :
                  cette intervention sera inscrite sur la blockchain Polygon.
                </p>

                <input
                  className="field"
                  placeholder="Type d'intervention (ex : Entretien annuel)"
                  value={mType}
                  onChange={(e) => setMType(e.target.value)}
                />

                <input
                  className="field"
                  placeholder="Description technique uniquement (ex : Nettoyage brûleur)"
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                />

                <input
                  className="field"
                  placeholder="Entreprise / identifiant technicien (sans nom ni prénom)"
                  value={mTech}
                  onChange={(e) => setMTech(e.target.value)}
                />

                <input
                  className="field"
                  placeholder="Pièce changée / référence (optionnel)"
                  value={mPart}
                  onChange={(e) => setMPart(e.target.value)}
                />
                <button className="btn btn-primary" onClick={ajouterIntervention} disabled={isAddingM}>
                  {isAddingM ? "Ajout en cours..." : "Ajouter au carnet"}
                </button>
                {mMsg && <p className="form-msg">{mMsg}</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- SCANNER QR (plein ecran, uniquement quand ouvert) ---------- */}
      {scanOuvert && (
        <Suspense fallback={<div className="scan-loading">Ouverture de la caméra…</div>}>
          <ScannerQR
            onClose={() => setScanOuvert(false)}
            onCodeDetecte={ouvrirDepuisScan}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;