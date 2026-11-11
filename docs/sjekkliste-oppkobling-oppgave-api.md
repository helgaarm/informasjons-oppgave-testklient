# Sjekkliste for oppkobling til Helsenorge Oppgave API

Sjekkliste for avklaringer mellom **Helsenorge, leverandør og helseaktør**.
Testscenarioer og testresultater føres i [egen testplan](testplan-oppkobling-oppgave-api.md).

**Arbeidsmal, versjon 1.2 — 11. november 2026.** Ansvar og beslutningspunkter
er forslag. Lenker ved kravene viser Helsenorges kilder, kontrollert samme dato.
Helsenorge bekrefter avtaler og godkjenninger for den konkrete oppkoblingen.

## Opplysninger om oppkoblingen

| Opplysning | Fyll inn |
| --- | --- |
| Prosjekt og saksreferanse hos Helsenorge | … |
| Helseaktør og organisasjonsnummer | … |
| Leverandør, produkt og versjon | … |
| Oppgavetype og kort beskrivelse av brukstilfellet | … |
| Skjemautfyller og mottakende EPJ/fagsystem, hvis relevant | … |
| Svarmottakers kommunikasjonspart/HER-id og prosessversjon per miljø | … |
| Kontakt hos Helsenorge | Navn, rolle og kontaktkanal: … |
| Faglig ansvarlig og driftskontakt hos helseaktøren | … |
| Teknisk ansvarlig og driftskontakt hos leverandøren | … |
| Testmiljø, planlagt testperiode og ønsket oppstart | … |
| Sist gjennomgått og neste avklaringsmøte | … |

**H** = Helsenorge/NHN, **L** = leverandør, **A** = helseaktør.
Første part i kolonnen «Føres av / avklares med» foreslås å følge opp punktet;
de andre deltar i avklaringen. Sett inn navngitt ansvarlig ved behov.

Endre `☐ Åpen` til `☑ Avklart` når beslutningen er dokumentert. Noter dato og
referanse til beslutning, konfigurasjon eller testbevis. Bruk `Ikke relevant`
med begrunnelse for punkter som utgår. Åpne punkter får eier og frist i
beslutningsloggen nederst. Oppgi referanser til beskyttet dokumentasjon fremfor
å lime inn persondata, token eller private nøkler.

## 1 Formål og ansvar

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **A1 Brukstilfelle.** Beskriv hva innbygger skal gjøre, hvorfor oppgaven sendes, hvem som utløser den og når den skal sendes. Helsenorge og helseaktør har bekreftet at Oppgave er egnet kanal. | A / H, L | ☐ Åpen — … |
| **A2 Oppgavetype og omfang.** Velg oppgavetype sammen med Helsenorge. Avklar hvilke deler som skjer i Helsenorge og i eksternt system, integrasjoner og eventuell godkjenning av ekstern løsning. Se [oppgavetyper](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1805680641) og [Oppgave API](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2109734913). | H / A, L | ☐ Åpen — … |
| **A3 Avtaler og virksomheter.** Helsenorge/NHN har avklart nødvendige tjenestebestillinger, medlemskap, vilkår og godkjenninger. Det er tydelig hvilken juridisk virksomhet som bestiller og bruker tjenesten, også ved flere helseaktører. | A / H, L | ☐ Åpen — … |
| **A4 Personvern og sikkerhetsansvar.** Avklar behandlingsansvar, leverandørens rolle, nødvendige avtaler, behandlingsgrunnlag, datalagring og behov for personvern- og risikovurderinger. Ansvarlig fagfunksjon hos hver part har behandlet sine punkter. | A / L, H | ☐ Åpen — … |
| **A5 Faglig oppfølging.** Navngi hvem som følger opp ubesvarte, avviste eller utløpte oppgaver. Avtal alternativ kontaktvei og håndtering av tidskritiske behov; opprettelse av en oppgave skal ikke alene avslutte nødvendig pasientoppfølging. | A / H, L | ☐ Åpen — … |

