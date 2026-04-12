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

Diese Seite enthält bewusst keine CLI-Befehle oder Deployment-Anleitungen -- das Operative übernimmt die Automation. Hier werden die Konzepte erklärt, die hinter den einzelnen Operations stehen.

## Übersicht

Authentik läuft als Nomad Job (`identity/authentik.nomad`) mit vier Tasks (server, worker, proxy, ldap). Das Deployment erfolgt über Nomad -- keine manuelle Konfiguration an den VMs nötig.

## Abhängigkeiten

- **PostgreSQL** (`postgres.service.consul`) -- primärer Datenspeicher, muss vor Authentik starten
- **Vault** (`kv/data/authentik`, `kv/data/authentik-outpost`) -- Secret-Store für alle Schlüssel und Tokens
- **Traefik** (VIP 10.0.2.20) -- Routing und ForwardAuth; Authentik benötigt Traefik für OIDC Discovery
- **SMTP Relay** (`smtp.service.consul`) -- für Recovery-Mails und Alerting-Fallback

## Automatisierung

- **Backup:** täglicher `pg_dumpall`-Job (03:00 UTC) sichert die Authentik-Datenbank nach NFS
- **Token-Rotation-Warnung:** periodischer Nomad-Batch-Job prüft `rotated_at` im Vault-Metadata; Warnung via Telegram wenn > 80 Tage
- **Alerting:** Authentik-Event-Matchers leiten sicherheitsrelevante Events via Telegram-Relay weiter

## Bekannte Einschränkungen

- **Cache-Delay:** Änderungen an Flows und Policies werden erst nach bis zu 10 Minuten auf allen Workern wirksam (Cache-Timeout 600s)
- **Outpost-Cache:** Nach einem Redeployment ist der LDAP-Bind-Cache leer -- der erste Login pro User durchläuft den vollen Flow
- **Kein Redis mehr:** Ab Authentik 2025.10 läuft alles über PostgreSQL; Autovacuum-Tuning ist deshalb kritisch
- **Login-Rate-Limit:** Playwright-Tests und Login-Skripte müssen mindestens 1 Minute zwischen Iterationen warten

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

Sicherheitsrelevante Events fliessen aus Authentik über einen Relay-Service auf den VIP-Telegram-Chat. Die Ebenen:

1. **Authentik Event Matcher** -- sechs Policies filtern die Events (`login_failed`, `policy_exception`, `suspicious_request`, `password_set`, `configuration_error`, plus einen LDAP-spezifischen Matcher)
2. **Notification Rule** -- bündelt die Matcher unter einer Regel mit Severity `alert`, Empfänger-Gruppe `authentik Admins`
3. **Transport** -- `telegram-critical` zeigt auf den [Telegram-Relay](../monitoring/telegram-bots.md), ein kleiner Nomad-Service mit HTTP-Endpoint `POST /notify`
4. **Property Mapping** -- die Webhook-Body-Expression extrahiert `source` aus dem Event-Kontext und baut einen formatierten Text (z.B. `[Authentik/alert/LDAP] Failed bind for user xxx`)
5. **Telegram-Relay** -- persistiert den Bot-Token nur im Container (aus Vault), forwardet an die Telegram-Bot-API
6. **VIP-Chat** -- landet auf dem Handy, hoffentlich nie häufig

Der Relay-Umweg ist bewusst: Authentik speichert Webhook-URLs im Klartext in der Datenbank. Ein DB-Dump würde den Bot-Token kompromittieren. Der Relay kapselt das.

## Login-Ratelimit

Die Authentik-Login-Seite hängt hinter der Traefik-Middleware `login-ratelimit@file`. Zu viele aufeinanderfolgende Login-Versuche von einer IP führen zu HTTP 429 "Too Many Requests". Das greift bevor Authentik die Reputation Policy evaluiert und ist eine zusätzliche Schicht gegen automatisierte Brute-Force.

Für Automation (Playwright-Tests, Login-Skripte) muss zwischen Iterationen mindestens eine Minute gewartet werden, sonst wird der Test selbst vom Ratelimit gestoppt.

## Recovery-Flow für Benutzer

User, die ihr Passwort vergessen haben, klicken auf der Login-Seite auf "Benutzername oder Passwort vergessen?". Der Recovery-Flow fragt nach E-Mail oder Username, sendet einen zeitlich begrenzten Mail-Link (Token-Expiry 30 min) und leitet nach erfolgreicher Token-Validierung in den Password-Change-Flow.

