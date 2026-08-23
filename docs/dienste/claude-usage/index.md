---
title: Claude Usage
description: Dashboard für die Usage-Limiten der drei Claude-Konten mit Reset-Countdown, Wochenfenster-Pings und ntfy-Meldungen
tags:
  - service
  - dashboard
  - nomad
  - claude
---

# Claude Usage

Claude Usage zeigt auf einer Seite, wie weit die Limiten der drei Claude-Konten ausgeschöpft sind -- je Konto das 5-Stunden-Fenster der laufenden Session, das Wochenfenster und das separate Wochenfenster für Fable -- und wann das jeweilige Fenster wieder zurücksetzt. Damit beantwortet die Seite die Planungsfrage, welches Konto gerade arbeitsfähig ist und wie lange ein blockiertes Konto noch blockiert bleibt. Dazu kommt je Konto der gebuchte Tarif (siehe [Abo-Übersicht](#abo-uebersicht)). Technisch ist es ein Nomad-Job mit zwei Tasks nach dem [Homelab-App-Standard](../../_querschnitt/app-standard/index.md): eine statische nginx-Seite und ein Poller, der die Zahlen im Cluster selbst beschafft. Der Poller pingt zusätzlich jedes Wochenfenster direkt nach dem Reset an und meldet über [ntfy](../ntfy/index.md), wenn ein fast volles Limit wieder frei ist.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [claude.ackermannprivat.ch](https://claude.ackermannprivat.ch) (nur intern und VPN) |
| Deployment | Nomad Job `services/claude-usage.nomad`, Images aus [github.com/derever-labs/claude-usage](https://github.com/derever-labs/claude-usage) |
| Storage | Keins -- `usage.json` liegt ephemer im Alloc-Verzeichnis, die Konto-Credentials persistent in Vault |
| Auth | Seite: `intern-auth@file` (Authentik, Gruppe `admin`) plus ClientIP-Allowlist; `/usage.json`: `intern-api@file` ohne Authentik |
| Secrets | Vault `kv/claude-usage` (ntfy-Token) und `kv/claude-usage/creds/*` (OAuth-Credentials, der Poller schreibt Rotationen zurück) |

## Rolle im Stack

Der Dienst ist Anzeige plus Kontingent-Pflege: Er hält keine Historie und hängt an keiner Datenbank. Bis August 2026 lief der Poller auf Samuels Mac (Token im macOS-Keychain, Push per HTTPS PUT), mit dem strukturellen Nachteil, dass ein schlafender Mac eingefrorene Zahlen, ausbleibende Token-Erneuerungen und verpasste Resets bedeutete. Seit dem Umzug in den Cluster laufen Abfrage, Token-Erneuerung, Wochenfenster-Pings und Meldungen rund um die Uhr. Der bewusste Preis dafür: Die OAuth-Credentials der Konten liegen jetzt in Vault statt im Keychain -- zur Laufzeit ausschliesslich im tmpfs der Task, nie auf einer Platte.

Der Einstieg läuft über die Kachel auf dem internen Portal [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) in der Gruppe Monitoring (siehe [Dashboards](../dashboards/index.md)).

## Datenfluss

**Leitfrage:** Wie kommen die Zahlen der drei Konten auf die Seite, und wohin fliessen Credentials und Meldungen?

Lese-Konvention: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Ocker kodiert den Poller-Weg, Blau den Seiten-Weg des Browsers.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  push: { style: { stroke: "#b45309"; font-color: "#b45309" } }
  seite: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
}

direction: right

anthropic: "Anthropic Usage-Endpunkt" {
  class: node
  tooltip: "Interner, undokumentierter Endpunkt -- dieselbe Quelle, aus der Claude Code seine eigene Limiten-Anzeige speist"
}

vault: Vault {
  class: node
  tooltip: "Persistente Ablage der Konto-Credentials; der Poller liest sie beim Start und schreibt Rotationen sofort zurück"
}

ntfy: ntfy {
  class: node
  tooltip: "Meldung, wenn ein fast volles Limit wieder frei ist -- Topic claude, write-only-Token"
}

browser: Browser { class: node }

traefik: Traefik {
  class: container

  rseite: "Seiten-Router" {
    class: node
    tooltip: "Host-Regel plus ClientIP-Allowlist, Chain intern-auth -- Authentik mit Gruppe admin"
  }
  rdata: "Daten-Router /usage.json" {
    class: node
    tooltip: "Pfad-Router mit hoher expliziter Priorität, Chain intern-api -- bewusst ohne Authentik"
  }
}

app: "claude-usage (Nomad-Group)" {
  class: container

  poller: "Poller-Task" {
    class: node
    tooltip: "Alle 5 Minuten: Limiten abfragen, Token via Claude-CLI erneuern, Wochenfenster anpingen"
  }
  html: "nginx (Seite)" { class: node }
  data: "/alloc/data/usage.json" {
    shape: cylinder
    class: node
    tooltip: "Geteiltes Alloc-Verzeichnis der Group -- ephemer, der nächste Poller-Zyklus füllt es nach"
  }
}

vault -> app.poller: "1 Credentials beim Start" { class: push }
app.poller -> anthropic: "2 Limiten je Konto abfragen" { class: push }
app.poller -> app.data: "3 usage.json schreiben" { class: push }
app.poller -> vault: "4 rotierte Credentials zurück" { class: push }
app.poller -> ntfy: "5 Limit wieder frei" { class: push }
browser -> traefik.rseite: "6 Seite anfordern" { class: seite }
traefik.rseite -> app.html: "7 HTML und JS ausliefern" { class: seite }
browser -> traefik.rdata: "8 usage.json lesen" { class: seite }
```

1. Beim Start stellt der Poller die Credentials-Dateien der drei Konten aus Vault im tmpfs her (siehe [Credentials in Vault](#credentials-in-vault)).
2. Alle fünf Minuten fragt er damit den Anthropic-Usage-Endpunkt ab (siehe [Datenquelle](#datenquelle)).
3. Das Ergebnis schreibt er als `usage.json` ins geteilte Alloc-Verzeichnis, aus dem nginx sie ausliefert.
4. Erneuert die Claude-CLI ein Token, geht der neue Stand sofort zurück nach Vault.
5. War ein Limit fast voll und sein Reset ist vorbei, meldet der Poller das über ntfy (siehe [Pings und Meldungen](#pings-und-meldungen)).
6. Der Browser holt die Seite über den Seiten-Router, der Authentik und die IP-Allowlist vorschaltet.
7. Ausgeliefert wird statisches HTML mit JavaScript; die Aufbereitung der Zahlen passiert im Browser.
8. Die Daten selbst holt das JavaScript über den zweiten Router ohne Authentik (siehe [Zwei Router auf einem Service](#zwei-router-auf-einem-service)).

**Belegt gegen** `services/claude-usage.nomad` im Repo `homelab-nomad-jobs`, Stand 17.08.2026.

## Datenquelle

::: warning Undokumentierter interner Endpunkt
Die Zahlen stammen aus einem internen, nicht dokumentierten Endpunkt von Anthropic -- demselben, den Claude Code für die eigene Limiten-Anzeige nutzt. Er kann sich jederzeit ändern oder wegfallen, ohne Vorwarnung und ohne Migrationspfad. Der Schaden bleibt dabei auf die Anzeige begrenzt: Kein anderer Dienst hängt an diesen Daten, und kein Arbeitsablauf bricht, wenn die Seite leer bleibt.
:::

Fällt der Poller aus, frieren die Prozentwerte auf dem Stand des letzten Laufs ein. Die Seite verschweigt das nicht, sondern blendet ein Staleness-Banner mit dem Alter der Daten ein. Die Reset-Countdowns bleiben in diesem Zustand korrekt, weil sie aus den mitgelieferten Reset-Zeitpunkten laufen; ein Fenster, dessen Reset bereits in der Vergangenheit liegt, leitet die Seite clientseitig als wieder frei ab.

## Credentials in Vault {#credentials-in-vault}

Der Usage-Endpunkt verlangt vollwertige Claude-Code-Logins, ein reiner Inference-Token genügt nicht. Pro Konto liegt deshalb ein kompletter Login-Stand unter `kv/claude-usage/creds/<konto>`. Vault ist die einzige persistente Ablage: Die Task stellt die Dateien beim Start im tmpfs her, ein Volume gibt es nicht. Rotationen laufen in die Gegenrichtung sofort zurück -- dafür trägt die Workload-Policy eine explizite Schreib-Ausnahme auf genau diesen Unterpfad (`nomad-workload.hcl` im Repo `homelab-hashicorp-stack`).

::: warning Eigenes tmpfs, nicht das Secrets-Verzeichnis
Die Konfigurationsverzeichnisse liegen in einem eigenen 64-MB-tmpfs-Mount. Das Secrets-Verzeichnis von Nomad taugt dafür nicht: Sein tmpfs ist fest 1 MB gross, die Claude-CLI schreibt neben den Zugangsdaten aber auch Transcripts und Caches dorthin. Bei vollem tmpfs meldet die CLI einen erfolgreichen Login, kann ihn aber nicht speichern, und ein serverseitig bereits rotierter Token geht dabei verloren. Genau so verlor der Dienst am 18. und 20. August 2026 zweimal einen gültigen Login. Der Poller räumt die CLI-Artefakte seither in jedem Zyklus ab, und ein geleerter Credential-Stand wird nie nach Vault gespiegelt, dort bleibt immer der letzte echte Login.
:::

Eingerichtet oder erneuert wird ein Login interaktiv im Poller-Container, der Befehl steht im README des App-Repos. Der Login läuft über den Browser: Dort muss vorher das richtige Konto angemeldet sein, sonst übernimmt die CLI kommentarlos das falsche. Geht ein rotierter Stand verloren, etwa durch einen Absturz zwischen Rotation und Rückschreiben, heisst das für dieses Konto: neu einloggen. Mehr Schaden entsteht nicht.

## Abo-Übersicht {#abo-uebersicht}

Jede Karte nennt den gebuchten Tarif, also Max 20x oder Pro. Weicht der Abo-Status davon ab, etwa weil eine Kündigung vorgemerkt ist, erscheint er als Tag daneben. Beides liefert derselbe OAuth-Zugang wie die Limiten über einen zweiten Endpunkt.

::: warning Kein Verlängerungstermin auf der Seite
Der Termin fehlt bewusst. Anthropic gibt ihn über die Schnittstelle nicht heraus, die Abrechnungsdaten verlangen eine Web-Session. Ihn aus dem Abo-Beginn zu rechnen, führt in die Irre: Der Abrechnungstag verschiebt sich beim Tarifwechsel, beim Konto HSLU DC etwa vom 2. auf den 9. des Monats. Eine erfundene Kündigungsfrist ist gefährlicher als gar keine, weil sie in falscher Sicherheit wiegt. Wer den Termin braucht, liest ihn in den Abo-Einstellungen von Claude nach. Ebenfalls unsichtbar bleibt ein bereits gebuchter Tarifwechsel, der gemeldete Status lautet auch dann aktiv.
:::

## Pings und Meldungen {#pings-und-meldungen}

Die Wochenfenster der Konten starten erst mit der ersten Anfrage nach einem Reset. Liegt ein Konto brach, verschiebt sich damit auch der nächste Reset nach hinten -- ungünstig für Konten, die als Überlauf-Kapazität dienen und oft genau dann gebraucht werden, wenn sie eben noch voll waren. Der Poller erkennt ein abgelaufenes, noch nicht neu gestartetes Wochenfenster daran, dass dessen Reset-Zeitpunkt in der Vergangenheit liegt, und feuert dann einen minimalen Prompt: bei Max-Konten gegen Fable, damit beide Wochenfenster gleichzeitig starten, bei Pro gegen das Standard-Modell. Ungenutztes Kontingent verfällt ohnehin, ein früher Fensterstart kostet also nichts und macht das Limit frühestmöglich wieder frei.

Auf denselben Reset-Zeitpunkten sitzen die Meldungen: War ein Limit beim letzten Lauf zu mindestens 80 Prozent gefüllt und sein Reset wurde seither überschritten, schickt der Poller eine "wieder frei"-Meldung an das ntfy-Topic `claude` (write-only-Token aus Vault). Unterhalb der Schwelle bleibt es still, sonst würde jedes ablaufende 5-Stunden-Fenster eine Nachricht erzeugen.

## Zwei Router auf einem Service

Ein Consul-Service, zwei Traefik-Router: Die Seite läuft wie das interne Portal hinter `intern-auth@file`, `/usage.json` dagegen hinter `intern-api@file` ganz ohne Authentik. Der Grund sind Konsumenten ohne Browser -- ein Monitoring-Check oder ein Skript kann keinen Authentik-Redirect durchlaufen. Schreiben lässt sich über diesen Weg nichts mehr, nginx liefert die Datei nur aus. Beide Router tragen zusätzlich die ClientIP-Allowlist, der Dienst ist also weder für die Seite noch für die Daten von aussen erreichbar. Details zu den Ketten: [Traefik Referenz](../../edge/traefik/referenz.md).

::: warning Der Pfad-Router braucht eine explizite Priorität
Ohne gesetzte Priorität sortiert Traefik nach Regel-Länge. Die lange Host- und ClientIP-Regel des Seiten-Routers schlug damit den kürzeren Pfad-Router, und `/usage.json` landete im Authentik-Zweig. Der Daten-Router trägt deshalb eine explizit gesetzte, deutlich höhere Priorität als jede implizite Regel-Länge erreichen kann.
:::

## Token-Erneuerung

Die Zugangstoken der Konten laufen nach acht Stunden ab. Erneuert werden sie nicht vom Poller selbst, sondern von der Claude-CLI im Poller-Container: Läuft ein Token bald ab, startet der Poller die CLI kurz mit dem Konfigurationsverzeichnis des betroffenen Kontos, die CLI erneuert den Token und schreibt die Credentials-Datei neu, der Poller sichert sie nach Vault.

::: warning Den Refresh nicht nachbauen
Der Poller sprach den Token-Endpunkt anfangs selbst an. Das funktioniert nicht: Der Endpunkt weist jeden fremden Client ab, unabhängig vom verwendeten Werkzeug und sogar bei einem ungültigen Token, also noch bevor er ihn prüft. Weil die Absage wie eine vorübergehende Drosselung aussieht, wiederholte der Poller sie im Fünf-Minuten-Takt und hielt die Sperre damit dauerhaft offen. Am 10. August 2026 lieferten deshalb zwei Konten fünf Stunden lang keine Zahlen. Seither gilt: Erneuern lassen statt nachbauen, und jeder erfolglose Versuch sperrt den nächsten mit wachsendem Abstand.
:::

Scheitert auch das, zeigt die Karte "Re-Login nötig" samt Befehl. Der Login läuft interaktiv im Container, siehe [Credentials in Vault](#credentials-in-vault).

::: info SSOT im App-Repo
Poller-Mechanik, Konto-Zuordnung, Ping- und Melde-Logik und der Aufbau von `usage.json` werden im README von [derever-labs/claude-usage](https://github.com/derever-labs/claude-usage) gepflegt und hier nicht dupliziert.
:::

## Verwandte Seiten

- [Dashboards](../dashboards/index.md) -- internes Portal mit der Kachel zu diesem Dienst
- [ntfy](../ntfy/index.md) -- Push-Kanal der "wieder frei"-Meldungen
- [Traefik Referenz](../../edge/traefik/referenz.md) -- Middleware-Ketten `intern-auth` und `intern-api`
- [Authentik](../../edge/authentik/index.md) -- SSO vor der Seite (Gruppe `admin`)
- [Vault](../../plattform/vault/index.md) -- Credentials-Ablage und Workload Identity
- [Homelab App-Standard](../../_querschnitt/app-standard/index.md) -- Build- und Deploy-Muster des Dienstes
- [github.com/derever-labs/claude-usage](https://github.com/derever-labs/claude-usage) -- App-Repo mit README
