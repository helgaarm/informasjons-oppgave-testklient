# Testplan for oppkobling til Helsenorge Oppgave API

Testscenarioer og resultater for oppkobling mellom **Helsenorge, leverandør og
helseaktør**. Avklaringer og krav føres i
[oppkoblingssjekklisten](sjekkliste-oppkobling-oppgave-api.md); punkt-ID-ene der
brukes som referanser her.

**Arbeidsmal, versjon 1.0 — 11. november 2026.** T1–T9 er flyttet fra
sjekklisten. UT1–UT10 utdyper sømløst uthopp. Dette er et foreslått testopplegg;
Helsenorge bekrefter nødvendige tester og akseptkriterier for oppkoblingen.
Ingen test er registrert som gjennomført i denne malen.

## 1 Testgrunnlag og ansvar

| Opplysning | Fyll inn |
| --- | --- |
| Prosjekt, helseaktør og leverandør | … |
| Referanse til utfylt oppkoblingssjekkliste | … |
| Oppgavetyper og arbeidsflyter som omfattes | … |
| Produktversjon, API-versjon og relevante miljøinnstillinger | … |
| Testmiljø og klient-ID-er for HelseID og eventuelt uthopp | … |
| Testansvarlig hos leverandøren | … |
| Faglig ansvarlig hos helseaktøren | … |
| Kontakt og avtalt deltakelse fra Helsenorge | … |
| Testperiode, testdata og representasjonsforhold | … |
| Avtalt akseptgrunnlag og referanse til godkjenninger | … |

Leverandøren gjennomfører tekniske tester. Helseaktøren kontrollerer innhold,
arbeidsflyt og faglig oppfølging. Helsenorge deltar etter avtalt opplegg.
Bruk syntetiske data lokalt og avtalte testpersoner i integrasjonstest;
SyntPop-forutsetningen for uthoppsklienten er angitt i sjekkpunkt U4.

## 2 Gjennomføring og dokumentasjon

1. Valider lokalt, kjør tester med representative syntetiske data og rett feil.
2. Kjør lokale regresjonstester for berørte flyter før avtalt integrasjonstest.
3. Gjennomfør relevante scenarioer i avtalt Helsenorge-testmiljø med egen
   klient og virksomhetskontekst. TTT erstatter ikke denne kontrollen.
4. Registrer dato, versjon, miljø, utførende, faktisk resultat og bevisreferanse
   per scenario og relevant oppgavetype. Sett status til **Bestått**, **Feilet**,
   **Blokkert** eller **Ikke relevant**, med begrunnelse.
5. Registrer avvik med eier og frist. Kjør berørte scenarioer på nytt etter retting.

Feil, brudd og samtidighet simuleres først med lokale testdobler. Belastning og
spesielle feiltester mot felles miljø avtales med Helsenorge. Produksjon brukes
ikke som testmiljø. Miljøvalg avklares mot
[Helsenorges miljøbeskrivelse](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1552384092).

Bevis lagres i avtalt, tilgangsstyrt løsning. Før referanser her, ikke token,
private nøkler eller personopplysninger. Tabellene nedenfor gir oversikt;
detaljer føres i resultatloggen i kapittel 5.

## 3 Felles testscenarioer

