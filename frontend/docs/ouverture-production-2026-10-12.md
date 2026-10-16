# Preparation de l'ouverture ? 12 octobre 2026

## Realise dans cette version
- Acceptation explicite de la version 2026-10-12.1 des CGV dans les interfaces.
- Validation serveur avant Checkout ; acteur authentifie, entreprise, version et heure serveur dans les metadonnees Stripe.
- Acceptation obligatoire aussi dans Checkout Stripe. Les recharges nouvelles portant une version de CGV exigent le consentement Stripe avant attribution.
- Controle MFA sur la facturation.
- Export JSON des dossiers principaux, habilitation responsable, isolation entreprise, RLS, pagination, plafond de volume avec refus explicite des archives incompletes et deux demandes par dix minutes.
- Acces aux fichiers joints et autres categories sur demande : aucun export universel de fichiers promis.
- Projet d'accord de traitement joint, aucune signature ou adhesion aux contrats fournisseurs supposee.
- Paiements reels et maintenance conserves dans leur etat ferme.

## Conservation : registre operationnel a finaliser
| Categorie | Regle actuelle / action |
|---|---|
| Consultations notices | Compteurs TTL 48 h, recus TTL 15 min |
| Compteurs mensuels Shiba | Expiration echeance + un jour |
| Credits de recharge | Conserves tant que le compte existe ; reprise apres interruption |
| Scan temporaire | Expiration technique 2 h |
| Comptes supprimes | Acces retires, profil anonymise, rattachements retires |
| Dossiers techniques | Conserves dans l'entreprise ; suppression sur instruction verifiee, pas de purge arbitraire |
| Journaux et sauvegardes prestataires | Relever les durees effectives des offres souscrites avant ouverture ; ne pas annoncer une duree non verifiee |
| Demandes commerciales | Trier a la cloture, supprimer les donnees inutiles ; registre et routine a valider |
| Factures futures | Archivage comptable legal a configurer au demarrage des ventes |

## Blocages externes avant activation
1. Nom legal autorise a publier et SIREN/SIRET definitif.
2. Verification de l'adresse professionnelle complete et du contact legal requis.
3. Compte Stripe live habilite, prix live 28 EUR mensuel/utilisateur, prix de recharge et webhook live. Le code actuel reste volontairement en test, la synchronisation des droits live n'est pas declaree prete.
4. Identite fiscale et mentions de facture completes ; verifier le PDF Stripe avec TVA non applicable.
5. Confirmer les comptes/contrats DPA effectivement souscrits, regions et transferts ; signer/rattacher l'accord CarnetPass au contrat.
6. Verifier les cles R2 d'ecriture : une cle de migration temporaire n'est pas suffisante pour l'exploitation permanente. L'expiration ne se deduit pas de la valeur d'une cle.
7. Executer un parcours live controle : paiement, notification serveur, activation, facture, recharge unique, resiliation sans renouvellement, incident et reprise.
8. Retirer la maintenance seulement apres ces controles.

## Procedure demandes de droits et reversibilite
- Boite : contact@carnetpass.fr. Enregistrer date, perimetre et demandeur sans copie d'identite superflue.
- Verifier l'habilitation et les droits de tiers.
- Reponse dans le delai RGPD, en principe un mois ; notifier toute prolongation justifiee.
- Export courant depuis les parametres ; pour les autres categories, preparer l'archive et verifier l'absence de donnees d'une autre entreprise avant remise.
- Pour effacement, inventorier dossiers, pieces, Redis et sauvegardes, obligations applicables ; documenter la decision et le calendrier avant action irreversible.
- Conserver uniquement la preuve minimale de traitement de la demande pour la finalite justifiee.

## Confirmations du titulaire
- 12 octobre : Stripe non valide, paiements reels a garder fermes.
- 12 octobre : cle R2 declaree permanente par le titulaire (duree non deduite de la valeur de la cle).
