# QWC-Kartenkatalog

Lokale Solothurn-QWC-App mit eigenem Kartenkatalog-Plugin.
Die Spring-Boot-Anwendung bleibt im separaten [Kartenkatalog-Repo](https://github.com/edigonzales/kartenkatalog).

## Start

Voraussetzungen: Node **22.13.0** (siehe `.nvmrc`), npm und Internetzugang zu `https://geo.so.ch`.

```sh
nvm use                 # falls nvm installiert ist
npm run setup           # npm ci im Frontend
npm run start:remote
```

Öffnen: [lokale Karte](http://127.0.0.1:8082/map/).
Der Server ist nur über die lokale Loopback-Adresse erreichbar; `/` leitet nach `/map/` weiter.
Webpack übernimmt lokale Änderungen mit Hot Reload. Nach Änderungen an `frontend/dev/` oder Webpack den Server neu starten.

Ein Layer lässt sich direkt testen:
[Gemeindegrenzen](http://127.0.0.1:8082/map/?l=ch.so.agi.gemeindegrenzen).
Das Default-Thema ist zunächst leer. Definitionen werden vom Live-Datenprodukt-Service nachgeladen.
Suche, Layer hinzufügen/entfernen, Hintergrundwechsel, Feature-Info und Legende verwenden öffentliche Live-Daten.
Es braucht weder Datenbank noch QGIS Server auf dem Entwicklungsrechner.

## Betriebsmodi

- `npm run start:remote`: lokale App mit aktueller öffentlicher Live-Konfiguration; anonymer Zugriff.
- `npm start`: unveränderter Upstream-Ablauf mit lokaler Theme-Generierung. Benötigt die in `frontend/themesConfig.json` und `frontend/static/config.json` beschriebenen lokalen GIS- und Fachservices. Dieser Modus ist kein eigenständig mitgeliefertes GIS-Backend.
- `npm test`: isolierte Tests der Live-Middleware ohne Zugriff auf Produktion.

Die Live-Konfiguration wird bei jedem Abruf neu geladen, nicht im Repo gespeichert. Fehler ergeben HTTP 502 statt Beispieldaten. Die Dev-Anpassungen sind in `frontend/dev/remote.cjs` zentral beschrieben. Lokale Assets und Übersetzungen haben Vorrang; fehlende Kartenbilder werden gezielt live geladen.

Im Remote-Modus sind Anmeldung, Editing und Fachfunktionen ohne freigegebene Dienste ausgeblendet (unter anderem Druck, gespeicherte Permalinks, Bookmarks, News-Iframe und Grundstücksauszüge). Der Proxy erlaubt nur explizite öffentliche Lesepfade und GET/HEAD. Cookies werden nicht weitergereicht. Analytics ist deaktiviert. Der Remote-Modus dient der Frontend-Entwicklung, nicht als produktives Deployment.

## Weiterentwicklung

[Architektur](docs/architecture.md) · [Upstream und Updates](docs/upstream.md)

Das Kartenkatalog-Plugin lädt Themen und Metadaten aus der separaten Spring-Boot-App. Diese zuerst in einem zweiten Terminal starten:

```sh
cd ../kartenkatalog
./gradlew bootRun --args='--spring.profiles.active=xtf --server.address=127.0.0.1 --server.port=8083'
```

Dann hier `npm run start:remote` ausführen. Das Plugin öffnet sich links und ist jederzeit unter **Karte & Werkzeuge → Kartenkatalog** erreichbar. Es bietet Themensuche, aufklappbare Themen, Metadaten sowie das Hinzufügen/Aktivieren von Ebenen in QWC. Der Backend-Start setzt die in dessen README beschriebene Java-Toolchain voraus.

[Bedienung, Aufbau und QWC-Anbindung des Plugins](docs/plugin.md).
