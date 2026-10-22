# Sikkerhetsoppsett for GitHub

Arbeidsflyter og Dependabot-konfigurasjon følger kildekoden. GitHub-innstillinger
aktiveres separat. At et oppsettskript finnes, betyr ikke at innstillingene er aktive.

`scripts/configure-github-security.py` er avgrenset til
`helgaarm/informasjons-oppgave-testklient`. Det krever et allerede offentlig repo
og endrer aldri synlighet. Det setter:

- PR-er før endringer på `main`, oppdaterte og beståtte tester, hemmelighetsskanning,
  avhengighetskontroll, CodeQL, løste diskusjoner og beskyttelse også for administratorer.
  Obligatoriske statuskontroller må komme fra GitHub Actions-appen.
- Et eget aktivt CodeQL-regelsett uten omgåelsesrettigheter sperrer fletting ved
  nye sikkerhetsfunn av middels eller høyere alvorlighet, eller analysefunn på
  feilnivå. Dette kontrollerer funnene, ikke bare at analysejobben fullføres.
- Ingen force-push eller sletting av `main`. Squash-merge og lineær historikk for
  nye endringer; eksisterende historikk beholdes.
- Lesetilgang som standard for Actions-token; arbeidsflyter kan ikke godkjenne PR-er.
- Kun checkout, setup-node, dependency-review og CodeQL fra deres offisielle
  Actions-repoer. Alle Actions må være låst til full commit-SHA.
- Vedlikeholder må godkjenne arbeidsflyter fra alle eksterne bidragsytere.
- Dependabot-varsler og sikkerhetsrettelser, secret scanning, push protection og
  privat sårbarhetsrapportering.

Repoet har én kjent vedlikeholder. PR-er kreves, men antall eksterne godkjenninger
er satt til 0 for å unngå at eieren må godkjenne egne PR-er. Når en ekstra
vedlikeholder er på plass, sett antallet til minst 1 og vurder krav om CODEOWNER-review.
CODEOWNERS ber vedlikeholderen om review. Scriptet oppretter bare grenbeskyttelse
når alle fem obligatoriske kontroller allerede har bestått på siste `main`.
CodeQL analyserer JavaScript, Python og GitHub Actions. Dependency review
kontrollerer nye avhengigheter i PR-er; npm audit kontrollerer hele lockfilen.

## Aktiver innstillingene

Krever Python 3, GitHub CLI og en GitHub-innlogging med rettigheter til å administrere
repoet. Se [repoets innstillinger](https://github.com/helgaarm/informasjons-oppgave-testklient/settings).
En integrasjon kan ha skrivetilgang til kode uten å ha tilgang til disse innstillingene.

```bash
python3 scripts/configure-github-security.py --plan
python3 scripts/configure-github-security.py --apply
python3 scripts/configure-github-security.py --check
```

Kjør oppsettet etter at sikkerhetscommitten er pushet og CI er grønn. Scriptet
skriver ikke ut token. Det leser alle innstillinger tilbake fra GitHub etter
aktivering og returnerer feilstatus hvis noe ikke er aktivert. `--check` er
skrivebeskyttet og returnerer også feilstatus ved avvik. Kjør det på nytt etter at
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
python3 -m unittest discover -s tests -p 'test_*.py'
bash scripts/scan-secrets.sh
```

Gitleaks-scriptet krever Linux x86_64 og verifiserer nedlastet binærfil mot en
SHA-256 fra den offisielle releasen. Oppdater både versjon og checksum ved oppgradering.
Standardreglene suppleres med `.gitleaks.toml` for UUID-formede NHN TTT-nøkler.
En syntetisk positiv test bekrefter regelen før historikken skannes. Ikke legg
reelle nøkler i testfixtures eller rapporter. GitHub push protection og Gitleaks
dekker ulike mønstre; appens egen TTT-regel kjøres i CI etter push.
GitHubs tillegg for generiske hemmelighetsmønstre er ikke tilgjengelig for dette
personlige repoet; [GitHub krever organisasjon og Secret Protection](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enabling-secret-scanning-for-generic-patterns).
Gitleaks skanner også generiske hemmeligheter med standardreglene sine.
Kontrollene reduserer risiko, men er ikke en garanti for at koden er sårbarhetsfri.

## Vedlikehold

Behandle sikkerhetsvarsler og Dependabot-PR-er fortløpende. Bruk feature branch
og PR for nye endringer; `main` kan ikke pushes direkte eller force-pushes.
Ikke legg NHN-hemmeligheter i GitHub Actions; CI trenger bare syntetiske data.

Grunnlaget for oppsettet er [GitHubs sikkerhetsveiledning for Actions](https://docs.github.com/en/actions/reference/security/secure-use)
og [GitHubs repo-sikkerhetsinnstillinger](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository).
