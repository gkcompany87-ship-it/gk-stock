# Guide utilisateur - AS TINO Stock

## Connexion et rôles

L'administrateur crée les comptes. Il n'y a pas d'inscription publique. Connectez-vous avec votre adresse e-mail et votre mot de passe. En cas d'oubli, utilisez « Mot de passe oublié ? » ; l'e-mail dépend du serveur SMTP configuré. En démonstration, consultez Mailpit. Ne partagez pas un compte : chaque mouvement conserve son utilisateur.

Le magasinier accède à son tableau de bord, aux produits actifs, au scanner et à ses opérations. Il ne voit pas les prix, les factures, les paiements, les autres utilisateurs ni la configuration. L'administrateur dispose de la gestion complète. Une modification des droits peut nécessiter une nouvelle connexion.

## Produits et stock initial

Dans « Produits », créez une référence avec un SKU unique, un éventuel code-barres/QR, l'unité, la catégorie, les prix HT, la TVA, le seuil minimum et l'emplacement. Une nouvelle référence a un stock nul. Dans « Mouvements », enregistrez son stock initial ou une entrée dans le dépôt concerné. Ne modifiez jamais la quantité par un export Excel ou directement en base de données.

Les catégories et dépôts se gèrent depuis le catalogue. Un produit archivé reste dans l'historique mais n'est plus disponible pour de nouveaux retraits. Le système conserve les prix des documents déjà émis même si le tarif du produit change.

## Scanner et retirer des produits

Ouvrez « Scanner », autorisez la caméra, puis présentez le code. Vous pouvez aussi saisir le SKU/code à la main ou utiliser une douchette clavier. Vérifiez la référence, le dépôt, le stock et l'emplacement. Saisissez une quantité positive et confirmez. La réussite affiche la quantité restante et la référence du mouvement.

Le stock affiché est indicatif jusqu'à confirmation : une autre personne peut avoir retiré un article entre-temps. Le serveur vérifie et verrouille la quantité au moment de l'opération. En cas de stock insuffisant, actualisez et vérifiez la quantité. En cas de doute après une interruption réseau, réessayez la même opération depuis le même écran ; sa clé de reprise évite un doublon. Après un rechargement complet, consultez d'abord votre historique avant de saisir une nouvelle opération.

Une connexion est obligatoire. Aucun retrait n'est enregistré en attente hors ligne. La caméra nécessite localhost ou HTTPS ; un simple accès HTTP par adresse IP sur le réseau local peut ne pas être autorisé par le navigateur.

## Erreurs, retours et ajustements

Le magasinier peut signaler une erreur depuis ses mouvements ; il ne peut ni supprimer ni modifier le mouvement. L'administrateur examine le signalement, ajoute une résolution et, si nécessaire, crée une inversion ou une nouvelle opération justifiée. Les deux écritures restent visibles. Un mouvement lié à une livraison se corrige via l'annulation du bon pour conserver la cohérence de toutes ses lignes.

La valeur « stock négatif autorisé » est désactivée par défaut. Ne l'activez que sur décision explicite de gestion. La désactivation est refusée tant que des soldes négatifs subsistent. Les retours, produits endommagés et ajustements restent des opérations administratives tracées.

## Clients et devis

Créez le client avec ses coordonnées, son matricule fiscal et ses adresses. Le bouton « Historique » rassemble devis, factures, livraisons et paiements.

Dans « Devis », choisissez le client et ajoutez une ou plusieurs lignes. Les descriptions libres sont possibles pour des prestations sans stock. Vérifiez quantités, prix HT, remises, TVA et validité. Le brouillon est modifiable. « Émettre le devis » lui attribue son numéro officiel et fige son contenu. « Envoyer par e-mail » est une action séparée : elle place le PDF dans la file d'envoi SMTP. Le statut d'émission ne prouve pas que le destinataire l'a reçu.

Enregistrez l'accord ou le refus du client. Un devis accepté peut être converti en facture ou en bon de livraison complet. L'application ne gère pas les conversions partielles. Une deuxième conversion du même type retrouve le document déjà créé ; elle ne génère pas une nouvelle copie. « Dupliquer » crée un autre brouillon de devis.

## Factures et paiements

Une facture peut être créée directement, depuis un devis accepté ou depuis un bon confirmé. Vérifiez tous les champs avant émission : une facture émise ne se modifie pas silencieusement. Pour corriger une erreur, utilisez le workflow d'annulation autorisé puis une nouvelle facture, avec validation comptable du traitement fiscal approprié.

« Enregistrer un paiement » accepte un ou plusieurs règlements avec montant, date, mode et référence. Le solde et le statut sont recalculés transactionnellement ; le total des paiements actifs ne peut dépasser le montant de la facture. Un paiement erroné s'annule avec un motif et reste dans l'historique. Annulez les paiements avant d'annuler une facture réglée.

L'état « En retard » dépend de l'échéance et du solde. Le PDF original conserve les informations et paiements connus à l'émission ; le solde actuel doit être consulté dans l'application. Ne présentez pas un ancien PDF comme une quittance actualisée.

## Bons de livraison

Créez le bon, choisissez le dépôt et les quantités. Un brouillon ne touche pas au stock. « Confirmer la livraison » déduit toutes les quantités dans une seule opération ; si une ligne manque de stock, rien n'est déduit. « Marquer comme livré » ne déduit pas une deuxième fois.

L'annulation d'un bon confirmé inverse les retraits sans supprimer les originaux. Si une facture liée existe, suivez l'ordre de correction indiqué par l'application ; ne forcez pas la suppression d'un lien. Les réservations de stock et livraisons partielles ne sont pas incluses.

## Rapports, documents et administration

Les tableaux de bord et exports utilisent la base de données réelle. Les filtres s'appliquent aux indicateurs concernés : les montants de période sont distincts du stock actuel et des impayés globaux. Consultez le périmètre indiqué dans l'écran/API avant d'utiliser un export comme rapport comptable. Les CSV sont destinés à l'administrateur et protègent les cellules contre l'interprétation comme formules.

Dans « Paramètres », vérifiez les informations légales, le logo, les taux, préfixes et conditions. Un changement de préfixe n'altère pas la séquence déjà commencée pour l'année. Les modifications ne réécrivent pas les documents émis. Les PDF sont au format A4 avec pied de page AS TINO DEV.

Désactivez immédiatement les comptes inutilisés. Le journal d'audit permet de retrouver auteur, date, entité et motif des actions sensibles ; il n'a pas de bouton de modification/suppression. Pour tout incident, communiquez l'identifiant de requête affiché, jamais un mot de passe ou un jeton.

## Avant une utilisation réelle

Le client doit faire valider les mentions, taux, arrondis, numérotation, annulations et éventuels avoirs par son comptable tunisien. Le logiciel fourni n'est pas certifié conforme et cette version doit encore passer les contrôles techniques détaillés dans le rapport QA.
