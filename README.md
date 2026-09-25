# Trouve

Application française responsive pour trouver les disponibilités communes d’un groupe. Vite + JavaScript natif + Supabase Auth, PostgreSQL/RLS et Realtime. Le prototype initial a été remplacé par des données persistantes et des parcours fonctionnels.

## Démarrer

Node 24 recommandé.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`.env.example` cible le projet Supabase Trouve avec une **clé publishable**, conçue pour être publique. Les autorisations reposent sur les politiques RLS. Ne jamais placer de clé service-role dans le navigateur.

`npm run build` génère `dist/`. Servir ce dossier avec un hébergeur statique HTTPS. Aucun hébergement n’est imposé par le dépôt. Dans Supabase → Authentication → URL Configuration, définir le Site URL et autoriser l’URL de l’application et l’URL locale pour les confirmations et réinitialisations. Configurer un SMTP de production pour la délivrabilité des e-mails. L’application inclut inscription, connexion, confirmation par e-mail, récupération de mot de passe et déconnexion.

## Base et règles

Le projet `viebhlyqkbucimujtijv` a reçu les migrations de `supabase/migrations/`. Les noms locaux sont alignés sur les versions retournées par Supabase. `supabase/schema.sql` est le schéma complet pour **une base vide**, pas un script à réexécuter sur une base existante. Appliquer seulement les nouvelles migrations sur une base déjà initialisée.

- Profil créé automatiquement à l’inscription ; prénom/pseudo modifiable, non unique.
- Groupes : propriétaire immuable, ajout automatique comme membre, renommage, suppression, départ et retrait de membres. Le propriétaire supprime son groupe au lieu de le quitter.
- Invitations : propriétaire uniquement, jeton UUID aléatoire, usage unique, expiration à sept jours, révocation. Consommation atomique avec verrouillage pour empêcher une double utilisation concurrente. Liens copiables, saisie manuelle et conservation du jeton pendant la connexion.
- Agenda hebdomadaire : lundi=0, dimanche=6 ; heures civiles **Europe/Paris**, récurrence bornée par deux dates inclusives ; pas de cours traversant minuit. Ajouter, modifier et supprimer ses cours ; lire ceux de ses pairs uniquement.
- Disponibilités : complément de l’union des intervalles occupés de tous les membres, à la minute près, de 8 h à 18 h, durée minimale 30 min. Un agenda vide est explicitement considéré libre ; l’application rappelle que chacun doit remplir son agenda.
- Absences : une occurrence datée et un groupe précis. Le signalement apporte une première voix positive ; deux votes positifs distincts et une majorité stricte confirment. Deux votes négatifs et une majorité ou égalité rejettent ; sinon attente. Chaque membre peut modifier son vote, mais pas le dupliquer. Les membres attestent collectivement l’absence : il ne s’agit pas d’une validation officielle de l’établissement.
- Changer un horaire, la période, le jour ou le professeur invalide les signalements du cours. Le départ d’un membre retire ses votes et les signalements de ses cours dans ce groupe, puis recalcule les statuts.
- Seule une absence confirmée libère le cours concerné, pour cette date et ce groupe. Les cours copiés dans d’autres agendas ne sont pas automatiquement annulés.
- Realtime recharge les données autorisées après une modification. Reconnexion et retour au premier plan rechargent également ; rafraîchissement de secours toutes les 30 s pour les suppressions ou révocations non livrées par RLS.
- Chargement paginé par 1 000 lignes, plafond explicite à 10 000 par table ; pas de résultat présenté comme complet si ce plafond est atteint.

## Sécurité

RLS sur les sept tables publiques. Les profils et agendas ne sont visibles qu’à soi et aux membres des groupes communs. Les fonctions privilégiées sont dans le schéma `private` non exposé, avec `search_path` fixé et autorisations explicites. Les RPC publiques sont `SECURITY INVOKER`. Aucune mutation directe des confirmations/statuts ni insertion directe de membres n’est accordée. Les privilèges par colonne empêchent de changer les propriétaires ou d’inventer les valeurs d’une invitation. Les chaînes affichées sont échappées ; aucune clé secrète côté client. Le schéma `private` ne doit pas être ajouté aux schémas exposés de la Data API.

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

- `tests/availability.test.js` : chevauchements, minutes, récurrence inclusive, dimanche, changement d’heure, absences datées et groupes isolés.
- `tests/rls.sql` : exécuter avec le SQL Editor Supabase ou `psql` en administrateur. Les comptes et toutes les mutations sont annulés par `ROLLBACK`. Vérifie les rôles réels `authenticated`, l’isolation, les invitations, les droits d’écriture et les votes.
- `tests/browser/app.spec.js` : écran d’authentification mobile et parcours réel à deux comptes. Ce dernier est ignoré sans `.env.e2e`. Sur un projet de test, créer deux utilisateurs e-mail confirmés, avec le même mot de passe, et renseigner ce fichier JSON **ignoré par Git** :

```json
{
  "password": "mot-de-passe-de-test",
  "users": [
    { "email": "alice@example.com", "name": "Alice Test" },
    { "email": "bob@example.com", "name": "Bob Test" }
  ]
}
```

Les profils doivent porter les noms indiqués. Le test crée des données réelles : utiliser des comptes dédiés et nettoyer leurs groupes/cours entre deux exécutions. Les captures vont dans `test-results/`. `CHROMIUM_PATH` permet d’utiliser un navigateur installé ; un proxy HTTPS est pris en charge dans la configuration Playwright pour les environnements restreints.

La CI lance calculs, build et test mobile à chaque push/PR. Les tests RLS et le scénario à deux comptes doivent aussi être exécutés contre Supabase ; ils ne sont pas remplacés par des mocks en CI.

## Vérification effectuée le 25 septembre 2026

- Build de production réussi ; 8 tests unitaires réussis.
- Script transactionnel RLS exécuté avec succès contre le projet Trouve (y compris accès anonyme interdit, changement de propriétaire interdit, sortie du groupe et invalidation des votes).
- 2 tests Playwright réussis : auth mobile et parcours réel à deux comptes, invitation, cours, confirmation, propagation Realtime, départ du groupe et retrait de confirmation. Captures bureau/mobile examinées ; aucun débordement de page à 390 px. Dans cet environnement, `E2E_NODE_TRANSPORT=1` relaie les requêtes HTTP et WebSocket vers **le vrai Supabase** via Node ; les réponses ne sont pas simulées.
- Les deux comptes temporaires, leurs sessions et leurs données ont été supprimés après les tests.
- Audit Supabase : aucune alerte RLS ; une alerte Auth reste à traiter dans le tableau de bord : [activer la protection contre les mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- La livraison d’e-mails de confirmation/récupération n’a pas été testée. Définir l’URL publique et les redirections autorisées puis vérifier la réception avec le SMTP choisi avant ouverture publique. Le frontend n’a pas été publié sur un hébergeur.
