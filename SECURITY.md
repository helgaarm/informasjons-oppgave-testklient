# Sikkerhet

Sikkerhetsrettelser leveres på nyeste versjon av `main`. Eldre commits og lokale
kopier må oppdateres av den som bruker dem.

Policyen gjelder både Node-versjonen i repoets rot og .NET-versjonen i `dotnet/`.
.NET-versjonen har separat `.env`, `secrets/connection.json` og øktcookie.
Den serverer bare bygget frontend fra `dist`/`wwwroot`; Vite kjører ikke som
HTTP-server. Testverten med simulerte svar er et eget prosjekt som ikke følger
med ved publisering av API-prosjektet.

## Rapporter en sårbarhet

Bruk [privat sårbarhetsrapportering på GitHub](https://github.com/helgaarm/informasjons-oppgave-testklient/security/advisories/new).
Hvis funksjonen ikke er aktivert, be vedlikeholderen aktivere den. En offentlig
forespørsel om dette skal ikke inneholde sårbarhetsdetaljer, nøkler eller data.

Beskriv berørt commit, konsekvens og en reproduksjon med syntetiske testdata.
Ikke legg tilgangstoken, private nøkler, fødselsnumre eller helseopplysninger i
issues, pull requests, logger eller skjermbilder.

## Tiltenkt bruk og grenser

- Applikasjonen er for én lokal operatør, syntetiske testdata og Helsenorge Test01/Test02.
- Serveren binder til loopback. Bruk en SSH-tunnel ved kjøring på en ekstern maskin.
- HelseID autentiserer API-klienten; applikasjonen har ikke operatørinnlogging.
  Den skal ikke eksponeres som en offentlig eller delt webtjeneste.
- `.env`, API-nøkler og private nøkkelfiler skal bare være lokale. Eksempelfilen
  `.env.example` inneholder tomme legitimasjonsfelt.
- Tilkoblingsskjemaet lagrer TTT-oppsett og API-nøkkel i `secrets/connection.json`
  på servermaskinen. Filen er utelatt fra Git og lagres uten kryptering, med
  begrensede filrettigheter der operativsystemet støtter det. Beskytt derfor
  brukerkontoen og den lokale prosjektmappen. API-nøkkelen skrives inn i et
  skjult felt, men returneres aldri i API-svar eller lagres i nettleserlagring.
- Lagring bruker samme vertsnavn-, origin-, sesjons- og CSRF-kontroller som
  innsending. Tilkoblingsskjemaet kan bare endre de fem TTT-feltene, ikke filsti,
  endepunkter, miljø eller autentiseringsmetode. Lagring utfører ingen eksterne
  tjenestekall og er sperret under tilkoblingstester og innsendinger.
- Innsending krever et eksplisitt valg av `test01` eller `test02`. Serveren velger
  mål fra en fast liste, uten støtte for produksjon eller vilkårlige URL-er.
  DPoP-bevis bindes til valgt endepunkt; API-noncer og duplikatsperrer er adskilt
  per testområde. Bytte av område krever ny bekreftelse på testdata i grensesnittet.
- TLS-verifikasjon skal være aktiv. Ikke bruk produksjonsnøkler i dette prosjektet.
- Utviklingsserveren begrenser filtilgang til frontend-kode og avhengigheter.
  Lokale oppsett, serverkode og private nøkkelfiler skal aldri kunne lastes ned.
  Origin- og vertsnavnkontroller gjelder også statiske filer. Vite har ingen
  separat WebSocket-port, offentlig filmappe eller eksponerte miljøvariabler.
- Alle ruter har en felles grense på 240 forespørsler per minutt. Tilkobling,
  konfigurasjonslagring og innsending deler en strengere grense på 20 per minutt.
  Begrensningene gjelder serverprosessen og kan ikke nullstilles med ny økt
  eller videresendingsheadere. Ved avvisning returneres HTTP 429 og Retry-After.

Ved lekkasje: tilbakekall/roter nøkkelen hos utstederen først. Sletting i en ny
commit fjerner ikke hemmeligheten fra Git-historikk, kloner eller forks.

## Kontroller i repoet

CI kjører tester og bygg på Node.js 22 og 24, og egne .NET 10-, Vitest- og
nettlesertester for den parallelle implementasjonen. Gitleaks skanner Git-historikken
med maskert rapportering og en ekstra regel for NHNs UUID-formede TTT-nøkler.
Avhengigheter kontrolleres ved endringer og ukentlig, og dependency review
kontrollerer nye avhengigheter i PR-er. CodeQL analyserer JavaScript/TypeScript,
C#, Python og GitHub Actions når repoet er offentlig. NuGet-restore bruker
låste avhengigheter og feiler ved kjente sårbarheter i direkte eller transitive
pakker. Dependabot foreslår oppdateringer for begge npm-prosjektene, NuGet og
GitHub Actions.

Arbeidsflytene bruker fastlåste commit-SHA-er og minst mulige tokenrettigheter.
De bruker verken HelseID-hemmeligheter eller `pull_request_target`. Installasjon
av npm-avhengigheter kjører med `--ignore-scripts`.

GitHub-innstillinger som grenbeskyttelse, hemmelighetsbeskyttelse og privat
rapportering krever administratortilgang og kan verifiseres med
`python scripts/configure-github-security.py --check`. Se [oppsettet](docs/repository-security.md).
