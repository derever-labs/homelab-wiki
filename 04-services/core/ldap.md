---
title: OpenLDAP & Benutzerverwaltung
description: Zentrales Benutzerverzeichnis mit Keycloak-Federation
tags:
  - service
  - core
  - ldap
  - identity
---

# OpenLDAP & Benutzerverwaltung

## Uebersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Deployment** | Docker Compose auf vm-proxy-dns-01 |
| **Consul Service** | `ldap.service.consul` |
| **Base DN** | `dc=ackermannprivat,dc=ch` |
| **Users DN** | `ou=users,dc=ackermannprivat,dc=ch` |
| **Admin Bind DN** | `cn=admin,dc=ackermannprivat,dc=ch` |
| **Web-UI** | phpldapadmin (`admin-chain-v2@file`) |

## Rolle im Stack

OpenLDAP ist das zentrale Benutzerverzeichnis. Alle User-Accounts (Name, E-Mail, Gruppenzugehoerigkeit) werden hier verwaltet. Keycloak importiert diese Daten und nutzt LDAP als Identity Store.

```mermaid
flowchart TD
    PLA["User-Verwaltung<br/>(phpldapadmin)"] --> LDAP["OpenLDAP"]
    KC["Keycloak LDAP Federation<br/>(WRITABLE)"] --> LDAP
    LDAP --> Bind["Direkter Bind<br/>(Jellyfin, etc.)"]
    KC --> OAuth["OAuth2/OIDC<br/>(Traefik Services)"]
```

## Keycloak LDAP Federation

Keycloak ist mit OpenLDAP ueber eine User Federation verbunden. Die wichtigsten Parameter:

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| **Edit Mode** | WRITABLE | Aenderungen in Keycloak werden nach LDAP zurueckgeschrieben |
| **Import Enabled** | Ja | User werden beim ersten Login aus LDAP importiert |
| **Sync Interval** | 86400s (24h) | Periodischer Changed-Sync (Aenderungen aus LDAP nach Keycloak) |
| **Connection** | `ldap://ldap.service.consul` | Ueber Consul DNS aufgeloest |
| **Bind DN** | `cn=admin,dc=ackermannprivat,dc=ch` | Admin-Zugriff fuer Lese- und Schreiboperationen |

### Edit Modes erklaert

| Mode | Verhalten | Passwort-Sync |
|------|-----------|---------------|
| **READ_ONLY** | Keycloak liest nur aus LDAP, keine Aenderungen moeglich | Nur LDAP-Passwort gilt |
| **WRITABLE** (aktiv) | Aenderungen in Keycloak werden nach LDAP geschrieben | Passwort geht in beide Systeme |
| **UNSYNCED** | Aenderungen bleiben nur in Keycloak DB | Passwoerter koennen divergieren |

**Wichtig:** Im WRITABLE-Modus werden Passwort-Aenderungen ueber die Keycloak Admin-UI oder den Account-Self-Service sofort nach LDAP synchronisiert. Services die direkt gegen LDAP authentifizieren (z.B. Jellyfin) erhalten dadurch automatisch das aktuelle Passwort.

## Authentifizierungswege

Es gibt zwei verschiedene Wege, wie Services User authentifizieren:

### 1. Ueber Keycloak (OAuth2/OIDC)

Die meisten Services nutzen Traefik Middleware Chains mit oauth2-proxy → Keycloak. Keycloak prueft die Credentials und die Gruppenzugehoerigkeit.

**Betroffene Services:** Alle Services mit `public-*-chain-v2` oder `intern-*-chain-v2` Middleware.

### 2. Direkt gegen LDAP (LDAP Bind)

Einige Services authentifizieren direkt gegen OpenLDAP mit eigenem LDAP-Client. Dafuer ist es essentiell, dass die Passwoerter in LDAP aktuell sind.

**Betroffene Services:** Jellyfin und weitere Services mit nativer LDAP-Integration.

## Benutzergruppen

Die Gruppenverwaltung erfolgt in Keycloak (Realm `traefik`), nicht in LDAP. Siehe [Zugriffsgruppen](../../03-platforms/security.md#zugriffsgruppen) fuer die Gruppenstruktur.

## Technische Details

### Container

| Container | Image | Funktion |
|-----------|-------|----------|
| `openldap` | `osixia/openldap` | LDAP Server (Port 389) |
| `phpldapadmin` | `osixia/phpldapadmin` | Web-UI fuer LDAP-Administration |

### Persistenz

Die Daten liegen auf NFS:
- **Datenbank:** `/nfs/docker/ldap/ldap/` (die eigentlichen LDAP-Eintraege)
- **Konfiguration:** `/nfs/docker/ldap/slapd.d/` (slapd Backend-Konfiguration im LDIF-Format)

### TLS

TLS ist deaktiviert (`LDAP_TLS=false`). Der Zugriff erfolgt ausschliesslich intern ueber das Management-Netzwerk. Die Env-Variable wirkt nur beim ersten Bootstrap — bei bestehender Konfiguration zaehlt der Inhalt von `slapd.d/cn=config.ldif`.

### slapd.d Backend

OpenLDAP speichert seine Konfiguration im LDIF-Format unter `slapd.d/`. Jede LDIF-Datei enthaelt eine CRC32-Pruefsumme in der zweiten Zeile. Manuelle Aenderungen an diesen Dateien erfordern eine Neuberechnung der Pruefsumme, da slapd sonst den Start verweigert.

**Empfehlung:** Konfigurationsaenderungen wenn moeglich ueber `ldapmodify` statt direkte Dateibearbeitung.

## Konfiguration

Verwaltet durch Docker Compose. Siehe `standalone-stacks/traefik-proxy/templates/docker-compose.yml.j2` im Repository.

---
*Letztes Update: 22.02.2026*