| Scenario | Gjennomføring og forventet resultat | Sjekkpunkter | Resultat og bevis |
| --- | --- | --- | --- |
| **T1 Normal opprettelse** | Send representativ oppgave. Riktig testperson får avtalt avsender, tekst, frist, lenke og varselopplevelse. Kvittering og ressurs-ID er lagret. | A1–A2, B5–B6, D1–D2, E1 | ☐ Ikke kjørt — … |
| **T2 Virksomhet og tilgang** | Bruk egen registrert HelseID-klient. Prøv også feil virksomhet, manglende tilgang og ugyldig DPoP. Ingen sending skjer i feil kundekontekst. | C1–C6 | ☐ Ikke kjørt — … |
| **T3 Representasjon og begrensninger** | Prøv relevante tilfeller for egen profil, foreldre, fullmakt, ungdom og adressesperre. Både tillatt og avvist innsyn/utførelse følger avklart kontrakt. | B1, B3–B4 | ☐ Ikke kjørt — … |
| **T4 Digitalt utilgjengelig mottaker** | Prøv manglende aktivitet og reservasjon. Avslag gir avtalt feilbehandling og alternativ oppfølging, uten gjentatt blind innsending. | A5, B2, E2 | ☐ Ikke kjørt — … |
| **T5 Uthopp og profilbytte** | Følg lenken for valgt oppgavetype og kontroller personkontekst, sesjon og fullføringsstatus. Ved sømløst uthopp gjennomføres relevante UT-scenarioer i kapittel 4. For vanlig informasjonslenke kontrolleres tilgjengelighet, gjenbesøk og fullføring uten OIDC-forutsetning. | D4, U1–U14 | ☐ Ikke kjørt — … |
| **T6 Oppdatering og kansellering** | Oppdater beskrivelse, startdato og frister. Prøv både endret og uendret deadline og kontroller lagret gyldighet. Kontroller notat etter fullføring/utløp, varsling og kansellering mot avtalte resultater. | D3–D6, B6 | ☐ Ikke kjørt — … |
| **T7 Avvist oppdatering** | Prøv URL, tittel og mottaker: forvent 2146 uten delvis endring etter gjennomgått kode. Prøv sperrede felt etter fullføring/utløp, deadline alene og begrunnelse uten faktisk statusendring. Kontroller resultat mot avklart API-versjon og registrerte kodeavvik. | D5–D6, E2 | ☐ Ikke kjørt — … |
| **T8 Brudd og samtidighet** | Simuler timeout, omstart, dobbeltklikk, to samtidige arbeidere og gjentatt PATCH. Utfallet avstemmes uten utilsiktede duplikater, ekstra notater eller overskriving av konkurrerende endringer. | D2, D7, E3–E4 | ☐ Ikke kjørt — … |
| **T9 Svar og faglig oppfølging** | For meldingsbaserte skjemasvar fra Helsenorge: dokumenter mottak av v1.1 via avtalt kommunikasjonspart/kø, behandling av FHIR-innhold og korrekt APPREC v1.1. Kontroller duplikat, ugyldig innhold og manglende kvittering. Svaret bevarer pasient/representant og når riktig faglig mottaker. Ved ekstern utfyller kontrolleres avtalt direkte svarlevering og innbyggers kopi. | A5, D4, M1–M16, E1–E2, E5 | ☐ Ikke kjørt — … |

For T6–T7 brukes [feltoversikten og de dokumenterte kodeavvikene](patch-felt-og-oppgavetyper.md).
Vellykket HTTP-kvittering alene bekrefter ikke bevart gyldighet. Skill forventet
kontrakt fra observert oppførsel; et kjent avvik skal ikke merkes som bestått
uten at håndteringen og akseptkriteriet er avklart.

## 4 Tester ved sømløst uthopp

