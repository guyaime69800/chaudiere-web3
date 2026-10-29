# Activation contrôlée — 21 octobre 2026

Mise à jour du 23 octobre : l'entreprise du fondateur a été vérifiée puis convertie en compte réel sans abonnement actif. Voir `founder-live-conversion-20261023.md`. Les mentions de l'ancienne entreprise de démonstration ci-dessous décrivent l'état du 21 octobre.

État courant après confirmation de l'accès au catalogue par l'utilisateur :

- `CARNETPASS_LIVE_BILLING_ENABLED=true` (Pro et recharges)
- `CARNETPASS_STRIPE_LIVE_PORTAL_ENABLED=true`
- `CARNETPASS_LIVE_SEATS_ENABLED=false`
- Réception et traitement webhook restent activés.
- Maintenance maintenue ; accès public aux achats et à l'espace professionnel refusé.

Variables Production mises à jour et déploiement `dpl_DCcksZRqbNuDVqpa3pEsVBAj4czg`, https://carnetpass-96jr4brea-chaudiere-web3.vercel.app, vérifié puis promu. Audit de build explicitement activé `CARNETPASS_CONTROLLED_BILLING_AUDIT=1` : prédicats serveur achats/portail vrais, places désactivées, maintenance active, compte et quatre prix Stripe vérifiés en lecture seule, configuration du portail conforme. Les liens juridiques hérités non exposés par l'API ont déjà été confirmés par l'utilisateur dans le Dashboard.

Contrôle HTTP anonyme : espace Pro et APIs achats/recharges/places/catalogue 503 maintenance, administration et cron 401, webhook non signé 400. Aucun Checkout, client, paiement, abonnement ni crédit créé par cette activation. Les ventes publiques ne sont pas ouvertes.

Le compte fondateur est encore lié à l'ancienne entreprise de démonstration (abonnement Entreprise résilié, vérification absente). L'accès administratif au catalogue ne lui confère pas de droit de souscription réelle. Ne pas transformer le compte TEST en client live ni réactiver l'ancien abonnement pour contourner la validation d'entreprise. Un parcours de paiement réel exige une véritable entreprise validée ; aucun débit réel autorisé ou effectué dans cette étape.

Prochaine vérification : interface depuis la session du fondateur, puis choix d'un véritable compte professionnel admissible avant un éventuel paiement réel. Le script `verify-controlled-billing-deployment.mjs` contrôle l'isolement public sans opération financière. L'ancien script `verify-stripe-closed-deployment.mjs` ne prouve plus que les interrupteurs sont fermés lorsque la maintenance masque les routes.
