# Administration Entreprise en Preview

L'écran `/administration-interne` est réservé aux administrateurs internes CarnetPass. Les rôles des entreprises clientes ne donnent aucun accès à cet écran. Seul le fondateur peut autoriser ou retirer des collaborateurs internes ; les collaborateurs autorisés peuvent gérer l'accès Entreprise.

## Mise en service

1. Créer un deuxième projet Supabase pour Preview, car l'utilisation du projet existant par Production est inconnue. Ne pas modifier ce projet existant ni y copier des données clients. Sur le **nouveau projet vide uniquement**, exécuter `supabase/preview-bootstrap-schema.sql` dans l'éditeur SQL. Ce fichier réunit les 23 migrations du dépôt dans l'ordre et ne doit pas être relancé après une exécution réussie. Si les migrations jusqu'à `20260929_03` ont déjà été appliquées, exécuter seulement `supabase/migrations/20260929_04_company_members_service_read.sql`. En cas d'erreur, examiner le résultat avant tout nouvel essai : certaines migrations ne sont pas répétables.

Pour activer la validation des notices déjà déposées, exécuter ensuite `supabase/migrations/20260930_01_platform_document_publication.sql` **uniquement dans le projet Preview**. Dans l'administration, choisir la catégorie du catalogue, vérifier la référence exacte et le droit de diffuser le PDF à tous les comptes, puis cliquer sur « Valider et publier ». Le document apparaît au prochain chargement du catalogue pour les comptes professionnels autorisés. Le PDF reste dans le stockage privé et passe par une route authentifiée. Cette publication concerne le catalogue ; elle n'indexe pas le contenu dans Shiba Bot.

Après cette migration, exécuter `supabase/migrations/20260930_02_platform_document_hotline.sql` dans le même projet Preview pour renseigner la hotline et les autres références couvertes par un PDF publié. Exemple Airwell : hotline `01 76 21 82 94`, autre référence `AW-CBV009-N11` pour la vue éclatée qui couvre les variantes 007 et 009. Dans Shiba Bot, le mode « Recherche Web avec sources » permet une question sur les codes défaut ou les pièces absents des documents indexés. Le mode automatique conserve la recherche documentaire quand elle est disponible ; un PDF publié dans le catalogue n'est pas indexé automatiquement.

L'administration propose un champ Hotline au dépôt, à côté du titre du document. Dès le dépôt, le PDF est conservé dans « Documents déposés », replié par défaut, avec son statut et les actions de validation. Le PDF publié reste consultable dans le catalogue. Sur la page professionnelle, le client choisit « Documents du modèle » ou « Recherche Web avec sources » avant de poser sa question. Si aucun document n'est indexé pour Shiba, le mode documentaire indique que le Web doit être choisi ; la seule publication dans le catalogue ne constitue pas une indexation. Si une réponse documentaire n'est pas vérifiée, un bouton propose de relancer la question sur le Web avec son propre décompte de question.
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
