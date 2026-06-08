---
title: Authentik Referenz
description: Flows, Stages, Policies, OIDC-Provider und UI-Anpassungen
tags:
  - identity
  - authentik
  - referenz
---

# Authentik Referenz

Diese Seite listet alle konfigurierten Flows, Policies, Stages und OIDC-Provider. Übergeordnete Rolle und Architektur stehen in [Authentik (Übersicht)](./index.md). Betriebs-Konzepte wie Recovery und Breakglass in [Authentik Betrieb](./betrieb.md).

## Flows

| Flow | Designation | Zweck |
| :--- | :--- | :--- |
| `default-authentication-flow` | authentication | Primärer Login mit E-Mail/Passwort + MFA (Admins); Passkey-Login via Conditional UI (Autofill) |
| `passwordless-flow` | authentication | Passkey-Login ohne Passwort, direkter URL-Einstieg (startet sofort mit WebAuthn-Stage) |
| `default-recovery-flow` | recovery | Passwort-Zurücksetzung per E-Mail-Link |
| `ldap-authentication-flow` | authentication | Minimaler Bind-Flow für den LDAP-Outpost (Jellyfin) |
| `default-invalidation-flow` | invalidation | Logout und Session-Invalidierung |
| `default-user-settings-flow` | stage_configuration | User-Portal "Update your info" |
| `default-authenticator-totp-setup` | stage_configuration | TOTP-Device anlegen |
| `default-authenticator-webauthn-setup` | stage_configuration | Passkey (WebAuthn) registrieren |
| `default-authenticator-static-setup` | stage_configuration | Statische Recovery-Codes generieren |

### Default Authentication Flow

Der Default-Flow wurde für Passwortmanager-Kompatibilität optimiert:

- **Single-Page Login** -- Password Stage ist direkt in der Identification Stage referenziert (`password_stage` Feld), E-Mail und Passwort erscheinen auf einer Seite
- **Nur E-Mail** -- `user_fields=["email"]`, damit das Label auf "E-Mail" reduziert bleibt. Username-Login ist im Haupt-Flow nicht mehr möglich; Notzugang via `admin-local-login`
- **Recovery-Link** -- die Identification Stage referenziert `default-recovery-flow` über `recovery_flow`. Auf der Login-Seite erscheint dezent "Passwort vergessen?"
- **Passkey-Autofill** -- Die Identification-Stage hat ein `webauthn_stage`-Feld, das auf `passkey-autofill-validate` zeigt. Der Browser bietet beim Fokussieren des E-Mail-Felds automatisch einen registrierten Passkey an (Conditional UI / `autocomplete="email webauthn"`). Ein separater "Mit Passkey anmelden"-Link existiert nicht mehr; `passwordless_flow` der Identification-Stage ist leer
- **Fixe 7-Tage-Session** -- Login-Stage hat `session_duration=days=7`, `remember_me_offset=seconds=0`. Die "Angemeldet bleiben"-Checkbox wird nicht mehr gerendert, jede Session läuft automatisch 7 Tage
- **Terminate other sessions** -- Login-Stage beendet vorhandene Sessions des gleichen Users bei einem Neulogin

### Passwordless Flow

Fallback-Flow für Passkey-Besitzer, erreichbar über eine direkte URL. Zwei Stages (die frühere vorangestellte Identification-Stage wurde entfernt):

1. `passwordless-authenticator-validate` -- dedizierte Authenticator-Validate-Stage mit `device_classes=["webauthn"]`, `not_configured_action=deny`, `webauthn_user_verification=required`
2. Default User-Login-Stage

Im normalen `default-authentication-flow` übernimmt Conditional UI (via `passkey-autofill-validate` als `webauthn_stage` der Identification-Stage) den Passkey-Login automatisch -- der `passwordless-flow` ist nur als direkter Einstieg relevant, falls der Browser kein Conditional Mediation unterstützt.

