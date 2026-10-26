# informasjons-oppgave-testklient

Lokal webklient for å opprette og sende **FHIR R4 Task / Communication** til en
testinnbygger i **Helsenorge Test01 eller Test02**. React-grensesnittet bruker NHNs offisielle
grønnfarger og Arial, profilens systemfont. Dette er en uavhengig testklient.

## Lisens

Prosjektet er lisensiert under [MIT-lisensen](LICENSE).
Copyright (c) 2026 Armann Helgason.

## Sikkerhet

Se [sikkerhetspolicyen](SECURITY.md) for privat rapportering, støttede versjoner
og trygg testbruk. [GitHub-oppsettet](docs/repository-security.md) beskriver CI,
Dependabot, CodeQL og aktivering av repoets sikkerhetsinnstillinger.

## Start prosjektet

Ønsker du Microsoft-stakken, finnes en [parallell .NET 10-versjon](dotnet/README.md)
med ASP.NET Core, Firely C# FHIR SDK, React 19, TypeScript, Redux Toolkit, Sass,
Vite 8 og Vitest. Den har eget oppsett og kjører normalt på port 3001 ved siden
av denne appen. Kommandoene nedenfor gjelder den opprinnelige Node-versjonen.

Krever Node.js **22.19.0 eller nyere** og npm. Bruk en oppdatert LTS-versjon.

```bash
cd informasjons-oppgave-testklient
npm ci --ignore-scripts
cp .env.example .env
npm run dev
```

Åpne **http://localhost:3000**. Uten HelseID-konfigurasjon kan du lage oppgaver,
importere, redigere, validere og eksportere. Innsending er deaktivert til
konfigurasjonen er på plass. Ingen simulerte kvitteringer vises i applikasjonen.

For en bygget versjon:

```bash
npm run build
npm start
```

Serveren binder til loopback og er laget for én lokal operatør. Hvis prosjektet
kjører på en ekstern utviklingsmaskin, bruk en SSH-tunnel til port 3000. Denne
versjonen har ikke operatørinnlogging eller støtte for offentlig flerbrukerdrift.
HelseID autentiserer API-klienten/virksomheten, ikke operatøren i nettleseren.

### Starte på nytt og løse portkonflikt

Kjør én appserver om gangen. Når appen allerede kjører, åpner du
**http://localhost:3000** uten å kjøre startkommandoen på nytt.
For å starte på nytt: trykk **Ctrl+C** i terminalen der appen kjører, vent til
den har stoppet, og kjør `npm run dev` igjen (eller `npm start` for bygget versjon).
Last deretter nettsiden på nytt.

Meldingen **«port 3000 er allerede i bruk»** betyr at en prosess allerede lytter
på denne porten. Hvis det er denne appen, bruk eller stopp den eksisterende
kjøringen som beskrevet over. Hvis en annen app må beholde porten, sett både
`PORT=3001` og `APP_ORIGIN=http://localhost:3001` i `.env`, start på nytt og åpne
**http://localhost:3001**. Behold `HOST` som loopback-adresse.

- **Vite: «Re-optimizing dependencies because lockfile has changed»** er normalt
  etter endringer i avhengighetene. Vite oppdaterer den lokale hurtigbufferen.
- **npm: «New major version of npm available»** er et valgfritt oppdateringsvarsel.
  Det hindrer ikke appen i å starte og løser ikke en portkonflikt. Du trenger ikke
  oppgradere npm for å løse denne oppstartsfeilen.

## HelseID test med Test-token-tjenesten (TTT)