## 2 Mottakere og innbyggeropplevelse

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **B1 Målgruppe og tjenesteområde.** Avklar alder, pasientgrupper, eventuelle avgrensninger og riktig tjenesteområde i `meta.security`. Helseaktørens formål og Helsenorges tilgangsregler er lagt til grunn. | A / H, L | ☐ Åpen — … |
| **B2 Digital aktivitet.** Avklar manglende digital aktivitet, reservasjon og aktivitet via representant. Bestem eventuell bruk av [HelsenorgeAktivSjekken](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1810268162), med eget formål og tilgang; en forhåndssjekk erstatter ikke håndtering av avslag ved sending. | A / H, L | ☐ Åpen — … |
| **B3 Innsyn og utførelse.** Avklar separat hvem som kan **se** og **utføre** oppgaven, for innbygger selv, foreldre, ordinær og tildelt fullmakt. Overstyrt utførelse gir ikke automatisk innsyn. Avvik er avklart med Helsenorge etter [representasjonsreglene](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/3135111169). | H / A, L | ☐ Åpen — … |
| **B4 Barn, ungdom og adressesperre.** Avklar aktuelle aldersgrupper, innsynsbegrensninger og beskyttede adresser for valgt oppgavetype. Dokumenter både tillatte og avviste situasjoner; ikke legg samme regel til grunn for alle oppgavetyper. | H / A, L | ☐ Åpen — … |
| **B5 Tekst, avsender og hjelp.** Helseaktøren har godkjent tittel, beskrivelse, avsendernavn, kontaktinformasjon og språk. Avklar innholdseier, forståelighet, tilgjengelighet og hvilken hjelp innbygger får ved problemer. | A / H, L | ☐ Åpen — … |
| **B6 Varsler og påminnelser.** Avklar `plan` for oppgaver direkte knyttet til helsehjelp eller `proposal`, frister og påminnelser. Vurder sensitiv avsender. Avtal varselopplevelsen også ved endring og kansellering. Se [metadata](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/743014401) og [varsler](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1805680641). | A / H, L | ☐ Åpen — … |

## 3 HelseID og teknisk oppkobling

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **C1 HelseID-klient og API-tilgang.** Klientsystem og klientkonfigurasjon er registrert. Tilgang til «Helsenorge Ekstern API» og «Oppgave» er godkjent. Registrer scope, audience, klient-ID og eier per miljø. Se [systemkontekst](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1886191617) og [HelseID-guiden](HelseID_ekstern_konsument_Helsenorge_OppgaveAPI.md). | L / H, A | ☐ Åpen — … |
| **C2 Virksomhetskontekst.** Bekreft hvilket `orgnr_parent` som representerer helseaktøren, og behovet for `orgnr_child`. Avklar single-tenant eller multi-tenant, nødvendige delegeringer og hvordan tilgangen avsluttes ved leverandørbytte. | A / L, H | ☐ Åpen — … |
| **C3 Skille mellom helseaktører.** Ved flere kunder har leverandøren demonstrert at token, oppgaver og kvitteringer holdes i riktig virksomhetskontekst. Lokal brukerautorisasjon og sporbarhet er avklart selv om API-kallet skjer maskin-til-maskin. | L / A, H | ☐ Åpen — … |
| **C4 Miljø og nettverk.** Helsenorge har bekreftet [miljø og endepunkter](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1552384092). Avklar internett/Helsenett, nettverksåpninger, DNS, proxy og TLS. Skill test- og produksjonskonfigurasjon. | L / H, A | ☐ Åpen — … |
| **C5 Token og DPoP.** Leverandøren har demonstrert tokenhenting, nye DPoP-bevis per kall, korrekt metode/URL, tokenbinding, nonce og tokenutløp. PATCH må ha bevis for PATCH og ressursadressen. | L / H | ☐ Åpen — … |
| **C6 Nøkkelforvaltning.** Navngi eier av klientnøkler og rutiner for sikker lagring, tilgang, rotasjon, utløp og sperring ved hendelser. Bekreft hvordan driftsansvar overføres uten å dele private nøkler i oppkoblingsdokumentasjonen. | L / A | ☐ Åpen — … |

