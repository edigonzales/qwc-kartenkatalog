# XTF-Datenstand und Metadatenanreicherung

Die Basis ist der am 29.10.2026 gelieferte, unvollständige Harvest im Modell `SO_AGI_Kartenkatalog_Publikation_20251210` (INTERLIS XTF 2.4): 169 Themen und 886 Ebenen.

Am 03.11.2026 wurden Organisationen, Datenherren und Kontakte ergänzt. Basis-SHA-256: `de40f025368ae6fc70f5858ab42592488bca837c6942cb6ff8759e6c8803de86`. Aktuelle SHA-256: `9590ddc6c6b3f4cbcc228782f98b96f7437a1d1f22526ce18524a9b94a9e203e`.

## Zuordnung und Quellen

- 465 Ebenen übernehmen die Organisation aus exakten `p_ident_part`/`c_ident_part`-Treffern der historischen `kartenkatalog.xtf` (Modell `SO_AGI_Kartenkatalog_20250311`). SHA-256 der historischen Datei: `9777d5561de03530f3082826bee25f1f6c62ab06aaa9b717ca9c326741f233e2`. Die historische Datei ist eine lokale Eingabe und wird nicht mit dem Image verteilt.
- 421 weitere Ebenen haben explizite Zuordnungen im [Manifest](https://github.com/edigonzales/kartenkatalog/blob/main/data/metadata/organizations.json). Die Organisation bezeichnet bei historischen Treffern die damals erfasste lokale Zuständigkeit, bei ergänzten externen Produkten den Herausgeber. Das ist keine Aussage über Urheber- oder Nutzungsrechte. Kennungsfamilien waren Recherchehinweise; die Anwendung verwendet keinerlei Präfix-Fallback.
- `Kantonsarchäologie` und `Amt für Denkmalschutz und Archäologie` sind dem heutigen Amt für Denkmalpflege und Archäologie zugeordnet; `Abteilung Wasserbau, Hydrometrie` dem Amt für Umwelt. Migrationsplatzhalter werden nicht übernommen.
- 166 Themen haben Datenherr und eine verifizierte Funktionsadresse. Für Bodeneinheiten, Hoheitsgrenzen und Naturschutzobjekte ist das fachlich zuständige kantonale Amt explizit hinterlegt; enthaltene externe Layer ändern diese Themenzuständigkeit nicht.
- Drei heterogene Sammelthemen bleiben ohne Datenherr/Kontakt: «Geschäfstkontrolle AfU (BauGK)» (enthält im Harvest ausschliesslich drei externe Altlastenkataster), «Nicht zugeordnet (kein Thema im Quelltext)» und «Tigermückenausbreitung» (mehrere Kantone). Ihre Layerorganisationen bleiben vollständig verfügbar. Die problematischen ursprünglichen Themenzuordnungen wurden nicht verändert.
- Kontakte stammen aus den offiziellen Amtsseiten im Manifest (Prüfdatum 03.11.2026). Archäologische Themen verwenden `archaeologie@bd.so.ch`; AMB-Themen die Funktionsadresse der Katastrophenvorsorge `kav@vd.so.ch`. Es werden keine persönlichen oder geratenen Adressen verwendet. Organisationsverzeichniseinträge ohne Themenverantwortung dürfen ohne Kontakt bleiben.

Der [Bericht](https://github.com/edigonzales/kartenkatalog/blob/main/data/metadata/enrichment-report.json) enthält Mengen, Methoden und Sammelthemen. Reproduktion und Prüfung:

```sh
python3 ../kartenkatalog/scripts/enrich-catalog.py --write --legacy /pfad/zur/alten/kartenkatalog.xtf
python3 ../kartenkatalog/scripts/enrich-catalog.py
python3 ../kartenkatalog/scripts/enrich-catalog-tests.py
cp ../kartenkatalog/data/kartenkatalog-harvest-ohne-qml.xtf data/kartenkatalog-harvest-ohne-qml.xtf
```

Ohne `--write` wird nur geprüft. Die Anreicherung ist wiederholbar und erhält alle anderen Bytes, einschliesslich IDs, Beschreibungen und Themenreferenzen. Ein Test prüft den Originalhash nach Entfernen genau der drei ergänzten Metadatenfelder.

## Lokale XTF-Erweiterung und Grenzen

`Thema.contact` ist eine optionale lokale Erweiterung des Publikationsmodells: ein einzelner `mailto:`-URI ohne Header, Queryparameter oder weitere Empfänger. Fehlendes/leeres Feld wird zu JSON `null`. Das externe INTERLIS-Modell liegt nicht in diesem Repository; vollständige Modellkonformität dieser Erweiterung wird nicht behauptet.

Der Transfer bleibt `INCOMPLETE`: ursprüngliche SIMI-IDs und Themenkennungen fehlen; erzeugte UUIDs und `harvest-*` sind keine originalen SIMI-Schlüssel. Themenzuordnungen wurden im ursprünglichen Harvest aus Beschreibungen abgeleitet. Der dort erwähnte Prüfbericht wurde nicht mitgeliefert. QML, Keywords, Synonyme und Permissions fehlen weiterhin. Der Datenstand bleibt eine Entwicklungsgrundlage und wird schreibgeschützt von aussen ins Image eingebunden; ein neues Image allein aktualisiert keine XTF.
