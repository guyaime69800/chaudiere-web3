# Administration Entreprise en Preview

L'écran `/administration-interne` est réservé aux administrateurs internes CarnetPass. Les rôles des entreprises clientes ne donnent aucun accès à cet écran. Seul le fondateur peut autoriser ou retirer des collaborateurs internes ; les collaborateurs autorisés peuvent gérer l'accès Entreprise.

## Mise en service

1. Vérifier que `test.carnetpass.fr` utilise un projet Supabase **distinct** de la production. Ne pas appliquer la migration ni activer le module si la base est partagée.
2. Créer et confirmer le compte CarnetPass `contact@carnetpass.fr` dans le projet Supabase Preview.
3. Appliquer `supabase/migrations/20260929_01_platform_enterprise_admin.sql` **uniquement** au projet Supabase Preview. La migration échoue si le compte fondateur confirmé n'existe pas.
4. Ajouter `CARNETPASS_PREVIEW_ENTERPRISE_ADMIN_ENABLED=true` à l'environnement Vercel **Preview uniquement**, puis redéployer la branche `feature/documentation-multi-docs`.
5. Se connecter avec `contact@carnetpass.fr`, puis ouvrir Paramètres du compte → Administration interne CarnetPass.

## Usage

Pour une entreprise vérifiée, contrôler d'abord le devis signé et la réception effective du virement hors Stripe. Saisir la date de fin contractuelle, une référence de règlement interne et éventuellement une note ; confirmer l'activation. La fonction met à jour l'abonnement `enterprise` et enregistre l'auteur, la date et la référence dans un journal. Elle refuse une entreprise non vérifiée ou ayant un abonnement Stripe de test actif. L'accès Entreprise cesse automatiquement à l'échéance dans le contrôle côté serveur, même si le statut est encore `active`.

Pour suspendre avant l'échéance, sélectionner l'entreprise et confirmer « Suspendre ». Une nouvelle activation requiert une nouvelle référence de règlement et une nouvelle échéance.

Les collaborateurs doivent déjà posséder un compte CarnetPass confirmé dans le projet Preview. Le fondateur peut accorder ou retirer leur rôle interne par e-mail. La clé Supabase administrateur reste exclusivement côté serveur.

## Limites actuelles

La recherche porte sur le nom de l'entreprise et affiche jusqu'à 30 résultats. Le journal montre les 30 derniers changements. L'application ne crée ni devis ni facture pour les paiements hors Stripe ; ces pièces restent dans la gestion comptable de CarnetPass. Ce module n'est pas activé en production.
