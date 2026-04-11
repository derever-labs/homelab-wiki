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
| `default-authentication-flow` | authentication | Primärer Login mit E-Mail/Username + Passwort + MFA (für Admins) |
| `passwordless-flow` | authentication | Passkey-Login ohne Passwort, via WebAuthn |
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
- **Username und E-Mail** -- `user_fields` akzeptiert beide
- **Recovery-Link** -- die Identification Stage referenziert `default-recovery-flow` über `recovery_flow`. Auf der Login-Seite erscheint dezent "Benutzername oder Passwort vergessen?"
- **Passwordless-Link** -- gleiche Mechanik über `passwordless_flow`, Button "Mit Passkey anmelden"
- **Remember-Me** -- Identification Stage hat `enable_remember_me=true`, Login-Stage hat `remember_me_offset=14 Tage`. Standard-Session ist 1 Tag, mit Remember-Me bis 14 Tage
- **Terminate other sessions** -- Login-Stage beendet vorhandene Sessions des gleichen Users bei einem Neulogin

### Passwordless Flow

Neu eingeführter alternativer Login-Flow für Passkey-Besitzer. Drei Stages:

1. Identification (wiederverwendet aus Default-Auth, nur Username/E-Mail)
2. `passwordless-authenticator-validate` -- dedizierte Authenticator-Validate-Stage mit `device_classes=["webauthn"]`, `not_configured_action=deny`, `webauthn_user_verification=required`
3. Default User-Login-Stage

Die WebAuthn Setup-Stage ist mit `user_verification=required` und `resident_key_requirement=required` konfiguriert, damit registrierte Passkeys echte FIDO2-Resident-Keys sind und Passwordless zuverlässig funktioniert.

### LDAP Authentication Flow

Eigener Flow nur für LDAP-Binds. Enthält nur Identification + Password + User-Login, ohne MFA. Dieser Flow darf kein MFA erzwingen, da die Jellyfin-Client-Apps keine Multi-Faktor-Eingabe unterstützen.

Der LDAP-Outpost (`homelab-ldap`) ist für Performance optimiert:

- **Bind Mode:** `cached` -- nach dem ersten erfolgreichen Login wird das Ergebnis im Outpost-Memory gecacht. Nachfolgende Logins desselben Users brauchen <5ms statt ~2s
- **Search Mode:** `cached` -- alle User/Groups werden periodisch vom Authentik-Server geladen und im Outpost-RAM gehalten
- **MFA:** deaktiviert (der Flow hat keine MFA-Stage)
- **Search Group:** auf `family` beschränkt -- Admin-Credentials (`akadmin`, `akadmin-breakglass`) können nicht per LDAP gebindet werden, das schützt vor Credential-Stuffing gegen Admin-Accounts über den Jellyfin-Pfad

::: warning Cache-Invalidierung
Nach einem Outpost-Neustart (z.B. Redeployment) ist der Bind-Cache leer. Der erste Login pro User durchläuft den vollen Authentik-Flow. Passwortänderungen werden erst nach Ablauf der Session im Cache wirksam.
:::

## Policies

| Policy | Typ | Wirkung |
| :--- | :--- | :--- |
| `policy-admins-need-mfa` | Expression | Admin-Gruppen + Superuser müssen MFA präsentieren |
| `policy-reputation-login` | Reputation | Lockout bei zu vielen Fehlversuchen (IP+Username) |
| `default-password-change-password-policy` | Password | Mindestkomplexität für neue Passwörter |

### MFA-Erzwingung

Die Expression Policy prüft auf Gruppen-Mitgliedschaft (`admin`, `authentik Admins`) oder `is_superuser`. Sie wird als PolicyBinding am FlowStageBinding der MFA-Validate-Stage im `default-authentication-flow` angehängt -- so wird die Stage nur für Admin-Accounts überhaupt evaluiert. Non-Admins überspringen sie unverändert.

Zusätzlich steht die MFA-Validate-Stage auf `not_configured_action=configure` -- ein Admin ohne Device wird beim Login in den Setup-Flow gezwungen (TOTP, WebAuthn oder Static Codes).

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

