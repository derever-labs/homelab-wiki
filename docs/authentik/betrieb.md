---
title: Authentik Betrieb
description: Recovery-Layer, Breakglass, Alerting-Kette und Rollback-Konzepte
tags:
  - identity
  - authentik
  - betrieb
---

# Authentik Betrieb

Konzepte und Rollback-Strategien für den laufenden Betrieb. Architektur und Referenzdaten stehen in [Authentik (Übersicht)](./index.md) und [Authentik Referenz](./referenz.md).

Diese Seite erklärt die Konzepte hinter den einzelnen Operations -- das Operative übernimmt die Automation. Inline-Code für unverzichtbare Befehle ist erlaubt, isolierte Deployment-Anleitungen gehören ins Repo.

## Übersicht

Authentik läuft als Nomad Job (`identity/authentik.nomad`) mit vier Tasks (server, worker, proxy, ldap). Das Deployment erfolgt über Nomad -- keine manuelle Konfiguration an den VMs nötig.

## Abhängigkeiten

- **PostgreSQL** (`postgres.service.consul`) -- primärer Datenspeicher, muss vor Authentik starten
- **Vault** (`kv/data/authentik`, `kv/data/authentik-outpost`) -- Secret-Store für alle Schlüssel und Tokens
- **Traefik** ([VIP](../_referenz/hosts-und-ips.md)) -- Routing und ForwardAuth; Authentik benötigt Traefik für OIDC Discovery
- **SMTP Relay** (`smtp.service.consul`) -- für Recovery-Mails und Alerting-Fallback

## Automatisierung

- **Backup:** täglicher `pg_dumpall`-Job (03:00 UTC) sichert die Authentik-Datenbank nach NFS
- **Token-Rotation-Warnung:** periodischer Nomad-Batch-Job prüft `rotated_at` im Vault-Metadata; Warnung via Telegram wenn > 80 Tage
- **Alerting:** Authentik-Event-Matchers leiten sicherheitsrelevante Events via Telegram-Relay weiter
- **Group-Binding-Drift-Audit:** periodischer Nomad-Batch-Job prüft täglich, ob alle 45 Apps mindestens eine Group-Binding haben. Alarm via Telegram wenn eine App ohne Binding auftaucht (Schutz gegen "46. App wurde ohne Binding hinzugefügt"-Fall)

## Blueprint-Workflow

Authentik-Gruppen und Group-Bindings liegen deklarativ im Repo unter `authentik-blueprints/`. Der Blueprint-Ansatz ist bewusst gewählt: Änderungen sind reviewbar (PR + CODEOWNERS), nachvollziehbar und atomar -- kein Git-Sync-Sidecar, kein Deploy-Key, kein PAT. Drift wird vom Audit-Job erkannt, aber nicht automatisch korrigiert, damit eine fehlerhafte Binding nicht selbsttätig zurückkehrt.

