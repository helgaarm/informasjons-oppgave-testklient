# .NET-testklient

En parallell implementasjon av informasjonsoppgaveklienten for utviklere som
foretrekker Microsoft-stakken. Den eksisterende Node-applikasjonen i repoets rot
beholdes og kan kjøres samtidig.

| Del | Teknologi |
| --- | --- |
| Server | C#, ASP.NET Core, .NET 10 |
| FHIR | Firely .NET SDK, `Hl7.Fhir.R4` 6.8 |
| Grensesnitt | React 19, TypeScript med strict-modus, Redux Toolkit, Sass |
| Frontendbygg og enhetstester | Vite 8, Vitest 4 |
| Servertester | MSTest, ASP.NET Core TestHost |
| Nettlesertester | Playwright mot en isolert C#-testserver |

Det trengs ingen database, meldingskø eller interne NHN-pakker. Den nye serveren
bruker Firely til FHIR JSON/XML, R4-modellmetadata og strukturvalidering.
`fhir-tool` brukes fortsatt av den opprinnelige appen; det er ingen avhengighet
til dette biblioteket i .NET-versjonen.

## Kom i gang

Klon hele repoet. Du trenger **.NET 10 SDK**, **Node.js 22.19 eller nyere** og npm.
Bruk en oppdatert Node LTS. Fra repoets rot:

```shell
cd dotnet/frontend
npm ci --ignore-scripts
npm run build
cd ..
dotnet restore Testklient.slnx --locked-mode
dotnet run --project src/Testklient.Api
```

Åpne **http://localhost:3001**. Den opprinnelige appen bruker normalt port 3000.
Du kan redigere, importere, validere og eksportere før HelseID er konfigurert.
Ctrl+C stopper serveren. Startkommandoen ovenfor starter den igjen.

På denne utviklingsmaskinen finnes også en lokal SDK i repoets ignorerte
`.tools/dotnet/`. Fra `dotnet/` kan PowerShell bruke
`..\.tools\dotnet\dotnet.exe` i stedet for `dotnet` hvis SDK 10 ikke er på PATH.

Åpne **Tilkobling**, oppgi din egen TTT-API-nøkkel og en testvirksomhet du har
tilgang til, og kontroller audience og scope. Velg **Lagre oppsett** og deretter
**Test tilkobling**. Tilkoblingstesten henter et token; den sender ingen oppgave
og bekrefter ikke tilgang til Oppgave i Helsenorge.

## Eget oppsett

.NET-versjonen leser bare sin egen `.env` og `secrets/connection.json` under
`dotnet/`. Den kopierer ikke oppsett, API-nøkkel eller privatnøkkel fra den andre
appen. Begge bruker en separat øktcookie. Oppgaver og nøkler lagres ikke i
nettleserens localStorage. Redux inneholder utkastet og valgt testområde, og
Redux DevTools er deaktivert.

Du kan kopiere `.env.example` til `.env` i denne mappen hvis du vil konfigurere
uten skjemaet. Prosessens miljøvariabler overstyrer `.env`; lagret TTT-oppsett
overstyrer de fem redigerbare tilkoblingsverdiene. Tomt nøkkelfelt i skjemaet
beholder den lagrede nøkkelen. Lagring sperres under tilkoblingstest og innsending.

