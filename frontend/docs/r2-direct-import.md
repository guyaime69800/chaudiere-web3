# Import direct des documents techniques en production

Le formulaire administratif utilise `r2-init`, un PUT du navigateur vers une
adresse R2 signée, puis `r2-complete`. Les requêtes vers Vercel contiennent
uniquement les métadonnées. Aucun nouveau Blob n'est créé pour cet import.
La signature PUT lie le type PDF et la taille (30 Mo maximum), expire après
10 minutes et cible un objet temporaire aléatoire, jamais un PDF permanent.

Le serveur vérifie la session administrative AAL2 et l'environnement à chaque
étape. Le ticket Redis appartient à cet utilisateur et expire après une heure.
La finalisation vérifie les octets, la taille et le SHA-256, puis copie le PDF
à l'intérieur de R2 avec la condition CopySourceIfMatch. Une lecture HEAD
vérifie la copie permanente. Les notices identiques partagent un objet R2;
les fiches et leurs références restent distinctes. La finalisation est
verrouillée et réutilisable avec le même ticket sans recréer la fiche.

La colonne historique `blob_pathname` accepte une référence de stockage opaque
`r2://platform-documents/sha256/<sha>.pdf#<uuid>`. Ce n'est pas un chemin Blob.
La table existante n'impose aucune contrainte de préfixe : aucun changement SQL
n'est requis. Le PDF reste en attente de validation, puis Shiba charge les
octets vérifiés depuis R2. Les lectures privées passent par le contrôle d'accès
existant avant une URL R2 signée. Aucun repli Blob n'existe pour un PDF natif R2.

Les anciens PDF Blob sont conservés. Leurs copies R2 servent les lectures et
l'indexation lorsqu'elles sont disponibles. Les dépôts Blob depuis une page
Production périmée sont refusés avec une demande d'actualisation. Les callbacks
des envois Blob déjà commencés restent acceptés s'ils sont signés.

Configuration : politique CORS avec GET, HEAD, PUT, Content-Type et Range pour
https://carnetpass.fr et https://www.carnetpass.fr. Compartiment privé, aucune
activation r2.dev. Clés d'envoi dédiées facultatives R2_UPLOAD_ACCESS_KEY_ID et
R2_UPLOAD_SECRET_ACCESS_KEY; sinon les deux R2_MIGRATION_* existantes servent
l'écriture. Le jeton de migration configuré le 11 octobre était limité à une
semaine : prévoir son remplacement pour le fonctionnement durable.

Les objets temporaires sont supprimés après la confirmation de l'enregistrement.
Un dépôt abandonné ou un échec peut laisser un objet sous platform-documents/incoming/.
Une règle de cycle de vie limitée à ce préfixe peut les purger après un jour.
Les objets permanents communs ne sont pas supprimés par le retrait d'une fiche.

Vercel assure encore l'authentification, la vérification et l'indexation : le
passage direct supprime le nouveau stockage Blob, pas tous les coûts de calcul.
Les pièces jointes personnelles des clients ne sont pas modifiées par ce changement.

Après le premier PDF natif R2, ne pas revenir à une version qui ignore ces
références. En cas de problème, conserver les lecteurs R2 et corriger ou bloquer
l'initialisation des nouveaux dépôts; préserver toutes les fiches et tous les PDF.
