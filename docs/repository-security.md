# Sikkerhetsoppsett for GitHub

Arbeidsflyter og Dependabot-konfigurasjon følger kildekoden. GitHub-innstillinger
aktiveres separat. At et oppsettskript finnes, betyr ikke at innstillingene er aktive.

`scripts/configure-github-security.py` er avgrenset til
`helgaarm/informasjons-oppgave-testklient`. Det gjør repoet offentlig og setter:

- PR-er før endringer på `main`, oppdaterte og beståtte tester, hemmelighetsskanning,
  avhengighetskontroll, løste diskusjoner og beskyttelse også for administratorer.
- Ingen force-push eller sletting av `main`. Squash-merge og lineær historikk for
  nye endringer; eksisterende historikk beholdes.
- Lesetilgang som standard for Actions-token; arbeidsflyter kan ikke godkjenne PR-er.
- Kun Actions fra `actions/*` og `github/codeql-action/*`.
- Dependabot-varsler og sikkerhetsrettelser, secret scanning, push protection og
  privat sårbarhetsrapportering.

Repoet har én kjent vedlikeholder. PR-er kreves, men antall eksterne godkjenninger
er satt til 0 for å unngå at eieren må godkjenne egne PR-er. Når en ekstra
vedlikeholder er på plass, sett antallet til minst 1 og vurder krav om CODEOWNER-review.
CodeQL kjører på offentlige repoer; det er ikke et obligatorisk statuskrav før
første offentlige analyse er bekreftet vellykket.

## Aktiver innstillingene

Krever Python 3, GitHub CLI og en GitHub-innlogging med rettigheter til å administrere
repoet. Se [repoets innstillinger](https://github.com/helgaarm/informasjons-oppgave-testklient/settings).
En integrasjon kan ha skrivetilgang til kode uten å ha tilgang til disse innstillingene.

```bash
python3 scripts/configure-github-security.py --plan
python3 scripts/configure-github-security.py --apply
```

Kjør oppsettet etter at sikkerhetscommitten er pushet og CI er grønn. Scriptet
skriver ikke ut token. Det kontrollerer synlighet, rapporterer HTTP-feil per tiltak
og returnerer feilstatus hvis noe ikke ble aktivert. Kjør det på nytt etter at
rettigheter eller GitHub-funksjoner er tilgjengelige. Scriptet overskriver ikke
eksisterende grenbeskyttelse: tilstrekkelige regler beholdes, øvrige regler må
gjennomgås manuelt.

Kontroller deretter **Settings → Rules/Branches**, **Settings → Actions** og
**Settings → Code security**, samt siste kjøring av **Security**. Privat status
eller en hoppet over CodeQL-jobb betyr at offentlig skanning ikke er bekreftet.

## Kontroller lokalt

```bash
npm ci --ignore-scripts
npm test
npm run build
npm audit --audit-level=moderate
bash scripts/scan-secrets.sh
```

Gitleaks-scriptet krever Linux x86_64 og verifiserer nedlastet binærfil mot en
SHA-256 fra den offisielle releasen. Oppdater både versjon og checksum ved oppgradering.
Kontrollene reduserer risiko, men er ikke en garanti for at koden er sårbarhetsfri.
