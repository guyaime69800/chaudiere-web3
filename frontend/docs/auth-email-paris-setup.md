# Courriels de sécurité CarnetPass — Supabase Paris Preview

Projet : `bqqzzbwqmiyxcotvqtoc`. Appliquer ces réglages dans ce projet uniquement. La production sera configurée séparément après validation.

## Livraison

Dans **Authentication → Emails**, activer le SMTP personnalisé avec le compte Resend dont le domaine `carnetpass.fr` est vérifié :

| Champ | Valeur |
| --- | --- |
| Sender email | `contact@carnetpass.fr` |
| Sender name | `CarnetPass` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Clé API Resend existante, saisie uniquement dans Supabase |

Ne pas coller la clé dans un ticket, un chat, Git ou une variable `VITE_…`. Le `RESEND_API_KEY` de Vercel ne configure pas le SMTP de Supabase Auth.

Dans **Authentication → Sign In / Providers → Email**, maintenir la confirmation d'adresse activée et activer **Secure email change**. Une demande de changement d'adresse doit alors être confirmée depuis l'ancienne et la nouvelle boîte.

## Templates

Dans **Authentication → Emails → Templates**, conserver `{{ .ConfirmationURL }}` tel quel dans le modèle **Change email address**.

**Change email address**

Sujet : `CarnetPass — confirmez votre changement d'adresse e-mail`

```html
<h2>Confirmez votre changement d'adresse e-mail</h2>
<p>Une demande de modification vers {{ .NewEmail }} a été faite pour votre compte CarnetPass.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer ce changement</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ne cliquez pas sur le lien et contactez contact@carnetpass.fr.</p>
```

Dans la section **Security notifications**, activer **Password changed** et **Email address changed**, puis enregistrer les modèles suivants.

**Password changed**

Sujet : `CarnetPass — votre mot de passe a été modifié`

```html
<h2>Votre mot de passe a été modifié</h2>
<p>Le mot de passe de votre compte CarnetPass vient de changer.</p>
<p>Si vous n'avez pas effectué cette modification, réinitialisez votre mot de passe sur https://test.carnetpass.fr/connexion et contactez immédiatement contact@carnetpass.fr.</p>
<p>Ce courriel ne contient jamais votre mot de passe.</p>
```

**Email address changed**

Sujet : `CarnetPass — votre adresse e-mail a été modifiée`

```html
<h2>Votre adresse e-mail a été modifiée</h2>
<p>L'adresse de votre compte CarnetPass est passée de {{ .OldEmail }} à {{ .Email }}.</p>
<p>Si vous n'avez pas effectué cette modification, contactez immédiatement contact@carnetpass.fr.</p>
```

## Vérification

1. Depuis `https://test.carnetpass.fr`, modifier le mot de passe d'un compte Preview de test ; vérifier que le mail **Password changed** arrive à son adresse.
2. Depuis ce compte, demander un changement vers une autre boîte que vous contrôlez ; vérifier les liens de confirmation dans les deux boîtes avant que l'adresse change.
3. Après confirmation, vérifier la notification **Email address changed** et la connexion avec la nouvelle adresse.
4. Si un mail n'arrive pas, examiner les journaux **Authentication → Logs** de Supabase et les journaux Resend, sans exposer les clés ni les liens de confirmation.
