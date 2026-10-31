# Vite 8.3.5 – validering av PR #9

Kontrollert 31. oktober 2026. Utgangspunkt: PR-commit
`4f977e1e854ec397d5328ccb5705566c6e850162`. Sammenligningen med Vite 7.3.7
bruker `766150bdf2dca74594a8c97fcc1b4b9c7fb5475e` og samme rettede test.

## Årsak til 404

Den opprinnelige testfixturen manglet `package.json` og skrev selv en fil til
`node_modules/.vite/deps/browser-dependency.js`. Filen var ikke resultatet av
en import eller dependency optimization og hadde ingen optimizer-metadata.

En isolert oppstart med samme mappeoppsett bekreftet:

| Versjon | Valgt cachemappe uten package.json | Den manuelt opprettede filen etter oppstart |
| --- | --- | --- |
| Vite 7.3.7 | `.vite` | Finnes fortsatt |
| Vite 8.3.5 | `node_modules/.vite` | Slettet |

Vite 8 velger den eksisterende `node_modules`-mappen som cacheplassering også
uten `package.json`. Optimizer rydder cache som mangler gyldige metadata.
Dermed slettes testfilen før forespørselen og gir 404. Vite 7-testen serverte
i praksis en vanlig fil utenfor den aktive optimizer-cachen. Feilmeldingens
generelle forslag om `optimizeDeps.exclude` er derfor ikke løsningen her.

Dette er bekreftet både mot de installerte Vite-versjonenes `resolveConfig`
og `loadCachedDepOptimizationMetadata`, og ved kjøring. Vite 8 bruker også
Rolldown i stedet for esbuild til dependency optimization, men den konkrete
404-årsaken her er cacheplasseringen og den ugyldige fixturen.

## Rettelse og sikkerhetskrav

Testfixturen får `package.json` og en liten syntetisk ESM-pakke i
`node_modules/browser-dependency`. Sikkerhetstesten importerer pakken med en
vanlig bare import, leser URL-en fra Vites transformerte JavaScript og laster
den faktiske optimaliserte avhengigheten med Vites `?v=`-parameter.
Testen krever HTTP 200, JavaScript-innholdstype, forventet innhold, samme origin
og fravær av både CORS-tillatelse og den syntetiske hemmelighetsmarkøren.

Alle eksisterende negative kontroller er beholdt: `.env`, `.env.local`,
`.git/config`, `secrets/connection.json`, serverkode, privat PEM-fil og filer
i `public`, via direkte stier, `/@fs/`, `?raw`, `?url`, `?import` og kodet sti.
Origin-, vertsnavn-, CSP- og produksjonskontrollene er også beholdt.
Ingen serverkode, allow/deny-regler, Vite-konfigurasjon eller avhengigheter
endres av denne rettelsen.

## Lokale resultater

Avhengigheter ble installert fra låsefil med `npm ci --ignore-scripts`.
Node-versjonene var 22.19.0 og 24.22.1 på Linux.

| Kontroll | Node 22.19.0 | Node 24.22.1 |
| --- | --- | --- |
| Opprinnelig sikkerhetstest, Vite 7.3.7 | 3/3 bestått | 3/3 bestått |
| Opprinnelig sikkerhetstest, Vite 8.3.5 | 404-feilen gjenskapt | 404-feilen gjenskapt |
| `npm test`, rettet test, Vite 7.3.7 | 58/58 bestått | 58/58 bestått |
| `npm run build`, Vite 7.3.7 | Bestått | Bestått |
| `npm test`, rettet test, Vite 8.3.5 | 58/58 bestått | 58/58 bestått |
| `npm run build`, Vite 8.3.5 | Bestått | Bestått |
| `npm run test:ui`, Vite 8.3.5 | Blokkert ved nettleseroppstart | Blokkert ved nettleseroppstart |

De 10 Python-testene for repository security bestod. `git diff --check` bestod.
Playwright 1.64.1 fant alle syv UI-testene, men ingen kunne starte Chromium.
Både vanlig Chromium og headless shell-nedlasting returnerte ugyldige eller
ufullstendige ZIP-filer (`End of central directory record signature not found`).
UI-resultatene er derfor ikke beståtte tester og dokumenterer ikke applikasjonsfeil.
Det ble ikke brukt ekte nøkler eller gjort kall til HelseID/Helsenorge.

## Flettevurdering

Den bekreftede 404-feilen er rettet uten svekkede sikkerhetskrav.
Før fletting må CI på oppdatert PR fullføre, inkludert nettlesertestene og
sikkerhetsjobbene. Eksisterende CI kjører Playwright på Node 24; lokal
nettleservalidering på både Node 22 og 24 er fortsatt uavklart.
PR-en er ikke flettet som del av denne undersøkelsen.

## Kilder

- [PR #9](https://github.com/helgaarm/informasjons-oppgave-testklient/pull/9)
- [Opprinnelig CI-kjøring](https://github.com/helgaarm/informasjons-oppgave-testklient/actions/runs/40280765097)
- [Vite 7.3.7: config.ts](https://github.com/vitejs/vite/blob/v7.3.7/packages/vite/src/node/config.ts)
- [Vite 8.3.5: config.ts](https://github.com/vitejs/vite/blob/v8.3.5/packages/vite/src/node/config.ts)
- [Vite 8.3.5: optimizer](https://github.com/vitejs/vite/blob/v8.3.5/packages/vite/src/node/optimizer/index.ts)
- [Migrering til Vite 8](https://vite.dev/guide/migration)
- [Dependency pre-bundling og cache](https://vite.dev/guide/dep-pre-bundling)
