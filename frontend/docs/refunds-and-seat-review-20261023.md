# Remboursements, comptes supplémentaires et mails — 23 octobre 2026

Le fondateur a payé 28 € en LIVE, puis remboursé intégralement le paiement et résilié immédiatement l'abonnement. Les captures confirment activation Pro, facture GHYBTDDE-0001 et retour à l'état arrêté. Aucune nouvelle opération financière effectuée par cette correction.

## Remboursements

La liste des factures lit désormais les paiements Stripe associés et les remboursements de leurs charges, dans le périmètre du client authentifié. L'état comptable de la facture reste conservé ; une mention distincte affiche le remboursement intégral ou partiel et son montant. En cas de permission manquante ou preuve incomplète, un message indique que le suivi est indisponible, sans inventer un remboursement nul.

Contrôle LIVE en lecture seule pendant le build : facture GHYBTDDE-0001, remboursement intégral de 2800 centimes confirmé avec la clé restreinte existante. Aucun secret, email, lien privé ni détail bancaire journalisé. Le contrôle est opt-in (`CARNETPASS_INVOICE_REFUND_AUDIT=1`), pas exécuté par défaut.

Tests : helper total/partiel/sans remboursement, refus de mauvais client/environnement et paiements tronqués ou répartis ; endpoint authentifié ; navigateur avec services simulés pour affichage du remboursement. Ne pas confondre statut Stripe remboursé et date de crédit bancaire.

## Comptes supplémentaires

Tests serveur relancés : récapitulatif/prorata, consentement, idempotence, refus technicien/collègues étrangers/montant modifié, réduction programmée. Navigateur isolé : ajout vers facture Stripe et réduction avec sélection des collègues. Le contrat Stripe TEST avait déjà validé ajout payé fictivement et réduction. Aucun ajout LIVE effectué ; interrupteur `CARNETPASS_LIVE_SEATS_ENABLED` toujours désactivé. Un test utilisateur LIVE nécessiterait de nouveau un abonnement Pro actif, l'abonnement actuel étant résilié. Ne pas réclamer un nouveau paiement pour les contrôles locaux.

## Mails

L'envoi applicatif existant `sendTestInvoiceEmail` est limité au TEST. Les reçus LIVE peuvent être envoyés automatiquement par Stripe sans ajouter un deuxième expéditeur : paramètres > entreprise > e-mails aux clients, activer paiements réussis et remboursements. Capture des réglages demandée au fondateur ; activation et réception non confirmées. Aucun mail envoyé par l'agent. Pour le paiement déjà effectué, Stripe permet un envoi manuel depuis l'historique des reçus, sans refaire de paiement.

Documentation : https://docs.stripe.com/receipts ; https://docs.stripe.com/api/invoice-payment/list

Publication : déploiement `dpl_AA66MkHk9Hp2NprDo1vaxb1cVzgW` préparé, vérifié puis promu. Contrôles HTTP : maintenance maintenue sur espace Pro et achats, administration/cron refusés sans authentification, webhook non signé refusé. Quinze tests Node ciblés, ESLint et build réussis ; huit scénarios navigateur isolés réussis. La confirmation visuelle depuis la session réelle du fondateur reste à faire après actualisation des factures.
