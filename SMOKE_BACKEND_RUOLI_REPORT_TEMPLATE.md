# Smoke Backend & Ruoli Report

Compilare un report per ogni giro di collaudo manuale.

## Metadata

- Data:
- Ambiente:
- Versione/commit:
- Tester:
- Backend disponibile: `SI/NO`
- Ruoli disponibili: `E / I / S`

## Gate automatico

| Check | Esito | Note |
| --- | --- | --- |
| `npm run build` |  |  |
| `npm run unit-test:headless` |  |  |
| `npm run integration-test:headless` |  |  |

## Smoke backend/ruoli

| ID | Scenario | Ruolo | Esito | Evidenza / Note |
| --- | --- | --- | --- | --- |
| S1 | Bootstrap backend reale |  |  |  |
| S2 | Backend giu` -> errore esplicito |  |  |  |
| S3 | Refresh `F5` su screen attive |  |  |  |
| S4 | Visibilita` tile coerente col ruolo |  |  |  |
| S5 | Flow A `Screen3` save reale |  |  |  |
| S6 | Flow A `Screen4` save reale |  |  |  |
| S7 | Back dirty `Screen4` |  |  |  |
| S8 | Allegati reali `Screen4` |  |  |  |
| S9 | `LOCK / RELEASE` reale |  |  |  |
| S10 | `Approve / Reject` reali |  |  |  |
| S11 | `Screen6` template/material list reali |  |  |  |
| S12 | `Screen6` upload/check/send reale |  |  |  |
| S13 | Export reale `Screen3` |  |  |  |
| S14 | Export reale `Screen4` |  |  |  |
| S15 | Export reale `Screen5` |  |  |  |
| S16 | Permessi reali `E` | E |  |  |
| S17 | Permessi reali `I` | I |  |  |
| S18 | Permessi reali `S` | S |  |  |

## Edge cases

| ID | Scenario | Esito | Evidenza / Note |
| --- | --- | --- | --- |
| E1 | Campi obbligatori mancanti |  |  |
| E2 | Percentuali != `100` |  |  |
| E3 | Partial error backend |  |  |
| E4 | Errore `500` durante POST |  |  |
| E5 | Doppio save consecutivo |  |  |
| E6 | Nuova riga -> save -> re-save |  |  |

## Esito finale

- Stato finale: `PASS / FAIL / BLOCKED`
- Bug aperti:
- Blocker esterni:
- Note finali:
