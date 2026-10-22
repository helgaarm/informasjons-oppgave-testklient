# Sikkerhet

Sikkerhetsrettelser leveres på nyeste versjon av `main`. Eldre commits og lokale
kopier må oppdateres av den som bruker dem.

## Rapporter en sårbarhet

Bruk [privat sårbarhetsrapportering på GitHub](https://github.com/helgaarm/informasjons-oppgave-testklient/security/advisories/new).
Hvis funksjonen ikke er aktivert, be vedlikeholderen aktivere den. En offentlig
forespørsel om dette skal ikke inneholde sårbarhetsdetaljer, nøkler eller data.

Beskriv berørt commit, konsekvens og en reproduksjon med syntetiske testdata.
Ikke legg tilgangstoken, private nøkler, fødselsnumre eller helseopplysninger i
issues, pull requests, logger eller skjermbilder.

## Tiltenkt bruk og grenser

- Applikasjonen er for én lokal operatør, syntetiske testdata og Helsenorge test02.
- Serveren binder til loopback. Bruk en SSH-tunnel ved kjøring på en ekstern maskin.
- HelseID autentiserer API-klienten; applikasjonen har ikke operatørinnlogging.
  Den skal ikke eksponeres som en offentlig eller delt webtjeneste.
- `.env`, API-nøkler og private nøkkelfiler skal bare være lokale. Eksempelfilen
  `.env.example` inneholder tomme legitimasjonsfelt.
- TLS-verifikasjon skal være aktiv. Ikke bruk produksjonsnøkler i dette prosjektet.

Ved lekkasje: tilbakekall/roter nøkkelen hos utstederen først. Sletting i en ny
commit fjerner ikke hemmeligheten fra Git-historikk, kloner eller forks.

## Kontroller i repoet

CI kjører tester og bygg på Node.js 22 og 24, og Gitleaks skanner Git-historikken
med maskert rapportering. Avhengigheter kontrolleres ved endringer og ukentlig.
CodeQL er konfigurert for automatisk analyse når repoet er offentlig.
Dependabot foreslår oppdateringer for npm og GitHub Actions.

Arbeidsflytene bruker fastlåste commit-SHA-er og minst mulige tokenrettigheter.
De bruker verken HelseID-hemmeligheter eller `pull_request_target`. Installasjon
av npm-avhengigheter kjører med `--ignore-scripts`.

GitHub-innstillinger som grenbeskyttelse, hemmelighetsbeskyttelse og privat
rapportering krever separat administratortilgang. Se [oppsettet](docs/repository-security.md).
