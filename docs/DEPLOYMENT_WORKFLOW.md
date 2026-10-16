# Publication de CarnetPass

## Environnements

| Environnement | Domaine | Source attendue |
| --- | --- | --- |
| Preview | `test.carnetpass.fr` | `feature/documentation-multi-docs` |
| Production | `www.carnetpass.fr` (`carnetpass.fr` redirige ici) | `main` |

Le projet Vercel `chaudiere-web3` utilise `frontend` comme dossier racine. Sa branche Production configurée est `main` et le domaine de test est associé à `feature/documentation-multi-docs`.

## Circuit de publication

1. Travailler sur la branche de travail et conserver les fichiers locaux sans rapport hors du commit.
2. Vérifier `npm run build`, les tests utiles et les parcours ordinateur/mobile.
3. Pousser la branche de travail. Vercel crée automatiquement une Preview Git sur `test.carnetpass.fr`.
4. Vérifier la Preview, y compris la connexion, les fonctions et les variables d'environnement nécessaires.
5. Après validation explicite de la mise en Production, fusionner la branche de travail vers `main` et pousser `main`. Vercel construit alors une Production Git.
6. Vérifier que `www.carnetpass.fr` sert le SHA de `main` et que la page charge sans erreur.

Ne pas utiliser `vercel promote <preview>`, `vercel deploy --prod` ou le bouton de promotion Vercel pour une publication ordinaire : ces chemins peuvent publier du code de la branche de travail, voire un dossier local modifié, alors que la branche Production reste `main`.

## Contrôles avant fusion

- `git status --short` : comprendre tout fichier modifié ou non suivi.
- `git log -1 --format="%H %s"` : noter le SHA de la branche candidate.
- `npm run build` dans `frontend` : échoue désormais si les variables publiques Supabase manquent.
- Inspecter `test.carnetpass.fr` sur ordinateur et mobile ; tester le parcours concerné.
- Vérifier que les variables nécessaires sont présentes dans l'environnement **Production** de Vercel avant la fusion. Les variables Preview ne sont pas automatiquement copiées en Production.

La branche Git configurée ne bloque pas un déploiement CLI manuel en Production. Le respect de ce circuit et les permissions Vercel restent nécessaires ; une protection de branche GitHub peut compléter cette règle.
