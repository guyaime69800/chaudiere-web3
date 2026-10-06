# Mode maintenance CarnetPass

Le bouton est sur `/administration-maintenance`. Seul un compte confirmé ayant le rôle
`founder` dans `public.platform_admins` peut lire ou modifier l'état. Le site et les API
Vercel affichent une réponse 503 pendant la maintenance. Les fichiers nécessaires à
l'interface, la connexion du fondateur, le contrôle de maintenance et la tâche des
rappels restent disponibles. Le contrôle ne bloque pas les requêtes directes à
Supabase et ne remplace pas une migration compatible avec les anciennes versions.

## Mise en service

1. Vérifier le compte fondateur dans Supabase Production, Authentication > Users.
2. Exécuter `supabase-production/bootstrap-maintenance-founder.sql` dans l'éditeur SQL
   de Production. Ne pas exécuter ce script si l'adresse e-mail attendue n'est pas celle
   du fondateur.
3. Déployer ce code en Production. Le mode est désactivé par défaut.
4. Ouvrir `/administration-maintenance`, vérifier « Site ouvert », activer pour un
   contrôle court, ouvrir `/` et `/api/billing` dans une autre session, puis rouvrir.
5. Pour un déploiement nécessitant une interruption, activer la maintenance juste avant
   l'opération, utiliser « Activer mon accès de vérification » pour contrôler le site
   en Production depuis le navigateur fondateur, vérifier en fenêtre privée que les
   visiteurs voient toujours la maintenance, puis rouvrir après vérification. Cet accès
   expire après une heure et peut être retiré depuis le même écran. Les déploiements Vercel ordinaires sont
   atomiques et ne nécessitent généralement pas d'interruption.

L'état est stocké dans Upstash Redis à la clé `carnetpass:production:maintenance:v1`.
Il n'est lu que par les déploiements Production. En cas d'indisponibilité de Redis,
le middleware laisse passer le trafic pour éviter un blocage permanent. La session
d'administration Supabase doit rester valide. Un fondateur peut aussi désactiver le
mode via le même écran pendant la maintenance.