- `default-authentication-identification` -- `user_fields=[email,username]`, verknüpft mit `recovery_flow`, `passwordless_flow`, `enable_remember_me=true`
- `default-authentication-password` -- `failed_attempts_before_cancel=5`
- `default-authentication-mfa-validation` -- `not_configured_action=configure`, `configuration_stages=[totp, webauthn, static]`
- `default-authentication-login` -- `session_duration=1d`, `remember_me_offset=14d`, `terminate_other_sessions=true`
- `passwordless-authenticator-validate` -- `device_classes=[webauthn]`, `not_configured_action=deny`, `webauthn_user_verification=required`
- `default-authenticator-webauthn-setup` -- `user_verification=required`, `resident_key_requirement=required`
- `recovery-email` -- `use_global_settings=true` (nutzt `AUTHENTIK_EMAIL__*` aus dem Nomad-Job)

## OIDC Providers

Services mit nativer OIDC-Unterstützung werden direkt als Provider-Client in Authentik konfiguriert. Die App übernimmt den Login-Dialog selbst und tauscht Token mit Authentik aus. Die Traefik-Chain ist in diesen Fällen `intern-noauth@file`.

| Service | Methode | Traefik Chain | Besonderheiten |
| :--- | :--- | :--- | :--- |
| Grafana | Natives OIDC | `intern-noauth@file` | `GF_AUTH_OAUTH_ALLOW_INSECURE_EMAIL_LOOKUP=true` für Account-Linking |
| Gitea | Natives OIDC | `intern-noauth@file` | Auth-Source via `gitea admin auth update-oauth` konfiguriert |
| Open-WebUI | Natives OIDC | `intern-noauth@file` | `OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true` für Account-Linking |
| Paperless | Natives OIDC | `intern-noauth@file` | OIDC via `allauth.socialaccount.providers.openid_connect` |
| Proxmox VE | Natives OIDC | — (direkt :8006) | OpenID Realm `authentik`, ACME-Certs via Cloudflare DNS |
| Authentik selbst | — | `login-ratelimit@file,crowdsec@file,secure-headers@file` | |
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
- Recovery-Link und Passkey-Link sitzen dezent zentriert innerhalb des Login-Cards
- Remember-Me-Checkbox klein und grau unter dem Password-Feld
- Akzent-Farbe `#4f6ef7` (Indigo-Blau)
- Background `#f0f2f5` (Hellgrau)

Das CSS wird nicht aus dem Repo gerendert -- es muss nach jeder Änderung über die Authentik-API auf den Brand gepushed werden (Feld `branding_custom_css`).

Favicon und Logo verweisen auf `https://ackermannprivat.ch/favicon.ico` bzw. das Default-Authentik-Logo.

## Benutzerverwaltung

Authentik verwaltet Benutzer intern. Passwort-Änderungen und Gruppen-Management erfolgen über die Authentik-UI oder via User-Portal / Recovery-Flow.

| Gruppe | Zugriff | Bemerkung |
| :--- | :--- | :--- |
| `authentik Admins` | Voller Zugriff auf alles | Superuser, MFA erzwungen |
| `admin` | Admin-Zugriff auf Services | MFA erzwungen |
| `family` | Familien-Zugriff (Jellyfin, Jellyseerr, Media-Stack) | Kein MFA, darf LDAP-Bind |
| `guest` | Eingeschränkt | — |

Admin-Accounts:

- `akadmin` -- primärer Admin. Credentials in 1Password unter "Authentik HOME" (inkl. Live-OTP-Feld)
- `akadmin-breakglass` -- Lifeline-Account, getrennte Credentials in 1Password unter "Authentik Breakglass (akadmin-breakglass)". Nutzung und Konzept: siehe [Betrieb](./betrieb.md)

## Alerting und Events

Sicherheitsrelevante Events lösen Telegram-Benachrichtigungen über den [Telegram-Relay](../monitoring/telegram-bots.md) aus. Die Pipeline:

- **Event Matchers:** `login_failed`, `policy_exception`, `suspicious_request`, `password_set`, `configuration_error`, zusätzlich ein LDAP-spezifischer Matcher (`app=authentik.providers.ldap`)
- **Notification Rule `rule-security-events-telegram`:** Severity `alert`, Empfänger-Gruppe `authentik Admins`, Transports `telegram-critical` + `default-email-transport` (redundant)
- **Transport `telegram-critical`:** Webhook-Modus, Ziel `telegram-relay.service.consul`, Body-Expression baut `{text, severity, source}`. Der Bot-Token lebt im Relay-Container (via Vault), nicht in der Authentik-DB

Zusätzlich wurden die vier Default-Rules (`default-notify-configuration-error/warning/exception/update`) um den Telegram-Transport erweitert, damit auch Core-Events auf dem Handy landen.
