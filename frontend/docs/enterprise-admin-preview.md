# Administration Entreprise en Preview

L'écran `/administration-interne` est réservé aux administrateurs internes CarnetPass. Les rôles des entreprises clientes ne donnent aucun accès à cet écran. Seul le fondateur peut autoriser ou retirer des collaborateurs internes ; les collaborateurs autorisés peuvent gérer l'accès Entreprise.

## Mise en service

1. Créer un **nouveau projet Supabase** réservé à CarnetPass Preview. Le projet `rpwzzvrueenstsjtbzto` est actuellement partagé et ne doit pas recevoir cette migration pour un essai.
2. Appliquer toutes les migrations du dépôt, dans l'ordre, à la base du nouveau projet. Cela crée les tables et les fonctions dont dépend l'application ; ne copier aucune donnée client réelle.
3. Configurer uniquement sur Vercel Preview `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY` avec les valeurs du **nouveau projet**. Si `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent aussi en Preview, elles doivent désigner ce même nouveau projet : certains endpoints les utilisent en priorité. Ne jamais placer une clé secrète dans une variable `VITE_`.
4. Redéployer la branche `feature/documentation-multi-docs`. Créer à nouveau le compte `contact@carnetpass.fr` dans la nouvelle base, puis confirmer son e-mail. Le compte créé dans l'ancienne base n'est pas transféré automatiquement.
5. Exécuter `supabase/bootstrap-preview-founder.sql` dans l'éditeur SQL du **nouveau projet uniquement** ; ce script refuse de s'exécuter si le compte n'est pas confirmé.
6. Ajouter `CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED=true` à l'environnement Vercel **Preview uniquement**, puis redéployer la branche. Se connecter avec `contact@carnetpass.fr` et ouvrir `/administration-interne`.

## Usage

Pour une entreprise vérifiée, contrôler d'abord le devis signé et la réception effective du virement hors Stripe. Saisir la date de fin contractuelle, une référence de règlement interne et éventuellement une note ; confirmer l'activation. La fonction met à jour l'abonnement `enterprise` et enregistre l'auteur, la date et la référence dans un journal. Elle refuse une entreprise non vérifiée ou ayant un abonnement Stripe de test actif. L'accès Entreprise cesse automatiquement à l'échéance dans le contrôle côté serveur, même si le statut est encore `active`.

Pour suspendre avant l'échéance, sélectionner l'entreprise et confirmer « Suspendre ». Une nouvelle activation requiert une nouvelle référence de règlement et une nouvelle échéance.

Les collaborateurs doivent déjà posséder un compte CarnetPass confirmé dans le projet Preview. Le fondateur peut accorder ou retirer leur rôle interne par e-mail. La clé Supabase administrateur reste exclusivement côté serveur.

## Limites actuelles

La recherche porte sur le nom de l'entreprise et affiche jusqu'à 30 résultats. Le journal montre les 30 derniers changements. L'application ne crée ni devis ni facture pour les paiements hors Stripe ; ces pièces restent dans la gestion comptable de CarnetPass. Ce module n'est pas activé en production.
