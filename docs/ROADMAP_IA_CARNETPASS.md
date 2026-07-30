# CarnetPass — Feuille de route IA, RGPD et blockchain

Dernière mise à jour : 30 juillet 2026  
Branche de travail : `feature/assistant-ia-documentaire`

## 1. Vision du projet

CarnetPass est une application permettant de retrouver l’historique, les documents techniques et les interventions d’un équipement grâce à un QR code.

La priorité actuelle est de construire un assistant IA spécialisé dans le chauffage afin de :

- identifier précisément un appareil ;
- retrouver ses documents techniques ;
- interpréter ses codes erreur ;
- assister le particulier ou le professionnel ;
- fournir des réponses vérifiées et sourcées.

La blockchain reste présente, mais elle devra être discrète et invisible pour l’utilisateur.

Principe retenu :

> La blockchain invisible, la preuve visible.

---

## 2. Objectif d’apprentissage

CarnetPass sert de projet pratique avant et pendant la formation Consulting IA d’Alyra.

Les compétences travaillées seront notamment :

- cadrage d’un besoin métier ;
- structuration et gouvernance des données ;
- création d’un assistant conversationnel ;
- utilisation d’une API IA ;
- conception d’un système RAG ;
- OCR et reconnaissance de plaques signalétiques ;
- évaluation des réponses ;
- gestion des coûts ;
- sécurité ;
- RGPD ;
- IA Act ;
- pilotage d’un projet IA.

---

## 3. État actuel

- Application CarnetPass en ligne : terminée
- Contrat Polygon déployé : terminé
- Lecture d’une fiche par QR code : terminée
- Scanner QR par caméra : terminé
- Branche IA séparée : terminée
- Base de connaissances pilote : en cours
- Assistant IA : à construire
- RAG documentaire : à construire
- OCR de plaque signalétique : à construire
- Nouvelle architecture RGPD : prévue après le bot
- Suppression de MetaMask du parcours classique : prévue

---

# BLOC 1 — Assistant IA documentaire

## Phase 1 — Base de connaissances

Premier appareil pilote :

- Marque : Saunier Duval
- Gamme : ThemaPlus Condens
- Modèle : ThemaPlus Condens 30-A
- Variante : H-FR
- Référence constructeur : 0010017388
- Identifiant CarnetPass : CHAUD-DEMO

Données à structurer :

- identité de l’appareil ;
- documents techniques ;
- codes erreur ;
- symptômes ;
- causes possibles ;
- procédures de contrôle ;
- niveau de danger ;
- source de l’information ;
- niveau de confiance ;
- date de vérification.

État actuel :

- `equipment-index.json` créé ;
- fiche `saunier-duval-0010017388.json` créée ;
- syntaxe JSON vérifiée ;
- premier commit effectué : `61111fe`.

---

## Phase 2 — Moteur de recherche déterministe

Avant d’utiliser une IA générative, CarnetPass devra reconnaître des demandes comme :

- F28
- Code F28
- Défaut F28
- Ma chaudière affiche F28

Le moteur devra retourner :

- le modèle concerné ;
- la signification du code ;
- les causes possibles ;
- les contrôles autorisés ;
- le niveau de danger ;
- les sources ;
- le niveau de confiance.

Objectif pédagogique :

Comprendre la différence entre une règle informatique déterministe et une réponse générée par une IA.

---

## Phase 3 — Interface du bot

Création future du composant :

`frontend/src/components/DiagnosticBot.jsx`

Deux modes seront prévus :

### Mode particulier

- vocabulaire simple ;
- conseils sans danger ;
- arrêt immédiat en cas de risque ;
- orientation vers un professionnel.

### Mode professionnel

- informations techniques détaillées ;
- contrôles complémentaires ;
- accès aux documents ;
- historique de l’appareil.

---

## Phase 4 — API IA sécurisée

L’appel au modèle IA devra être réalisé côté serveur.

Architecture prévue :

Question utilisateur  
→ serveur CarnetPass  
→ recherche dans les données vérifiées  
→ envoi du contexte au modèle IA  
→ réponse structurée  
→ affichage des sources

Règles :

- aucune clé API dans le frontend ;
- aucune clé API sur GitHub ;
- limitation du nombre de requêtes ;
- gestion des erreurs ;
- suivi des coûts ;
- enregistrement des performances.

---

## Phase 5 — RAG documentaire

Le RAG permettra de rechercher directement dans les notices techniques.

