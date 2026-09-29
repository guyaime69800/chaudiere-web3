# Administration Entreprise en Preview

L'écran `/administration-interne` est réservé aux administrateurs internes CarnetPass. Les rôles des entreprises clientes ne donnent aucun accès à cet écran. Seul le fondateur peut autoriser ou retirer des collaborateurs internes ; les collaborateurs autorisés peuvent gérer l'accès Entreprise.

## Mise en service

1. Créer un deuxième projet Supabase pour Preview, car l'utilisation du projet existant par Production est inconnue. Ne pas modifier ce projet existant ni y copier des données clients. Sur le **nouveau projet vide uniquement**, exécuter `supabase/preview-bootstrap-schema.sql` dans l'éditeur SQL. Ce fichier réunit les 22 migrations du dépôt dans l'ordre et ne doit pas être relancé après une exécution réussie. Si les migrations jusqu'à `20260929_02` ont déjà été appliquées, exécuter seulement `supabase/migrations/20260929_03_platform_document_intake.sql`. En cas d'erreur, examiner le résultat avant tout nouvel essai : certaines migrations ne sont pas répétables.
2. Sur le nouveau projet, créer et confirmer à nouveau le compte `contact@carnetpass.fr`. Exécuter `supabase/bootstrap-preview-founder.sql` dans son éditeur SQL ; ce script refuse de s'exécuter si le compte n'est pas confirmé.
3. Configurer uniquement sur Vercel Preview `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY` avec les valeurs du nouveau projet. Si `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent aussi en Preview, elles doivent désigner le même projet : certains endpoints les utilisent en priorité. Ne jamais placer une clé secrète dans une variable `VITE_`.
4. Redéployer la branche `feature/documentation-multi-docs` après avoir configuré les trois variables. Le serveur exige que l'URL Supabase soit exactement celle du projet CarnetPass Admin Preview à Paris. Se connecter avec `contact@carnetpass.fr` et ouvrir `/administration-interne`.
5. Pour le dépôt de documents, vérifier que les variables Vercel Blob privées et `BLOB_WEBHOOK_PUBLIC_KEY` sont présentes dans la même Preview. Un PDF déposé est conservé en privé, avec son fabricant et sa référence exacte, et reste en attente de validation. Il n'entre dans le catalogue ni dans l'assistant avant le travail d'indexation existant.

## Usage

Pour une entreprise vérifiée, contrôler d'abord le devis signé et la réception effective du virement hors Stripe. Saisir la date de fin contractuelle, une référence de règlement interne, le nombre de comptes prévu au contrat (responsable compris) et éventuellement une note ; confirmer l'activation. La fonction met à jour l'abonnement `enterprise` et enregistre l'auteur, la date et la référence dans un journal. Elle refuse une entreprise non vérifiée ou ayant un abonnement Stripe de test actif. L'accès Entreprise cesse automatiquement à l'échéance dans le contrôle côté serveur, même si le statut est encore `active`.

Le responsable peut ensuite faire créer et confirmer un compte à chaque technicien. Un administrateur interne CarnetPass peut rattacher ou retirer ce technicien par e-mail. Un compte déjà rattaché à une autre entreprise est refusé. La limite de comptes, responsable compris, est contrôlée en base et peut être ajustée par l'administrateur selon le contrat. Ces actions sont enregistrées dans le journal.

Pour suspendre avant l'échéance, sélectionner l'entreprise et confirmer « Suspendre ». Une nouvelle activation requiert une nouvelle référence de règlement et une nouvelle échéance.

Les collaborateurs doivent déjà posséder un compte CarnetPass confirmé dans le projet Preview. Le fondateur peut accorder ou retirer leur rôle interne par e-mail. La clé Supabase administrateur reste exclusivement côté serveur.

## Limites actuelles

La recherche porte sur le nom de l'entreprise et affiche jusqu'à 30 résultats. Le journal montre les 30 derniers changements. L'application ne crée ni devis ni facture pour les paiements hors Stripe ; ces pièces restent dans la gestion comptable de CarnetPass. Ce module n'est pas activé en production.
