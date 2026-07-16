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
- **Traefik** ([VIP](../../_referenz/hosts-und-ips.md)) -- Routing und ForwardAuth; Authentik benötigt Traefik für OIDC Discovery
- **SMTP Relay** (`smtp.service.consul`) -- für Recovery-Mails und Alerting-Fallback

## Automatisierung

- **Backup:** täglicher `pg_dumpall`-Job (03:00 UTC) sichert die Authentik-Datenbank nach NFS
- **Alerting:** Authentik-Event-Matchers leiten sicherheitsrelevante Events via Telegram-Relay weiter
- **Group-Binding-Drift-Audit:** periodischer Nomad-Batch-Job prüft täglich, ob alle 45 Apps mindestens eine Group-Binding haben. Alarm via Telegram wenn eine App ohne Binding auftaucht (Schutz gegen "46. App wurde ohne Binding hinzugefügt"-Fall)

## Blueprint-Workflow

Authentik-Gruppen und Group-Bindings liegen deklarativ im Repo unter `authentik-blueprints/`. Der Blueprint-Ansatz ist bewusst gewählt: Änderungen sind reviewbar (PR + CODEOWNERS), nachvollziehbar und atomar -- kein Git-Sync-Sidecar, kein Deploy-Key, kein PAT. Drift wird vom Audit-Job erkannt, aber nicht automatisch korrigiert, damit eine fehlerhafte Binding nicht selbsttätig zurückkehrt.

Beim Rollback (`git revert` → Push → Apply) setzt der Reconciler die Bindings auf den vorherigen Stand zurück. Den vollständigen Änderungs-Workflow (Branch, Validierung, Apply-Mechanik) und die Tier-Zuordnung beschreibt die [Blueprint-Quelle](./gruppen-bindings.md#blueprint-quelle).

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

## Recovery und Breakglass

Die fünf Recovery-Layer (Recovery-URLs, Automation-API-Token, Django-Shell, PostgreSQL-Restore, Re-Bootstrap), das Rollback der Group-Bindings, der Breakglass-Account und der Benutzer-Recovery-Flow stehen in [Authentik Recovery und Breakglass](./recovery.md).

## Alerting-Kette

Sicherheitsrelevante Events fliessen aus Authentik über einen Relay-Service auf den Telegram-Chat. Der Relay-Umweg ist bewusst: Authentik speichert Webhook-URLs im Klartext in der Datenbank. Ein DB-Dump würde den Bot-Token kompromittieren, deshalb lebt der Token nur im Relay-Container (aus Vault) und nicht in der Authentik-DB.

Die Event-Matcher, die Notification Rule und die Transport-Konfiguration der Pipeline stehen in der [Referenz](./referenz.md#alerting-und-events).

## Passwordless Login

Der normale `default-authentication-flow` nutzt **WebAuthn Conditional UI (Autofill)**: Sobald der User das E-Mail-Feld fokussiert, bietet der Browser automatisch einen registrierten Passkey zur Auswahl an -- kein separater Link, kein Klick nötig. Das Feld trägt `autocomplete="email webauthn"`. Technisch ist dafür eine `passkey-autofill-validate`-Stage als `webauthn_stage` in der Identification-Stage hinterlegt (`device_classes=[webauthn]`, `not_configured_action=skip`, `webauthn_user_verification=required`).

Voraussetzungen für Conditional UI: HTTPS, Discoverable/Resident-Key, gleicher Hostname, Browser mit Conditional-Mediation-Unterstützung.

Nach erfolgreichem Passkey-Login wird die MFA-Validate-Stage übersprungen: Eine Skip-Policy (`auth_method == auth_webauthn_pwl`) ist am FlowStageBinding der MFA-Stage gebunden -- der Passkey zählt bereits als Besitz + User-Verification. Admins, die sich mit Passwort einloggen, durchlaufen die MFA-Stage weiterhin.

Zusätzlich existiert ein dedizierter `passwordless-flow`, der direkt mit der WebAuthn-Validate-Stage startet. Er ist über das `passwordless_flow`-Feld der Identification-Stage verlinkt und erscheint auf der Login-Seite als Button "Mit Passkey anmelden" -- als zweiter Weg neben dem Autofill, falls Conditional UI im Browser nicht greift. Zu den Grenzen dieses Flows siehe [Referenz](./referenz.md#passwordless-flow).

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

Die Schritt-für-Schritt-Reihenfolge des Erstdeploys (Vault-Secrets, PostgreSQL-Anlage, Outpost-Token-Bootstrap) ist im Repo unter `authentik-blueprints/README.md` dokumentiert. Architektur-relevant ist nur eine Regel: Das Hardening (MFA-Zwang, Password Policy, Reputation Policy, Passwordless-Flow) wird erst **nach** dem ersten erfolgreichen Login nachgezogen -- sonst läuft das Bootstrap in einen Lockout, bevor ein Recovery-Pfad existiert. Die Absicherung gegen genau diesen Fall beschreiben die [Recovery-Layer](./recovery.md#recovery-layer-safety-net).

## Verwandte Seiten

- [Authentik Übersicht](./index.md) -- Architektur und Stack-Einbindung
- [Authentik Recovery und Breakglass](./recovery.md) -- Recovery-Layer, Breakglass, Benutzer-Recovery-Flow
- [Authentik Gruppen und Bindings](./gruppen-bindings.md) -- Gruppen, Bindings, Tier-Mapping
- [Authentik Referenz](./referenz.md) -- Flows, Policies, OIDC-Provider
- [Backup](../../backup/index.md) -- PostgreSQL-Backup-Infrastruktur (Layer 4)
- [Telegram Bots](../../monitoring/keep/telegram-bots.md) -- Alert-Transport via Relay
