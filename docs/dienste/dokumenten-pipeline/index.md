---
title: Dokumenten-Pipeline
description: Batch-Job, der den Dokumentenbestand des NAS liest, Text und Metadaten extrahiert und die Ablage entscheidet
tags:
  - service
  - nomad
  - batch
  - dokumente
---

# Dokumenten-Pipeline

Die Dokumenten-Pipeline liest den persönlichen Dokumentenbestand auf dem NAS, gewinnt daraus Text und strukturierte Metadaten und entscheidet, wohin ein Dokument gehört: nach [Paperless-ngx](../paperless/index.md) als Record oder in die Projektablage. Sie läuft als parametrisierter Nomad-Batch-Job und verändert den Bestand nicht.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `batch-jobs/f1-pipeline.nomad` (parametrisierter Batch) |
| Storage | Bestand lesend über `host_volume` `nfs-home-samuel`, Ergebnisdatenbank auf dem node-lokalen `host_volume` `f1-pipeline-daten` |
| Node | fest auf `vm-nomad-client-05` |
| Secrets | Vault `kv/data/shared/f1-pipeline` |
| Image | eigenes Python-Image aus der internen [Zot Registry](../../plattform/docker-registry/index.md), pro Stand mit dem Commit-Kürzel getaggt |
| Backup | periodischer Job `batch-jobs/f1-jobsdb-backup.nomad` (Details: [Betrieb](./betrieb.md#sicherung-der-ergebnisdatenbank)) |
| Quellcode | Gitea-Repository `sam/nas-aufraeumung` |

## Rolle im Stack

Die Pipeline ist die Verarbeitungsschicht zwischen dem rohen Bestand auf dem NAS und den beiden Ablagezielen. Sie nimmt Paperless genau die Aufgabe ab, für die dort früher AI-Sidecars zuständig waren -- Klassifikation, Verschlagwortung und Routing -- und liefert das Ergebnis als fertige Metadaten mit dem Dokument ab. Paperless bleibt damit auf seine Kernaufgabe beschränkt: archivieren, durchsuchbar machen, anzeigen.

Der zweite Grund für eine eigene Pipeline ist der Datenschutz-Zuschnitt: Welche Textteile ein externes Modell überhaupt zu sehen bekommen, entscheidet sie selbst, bevor ein Aufruf hinausgeht. Das lässt sich in einer fertigen Dokumenten-Anwendung nicht kontrollieren.

## Architektur

**Leitfrage:** Welchen Weg nimmt ein Dokument vom NAS bis zur Ablage-Entscheidung, und an welcher Stelle verlässt Text das eigene Netz?

```d2
classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  data: {
    shape: cylinder
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
  leseweg: { style: { stroke: "#0f766e" } }
  externweg: { style: { stroke: "#7c3aed" } }
}

direction: right

NAS: "NAS homes\nDokumentenbestand" { class: data }

Nomad: "Nomad-Batch f1-pipeline (c05)" {
  class: container
  EXTRACT: "Extraktion\nText, Metadaten, OCR-Urteil" { class: node }
  GATE: "Namens-Quarantäne\nund Platzhalter" { class: node }
  CALL: "Modell-Aufruf\nKlassifikation und Spans" { class: node }
}

DB: "Ergebnisdatenbank\n(node-lokal, c05)" { class: data }
VAULT: "Vault\nkv/data/shared/f1-pipeline" { class: node }
LLM: "externer Modell-Dienst" { class: node }
PL: "Paperless-ngx\n(REST-API)" { class: node }

NAS -> Nomad.EXTRACT: "1. liest read-only" { class: leseweg }
Nomad.EXTRACT -> DB: "2. Text und Befunde je Datei-Hash" { class: leseweg }
Nomad.EXTRACT -> Nomad.GATE: "3. Freigabe-Prüfung"
Nomad.GATE -> Nomad.CALL: "4. nur freigegebene Dokumente"
Nomad.CALL -> LLM: "5. Aufruf mit Platzhaltern" { class: externweg }
Nomad.CALL -> DB: "6. Metadaten und Fundstellen" { class: leseweg }
Nomad.CALL -> VAULT: "7. API-Zugang"
DB -> PL: "8. Import als Record" { class: leseweg }
```

Lesehilfe:

1. Der Bestand wird ausschliesslich lesend gelesen -- dreifach abgesichert ([Nur-Lese-Garantie](#nur-lese-garantie)).
2. Jedes Dokument wird über seinen Datei-Hash geführt, nicht über seinen Pfad; ein Umsortieren im Bestand macht darum keine Arbeit ungültig.
3. Vor jedem externen Aufruf prüft die Pipeline den Text gegen ein Namens-Lexikon.
4. Trifft das Lexikon, ist das Dokument hart von jeder externen Verarbeitung ausgeschlossen ([Datenschutz-Zuschnitt](#datenschutz-zuschnitt)).
5. Der Aufruf geht mit ersetzten Inhaber-Namen hinaus.
6. Zurück kommen strukturierte Metadaten und Fundstellen sensibler Passagen als Positionsangaben, nicht als neu geschriebener Text.
7. Der API-Zugang zum Modell-Dienst kommt über Workload Identity aus Vault.
8. Records gehen mit ihren Metadaten über die REST-API nach Paperless, alles andere bleibt in der Projektablage.

**Belegt gegen** `batch-jobs/f1-pipeline.nomad`, die `host_volume`-Definitionen in `group_vars/drbd_storage.yml` und `host_vars/vm-nomad-client-05.yml` sowie den Quellcode in `sam/nas-aufraeumung`, Stand 11.08.2026.

## Betriebsmodi

Der Job ist parametrisiert und verlangt bei jedem Dispatch einen Modus. Die Modi unterscheiden sich vor allem darin, ob externe Aufrufe stattfinden -- vom reinen Erfassungslauf ohne jeden Aufruf über den Messlauf auf einer Stichprobe bis zum durchgehenden Lauf über den Bestand. Die Modi und ihre Steuerparameter im Einzelnen: [Referenz](./referenz.md#betriebsmodi).

Das Vorgehen in Stufen ist Absicht. Ein Lauf über den ganzen Bestand kostet Geld und schickt Text nach draussen; beides wird erst freigegeben, wenn eine Stichprobe belegt hat, dass die Ergebnisse taugen. Die Erfassung selbst läuft deshalb bewusst ohne externen Kontakt und erzeugt trotzdem schon den vollständigen Bestandsüberblick.

Eine vorgeschaltete Grobsortierung war Teil des ursprünglichen Entwurfs und wurde nach der ersten Messung wieder ausgebaut: Sie brachte keinen messbaren Genauigkeitsgewinn, verschlechterte die Bestimmung der Dokumentart sogar, und kostete einen zweiten Textabfluss nach draussen pro Dokument. Der Code der Stufe bleibt erhalten und ist reaktivierbar, gefahren wird sie nicht mehr.

## Nur-Lese-Garantie

Der NFS-Export des Home-Shares ist schreibend, weil Paperless dort ablegt und DSM NFS-Rechte nur pro Freigabeordner vergibt (Details: [NAS-Storage: Referenz](../../storage/nas/referenz.md#home-zugang-der-dokumenten-verarbeitung)). Die Nur-Lese-Garantie für den Bestand trägt deshalb die Client-Seite, und zwar dreifach gestaffelt:

1. Der Mount `/nfs/home-samuel` ist im Kernel als `ro` gesetzt -- das gilt für jeden Prozess auf dem Node, auch für Jobs, die den Host-Pfad roh binden statt ein Volume zu deklarieren.
2. Das Nomad-`host_volume` `nfs-home-samuel` ist schreibgeschützt deklariert, womit nur Jobs zugreifen, die es explizit anfordern.
3. Der Container-Bind im Jobfile trägt zusätzlich das Nur-Lese-Flag.

Alle drei Stellen sind im Code als nicht verhandelbar kommentiert. Die Staffelung ist Absicht: Jede Ebene für sich könnte durch eine spätere Änderung fallen, die Kombination hält auch dann.

## Datenschutz-Zuschnitt

Zwei Mechanismen greifen vor jedem externen Aufruf und sind bewusst nicht abschaltbar:

- **Namens-Quarantäne:** Ein wortgrenzengenauer Scan aller extrahierten Texte gegen ein kleines Namens-Lexikon. Ein Treffer schliesst das Dokument hart von jeder externen Verarbeitung aus, unabhängig von allen anderen Einstellungen.
- **Inhaber-Platzhalter:** Die Namen des Archiv-Inhabers werden deterministisch durch semantische Platzhalter ersetzt, nie durch erfundene Namen -- ein Fake-Name würde in die extrahierten Metadaten einsickern und wäre dort nicht mehr von echten Angaben zu unterscheiden. Der Nebeneffekt ist erwünscht: Das Modell weiss dadurch explizit, wer der Inhaber ist, und trennt eigene von fremden Dokumenten besser.

Zwei weitere Wege halten Text von vornherein im Haus. Dokumente, deren Pfad eindeutig aus einem Systemverzeichnis stammt -- Programmordner, Anwendungsdaten, Paketverzeichnisse, Versionskontrolle, Papierkorb --, werden über eine deterministische Regel als Systemdatei abgelegt, ohne je einen externen Aufruf auszulösen. Das ist eine bewusste Route und kein Ausschluss: Die Dokumente bekommen ihre Ablage-Entscheidung, sie kostet nur nichts und verlässt das Netz nicht. Und der Bildkanal bleibt vollständig lokal -- Vorfilter, Bild-Triage und Texterkennung laufen auf eigener Hardware, kein Bild geht je an einen fremden Dienst.

Sensible Passagen kommen als Positionsangaben im Originaltext zurück, nicht als neu geschriebener Text. Eine zensierte Fassung entsteht daraus bei Bedarf lokal durch Ersetzung. Ein vom Modell neu geschriebener Text wäre nicht überprüfbar -- jede Abweichung könnte Korrektur oder Erfindung sein -- und würde zudem so viele Ausgabe-Token kosten wie das Dokument Eingabe-Token hat.

## Ergebnisdatenbank

Alle Befunde landen in einer einzelnen SQLite-Datei auf einem node-lokalen Volume. Der geteilte PostgreSQL-Cluster wäre technisch der naheliegende Ort gewesen und wurde bewusst verworfen: Die Datenbank trägt Volltexte und Klarnamen aus dem persönlichen Bestand, und die gehören weder in eine von mehreren Diensten geteilte Instanz noch in deren Backup-Ketten. Dazu passt das Zugriffsmuster -- genau ein Schreiber, keine Nebenläufigkeit, kein Netzwerkzugriff von aussen.

Der Preis dieser Wahl ist, dass die Datei nicht repliziert liegt. Aufgefangen wird das doppelt: durch einen täglichen verschlüsselten Auszug auf den Backup-Speicher und durch das Backup der ganzen VM auf den Proxmox Backup Server. Beides ist in [Betrieb](./betrieb.md#sicherung-der-ergebnisdatenbank) beschrieben.

## Ausführung und Nebenläufigkeit

Der Job ist fest an einen einzigen Node gebunden, weil die Ergebnisdatenbank node-lokal liegt. Ein Lauf auf dem zweiten Storage-Node würde eine zweite, leere Datenbank anlegen statt an der bestehenden weiterzuarbeiten.

Gegen parallele Läufe schützt die Pipeline sich selbst mit einer Dateisperre neben der Datenbank: Ein zweiter Dispatch bricht sofort mit klarer Meldung ab. Der Nomad-eigene Überlappungsschutz steht nur periodischen Jobs zur Verfügung und wäre hier nicht verfügbar gewesen.

Ein abgebrochener Lauf wird bewusst nicht automatisch wiederholt -- Neustart und Rescheduling stehen auf null Versuche. Die Verarbeitung ist wiederaufnehmbar, ein neuer Dispatch setzt an derselben Stelle fort; ein blinder Wiederholungslauf würde dagegen die Ursache eines Abbruchs verdecken. Aus demselben Grund läuft der Job mit niedriger Priorität: Ein stundenlanger Lauf darf nie einen Dienst verdrängen.

## Verwandte Seiten

- [Dokumenten-Pipeline Referenz](./referenz.md) -- Modi, Kommandos, Schema-Versionierung, Datenschutz-Schichten
- [Dokumenten-Pipeline Betrieb](./betrieb.md) -- Dispatch, Image-Bau, Sicherung, Betriebs-Fallstricke
- [Paperless-ngx](../paperless/index.md) -- Zielablage für Records
- [NAS-Storage: Referenz](../../storage/nas/referenz.md) -- Export-Regel und Mounts des Home-Zugangs
- [Batch Jobs](../../_querschnitt/batch-jobs.md) -- Übersicht der periodischen und parametrisierten Jobs
- [Zot Container Registry](../../plattform/docker-registry/index.md) -- Herkunft des Job-Images
- [Vault](../../plattform/vault/index.md) -- Secret-Injektion über Workload Identity
