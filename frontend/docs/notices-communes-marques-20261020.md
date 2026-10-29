# Notices communes sur les cartes des marques — 20 octobre 2026

Le catalogue signale automatiquement les notices identiques associées à plusieurs références, y compris entre marques lorsqu’un PDF réellement identique est déjà publié sur leurs fiches. La détection utilise SHA-256 valide et taille positive, et uniquement les notices d’installation ou d’utilisation. Les vues éclatées et notices simplement similaires ne sont pas qualifiées de communes.

Les références associées sont reprises de chaque document publié (model_reference et model_aliases), et non de l’union des alias de toute la fiche : cela évite d’étendre à tort la couverture d’un PDF. Les documents n’ayant ni empreinte ni taille suffisante ne produisent aucun indicateur. Un même PDF combiné emploi/installation n’est compté qu’une fois pour une marque.

Affichage : nombre de notices communes sur la carte de la marque ; phrase explicative au-dessus des modèles : Certaines notices sont communes à plusieurs modèles. Choisissez votre modèle ou votre référence pour retrouver les documents qui lui sont associés.

Aucune modification des PDF, des associations en base ou de l’indexation Shiba. 19 tests ciblés réussis ; lint ciblé réussi. Le calcul s’applique aux futurs documents publiés sans saisie manuelle d’un indicateur.