## 4 Oppgaveinnhold og livsløp

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **D1 FHIR-kontrakt.** Avklar versjon, profil, obligatoriske felt, kodeverk og extensions. Leverandøren har representative eksempler, og helseaktøren har godkjent mottaker, avsender, tekst og frister. Se [FHIR Task](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/742948883) og [implementasjonsguiden](implementasjonsguide-informasjonsoppgaver.md). | L / H, A | ☐ Åpen — … |
| **D2 Identitet og opprettelse.** Avklar stabil `Task.identifier`, lagring av returnert `Task.id` og koblingen til bestillingen i fagsystemet. Velg Task- eller Bundle-endepunkt etter brukstilfellet, og demonstrer vern mot dobbel innsending. | L / H | ☐ Åpen — … |
| **D3 Frister.** Avklar sluttdato, eventuell absolutt frist, tidssone og hvilken oppfølging som skal skje ved utløp. Beskriv forskjellen på ønsket utførelsesfrist og siste tillatte utførelse. | A / H, L | ☐ Åpen — … |
| **D4 Fullføring og resultater.** Avklar hvem som endrer status, hva «utført» betyr, mottak av svar og faglig oppfølging. Ved meldinger/skjemasvar fylles [M-punktene](#6-meldingsmottak-og-skjemasvar) ut. For [informasjonsoppgaver](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2619211802) setter Helsenorge `completed` ved første uthopp; nettstedet skal ikke gjøre dette. Uthopp er ikke dokumentert lesing. | H / A, L | ☐ Åpen — … |
| **D5 Korrigering og kansellering.** Avtal rutiner ved feil innhold eller mottaker, flyttet avtale og uaktuell oppgave, også etter fullføring/utløp. URL, tittel, avsender og mottaker kan ikke endres direkte med PATCH i gjennomgått HN-Oppgave; avtal alternativ håndtering. Se [feltoversikten](patch-felt-og-oppgavetyper.md). | A / L, H | ☐ Åpen — … |
| **D6 PATCH og varsling.** Avklar tillatte operasjoner og bevaring av data. Håndtering av kodeavvik for deadline, `basedOn` etter avslutning/utløp og varsling er dokumentert. Statusbegrunnelse krever faktisk statusendring. Se [kodeavvikene](patch-felt-og-oppgavetyper.md#avvik-og-forbehold-som-må-avklares-ved-oppkobling). | L / H, A | ☐ Åpen — … |
| **D7 Samtidige endringer.** Avtal avstemming og håndtering av konkurrerende oppdateringer. Ikke baser løsningen på at `If-Match` beskytter oppgaven; Helsenorge oppgir ikke støtte for ressursversjonering. Se [REST-kontrakten](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1254654012). | L / H | ☐ Åpen — … |

## 5 Ekstern løsning og uthopp

U1–U3 fylles ut ved ekstern lenke. U4–U14 fylles ut når sømløst uthopp er
påkrevd eller valgt etter U2; ellers markeres de «Ikke relevant» med begrunnelse.

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **U1 Lenke og innhold.** Avklar domener, lenkens levetid, innholdseier og tilgjengelighet. Avsender har verifisert lenkemålet. Oppgavens lenke skal etter avtalt sikkerhetsopplegg ikke inneholde persondata eller token. Ved sømløst uthopp peker den til et nettlesertilgjengelig startpunkt som starter OIDC. Se [uthoppsflyten](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1420034058). | A / L, H | ☐ Åpen — … |
| **U2 Når sømløst uthopp kreves.** Helsenorge har bekreftet valgt flyt. [Informasjonsoppgaver](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2619211802) krever Helsenorge OIDC ved personalisert innhold eller innlogging. [Generiske eksterne oppgaver](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1680867329) og [betalingsoppgaver](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/3153199105) krever SSO via Helsenorge. Andre typer avklares etter sin kontrakt. | H / A, L | ☐ Åpen — … |
| **U3 Brukerreise og utilgjengelig innhold.** Avtal tilgjengelighet på relevante enheter og med hjelpemidler, kontaktvei og videre navigasjon. Innbygger får forståelig beskjed ved flyttet eller utilgjengelig innhold, også etter innlogging. For informasjonsoppgaver skal gjenbesøk etter fullføring håndteres. Se [krav til informasjonsnettstedet](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2619211802). | A / L, H | ☐ Åpen — … |
| **U4 Forutsetninger for uthoppsklient.** Leverandørvilkår med NHN er signert, og leverandøren har tilgang til og bruker SyntPop før klient opprettes i test. Organisasjonsnavn/-nummer og teknisk og administrativ kontakt er registrert. Se [klientregistrering](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/3053846551). | L / H, A | ☐ Åpen — … |
| **U5 Klient, nøkler og returadresser.** Avklar klienttype og registrer offentlig nøkkel og tillatte `redirect_uri` per miljø. Nøkler og returadresser er ulike i test og produksjon; nye klienter bruker ikke delt hemmelighet. Nøkkelparet brukes bare mot Helsenorge OIDC. Nøkkeltype/-format er avklart med NHN. Se [registreringskrav](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/3053846551) og [gjeldende nøkkelstøtte](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1368752157). | L / H | ☐ Åpen — … |
| **U6 OIDC-flyt.** V3 med PAR, autorisasjonskode og PKCE `S256` er valgt. `state`, `nonce`, `openid` og øvrige påkrevde parametere inngår; webklient bruker `form_post`. Konfidensiell klient bruker signert `client_assertion`; mobilapp krever mTLS. Eventuell annen klienttype avklares særskilt. Se [V3](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731100) og [PAR-kontrakten](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731115). | L / H | ☐ Åpen — … |
| **U7 Discovery og tokenkontroll.** Miljøets `.well-known` er tillitsgrunnlag; bruk oppgitte endepunkter og sertifikatkjeden fra JWK-endepunktet. Kontroller signatur, `iss`, `aud`, `nonce` og tidsgrenser før tilgang. Håndter endret `kid` med oppdaterte nøkler. Se [V3 og JWK](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731100) og [ID-token](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731189/ID+token). | L / H | ☐ Åpen — … |
| **U8 Ny autentisering ved hvert uthopp.** Eksisterende lokal sesjon i samme nettleser avsluttes før ny OIDC-flyt, også når innbygger allerede er innlogget eksternt. Ny identitet og representasjon legges til grunn ved hvert uthopp. Se [krav ved representasjonsbytte](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1420034058). | L / H, A | ☐ Åpen — … |
| **U9 Identitet og tilgang.** Avklar mapping av pasient (`pid`/`sub`), innlogget aktør (`act_pid`/`act_sub`) og relasjon (`act_type`). Tilgang og handlinger bygger på validert token og reglene for oppgaven; klientstyrte lenkeparametere gir ikke autorisasjon. Se [ID-token](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731189/ID+token) og [representasjon](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2520481794). | L / H, A | ☐ Åpen — … |
| **U10 Synlig og låst personkontekst.** Personen løsningen brukes på vegne av vises på et fast sted. Identitet og representasjon kan ikke endres uten eksplisitt bytte knyttet til Helsenorge. Se [krav til brukerflaten](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2520481794). | L / A, H | ☐ Åpen — … |
| **U11 Sporbarhet ved representasjon.** Ved mottatte opplysninger lagres hvem de gjelder, hvem som handlet og relasjonen. Relevant person- og representasjonsinformasjon følger opplysningene til mottaker/sluttbruker. Se [leverandørkrav til representasjon](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2520481794). | L / A, H | ☐ Åpen — … |
| **U12 Lokal sesjon og inaktivitet.** Avtal og implementer lokal utlogging ved inaktivitet ut fra risikovurdering. Sesjonene er uavhengige: utlogging i Helsenorge avslutter ikke automatisk ekstern sesjon, eller omvendt. Se [sesjonsansvar](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1420034058). | L / A, H | ☐ Åpen — … |
| **U13 Tilbakekalling ved utlogging.** Ekstern utlogging, også ved inaktivitet, kaller `/revoke`. Send refresh-token hvis utstedt, ellers access-token, med autentisering for klienttypen. Avtal håndtering av feil ved tilbakekalling. Se [uthoppskravet](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1420034058) og [revoke-kontrakten](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731250). | L / H | ☐ Åpen — … |
| **U14 Eventuelle API-kall og fornyelse.** Avklar særskilt hvilke API-er løsningen trenger i innbyggerkontekst, klientens tilganger og behov for refresh-token (`offline_access`). HelseID-tilgangen for maskinell oppgaveinnsending er en separat flyt. Se [OIDC-tilganger](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731100) og [scope ved PAR](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348731115). | L / H, A | ☐ Åpen — … |

## 6 Meldingsmottak og skjemasvar

Fyll ut når oppgaven utløser meldinger til leverandørens eller helseaktørens
system. Ved skjemasvar fra Helsenorge brukes M1–M14 og M16; ved ekstern
skjemautfyller avklares svarleveringen etter M15. For andre meldinger brukes
de generelle mottakspunktene og kravene i aktuell meldingskontrakt. Marker
punkter som ikke gjelder valgt flyt med begrunnelse.
**For mottak av skjemasvar fra Helsenorge er versjon 1.1 et krav i denne
sjekklisten**, også når oppgaven opprettes via REST.

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **M1 Meldingsflyt og mottaksansvar.** Avklar hvilken løsning som fyller ut skjemaet, hvem som sender svaret og alle tilsiktede mottakere. Skjemasvar fra Helsenorges egen utfyller krever AMQP-mottak; REST-tilgang for oppgaveinnsending dekker ikke svarmottaket. For andre meldinger angis egen kontrakt. Se [sending og mottak av skjemasvar](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1758822401). | H / L, A | ☐ Åpen — … |
| **M2 Skjemasvar v1.1 — krav.** Leverandøren har bekreftet at installert produktversjon støtter `DIALOG_INNBYGGER_SKJEMAINNSENDING` v1.1. Helsenorge har bekreftet riktig prosessversjon og oppsett hos aktøren. Eldre 1.0-eksempler på [AMQP-siden](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1510572033) oppfyller ikke dette kravet; [FHIR-dokumentasjonen](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1008369665) beskriver utvidelsene i 1.1. | L / H, A | ☐ Åpen — … |
| **M3 Virksomhet og tjenesteadresse.** Helseaktørens virksomhet og mottakstjeneste har riktige HER-id-er i Adresseregisteret. Tjenestebasert adressering, miljø og koblingen til faktisk EPJ/avdeling er bekreftet for hver svarmottaker, også ved flere kunder eller mottakere. Se [forutsetninger for meldingsutveksling](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/690913297). | A / L, H | ☐ Åpen — … |
| **M4 Samhandlingsprofil og avtale.** Samhandlingsprofilen (CPP) på riktig kommunikasjonspart har aktuell prosess, versjon og rolle aktivert; for skjemasvar gjelder v1.1 med mottak og applikasjonskvittering. Gyldig samhandlingsavtale (CPA) med Helsenorge og samsvar mellom annonserte og faktisk støttede versjoner er bekreftet per miljø. Se [kommunikasjonsparametre](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348174375). | L / A, H | ☐ Åpen — … |
| **M5 Tilgang og vedlikehold av grunndata.** Nødvendige tilganger til Adresseregisteret og CPP/CPA er på plass, inkludert HelseID/DPoP der API-ene krever det. Navngi ansvarlig for oppdateringer. Fagsystemets administrasjon av støttet funksjonalitet og versjoner er avklart etter [krav til vedlikehold av samhandlingsprofil](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1791295489) og [tilgangsforutsetningene](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/690913297). | L / A, H | ☐ Åpen — … |
| **M6 Tjenestebuss og køer.** Tjenestebuss er aktivert for aktuelle kommunikasjonsparter. Køadresser, tilganger, mottaksprosess og sending av kvitteringer er konfigurert. Egen eller arvet kø er avklart; ved endring finnes rutine for oppdaterte adresser og håndtering av gamle køer. Se [aktivering og køarv](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1774583809). | L / A, H | ☐ Åpen — … |
| **M7 Virksomhetssertifikater og meldingssikring.** Gyldige virksomhetssertifikater er registrert og tilgjengelige for mottak og kvitteringer. Løsningen støtter dekryptering av Helsenorges AES256-CBC-meldinger og avtalt signaturkontroll. Ansvar for sertifikatbytte, utløp og revokeringssjekk er navngitt. Se [sertifikater og kryptering](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/690913297). | L / A, H | ☐ Åpen — … |
| **M8 Nettverk og klokke.** Nettverksvei og brannmuråpninger for AMQP/TLS, grunndata, HelseID og sertifikatkontroll er bekreftet per miljø. Produksjonsforbindelsen via Helsenett og tidssynkronisering er etablert. Se [nettverksforutsetninger](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/690913297). | L / A, H | ☐ Åpen — … |
| **M9 Meldingsformat og versjoner.** Mottaket håndterer Hodemelding v1.2 med `MsgInfo/Type = DIALOG_INNBYGGER_SKJEMAINNSENDING`, `Ack = J` og FHIR R4 Bundle i `Document`. Skjemainnsending v1.1 er prosess-/meldingskravet; det betyr ikke bruk av Dialogmelding v1.1 som innhold. Se [meldingsstruktur](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1510572033) og [innholdsstandarder](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348174289). | L / H | ☐ Åpen — … |
| **M10 Skjemainnhold og ekstraherte data.** Mottaket kan behandle `QuestionnaireResponse`, tilhørende `Questionnaire` og lesbar svarkopi i `DocumentReference` (PDF). Avklar håndtering av `Observation`, `ServiceRequest` og `Condition` når disse følger med i v1.1, samt skjemaversjon, interne referanser og lokal lagring/visning. Se [FHIR-ressurser i skjemaløsningen](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1008369665). | L / A, H | ☐ Åpen — … |
| **M11 Kobling og duplikater.** Leverandør og aktør har avtalt hvordan svaret kobles til riktig pasient, skjema og oppgave/bestilling. Meldings-ID, svaridentifikator og oppgavereferanse holdes atskilt. Gjentatt levering skal ikke gi dobbeltregistrering; uavklart kobling går til navngitt ansvarlig uten tap av svaret. | L / A, H | ☐ Åpen — … |
| **M12 Applikasjonskvittering.** Mottaket sender positiv eller negativ APPREC v1.1 til Helsenorge med riktig referanse og feilinformasjon. Avtal frist, hva positiv kvittering bekrefter om varig mottak, og oppfølging av uteblitt/avvist kvittering. AMQP-kvittering alene bekrefter ikke applikasjonsmottak. Se [skjemagrensesnittene](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2025783297) og [kvitteringsstandarden](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1348174289). | L / H, A | ☐ Åpen — … |
| **M13 Representasjon og faglig mottak.** Pasient, utførende person og representasjonsforhold bevares med svaret og vises for relevant helsepersonell. Helseaktøren har avklart journalføring/arbeidsliste, tilgang, ansvarlig mottaker og oppfølgingsfrist. Teknisk kvittering betyr ikke at svaret er faglig vurdert. Se [personopplysninger i skjemasvar](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1758822401). | A / L, H | ☐ Åpen — … |
| **M14 Overvåking og avvik.** Navngi ansvarlig for køer, stanset mottaksprosess, dekrypterings-/valideringsfeil og manglende APPREC. Avtal varsling, gjenopptakelse, avstemming og alternativ faglig oppfølging uten tap eller doble svar. Drifts- og supportreferanser er ført under E4–E5 og F4. | L / A, H | ☐ Åpen — … |
| **M15 Ekstern skjemautfyller.** Når utfyllingen skjer eksternt, er direkte levering til helseaktøren avtalt med denne leverandøren; svarruting via Helsenorge skal ikke forutsettes. Levering av innbyggers PDF-kopi til Helsenorge er avklart separat. Se [ansvar for svarlevering](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1758822401) og [krav til svarkopi](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1008369665). | L / A, H | ☐ Åpen — … |
| **M16 Dokumentert mottaksevne før oppstart.** Leverandørens og aktørens bevis viser mottak, behandling i fagsystemet og korrekt kvittering; for skjemasvar fra Helsenorge omfatter dette v1.1 og APPREC. Beviset gjelder aktuell produktversjon, kommunikasjonspart og miljø. Avvik har eier og beslutning; resultater føres i [testplanen](testplan-oppkobling-oppgave-api.md#3-felles-testscenarioer). | A / L, H | ☐ Åpen — … |

## 7 Kvittering og feiloppfølging

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **E1 Kvittering.** Bekreft responsform, HTTP-status og identifikatorer for opprettelse og oppdatering. Lagre resultatet varig. Avklar hva fagsystemet viser som mottatt, avvist, uavklart og utført; API-kvittering er ikke bevis på lest innhold. | L / H, A | ☐ Åpen — … |
| **E2 Funksjonelle avslag.** Avtal hvem som følger opp feil persondata, manglende digital aktivitet, reservasjon, duplikat og ugyldige oppdateringer. Operatøren får forståelig forklaring og neste handling. Se [feilkoder](https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/1979777036). | A / L, H | ☐ Åpen — … |
| **E3 Ukjent utfall.** Avklar støttet oppslag eller annen avstemmingsprosedyre med Helsenorge. Ved timeout eller krasj etter sending beholdes bestillings-ID og utfallet undersøkes før ny sending. Dette gjelder også PATCH som kan legge til notater. | L / H, A | ☐ Åpen — … |
| **E4 Volum og driftsavbrudd.** Avtal forventet normal- og toppvolum, eventuell oppstartskø, begrensninger og kontrollert gjenopptakelse. Køer, retry og overvåking skal hindre dobbel utsending og vise oppgaver som trenger manuell behandling. | L / H, A | ☐ Åpen — … |
| **E5 Sporbarhet og support.** Avtal nødvendige korrelasjons-ID-er, tilgang til logger, lagringstid og sikker innsending av feildokumentasjon. Navngi mottaker av tekniske hendelser og av pasienthenvendelser hos de tre partene. | L / A, H | ☐ Åpen — … |

## 8 Produksjonssetting og forvaltning

| Punkt og ferdigkriterium | Føres av / avklares med | Status og bevis |
| --- | --- | --- |
| **F1 Godkjenninger og konfigurasjon.** Helsenorge har bekreftet nødvendige godkjenninger og produksjonstilgang. Leverandøren har kontrollert produksjonsklient, virksomhet, nettverksvei, endepunkt og lenkemål. | H / L, A | ☐ Åpen — … |
| **F2 Pilot og aktivering.** Avtal første helseaktør/avdeling, målgruppe, volum, dato, bemanning og kriterier for å utvide. Bekreft hvem som faktisk aktiverer utsendingen, og hvem som beslutter oppstart. | A / H, L | ☐ Åpen — … |
| **F3 Stans og tilbakeføring.** Demonstrer hvordan ny utsending stoppes. Avtal håndtering av kø og allerede sendte oppgaver; tilbakeføring av kode trekker ikke tilbake oppgaver hos innbygger. | L / A, H | ☐ Åpen — … |
| **F4 Drift og beredskap.** Kontaktpunkter, åpningstider, overvåking, eskalering og alternativ pasientoppfølging er kjent. Avtal hvilke hendelser som krever rask stans eller koordinert varsling mellom partene. | A / L, H | ☐ Åpen — … |
| **F5 Endringer og avvikling.** Avtal ansvar for endringer i API/profil, oppgavemaler, nøkler, domener, organisasjon og representasjon. Beskriv avslutning av tilganger og håndtering av gjenstående oppgaver ved leverandørbytte eller avvikling. | A / L, H | ☐ Åpen — … |
| **F6 Testgrunnlag og aksept.** Omfang, ansvar, resultater og avvik i [testplanen](testplan-oppkobling-oppgave-api.md) er gjennomgått. Aktuelle krav til sømløst uthopp og meldingsmottak, inkludert skjemasvar v1.1, er omfattet. Helsenorge og helseaktøren har bekreftet sine akseptkriterier. | H / A, L | ☐ Åpen — … |

## 9 Åpne punkter og beslutning

| Punkt-ID | Uavklart forhold og konsekvens | Navngitt eier | Frist | Må løses før | Beslutning og referanse |
| --- | --- | --- | --- | --- | --- |
| … | … | … | … | Test / produksjon / utvidelse | … |

**Foreslåtte beslutningspunkter for dette oppkoblingsløpet:**

- [ ] **Klar for integrasjonstest:** Brukstilfelle, parter, virksomhetskontekst,
  testtilgang, data og forventede resultater er avklart. Lokale kontroller er bestått.
- [ ] **Klar for produksjon:** Relevante sjekkpunkter og testscenarioer er
  dokumentert. Nødvendige godkjenninger foreligger, og det finnes ingen uløste
  avvik som hindrer forsvarlig oppstart. Eventuelle aksepterte restpunkter har
  beslutningstaker, begrunnelse, tiltak og frist; obligatoriske krav kan ikke fravikes her.
- [ ] **Klar for utvidelse:** Pilotens leveranser, feil, innbyggeropplevelse og
  faglige oppfølging er gjennomgått før flere avdelinger, helseaktører eller større volum kobles på.

| Beslutning | Dato | Helsenorge | Leverandør | Helseaktør | Vilkår og beslutningsreferanse |
| --- | --- | --- | --- | --- | --- |
| Integrasjonstest | … | … | … | … | … |
| Produksjonssetting | … | … | … | … | … |
| Utvidelse | … | … | … | … | … |
