# Kartenkatalog-Plugin

Das Plugin ist Teil des lokalen QWC-Builds und über **Karte & Werkzeuge → Kartenkatalog** erreichbar. Beim Kartenstart bleibt es geschlossen; beim manuellen Öffnen erscheint es rechts wie „Layers & Legends“, sowohl auf dem Desktop als auch in der Mobilansicht. Dies gilt für Container und Live-Dev-Modus. Themen zum Aufklappen, Ebenenlisten und Beschreibungen folgen dem Aufbau des Kartenkatalogs; Fenster, Eingabefeld, Icons, Ladeanzeige, Buttons und Farben verwenden die vorhandenen QWC-Komponenten und CSS-Variablen. Es gibt kein zusätzliches UI-Toolkit.

## Entwicklung mit Hot Reload

Nach `npm run setup` startet `npm run dev` das veröffentlichte Backend in Docker und die lokale QWC-App einschliesslich Plugin mit Webpack. Ein laufender QWC-Container dieses Projekts wird dafür gestoppt. JavaScript-/JSX- und CSS-Änderungen erscheinen automatisch im Browser; Webpack verwendet HMR oder lädt die Seite neu. Ein Erhalt von Suche, offenen Themen oder anderem React-Zustand ist nicht garantiert.

Strg+C beendet nur den Dev-Server. `npm run catalog:up` und `npm run catalog:stop` steuern das Backend einzeln. Ports und XTF werden beim gemeinsamen Dev-Start über Compose aus `.env` beziehungsweise der Shell übernommen; siehe [Entwicklungsablauf](../README.md#entwicklung-ohne-container). Änderungen an Middleware oder Webpack-Konfiguration benötigen einen Neustart des Dev-Servers. Backend-Quellcode wird in diesem Ablauf nicht automatisch neu geladen.

## Daten und Bedienung

`GET /catalog-api/v1/catalog` lädt den vollständigen Katalog aus der Quarkus-API. Die gemeinsame Middleware für Dev-Server und Container leitet diesen festen Lesepfad nach `http://127.0.0.1:8083/api/v1/catalog` weiter. Mit `CATALOG_API_ORIGIN=http://127.0.0.1:8080 npm run start:remote` lässt sich ein anderer Backend-Port verwenden. Der Proxy reicht keine Cookies weiter und erlaubt weder andere Backend-Routen noch Schreibmethoden.

Der Katalog bleibt pro App-Sitzung im Browser. Die Suche arbeitet lokal über Kennung, Titel, Beschreibung, Schlagwörter und Synonyme sowie die Themenmetadaten. Mehrere Suchwörter werden kombiniert; Grossschreibung und Akzente sind unerheblich. Die Suche verändert den manuell gewählten Aufklappzustand der Themen nicht. Ohne Treffer erscheint ein Leerzustand. Bei API-Fehlern bleibt die Karte nutzbar und der Katalog bietet einen erneuten Ladeversuch an.

Ein Klick auf einen Layer-Titel oder „Layer information“ zeigt die Metadaten; „Topic information“ öffnet die Themeninformationen. Der Zurück-Button erhält die Suche und die zuvor geöffneten Themen. HTML-Beschreibungen werden zusätzlich im Browser mit DOMPurify bereinigt; externe Links sind auf HTTP(S) beschränkt.

Die Hinzufügen-Aktion lädt die aktuelle QWC-Definition nach und zeigt einen Ladezustand. Nicht verfügbare Ebenen oder fehlgeschlagene Aufrufe melden einen Fehler direkt am Eintrag. Sichtbare Ebenen lassen sich über „Entfernen“ aus der Karte entfernen; ausgeblendete zeigen „Aktivieren“. Teilweise geladene Gruppen können vervollständigt werden; vorhandene Mitglieder werden dabei nicht erneut eingefügt. Änderungen im normalen QWC-LayerTree erscheinen sofort auch im Katalog. Gruppenmitgliedschaften können erst nach dem Nachladen ihrer tatsächlichen Definition vollständig geprüft werden.

### Temporäre Kartenvorschau

Nach 150 ms Maus-Hover über Titel oder Beschreibung eines Einzel-Layers beziehungsweise Tastaturfokus auf dessen Titel erscheint eine Kartenvorschau. Beim Verlassen, Fokusverlust oder Escape verschwindet sie wieder. Sucheingaben, Scrollen, Zuklappen, Detailnavigation, Kartenaktionen, Themenwechsel und Schliessen des Katalogs beenden die Vorschau ebenfalls. Zwischen Titel und Beschreibung bleibt dieselbe Vorschau aktiv; Informationslink und Kartenaktionsbutton gehören nicht zur Hover-Fläche. Touch-Taps auf den Titel öffnen weiterhin die Details. Bereits sichtbare Ebenen erhalten keine zusätzliche Vorschau; ausgeblendete Ebenen behalten ihren gespeicherten Zustand.

„Layergruppe“ kennzeichnet deklarierte Gruppen und nach der Definitionsauflösung erkannte Gruppen. Diese erhalten keine Vorschau. Der Hinweis ist per Hover, Fokus oder Antippen der Kennzeichnung erreichbar und verwendet die QWC-Tooltip-Farben. Escape schliesst ihn.

Vorschau und Hinzufügen teilen sich den Definitionscache und laufende Anfragen pro Thema. Der Vorschau-Layer besitzt eine reservierte ID und Quellen-ID sowie `LayerRole.SELECTION`. Dadurch bleibt er ausserhalb von Layerbaum, dauerhafter Layerauswahl und URL. Externe Einzel-Layer werden direkt über die QWC-Hilfen vervollständigt, weil die Extraktion über `externalLayerMap` für diese temporäre Rolle nicht greift. Veraltete Antworten dürfen die aktuelle Vorschau weder anzeigen noch entfernen. Hover-Fehler werden still verworfen.

## Aufbau für die Weiterentwicklung

- `frontend/js/plugins/Kartenkatalog.jsx`: React-Oberfläche mit QWC `SideBar`, `InputContainer`, `Icon`, `Spinner` und QWC-Buttons. Die Datenquelle ist über die Plugin-Option `catalogUrl` konfigurierbar.
- `frontend/js/plugins/kartenkatalog/`: Katalogindex/Suche, zustandsabhängige Layerauflösung und der schmale QWC-Adapter. Suche und Duplikatbehandlung lassen sich ohne Browser testen.
- `frontend/server/remote.cjs`: gemeinsame Proxy-/Konfigurationsanpassung; `frontend/dev/remote.cjs` ist der Kompatibilitätseinstieg für Webpack. Die Registrierung der React-Komponente selbst erfolgt wie bei den anderen Plugins in `js/appConfig.js`.

### Weshalb addThemeSublayer?

QWC 2026.0.30 wertet `externalLayerMap` in `plugins/Map.js` nur für `LayerRole.THEME` aus. Ein unabhängiger USERLAYER aus `ThemeUtils.createThemeLayer` würde eingebundene Fremddienste innerhalb einer Solothurn-Layergruppe nicht korrekt rendern. Daher verwendet dieses Plugin denselben Weg wie die vorhandene Solothurn-Volltextsuche:

1. Vorhandene Definition im aktuellen Thema suchen oder über `themeLayerRestorer` aus dem Live-Datenprodukt-Service laden.
2. Tatsächlich vorhandene WMS-Ebenen und deren Unterpfade im Redux-State abgleichen, auch nach einem asynchronen Aufruf erneut.
3. Unsichtbare Treffer mit `changeLayerProperty(..., 'visibility', true, path, 'both')` aktivieren.
4. Fehlende Definitionen mit `addThemeSublayer` übernehmen. QWC extrahiert dabei seine konfigurierten externen Dienste und aktualisiert LayerTree, WMS-Parameter und URL.

Die bestehende Konfiguration erlaubt das Entfernen und Umordnen dieser Theme-Sublayer. Das Plugin implementiert keine zweite Ebenenverwaltung und erfindet keine externen Service-URLs. Transparenzen, Gruppenstruktur und Reihenfolge stammen aus den aktuellen QWC-Definitionen; historische Katalogwerte überschreiben diese nicht. Ein Themenwechsel während des Ladens verwirft das veraltete Ergebnis.

## Verwendung ausserhalb des Live-Dev-Modus

Die Komponente ist im Build registriert, wird aber nur über die Viewer-Konfiguration aktiviert. Dafür in der passenden Desktop-/Mobile-Pluginliste ergänzen:

```json
{"name":"Kartenkatalog","cfg":{"catalogUrl":"/catalog-api/v1/catalog","width":"32em"}}
```

Im TopBar-Menü wird ein Eintrag `{"key":"Kartenkatalog","icon":"catalog"}` ergänzt. Der Datenpfad benötigt ausserhalb des Dev-Servers eine entsprechende Server-/Proxy-Konfiguration. Die Bedienoberfläche einschliesslich Menü, Tooltips, barrierefreier Beschriftungen und Fehlermeldungen ist für `de-CH` und `en-US` übersetzt. Die Sprache folgt der QWC-Auswahl, beispielsweise `?lang=en-US`; Deutsch bleibt die Rückfallsprache. Fachliche Inhalte der API wie Titel, Beschreibungen und Organisationsnamen bleiben in ihrer gelieferten Sprache.

## Übersetzungen ergänzen

Wie die bestehenden QWC-Plugins verwendet der Kartenkatalog `LocaleUtils.tr(...)` aus `qwc2/utils/LocaleUtils`. Der Fenstertitel nutzt `appmenu.items.Kartenkatalog`; weitere Texte liegen unter `kartenkatalog.*` in den bestehenden Dateien `frontend/static/translations/de-CH.json` und `en-US.json`. Dynamische Werte werden mit QWC-Platzhaltern `{0}`, `{1}` usw. eingesetzt; Ergebniszahlen verwenden übersetzte Singular-/Pluralbezeichnungen.

`npm --prefix frontend run tsupdate` sammelt literale `LocaleUtils.tr(...)`-/`trmsg(...)`-Aufrufe aus `.js` und `.jsx` und aktualisiert `tsconfig.json`. Die reinen `.mjs`-Module geben deshalb stabile Fehlercodes zurück; die Übersetzung erfolgt erst beim Rendern im Plugin. React speichert Fehlercodes statt übersetzter Meldungen, damit bei einer Sprachänderung auch bestehende Fehler neu übersetzt werden. Unbekannte Fehler zeigen eine allgemeine übersetzte Meldung.

Bei neuen Texten literale Übersetzungsschlüssel verwenden, beide Sprachdateien ausfüllen und `tsupdate` erneut ausführen. Der vorhandene QWC-Fallback bleibt unverändert; eine zusätzliche Übersetzungsbibliothek ist nicht erforderlich.

## Prüfung

`npm test` prüft vollständige deutsche/englische Plugin-Übersetzungen, Platzhalter, Fehlercodes und das Fehlen fest eingebauter UI-Texte sowie Suche, Datenvalidierung, Duplikate, Gruppen, Sichtbarkeit/Elternpfade, Entfernen/erneutes Hinzufügen, konkurrierende Aufrufe, veraltete Antworten nach Themenwechseln sowie die eingeschränkten Proxy-Routen. `npm run lint:catalog` prüft die neuen React-/Adapterdateien mit der vorhandenen ESLint-Konfiguration.


Am 30.10.2026 geprüft: 23 Tests erfolgreich, Plugin-Lint und Webpack-Dev-Build erfolgreich. Im Browser wurden Einzel-Layer, Metadaten, Layergruppen einschliesslich konfigurierter Fremddienste, native Layerverwaltung, Sichtbarkeitsänderungen, Entfernen/erneutes Hinzufügen und Wiederherstellen über QWC-URLs geprüft. Ein nicht erreichbares Katalog-Backend wurde mit einer anderen lokalen Proxy-Adresse simuliert; Fehlermeldung und Wiederanlauf sind geprüft. Die kompakte Darstellung wurde auch bei einer schmalen Browseransicht kontrolliert.
