# Upstream

Quelle: https://github.com/qwc-services/sogis-qwc2-app/tree/2026-lts

Übernommener Commit: `6c514330f7e99fc0b7a7b0c392738f688a3f2dd4`.
QWC-Abhängigkeit: `qwc2-lts` **2026.0.30**, Installation mit dem übernommenen `frontend/package-lock.json`.
Die BSD-Lizenz und Copyright-Hinweise bleiben in `frontend/LICENSE` und den Quelldateien erhalten. Die MIT-Lizenz im Repo-Root gilt für die eigenen Ergänzungen.

## Lokale Anpassungen

- Webpack: Remote-Flag, `/map/`-Basis, vorgeschaltete Dev-Middleware.
- App-Bootstrap: anonymer Start nur im Remote-Modus.
- HTML: Analytics nur ausserhalb des Remote-Modus.
- npm: zusätzlicher Remote-Start und Tests; Root-Befehle delegieren ins Frontend.
- `dev/`: öffentliche Live-Anbindung, lokaler Katalog-Proxy, Konfigurationsadapter und Tests.
- Eigenes Kartenkatalog-Plugin mit nativen QWC-Komponenten und dessen Build-Time-Registrierung.

## Bewusstes Update

1. Gewünschten Upstream-Commit festlegen und separat auschecken.
2. Änderungen seit dem oben genannten Commit vergleichen und unter `frontend/` übernehmen. Lokale Anpassungen gezielt erhalten; keine generierten Dateien übernehmen.
3. Upstream-Lockfile bei Dependency-Änderungen mitführen, dann `npm run setup` ausführen.
4. `npm test`, Remote-Start und Browser-Prüfung ausführen: Karte, Suche, Layer hinzufügen/entfernen/erneut laden, Feature-Info und Legende.
5. Commit und QWC-Version in diesem Dokument aktualisieren.

Es gibt keinen automatischen Upstream-Pull. Root und Frontend sind keine npm-Workspaces; das Frontend besitzt sein eigenes Lockfile.
