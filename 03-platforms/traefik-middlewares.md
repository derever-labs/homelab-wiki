# Traefik Middleware Chains

Diese Dokumentation beschreibt die verfuegbaren Middleware Chains fuer Traefik und deren Verwendung.

## Uebersicht

Alle Services werden ueber Traefik (vm-proxy-dns-01, 10.0.2.1) geroutet. Die Authentifizierung erfolgt ueber OAuth2-Proxy mit Keycloak als Identity Provider.

## Middleware Chains

### Fuer externen Zugriff (Public)

Diese Chains erlauben Zugriff von ueberall, erfordern aber OAuth2-Authentifizierung:

| Chain | Komponenten | Beschreibung |
|-------|-------------|--------------|
| `public-guest-chain` | crowdsec, oauth2-guest | OAuth2 Guest-Gruppe + CrowdSec |
| `public-admin-chain` | crowdsec, oauth2-admin | OAuth2 Admin-Gruppe + CrowdSec |
| `public-family-chain` | crowdsec, oauth2-family | OAuth2 Family-Gruppe + CrowdSec |

### Fuer internen Zugriff (IP-Whitelist)

Diese Chains erfordern sowohl OAuth2-Authentifizierung als auch eine interne IP:

| Chain | Komponenten | Beschreibung |
|-------|-------------|--------------|
| `intern-admin-chain` | oauth2-admin, intern-chain | OAuth2 Admin + IP-Whitelist |
| `intern-family-chain` | oauth2-family, intern-chain | OAuth2 Family + IP-Whitelist |
| `intern-api-chain` | intern-chain | Nur IP-Whitelist (fuer API-Zugriffe) |
| `intern-chain` | ipWhiteList | Basis IP-Whitelist |

### IP-Whitelist Ranges

Die `intern-chain` erlaubt folgende IP-Bereiche:
- `10.0.0.0/8` - Internes Netzwerk
- `172.16.0.0/12` - Docker Networks
- `192.168.0.0/16` - VPN und weitere private Netze

## OAuth2-Proxy Konfiguration

### Trusted IPs (Bypass Authentifizierung)

Folgende IPs werden von allen OAuth2-Proxies vertraut und benoetigen keine Authentifizierung:

| IP | Host | Beschreibung |
|----|------|--------------|
| 10.0.2.124 | vm-nomad-client-04 | Nomad Client |
| 10.0.2.125 | vm-nomad-client-05 | Nomad Client (High Performance) |
| 10.0.2.126 | vm-nomad-client-06 | Nomad Client (High Performance) |

Dies ermoeglicht Service-to-Service Kommunikation innerhalb des Nomad Clusters ohne OAuth2-Authentifizierung.

### OAuth2-Proxy Instanzen

| Proxy | Container | Erlaubte Gruppen | Cookie Name |
|-------|-----------|------------------|-------------|
| Admin | oauth2-proxy-admin | admin | _oauth2_admin |
| Family | oauth2-proxy-family | admin, family, guest | _oauth2_family |
| Guest | oauth2-proxy-guest | admin, family, guest | _oauth2_guest |

## Verwendung in Nomad Jobs

Beispiel fuer einen Nomad Job mit Traefik-Integration:

```hcl
service {
  name = "my-service"
  port = "http"
  tags = [
    "traefik.enable=true",
    "traefik.http.routers.my-service.rule=Host(`my-service.ackermannprivat.ch`)",
    "traefik.http.routers.my-service.entrypoints=https",
    "traefik.http.routers.my-service.tls=true",
    "traefik.http.routers.my-service.tls.certresolver=cloudflare",
    "traefik.http.routers.my-service.middlewares=intern-admin-chain@file"
  ]
}
```

## OAuth2 Callback Routes

Fuer jeden Service mit OAuth2-Middleware muss eine Callback-Route in der Traefik-Konfiguration existieren:

```yaml
oauth2-my-service:
  rule: "Host(`my-service.ackermannprivat.ch`) && PathPrefix(`/oauth2/`)"
  service: oauth2-admin-backend
  priority: 1000
```

## Migrationshistorie

### 2025-12-28: Chain Umbenennung

Folgende Chains wurden umbenannt fuer bessere Konsistenz:

| Alt | Neu |
|-----|-----|
| `admin-chain-v2` | `intern-admin-chain` |
| `admin-chain` | entfernt |
| `api-chain` | `intern-api-chain` |
| `internal-network` | `intern-chain` |
| `secured-chain` | `intern-family-chain` |
| `secured-restricted-chain` | entfernt |
| `guest-chain` | `public-guest-chain` |
| `family-chain` | `public-family-chain` |
| `public-secured-chain` | `public-guest-chain` |

## Konfigurationsdateien

- Traefik Config: `/nfs/docker/traefik/configurations/config.yml` (auf vm-proxy-dns-01)
- OAuth2-Proxy: `/home/sam/docker-compose.yml` (auf vm-proxy-dns-01)
- Service-Uebersicht: `infra/traefik-services.md` und `infra/traefik-services.csv`