Die WebAuthn Setup-Stage ist mit `user_verification=required` und `resident_key_requirement=required` konfiguriert, damit registrierte Passkeys echte FIDO2-Resident-Keys sind und Passwordless zuverlässig funktioniert.

### LDAP Authentication Flow

Eigener Flow nur für LDAP-Binds. Enthält nur Identification + Password + User-Login, ohne MFA. Dieser Flow darf kein MFA erzwingen, da die Jellyfin-Client-Apps keine Multi-Faktor-Eingabe unterstützen.

Der LDAP-Outpost (`homelab-ldap`) ist für Performance optimiert:

- **Bind Mode:** `cached` -- nach dem ersten erfolgreichen Login wird das Ergebnis im Outpost-Memory gecacht. Nachfolgende Logins desselben Users brauchen <5ms statt ~2s
- **Search Mode:** `cached` -- alle User/Groups werden periodisch vom Authentik-Server geladen und im Outpost-RAM gehalten
- **MFA:** deaktiviert (der Flow hat keine MFA-Stage)
- **Bind-User:** `svc-jellyfin-ldap` (Typ `internal`, Passwort in 1Password). Erhält `search_full_directory` über die Rolle `ldap-searcher` (Gruppe `ldap-searchers`), damit Jellyfin alle User durchsuchen kann
- **App-Policy:** Expression-Policy `ldap-allowed-groups` auf der LDAP-Applikation: nur Mitglieder von `family` oder `guest` (sowie `svc-jellyfin-ldap` selbst) dürfen einen LDAP-Bind durchführen. Alle anderen User werden abgelehnt

::: warning Cache-Invalidierung
Nach einem Outpost-Neustart (z.B. Redeployment) ist der Bind-Cache leer. Der erste Login pro User durchläuft den vollen Authentik-Flow. Passwortänderungen werden erst nach Ablauf der Session im Cache wirksam.
:::

#### Login-Sequenz `watch.ackermannprivat.ch`

Der Pfad vom Browser bis zur Jellyfin-Session mit Cache-Entscheidung (Hit vs. Miss) und den API-Roundtrips im Outpost:

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

classes: {
  user: { style: { border-radius: 8; stroke: "#1a73e8" } }
  proxy: { style: { border-radius: 8; stroke: "#e8710a" } }
  jf: { style: { border-radius: 8; stroke: "#d93025" } }
  outpost: { style: { border-radius: 8; stroke: "#188038" } }
  ak: { style: { border-radius: 8; stroke: "#8430ce" } }
  pg: { style: { border-radius: 8; stroke: "#c29c10" } }
  phase: { style: { border-radius: 8; stroke-dash: 4 } }
}

entry: 1. Login bis LDAP-Bind {
  class: phase
  direction: down
  input: "Nutzer E-Mail + Passwort\nim Browser" { class: user }
  post: "Browser POST\n/Users/AuthenticateByName" { class: proxy }
  fwd: "Traefik -> Jellyfin\nkein ForwardAuth auf /Users/*" { class: proxy }
  bind: "Jellyfin LDAP Simple Bind\ncn=USER,ou=users,..." { class: jf }
  input -> post -> fwd -> bind
}

hit: "Hit-Pfad -- bind_mode=cached" {
  class: phase
  direction: down
  check: "Outpost prüft boundUsers\n+ Argon2 gegen Cache-Hash" { class: outpost }
  ok: "Outpost -> Jellyfin\nLDAPResult Success" { class: outpost }
  check -> ok
}

miss: "Miss-Pfad -- Cache-Miss / Erstlogin" {
  class: phase
  direction: down
  flow: "Voller LDAP-Flow gegen Authentik\nidentification -> password -> user-login\n(PostgreSQL-Lookup, Reputation, Argon2, Session)" { class: ak }
  api: "Zwei API-Calls mit Session-Cookie\ncheck_access (Provider-ACL)\ncore/users/me (pk, groups, mail)" { class: outpost }
  cache: "Outpost schreibt boundUsers in Cache\n-> Outpost LDAPResult Success" { class: outpost }
  flow -> api -> cache
}