Disse scenarioene brukes når U2 angir at sømløst uthopp er påkrevd eller valgt.
Kravgrunnlaget og Helsenorges kilder finnes i
[sjekklistens U-punkter](sjekkliste-oppkobling-oppgave-api.md#5-ekstern-løsning-og-uthopp).
Testmetodene nedenfor er forslag til hvordan oppfyllelsen dokumenteres.

| Scenario | Gjennomføring og forventet resultat | Sjekkpunkter | Resultat og bevis |
| --- | --- | --- | --- |
| **UT1 Første uthopp** | Åpne oppgaven og følg lenken med egen uthoppsklient. Kontroller avtalt startpunkt, registrert returadresse og OIDC-flyt. Riktig oppgaveinnhold vises etter godkjent innlogging. | U1–U2, U4–U7 | ☐ Ikke kjørt — … |
| **UT2 Nytt uthopp og personbytte** | Gjør uthopp som seg selv, bytt representert person på Helsenorge og gjør nytt uthopp i samme nettleser. Kontroller sesjonskravet i U8, også i en allerede åpen fane; gammel kontekst skal ikke styre nye handlinger. | U8, U10, U12 | ☐ Ikke kjørt — … |
| **UT3 Identitet og tilgang** | Prøv tillatte og avviste kombinasjoner av egen profil, forelder og fullmektig. Sammenhold validert token, oppgavens mottaker og forretningsreglene. Prøv også manipulert oppgave-ID/lenkeparameter; det skal ikke gi tilgang til en annen persons oppgave. | B3–B4, U9 | ☐ Ikke kjørt — … |
| **UT4 Personkontekst i brukerflaten** | Gå gjennom relevante sider og handlinger. Kontroller fast visning av personen det gjelder og at brukerinput ikke kan endre identitet/representasjon uten den avtalte Helsenorge-flyten. | U10 | ☐ Ikke kjørt — … |
| **UT5 Ugyldig OIDC-respons** | Simuler feil `state`, `nonce`, issuer, audience, signatur, tidsgrenser og PKCE samt gjenbruk av callback. Ingen feilvariant skal etablere tilgang eller gjenbruke gammel personkontekst. Kjør manipuleringen lokalt før eventuelle avtalte integrasjonstester. | U6–U9 | ☐ Ikke kjørt — … |
| **UT6 Utlogging og inaktivitet** | Prøv manuell utlogging og inaktivitet. Kontroller lokal sesjonsavslutning og `/revoke`, både med og uten refresh-token. Prøv også utlogging i Helsenorge og dokumenter håndteringen av uavhengige sesjoner etter U12. | U12–U13 | ☐ Ikke kjørt — … |
| **UT7 Nøkler og miljøskille** | Simuler nøkkelrotasjon, ukjent `kid` og token fra feil miljø. Kontroller oppdatert signeringsmateriale og avvisning når tillit ikke kan etableres. Bekreft separate klientoppsett, nøkler og returadresser. | U5, U7 | ☐ Ikke kjørt — … |
| **UT8 Sporbarhet og fullføring** | Utfør en handling som representant. Kontroller lagret pasient, aktør og relasjon, videreformidling til mottaker og riktig fullføringsansvar for oppgavetypen. Ingen oppgave skal regnes som faglig behandlet bare fordi lenken ble åpnet. | D4, U9, U11 | ☐ Ikke kjørt — … |
| **UT9 Avbrudd og utilgjengelig innhold** | Prøv avbrutt innlogging, utilgjengelig innhold, gjenbesøk etter fullføring og feil ved tokenfornyelse/tilbakekalling. Innbygger får avtalt tilbakemelding; avbrudd gir ikke tilgang via en gammel sesjon. Feil blir håndtert og sporbare. | U3, U8, U13–U14, E5 | ☐ Ikke kjørt — … |
| **UT10 Enheter og hjelpemidler** | Gjennomfør reisen på avtalte nettlesere/enheter og med relevante hjelpemidler. Kontroller retur til riktig sted. For mobilapp inngår klienttypens mTLS- og redirect-oppsett; eventuelle API-kall bruker avtalte tilganger. | U3, U5–U6, U14 | ☐ Ikke kjørt — … |

UT6 skal omfatte valg av token til tilbakekalling: refresh-token når det finnes,
ellers access-token, slik [revoke-kontrakten](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731250)
angir. Ikke legg tokenverdiene i testbeviset.

## 5 Resultatlogg og avvik

Bruk én rad per kjøring, variant og oppgavetype. Referansen kan peke til en
detaljert testkjøring i leverandørens eget system.

| Test-ID og variant | Dato og utførende | Oppgavetype, versjon og miljø | Faktisk resultat og status | Bevisreferanse | Avvik-ID |
| --- | --- | --- | --- | --- | --- |
| … | … | … | … | … | … |

| Avvik-ID | Test-ID | Forventet og observert resultat | Konsekvens | Eier og frist | Tiltak, ny kjøring og beslutning |
| --- | --- | --- | --- | --- | --- |
| … | … | … | … | … | … |

## 6 Samlet vurdering

| Vurdering | Fyll inn |
| --- | --- |
| Testomfang som er gjennomført | … |
| Utelatte scenarioer og begrunnelse | … |
| Åpne avvik, konsekvens og navngitt eier | … |
| Aksepterte restpunkter med beslutningstaker og begrunnelse | … |
| Leverandørens vurdering, navn og dato | … |
| Helseaktørens vurdering, navn og dato | … |
| Helsenorges vurdering etter avtalt opplegg, navn og dato | … |

Samlet testresultat føres tilbake til F6 og beslutningspunktene i
[oppkoblingssjekklisten](sjekkliste-oppkobling-oppgave-api.md#9-åpne-punkter-og-beslutning).
Testresultat er grunnlag for beslutning; det erstatter ikke nødvendige
produksjonsgodkjenninger.
