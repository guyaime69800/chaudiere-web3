# Alertes administratives Polygon et Shiba

Rubrique en haut de l'administration, visible et lisible uniquement par le fondateur avec rôle courant et MFA. GET `/api/platform-admin?scope=service-health` réutilise les vérifications serveur ; aucun nouveau point d'entrée public. Actualisation toutes les cinq minutes pendant l'ouverture de la page et bouton manuel.

Polygon : réutilisation du contrôle réseau 137, contrat, autorisation du portefeuille et solde POL. Avertissement <= 0,30 POL, critique <= 0,10 POL ; indisponibilité distinguée d'un solde nul. Aucun transfert signé ni achat. Lecture de production du 21 octobre : environ 19,9571 POL, état healthy. Aucune adresse privée, clé ou URL RPC renvoyée.

Shiba documentaire et Web : enregistrement Redis du dernier succès ou refus OpenAI (crédits/plafond, clé/permissions, débit de requêtes, service indisponible). Seulement état fixe et date, TTL sept jours ; aucun prompt, erreur brute ou secret. La surveillance ne doit jamais interrompre Shiba. Une réussite ultérieure remplace l'état précédent ; sa date reste affichée. Les autres parcours IA ne sont pas couverts par ces deux points de capture.

Le solde prépayé OpenAI n'est pas fourni par ce suivi. Une limite de débit n'est pas présentée comme un manque de crédits. Le lien de facturation permet la consultation et la configuration manuelle des recharges. Aucun appel IA payant de contrôle, aucun achat automatique, aucun nouveau mail envoyé par cette fonctionnalité. Le contrôle et les alertes email Polygon existants ne sont pas modifiés.

Vérifications : 9 tests ciblés (seuils, erreurs, assainissement, permissions existantes) et ESLint réussis. Audit distant en lecture seule du vrai solde Polygon et de Redis réussi ; build Vercel réussi. Affichage depuis la session réelle à confirmer par le fondateur.

Référence : https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing (crédits épuisés, recharges et limites de débit distinctes).
