---
title: Dienste
description: Sammelbereich für eigenständige Homelab-Dienste, die keinem Themen-Oberkapitel zugeordnet sind -- von Bookmark-Manager und Dokumenten-Management über CI-Runner bis zu den kleinen Web-Tools
tags:
  - overview
  - services
---

# Dienste

Dieses Kapitel bündelt die eigenständigen Dienste des Homelabs, die keinem der thematischen Oberkapitel (Edge, Medien, Monitoring, Netz, Plattform, Smart Home, Storage) zugeordnet sind. Es ist bewusst ein dauerhafter Sammelbereich und kein Big Picture: Jeder Eintrag ist ein für sich stehendes System mit eigener Seite.

## Systeme

- [Wartungsbanner](./banner/) -- Wartungsbanner für Jellyfin über Jellyfins natives Custom-CSS
- [Browserless](./browserless/) -- Geteilter Headless-Browser-Dienst für Rendering und Seiten-Bedienung
- [ChangeDetection.io](./changedetection/) -- Website-Änderungsüberwachung mit geteiltem Browser-Dienst für JavaScript-Rendering
- [Claude Usage](./claude-usage/) -- Dashboard für die Usage-Limiten der drei Claude-Konten mit Reset-Countdown
- [Dashboards](./dashboards/) -- Flame als öffentliche Startseite und Homepage als internes Dashboard
- [DbGate](./dbgate/) -- Web-basiertes Datenbank-Management für den PostgreSQL Shared Cluster
- [Directus Gravel](./directus-gravel/) -- Headless CMS für die persönliche Gravel-Bike-Recherche
- [Dokumenten-Pipeline](./dokumenten-pipeline/) -- Batch-Verarbeitung des NAS-Dokumentenbestands mit Metadaten-Extraktion und Ablage-Routing
- [Filebrowser](./filebrowser/) -- Web-basierter Dateimanager als System-Job auf allen Nomad-Nodes
- [Finanzen-Website](./finanzen/) -- Familien-Dokumentenportal zum MFH-Projekt mit PDF-Reader, Kommentaren und Frage-Assistent
- [Gitea](./gitea/) -- Self-hosted Git-Server mit PostgreSQL und SSH-Zugang
- [GitHub Actions Runner](./github-runner/) -- Self-hosted Runner für CI/CD aller Repos in derever-labs
- [Immo Monitor](./immo-monitor/) -- SvelteKit-Web-App zur Bedienung und Auswertung des Dottikon-Mietmarkt-Monitorings
- [Immobilien-Monitoring](./immobilien-monitoring/) -- Automatisiertes Mietmarkt-Monitoring via Scrapfly mit KI-Enrichment und Telegram-Alerts
- [Karakeep](./karakeep/) -- Selbstgehosteter Bookmark-Manager als zentrale Sammelstelle für Lehrmaterial
- [Karakeep Ingest](./karakeep-ingest/) -- Anreicherungs-Ingest für Karakeep (LinkedIn, Instagram, YouTube und Web-Links), dazu die Überholspur für Einzel-Abrufe
- [LLM-Stack](./llm-stack/) -- Ollama als LLM-Backend mit Open WebUI als Chat-Interface
- [Metabase](./metabase/) -- Business-Intelligence-Plattform für Datenvisualisierung und Dashboards
- [n8n](./n8n/) -- Workflow-Automation-Plattform für Datenverarbeitung und Integrationen
- [ntfy](./ntfy/) -- Selbstgehosteter Push-Benachrichtigungsdienst mit Action-Buttons für Homelab-Services
- [Obsidian LiveSync](./obsidian-livesync/) -- Selbstgehosteter Obsidian-Sync-Server mit CouchDB-Backend
- [Paperless-ngx](./paperless/) -- Dokumenten-Management mit OCR, automatischer Klassifizierung und PostgreSQL-Backend
- [SMTP Relay](./smtp-relay/) -- Zentraler Mail-Relay für Homelab-Infrastruktur und Services
- [Tandoor Recipes](./tandoor/) -- Selbstgehostete Rezeptverwaltung mit PostgreSQL-Backend
- [Todo Ingest](./todo-ingest/) -- To-dos per iPhone-Diktat erfassen, mit Claude-Klassifikation und ClickUp-Anlage
- [MeshCommander](./utility-tools/) -- Intel AMT Out-of-Band-Management
- [Vaultwarden](./vaultwarden/) -- Selbstgehosteter Passwort-Manager (Bitwarden-API-kompatibel) auf PostgreSQL und DRBD-Volume
- [VitePress Wiki](./vitepress-wiki/) -- Homelab-Dokumentation mit automatischem Deployment
