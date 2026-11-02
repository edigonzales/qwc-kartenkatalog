# Architektur

Dieses Repo besitzt die Solothurn-QWC-App unter `frontend/`, die lokale Live-Anbindung und das Kartenkatalog-Plugin. Die Java-21-/Quarkus-App bleibt in `edigonzales/kartenkatalog`, mit ihrer XTF-Datenquelle und dem Suchindex im RAM und ihres eigenständigen Deployments. Es gibt keine zweite Kopie des Backends und keine Submodule.

Das Plugin ist als Build-Time-Komponente in der QWC-App registriert. Es bezieht fachliche Themen, Beschreibungen, Schlagwörter und Synonyme über eine konfigurierbare URL aus der Quarkus-JSON-API. Es verwendet den versionierten vollständigen Katalog unter `/api/v1/catalog`; Dev-Server und Container stellen ihn unter `/catalog-api/v1/catalog` bereit.

Katalog-Themen sind fachliche Kategorien, keine QWC-Themen. Die vorhandene Default-Karte bleibt technische Grundlage. Interne Ebenen werden über QWC-State, Actions und die vorhandene Nachlademechanik verwaltet; das eingebaute LayerCatalog ersetzt nicht das eigene Plugin.

## Lokale Datenwege

Browser → lokaler Webpack-Server oder Container-HTTP-Server → `https://geo.so.ch`:

- `/map/config.json`: Live-Konfiguration mit anonymem Dev-Overlay.
- `/map/themes.json`: Live-Themen; absolute Solothurn-WMTS-URLs werden relativ auf den Proxy umgestellt.
- `/api/dataproduct/v1/weblayers`: dynamische Layerdefinitionen über den unveränderten `themeLayerRestorer`.
- `/ows/somap`, `/wms`: ausschliesslich die lesenden OGC-Operationen GetMap, GetCapabilities, GetFeatureInfo und GetLegendGraphic.
- `/api/wmts/`, `/api/search/v2/`, `/api/data/v1/`: Hintergrundkarten, Suche und Suchgeometrien per GET/HEAD.
- `/api/v1/featureinfo/somap`, `/api/v1/legend/somap`: Informationen und Legenden.

Konfigurationen werden mit zehn Sekunden Timeout frisch geladen und strukturell geprüft. Fehler ergeben HTTP 502 ohne lokalen Fallback. Die Middleware setzt keine Live-Cookies und sendet keine Browser-Cookies oder Authorization-Header an das Live-System.

Lokale Skripte und Ressourcen werden unter `/map/` ausgeliefert. Fehlende Bilder unter `/map/img/` und `/map/assets/img/` werden live angefragt. Authentifizierung und Schreibzugriffe werden nicht proxied. Die App überspringt ihre Login-Prüfung nur bei gesetztem Webpack-Flag `REMOTE=1`; Analytics ist in diesem Modus nicht im HTML enthalten.

Das Live-Default-Thema lieferte bei der Einrichtung am 30.10.2026 keine Sublayer. Das ist kein Konfigurationsfehler: Suche und URL-Parameter laden Layerdefinitionen nach. Der LayerResolver des Plugins verwendet deshalb diese Mechanik.

## Geprüft am 30.10.2026

`npm run setup` und Remote-Start erfolgreich; Webpack kompiliert und erkennt lokale Quellcodeänderungen. Elf isolierte Middleware-Tests bestehen. Im Browser: öffentliche Hintergrundkarte, Gemeindegrenzen über URL nachgeladen, Layer entfernt und über Layersuche erneut hinzugefügt. Feature-Info liefert XML und die Legende PNG über den lokalen Proxy. Die erste Browserprüfung zeigte keine JavaScript-Fehler; das von der externen Seite blockierte News-Iframe wird im Remote-Modus ausgeblendet.

Das unverändert übernommene npm-Lockfile enthält veraltete Abhängigkeiten und npm-Audit-Befunde. Diese werden nicht durch ein automatisches, potentiell inkompatibles Dependency-Upgrade verändert; ein späteres Upstream-Update muss sie berücksichtigen.

Die konkrete Komponentenwahl, Layer-Actions und die Besonderheit externer Dienste im Theme-Layer sind in [plugin.md](plugin.md) beschrieben.

## Containerbetrieb

Compose startet QWC und das separat veröffentlichte Quarkus-JVM-Image. Der optimierte QWC-Build und der Dev-Server verwenden dieselbe Middleware aus `frontend/server/remote.cjs`. Im Container zeigt `CATALOG_API_ORIGIN` auf `http://kartenkatalog:8080`; es gibt keine CORS-Freigabe zwischen Browser und Backend. Die XTF wird ausschliesslich schreibgeschützt ins Backend gemountet. QWC-Readiness unter `/healthz` setzt Backend-Readiness voraus, Live-Dienste bleiben eine externe Abhängigkeit.
