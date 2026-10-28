# Nachrichten-Ticker

Private News-Ticker-App: wichtigste Nachrichten eines Landes (JP, DE, US, UK) je Kategorie, auf Deutsch im Ticker-Stil.
Node.js/TypeScript-Backend (Fastify, SQLite, Claude) + React-Web-App, ausgeliefert vom selben Server. Die API ist client-unabhängig (spätere iOS-App).

```
server/   Fastify-API, Feed-Abruf, Merge, LLM, SQLite, Seed (server/seed/sources.json)
web/      Vite + React (iOS-Look, Dark Mode)
shared/   Zod-Schemas und Typen der API
```

## Lokal entwickeln

```bash
npm install
cp .env.example .env          # API_TOKEN und ANTHROPIC_API_KEY eintragen
npm run dev:server            # API auf :3000
npm run dev:web               # Web-App auf :5173 (Proxy auf :3000)
npm test                      # Vitest (LLM und Netzwerk gemockt)
npm run validate-feeds        # alle Seed-Feeds abrufen und Bericht ausgeben
```

## Deployment auf dem Hostinger-VPS

1. **DNS:** Lege bei deinem Domain-Anbieter einen A-Record (`ticker.deinedomain.de`) auf die IP des VPS an. Ports 80 und 443 müssen offen sein (Caddy braucht beide für Let's Encrypt).
2. **Code auf den VPS:** per SSH `git clone <dein-repo> news-ticker && cd news-ticker` (oder Ordner hochladen). Im Hostinger-Docker-Manager kannst du alternativ „Compose aus URL" mit der Git-URL des Repos nutzen; die Compose-Datei baut das Image selbst (`build: .`), daher wird der ganze Projektordner benötigt.
3. **`.env` anlegen:**
   ```bash
   cp .env.example .env
   openssl rand -hex 32        # Ausgabe als API_TOKEN eintragen
   nano .env                   # DOMAIN, API_TOKEN, ANTHROPIC_API_KEY setzen
   ```
4. **Starten:**
   ```bash
   docker compose up -d --build
   ```
5. **Prüfen:**
   ```bash
   docker compose ps
   docker compose logs -f app caddy
   curl https://ticker.deinedomain.de/healthz      # -> ok
   ```
6. **Einrichten:** `https://DOMAIN` im Browser öffnen, Token eintragen (Server-URL leer lassen), fertig. Das Token wird nur im Browser (localStorage) gespeichert.

### Update einspielen

```bash
git pull
docker compose up -d --build
```

Die SQLite-Datei liegt im Volume `data` und bleibt erhalten. Neue Quellen aus `sources.json` werden bei bestehender Datenbank nicht automatisch importiert (bereits angelegte Quellen und deine Einstellungen bleiben unberührt); zum Neuanlegen das Volume löschen: `docker compose down -v` (verliert Einstellungen und Cache).

### Sicherheit

- Alle `/api/*`-Endpunkte erfordern `Authorization: Bearer <API_TOKEN>` (Vergleich per `timingSafeEqual`), sonst 401 ohne Details. Nur `/healthz` ist offen.
- HTTPS-only über Caddy (HTTP leitet um), Helmet-Header, Rate-Limit pro IP, Tageslimit für LLM-Aufrufe (`LLM_MAX_CALLS_PER_DAY`).
- Der Anthropic-Key bleibt serverseitig. Der Server ruft nur Feed-URLs aus der Quellen-Datenbank und Artikel-Links aus diesen Feeds ab (private/interne Adressen werden blockiert).

## API (für spätere Clients)

| Endpunkt | Zweck |
|---|---|
| `GET /healthz` | `ok`, ohne Auth |
| `GET /api/meta` | Länder, Kategorien, Icon-Keys |
| `GET/PUT /api/settings` | Einstellungen (3 Länder, Anzahl, Zusammenfassung, Quellen-Reihenfolge/-Schalter) |
| `GET /api/sources?country=jp` | Quellen inkl. Status der letzten Feed-Prüfung |
| `GET /api/ticker?country=jp&category=business[&refresh=1]` | Ticker-Liste (Cache `CACHE_TTL_MINUTES`) |
| `GET /api/ticker/:itemId/detail` | Zusammenfassung (lazy, gecacht) |

Typen und Zod-Schemas: `shared/src/index.ts`.

Die Auswahl der Meldungen folgt der Redaktionsreihenfolge (Reißverschluss über die Quellen), die Anzeige ist chronologisch (neueste zuerst); „Top" markiert Platz 1 einer Quelle.

## Hinweise zu Quellen

`npm run validate-feeds` bewertet jeden Seed-Feed. Stand der Prüfung (28.10.2026): 101 von 102 URLs erreichbar und parsebar. Bekannte Probleme:

- **Yahoo! News Japan** liefert von außerhalb Japans `403` (Geo-/Bot-Sperre). Standardmäßig aus; je nach VPS-Standort funktioniert es evtl. – der Status-Punkt in den Einstellungen zeigt es.
- **NYT Sport** (`Sports.xml`) ist zwar erreichbar, aber leer und wurde aus dem Seed entfernt (NYT erscheint unter „Sport" nicht).
- NHK: neue Domain `news.web.nhk` funktioniert, alte Domain bleibt als Fallback.

Der Server prüft alle Feeds täglich und speichert den Status (grün = ok, gelb = Teilausfall/leer, rot = Totalausfall). Defekte Feeds werden nur markiert.

## Artikel-Vorabruf

Beim Abruf der Liste holt der Server die Artikel parallel (max. `PREFETCH_BUDGET_MS`, Default 12 s) und lässt das LLM im selben Batch-Aufruf Überschrift, Teaser **und** Detail-Zusammenfassung erzeugen. „Mehr" öffnet dann sofort aus dem Cache. Artikel, die nicht abrufbar sind (Paywall o. ä.), werden erst bei „Mehr" als Kurzfassung nachgeladen. Mit `PREFETCH_DETAILS=0` entfällt der Vorabruf (schnellere, billigere Liste; Details erst bei „Mehr").

## Geplante Erweiterungen

Duplikat-Erkennung: `server/src/merge.ts` enthält den Hook `DedupeStep`, der in `ticker.ts` zwischen Merge und LLM-Aufruf läuft.