Processus prévu :

PDF  
→ extraction du texte  
→ découpage en passages  
→ indexation  
→ recherche sémantique  
→ réponse du modèle  
→ citation du document et de la page

Chaque réponse importante devra afficher :

- le document utilisé ;
- la page ou la section ;
- le niveau de confiance ;
- la date de vérification.

---

## Phase 6 — OCR et reconnaissance d’appareil

L’utilisateur pourra photographier une plaque signalétique.

Informations à extraire :

- marque ;
- modèle ;
- référence constructeur ;
- numéro de série ;
- puissance ;
- type de gaz ;
- année si disponible.

Le résultat devra toujours être confirmé par l’utilisateur avant l’enregistrement.

---

## Phase 7 — Évaluation du bot

Création d’un jeu de tests comprenant :

- questions simples ;
- codes erreur ;
- formulations ambiguës ;
- mauvais modèle ;
- document manquant ;
- situation dangereuse ;
- tentative de faire inventer une réponse ;
- question sans source disponible.

Mesures prévues :

- taux de bonnes réponses ;
- taux de réponses sourcées ;
- nombre d’hallucinations ;
- temps de réponse ;
- coût par requête ;
- nombre de demandes transférées à un humain.

---

# BLOC 2 — RGPD et traçabilité

## Phase 8 — Séparer données privées et blockchain

Les données personnelles ne devront plus être écrites en clair sur Polygon.

### Base de données privée

Elle contiendra notamment :

- nom du client ;
- adresse ;
- téléphone ;
- email ;
- numéro de série ;
- rapports complets ;
- photos ;
- factures ;
- échanges avec l’assistant IA.

### Blockchain

Elle contiendra seulement les preuves nécessaires :

- identifiant pseudonymisé ;
- empreinte cryptographique du rapport ;
- date et heure ;
- type d’événement ;
- version du document ;
- signature technique CarnetPass.

La blockchain servira à prouver qu’un document n’a pas été modifié, sans publier son contenu.

---

## Phase 9 — Blockchain discrète et sans MetaMask obligatoire

Le particulier ne devra pas avoir besoin de comprendre :

- MetaMask ;
- Polygon ;
- le gas ;
- les signatures blockchain ;
- les adresses de portefeuille.

Parcours utilisateur prévu :

- connexion par email, lien sécurisé ou passkey ;
- validation d’une intervention avec un bouton classique ;
- création automatique de la preuve en arrière-plan ;
- message simple :

`Intervention enregistrée et preuve d’intégrité certifiée.`

MetaMask pourra rester une option avancée pour certains professionnels, mais ne sera jamais obligatoire.

---

## Phase 10 — Vérification publique

Une page publique permettra de vérifier un document ou une intervention grâce à un QR code.

Informations visibles :

- document authentique ou non ;
- date de certification ;
- entreprise ayant réalisé l’intervention ;
- confirmation que le document n’a pas été modifié.

Aucune adresse personnelle ou donnée privée ne devra être affichée.

---

# BLOC 3 — Transformation en produit

## Phase 11 — Comptes et rôles

Rôles prévus :

- particulier ;
- technicien ;
- responsable d’entreprise ;
- régie ;
- constructeur ;
- administrateur CarnetPass.

Chaque rôle devra disposer uniquement des droits nécessaires.

---

## Phase 12 — Portfolio Alyra

CarnetPass pourra être présenté comme une étude de cas professionnelle comprenant :

- problématique métier ;
- utilisateurs concernés ;
- architecture IA ;
- gouvernance des données ;
- RAG ;
- OCR ;
- tests ;
- sécurité ;
- budget ;
- RGPD ;
- IA Act ;
- blockchain ;
- bénéfices ;
- risques ;
- limites ;
- perspectives d’évolution.

---

# Règles permanentes

1. Aucune clé API dans le frontend ou GitHub.
2. Aucune donnée personnelle en clair sur une blockchain publique.
3. Aucune réponse technique importante sans source ou niveau d’incertitude.
4. Aucun diagnostic dangereux présenté comme une certitude.
5. Aucune modification directe de `main` sans test et validation.
6. Un commit clair à chaque étape importante.
7. Mise à jour régulière de cette feuille de route.

---

# Prochaine étape exacte

Enrichir la fiche Saunier Duval avec des documents techniques vérifiés, puis structurer les premiers codes erreur.

Ne pas encore connecter une API IA.