Die Password-Change-Stage dort hat dieselbe Password Policy wie alle anderen Password-Write-Stellen gebunden -- schwache neue Passwörter werden abgewiesen.

## Passwordless Login

Der Passwordless-Flow existiert parallel zum normalen Login. Auf der Login-Seite erscheint ein dezenter Link "Mit Passkey anmelden". Wer ihn klickt, gibt nur noch Username/E-Mail ein und bestätigt mit einem registrierten Passkey (TouchID, Windows Hello, FIDO2-Stick).

Damit der Flow funktioniert, muss der Passkey als **Resident Key** registriert sein (`resident_key_requirement=required` auf der WebAuthn-Setup-Stage). Nicht-Resident-Keys lassen sich zwar registrieren, können aber keinen Username resolven -- sie funktionieren nur als zweiter Faktor, nicht als primärer Login.

User registrieren Passkeys selbstständig über das User-Portal unter "Settings → Authenticator Devices → Create".

## Session-Verhalten

Nach dem Login gilt:

- **Standard-Session:** 1 Tag -- danach muss neu eingeloggt werden
- **Remember-Me-Session:** 14 Tage, wenn die Checkbox auf der Login-Seite gesetzt war
- **Terminate Other Sessions:** ein neuer Login beendet automatisch alle anderen Sessions des gleichen Users

Das ist ein Kompromiss zwischen Bequemlichkeit und Sicherheit. Im Lockout-Fall kann ein gestohlenes Session-Cookie immerhin nicht parallel genutzt werden, weil der echte User beim nächsten Login die fremde Session abschiesst.

## Performance-Konzept

Authentik ist CPU-bound bei Flow-Execution. Im Homelab sind folgende Hebel gedreht:

- **Gunicorn-Worker und -Threads** im Server-Task, ausreichend für den Homelab-Load
- **PostgreSQL-JIT deaktiviert** -- JIT-Kompilierung schadet bei kleinen OLTP-Queries, Authentik macht fast nur kleine Queries
- **Autovacuum aggressiver** für die Session- und Cache-Tabellen, damit Bloat nicht die Response-Zeit hochtreibt
- **Cache-Timeouts 600s** für Flows und Policies -- Änderungen an Flows brauchen bis zu 10 Minuten, um auf allen Workern aktiv zu werden
- **GeoIP deaktiviert** -- spart Startup-Zeit und Event-Overhead

Die konkreten Zahlen (CPU, RAM, Worker-Counts) stehen im Nomad-Job -- nicht im Wiki, weil sie sich ändern.

::: info Kein Redis seit Authentik 2025.10
Authentik hat Redis in Version 2025.10 vollständig entfernt. Cache, Sessions, WebSockets und Task-Queue laufen über PostgreSQL. Das spart einen Service, erhöht aber die Last auf der Datenbank -- Autovacuum-Tuning ist deshalb wichtig.
:::

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

## Bootstrap (Ersteinrichtung)

::: info Reihenfolge bei Erstdeploy
1. Vault-Secrets anlegen (`kv/authentik`: `secret_key`, `db_password`)
2. PostgreSQL-Datenbank und User erstellen
3. Nur Server und Worker deployen (Outpost-Tasks auskommentieren)
4. In der Authentik-UI: Outposts erstellen und Tokens kopieren
5. Tokens in Vault schreiben (`kv/authentik-outpost`: `proxy_token`, `ldap_token`)
6. Job erneut deployen -- alle vier Tasks starten
7. Hardening nachziehen: MFA für Admins, Password Policy, Reputation Policy, Passwordless-Flow, Telegram-Alerting (Reihenfolge wichtig -- siehe Recovery-Layer oben, damit das Bootstrap nicht in einen Lockout läuft)
:::

## Verwandte Seiten

- [Authentik Übersicht](./index.md) -- Architektur und Stack-Einbindung
- [Authentik Referenz](./referenz.md) -- Flows, Policies, OIDC-Provider
- [Backup](../backup/index.md) -- PostgreSQL-Backup-Infrastruktur (Layer 4)
- [Telegram Bots](../monitoring/telegram-bots.md) -- Alert-Transport via Relay