finish: Jellyfin Session {
  class: phase
  direction: down
  match: "Jellyfin User-Match\nvia mail-Attribut" { class: jf }
  token: "Jellyfin -> Browser\nAccessToken + SessionID" { class: jf }
  home: "Browser zeigt\nStartseite / Bibliothek" { class: user }
  match -> token -> home
}

entry -> hit
entry -> miss
hit -> finish
miss -> finish
```

::: info Wieso zwei API-Calls nach dem Flow-Execute?
Der Outpost ruft nach dem erfolgreichen Bind zusätzlich `check_access` (prüft die Provider-ACL) und `core/users/me` (holt UID, GID, Gruppen und Mail für die LDAP-Response). Beide Calls tragen den `authentik_session`-Cookie aus dem Flow-Execute — ohne diesen Cookie liefert der Authentik-Server `403 Authentication credentials were not provided`, was in der Vergangenheit zu Debugging-Schleifen geführt hat.
:::

## Policies

| Policy | Typ | Wirkung |
| :--- | :--- | :--- |
| `policy-admins-need-mfa` | Expression | Admin-Gruppen + Superuser müssen MFA präsentieren |
| `policy-reputation-login` | Reputation | Lockout bei zu vielen Fehlversuchen (IP+Username) |
| `default-password-change-password-policy` | Password | Mindestkomplexität für neue Passwörter |

### MFA-Erzwingung

Die Expression Policy `policy-admins-need-mfa` prüft auf Gruppen-Mitgliedschaft (`admin`, `authentik Admins`) oder `is_superuser`. Sie wird als PolicyBinding am FlowStageBinding der MFA-Validate-Stage im `default-authentication-flow` angehängt -- so wird die Stage nur für Admin-Accounts überhaupt evaluiert. Non-Admins überspringen sie unverändert.

Zusätzlich ist am FlowStageBinding der MFA-Validate-Stage (order 30) die Skip-Policy `default-authentication-flow-authenticator-validate-stage` gebunden (`policy_engine_mode=all`). Diese Policy überspringt die Stage, wenn `auth_method == auth_webauthn_pwl` -- ein Admin, der sich via Passkey einloggt, durchläuft die MFA-Stage nicht, weil der Passkey bereits Besitz und User-Verification kombiniert. Admins mit Passwort-Login werden weiterhin zur MFA geleitet.

Die MFA-Validate-Stage steht auf `not_configured_action=configure` -- ein Admin ohne Device wird beim Passwort-Login in den Setup-Flow gezwungen (TOTP, WebAuthn oder Static Codes).

::: warning Binding nicht löschen
Die Expression Policy sowie beide PolicyBindings sind am FlowStageBinding der MFA-Stage verankert. Wird das Admin-MFA-Binding manuell aus der Admin-UI entfernt, läuft die MFA-Stage wieder für **alle** User -- Non-Admins ohne Device werden in den Setup-Flow gezwungen. Bei Drift: Blueprint via `nomad job run nomad-jobs/identity/authentik.nomad` erneut applien.
:::

### Reputation Policy

- **Threshold:** −3 (drei Fehlversuche in der Decay-Periode)
- **Check:** IP und Username (beide Vektoren)
- **Gebunden an:**
  - Password-Stage im `default-authentication-flow`
  - MFA-Validate-Stage im `default-authentication-flow` (Brute-Force gegen TOTP)
  - Identification-Stage im `default-recovery-flow` (verhindert unbegrenzt viele Reset-Mails)
  - Password-Stage im `ldap-authentication-flow` (Rate-Limit für Jellyfin-Bind-Versuche)

Authentik lässt den Reputation-Score langsam wieder steigen, gesperrte Accounts sind nach wenigen Minuten wieder frei. Für persistenten Lockout greift CrowdSec auf IP-Ebene.

### Password Policy

- **Mindestlänge:** 12 Zeichen
- **zxcvbn-Score:** ≥ 3 (kein Wörterbuch-Passwort, keine trivialen Muster)
- **Gebunden an:** Recovery-Flow (password-change + user-write) und den Password-Change-Stage-Flow

Die Policy greift bei jedem Set-Password, also auch bei Self-Service-Änderungen aus dem User-Portal.

## Stages

Wichtige konfigurierte Stages (für API-Referenz):

- `default-authentication-identification` -- `user_fields=[email]`, verknüpft mit `recovery_flow`; `webauthn_stage` zeigt auf `passkey-autofill-validate` (Conditional UI); `passwordless_flow` ist leer
- `default-authentication-password` -- `failed_attempts_before_cancel=5`
- `default-authentication-mfa-validation` -- `not_configured_action=configure`, `configuration_stages=[totp, webauthn, static]`; Skip-Policy für Passkey-Login am FlowStageBinding (siehe [MFA-Erzwingung](#mfa-erzwingung))
- `default-authentication-login` -- `session_duration=days=7`, `remember_me_offset=seconds=0` (fixe 7-Tage-Session ohne Checkbox), `terminate_other_sessions=false` (Multi-Device erlaubt, seit 2026-06-08), `geoip_binding=bind_continent_country` (Session an Land CH gebunden -- Diebstahl-Schutz), `network_binding=no_binding` (aus wegen Tailscale/Split-Horizon)
- `passkey-autofill-validate` -- `device_classes=[webauthn]`, `not_configured_action=skip`, `webauthn_user_verification=required`; referenziert als `webauthn_stage` in der Identification-Stage (Conditional UI)
- `passwordless-authenticator-validate` -- `device_classes=[webauthn]`, `not_configured_action=deny`, `webauthn_user_verification=required`; nur im dedizierten `passwordless-flow` (direkter URL-Einstieg)
- `default-authenticator-webauthn-setup` -- `user_verification=required`, `resident_key_requirement=required`
- `recovery-email` -- `use_global_settings=true` (nutzt `AUTHENTIK_EMAIL__*` aus dem Nomad-Job)

## OIDC Providers

Services mit nativer OIDC-Unterstützung werden direkt als Provider-Client in Authentik konfiguriert. Die App übernimmt den Login-Dialog selbst und tauscht Token mit Authentik aus. Services mit nativem OIDC verwenden zusätzlich `intern-auth@file` als Defense-in-Depth-Schicht (ForwardAuth + IP-Allowlist).

| Service | Methode | Traefik Chain | Besonderheiten |
| :--- | :--- | :--- | :--- |
| Grafana | Natives OIDC | `intern-auth@file` | `GF_AUTH_OAUTH_ALLOW_INSECURE_EMAIL_LOOKUP=true` für Account-Linking |
| Gitea | Natives OIDC | `intern-noauth@file` | Auth-Source via `gitea admin auth update-oauth` konfiguriert |
| Open-WebUI | Natives OIDC | `intern-noauth@file` | `OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true` für Account-Linking |
| Paperless | Natives OIDC | `intern-auth@file` | OIDC via `allauth.socialaccount.providers.openid_connect` |
| n8n | Natives OIDC | `intern-auth@file` | Workflow-Automation |
| Proxmox VE | Natives OIDC | — (direkt :8006) | OpenID Realm `authentik`, ACME-Certs via Cloudflare DNS |
| Authentik selbst | — | `login-ratelimit@file,crowdsec@file,secure-headers@file` | Admin-UI zusätzlich hinter IP-Allowlist |
| Alle anderen | ForwardAuth via Proxy Outpost | `intern-auth@file` oder `public-auth@file` | |

### OIDC Provider-Konfiguration

Alle OIDC-Provider verwenden:

- **Signing Key:** Gemeinsamer Authentik-Schlüssel (kein `None`)
- **Sub Mode:** `user_email` (nicht `hashed_user_id`) -- damit Services den User per E-Mail identifizieren
- **Invalidation Flow:** Default Invalidation Flow
- **Property Mappings:** `profile`, `openid`, `email`

### Proxmox SSO

Proxmox ist als OpenID-Realm direkt auf den PVE-Nodes konfiguriert (kein Traefik):

- **Realm:** `authentik` (Default-Realm)
- **Issuer URL:** `https://auth.ackermannprivat.ch/application/o/proxmox/`
- **Username Claim:** `email`
- **Autocreate:** aktiviert
- **Zugriff:** `https://pve00/01/02.ackermannprivat.ch:8006` (ACME-Certs via Cloudflare DNS-Challenge)
- **Admin-User:** `samuel@ackermannprivat.ch@authentik` mit Rolle `Administrator`

