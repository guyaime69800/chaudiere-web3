# Achats Pro, recharges et comptes supplémentaires

État courant après cette préparation : réception et traitement des notifications activés et validés par une vraie expiration Stripe sans débit. Les ventes, places et portail restent fermés. Voir `stripe-live-delivery-20261021.md` ; les mentions « aucun interrupteur activé » ci-dessous décrivent le déploiement de préparation antérieur.

## Raccordement

- L'état des achats est lu côté serveur avec `GET /api/billing?action=purchase-status`. Il reste fermé par défaut. Les places exigent en plus `CARNETPASS_LIVE_SEATS_ENABLED=true` ; aucun interrupteur LIVE n'a été activé.
- L'interface Pro exige les CGV, un responsable et une entreprise validée. Le serveur vérifie à nouveau l'identité, le rôle, l'entreprise et les prix. Les recharges conservent les mêmes contrôles serveur et des URL Stripe strictes.
- Les commandes du navigateur gardent un UUID par compte et produit pendant les reprises (sessionStorage et mémoire). Le serveur conserve les commandes avant Stripe, leur clé d'idempotence et le contrôle du destinataire.
- Le retour du paiement actualise la formule et les factures pendant une minute ; un paramètre d'URL ne confère aucun droit.
- Un abonnement effectivement résilié peut être remplacé par une nouvelle souscription payée. L'ancien doit être confirmé résilié localement et chez Stripe. SQL exige une nouvelle commande postérieure à l'ancien état, et les anciennes notifications ne réactivent pas l'ancien abonnement.

## Places

`server/billing-live-seats.js` propose les actions `additional-status`, `additional-quote`, `additional-update` et `additional-cancel`, réservées au responsable connecté. Les montants, l'abonnement et le client proviennent du serveur.

Le récapitulatif dure cinq minutes : période, quantité, choix des collaborateurs, CGV et paramètres Stripe sont persistés. L'augmentation recalcule le même prorata avant validation et utilise `pending_if_incomplete` avec facture immédiate. Aucune place n'est accordée directement par ce gestionnaire ; la relecture d'un paiement confirmé et la transaction SQL restent nécessaires.

La réduction utilise deux phases d'un Subscription Schedule, sans prorata immédiat : quantité actuelle jusqu'à l'échéance, puis quantité réduite. Les collaborateurs conservés sont choisis explicitement. Au nouveau paiement, la transaction SQL retire les autres accès techniques, conserve le compte principal et expire les invitations en attente. Les dossiers techniques restent en place. Une réduction programmée peut être annulée avant l'échéance.

Migration `20261021143658_stripe_live_seat_changes.sql` créée par le CLI officiel, testée dans PGlite, appliquée à Paris 2 puis enregistrée dans l'historique. Nouvelle table avec RLS, aucune permission anon/authenticated ; fonction d'application SECURITY INVOKER et service uniquement. Vérification distante : permissions de lecture et d'application présentes, zéro changement de places, commande ou liaison live créés.

## Vérifications

- 52 tests Node ciblés réussis ; ESLint et builds réussis.
- Vraies fonctions SQL dans PGlite : permissions, doublons, baux, crédits/remboursements, réduction au collègue sélectionné et conservation du responsable, nouvelle souscription après résiliation. Aucun réseau dans ces tests.
- Navigateur avec services isolés : achats fermés ; parcours Pro avec CGV ; refus d'une entreprise non approuvée et d'un technicien ; recharge de 20 € et reprise après échec avec même UUID ; réduction et sélection des collaborateurs sur écran mobile de 390 px. Aucun serveur Stripe ou Supabase contacté par ce scénario navigateur.
- Supabase Advisors : 19 avertissements préexistants, aucun sur les objets Stripe modifiés.
- Permissions réelles Stripe : sept ressources lisibles (dont Subscription Schedules), catalogue et portail conformes. Sonde de prévisualisation avec un identifiant client fictif inexistant : HTTP 400 `resource_missing` au paramètre `customer`, pas de refus de permission et aucune facture ni client créé.
- Contrat réellement exécuté contre Stripe TEST avec un client fictif distinct : abonnement initial payé fictivement, prévisualisation du prorata, ajout de places payé fictivement avec le même montant, réduction à l'échéance sans nouvelle facture immédiate, annulation de la réduction. L'abonnement technique créé par ce contrôle a été résilié dans `finally`. Aucune base de production contactée par ce contrôle, aucune carte réelle et aucun paiement réel. Le compte privé TEST de l'administrateur n'est pas modifié.

## Limites et ouverture

Déploiement final `dpl_GGVdKtDTbj8NFdKDCDQn6puu3cfh`, `https://carnetpass-aq8glxuix-chaudiere-web3.vercel.app`, construit avec le contrat Stripe TEST réussi, vérifié puis promu sur le domaine public. Contrôle HTTP : achats, recharges, places, portail et webhook live fermés (503), administration et reprise sans authentification refusées (401), page publique 200 et espace professionnel en maintenance 503. Aucun interrupteur LIVE n'a été activé.

Les modifications fiscales, remises, soldes client, abonnement en cours de paiement, échéancier préexistant et réduction d'un abonnement lui-même en cours de résiliation sont refusés pour vérification. Une opération interrompue reprend la même clé ; au-delà de 24 heures, elle requiert le support. Les écritures LIVE de création d'échéancier et les paiements LIVE n'ont pas été exercés.

La validation d'une livraison Stripe réelle jusqu'au domaine de production et l'activation commerciale restent séparées. Le contrôle ne prétend pas avoir effectué un paiement réel. La maintenance, les achats, le portail et les webhooks LIVE restent fermés à la publication de cette préparation.

Documentation consultée : https://docs.stripe.com/api/invoices/create_preview ; https://docs.stripe.com/api/subscription_schedules/update ; https://docs.stripe.com/billing/subscriptions/billing-mode/compare ; https://supabase.com/docs/guides/database/functions.
