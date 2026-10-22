# informasjons-oppgave-testklient

Lokal webklient for å opprette og sende **FHIR R4 Task / Communication** til en
testinnbygger i **Helsenorge test02**. React-grensesnittet bruker NHNs offisielle
grønnfarger og Arial, profilens systemfont. Dette er en uavhengig testklient.

## Lisens

Prosjektet er lisensiert under [MIT-lisensen](LICENSE).
Copyright (c) 2026 Armann Helgason.

## Sikkerhet

Se [sikkerhetspolicyen](SECURITY.md) for privat rapportering, støttede versjoner
og trygg testbruk. [GitHub-oppsettet](docs/repository-security.md) beskriver CI,
Dependabot, CodeQL og aktivering av repoets sikkerhetsinnstillinger.

## Start prosjektet

Krever Node.js 22 eller nyere og npm.

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

## HelseID test med Test-token-tjenesten (TTT)

Standardoppsettet følger [NHNs veiledning for Test-token-tjenesten](https://utviklerportal.nhn.no/informasjonstjenester/helseid/helseid-selvbetjening/test-token-tjenesten/docs/test-token-tjenesten_enmd).
**Du trenger ikke en registrert OAuth-klient, klient-ID eller egen privat nøkkelfil.**
TTT utsteder testtoken signert med samme signeringsnøkkel som HelseID test.

1. Logg inn i [HelseID Selvbetjening test → Integrasjonstesting](https://selvbetjening.test.nhn.no/ttt).
   Velg hvem du representerer og generer en TTT-API-nøkkel.
2. Kopier `.env.example` til `.env` og fyll ut tabellen nedenfor. API-nøkkelen skal
   kun ligge i serverens lokale konfigurasjon, ikke i kildekode eller nettleseren.
3. Avklar eksakt audience, teknisk scope og testvirksomhetens tilgang til
   **Helsenorge Ekstern API → Oppgave i test02** med NHN. Verdiene er ikke
   forhåndsutfylt: visningsnavnet «Oppgave» og API-URL-en er ikke verifiserte
   verdier for henholdsvis scope og audience.
4. Start serveren på nytt og velg **Tilkobling → Test HelseID-tilkobling**.

| Variabel | Innhold |
| --- | --- |
| `HELSEID_AUTH_MODE` | `test-token` (standard uten eksisterende klient-ID) |
| `HELSEID_TTT_API_KEY` | API-nøkkel fra Integrasjonstesting i HelseID Selvbetjening test |
| `HELSEID_TTT_AUDIENCE` | Eksakt audience for Helsenorge-API-et |
| `HELSEID_SCOPE` | Eksakt teknisk scope for Oppgave; flere separeres med mellomrom |
| `HELSEID_ORGNR_PARENT` | Testvirksomhetens hovedenhet, ni siffer |
| `HELSEID_ORGNR_CHILD` | Valgfri underenhet når testsituasjonen krever det |

Testknappen kontrollerer tokenuthenting og DPoP-binding. Den beviser **ikke** at
Helsenorge godtar tokenet, virksomheten eller oppgaven. TTT kan lage token med
valgte claims, men gir ikke i seg selv virksomheten tilgang til Helsenorge.
Reell aksept av dette TTT-oppsettet i test02 er ikke verifisert.

Serveren kaller `POST https://helseid-ttt.test.nhn.no/v2/create-test-token-with-key`
med API-nøkkelen i `X-Auth-Key`. Forespørselen angir audience, scope,
organisasjonsnummer og `createDPoPTokenWithDPoPProof: true`. Standard bruker- og
klientclaims slås av, slik at ingen tilfeldig testperson velges. Oppgavens innhold
og mottakerens fødselsnummer sendes ikke til TTT.

Serveren lager en midlertidig DPoP-nøkkel i minnet og sender den til TTT i det
dokumenterte feltet `dPoPProofParameters.privateKeyForProofCreation` som en JWK.
Dette er en separat testnøkkel; konfigurerte klientnøkler leses ikke i TTT-modus.
TTT-svarets tokenbinding og bevis kontrolleres. Ved hvert API-kall signerer
serveren et nytt DPoP-bevis med samme nøkkel, `ath` og eventuell nonce.
Testknappens bevis gjenbrukes aldri. Tokenet mellomlagres bare i minnet, i inntil
fem minutter. Nøkler og token utleveres ikke fra det lokale API-et.

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

`.env`, nøkkelfiler, byggfiler og avhengigheter er utelatt fra versjonskontroll.
`HTTPS_PROXY`/`HTTP_PROXY` og `NO_PROXY` støttes via Undici. For en intern CA, bruk
`NODE_EXTRA_CA_CERTS`. TLS-verifikasjon skal være aktiv.

## Bruk

1. Start med **Ny oppgave**, **Bruk et eksempel**, eller **Last inn FHIR Task**.
   Import støtter én Task i JSON eller FHIR XML, maksimalt 1 MB. Bundle importeres
   ikke som en enkelt oppgave. Eksempelet har ingen forhåndsvalgt testperson.
2. Fyll inn tittel, beskrivelse, fullstendig informasjonslenke og hensikt.
3. Angi en testperson som er aktiv i test02, og avsender med kontaktinformasjon.
4. Angi svarfrist, tjenesteområde og relevante sikkerhetskoder. Innsynskode for
   ungdom/foreldre skal angis for testpersoner mellom 12 og 15 år.
5. Bruk **Alle FHIR-felt** til resten av R4-attributtene: identifikatorer,
   `basedOn`, metadata, gjentatte elementer, `input`, `output`, extensions,
   underressurser og primitive utvidelser. Feltlisten er basert på R4-definisjonene
   i `fhir-tool`. Velg datatype for `value[x]`; editoren tilbyr én variant av hver
   slik choice om gangen.
6. JSON-fanen viser samme ressurs. Velg **Bruk JSON** før videre redigering,
   eksport eller innsending. Importerte attributter bevares ved feltvise endringer.
7. Velg **Valider**, kontroller mottaker og innhold, bekreft testdata og velg
   **Send til test02**. Responsfanen viser HTTP-status, Location, korrelasjons-ID
   og API-respons, inkludert eventuell OperationOutcome.

Innholdsvisningen er en forhåndsvisning av oppgaveteksten, ikke en nøyaktig
gjengivelse av Helsenorges GUI. **Last ned JSON** eksporterer hele utkastet.
Oppgaver lagres ikke automatisk i database eller localStorage.

## Integrasjonskontrakt

| Innstilling | Verdi |
| --- | --- |
| Helsenorge-miljø | `test02` |
| Innsending | `POST https://eksternapi.hn2.test.nhn.no/oppgave/v1/Task` |
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

Innsending gjentas ikke automatisk ved timeout eller nettverksbrudd. Ukjent
leveringsstatus må undersøkes i test02 før nytt forsøk. Vellykket innsending og
ukjent status sperrer samme forretningsidentifikator i serverøkten; dette er en
lokal beskyttelse, ikke varig idempotens. Økten utløper etter 30 minutter og
forsvinner ved serveromstart. HTTP 201/2xx betyr at API-et tok imot forespørselen,
ikke at innbygger har lest informasjonen.

## Tester

```bash
npm test
npm run build
```

Testene bruker lokale HTTP-servere, genererte engangsnøkler og mock av eksterne
tjenester. De tester TTT-kontrakten, hemmelighold av nøkler/token, signaturer,
DPoP nonce-flyt, tokenbinding, import/eksport,
bevaring av felt, validering, CSRF, duplikater og ukjent leveringsstatus. De sender
ingen oppgaver til Helsenorge. Reell HelseID-autentisering og innsending krever
TTT-API-nøkkel eller registrert klient, samt riktige API-claims og tilgang i test02.
Dette er ikke verifisert mot de eksterne tjenestene i prosjektoppsettet.

Nettleserkontroll er utført med Chromium på 1440 og 390 pikslers bredde:
feltredigering, JSON-endringer, bevaring av extensions, JSON-nedlasting, XML-import,
validering, tilkoblingsstatus og simulert API-kvittering. Ingen JavaScript-feil
eller horisontal sideoverflyt ble observert.

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