## Applications und Icons

Alle Applications im User-Portal verwenden Icons vom [selfh.st/icons](https://selfh.st/icons) CDN (via jsDelivr). Das Mapping läuft über den App-Slug mit Fallback-Tabelle für Apps, deren Slug nicht direkt matcht (z.B. `homelab-admin` → `authentik.svg`, `paperless-oidc` → `paperless-ngx.svg`, `special-youtube-dl` → `youtube-dl.svg`).

Apps ohne passendes Icon im CDN bleiben leer und müssen manuell nachgetragen werden. Die Konfiguration pro App erfolgt über das `meta_icon`-Feld in der Authentik-API.

## Brand und Custom CSS

Das Default-Brand hat den Titel `ackermannprivat.ch` und verwendet das Custom-CSS aus [authentik-custom-css.txt](https://gitea.ackermannprivat.ch/PRIVAT/infra/src/branch/main/authentik-custom-css.txt). Das CSS vereinfacht die Login-Seite minimalistisch:

- Labels, Sprachauswahl, Authentik-Footer und Pflichtfeld-Sternchen ausgeblendet
- Placeholder-Texte auf "E-Mail" und "Passwort" vereinfacht (per `::after` pseudo-element)
- Recovery-Link sitzt dezent zentriert innerhalb des Login-Cards (kein separater Passkey-Link mehr -- Passkey wird via Conditional UI automatisch angeboten)
- Stage-Konsistenz: Avatar-Banner, "Nicht Sie?"-Link, Helper-Texte und Secondary-Buttons werden in TOTP-, MFA- und E-Mail-Stages ausgeblendet, damit alle Stages gleich aussehen wie der Login
- Recovery-Sent-Stage zeigt den Bestätigungstext via `:host(ak-stage-email)::before`; der "E-Mail erneut senden"-Button ist als Textlink optisch zurückgenommen
- Akzent-Farbe `#4f6ef7` (Indigo-Blau)
- Background `#f0f2f5` (Hellgrau)

Das CSS wird nicht aus dem Repo gerendert -- es muss nach jeder Änderung über die Authentik-API auf den Brand gepushed werden (Feld `branding_custom_css`).

Favicon und Logo verweisen auf `https://wiki.ackermannprivat.ch/brand-favicon.svg` bzw. `https://wiki.ackermannprivat.ch/brand-logo.svg`. Die SVGs liegen im Wiki-Repository unter `docs/public/` und werden bei jedem Wiki-Deploy automatisch aktualisiert.

## Traefik-Integration

Authentik hat drei dedizierte Traefik-Router mit unterschiedlichen Middleware-Chains:

- **`authentik`** (Haupt-Router) -- `login-ratelimit@file`, `crowdsec@file`, `secure-headers@file`
- **`authentik-admin`** (Priority 2000) -- `PathPrefix(/if/admin/)` mit `intern-noauth@file` (IP-Allowlist), `crowdsec@file`, `secure-headers@file`. Die Admin-UI ist nur aus dem internen Netz erreichbar
- **`authentik-api`** (Priority 1500) -- `PathPrefix(/api/)` mit `api-ratelimit@file` (100 req/min), `crowdsec@file`, `secure-headers@file`
- **`authentik-callback`** (Priority 1000) -- `PathPrefix(/outpost.goauthentik.io/)` mit `crowdsec@file`, `secure-headers@file`. Kritisch für alle ForwardAuth- und OIDC-Flows

Die `secure-headers@file` Middleware setzt neben HSTS und X-Frame-Options auch eine Content-Security-Policy (`frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`).

Access-Logs in Traefik sind so konfiguriert, dass sicherheitsrelevante Header (`Cookie`, `Authorization`, `X-Authentik-Jwt`, etc.) redacted werden, bevor sie via Alloy nach Loki fliessen.

## Benutzerverwaltung

Authentik verwaltet Benutzer intern. Passwort-Änderungen und Gruppen-Management erfolgen über die Authentik-UI oder via User-Portal / Recovery-Flow.

### Gruppen

| Gruppe | Zugriff | Bemerkung |
| :--- | :--- | :--- |
| `authentik Admins` | Admin-UI + System-Admin (nicht automatisch alle Apps) | Superuser-Flag via Gruppe, MFA erzwungen. Bypassed Policy-Bindings NICHT |
| `admin` | Alle 45 Apps (admin-Tier + inherits via Multi-Binding auch family/guest-Tier) | MFA erzwungen |
| `family` | family-Tier (immo-monitor) + guest-Tier (jellyseerr) | Kein MFA, darf LDAP-Bind für Jellyfin |
| `guest` | guest-Tier (jellyseerr) | — |
| `ldap-searchers` | LDAP-Suche für Jellyfin-Bind-User (`svc-jellyfin-ldap`) | Rolle `ldap-searcher` |

Admin-Accounts:

- `akadmin` -- primärer Admin. In `authentik Admins` UND `admin`. Credentials in 1Password unter "Authentik HOME" (inkl. Live-OTP-Feld)
- `akadmin-breakglass` -- Lifeline-Account, nur in `authentik Admins`. Getrennte Credentials in 1Password unter "Authentik Breakglass (akadmin-breakglass)". Hat keinen direkten App-Zugang, dient als Admin-UI-Fallback. Nutzung: siehe [Betrieb](./betrieb.md)

### Group-Binding-Strategie

Alle 45 Applications sind explizit einer der drei Tiers (`admin`, `family`, `guest`) zugeordnet. Autoritative Zuordnung und Apply-Mechanik liegen deklarativ im Ordner [`authentik-blueprints/`](https://github.com/derever-labs/infra/tree/main/authentik-blueprints) -- siehe Abschnitt [Blueprint-Quelle](#blueprint-quelle).

Kernregeln:

- **`policy_engine_mode = any`** auf jeder App (OR-Logik: User darf rein sobald eine gebundene Gruppe passt)
- **Multi-Binding pro Tier-Übergang.** Authentik vererbt Gruppen-Mitgliedschaft über das `parent`-Feld NICHT transitiv (empirisch bestätigt per `check_access`-Endpoint am 2026-04-14). Deshalb bekommen niederschwellig berechtigte Apps mehrere Bindings:

  - **guest-Tier** (Apps, die jeder authentifizierte User sehen soll): Bindings auf `admin` (order 0), `family` (order 1), `guest` (order 2)
  - **family-Tier**: Bindings auf `admin` (order 0), `family` (order 1)
  - **admin-Tier**: Binding nur auf `admin` (order 0)

- **Keine Negate-Flags.** Negate-Interaktion mit `policy_engine_mode=any` ist bekannt paradox (Issues #9627, #17692 im Authentik-Repo)
- **`parent`-Feld bleibt leer.** Da Vererbung nicht wirkt, bringt es nichts ausser UI-Kosmetik

Superuser-Verhalten: Mitglieder von `authentik Admins` (is_superuser=True) umgehen Policy-Bindings NICHT. Der `superuser_full_list=true`-Flag zeigt Superusern die App-Liste vollständig in der Admin-UI, die tatsächliche Authorization läuft aber über das Binding. akadmin muss deshalb in `admin` bleiben, sonst verliert er nach Rollout den App-Zugang.

### Tier-Mapping

- **guest-Tier:** `jellyseerr` (jeder authentifizierte User)
- **family-Tier:** `immo-monitor`
- **admin-Tier:** alle übrigen Apps (Core/OIDC, Dashboards, Observability, Storage/DB, Media-Stack, Office, Utilities, Download-Tools)

Die autoritative, vollständige App-zu-Tier-Zuordnung ist der Blueprint `authentik-blueprints/30-apps-admin-tier.yaml` (admin-Tier) bzw. `10-`/`20-apps-*-tier.yaml` -- jede neue App wird dort eingetragen.

### Blueprint-Quelle

Die Tier-Zuordnung und Gruppen-Bindings werden über Authentik-Blueprints verwaltet (deklarative YAML im Git-Repo):

- **Pfad:** `authentik-blueprints/` im Infra-Repo (Subfolder, kein Submodule)
- **Files:** `00-groups.yaml` (Gruppen), `10-apps-guest-tier.yaml`, `20-apps-family-tier.yaml`, `30-apps-admin-tier.yaml`
- **Einbindung:** Der `authentik.nomad`-Worker-Task liest die YAMLs beim Deploy via HCL2 `file()` und mountet den Ordner read-only nach `/blueprints/homelab/` im Container. Der Authentik-Reconciler entdeckt und appliziert sie automatisch (Labels `blueprints.goauthentik.io/system: true` + `instantiate: true`)
- **Kein Git-Sync-Sidecar, kein Deploy-Key, kein PAT.** Apply erfolgt über den `nomad job run` des Identity-Jobs
- **Validierung lokal:** über die `ak blueprint validate`-Subcommand im Authentik-Server-Image (siehe `authentik-blueprints/README.md`)
- **Readme im Repo:** siehe `authentik-blueprints/README.md` für Tier-Logik-Details und App-Aufnahme-Workflow

Den vollständigen Änderungs- und Rollback-Workflow (PR, CODEOWNERS-Review, Apply-Reihenfolge) beschreibt [Authentik Betrieb](./betrieb.md#blueprint-workflow).

## Alerting und Events

Sicherheitsrelevante Events lösen Telegram-Benachrichtigungen über den [Telegram-Relay](../monitoring/telegram-bots.md) aus. Die Pipeline:

- **Event Matchers:** `login_failed`, `policy_exception`, `suspicious_request`, `password_set`, `configuration_error`, zusätzlich ein LDAP-spezifischer Matcher (`app=authentik.providers.ldap`)
- **Notification Rule `rule-security-events-telegram`:** Severity `alert`, Empfänger-Gruppe `authentik Admins`, Transports `telegram-critical` + `default-email-transport` (redundant)
- **Transport `telegram-critical`:** Webhook-Modus, Ziel `telegram-relay.service.consul`, Body-Expression baut `{text, severity, source}`. Der Bot-Token lebt im Relay-Container (via Vault), nicht in der Authentik-DB

Zusätzlich wurden die vier Default-Rules (`default-notify-configuration-error/warning/exception/update`) um den Telegram-Transport erweitert, damit auch Core-Events auf dem Handy landen.

## Verwandte Seiten

- [Authentik Übersicht](./index.md) -- Architektur und Stack-Einbindung
- [Authentik Betrieb](./betrieb.md) -- Recovery, Breakglass, Rollback
- [Traefik Middleware Chains](../traefik/referenz.md) -- ForwardAuth und Rate-Limits
- [Telegram Bots](../monitoring/telegram-bots.md) -- Alert-Transport via Relay