Standardoppsettet følger [NHNs veiledning for Test-token-tjenesten](https://utviklerportal.nhn.no/informasjonstjenester/helseid/helseid-selvbetjening/test-token-tjenesten/docs/test-token-tjenesten_enmd).
**For å hente et TTT-token trenger du ikke en registrert OAuth-klient eller egen privat nøkkelfil.**
TTT utsteder testtoken signert med samme signeringsnøkkel som HelseID test.

1. Logg inn i [HelseID Selvbetjening test → Integrasjonstesting](https://selvbetjening.test.nhn.no/ttt).
   Velg hvem du representerer og generer en TTT-API-nøkkel.
2. Åpne **Tilkobling** i appen og lim inn din egen API-nøkkel i det skjulte nøkkelfeltet.
3. Oppgi organisasjonsnummeret til en testvirksomhet du har tilgang til i HelseID
   test (hovedenheten). Appen foreslår ikke en virksomhet. Kontroller forslagene
   for audience `nhn:helsenorge.eksternapi` og scope `nhn:helsenorge.eksternapi/Oppgave`,
   og endre dem hvis NHN har gitt deg et annet oppsett. Eksisterende verdier beholdes.
   API-nøkkel, organisasjonsnummer og underenhet har ingen forslag. Forslagene for
   audience og scope finnes også i `.env.example`.
4. Velg **Lagre oppsett**, deretter **Test tilkobling**. Lagrede endringer tas i
   bruk med én gang, uten omstart. Testen sender ingen oppgave til Helsenorge.

Skjemaet lagrer oppsettet i `secrets/connection.json`, som er utelatt fra Git.
API-nøkkelen returneres aldri til nettleseren og lagres ikke i localStorage.
La nøkkelfeltet stå tomt ved senere endringer for å beholde eksisterende nøkkel.
Ny lagring nullstiller tidligere testtoken, slik at det nye oppsettet må testes.
Lagring er sperret mens en tilkoblingstest eller innsending pågår.

Du kan fortsatt konfigurere variablene nedenfor i `.env` og starte appen på nytt.
I TTT-modus overstyrer lagret skjemaoppsett disse verdiene. Fjern
`secrets/connection.json` og start på nytt for å bruke `.env` igjen.
Registrert klient (`HELSEID_AUTH_MODE=client_credentials`) bruker fortsatt `.env`
og ignorerer lagret TTT-oppsett. Etter oppdatering fra en eldre appversjon må
serveren startes på nytt én gang for å aktivere lagring fra skjemaet.

| Variabel | Innhold |
| --- | --- |
| `HELSEID_AUTH_MODE` | `test-token` (standard uten eksisterende klient-ID) |
| `HELSEID_TTT_API_KEY` | API-nøkkel fra Integrasjonstesting i HelseID Selvbetjening test |
| `HELSEID_TTT_CLIENT_ID` | Valgfri testklient-ID (UUID). Tom verdi gir en automatisk test-ID for denne serverkjøringen |
| `HELSEID_TTT_AUDIENCE` | Eksakt audience for Helsenorge-API-et |
| `HELSEID_SCOPE` | Eksakt teknisk scope for Oppgave; flere separeres med mellomrom |
| `HELSEID_ORGNR_PARENT` | Testvirksomhetens hovedenhet, ni siffer |
| `HELSEID_ORGNR_CHILD` | Valgfri underenhet når testsituasjonen krever det |

Testknappen kontrollerer tokenuthenting og DPoP-binding. Den beviser **ikke** at
Helsenorge godtar tokenet, virksomheten eller oppgaven. TTT kan lage token med
valgte claims, men gir ikke i seg selv virksomheten tilgang til Helsenorge.
Innsending og aksept av en fullstendig oppgave i test02 er ikke verifisert.

Serveren kaller `POST https://helseid-ttt.test.nhn.no/v2/create-test-token-with-key`
med API-nøkkelen i `X-Auth-Key`. Forespørselen angir audience, scope,
organisasjonsnummer og `createDPoPTokenWithDPoPProof: false`. Standard bruker- og
klientclaims slås av. Appen setter eksplisitt `clientId`, `clientName`, en unik
`jti`, `clientTenancy: true`, `clientTenancyType: 1` (SingleTenant) og
`clientAuthenticationMethodsReferences: private_key_jwt` sammen med de valgte
scope- og organisasjonsverdiene. Ingen tilfeldig testperson velges.
Oppgavens innhold og mottakerens fødselsnummer sendes ikke til TTT.

TTT-klient-ID-en genereres som en UUID og beholdes så lenge serveren kjører,
også ved ny tokenuthenting og lagring av oppsett. Den vises under **Tekniske
detaljer**. Bruk `HELSEID_TTT_CLIENT_ID` hvis testoppsettet krever en bestemt ID.
Dette er en syntetisk testidentitet, ikke en klientregistrering eller
tilgangsgodkjenning i Helsenorge. Appen kontrollerer at det returnerte tokenet
inneholder den forespurte klient-ID-en, klientnavnet og token-ID-en, klienttypen
`single-tenant`, autentiseringsmetoden `private_key_jwt`, gyldige tidsangivelser,
rett scope, organisasjon og DPoP-binding før det brukes til innsending.

HTTP 401 med `invalid_client` kan ha flere årsaker. «clientid is not valid» gjelder
klient-ID-en, mens «client tenancy is unknown» gjelder klienttypen. Appen viser
ulike forklaringer for disse feilene. Tidligere versjoner utelot disse feltene
fra TTT-forespørselen. Hvis feilen fortsetter med korrekte klientopplysninger,
avklar godkjent klient og tilgang til Oppgave i valgt testområde med NHN.

Se [NHNs oversikt over klientclaims](https://utviklerportal.nhn.no/informasjonstjenester/helseid/bruksmoenstre-og-eksempelkode/bruk-av-helseid/docs/teknisk-referanse/claims_nb_nomd/)
og [TTT-definisjonen av klienttype](https://github.com/NorskHelsenett/HelseID.Samples/blob/master/Utilities/TestTokenTool/RequestModel/ClientTenancyType.cs).

Serveren lager en midlertidig DPoP-nøkkel i minnet og sender bare den offentlige
nøkkelens fingeravtrykk til TTT i `clientClaimsParameters.cnfJkt`, som støttet i
[NHNs TestTokenTool](https://github.com/NorskHelsenett/HelseID.Samples/blob/master/Utilities/TestTokenTool/README.md).
Privatnøkkelen forlater ikke prosessen; konfigurerte klientnøkler leses ikke i
TTT-modus. Tokenets innhold og binding til nøkkelen kontrolleres. Ved hvert
API-kall signerer serveren et nytt DPoP-bevis med samme nøkkel, `ath` og eventuell
nonce. Tokenet mellomlagres bare i minnet, i inntil fem minutter. Nøkler og token
utleveres ikke fra det lokale API-et.

### Alternativ: registrert HelseID-klient

Den ordinære flyten er fortsatt tilgjengelig for en maskin-til-maskin-klient med
godkjent tilgang til **Helsenorge Ekstern API → Oppgave**. Sett
`HELSEID_AUTH_MODE=client_credentials` og bruk følgende tilleggsvariabler:

| Variabel | Innhold |
| --- | --- |
| `HELSEID_CLIENT_ID` | Klient-ID fra HelseID test |
| `HELSEID_PRIVATE_KEY_FILE` | Sti til privat JWK eller PKCS#8 PEM, for eksempel `./secrets/helseid-test.jwk` |
| `HELSEID_KEY_ID` | Registrert nøkkel-ID; kan utelates hvis JWK inneholder `kid` |
| `HELSEID_SIGNING_ALG` | Registrert algoritme, som standard `PS256`; må samsvare med nøkkelen |
| `HELSEID_MULTI_TENANT` | `false` for single-tenant, `true` for multi-tenant |

`HELSEID_SCOPE` brukes også her. HelseID setter normalt `orgnr_parent` for
single-tenant. For multi-tenant kreves `HELSEID_ORGNR_PARENT` og gyldig delegering.
Valgfri `HELSEID_ORGNR_CHILD` støttes. Dokumentert `authorization_details` legges
i client assertion ved multi-tenant/underenhet. Tokenet må ha `orgnr_parent`.

Autentiseringen bruker `client_credentials`, `private_key_jwt` med HelseID-issuer
som audience, samt DPoP. Token-endepunktet oppdages via discovery og begrenses til
HelseID test. DPoP nonce-utfordringer håndteres. Eksisterende oppsett med
`HELSEID_CLIENT_ID` og uten `HELSEID_AUTH_MODE` beholder denne flyten.

`.env`, `secrets/`, nøkkelfiler, byggfiler og avhengigheter er utelatt fra versjonskontroll.
`HTTPS_PROXY`/`HTTP_PROXY` og `NO_PROXY` støttes via Undici. For en intern CA, bruk
`NODE_EXTRA_CA_CERTS`. TLS-verifikasjon skal være aktiv.

## Bruk

1. Start med **Ny oppgave**, **Bruk et eksempel**, eller **Last inn FHIR Task**.
   Import støtter én Task i JSON eller FHIR XML, maksimalt 1 MB. Bundle importeres
   ikke som en enkelt oppgave. Eksempelet har ingen forhåndsvalgt testperson.
2. Fyll inn tittel, beskrivelse, fullstendig informasjonslenke og hensikt.
3. Angi en testperson som er aktiv i testområdet du skal bruke, og avsender med kontaktinformasjon.
4. Angi svarfrist, tjenesteområde og relevante sikkerhetskoder.
   **Innsyn for ungdom og foreldre** er foreløpig deaktivert og kan ikke endres
   i det veiledede skjemaet. Støtte kommer senere, når det er besluttet at dette
   skal kunne gjøres. Ikke legg opp tester som er avhengige av denne funksjonen ennå.
5. Bruk **Alle FHIR-felt** til resten av R4-attributtene: identifikatorer,
   `basedOn`, metadata, gjentatte elementer, `input`, `output`, extensions,
   underressurser og primitive utvidelser. Feltlisten er basert på R4-definisjonene
   i `fhir-tool`. Velg datatype for `value[x]`; editoren tilbyr én variant av hver
   slik choice om gangen.
6. JSON-fanen viser samme ressurs. Velg **Bruk JSON** før videre redigering,
   eksport eller innsending. Importerte attributter bevares ved feltvise endringer.
7. Velg **Testområde på Helsenorge** ved sendeknappen: **Test01** eller **Test02**
   (standard). Velg **Valider**, kontroller mottaker og innhold, bekreft testdata
   for valgt område og trykk **Send til Test01/Test02**. Bytter du område, må du
   bekrefte på nytt. Responsfanen og historikken viser området som faktisk ble
   brukt. Responsen viser også HTTP-status, Location, korrelasjons-ID og
   API-respons, inkludert eventuell OperationOutcome.

Test02 er det vanlige området for integrasjonstesting mot gjeldende tjenester.
Test01 brukes til ny funksjonalitet og kan være mindre stabilt. Se
[NHNs beskrivelse av testområdene](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1552384092).
Klienten bruker HelseID test for begge; virksomhet, klient og testperson må ha
nødvendig tilgang/status i området du velger. Miljøvalget endrer ikke tilgangen.
Valget gjelder denne nettleserfanen og går tilbake til Test02 ved ny sidelasting.

Innholdsvisningen er en forhåndsvisning av oppgaveteksten, ikke en nøyaktig
gjengivelse av Helsenorges GUI. **Last ned JSON** eksporterer hele utkastet.
Oppgaver lagres ikke automatisk i database eller localStorage.

Oppsettet tilpasser seg vindusbredden og nettleserzoom. Skjema og forhåndsvisning
står ved siden av hverandre når innholdsområdet har nok plass, og under hverandre
i smalere vinduer. På mobil brytes menyer og knapper over flere linjer, og
skjemafeltene har større tekst og trykkflater. JSON-editor og brede tabeller kan
rulles inni sitt eget område.

## Integrasjonskontrakt

| Innstilling | Verdi |
| --- | --- |
| Helsenorge-miljø | `test01` eller `test02` (standard) |
| Innsending Test01 | `POST https://eksternapi.hn.test.nhn.no/oppgave/v1/Task` |
| Innsending Test02 | `POST https://eksternapi.hn2.test.nhn.no/oppgave/v1/Task` |
| Content-Type / Accept | `application/fhir+json` |
| HelseID-issuer | `https://helseid-sts.test.nhn.no` |
| API-autentisering | `Authorization: DPoP …` og eget `DPoP`-bevis |
| Informasjonsoppgave | `focus.type = Communication` |
| Informasjonsadresse | `instantiatesUri` |
| Mottaker | `owner.type = Patient`, `owner.identifier` med FNR-system |
| Avsender | `requester` refererer til en `Organization` i `contained` |
| Ny status | `ready` |
| Hensikt | `proposal` eller `plan` |
| Svarfrist | `restriction.period.end` |

Helsenorge setter oppgaven til utført ved første uthopp. Klienten implementerer
oppretting, ikke endring eller kansellering av innsendte oppgaver.

Det lokale API-et `POST /api/tasks/send` krever `{ task, environment, confirmTestData: true }`,
der `environment` er nøyaktig `test01` eller `test02`. Manglende eller ukjent
område avvises før tokenuthenting og innsending. Serveren velger fra faste
endepunkter; klienten kan ikke angi en URL eller produksjon. DPoP-bevis signeres
for valgt endepunkt, og API-noncer holdes adskilt per område. Etter oppdatering
må serveren startes på nytt og nettlesersiden lastes på nytt.

## Validering og leveringsstatus

Klienten kontrollerer FHIR R4-struktur og lokale regler fra Helsenorges
Task-dokumentasjon. Kontrollen omfatter obligatoriske felt, lengdegrenser,
avsenderreferanse, mottakerformat, frister og informasjonsoppgavens type.
Ukjente JSON-attributter beholdes i utkastet, men stoppes ved strukturvalideringen
før innsending. XML med DTD/entitetsdeklarasjoner eller ugyldig struktur avvises.

Dette er **ikke en full NHN-profilvalidator**. Lokale kontroller erstatter ikke
Helsenorges endelige vurdering av testpersonens status/alder, tjenesteområde,
kodeverk, representasjon, lenkeinnhold, klienttilgang eller delegering. Ingen
automatisk aldersutledning eller fødselsnummerkontrollsum benyttes for testpersoner.

Innsending gjentas ikke automatisk ved timeout eller nettverksbrudd. Hvis
nettleseren mister svaret fra den lokale serveren, eller ikke kan lese det,
vises ukjent leveringsstatus i responsen og historikken. Ny innsending av samme
identifikator til samme område sperres i nettleserfanen. Kontroller oppgaven i
området som vises i responsen før du oppretter en ny oppgave.
Vellykket innsending og ukjent status sperrer samme forretningsidentifikator i
samme testområde i serverøkten. Samme identifikator kan testes i det andre området;
bytte tilbake eller redigering av innhold opphever ikke sperren. Dette er en
lokal beskyttelse, ikke varig idempotens. Økten utløper etter 30 minutter og
forsvinner ved serveromstart. HTTP 201/2xx betyr at API-et tok imot forespørselen,
ikke at innbygger har lest informasjonen.

## Tester

```bash
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Nettlesertestene kjører mot en egen lokal mock-server med syntetiske oppgaver,
uten å lese `.env` eller det lagrede tilkoblingsoppsettet. De dekker tapt og
uleselig svar etter innsending, avvisninger som kan rettes, og låsing av
JSON-editoren under behandling. Eksterne nettleserforespørsler blokkeres.
På Linux/CI kan nødvendige nettleserpakker installeres med
`npx playwright install --with-deps chromium`. For å bruke installert Edge i
PowerShell: `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:ui`.
CI tester minimumsversjonen Node.js 22.19.0 og Node.js 24, og kjører
nettlesertestene med Chromium på Node.js 24.

Testene bruker lokale HTTP-servere, midlertidige konfigurasjonsfiler, genererte engangsnøkler og mock av eksterne
tjenester. De tester lokal lagring, feltvalidering, nøkkelbytte og samtidige kall,
TTT-kontrakten, hemmelighold av nøkler/token, signaturer,
DPoP nonce-flyt, tokenbinding, valg av testområde, isolerte API-noncer, import/eksport,
bevaring av felt, validering, CSRF, duplikater og ukjent leveringsstatus. De sender
ingen oppgaver til Helsenorge. Reell HelseID-autentisering og innsending krever
TTT-API-nøkkel eller registrert klient, samt riktige API-claims og tilgang i valgt testområde.
Tokenuthenting med TTT og kontroll av tokenets klientopplysninger, tidsangivelser og DPoP-binding ble manuelt verifisert
mot HelseID test 2026-10-23, både direkte og gjennom appens tilkoblingstest
(HTTP 200). Innsending og aksept i Helsenorge test02 er fortsatt ikke verifisert.

En diagnostisk sammenligning mot Helsenorge test02 samme dato brukte bare den
ugyldige JSON-strengen `{`, uten Task, mottaker eller melding. Token uten
klienttype ga HTTP 401 med «client tenancy is unknown». Token med `single-tenant`
ga i stedet HTTP 400 for den ugyldige forespørselen. Ingen oppgave ble opprettet;
denne kontrollen erstatter ikke en test av en fullstendig innsending.

Miljøvalget ble kontrollert i headless Edge 2026-10-23 med en lokal mock-server:
Test02 som standard, bytte til Test01, ny bekreftelse ved bytte, låsing under
innsending, duplikatsperrer per område, ukjent levering, miljø i respons og
historikk, portal-lenker og sperre mot en eldre server uten miljøvalg. Oppgavesiden
ble kontrollert ved 320, 390, 768, 1024, 1440 og 1920 pikslers bredde uten
horisontal sideoverflyt eller JavaScript-feil. Ingen eksterne API-kall ble gjort.

En tidligere versjon ble kontrollert i Chromium på 1440 og 390 pikslers bredde:
feltredigering, JSON-endringer, bevaring av extensions, JSON-nedlasting, XML-import,
validering, tilkoblingsstatus og simulert API-kvittering. Ingen JavaScript-feil
eller horisontal sideoverflyt ble observert i den versjonen. Det nye
tilkoblingsskjemaet og de oppdaterte responsive stilene er byggkontrollert, men
visuell nettleserkontroll gjenstår. Kontroller oppgavefanene, Tilkobling og
Innsendinger ved 320, 390, 768, 1024, 1440 og 1920 pikslers bredde samt 200 %
zoom, inkludert lange feltverdier, liggende mobil og dypt nestede FHIR-felt.

## Kilder

- [HelseID Test-token-tjenesten](https://utviklerportal.nhn.no/informasjonstjenester/helseid/helseid-selvbetjening/test-token-tjenesten/docs/test-token-tjenesten_enmd)
- [TTT OpenAPI](https://helseid-ttt.test.nhn.no/swagger/index.html)
- [NHNs TestTokenTool og JWK-parametere](https://github.com/NorskHelsenett/HelseID.Samples/tree/master/Utilities/TestTokenTool)

- [Informasjonsoppgave](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2619211802)
- [FHIR Task – Oppgave](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/742948883)
- [Oppgave API](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2109734913)
- [Felles FHIR-metadata](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/743014401)
- [Testmiljøer og endepunkter](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1552384092)
- [Helsenorge API i systemkontekst](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1886191617)
- [HelseID DPoP](https://utviklerportal.nhn.no/informasjonstjenester/helseid/bruksmoenstre-og-eksempelkode/bruk-av-helseid/docs/dpop/dpop_no_nbmd)
- [HelseID organisasjonsnumre](https://utviklerportal.nhn.no/informasjonstjenester/helseid/bruksmoenstre-og-eksempelkode/bruk-av-helseid/docs/tekniske-mekanismer/organisasjonsnumre_no_nbmd)

Dokumentasjonen ble kontrollert 22. oktober 2026. Bekreft gjeldende tilgang og
scope i HelseID før en reell testinnsending.
