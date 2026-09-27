# Confirmation d'inscription CarnetPass avec Resend

Le modèle français prêt à copier dans Supabase Auth se trouve dans `frontend/supabase/templates/confirmation.html`. Sujet : **Confirmez votre adresse e-mail CarnetPass**. Il utilise la variable officielle `{{ .ConfirmationURL }}` ; aucun lien de confirmation n'est fabriqué côté navigateur.

Le projet Supabase est commun à Preview et Production : modifier sa configuration d'envoi change les prochains e-mails des deux environnements immédiatement. Le dépôt ne contient ni accès à l'interface Supabase ni clé d'administration Resend ; le modèle dans le dépôt ne s'active pas tout seul.

## Configuration à appliquer dans les tableaux de bord

1. Dans Resend, vérifier le domaine `carnetpass.fr` et ses enregistrements DNS SPF/DKIM/DMARC. Créer une clé d'envoi dédiée à Supabase Auth. Garder la clé dans Resend/Supabase, jamais dans Git ou dans le navigateur.
2. Dans Supabase **Authentication → SMTP Settings**, activer l'envoi SMTP personnalisé : hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = clé Resend, expéditeur `contact@carnetpass.fr`, nom `CarnetPass`.
3. Dans Supabase **Authentication → Email Templates → Confirm sign up**, remplacer le sujet et le HTML par le modèle de ce dépôt. Configurer aussi les autres modèles Auth avant leur usage public (réinitialisation de mot de passe, changement d'adresse et invitation).
4. Dans Supabase **Authentication → URL Configuration**, autoriser `https://test.carnetpass.fr/connexion` et `https://www.carnetpass.fr/connexion`. L'inscription transmet maintenant l'URL de retour correspondant au site depuis lequel elle est ouverte.
5. Créer un nouveau compte de test sur la Preview, vérifier le nom et l'adresse de l'expéditeur, la version française, l'arrivée du message et le retour vers `test.carnetpass.fr/connexion`. Tester aussi la réinitialisation de mot de passe après avoir personnalisé ce modèle.

Références : [SMTP personnalisé Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [modèles d'e-mail Supabase](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP Resend](https://resend.com/changelog/smtp-service).
