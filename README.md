# Homelab Wiki

VitePress-basierte Dokumentation fuer die Homelab-Infrastruktur.

## Entwicklung

```bash
npm ci
npm run dev
```

Oeffnet den lokalen Dev-Server unter `http://localhost:5173`.

## Build

```bash
npm run build
```

Das Build-Ergebnis liegt in `docs/.vitepress/dist/`.

## Deployment

Das Wiki wird automatisch deployed:
1. Push auf `main` triggert GitHub Actions (Build-Validierung + Dead-Link-Check)
2. Der Self-Hosted Runner triggert den Webhook auf dem Nomad Job
3. Der `git-sync` Sidecar pullt die Aenderungen und baut die Seite neu

Fallback: Der Sidecar pollt alle 5 Minuten automatisch.
