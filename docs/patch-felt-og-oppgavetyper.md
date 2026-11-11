# PATCH-felt for oppgavetyper i Helsenorge

**Informasjonslenke, tittel, mottaker, avsender og oppgavetype kan ikke endres
med direkte PATCH i den gjennomgåtte implementasjonen.** Ustøttede operasjoner
avvises med feilkode **2146**. Startdato, beskrivelse, frister, status,
statusbegrunnelse, nye notater og elementreferanser har støtte med begrensningene
nedenfor.

Oversikten er kontrollert 11. november 2026 mot vedlagte `HN-Oppgave.zip`,
Helsenorges offentlige dokumentasjon og HL7 R4. Koden bruker samme PATCH-validator
for alle seks oppgavetyper; den har ingen egen feltliste per type. Dette bekrefter
implementasjonen i arkivet, ikke hvilken versjon som er satt i drift.
Referansene K1–K9 viser til [kodegrunnlaget](#kodegrunnlag-og-kildereferanser).

## Feltoversikt per oppgavetype

**Ja** betyr at operasjonen støttes av den felles koden, innenfor reglene for
operasjon, status og gyldighet. **Typeflyt** betyr at teknisk statusstøtte også må
brukes i samsvar med oppgavetypens arbeidsflyt. **Nei** betyr at direkte PATCH av
feltet avvises. Skjema omfatter både Helsenorges og ekstern skjemautfyller.

| Task-felt | Informasjon | Skjema | Samtykke | Generisk ekstern | Verktøystart | Betaling |
| --- | --- | --- | --- | --- | --- | --- |
| `description` | Ja | Ja | Ja | Ja | Ja | Ja |
| `restriction.period.start` | Ja | Ja | Ja | Ja | Ja | Ja |
| `restriction.period.end` | Ja | Ja | Ja | Ja | Ja | Ja |
| Deadline via `restriction` eller `restriction.period` | Ja | Ja | Ja | Ja | Ja | Ja |
| `status` | Typeflyt | Typeflyt | Typeflyt | Typeflyt | Typeflyt | Typeflyt |
| `statusReason`, sammen med faktisk statusendring | Typeflyt | Typeflyt | Typeflyt | Typeflyt | Typeflyt | Typeflyt |
| `note`, bare tillegg | Ja | Ja | Ja | Ja | Ja | Ja |
| `basedOn` | Ja | Ja | Ja | Ja | Ja | Ja |
| `instantiatesUri` | Nei | Nei | Nei | Nei | Nei | Nei |
| `code.text` og øvrige direkte felt i avvisningstabellen | Nei | Nei | Nei | Nei | Nei | Nei |

Grunnlag: felles rute og validering (K1–K3), endringsregler (K4) og mapping av
oppgavetyper (K6). Tabellen bygger på felles kode, ikke på kjørte tester av alle
kombinasjoner av felt og oppgavetype.

## Tillatte operasjoner og nøyaktige feltstier

`PatchHelper.Validate` kontrollerer hele listen med operasjoner før patchen
anvendes. For `replace` og `delete` må feltstien finnes i listen nedenfor.
For `add` kontrollerer denne validatoren bare feltnavnet; bruk `Task` som
forelder, og en verdi med korrekt FHIR-type. Patchmotoren behandler deretter
selve operasjonen (K2).

| Operasjon | `path` | `name` ved tillegg |
| --- | --- | --- |
| `replace` | `Task.status` | — |
| `replace` | `Task.statusReason` | — |
| `replace` | `Task.description` | — |
| `replace` | `Task.restriction` | — |
| `replace` | `Task.restriction.period` | — |
| `replace` | `Task.restriction.period.end` | — |
| `replace` | `Task.restriction.period.start` | — |
| `replace` | `Task.basedOn` | — |
| `add` | `Task` | `note` |
| `add` | `Task` | `basedOn` |
| `delete` | `Task.basedOn` | — |

Andre `replace`-/`delete`-stier, andre feltnavn for `add` og øvrige
operasjonstyper avvises med 2146. Dette omfatter `insert`, `move`, `add statusReason`, direkte
`replace Task.statusReason.text`, redigering/sletting av notater og direkte
PATCH av deadline-extension. Endre deadline ved å erstatte `restriction` eller
`restriction.period`, med nødvendige eksisterende verdier bevart (K2).

Deadline har URL
`http://helsenorge.no/fhir/StructureDefinition/hn-task-deadline`.
Koden leser extension både under `restriction.period` og under `restriction`;
førstnevnte sjekkes først (K6). At hele forelderelementet kan erstattes, er ikke
en bekreftelse på støtte for vilkårlige andre underfelter.

For `basedOn` beskriver Helsenorge tillegg med `add`, mens `replace` og
`delete` gjelder samlingen av referanser.
[Helsenorges PATCH-regler](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1799520257).

HL7 krever korrekt datatype og et eksisterende mål for `replace`.
Et gyldig FHIRPath Patch-dokument kan likevel avvises av Helsenorges avgrensninger.
[HL7 R4 FHIRPath Patch](https://hl7.org/fhir/R4/fhirpatch.html).

## Felter som avvises ved direkte PATCH

| Felt eller feltgruppe | Betydning og konsekvens |
| --- | --- |
| `Task.instantiatesUri` | Informasjonslenke eller lenke til ekstern utførelse. URL-endring avvises med 2146. |
| `Task.code`, inkludert `code.text` | Tittel kan ikke endres selv om beskrivelsen kan endres. |
| `Task.owner` | Oppgaven kan ikke flyttes til en annen innbygger med PATCH. |
| `Task.requester` og avsender i `Task.contained` | Avsender og kontaktopplysninger kan ikke oppdateres direkte. |
| `Task.focus`, inkludert `type`, `identifier` og `display` | Oppgavetype og referanse til skjema, samtykke eller verktøy kan ikke byttes. |
| `Task.id` og `Task.identifier` | Ressursidentitet og forretningsidentifikator kan ikke byttes. |
| `Task.intent` | Kan ikke endres mellom for eksempel `plan` og `proposal`. |
| `Task.meta`, inkludert `security` og `tag` | Tjenesteområde, tilgangsmerking og andre Task-metadata kan ikke endres direkte. |
| `Task.input`, `Task.output` og øvrige direkte extension-stier | Ingen generell oppdateringsstøtte. Deadline håndteres via de tillatte forelderelementene. |

Grunnlag: den uttømmende operasjonslisten i K2. Tabellen viser sentrale felt,
ikke alle mulige stier i HL7s Task-ressurs.

**Varslingsmetadata er et eget tilfelle:** `Parameters.meta.tag` med system
`http://helsenorge.no/fhir/varsling` og kode `1` undertrykker varsling for
oppdateringen. Dette er metadata på patchdokumentet, ikke en endring av
`Task.meta` (K2, K4).
[NHNs Parameters-eksempler](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1679360035).

## Status og arbeidsflyt for hver oppgavetype

| Oppgavetype | `Task.focus.type` | Hvem gjør hva i arbeidsflyten? |
| --- | --- | --- |
| Informasjonsoppgave | `Communication` | Helsenorge setter `completed` ved første uthopp. Informasjonsnettstedet skal ikke fullføre oppgaven med PATCH. |
| Skjemaoppgave | `Questionnaire` | Avklar statusoppfølging for valgt skjemautfyller. Endring av Task endrer ikke `Questionnaire` eller `QuestionnaireResponse`. |
| Samtykkeforespørsel | `Consent` | Task-status skal ikke erstatte innbyggers samtykkevalg eller endring av samtykkeressursen. |
| Generisk ekstern oppgave | `Task` | Eksternt system melder fullføring. Typesiden beskriver status-PATCH med undertrykking av varsel etter utførelse. |
| Verktøystartoppgave | `Device` | Innbygger tar stilling til bruk av verktøyet. Task-PATCH er ikke en måte å bytte verktøy på. |
| Betalingsoppgave | `PaymentNotice` | Ekstern betalingsløsning melder fullføring. Typesiden viser til det separate, forenklede status-API-et. |

Typemappingen finnes i K6. Arbeidsflytene er beskrevet i
[oppgavetyper](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1805680641),
[informasjonsoppgave](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2619211802),
[generisk ekstern oppgave](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1680867329),
[verktøystartoppgave](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2468380673)
og [betalingsoppgave](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/3153199105).

PATCH-validatoren håndhever ikke egne statusoverganger per oppgavetype (K2–K4).
Teknisk aksept er derfor ikke tilstrekkelig grunnlag for å endre status utenfor
den avtalte arbeidsflyten. `Schedule` er ikke med i arkivets seks typer (K6);
den er merket som planlagt i
[Task-profilen](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/742948883).

## Status og gyldighet begrenser oppdatering

| Endring | Hva den gjennomgåtte koden gjør |
| --- | --- |
| Beskrivelse, startdato, sluttdato, deadline, status eller statusbegrunnelse | Krever at eksisterende oppgave er `ready` eller `in-progress` og ikke utløpt. |
| Faktisk statusendring | Tillater ny status `completed`, `cancelled`, `in-progress` eller `entered-in-error`. Tilbakestilling til `ready` avvises. |
| Endret `statusReason` | Krever en faktisk statusendring i samme PATCH. Å sende samme statusverdi på nytt er ikke nok. |
| Bare nytt notat | Tillates også etter fullføring eller utløp; dette er dekket av eksisterende tester. |
| Bare `basedOn` | Treffer et unntak i koden som omgår status- og utløpskontroll. Dette avviker fra offentlig kontrakt; se nedenfor. |

Grunnlag: K4 og eksisterende tester K7–K9. Et notat sammen med en annen faktisk
feltendring gir ikke unntak for den andre endringen. Startdato støttes eksplisitt,
og K9 inneholder en positiv test for endring av startdato.

Den offentlige kontrakten sperrer beskrivelse, frister, status,
statusbegrunnelse og `basedOn` etter avslutning eller utløp. Nye frister skal
ligge minst én dag frem i tid, og deadline skal ligge senere enn ordinær
sluttdato. Følg disse avtalte reglene selv der kodekontrollene er mindre strenge.
[NHNs forretningsregler](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1799520257).

## Avvik og forbehold som må avklares ved oppkobling

### Endret sluttdato med uendret deadline

Helsenorge beskriver at begge fristene skal sendes ved endret sluttdato når
oppgaven har deadline, også når deadline beholdes.
[Offentlig fristregel](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1799520257).

Koden sammenligner derimot verdier før og etter PATCH. I `PatchRequest.Sanitize`
settes lagret gyldig-til-dato til ny ordinær sluttdato når sluttdatoen endres og
deadline ikke registreres som endret. Dette skjer også hvis den samme deadline
sendes på nytt (K2, K4, K5). En uendret deadline i payload er derfor **ikke
tilstrekkelig til å sikre at lagret gyldighet bevares**.

Avklar og test dette mot avtalt API-versjon. Test både endret sluttdato med
uendret deadline og at begge faktisk endres. Kontroller lagret gyldighet og
oppgavens oppførsel; en vellykket kvittering alene er ikke nok.
Ikke endre en faglig bestemt deadline bare for å omgå denne oppførselen.

### Deadline alene og sammenligning av datoer

Hvis deadline faktisk endres uten en faktisk endring av ordinær sluttdato,
avviser `Sanitize` oppdateringen med ugyldig frist (2114). Å sende uendret
sluttdato på nytt oppfyller ikke dette kravet (K4, K9).

Koden tillater også lik ordinær sluttdato og deadline; K9 har et positivt
testtilfelle med like datoer. Den offentlige regelen krever at deadline er senere.
Bruk den strengere offentlige regelen i integrasjonen og avklar avviket med
Helsenorge.

### Elementreferanser etter avslutning eller utløp

`KunNotatLagtTil` kontrollerer ikke `ElementReferanser`. Dermed behandles en
endring bare av `basedOn` som et tilfelle uten andre feltendringer, og validering
av status og utløp hoppes over (K4). Dette er en observert svakhet i
implementasjonen, ikke en anbefalt utvidelse av kontrakten.

### Varsling av beskrivelsesendringer

`PatchTaskService` velger varslingsregel ut fra `BrukNyttOppgavesenter`.
Med ny regel gir en endret beskrivelse alene ikke varsel; den eldre regelen
inkluderer beskrivelsesendring. Begge tar hensyn til undertrykking av varsel
(K3, K4). K7 har et testtilfelle som bekrefter fravær av varsel for
beskrivelsesendring med ny regel. Avtal forventet resultat for aktuelt miljø.

## Kodegrunnlag og kildereferanser

Vedlegg: `HN-Oppgave.zip`, gjennomgått 11. november 2026.
SHA-256: `b41a0121f954b1baa6de44ed2d3d50dc73d98b3bdf8da1c2e8577496608b0099`.

Arkivet oppgir ikke Git-commit for dette uttrekket. Stiene nedenfor er relative
til arkivets rot; selve backend-koden er ikke lagt til i dette repoet.

| Ref. | Fil i arkivet | Hva som er kontrollert |
| --- | --- | --- |
| K1 | `Source/ExternalApi/Controllers/TaskController.cs` | `HttpPatch` og felles oppdateringsflyt. |
| K2 | `Source/Logic/Helpers/PatchHelper.cs` | `Validate` (linje 58), anvendelse av patch, sammenligning av verdier, varslingstag og lagring. |
| K3 | `Source/Logic/Services/PatchTaskService.cs` | `UpdateAsync`: validering, `Sanitize`, oppdatering og valg av varslingsregel. |
| K4 | `Source/Logic/InternalEntities/PatchRequest.cs` | `KunNotatLagtTil`, `Validate`, `Sanitize` og varslingsreglene. |
| K5 | `Source/Logic/Database/UpdateOppgaveDbQuery.cs` | `PatchOppgaveAsync`: lagrede felt og datoer. |
| K6 | `Source/Logic/Helpers/TaskResource/TaskHelper.cs`; `Source/Entities/v1/Enums/OppgaveType.cs` | Seks oppgavetyper og lesing av startdato, ordinær frist og deadline. |
| K7 | `Source/ExternalApi.Tests/Controllers/Task/UpdateTaskTests.cs` | Positive oppdateringer, notat etter fullføring og varsling. |
| K8 | `Source/InternalMessaging.Batch.Tests/OppgaveForesporselTest/OppgaveforesporselPatchTests.cs` | Ugyldige operasjoner, statusoverganger, statusbegrunnelse og notat etter utløp. |
| K9 | `Source/InternalMessaging.Batch.Tests/OppgaveForesporselTest/OppgaveforesporselPatchFristTests.cs` | Startdato, samspill mellom frister og ugyldige fristoppdateringer. |

Feilkode 2146 er definert i
`Source/Logic/Exceptions/OppgaveErrorCodes.cs`.
Koden og de nevnte testene er lest, men backendens integrasjonstester er ikke
kjørt. Ingen oppgaver er sendt eller oppdatert i Helsenorge som del av kontrollen.

Praktiske HTTP- og JSON-eksempler finnes i
[implementasjonsguidens PATCH-kapittel](implementasjonsguide-informasjonsoppgaver.md#71-oppdatere-en-oppgave-med-patch).
URL-eksemplet er merket som et **avvist** forsøk.