Beim Rollback (`git revert` → Push → Apply) setzt der Reconciler die Bindings auf den vorherigen Stand zurück. Den vollständigen Änderungs-Workflow (Branch, Validierung, Apply-Mechanik) und die Tier-Zuordnung beschreibt die [Blueprint-Quelle](./referenz.md#blueprint-quelle) in der Referenz.

## Bekannte Einschränkungen

- **Outpost-Cache:** Nach einem Redeployment ist der LDAP-Bind-Cache leer -- der erste Login pro User durchläuft den vollen Flow
- **Cache-Delay:** Änderungen an Flows und Policies werden erst nach bis zu 10 Minuten auf allen Workern wirksam (siehe Performance-Konzept)
- **Login-Rate-Limit:** Automation muss zwischen Iterationen warten (siehe Schutzmechanismen gegen Brute-Force)

## Credentials

Alle Credentials liegen in 1Password und Vault:

- **akadmin:** 1Password "Authentik HOME" (inkl. Live-OTP-Feld)
- **akadmin-breakglass:** 1Password "Authentik Breakglass (akadmin-breakglass)"
- **API-Token:** 1Password "Authentik API Token akadmin"
- **Outpost-Tokens:** Vault `kv/data/authentik-outpost` (`proxy_token`, `ldap_token`)
- **Recovery-URLs:** 1Password "Authentik Recovery Runbook + Breakglass URLs" (zeitlich limitiert)

## Recovery-Layer (Safety Net)

Authentik ist hart abgesichert (MFA-Zwang, Reputation Policy, Password Policy). Das erhöht die Wahrscheinlichkeit, dass man sich selbst aussperrt. Dafür gibt es fünf Recovery-Layer, sortiert von am wenigsten invasiv bis zuletzt verwendbar:

### Layer 1 -- Recovery URLs

Authentik bietet pro User einen One-Shot-Recovery-Link. Der Link loggt den User ohne Passwort und ohne MFA ein und hat eine kurze Lebensdauer (typisch 1 Stunde). Für den Ernstfall werden vor jedem riskanten Schritt (z.B. MFA-Policy-Aktivierung) frische Links generiert und in 1Password abgelegt (Item "Authentik Recovery Runbook + Breakglass URLs").

Die Links sind zeitlich limitiert, daher taugen sie nicht als langfristige Ablage -- das 1Password-Item dokumentiert nur das Verfahren und hält frische URLs kurz verfügbar.

### Layer 2 -- Automation API Token

Der primäre Rückkanal ist der Automation-API-Token in 1Password (Item "Authentik API Token akadmin"). Der Token ist periodic renewed, hat volle Admin-Rechte und funktioniert auch, wenn das Web-UI aus Lockout-Gründen unerreichbar ist. Mit ihm lassen sich Stages, Policies und Bindings beliebig patchen oder löschen -- inklusive des kritischen Stage-Flags `not_configured_action`, das MFA aktiviert oder deaktiviert.

Dieser Layer ist die mit Abstand gängigste Recovery-Option. Alle Hardening-Schritte sind so gebaut, dass sie über den Token rückgängig gemacht werden können, solange er nicht revoked ist.

### Layer 3 -- Nomad alloc exec (Django Shell)

Wenn die API selbst kaputt ist oder der Token revoked wurde, bleibt der direkte Django-Shell-Zugriff im Authentik-Server-Container. Darüber können Datenbank-Objekte (Stages, Policies, User) direkt manipuliert werden. Das ist riskant, aber funktioniert auch, wenn der HTTP-Stack nicht mehr antwortet.

### Layer 4 -- PostgreSQL-Restore

Ein täglicher `pg_dumpall`-Job schreibt um 03:00 UTC einen vollständigen Dump aller Datenbanken nach NFS. Die Authentik-DB kann aus jedem Dump der letzten 7 Tage / 4 Wochen / 3 Monate (GFS-Schema) wiederhergestellt werden. Das ist der sauberste Rollback bei katastrophalen Konfigurationsfehlern -- der Preis ist Datenverlust bis zum letzten Backup.

Details zur Backup-Infrastruktur: [Backup](../backup/index.md).

### Layer 5 -- Re-Bootstrap

Letzte Eskalationsstufe: Die komplette Authentik-Installation wird aus Vault-Secrets (`kv/data/authentik`, `kv/data/authentik-outpost`) und dem Nomad-Job neu aufgebaut. Alle Flows, Policies und Anpassungen müssen danach erneut provisioniert werden. Dieser Layer wird praktisch nie benötigt, solange die Datenbank-Backups funktionieren.

### Rollback Group-Bindings

Für den spezifischen Fall "Group-Binding-Rollout hat Problem verursacht":

- **Einzelne App aussperrt legitime User:** Blueprint-Eintrag entfernen (oder `enabled: false`) → `nomad job run`. Reconciler deaktiviert die Binding; Default ist fail-open (App wieder offen für alle)
- **Gesamtes Tier-Setup kippt:** `git revert` auf den Blueprint-Commit → Push → `nomad job run`
- **Katastrophe (Blueprint blockiert Reconciler):** Baseline-JSON aus `state/authentik-baseline-YYYY-MM-DD.json` heranziehen und via API-Script den vorherigen Zustand wiederherstellen. Die Baseline ist pre-change-Snapshot aller Apps, Providers, Groups, Bindings und Expression-Policies

Verifikation, dass Breakglass funktioniert: Vor jedem riskanten Rollout-Schritt prüfen, dass `akadmin-breakglass` sich über `/if/admin/` einloggen kann. Der Breakglass-Account hat keinen direkten App-Zugriff (nicht in `admin`), aber die Admin-UI bleibt unabhängig von Policy-Bindings erreichbar.

## Breakglass-Account

`akadmin-breakglass` ist ein zweiter, unabhängiger Admin-Account. Er hat:

- Eigenes starkes Passwort (getrennt vom primären `akadmin`)
- Eigenes TOTP-Device, eigene Static Recovery Codes
- Mitgliedschaft in `authentik Admins` (superuser)
- E-Mail-Alias `breakglass@ackermannprivat.ch`

Der Account wird im Normalbetrieb nie verwendet. Sein einziger Zweck ist die Lifeline, wenn `akadmin` ausgesperrt ist -- sei es durch einen Policy-Fehler, ein verlorenes TOTP-Device oder einen kompromittierten Passwort-Store. Die Credentials liegen in 1Password unter "Authentik Breakglass (akadmin-breakglass)", inklusive eines Live-OTP-Felds, damit beim Einloggen kein manuelles Code-Abtippen nötig ist.

::: warning Breakglass-Benutzung protokollieren
Jeder Einsatz des Breakglass-Accounts sollte protokolliert werden (wann, warum). Nach der Nutzung muss das Passwort rotiert und ein neues TOTP-Device registriert werden, weil der Notfall-Einsatz oft unter Druck passiert und Spuren hinterlässt. Ein ungenutzter Breakglass-Account ist ein gesunder Breakglass-Account.
:::

## Alerting-Kette

Sicherheitsrelevante Events fliessen aus Authentik über einen Relay-Service auf den Telegram-Chat. Der Relay-Umweg ist bewusst: Authentik speichert Webhook-URLs im Klartext in der Datenbank. Ein DB-Dump würde den Bot-Token kompromittieren, deshalb lebt der Token nur im Relay-Container (aus Vault) und nicht in der Authentik-DB.

Die Event-Matcher, die Notification Rule und die Transport-Konfiguration der Pipeline stehen in der [Referenz](./referenz.md#alerting-und-events).

## Recovery-Flow für Benutzer

User, die ihr Passwort vergessen haben, klicken auf der Login-Seite auf "Passwort vergessen?". Der Recovery-Flow fragt nach E-Mail oder Username, sendet einen zeitlich begrenzten Mail-Link (Token-Expiry 30 min) und leitet nach erfolgreicher Token-Validierung in den Password-Change-Flow.

Die Password-Change-Stage dort hat dieselbe Password Policy wie alle anderen Password-Write-Stellen gebunden -- schwache neue Passwörter werden abgewiesen.

### Recovery-Eingangspfade aus Apps

Im Homelab gibt es Apps, die Authentik-Credentials prüfen, ohne dass der User die Authentik-Login-Seite überhaupt zu sehen bekommt. Damit Recovery aus solchen Apps heraus funktioniert, muss der Forgot-Password-Link explizit auf den Authentik-Recovery-Flow zeigen -- App-interne Reset-Mechanismen scheitern, weil das Passwort gar nicht in der App liegt.

Der Recovery-Flow hat einen stabilen Slug (`default-recovery-flow`), die Einstiegs-URL bleibt deshalb über App-Updates hinweg gültig.

- **Authentik selbst** -- Die Identification-Stage referenziert den Recovery-Flow direkt; das Custom-CSS macht den Link unter dem Anmelde-Button als "Passwort vergessen?" sichtbar. Quelle: [`authentik-custom-css.txt`](https://gitea.ackermannprivat.ch/PRIVAT/infra/src/branch/main/authentik-custom-css.txt) im Infra-Repo
- **Jellyseerr** (`public-auth@file`) -- ForwardAuth davor bedeutet: nicht-eingeloggte User landen zuerst auf der Authentik-Login-Seite mit dem nativen Recovery-Link. Auf der zweiten Hürde -- Jellyseerr's eigenem "Sign in with Jellyfin"-Login -- rendert die `JellyfinLogin`-Komponente einen Forgot-Link nur unter einer Bedingung (siehe Warning-Box unten zu `externalHostname`)
- **Jellyfin** (`public-noauth@file`, kein ForwardAuth) -- Hier fehlt die Authentik-Login-Seite als natürliches Recovery-Sprungbrett. Der "Login Disclaimer" in der Jellyfin-Branding-Konfiguration nimmt HTML und wird unterhalb des Login-Formulars gerendert. Persistiert im Linstor-CSI-Volume `jellyfin-config`, überlebt App-Updates und Container-Restarts

Alle drei Wege führen denselben Recovery-Flow aus -- damit gibt es genau eine Stelle, an der Passwort, Policy und Mail-Template gepflegt werden.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  app: { style: { border-radius: 8 } }
  recovery: { style: { border-radius: 8; stroke: "#7c3aed" } }
  store: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: down

User: Benutzer { class: app }

Apps: Login-Seiten {
  class: container

  AuthLogin: "auth.ackermannprivat.ch\nAuthentik (nativ)" {
    class: app
    tooltip: "Recovery-Link via Identification-Stage + Custom-CSS"
  }
  JSLogin: "wish.ackermannprivat.ch\nJellyseerr Sign-in" {
    class: app
    tooltip: "Forgot-Link rendert nur wenn externalHostname UND jellyfinForgotPasswordUrl gesetzt -- Wrapper {baseUrl && ...}"
  }
  JFLogin: "watch.ackermannprivat.ch\nJellyfin Login" {
    class: app
    tooltip: "LoginDisclaimer im Branding-Endpoint, persistiert im CSI-Volume"
  }
}

FWD: "Authentik ForwardAuth\n(public-auth@file)" {
  class: recovery
  tooltip: "Schaltet die Authentik-Login-Seite VOR Jellyseerr -- nativer Recovery-Link greift hier zuerst"
}

Recovery: "default-recovery-flow" {
  class: recovery
  tooltip: "Identification + Recovery-Mail + Token + Password-Change-Stage"
}

Mail: "Recovery-Mail\nToken 30 min" {
  class: store
  shape: cylinder
  tooltip: "SMTP Relay -- smtp.service.consul"
}

PwChange: "Password-Change-Stage\n(Password Policy aktiv)" { class: recovery }

PG: "PostgreSQL\nUser-Hash" {
  class: store
  shape: cylinder
}

User -> Apps.AuthLogin: "ruft Login auf" { style.stroke: "#2563eb" }
User -> Apps.JSLogin: "ruft Login auf" { style.stroke: "#2563eb" }
User -> Apps.JFLogin: "ruft Login auf" { style.stroke: "#2563eb" }

Apps.JSLogin -> FWD: "Redirect vor App-Login" { style.stroke: "#6b7280" }
FWD -> Recovery: "nativer Recovery-Link" { style.stroke: "#7c3aed" }
Apps.AuthLogin -> Recovery: "Passwort vergessen?" { style.stroke: "#7c3aed" }
Apps.JSLogin -> Recovery: "Forgot-Link\n(rendert wenn externalHostname gesetzt)" { style.stroke: "#7c3aed"; style.stroke-dash: 3 }
Apps.JFLogin -> Recovery: "Disclaimer-Link" { style.stroke: "#7c3aed" }

Recovery -> Mail: "sendet Token-Link" { style.stroke: "#854d0e" }
Mail -> User: "User klickt Link" { style.stroke: "#16a34a"; style.stroke-dash: 3 }
User -> PwChange: "neues Passwort" { style.stroke: "#2563eb" }
PwChange -> PG: "Hash schreiben" { style.stroke: "#854d0e" }
```

::: info Warum kein App-internes Forgot-Password
Jellyfin und Jellyseerr haben jeweils eigene Reset-Mechanismen (Jellyfin Quick-Connect-Code, Jellyseerr E-Mail-Reset). Beide setzen voraus, dass das Passwort lokal in der App-DB liegt. Im Homelab ist das nicht der Fall: Jellyfin nutzt den LDAP-Outpost (Passwort in Authentik-PG), Jellyseerr nutzt "Sign in with Jellyfin" (Passwort via LDAP wieder in Authentik). Die App-internen Resets würden die Authentik-User-DB nicht ändern und beim nächsten LDAP-Bind nicht greifen -- deshalb zeigt der UI-Link direkt auf den Authentik-Recovery-Flow.
:::

::: warning Jellyseerr Forgot-Link braucht externalHostname
`jellyfinForgotPasswordUrl` allein reicht nicht -- die `JellyfinLogin`-Komponente rendert den Link in einem `{baseUrl && (...)}`-Wrapper, mit `baseUrl = settings.jellyfinExternalHost || settings.jellyfinHost`. Im Backend heisst das Feld `externalHostname` (Settings → Jellyfin → External URL). Bleibt `externalHostname` leer (Default in vielen Setups), wird der gesamte `&lt;a&gt;` nicht gerendert -- auch wenn `jellyfinForgotPasswordUrl` korrekt gesetzt ist. Im Homelab sind deshalb beide Felder gesetzt: `externalHostname = "https://watch.ackermannprivat.ch"` und `jellyfinForgotPasswordUrl = "https://auth.ackermannprivat.ch/if/flow/default-recovery-flow"`. URL-Validierung beider Felder verbietet trailing slash.

OIDC ist kein Ausweg: weder Jellyseerr noch Seerr haben nativen OIDC-Support (PR fallenbagel/jellyseerr#1505 closed), die Doppel-Login-Hürde (ForwardAuth + Jellyseerr-Login) bleibt. Recovery funktioniert dank der beschriebenen Settings trotzdem auf beiden Stufen.
:::

## Passwordless Login

Der Passwordless-Flow existiert parallel zum normalen Login. Auf der Login-Seite erscheint ein dezenter Link "Mit Passkey anmelden". Wer ihn klickt, gibt nur noch Username/E-Mail ein und bestätigt mit einem registrierten Passkey (TouchID, Windows Hello, FIDO2-Stick).

Damit der Flow funktioniert, muss der Passkey als **Resident Key** registriert sein (`resident_key_requirement=required` auf der WebAuthn-Setup-Stage). Nicht-Resident-Keys lassen sich zwar registrieren, können aber keinen Username resolven -- sie funktionieren nur als zweiter Faktor, nicht als primärer Login.

User registrieren Passkeys selbstständig über das User-Portal unter "Settings → Authenticator Devices → Create".

## Session-Verhalten

Die Login-Stage erzwingt eine fixe Session-Dauer von 7 Tagen ohne "Angemeldet bleiben"-Checkbox. Parallele Sessions auf mehreren Geräten sind erlaubt (`terminate_other_sessions=false`, seit 2026-06-08) -- ein Neulogin auf einem Gerät beendet die Sessions auf anderen Geräten **nicht** mehr.

Als Diebstahl-Schutz ist die Session stattdessen an das Land gebunden (`geoip_binding=bind_continent_country`): ein gestohlenes Session-Cookie, das aus einem anderen Land genutzt wird, verliert die Gültigkeit. `network_binding` bleibt bewusst aus -- eine Bindung an ASN oder IP würde mit Tailscale-Zugriffen (private Quell-IP ohne ASN/GeoIP) und dem Split-Horizon-DNS kollidieren und unnötige Re-Logins auslösen. Die konkreten Werte stehen in der [Referenz](./referenz.md#stages).

::: warning Trade-off
Bis 2026-06-08 galt `terminate_other_sessions=true` (nur eine Session gleichzeitig, ein gestohlenes Cookie wurde beim nächsten echten Login abgeschossen). Das wurde bewusst zugunsten der Multi-Device-Nutzbarkeit aufgegeben. Das verbleibende Land-Binding schützt nur gegen Cookie-Nutzung aus einem anderen Land, nicht innerhalb der Schweiz -- und erfordert bei Auslandsreisen nach dem Grenzübertritt einen erneuten Login.
:::

## Performance-Konzept

Authentik ist CPU-bound bei Flow-Execution. Im Homelab sind folgende Hebel gedreht:

- **Gunicorn-Worker und -Threads** im Server-Task, ausreichend für den Homelab-Load
- **PostgreSQL-JIT deaktiviert** -- JIT-Kompilierung schadet bei kleinen OLTP-Queries, Authentik macht fast nur kleine Queries
- **Autovacuum aggressiver** für die Session- und Cache-Tabellen, damit Bloat nicht die Response-Zeit hochtreibt
- **Cache-Timeouts 600s** für Flows und Policies -- Änderungen an Flows brauchen bis zu 10 Minuten, um auf allen Workern aktiv zu werden
- **GeoIP deaktiviert** -- spart Startup-Zeit und Event-Overhead
- **Kein Redis** -- seit der Redis-Abschaffung laufen Cache, Sessions, WebSockets und Task-Queue über PostgreSQL. Das spart einen Service, erhöht aber die DB-Last -- darum das aggressive Autovacuum-Tuning oben

Die konkreten Zahlen (CPU, RAM, Worker-Counts) stehen im Nomad-Job -- nicht im Wiki, weil sie sich ändern.

## Outpost-Token-Rotation

Die Proxy- und LDAP-Outposts authentifizieren sich mit langlebigen Tokens aus Vault (`kv/data/authentik-outpost`). Diese Tokens haben kein eingebautes Ablaufdatum, müssen aber regelmässig rotiert werden, um das Risiko eines kompromittierten Tokens zu begrenzen.

**Rotationskonzept:**

- **Zielintervall:** 90 Tage
- **Tracking:** Vault-Metadata-Feld `rotated_at` auf dem Secret-Path. Wird bei jeder Rotation auf das aktuelle Datum gesetzt
- **Warnung:** Ein periodischer Nomad-Batch-Job prüft das `rotated_at`-Feld. Ist der Wert älter als 80 Tage, geht eine Warnung via Telegram-Relay raus
- **Rotation selbst:** Manueller Prozess -- neues Token in der Authentik-UI generieren, in Vault schreiben, Nomad-Job redeployen. Automatische Rotation wäre möglich, erhöht aber die Komplexität ohne grossen Nutzen im Homelab

::: warning Rotation nicht vergessen
Ein kompromittiertes Outpost-Token gibt vollen Zugriff auf den Authentik-Server. Im Gegensatz zu den kurzlebigen OIDC-Tokens verfallen Outpost-Tokens nie von allein.
:::

## Schutzmechanismen gegen Brute-Force

Authentik ist mit mehreren Schichten gegen Brute-Force-Angriffe geschützt. Die Schichten arbeiten unabhängig voneinander:

- **Traefik Rate-Limit** (`login-ratelimit`) -- greift auf HTTP-Ebene bevor Authentik den Request überhaupt sieht. Schützt gegen automatisierte Massenlogins von einer einzelnen IP
- **Authentik Reputation Policy** -- greift auf Flow-Ebene nach der Passwort-Validierung. Sperrt IP+Username-Kombinationen nach wiederholten Fehlversuchen. Decay-basiert, entsperrt sich nach wenigen Minuten automatisch
- **CrowdSec** (`crowdsec@file`) -- greift auf IP-Ebene am Traefik-Entrypoint. Blockt bekannte bösartige IPs aus Community-Blocklisten

CrowdSec und die Reputation Policy ergänzen sich: CrowdSec reagiert auf bekannte Angreifer-IPs (proaktiv), die Reputation Policy auf tatsächliche Fehlversuche (reaktiv). Eine tiefere Integration (z.B. CrowdSec-Parser für Authentik-Events) ist im Homelab nicht nötig -- die Reputation Policy deckt den reaktiven Fall ab, CrowdSec den proaktiven.

Betrieblich relevant: Automation (Playwright-Tests, Login-Skripte) muss zwischen Iterationen mindestens eine Minute warten, sonst stoppt das `login-ratelimit` den Test selbst mit HTTP 429.

## Bootstrap (Ersteinrichtung)

Die Schritt-für-Schritt-Reihenfolge des Erstdeploys (Vault-Secrets, PostgreSQL-Anlage, Outpost-Token-Bootstrap) ist im Repo unter `authentik-blueprints/README.md` dokumentiert. Architektur-relevant ist nur eine Regel: Das Hardening (MFA-Zwang, Password Policy, Reputation Policy, Passwordless-Flow) wird erst **nach** dem ersten erfolgreichen Login nachgezogen -- sonst läuft das Bootstrap in einen Lockout, bevor ein Recovery-Pfad existiert. Die Absicherung gegen genau diesen Fall beschreiben die [Recovery-Layer](#recovery-layer-safety-net) oben.

## Verwandte Seiten

- [Authentik Übersicht](./index.md) -- Architektur und Stack-Einbindung
- [Authentik Referenz](./referenz.md) -- Flows, Policies, OIDC-Provider
- [Backup](../backup/index.md) -- PostgreSQL-Backup-Infrastruktur (Layer 4)
- [Telegram Bots](../monitoring/telegram-bots.md) -- Alert-Transport via Relay
