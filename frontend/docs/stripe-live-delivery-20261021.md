# Réception Stripe réelle validée — 21 octobre 2026

État ultérieur : achats et portail activés derrière la maintenance, places toujours désactivées. Voir `controlled-billing-20261021.md`. Les valeurs ci-dessous décrivent l'étape de validation des notifications.

## État courant

Variables Vercel Production persistées :

- `CARNETPASS_STRIPE_LIVE_WEBHOOK_ENABLED=true`
- `CARNETPASS_STRIPE_LIVE_PROCESSING_ENABLED=true`
- `CARNETPASS_LIVE_BILLING_ENABLED=false`
- `CARNETPASS_LIVE_SEATS_ENABLED=false`
- `CARNETPASS_STRIPE_LIVE_PORTAL_ENABLED=false`

Les ventes, recharges, modifications de places et portail restent donc fermés. Le site conserve sa maintenance. Le cookie admin, les rôles et le MFA ne sont pas modifiés.

Déploiement final normal, sans drapeau de build lançant une sonde : `dpl_5Amwk9dYRophZu4eL5jDYW9uP4Dc`, `https://carnetpass-9je8900wb-chaudiere-web3.vercel.app`. Vérifié puis promu sur le domaine public. Les déploiements de vérification précédents ne doivent pas être redéployés avec leurs drapeaux de sondes ; la sonde de livraison exige délibérément une base de départ vide.

## Transport et reprise

Déploiement initial `dpl_JopXYfbj7hqHRK1QbR3ddBYRFEiH`, puis vérification distante depuis le build `dpl_H1cwz8ijPWDDNNB9Xv7DNBBedJiY` : vrai corps brut signé accepté (événement technique non pris en charge, donc sans écriture), refus des signatures absentes, corps modifiés, signatures périmées, mode TEST et autre compte. Cron sans secret 401 ; avec le secret serveur, file vide traitée correctement (200). Aucun secret extrait ni affiché.

Le récepteur vérifié a été promu sur `https://www.carnetpass.fr/api/stripe-webhook`, puis une authentique notification Stripe a été déclenchée sans paiement.

## Livraison authentique sans débit

Le build `dpl_DvHEG4NvCEDGYxt812RpGgeY8pMr` exécute `audit-live-stripe-delivery.mjs` uniquement sur activation explicite de son drapeau de build. Le script contrôle d'abord le compte et le catalogue et exige zéro commande, liaison client et notification préexistantes.

Il crée une session Checkout technique **non publiée** en mode live, sans email, client ou carte, puis l'expire immédiatement. L'URL de paiement n'est jamais affichée. Stripe confirme `expired`, `unpaid`, `customer=null`, `subscription=null` ; aucun paiement n'est effectué et cette session ne peut plus être payée.

La destination Stripe existante a envoyé `checkout.session.expired` au domaine public. Le gestionnaire a vérifié sa vraie signature puis persisté sa réception dans Paris 2. Le cron authentifié a repris cette notification volontairement sans commande liée et a incrémenté son compteur de tentative : aucun droit ne pouvait être accordé.

Identifiants techniques pour audit (aucune donnée client) :

- événement : `evt_1UT1LN6m8GCMolJNvFLMxk6P`
- session expirée : `cs_live_a1GXTVfN7Rnl407ZsZLvfNkYXcbmUNBQs43RNIBLBVMJMwxjoUzD6ySgYK`

La notification est conservée et classée en revue opérateur par le fichier strictement ciblé `supabase-production/close-stripe-delivery-check-20261021.sql`, afin de ne pas rejouer indéfiniment cette vérification technique sans commande. Le contrôle final confirme **zéro notification en attente, zéro commande live, zéro liaison client live, zéro abonnement géré live et zéro achat de crédits live**. Le compteur de reprise de la notification technique vaut 1.

## Portée

La livraison réelle Stripe → HTTPS public → signature → journal durable → reprise est vérifiée. Ce contrôle ne prétend pas avoir effectué un paiement réel ni validé un renouvellement ou un remboursement réel. Les transactions de droits et crédits restent couvertes par les tests SQL et de réconciliation ; l'achat fictif, les proratas et échéanciers ont été vérifiés séparément contre Stripe TEST.

Sources techniques consultées : https://docs.stripe.com/api/checkout/sessions/expire ; https://docs.stripe.com/webhooks.
