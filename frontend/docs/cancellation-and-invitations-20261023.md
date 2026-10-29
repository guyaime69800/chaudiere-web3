# Résiliation programmée et invitations — 23 octobre 2026

## Constat

Le fondateur a activé les reçus de paiements et remboursements, les mails d'échec de carte et les alertes d'expiration. Il a confirmé la publication d'une automatisation Stripe « abonnement annulé », sans questionnaire. Les captures montrent Smart Retries jusqu'à huit tentatives sur deux semaines, abonnement laissé en retard au premier échec puis annulé après épuisement, facture conservée impayée. Ne pas affirmer que la réception de tous ces mails a été testée.

Le déclencheur Stripe d'annulation effective ne fournit pas la preuve d'un mail dès la programmation d'une résiliation. Une confirmation CarnetPass distincte couvre cette demande.

## Confirmation dès la programmation

Migration `20261023162216_scheduled_cancellation_notifications.sql` : trigger transactionnel sur modification de `subscriptions.stripe_cancel_at`, uniquement abonnement LIVE actif avec date future. Pas de message rétroactif pour les anciennes résiliations. File avec RLS, aucun accès anon/authenticated, lecture/écriture réservées au service. Pas d'adresse email, contenu client ou token Stripe dans la file.

Le worker relit le client et l'abonnement via Stripe, vérifie leur rattachement et la date ; une reprise d'abonnement, une date modifiée ou une annulation effective rendent le message obsolète. Message texte sans enquête : demande enregistrée, date de fin en heure de Paris, conservation de la période payée, arrêt du renouvellement ; distinction des éventuelles factures déjà dues.

Envoi via Resend et expéditeur transactionnel déjà utilisé par CarnetPass. Clé d'idempotence par notification, réservation concurrente cinq minutes, reprise sur le cron Stripe existant toutes les cinq minutes. Les échecs d'envoi ne bloquent pas la synchronisation des droits ; huit essais au maximum et revue au-delà de 23 heures pour ne pas dépasser la fenêtre d'idempotence du fournisseur. « Envoyé » signifie accepté par le fournisseur, pas preuve de réception en boîte.

L'automatisation Stripe reste responsable du mail d'annulation effective. Aucun email envoyé à un client par les vérifications locales ou l'audit de build. Aucun nouveau paiement.

## Invitations

Correction du retour après connexion : conserver uniquement le chemin local exact `/parametres-compte`, un token hexadécimal de 64 caractères et l'ancre comptes. L'inscription inclut cette destination dans le lien de confirmation. Aucun retour externe fourni par le navigateur n'est accepté.

Contrôles SQL réexécutés : rôle du responsable, capacité payée, email confirmé du destinataire, refus d'autre adresse et de rejeu, plafond de places, isolement entre entreprises, expiration des droits, retrait de l'accès sans supprimer la place facturée. Tests serveur : quotas indépendants, calcul tarifaire, refus de paiement incomplet et réduction programmée.

Navigateur avec toutes les requêtes externes simulées : ajout et réduction de places, retour au lien d'invitation après connexion. Ne constitue pas un test réel d'un collaborateur en production. Achats de places LIVE restent désactivés ; maintenance maintenue. Une validation de réception de mail et du parcours réel des collaborateurs reste nécessaire avant ouverture.

## Vérifications

Tests Node ciblés, tests de réservation/reprise/suppression de mail obsolète, PGlite sur le trigger et droits SQL, build et ESLint réussis. Migration appliquée à Paris 2 et enregistrée via le CLI. Audit de build opt-in vérifie présence de la configuration email et accès à la file sans envoyer de message.

Sources : https://docs.stripe.com/billing/automations ; https://docs.stripe.com/billing/automation-recipes

Déploiement `dpl_34mJZ9qpxo5yUs4zKLwSLniiXGXj`, https://carnetpass-k8gxgege5-chaudiere-web3.vercel.app, vérifié puis promu. Audit : configuration email présente, file accessible et vide, zéro mail envoyé. Neuf scénarios navigateur simulés réussis (dont connexion depuis invitation). Contrôles HTTP : maintenance maintenue, admin/cron protégés, webhook non signé refusé.
