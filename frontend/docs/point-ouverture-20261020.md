# Point d’ouverture CarnetPass — 20 octobre 2026

Audit en lecture seule : aucune activation de paiement, restauration Supabase, modification de compte ou suppression de maintenance.

## Supabase

Le courriel fourni vise CarnetPass Admin Preview, référence `bqqzzbwqmiyxcotvqtoc`. Cette référence correspond aux configurations et à la documentation de préproduction du dépôt. Le courriel indique une pause pour inactivité et une restauration possible depuis le tableau de bord sous 90 jours.

La variable publique Vercel Production vérifiée par `vercel env run -e production` désigne `tsyukqcyfxcrjrhopvpv.supabase.co`, distinct du projet du courriel. Seul le nom d’hôte public a été affiché. Le serveur Auth de production répond HTTP 401 sans clé : cela confirme sa joignabilité, pas le fonctionnement des connexions ni de toutes les tables. Le contrôle Preview n’a obtenu aucune réponse HTTP ; aucun diagnostic réseau supplémentaire n’en est déduit. API administrative publique : HTTP 401 sans session.

Le script historique audit-environments échoue sur l’accueil public HTTP 503 : cette réponse est cohérente avec la maintenance actuelle, son exigence HTTP 200 empêche cet audit de conclure. La séparation de configuration a été vérifiée séparément.

À contrôler dans le tableau de bord Supabase : offre de production, sauvegardes et restauration, quotas, Security Advisor et Performance Advisor, SMTP Auth, redirections, limites d’inscription. Aucun accès authentifié au tableau de bord n’était disponible pour certifier ces réglages. Pas besoin de remettre Preview en service pour le seul fonctionnement de production ; le restaurer si les essais de préproduction doivent reprendre. Ne pas supprimer son contenu.

Source officielle : https://supabase.com/docs/guides/deployment/going-into-prod (pause possible sur Free après faible activité sur 7 jours ; Pro évite la pause pour inactivité). Le changelog markdown n’a pas pu être rendu par l’outil web ; aucune modification Supabase effectuée.

## Abonnements et Stripe : blocage confirmé dans le code

`server/billing.js` refuse l’exécution hors Preview et hors clé sk_test_. Les prix, retours Checkout, portail et synchronisation sont orientés test. Les droits sont synchronisés dans stripe_test_subscriptions. Aucun STRIPE_SECRET_KEY de production n’apparaît dans la liste des variables Production consultée. La validation actuelle du compte Stripe et ses habilitations bancaires n’ont pas été consultées.

La validation du compte Stripe seule ne suffit donc pas. Il reste à préparer le parcours live : prix Pro 28 €/mois, supplément 20 €/compte/mois, clé et secret webhook live, domaine de retour production, registre durable des paiements, synchronisation des droits réels et portail client. Vérifier les règles fiscales retenues et les factures réelles ; les anciennes instructions de test sur la TVA ne suffisent pas à établir la configuration commerciale finale.

## Comptes supplémentaires

Tarif et quotas implémentés : 20 €/mois, 150 questions Shiba/mois et 15 consultations de notices/jour par compte. Les places doivent être payées et valides dans le bon environnement ; les assignations ne suffisent pas. `additional-account-billing.js` rejette actuellement les prix live ; la synchronisation inscrit billing_environment=preview. Adapter le raccordement live sans neutraliser ces contrôles.

Recette nécessaire : paiement et impayé, ajout et retrait de places avec prorata annoncé, confirmation de facture, attribution et retrait d’un collaborateur, quotas individuels, interdiction d’accès à une autre entreprise, annulation et fin de période, doublons et retard de webhook.

## Autres conditions d’ouverture à établir

- Vérifier identité légale, immatriculation, adresse complète, contact et mentions de facturation actuels. Les anciennes notes ne prouvent pas leur complétude aujourd’hui.
- Accord de traitement : projet séparé existant, aucune signature supposée. Finaliser les engagements fournisseurs, conservation, sauvegardes et restitution. Export et effacement autonomes documentés ; ne pas confondre ces fonctions avec une procédure de sauvegarde validée.
- Confirmer les droits de diffusion des PDF publiés et les conditions d’usage pour Shiba, sans déduire ces droits de l’accès EasySAV.
- Vérifier les courriels réels de confirmation, récupération et facturation, ainsi que les alertes d’erreur et de paiement.
- Retrouver ou effectuer une recette de charge représentative en préproduction : aucun résultat récent de charge n’a été établi pendant cet audit.
- Recette finale avec visiteur, client, collaborateur, équipe interne et fondateur ; maintien de l’isolation des entreprises et de la protection de la maintenance.
- Retirer la maintenance uniquement après validation du parcours et décision explicite d’ouverture.

## Contrôles réalisés

Sept tests Node réussis sur billing, factures, droits et facturation de comptes supplémentaires. Ils portent sur des scénarios simulés et ne prouvent pas la réussite d’un paiement réel. Compilation et contrôles d’accès du dernier déploiement documentés séparément. Aucun achat réel ni nouvelle donnée client créé pendant cet audit.

Ordre recommandé : restaurer Preview pour les essais ; vérifier le compte Stripe ; développer le raccordement live et sa synchronisation ; recette complète ; boucler les éléments contractuels et opérationnels ; décision d’ouverture.
