# FTM - Monitoring

Outil de supervision des nœuds Axway Secure Transport des environnements hors production : **QUA** (Qualification), **DEV** (Développement) et **INT** (Intégration).

Toutes les 60 secondes, l'outil vérifie chaque nœud, affiche l'état sur une page web et envoie un mail quand un service s'arrête ou redémarre. Il est **en lecture seule** : il ne démarre, n'arrête et ne modifie aucun service sur les serveurs.

- Python 3.6 ou plus récent, aucune bibliothèque à installer.
- Conçu par Dounia KASSOU (stage BTS CIEL, du 12/10 au 20/11/2026), équipe Échanges, unité OSA, DSIT.
- Responsable de l'outil : Salah AIT-TAHAR, chef de projet DSIT.

---

## Sommaire

1. [Ce que l'outil contrôle](#1-ce-que-loutil-contrôle)
2. [Utiliser la page](#2-utiliser-la-page)
3. [Les mails](#3-les-mails)
4. [Réagir à un arrêt](#4-réagir-à-un-arrêt)
5. [Lancer, arrêter, vérifier](#5-lancer-arrêter-vérifier)
6. [Organisation du dossier](#6-organisation-du-dossier)
7. [Réglages](#7-réglages)
8. [Accès SSH aux nœuds](#8-accès-ssh-aux-nœuds)
9. [Installation sur un nouveau serveur](#9-installation-sur-un-nouveau-serveur)
10. [Passation et fin de stage](#10-passation-et-fin-de-stage)
11. [Dépannage](#11-dépannage)
12. [Règles de sécurité](#12-règles-de-sécurité)

---

## 1. Ce que l'outil contrôle

| Environnement | Nœuds |
|---|---|
| QUA | 3 |
| DEV | 2 |
| INT | 3 |

Sur chaque nœud, 7 points sont vérifiés :

| Type | Point contrôlé | Méthode |
|---|---|---|
| Accès | SSH (port 22) | test de connexion TCP |
| Accès | IHM d'administration (port 8444) | test de connexion TCP |
| Service | Admin Service | `-Dct=admin` |
| Service | Transaction Manager | `-Dct=tm` |
| Service | HTTP Service (HTTPS) | `-Dct=httpd` |
| Service | SSH Service (SFTP) | `-Dct=sshd` |
| Service | Monitor | `-Dct=monitord` |

Les services sont détectés avec une seule connexion SSH par nœud, grâce à la commande :

```
ps -eo args | grep -qE -- '-[D]ct=<nom>( |$)'
```

> `ps` est utilisé à la place de `pgrep`, car `pgrep` ne lit pas la fin des lignes de lancement très longues. Pour cette raison, le Transaction Manager apparaissait arrêté à tort (corrigé le 19/11/2026).

En cas d'échec de la connexion SSH, l'outil fait 3 essais espacés de 2 secondes. Si les 3 échouent, les services du nœud passent en **Non vérifié** : l'état réel est inconnu, ce n'est pas un arrêt.

---

## 2. Utiliser la page

Adresse : `http://<nom-du-serveur>:8080`, depuis un navigateur du réseau RTE. La page se recharge toute seule chaque minute.

### Couleurs

| Couleur | Signification |
|---|---|
| Vert | Service démarré, ou port joignable |
| Rouge | Service arrêté, ou port injoignable |
| Gris « Non vérifié » | Connexion SSH impossible : état inconnu |
| Orange | Nœud en maintenance |

### Zones de l'écran

| Zone | Contenu |
|---|---|
| Onglets QUA / DEV / INT | Un onglet par environnement. Le chiffre rouge indique le nombre d'alertes en cours (services et accès). |
| Phrase sous le titre | Les services arrêtés et les nœuds concernés |
| Cluster | Opérationnel (tous les nœuds actifs), Dégradé (au moins un nœud en panne) ou Hors service (aucun nœud actif), avec le nombre de nœuds actifs |
| Disponibilité | Part des contrôles réussis sur 7 jours, hors maintenance |
| Topologie | Une carte par nœud. Sa pastille indique « En service », « N arrêts » (services) ou « Accès coupé » (seulement SSH ou IHM). |
| Détail du nœud | Ouvert par un clic sur une carte : hostname, IP, commande SSH, 20 derniers contrôles de chaque service, heure d'un arrêt |
| Événements | Les changements d'état du jour |

L'IHM (port 8444) est fournie par l'Admin Service : quand l'Admin Service est arrêté, l'IHM passe aussi au rouge. C'est normal.

### Actions

| Action | Comment |
|---|---|
| Lancer un contrôle immédiat | Bouton « Contrôler maintenant », ou touche `R` |
| Rechercher un nœud, une IP ou un service | `Ctrl` + `K`, ou `/` |
| Changer d'environnement | Touches `1`, `2`, `3` |
| Afficher seulement les arrêts | Interrupteur au-dessus de la topologie |
| Ouvrir l'IHM Axway d'un nœud | Détail du nœud › « Ouvrir IHM » |
| Exporter le journal du jour (CSV) | Section Événements › « Exporter » |
| Mettre un nœud en maintenance | Détail du nœud › « Mettre en maintenance » |

### Mode maintenance

À utiliser **avant toute intervention prévue** (redémarrage, mise à jour) :

1. Avant l'intervention : détail du nœud › « Mettre en maintenance ». Le nœud passe en orange, aucun mail n'est envoyé pour lui et il est exclu du calcul de disponibilité.
2. Après l'intervention : « Fin de maintenance ». Si un service est encore arrêté, une alerte part.

La maintenance est enregistrée dans `donnees/etat.json` : elle est conservée même si l'outil redémarre.

### Assistant Bip

Il se trouve en bas à droite de la page et répond aux questions simples (état, couleurs, export, etc.). Il fonctionne par mots-clés, directement dans la page : aucune donnée ne sort de RTE. Ce n'est pas une IA.

---

## 3. Les mails

Un mail part quand un changement est **confirmé par 2 contrôles identiques**, soit environ 2 minutes après. Une micro-coupure ne déclenche donc rien.

| Situation | Mail |
|---|---|
| Un service s'arrête | Alerte (bandeau rouge) |
| Un service redémarre | Rétablissement (bandeau vert) |
| La panne dure | Un seul mail, pas de relance |
| Plusieurs services touchés en même temps | Un seul mail regroupé |
| Nœud en maintenance | Aucun mail |
| Connexion SSH impossible | Aucun mail (état inconnu) |
| Chaque jour, à l'heure de `rapport_quotidien` | Rapport : arrêts en cours, disponibilité sur 7 jours, maintenances, derniers événements |

Les mails ne partent que pendant que l'outil tourne.

---

## 4. Réagir à un arrêt

1. Ouvrir la page (bouton du mail) et cliquer sur le nœud : noter le service et l'heure de l'arrêt.
2. S'il s'agit d'une intervention prévue, mettre le nœud en maintenance.
3. Confirmer à la main (lecture seule) :
   ```
   ssh <compte>@<ip-du-noeud> "ps -eo args | grep -o -- '-Dct=[a-z]*' | sort -u"
   ```
   Sur un nœud sain, la commande affiche `admin`, `httpd`, `monitord`, `sshd` et `tm`. Un nom absent signifie que le service est réellement arrêté.
4. Prévenir le référent de la plateforme en indiquant le nœud, le service et l'heure (le journal exporté contient ces informations).
5. Attendre le mail de rétablissement.

L'outil ne redémarre jamais un service : c'est une décision de l'équipe.

---

## 5. Lancer, arrêter, vérifier

Les commandes se lancent **dans le dossier de l'outil**. Sur Windows, remplacer `python3` par `py`.

| Action | Commande |
|---|---|
| Lancer | `python3 supervision.py` |
| Tester avec des machines fictives | `python3 supervision.py --demo` |
| Changer le port de la page | `python3 supervision.py --port 8081` |
| Changer l'intervalle de contrôle (en secondes) | `python3 supervision.py --intervalle 120` |
| Envoyer un mail de test | `python3 supervision.py --test-mail` |
| Envoyer le rapport quotidien maintenant | `python3 supervision.py --test-rapport` |
| Arrêter (outil lancé à la main) | `Ctrl` + `C` |
| Lancer les tests automatiques (17 tests) | `python3 -m unittest discover -s tests -v` |

Pour lancer l'outil en arrière-plan, sans service :

```
nohup python3 supervision.py > ftm.log 2>&1 &
pkill -f supervision.py          # pour l'arrêter
```

Quand l'outil est installé en service systemd (voir la section 9) :

```
sudo systemctl status ftm-monitoring
sudo systemctl restart ftm-monitoring     # après une modification des réglages
sudo systemctl stop ftm-monitoring
journalctl -u ftm-monitoring -f           # messages en direct
```

**Après toute modification d'un fichier de `config/`, il faut relancer l'outil.**

---

## 6. Organisation du dossier

```
FTM - Monitoring/
├── supervision.py          fichier à lancer
├── README.md               ce document
├── .gitignore              exclut les fichiers sensibles de Git
├── ftm/                    code Python
│   ├── config.py           chemins, réglages, lecture des CSV
│   ├── verification.py     connexions SSH (ps) et tests de ports
│   ├── superviseur.py      boucle de contrôle, confirmation, maintenance, journal, rapport
│   ├── mails.py            mails d'alerte et rapport (SMTP ou Outlook)
│   └── serveur_web.py      page web et API
├── config/                 réglages, modifiables sans toucher au code
│   ├── environnements.csv  nœuds surveillés          ← sensible
│   ├── services.csv        points contrôlés
│   ├── alertes.csv         mails                      ← sensible
│   └── *.exemple.csv       modèles sans données réelles
├── donnees/
│   └── etat.json           écrit par l'outil : historique, journal, maintenances  ← sensible
├── web/                    page : index.html, style.css, app.js, bip.js, polices, images des mails
├── deploiement/
│   └── ftm-monitoring.service   service systemd
└── tests/
    └── test_supervision.py
```

API utilisée par la page :

| Méthode | Adresse | Rôle |
|---|---|---|
| GET | `/api/etat` | État complet, en JSON |
| POST | `/api/controle` | Lance un contrôle immédiat |
| POST | `/api/maintenance` | Active ou désactive la maintenance d'un nœud |
| GET | `/api/journal.csv` | Journal du jour, en CSV |

---

## 7. Réglages

Les réglages sont des fichiers CSV séparés par des points-virgules. Ils s'ouvrent avec un simple éditeur de texte.

### `config/environnements.csv` : les nœuds

```
env;type;noeud;hostname;ip;user_ssh;url;cluster
QUA;traitement;Traitement 1;SRV-QUA-TRT1;192.0.2.11;utilisateur;https://srv-qua-trt1.exemple.local:8444/;Oui
```

| Colonne | Rôle |
|---|---|
| `env` | Code de l'environnement (un onglet par code) |
| `type` | Type de nœud (`traitement`). Relie le nœud aux lignes de `services.csv`. |
| `noeud` | Nom affiché sur la page |
| `hostname` | Nom de la machine |
| `ip` | Adresse utilisée pour les contrôles |
| `user_ssh` | Compte de connexion SSH sur le nœud |
| `url` | Lien du bouton « Ouvrir IHM » |
| `cluster` | `Oui` si les nœuds de l'environnement forment un cluster |

**Ajouter un nœud** : ajouter une ligne, déposer la clé SSH du serveur sur le nœud (voir la section 8), puis relancer l'outil.
**Retirer un nœud** : supprimer sa ligne, puis relancer l'outil.

### `config/services.csv` : les points contrôlés

```
type;categorie;service;port;commande_ssh;lien
traitement;acces;IHM;8444;;oui
traitement;service;Admin Service;;ps -eo args | grep -qE -- '-[D]ct=admin( |$)';
```

- `acces` : l'outil teste le `port`.
- `service` : l'outil lance la `commande_ssh` sur le nœud. Le service est considéré comme démarré si la commande réussit.
- `lien` à `oui` : affiche le bouton « Ouvrir IHM ».

Les crochets dans `-[D]ct` empêchent la commande de se trouver elle-même dans la liste des processus. Il ne faut pas les retirer.

### `config/alertes.csv` : les mails

| Paramètre | Valeur |
|---|---|
| `actif` | `oui` pour envoyer les mails, `non` pour tous les couper |
| `methode` | `smtp` sur le serveur Linux ; `outlook` uniquement sur un poste Windows |
| `serveur_smtp` / `port` | Relais mail de RTE (à renseigner) |
| `utilisateur` | Compte SMTP si le relais demande une authentification, sinon vide |
| `expediteur` | Adresse d'envoi |
| `destinataires` | Adresses, séparées par des virgules |
| `confirmation` | Nombre de contrôles identiques avant une alerte (2) |
| `rapport_quotidien` | Heure du rapport (par exemple `09:00`) ; vide = pas de rapport |

Un éventuel mot de passe SMTP ne se met **jamais dans un fichier**. Il se place dans une variable d'environnement :

```
export FTM_SMTP_MOT_DE_PASSE='...'
```

On peut aussi ajouter une ligne `Environment=FTM_SMTP_MOT_DE_PASSE=...` dans le service systemd, dont le fichier n'est lisible que par root.

Pour tester l'envoi : `python3 supervision.py --test-mail`.

---

## 8. Accès SSH aux nœuds

L'outil se connecte aux nœuds **par clé SSH, sans mot de passe**, avec le compte indiqué dans `user_ssh`.

- La **clé privée** reste sur le serveur, dans le dossier `~/.ssh/` du compte qui lance l'outil. Elle ne doit jamais être copiée ailleurs ni partagée.
- La **clé publique** (fichier `.pub`) est ajoutée sur chaque nœud, dans le fichier `~/.ssh/authorized_keys` du compte `user_ssh`.
- La clé de l'outil porte le commentaire `ftm-monitoring`. C'est le texte qui apparaît à la fin de sa ligne dans `authorized_keys`.

### Créer la clé de l'outil (une seule fois, sur le serveur)

```
ssh-keygen -t ed25519 -C "ftm-monitoring"
```

Garder le nom proposé par défaut (`~/.ssh/id_ed25519`) et laisser la phrase de passe vide : l'outil doit pouvoir se connecter seul. Si la clé porte un autre nom, SSH ne la trouve pas et demande un mot de passe. Il faut alors ajouter `-i ~/.ssh/<nom>` à la commande, ou une ligne `IdentityFile` dans `~/.ssh/config`.

### Déposer la clé sur un nœud (avec l'accord du responsable)

```
ssh-copy-id -i ~/.ssh/id_ed25519.pub <user_ssh>@<ip-du-noeud>
```

Pour vérifier : `ssh <user_ssh>@<ip-du-noeud> echo ok` doit répondre `ok` **sans demander de mot de passe**.

### Lister les clés autorisées sur un nœud

```
ssh <user_ssh>@<ip-du-noeud> "cat ~/.ssh/authorized_keys"
```

Chaque ligne correspond à une clé. Le dernier mot de la ligne est son commentaire (`ftm-monitoring`, un nom de poste, une adresse, etc.).

### Retirer une clé d'un nœud

Remplacer `<commentaire>` par le commentaire de la clé à retirer :

```
ssh <user_ssh>@<ip-du-noeud> "cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak && grep -v '<commentaire>' ~/.ssh/authorized_keys.bak > ~/.ssh/authorized_keys"
```

Une copie de sauvegarde, `authorized_keys.bak`, est conservée. Vérifier ensuite depuis le serveur que la connexion de l'outil fonctionne toujours (`ssh … echo ok`).

---

## 9. Installation sur un nouveau serveur

1. Copier le dossier sur le serveur, par exemple dans `/home/<compte>/ftm-monitoring`.
2. Remplir `config/environnements.csv` et `config/alertes.csv`, en partant des fichiers `.exemple.csv`.
3. Créer la clé SSH et la déposer sur les nœuds (voir la section 8).
4. Tester : lancer `python3 -m unittest discover -s tests`, puis `python3 supervision.py`, puis ouvrir la page.
5. Faire installer le service par un administrateur :
   ```
   sudo cp deploiement/ftm-monitoring.service /etc/systemd/system/
   sudo nano /etc/systemd/system/ftm-monitoring.service    # remplacer <compte>
   sudo systemctl daemon-reload
   sudo systemctl enable --now ftm-monitoring
   ```
   L'outil démarre alors avec le serveur et redémarre tout seul s'il s'arrête.
6. Si la page n'est pas joignable depuis les postes, ouvrir le port 8080 dans le pare-feu du serveur.

---

## 10. Passation et fin de stage

À faire par l'équipe après le départ de la conceptrice, le 20/11/2026 :

- [ ] **Retirer les clés SSH personnelles de Dounia KASSOU** sur les 8 nœuds, s'il y en a. Pour cela, lister le fichier `authorized_keys` de chaque nœud (voir la section 8) et retirer toute clé dont le commentaire correspond à son poste ou à son nom. **Ne pas retirer la clé `ftm-monitoring`** : c'est celle de l'outil.
- [ ] Retirer sa clé publique du serveur Linux s'il y en a une (dans `~/.ssh/authorized_keys` du compte de l'outil).
- [ ] Retirer son adresse `dounia.kassou@rte-france.com` de la ligne `destinataires` dans `config/alertes.csv`, ajouter les nouvelles adresses, puis relancer l'outil.
- [ ] Désigner la personne qui reçoit les alertes et suit l'outil.
- [ ] Renseigner le relais SMTP dans `config/alertes.csv` et vérifier l'envoi avec `--test-mail`.
- [ ] Faire installer le service systemd par un administrateur (voir la section 9).
- [ ] Mettre à jour, si besoin, la ligne « Responsable de l'outil » en haut de ce document.

---

## 11. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| La page ne s'ouvre pas | L'outil est arrêté, ou le port 8080 est bloqué | `systemctl status ftm-monitoring` ; vérifier le pare-feu |
| `Address already in use` au lancement | Une autre instance tourne déjà | `pkill -f supervision.py` puis relancer, ou utiliser `--port 8081` |
| Tout un nœud en « Non vérifié » | Connexion SSH impossible : nœud éteint, problème réseau ou clé absente | Tester `ssh <user_ssh>@<ip> echo ok` depuis le serveur |
| SSH demande un mot de passe | La clé n'est pas déposée sur le nœud, ou elle a un nom non standard | Voir la section 8 |
| Un service apparaît arrêté alors qu'il tourne | La commande de `services.csv` est incorrecte | Comparer avec `ps -eo args \| grep -o -- '-Dct=[a-z]*'` sur le nœud |
| Aucun mail reçu | `actif;non`, relais SMTP vide ou faux, ou nœud en maintenance | Vérifier `alertes.csv`, puis lancer `--test-mail` |
| Message `methode outlook : uniquement sur Windows` | `methode;outlook` est réglé sur le serveur Linux | Mettre `methode;smtp` |
| Message `serveur_smtp vide` | Le relais mail n'est pas renseigné | Remplir `serveur_smtp` et `port` |
| Historique perdu | `donnees/etat.json` a été supprimé ou est illisible | L'outil en recrée automatiquement un vide |

---

## 12. Règles de sécurité

- L'outil reste **en lecture seule** : n'ajouter dans `services.csv` aucune commande qui démarre, arrête ou modifie un service.
- Aucun mot de passe dans les fichiers.
- La clé SSH privée ne quitte jamais le serveur.
- `config/environnements.csv` (adresses IP), `config/alertes.csv` (adresses mail) et le dossier `donnees/` ne sortent pas de RTE et ne vont jamais sur GitHub. Ils sont exclus par `.gitignore`.
- Toute nouvelle clé SSH déposée sur un nœud, et tout nouveau destinataire des mails, se fait avec l'accord du responsable de l'outil.
