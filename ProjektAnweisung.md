PROJEKTANWEISUNG UND DOKUMENTATION: EXP-PLUGINS (CLOUDFLARE INFRASTRUKTUR)

Diese Dokumentation dient als exakter Leitfaden und Übergabe-Datei für die zukünftige Weiterentwicklung. Sie listet ausschließlich alle tatsächlich im Projekt dauerhaft existierenden Quell- und Konfigurationsdateien auf. Temporäre Dateien, Download-Artefakte oder Cache-Dateien, die während des Betriebs, Downloads oder Synchronisationen im Studio entstehen, werden bewusst nicht aufgeführt.

1. PROJEKTUEBERSICHT UND MIGRATION

Das Projekt ist eine moderne Minecraft-Plugin-Plattform (EXP-Plugins).
- Bisheriger Stand: Migration von Supabase auf eine performante Cloudflare-Infrastruktur (D1 für strukturierte Daten, R2 für Binärdateien und Bilder, Workers für Backend-Logik und Auth).
- Admin-Dashboard: Exklusiv eingerichtet und geschützt für den Account bent.diedrich08@gmail.com.

2. ADMIN-KONFIGURATION UND SICHERHEIT

- Administrator E-Mail: bent.diedrich08@gmail.com
- Sichtbarkeit: Der Dashboard-Button erscheint im Benutzerprofil nur für diesen Account.
- Sicherheit: Serverseitige Validierung der Admin-Berechtigung.

3. VOLLSTAENDIGE LISTE DER DAUERHAFTEN PROJEKTDATEIEN

3.1 Root-Dateien
- package.json: Definiert npm-Skripte und Projektabhängigkeiten.
- tsconfig.json: TypeScript-Compilerkonfiguration.
- vite.config.ts: Vite Build-Bundler und Entwicklungsserver-Konfiguration.
- index.html: HTML-Einstiegspunkt der Single Page Application.
- .env.example: Vorlage für Umgebungsvariablen und Cloudflare-Konfiguration.
- .gitignore: Ausschlussregeln für Git.
- .npmrc: NPM-Konfiguration.
- ProjektAnweisung.md: Diese zentrale Dokumentations- und Übergabedatei.

3.2 Verzeichnis src/
- src/main.tsx: React DOM Render-Einstiegspunkt.
- src/index.css: Globale Styles und Tailwind CSS Einbindung.
- src/App.tsx: Hauptkomponente und Routing-Logik der Anwendung.
- src/vite-env.d.ts: Vite TypeScript Typdefinitionen.

3.3 Verzeichnis src/components/
- src/components/common/CustomDropdown.tsx: Wiederverwendbare Dropdown-Komponente.
- src/components/common/ErrorBoundary.tsx: Fehlerbehandlungs-Komponente für React.
- src/components/common/LoaderIcon.tsx: Lade-Animations-Icon.
- src/components/common/UserBadge.tsx: Benutzer-Anzeige-Badge.

3.4 Verzeichnis src/components/layout/
- src/components/layout/Navbar.tsx: Navigation und Header der Website.
- src/components/layout/Footer.tsx: Footer am Seitenende.

3.5 Verzeichnis src/components/modals/
- src/components/modals/DownloadSelectionModal.tsx: Modal zur Auswahl von Plugin-Versionen und Mod-Loadern beim Download.

3.6 Verzeichnis src/components/plugins/
- src/components/plugins/FilterSidebar.tsx: Seitenleiste zum Filtern von Plugins nach Kategorien und Mod-Loadern.
- src/components/plugins/PluginCard.tsx: Kachelansicht für einzelne Plugins.
- src/components/plugins/PluginListRow.tsx: Listenansicht für einzelne Plugins.

3.7 Verzeichnis src/components/views/
- src/components/views/AuthViews.tsx: Ansichten für Login und Registrierung.
- src/components/views/BrowseView.tsx: Such- und Katalogseite für Plugins.
- src/components/views/FavoritesView.tsx: Ansicht für favorisierte Plugins.
- src/components/views/HomeView.tsx: Startseite der Plattform.
- src/components/views/ImpressumView.tsx: Impressum und rechtliche Hinweise.
- src/components/views/PluginDetailView.tsx: Detailseite eines Plugins mit Versionen und Beschreibung.
- src/components/views/ProfileViews.tsx: Benutzerprofil und Admin-Dashboard-Integration (für bent.diedrich08@gmail.com).

3.8 Verzeichnis src/config/
- src/config/securityConfig.ts: Sicherheitskonfigurationen.
- src/config/supabase.ts: Legacy-Konfigurationsdatei (wird im Zuge der Cloudflare-Umstellung abgelöst).

3.9 Verzeichnis src/context/
- src/context/AppContext.tsx: Zentraler React Context für State, Authentifizierung und Plugin-Operationen.

3.10 Verzeichnis src/data/
- src/data/mockPlugins.ts: Beispieldaten für Plugins.
- src/data/translations.ts: Texte und Übersetzungen.

3.11 Verzeichnis src/lib/
- src/lib/storage.ts: Speicher- und Hilfsfunktionen.
- src/lib/supabaseSync.ts: Datensynchronisations-Hilfen.
- src/lib/webhookNotifier.ts: Benachrichtigungsfunktionen.

3.12 Verzeichnis src/types/
- src/types/index.ts: TypeScript-Typdefinitionen (Plugins, Versionen, Nutzer).

3.13 Verzeichnis src/assets/
- src/assets/EXP-LOGO.png: Logo der Plattform.

4. CLOUDFLARE EINRICHTUNG (NAECHSTE SCHRITTE)

- Cloudflare D1 für strukturierte Datenbankdaten einrichten.
- Cloudflare R2 für Plugin-Dateien und Bilder nutzen.
- Cloudflare Workers für Authentifizierung und Admin-Endpunkte implementieren.
