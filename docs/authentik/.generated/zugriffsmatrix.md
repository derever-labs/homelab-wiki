<!-- AUTO-GENERIERT durch scripts/gen-authentik-zugriffsmatrix.mjs -- nicht haendisch editieren -->

## App -> Gruppen

Welche Authentik-Gruppen koennen welche Application starten. Apps ohne Eintrag sind fuer **alle authentifizierten User** offen.

| Application | Zugriff durch | Engine-Mode |
| :--- | :--- | :---: |
| audiobookshelf | admin | `any` |
| czkawka | admin | `any` |
| dbgate | admin | `any` |
| Directus Gravel | admin | `any` |
| flame | admin | `any` |
| flame-intra | admin | `any` |
| gatus | admin | `any` |
| gitea | admin | `any` |
| Gitea OIDC | admin | `any` |
| grafana | admin | `any` |
| Grafana | admin | `any` |
| guacamole | admin | `any` |
| handbrake | admin | `any` |
| Homelab LDAP | Policy: ldap-allowed-groups | `any` |
| homelab-admin | admin | `any` |
| homelab-family | admin | `any` |
| homelab-guest | admin | `any` |
| homepage-intra | admin | `any` |
| immo-monitor | admin, family | `any` |
| influxdb | admin | `any` |
| jellyseerr | admin, family, guest | `any` |
| jellystat | admin | `any` |
| Keep | _alle authentifizierten User_ | `any` |
| kimai | admin | `any` |
| lazylibrarian | admin | `any` |
| linstor-gui | admin | `any` |
| loki | admin | `any` |
| meshcmd | admin | `any` |
| metabase | admin | `any` |
| node-red | admin | `any` |
| notifiarr | admin | `any` |
| Open-WebUI | admin | `any` |
| paperless | admin | `any` |
| Paperless | admin | `any` |
| paperless-ai | admin | `any` |
| pdm | admin | `any` |
| prowlarr | admin | `any` |
| Proxmox | admin | `any` |
| radarr | admin | `any` |
| sabnzbd | admin | `any` |
| solidtime | admin | `any` |
| sonarr | admin | `any` |
| special-youtube-dl | admin | `any` |
| special-yt-dlp | admin | `any` |
| stash | admin | `any` |
| stash-secure | admin | `any` |
| tandoor | admin | `any` |
| uptime-kuma | admin | `any` |
| video-grabber | admin | `any` |
| vitepress-wiki | admin | `any` |
| youtube-dl | admin | `any` |
| zigbee2mqtt | admin | `any` |

## Gruppe -> Apps

Umgekehrte Sicht: pro Authentik-Gruppe alle Applications mit direktem Group-Binding (Policy- oder User-Bindings werden hier nicht aufgeloest).

| Gruppe | Applications |
| :--- | :--- |
| admin | audiobookshelf, czkawka, dbgate, Directus Gravel, flame, flame-intra, gatus, gitea, Gitea OIDC, grafana, Grafana, guacamole, handbrake, homelab-admin, homelab-family, homelab-guest, homepage-intra, immo-monitor, influxdb, jellyseerr, jellystat, kimai, lazylibrarian, linstor-gui, loki, meshcmd, metabase, node-red, notifiarr, Open-WebUI, paperless, Paperless, paperless-ai, pdm, prowlarr, Proxmox, radarr, sabnzbd, solidtime, sonarr, special-youtube-dl, special-yt-dlp, stash, stash-secure, tandoor, uptime-kuma, video-grabber, vitepress-wiki, youtube-dl, zigbee2mqtt |
| authentik Admins _(Superuser)_ | _(keine)_ |
| authentik Read-only | _(keine)_ |
| family | immo-monitor, jellyseerr |
| guest | jellyseerr |
| ldap-searchers | _(keine)_ |


## Policy-Details

Bedingungen der Policies, die in den App-Bindings oben referenziert werden.

### ldap-allowed-groups

**Typ:** `authentik_policies_expression.expressionpolicy`

```python
return ak_is_group_member(request.user, name="admin") or ak_is_group_member(request.user, name="family") or ak_is_group_member(request.user, name="guest") or request.user.username == "svc-jellyfin-ldap"
```

## Cluster-Apps ohne SSO-Schutz

Hosts mit Web-UI, bei denen kein einziger Router eine SSO-Middleware traegt und die nicht via OIDC in Authentik registriert sind. Kandidaten fuer eine SSO-Anbindung.

| Host | Traefik-Service | Middlewares |
| :--- | :--- | :--- |
| hollama.ackermannprivat.ch | `hollama` | `intern-noauth@file` |
| obsidian-sync.ackermannprivat.ch | `obsidian-livesync` | `intern-noauth@file`, `obsidian-cors@consulcatalog` |
| ollama.ackermannprivat.ch | `ollama` | `intern-noauth@file` |
| p.ackermannprivat.ch | `vaultwarden` | `intern-noauth@file` |
| suggest.ackermannprivat.ch | `suggestarr` | `intern-noauth@file` |
| watch.ackermannprivat.ch | `jellyfin` | `public-noauth@file`, `jellyfin-login-ratelimit@file` |

---

_Generiert am 12.05.2026, 19:36._
_52 Applications · 6 Gruppen · 54 App-Bindings · 95 Traefik-Router._
