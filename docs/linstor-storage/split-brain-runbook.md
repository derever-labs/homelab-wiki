---
title: Split-Brain Recovery Runbook
description: Notfall-Runbook für DRBD-Split-Brain -- destruktive Recovery mit Datenverlust auf dem Secondary
tags:
  - linstor
  - drbd
  - runbook
  - notfall
  - split-brain
---

# Split-Brain Recovery Runbook

Destruktives Notfall-Runbook für den Fall, dass eine DRBD-Ressource in Split-Brain gerät. Regulärer Betrieb, Failover und Volume-Verwaltung stehen in [Linstor Betrieb](./betrieb.md).

::: danger Destruktive Prozedur
Dieses Runbook verwirft Daten auf einem der beiden Nodes. Es ist der letzte Ausweg, wenn der Quorum-Mechanismus versagt hat. Erst ausführen, wenn der Node mit den aktuelleren Daten sicher bestimmt ist.
:::

## Symptom

Ein Split-Brain tritt auf, wenn beide Storage-Nodes sich gleichzeitig als DRBD Primary sehen und die Replikationsverbindung getrennt ist. Im Normalbetrieb verhindert der Quorum-Mechanismus (2-von-3, mit dem disklosen Witness client-04) diesen Zustand. Ein Split-Brain ist deshalb nur möglich, wenn das Quorum selbst versagt.

## Voraussetzung

Vor der Recovery klären, welcher Node die aktuelleren Daten trägt. Dieser Node bleibt Primary. Der andere wird als Secondary degradiert, seine abweichenden Schreibvorgänge werden verworfen.

::: danger Datenverlust auf dem Secondary
Beim Verwerfen der Daten auf dem Secondary gehen alle Schreibvorgänge verloren, die nur auf diesem Node stattfanden. Vor der Recovery prüfen, ob relevante Daten betroffen sind.
:::

## Prozedur

1. **Aktuelleren Node bestimmen** -- feststellen, welcher der beiden Nodes den zu erhaltenden Datenstand hält. Dieser Node bleibt Primary.
2. **Secondary degradieren und Daten verwerfen** -- den anderen Node zum Secondary degradieren und seine abweichenden Daten verwerfen. Dieser Schritt ist destruktiv.
3. **Verbindung wiederherstellen** -- die Replikationsverbindung wieder aufbauen. Der Secondary synchronisiert seinen Datenstand anschliessend automatisch vollständig vom Primary.

## Nach der Recovery

- Sync-Status der Ressource prüfen, bis beide Seiten wieder `UpToDate` sind.
- Ursache des Quorum-Versagens untersuchen -- ein Split-Brain im Normalbetrieb deutet auf einen Defekt im Quorum-Pfad hin (Netzwerkpartition in Kombination mit einem ausgefallenen Witness).

::: warning linstor_db
Die Controller-Datenbank `linstor_db` hat eine eigene io-error-Quorum-Policy und wird von drbd-reactor verwaltet. Sie darf nicht wie ein reguläres Volume manuell behandelt werden.
:::

## Verwandte Seiten

- [Linstor Betrieb](./betrieb.md) -- Failover-Szenarien und Troubleshooting
- [Linstor & DRBD](./index.md) -- Quorum-Mechanismus und HA-Design
- [Linstor Referenz](./referenz.md) -- CSI-Attribute, Metriken und Performance
