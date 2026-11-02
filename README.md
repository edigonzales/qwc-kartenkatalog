# QWC-Kartenkatalog

Solothurn-QWC-App mit eigenem Kartenkatalog-Plugin. Das separate [Quarkus-Backend](https://github.com/edigonzales/kartenkatalog) liefert Themen, Kartenebenen und Metadaten aus einer XTF-Datei.

## Docker Compose

Voraussetzungen: Docker mit Compose v2 oder neuer, Internetzugang zu Docker Hub und `https://geo.so.ch`.

```sh
./scripts/up.sh              # veröffentlichte Images pullen und starten
./scripts/down.sh            # Stack stoppen; Daten und Images bleiben erhalten
```

- QWC: [lokale Karte](http://127.0.0.1:8082/map/).
- Kartenkatalog: [Themen](http://127.0.0.1:8083/thema).
- Backend: `sogis/kartenkatalog:0.2.75-jvm`, fest versioniert; auf ARM mit amd64-Emulation.
- QWC: `sogis/qwc-kartenkatalog:latest`, amd64/arm64. Vor der ersten erfolgreichen Pipeline-Veröffentlichung den lokalen Build verwenden.

Nur die Loopback-Adresse wird veröffentlicht. Belegte Ports führen zu einem Fehler; laufende Dev-Server gegebenenfalls selbst beenden oder andere Ports konfigurieren. Der Start wartet bis zu 180 Sekunden auf QWC und Backend-Readiness. Bei einem Fehler bleiben Logs über `docker compose logs` verfügbar.

Optional nur QWC aus diesem Checkout bauen, das Backend weiterhin pullen:

```sh
./scripts/up.sh --local-qwc
```

Dieser Modus verwendet `compose.local.yaml` und das separate lokale Tag `qwc-kartenkatalog:local`; es wird kein veröffentlichtes QWC-Image gepullt. Der Build benötigt weder npm noch Java auf dem Host. `down.sh` funktioniert für beide Modi. Beide Skripte lassen sich auch aus anderen Arbeitsverzeichnissen aufrufen und unterstützen `--help`.

Für Anpassungen `.env.example` nach `.env` kopieren. Verfügbar sind `QWC_IMAGE`, `CATALOG_IMAGE`, `QWC_PORT`, `CATALOG_PORT` und `CATALOG_XTF_PATH`. Shell-Variablen haben Vorrang. Relative XTF-Pfade beziehen sich auf dieses Repo. Fehlende Dateien verhindern den Start, statt als Verzeichnis angelegt zu werden. Für reproduzierbare QWC-Deployments statt `latest` eine veröffentlichte Version oder einen Digest setzen.

Die [mitgelieferte Harvest-XTF](data/README.md) ist ein unvollständiger Entwicklungsdatenstand mit 169 Themen und 886 Kartenebenen. Sie wird schreibgeschützt eingebunden und ist nicht im Image enthalten. Ein eigener Datensatz kann über `CATALOG_XTF_PATH` eingebunden werden; Änderungen werden nach Backend-Neustart eingelesen. Datenbank, Indexvolume und lokaler QGIS Server sind nicht erforderlich.

## Image und Veröffentlichung

Der Root-Dockerfile baut Übersetzungen, Icons und einen optimierten QWC-Bundle. Die Laufzeit enthält statische Dateien und einen kleinen Node-HTTP-Server, keine npm-Abhängigkeiten und keinen Webpack-Dev-Server. Der Server läuft als Nicht-Root mit schreibgeschütztem Dateisystem. `/healthz` prüft zusätzlich die Backend-Readiness.

`.github/workflows/docker.yml` führt Tests, Plugin-Lint, Image-Build und einen echten Compose-HTTP-Smoke-Test mit dem veröffentlichten JVM-Backend aus. Pull Requests publizieren nichts. Erfolgreiche Pushes auf `main` und manuelle Workflow-Starts auf `main` veröffentlichen `sogis/qwc-kartenkatalog` für `linux/amd64` und `linux/arm64` mit Tags:

- `latest`
- `0.1.<GitHub-Laufnummer>`
- `sha-<vollständiger Commit-SHA>`

Im GitHub-Repo unter **Settings → Secrets and variables → Actions** anlegen:

- **`DOCKER_USERNAME`**: Docker-Hub-Benutzer mit Schreibrecht auf `sogis/qwc-kartenkatalog`.
- **`DOCKER_PASSWORD`**: Docker-Hub-Zugriffstoken mit Schreibberechtigung.

Secrets gehören ausschliesslich in GitHub, weder in `.env` noch ins Image. Der Workflow veröffentlicht automatisch nach seinen Prüfungen; lokale Builds pushen nichts.

## Entwicklung ohne Container

Voraussetzungen: Node **22.13.0** (siehe `.nvmrc`), npm, Docker mit Compose v2 und Internetzugang.

```sh
nvm use                     # falls nvm installiert ist
npm run setup               # einmalig und nach Änderungen am Lockfile
npm run dev                 # Backend-Container + QWC/Plugin auf dem Host
```

Öffnen: [lokale Karte](http://127.0.0.1:8082/map/). Der Dev-Start prüft Konfiguration, lesbare XTF und Frontend-Abhängigkeiten, stoppt den QWC-Container dieses Compose-Projekts und startet ausschliesslich das Backend-Image. Er wartet bis zu 180 Sekunden auf Backend-Readiness und startet danach Webpack im Vordergrund. Änderungen an QWC-App, Plugin, JavaScript und CSS werden automatisch übernommen: per Hot Module Replacement, soweit unterstützt, sonst durch automatisches Neuladen. React-Zustand kann beim Neuladen verloren gehen. Kein QWC-Image-Build ist erforderlich.

**Strg+C** beendet den lokalen Dev-Server und seine Kindprozesse; das Backend läuft weiter. Der QWC-Container wird dabei nicht automatisch neu gestartet. `./scripts/up.sh` wechselt zurück zum veröffentlichten Containerbetrieb; `./scripts/up.sh --local-qwc` baut QWC mit den lokalen Änderungen.

Backend und Frontend lassen sich auch unabhängig steuern:

```sh
npm run catalog:up          # nur Backend pullen und starten
npm run catalog:stop        # nur Backend stoppen, Container bleibt erhalten
npm run start:remote        # nur QWC-Dev-Server, Backend muss bereits laufen
```

`catalog:up` entspricht `./scripts/up.sh --catalog-only`, `catalog:stop` entspricht `./scripts/down.sh --catalog-only`. Der Backend-Einzelstart wartet auf den Compose-Servicestart; `npm run dev` prüft zusätzlich die HTTP-Readiness. `--catalog-only` lässt sich nicht mit `--local-qwc` kombinieren. `./scripts/down.sh` entfernt weiterhin den gesamten Compose-Stack.

`npm run dev` übernimmt `QWC_PORT`, `CATALOG_PORT`, Image und XTF-Pfad aus der Compose-Konfiguration (`.env`, Shell-Werte haben Vorrang). Der Backend-Origin stammt aus dem tatsächlich veröffentlichten Backend-Port. Beispielsweise startet `QWC_PORT=18082 CATALOG_PORT=18083 npm run dev` die Karte auf Port 18082 mit Backend auf 18083. Beide bleiben an `127.0.0.1` gebunden. Belegt ein fremder Prozess den Dev-Port, bricht der Start mit Hinweis ab.

Nach Änderungen an `frontend/server/`, `frontend/dev/` oder Webpack den Dev-Server neu starten. Für den unabhängigen Frontend-Start überschreibt `CATALOG_API_ORIGIN` dessen Backend-Origin (Standard `http://127.0.0.1:8083`); `QWC_PORT` überschreibt dessen Port (Standard 8082). Dieser direkte Start liest selbst keine `.env`-Datei. Im Container ist der Backend-Origin intern `http://kartenkatalog:8080`.

Alternativ das Backend gemäss dessen README mit Quarkus starten:

```sh
cd ../kartenkatalog
./gradlew quarkusDev -Dquarkus.http.port=8083
```

`npm start` erhält den ursprünglichen Upstream-Modus mit lokaler Theme-Generierung und benötigt die dort konfigurierten GIS-/Fachservices. `npm test`, `npm run lint:catalog`, `node --test scripts/dev.test.cjs` und `bash scripts/test-scripts.sh` prüfen die lokalen Erweiterungen. `python3 scripts/smoke.py` prüft einen laufenden Stack (optional `--url http://127.0.0.1:18082`).

## Live-Anbindung und Plugin

Container und Remote-Dev-Modus laden die öffentliche Konfiguration bei jedem Abruf frisch von `https://geo.so.ch`. Lokale Assets haben Vorrang, fehlende Vorschaubilder kommen gezielt vom Live-System. Suche, Layer-Nachladen, Hintergrundkarten, Feature-Info und Legenden benötigen Live-Dienste. Fehler ergeben 502 statt Beispieldaten. Ohne Internet funktioniert dieser Stack deshalb nicht vollständig.

Der Zugriff bleibt anonym: Login, Editing, Analytics und Fachfunktionen ohne freigegebene Dienste sind deaktiviert. Der gemeinsame Proxy erlaubt ausschliesslich die definierten öffentlichen Lesepfade mit GET/HEAD und reicht keine Cookies weiter. Die Backend-API wird same-origin über `/catalog-api/v1/catalog` bereitgestellt.

Das Kartenkatalog-Plugin bleibt beim Kartenstart geschlossen und lässt sich unter **Karte & Werkzeuge → Kartenkatalog** rechts öffnen, auf derselben Seite wie „Layers & Legends“. Dies gilt für Desktop und Mobilansicht. Es bietet Suche, aufklappbare Themen, Metadaten sowie Hinzufügen/Aktivieren von Ebenen über die QWC-Layerverwaltung. Das Default-Thema ist zunächst leer; Layerdefinitionen werden live nachgeladen. [Gemeindegrenzen testen](http://127.0.0.1:8082/map/?l=ch.so.agi.gemeindegrenzen).

[Plugin und QWC-Anbindung](docs/plugin.md) · [Architektur](docs/architecture.md) · [Upstream und Updates](docs/upstream.md)
