# Smoke Backend & Ruoli

Questo documento definisce il collaudo manuale minimo da eseguire contro backend reale.

Obiettivo:
- verificare i punti che la safety net automatica non puo` chiudere da sola
- rendere ripetibile il collaudo per chi subentra
- avere un gate chiaro prima di dichiarare una release "senza regression osservabili"

## Gate automatico prima degli smoke

Eseguire sempre prima:

```bash
npm run build
npm run unit-test:headless
npm run integration-test:headless
```

La release non passa agli smoke manuali se uno di questi tre step e` rosso.

## Evidenze da raccogliere

Per ogni smoke segnare:
- data e ambiente
- ruolo usato: `E`, `I`, `S`
- risultato: `PASS`, `FAIL`, `BLOCKED`, `N/A`
- screenshot o nota breve
- eventuale payload/backend message se presente

Tenere sempre aperta la console browser:
- nessun errore rosso inatteso
- nessun `module not found`
- log con prefissi `[S0]`, `[S2]`, `[S3]`, `[S4]`, `[S5]`, `[S6]`

## Perimetro gia` coperto dalla safety net

La rete automatica copre gia`:
- build UI5
- contratti interni di save/copy/delete/permessi/cache
- Flow A base `Screen0 -> Screen1 -> Screen2 -> Screen3 -> Screen4`
- Flow B base `Screen0 -> Screen6`
- Flow C base `Screen0 -> Screen5`
- profili ruolo sintetici `E`, `I`, `S` nei flow principali

Questi smoke manuali servono invece a chiudere:
- backend reale
- ruoli reali
- download reali
- error handling reale
- console/runtime reale in browser

## Smoke minimi obbligatori

### 1. Bootstrap reale

- Avvio app contro backend reale
  - atteso: `Screen0` si apre correttamente
  - atteso: tile coerenti col ruolo
- Avvio con backend giu`
  - atteso: errore esplicito, nessun fallback mock
- Refresh `F5` su `Screen2`, `Screen3`, `Screen4`, `Screen6`
  - atteso: nessun loop, nessuna schermata corrotta

### 2. Ruoli reali

- ruolo `E`
  - atteso: no tile aggregato `Screen5`
  - atteso: no approve/reject
- ruolo `I`
  - atteso: tile aggregato visibile
  - atteso: approve/reject visibili
- ruolo `S`
  - atteso: tile aggregato visibile
  - atteso: add/copy/delete visibili dove previsti
  - atteso: il veto `AP non eliminabile` resta attivo

### 3. Flow A reale

- `Screen0 -> Screen1 -> Screen2 -> Screen3`
- modifica in `Screen3` e save
  - atteso: persistenza reale
- navigazione a `Screen4`
- modifica in `Screen4` e save
  - atteso: permanenza su `Screen4`
  - atteso: back a `Screen3` e rientro in `Screen4` con dati persistiti
- browser back con dirty in `Screen4`
  - atteso: dialog modifiche non salvate

### 4. Allegati reali `Screen4`

- upload allegato
- incremento contatore
- propagazione contatore alle altre righe entro 1-2 secondi

### 5. `LOCK / RELEASE` reale su `Screen2`

- cambio stato materiale
- reload o rientro
- atteso: persistenza reale del nuovo stato

### 6. `Approve / Reject` reali

- approve con ruolo `I` o `S`
  - atteso: stato aggiornato e persistenza
- reject con motivo
  - atteso: motivo obbligatorio e persistenza

### 7. `Screen6` reale

- download template reale
- download material list reale
- upload file reale
- `CHECK`
- `SEND`
- refresh durante upload

Attesi:
- file scaricati corretti
- messaggi coerenti
- righe in errore evidenziate correttamente

### 8. Export reali

Da verificare su:
- `Screen3`
- `Screen4`
- `Screen5`

Attesi:
- file scaricato
- header localizzati
- righe coerenti con i filtri attivi

## Smoke edge consigliati

Se il backend consente di forzarli:

- save con campi obbligatori mancanti
- percentuali diverse da `100`
- partial error backend
- errore `500` durante POST
- doppio save consecutivo
- nuova riga con `Guid NEW_xxx` seguita da save e re-save

## Regola di uscita

Possiamo dichiarare il collaudo backend/ruoli consolidato quando:
- gate automatico tutto verde
- tutti gli smoke minimi obbligatori sono `PASS` o `N/A`
- nessun `FAIL` aperto sui flow A/B/C
- eventuali `BLOCKED` dipendono solo da dati o utenze mancanti, non da bug applicativi

## Uso operativo

Usare insieme a:
- [KT_MANUALE_PROGETTO.md](/Users/gabrielemurgia/Desktop/progettoVALENTINO/apptracciabilit-/KT_MANUALE_PROGETTO.md)
- [SMOKE_BACKEND_RUOLI_REPORT_TEMPLATE.md](/Users/gabrielemurgia/Desktop/progettoVALENTINO/apptracciabilit-/SMOKE_BACKEND_RUOLI_REPORT_TEMPLATE.md)
