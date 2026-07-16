<!-- AUTO-GENERIERT durch scripts/gen-authentik-zugriffsmatrix.mjs -- nicht haendisch editieren -->

## App -> Gruppen

Welche Authentik-Gruppen koennen welche Application starten. Apps ohne Eintrag sind fuer **alle authentifizierten User** offen.

| Application | Zugriff durch | Engine-Mode |
| :--- | :--- | :---: |
| audiobookshelf | admin | `any` |
| Banner | admin | `any` |
| czkawka | admin | `any` |
| dbgate | admin | `any` |
| Directus Gravel | admin | `any` |
| flame | admin | `any` |
| flame-intra | admin | `any` |
| gitea | admin | `any` |
| Gitea OIDC | admin | `any` |
| grafana | admin | `any` |
| Grafana | admin | `any` |
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
| Keep Mobile | admin | `any` |
| kimai | admin | `any` |
| lazylibrarian | admin | `any` |
| linstor-gui | admin | `any` |
| loki | admin | `any` |
| meshcmd | admin | `any` |
| metabase | admin | `any` |
| node-red | admin | `any` |
| Nomad | admin | `any` |
| notifiarr | admin | `any` |
| Open-WebUI | admin | `any` |
| paperless | admin | `any` |
| Paperless | admin | `any` |
| paperless-ai | admin | `any` |
| pdm | admin | `any` |
| Profilarr | admin | `any` |
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
| Tandoor (SSO) | admin, family | `any` |
| uptime-kuma | admin | `any` |
| video-grabber | admin | `any` |
| vitepress-wiki | admin | `any` |
| youtube-dl | admin | `any` |
| zigbee2mqtt | admin | `any` |

## Gruppe -> Apps

Umgekehrte Sicht: pro Authentik-Gruppe alle Applications mit direktem Group-Binding (Policy- oder User-Bindings werden hier nicht aufgeloest).

| Gruppe | Applications |
| :--- | :--- |
| admin _(Superuser)_ | audiobookshelf, Banner, czkawka, dbgate, Directus Gravel, flame, flame-intra, gitea, Gitea OIDC, grafana, Grafana, handbrake, homelab-admin, homelab-family, homelab-guest, homepage-intra, immo-monitor, influxdb, jellyseerr, jellystat, Keep Mobile, kimai, lazylibrarian, linstor-gui, loki, meshcmd, metabase, node-red, Nomad, notifiarr, Open-WebUI, paperless, Paperless, paperless-ai, pdm, Profilarr, prowlarr, Proxmox, radarr, sabnzbd, solidtime, sonarr, special-youtube-dl, special-yt-dlp, stash, stash-secure, Tandoor (SSO), uptime-kuma, video-grabber, vitepress-wiki, youtube-dl, zigbee2mqtt |
| authentik Admins _(Superuser)_ | _(keine)_ |
| authentik Read-only | _(keine)_ |
| family | immo-monitor, jellyseerr, Tandoor (SSO) |
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

::: warning Traefik unerreichbar
Gap-Analyse uebersprungen: `fetch failed`
:::

---

_Generiert am 11.06.2026, 13:08._
_54 Applications · 6 Gruppen · 57 App-Bindings · 0 Traefik-Router._
