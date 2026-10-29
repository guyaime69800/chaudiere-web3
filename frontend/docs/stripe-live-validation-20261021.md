# Validation de la chaîne Stripe et des résiliations

Mise à jour : la livraison authentique et le cron de production sont désormais validés, réception et traitement activés. Les ventes restent fermées. État détaillé dans `stripe-live-delivery-20261021.md` ; ce document décrit la préparation antérieure.

## Changements

Le processeur de notifications reconnaît les résiliations classiques (`cancel_at_period_end`) et flexibles (`cancel_at`). Il conserve l'accès pendant la période réellement payée et borne sa durée par une éventuelle date de résiliation plus proche. La reprise d'un abonnement existant efface la date programmée ; une résiliation effective retire l'accès et les places.

La migration `20261021141150_stripe_live_scheduled_cancellation.sql`, créée par le CLI Supabase, ajoute `subscriptions.stripe_cancel_at` et remplace la fonction d'application atomique. Cette fonction reste SECURITY INVOKER, réservée au service, et conserve les vérifications de bail, de destinataire, de commande et de doublon. Le compte client affiche la date programmée et l'échéance payée. La requête du client n'ajoute les nouvelles colonnes que pour Paris 2 afin de préserver la compatibilité avec l'ancien Preview suspendu.

## Vérifications

- 31 tests Node ciblés et ESLint réussis.
- Le test SQL existant couvre transactions, doublons, baux, crédits et remboursements.
- Nouveau scénario intégré : vrai gestionnaire de webhook, signature HMAC locale, relecture Stripe simulée et vraies fonctions SQL dans PGlite. Il couvre refus d'une mauvaise signature et d'un événement TEST, paiement, application unique des droits, résiliation flexible, reprise, indisponibilité Stripe et rejeu, autre client et ancienne facture après résiliation. Aucun réseau ni donnée de production dans ce test.
- Migration appliquée uniquement à `tsyukqcyfxcrjrhopvpv`, puis enregistrée dans l'historique Supabase.
- Vérification distante en lecture seule : colonne, application atomique, SECURITY INVOKER, exécution service uniquement, RLS et lecture client autorisée sous ses politiques existantes. Zéro liaison client live, commande ou abonnement géré live.
- Supabase Advisors : 19 avertissements préexistants, aucun sur les objets Stripe modifiés.
- Build distant réussi ; audit Stripe réel en GET uniquement : six ressources du processeur accessibles (200), compte et catalogue conformes, portail par défaut conforme. Les liens juridiques hérités restent non exposés par cette API et ont été confirmés précédemment dans le tableau de bord.
- Déploiement `dpl_B6RXdaFhChNP55z1yYyFTpbRS4pJ`, `https://carnetpass-4kkyidkcz-chaudiere-web3.vercel.app`, vérifié puis promu sur le domaine public. Achats, recharges, portail et webhook live toujours 503 ; API admin et reprise sans authentification 401. Page publique 200, espace professionnel en maintenance 503.

## Limites avant ouverture

Ce scénario intégré n'est pas une livraison Stripe réelle vers le serveur déployé et aucun paiement réel n'a été créé. Le parcours privé TEST ne délivre toujours aucun droit client de production.

Les interrupteurs LIVE restent désactivés. Les interfaces d'achat Pro et de recharges, les changements de places avec récapitulatif de prorata et choix des membres conservés, ainsi que la reprise après résiliation effective doivent encore être terminés avant une ouverture commerciale. Le portail live est préparé mais aucun client réel n'a été créé pour y ouvrir une session.

Références : https://docs.stripe.com/billing/subscriptions/billing-mode/compare#cancellations-in-the-customer-portal ; https://supabase.com/docs/guides/database/functions. Changelog Supabase consulté le 21 octobre : les changements TLS annoncés ne changent pas la syntaxe de cette migration.
