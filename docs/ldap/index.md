---
title: OpenLDAP & Benutzerverwaltung
description: Zentrales Benutzerverzeichnis mit Authentik-Anbindung
tags:
  - service
  - core
  - ldap
  - identity
  - authentik
---

# OpenLDAP & Benutzerverwaltung

OpenLDAP ist das zentrale Benutzerverzeichnis. Alle User-Accounts werden hier verwaltet, Authentik ist per LDAP-Source angebunden und nutzt OpenLDAP als Identity Store.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `databases/open-ldap.nomad` |
| Consul Service | `ldap.service.consul` |
| Base DN | `dc=ackermannprivat,dc=ch` |
| Users DN | `ou=users,dc=ackermannprivat,dc=ch` |
| Admin Bind DN | `cn=admin,dc=ackermannprivat,dc=ch` |
| Secrets | Vault `kv/data/openldap` |

## Rolle im Stack

OpenLDAP ist das zentrale Benutzerverzeichnis. Alle User-Accounts (Name, E-Mail, Gruppenzugehörigkeit) werden hier verwaltet. Authentik ist per LDAP angebunden und nutzt OpenLDAP als Identity Store.

```d2
direction: down

AK: Authentik LDAP-Source
LDAP: OpenLDAP (Nomad Job)
Bind: Direkter Bind (Jellyfin, etc.)
OAuth: ForwardAuth (Traefik Services)

AK -> LDAP
LDAP -> Bind
AK -> OAuth
```

## Authentik LDAP-Anbindung

Authentik liest User-Daten aus OpenLDAP über eine LDAP-Source. Die Verbindung erfolgt über Consul DNS.

| Parameter | Wert |
| :--- | :--- |
| **Connection** | `ldap://ldap.service.consul` |
| **Bind DN** | `cn=admin,dc=ackermannprivat,dc=ch` |
| **Base DN** | `dc=ackermannprivat,dc=ch` |

## Authentifizierungswege

Es gibt zwei verschiedene Wege, wie Services User authentifizieren:

### 1. Über Authentik (ForwardAuth)

Die meisten Services nutzen Traefik Middleware Chains mit Authentik ForwardAuth. Authentik prüft die Credentials und die Gruppenzugehörigkeit.

**Betroffene Services:** Alle Services mit `intern-auth@file` oder `public-auth@file` Middleware.

### 2. Direkt gegen LDAP (LDAP Bind)

Einige Services authentifizieren direkt gegen OpenLDAP mit eigenem LDAP-Client. Dafür ist es essentiell, dass die Passwörter in LDAP aktuell sind.

**Betroffene Services:** Jellyfin und weitere Services mit nativer LDAP-Integration.

## Benutzergruppen

Die Gruppenverwaltung erfolgt in Authentik, nicht direkt in LDAP. Siehe [Zugriffsgruppen](../security/index.md#zugriffsgruppen) für die Gruppenstruktur.

## Technische Details

### Nomad Job

| Parameter | Wert |
| :--- | :--- |
| **Image** | `osixia/openldap` (gepinnt, siehe Nomad-Job) |
| **Job** | `databases/open-ldap.nomad` |
| **Port** | 389 (statisch) |
| **Constraint** | vm-nomad-client-05 |

### Persistenz

Die Daten liegen auf NFS:
- **Datenbank:** `/nfs/docker/ldap/ldap` -> `/var/lib/ldap`
- **Konfiguration:** `/nfs/docker/ldap/slapd.d` -> `/etc/ldap/slapd.d`

### TLS

TLS ist deaktiviert (`LDAP_TLS=false`). Der Zugriff erfolgt ausschliesslich intern über das Management-Netzwerk. Die Env-Variable wirkt nur beim ersten Bootstrap -- bei bestehender Konfiguration zählt der Inhalt von `slapd.d/cn=config.ldif`.

### slapd.d Backend

OpenLDAP speichert seine Konfiguration im LDIF-Format unter `slapd.d/`. Jede LDIF-Datei enthält eine CRC32-Prüfsumme in der zweiten Zeile. Manuelle Änderungen an diesen Dateien erfordern eine Neuberechnung der Prüfsumme, da slapd sonst den Start verweigert.

**Empfehlung:** Konfigurationsänderungen wenn möglich über `ldapmodify` statt direkte Dateibearbeitung.

## Konfiguration

Verwaltet als Nomad Job. Siehe `nomad-jobs/databases/open-ldap.nomad` im Repository. Admin-Passwort wird aus Vault (`kv/data/openldap`) bezogen.

## Verwandte Seiten

- [Authentik](../authentik/index.md) -- Identity Provider, der OpenLDAP als Source nutzt
- [Sicherheit](../security/index.md) -- Zugriffsgruppen und Authentifizierungskonzept
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeits-Übersicht