Samme HelseID-variabler og begge autentiseringsmåter er tilgjengelige som i
[hovedveiledningen](../README.md#helseid-test-med-test-token-tjenesten-ttt):
TTT og registrert klient med `client_credentials`, privat JWK/PEM,
`private_key_jwt` og DPoP. Relative nøkkelstier gjelder denne mappen.
Organisasjon og nøkkel har ingen forhåndsvalgte verdier.

`PORT` er som standard `3001`. Ved portendring må `APP_ORIGIN` endres tilsvarende,
for eksempel til `http://localhost:3002`. `HOST` må være loopback. Ekstern kjøring
krever tunnel; appen har ingen operatørinnlogging for offentlig flerbrukerdrift.
Utgående HTTPS bruker .NETs standard proxy- og sertifikathåndtering. En intern CA
må være betrodd av operativsystemet; TLS-verifikasjon skal være aktiv.

## Bruk og avgrensninger

Oppgaveflyten og det kompakte, responsive grensesnittet er beholdt: veiledet
skjema, alle FHIR-felt, JSON-editor, JSON/XML-import, JSON-eksport, tilkobling og
innsendingshistorikk i nettleserfanen. Test02 er standard; Test01 kan velges før
innsending og krever ny bekreftelse av testdata. Produksjon kan ikke velges.
Innsyn for ungdom og foreldre er fortsatt deaktivert i det veiledede skjemaet.

Firely kontrollerer R4-struktur sammen med klientens lokale Helsenorge-regler.
Dette er **ikke full NHN-profil- eller terminologivalidering**. JSON-utkast kan
inneholde ukjente felt ved import; de beholdes, men avvises ved validering før
innsending. XML leses med Firelys strengere R4-deserialisering og må ha gyldig
grunnstruktur. DTD-er og eksterne entiteter er forbudt. Import er begrenset til
én Task på 1 MB; lokale JSON-forespørsler til 2 MB.

Token hentes over TLS fra faste HelseID test-endepunkter. Serveren kontrollerer
tokenets innhold og DPoP-binding; den er ikke en separat JWT-signaturvalidator.
Testtoken mellomlagres i minnet i inntil fem minutter. API-nøkler, token og
private nøkler returneres ikke av det lokale API-et.

Vellykket og usikker levering sperrer samme oppgaveidentifikator i samme
testområde i serverøkten. Nettverksbrudd gjentas ikke automatisk. En dokumentert
DPoP nonce-utfordring kan gjentas én gang. Sperren er lokal, utløper med økten
etter 30 minutter og forsvinner ved omstart; den er ikke varig idempotens.

## Utvikling og tester

Frontend gjenbruker repoets CSS via Sass og de rene TypeScript-typede adapterne
til eksisterende felt- og tilbakemeldingshjelpere i `shared/`. Backend er C#.
Endringer i felles filer må derfor testes mot begge implementasjonene.

For utvikling: kjør `npm run dev` i `dotnet/frontend` og
`dotnet watch run --project src/Testklient.Api` i `dotnet` i hver sin terminal.
Vite bygger til disk i watch-modus; ASP.NET Core serverer filene på samme origin.
Last nettleseren på nytt etter endringer.

Fra `dotnet/`:

```shell
dotnet restore Testklient.slnx --locked-mode
dotnet build Testklient.slnx --no-restore
dotnet test Testklient.slnx --no-build --no-restore
cd frontend
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

Bygg løsningen før nettlesertestene: `dotnet build` ovenfor bygger også
`Testklient.BrowserHost`. Testverten er et eget prosjekt og inngår ikke i
produksjonsserveren. Testene bruker syntetiske data, engangsnøkler, midlertidige
oppsett og erstattede HTTP-tjenester. De leser ikke brukerens `.env` eller
lagrede nøkkel og sender ingen oppgaver til NHN. Nettleseren blokkerer eksterne
forespørsler. Lokal verifisering erstatter ikke en reell integrasjonstest med
egen godkjent klient og testvirksomhet.

På Windows kan installert Edge brukes ved å sette
`$env:PLAYWRIGHT_CHANNEL='msedge'`. Sett eventuelt `$env:DOTNET_EXE` til absolutt
sti til en lokal .NET 10-installasjon for testverten. CI bruker Chromium.

## Publisering til lokal kjøring

Bygg frontend først, og kjør deretter fra `dotnet/`:

```shell
dotnet publish src/Testklient.Api -c Release -o ../artifacts/dotnet-app
```

Kjør `dotnet Testklient.Api.dll` i publiseringsmappen med ASP.NET Core Runtime 10
installert. Frontendfilene følger med i `wwwroot`; Node.js trengs ikke ved
kjøring. Det publiserte programmet bruker `.env` og `secrets/` i sin egen mappe.
Ingen testvert, konfigurerte hemmeligheter eller private nøkler pakkes med.

Sikkerhetspolicyen i [SECURITY.md](../SECURITY.md) gjelder begge variantene.
