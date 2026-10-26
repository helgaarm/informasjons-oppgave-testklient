import React, { useEffect, useRef, useState } from 'react';
import type { AuthStatus, ConnectionValues, Notice, TestEnvironment } from './types';
import { apiError } from './api';
interface Props { auth?: AuthStatus; busy: string; connect: () => Promise<void>; saveSettings: (values: ConnectionValues) => Promise<AuthStatus>; environment?: TestEnvironment }
type SetupProps = Omit<Props, 'auth' | 'environment'> & { auth: AuthStatus; environment: TestEnvironment };
import { DEFAULT_ENVIRONMENT, getTestEnvironment } from './environments';

const guide = 'https://utviklerportal.nhn.no/informasjonstjenester/helseid/helseid-selvbetjening/test-token-tjenesten/docs/test-token-tjenesten_enmd';
// Suggest only API-wide values. The user supplies their own API key and test
// organization; existing settings take precedence.
const suggestions = {
  audience: 'nhn:helsenorge.eksternapi',
  scope: 'nhn:helsenorge.eksternapi/Oppgave',
};
const missingLabels: Record<string, string> = {
  HELSEID_TTT_API_KEY: 'API-nøkkel', HELSEID_TTT_AUDIENCE: 'API-mottaker (audience)',
  HELSEID_SCOPE: 'Tilgang (scope)', HELSEID_ORGNR_PARENT: 'Organisasjonsnummer',
  HELSEID_CLIENT_ID: 'Klient-ID', HELSEID_PRIVATE_KEY_FILE: 'Privat nøkkelfil',
};

function SetupField({ name, label, hint, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint: string; error?: string }) {
  const id = `connection-${name}`;
  return <div className="field connection-field">
    <label htmlFor={id}>{label}{props.required && <span className="required"> *</span>}</label>
    <input id={id} name={name} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-invalid={error ? true : undefined} {...props} />
    <p className="connection-hint" id={`${id}-hint`}>{hint}</p>
    {error && <p className="connection-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

function TestTokenSetup({ auth, busy, connect, saveSettings, environment }: SetupProps) {
  const [values, setValues] = useState<ConnectionValues>(() => ({ apiKey: '', audience: auth.audience || suggestions.audience,
    scope: auth.scope || suggestions.scope, parent: auth.parent || '', child: auth.child || '' }));
  const [changed, setChanged] = useState(false);
  const [feedback, setFeedback] = useState<Notice | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [focusField, setFocusField] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!focusField || busy) return;
    const element = form.current?.elements.namedItem(focusField);
    if (!(element instanceof HTMLElement)) return;
    const details = element.closest('details');
    if (details) details.open = true;
    element?.focus();
    setFocusField(null);
  }, [focusField, busy]);
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);
  const hasKey = !auth.missing?.includes('HELSEID_TTT_API_KEY');
  const keyReady = !!values.apiKey.trim() || hasKey;
  const detailsReady = !!values.audience.trim() && !!values.scope.trim() && /^\d{9}$/.test(values.parent.trim()) && (!values.child.trim() || /^\d{9}$/.test(values.child.trim()));
  const canTest = auth.configured && !changed;
  const input = (name: keyof ConnectionValues, maxLength: number) => ({ value: values[name], maxLength, autoComplete: 'off', spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setValues(v => ({ ...v, [name]: e.target.value })); setChanged(true); setFeedback(null); setErrors(v => ({ ...v, [name]: undefined })); }, error: errors[name] });
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null); setErrors({});
    try {
      const next = await saveSettings(values);
      setValues({ apiKey: '', audience: next.audience || '', scope: next.scope || '', parent: next.parent || '', child: next.child || '' });
      setChanged(false);
      setFeedback({ text: 'Oppsettet er lagret. Test tilkoblingen når du er klar.' });
    } catch (caught) { const error = apiError(caught);
      setErrors(error.fields || {});
      setFeedback({ error: true, text: error.message });
      setFocusField(Object.keys(error.fields || {})[0] || null);
    }
  }
  return <div className="connection-grid">
    <section className="card settings-card connection-setup" aria-labelledby="setup-heading">
      <div className="connection-card-heading"><div><p className="eyebrow">KOM I GANG</p><h2 id="setup-heading">Koble til i tre steg</h2></div><span className="connection-tag">Test-token-tjenesten</span></div>
      <p className="connection-intro">Lim inn din egen API-nøkkel og oppgi organisasjonsnummeret til testvirksomheten du har tilgang til. API-mottaker og tilgang har forslag for Helsenorge test. Kontroller verdiene og lagre oppsettet.</p>
      {!auth.editable && <div className="connection-feedback error" role="status"><strong>Feltene er låst fordi serveren må oppdateres.</strong><p>Stopp appen med <kbd>Ctrl+C</kbd> i terminalen, og start den igjen med <code>dotnet run --project src/Testklient.Api</code>. Last så nettlesersiden på nytt. Da kan du lime inn API-nøkkelen.</p></div>}
      <form ref={form} onSubmit={save}>
        <fieldset disabled={!!busy || !auth.editable} className="editor-fieldset">
          <ol className="connection-steps">
            <li>
              <div className="connection-step-heading"><span className={`connection-step-number ${keyReady ? 'complete' : ''}`} aria-hidden="true">1</span><div><h3>Hent API-nøkkelen din</h3><p>Logg inn hos HelseID, velg virksomhet og opprett en nøkkel under <strong>Integrasjonstesting</strong>.</p></div></div>
              <div className="connection-step-body">
                <a className="button secondary connection-external" href="https://selvbetjening.test.nhn.no/ttt" target="_blank" rel="noreferrer">Åpne HelseID Selvbetjening <span aria-hidden="true">↗</span><span className="sr-only"> (åpnes i ny fane)</span></a>
                <SetupField name="apiKey" label="API-nøkkel" type="password" required={!hasKey} {...input('apiKey', 8192)} autoComplete="new-password"
                  placeholder={hasKey ? 'En nøkkel er allerede lagret' : 'Lim inn nøkkelen fra HelseID'}
                  hint={hasKey ? 'La feltet stå tomt for å beholde nøkkelen. Lim inn en ny for å erstatte den.' : 'Nøkkelen skjules mens du skriver og lagres lokalt på denne maskinen.'} />
              </div>
            </li>
            <li>
              <div className="connection-step-heading"><span className={`connection-step-number ${detailsReady ? 'complete' : ''}`} aria-hidden="true">2</span><div><h3>Fyll inn virksomhet og kontroller tilgang</h3><p>Bruk din egen testvirksomhet. Kontroller forslagene for API-mottaker og tilgang. Lagrede verdier beholdes.</p></div></div>
              <div className="connection-step-body">
                <SetupField name="parent" label="Virksomhetens organisasjonsnummer" required inputMode="numeric" pattern="[0-9]{9}" {...input('parent', 9)} placeholder="9 siffer" hint="Oppgi organisasjonsnummeret til testvirksomhetens hovedenhet. Bruk en virksomhet du har tilgang til i HelseID test." />
                <SetupField name="audience" label="API-mottaker (audience)" required {...input('audience', 512)} placeholder={suggestions.audience} hint={`Forslag for Helsenorge test: ${suggestions.audience}.`} />
                <SetupField name="scope" label="Tilgang (scope)" required {...input('scope', 2048)} placeholder={suggestions.scope} hint={`Forslag for Oppgave: ${suggestions.scope}. Flere scope skilles med mellomrom.`} />
                <details className="connection-help"><summary>Når bør jeg endre forslagene?</summary><p>Bruk andre verdier for API-mottaker eller tilgang hvis NHN har gitt deg et annet oppsett. Forslagene er brukt til å hente et testtoken; tilgang til valgt testområde på Helsenorge kontrolleres først ved innsending.</p></details>
                <details className="connection-help"><summary>Underenhet (valgfritt)</summary><SetupField name="child" label="Underenhetens organisasjonsnummer" inputMode="numeric" pattern="[0-9]{9}" {...input('child', 9)} placeholder="9 siffer" hint="Fyll bare ut hvis testsituasjonen krever en underenhet." /></details>
              </div>
            </li>
            <li>
              <div className="connection-step-heading"><span className={`connection-step-number ${auth.authenticated && !changed ? 'complete' : ''}`} aria-hidden="true">3</span><div><h3>Lagre og test tilkoblingen</h3><p>Innstillingene tas i bruk med én gang. Du trenger ikke starte appen på nytt.</p></div></div>
              <div className="connection-step-body">
                <div className="connection-actions"><button className="button primary" type="submit" disabled={!changed && auth.configured}>{busy === 'settings' ? 'Lagrer …' : 'Lagre oppsett'}</button><button className="button secondary" type="button" onClick={connect} disabled={!canTest} aria-describedby="connection-test-hint">{busy === 'auth' ? 'Tester tilkobling …' : 'Test tilkobling'}</button></div>
                <p id="connection-test-hint" className="connection-hint">{changed ? 'Du har ulagrede endringer. Lagre oppsettet før du tester.' : !auth.configured ? 'Fyll inn og lagre oppsettet for å aktivere testen.' : 'Testen henter et testtoken fra HelseID. Ingen oppgave blir sendt.'}</p>
              </div>
            </li>
          </ol>
        </fieldset>
        {feedback && <p className={`connection-feedback ${feedback.error ? 'error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      </form>
      <p className="connection-privacy">API-nøkkelen lagres på denne maskinen og sendes bare til HelseID ved tilkobling. Den lagres ikke i nettleseren og vises ikke igjen etter lagring.</p>
    </section>
    <aside className="connection-sidebar" aria-label="Tilkoblingsstatus og hjelp">
      <section className="card settings-card connection-status-card">
        <p className="eyebrow">DITT OPPSETT</p><h2>{changed ? 'Endringer er ikke lagret' : auth.authenticated ? 'HelseID-testen er bestått' : auth.configured ? 'Klar til å teste' : 'Dette trenger du'}</h2>
        <p>{changed ? 'Statusen under viser oppsettet som er lagret. Lagre endringene før du tester.' : auth.authenticated ? 'Et testtoken er hentet. Tilgang til Helsenorge kontrolleres først når du sender en oppgave.' : auth.configured ? 'Alle nødvendige verdier er lagret. Test at HelseID kan utstede et token.' : 'Listen oppdateres når du lagrer oppsettet.'}</p>
        <ul className="connection-checklist">{['HELSEID_TTT_API_KEY', 'HELSEID_ORGNR_PARENT', 'HELSEID_TTT_AUDIENCE', 'HELSEID_SCOPE'].map(key => {
          const ready = !auth.missing?.includes(key);
          return <li key={key}><span className={`connection-check ${ready ? 'ready' : ''}`} aria-hidden="true">{ready ? '✓' : '–'}</span><span>{missingLabels[key]}</span><small>{ready ? 'Lagret' : 'Mangler'}</small></li>;
        })}</ul>
        <p className="connection-local-note">Du kan lage, validere og eksportere oppgaver før tilkoblingen er klar.</p>
      </section>
      <section className="card settings-card connection-help-card"><h2>Trenger du hjelp?</h2><p>Du trenger ingen registrert klient-ID eller egen privat nøkkelfil for denne metoden.</p><a href={guide} target="_blank" rel="noreferrer">Se NHNs veiledning <span aria-hidden="true">↗</span><span className="sr-only"> (åpnes i ny fane)</span></a></section>
      <details className="card settings-card connection-technical"><summary>Tekniske detaljer</summary><dl className="settings-list"><div><dt>Metode</dt><dd>Test-token-tjenesten (TTT) · DPoP</dd></div><div><dt>Issuer</dt><dd>https://helseid-sts.test.nhn.no</dd></div>{auth.clientId && <div><dt>Klient-ID i testtoken</dt><dd>{auth.clientId}</dd></div>}{auth.clientTenancy && <div><dt>Klienttype</dt><dd>Én testvirksomhet ({auth.clientTenancy})</dd></div>}<div><dt>Mottaker-API</dt><dd>{environment.endpoint}</dd></div>{auth.expiresAt && <div><dt>Token utløper</dt><dd>{new Date(auth.expiresAt).toLocaleString('nb-NO')}</dd></div>}<div><dt>Lokal lagring</dt><dd><code>secrets/connection.json</code><br />Lagret skjemaoppsett overstyrer TTT-verdiene i <code>.env</code>.</dd></div></dl><p>Appen oppretter automatisk en klient-ID for testtokenet. Hvis NHN krever en bestemt test-ID, sett <code>HELSEID_TTT_CLIENT_ID</code> i <code>.env</code> og start serveren på nytt.</p><p>Fjern filen for å gå tilbake til oppsettet i <code>.env</code>, og start appen på nytt.</p></details>
    </aside>
  </div>;
}

function RegisteredClientSettings({ auth, busy, connect, environment }: Omit<SetupProps, 'saveSettings'>) {
  return <div className="settings-grid">
    <section className="card settings-card"><h2>HelseID test</h2><div className={`settings-status ${auth.authenticated ? 'success' : ''}`}>{auth.authenticated ? 'Testtoken hentet med DPoP' : auth.configured ? 'Oppsett funnet – klart til å teste' : 'Oppsettet er ikke ferdig'}</div>
      <dl className="settings-list"><div><dt>Metode</dt><dd>client_credentials · private_key_jwt · DPoP</dd></div><div><dt>Issuer</dt><dd>https://helseid-sts.test.nhn.no</dd></div><div><dt>Klient-ID</dt><dd>{auth.clientId || 'Ikke konfigurert'}</dd></div><div><dt>Scope</dt><dd>{auth.scope || 'Ikke konfigurert'}</dd></div>{auth.expiresAt && <div><dt>Token utløper</dt><dd>{new Date(auth.expiresAt).toLocaleString('nb-NO')}</dd></div>}{auth.organization && <div><dt>Hovedenhet i token</dt><dd>{auth.organization}</dd></div>}</dl>
      <button className="button primary" onClick={connect} disabled={!auth.configured || !!busy}>{busy === 'auth' ? 'Henter testtoken …' : 'Test HelseID-tilkobling'}</button><p>Testknappen henter et token. Tilgang til Oppgave API kontrolleres først ved innsending.</p>
    </section>
    <section className="card settings-card"><h2>Konfigurer registrert klient</h2><ol className="setup-steps"><li>Registrer klienten i HelseID test og få godkjent tilgang til <b>Helsenorge Ekstern API → Oppgave</b>.</li><li>Sett <code>HELSEID_AUTH_MODE=client_credentials</code> i <code>.env</code>. Angi klient-ID, eksakt scope og nøkkel-ID.</li><li>Legg privat JWK eller PEM i <code>secrets/</code> og sett <code>HELSEID_PRIVATE_KEY_FILE</code>.</li><li>Start serveren på nytt og test tilkoblingen.</li></ol><p>Privatnøkkel og tilgangstoken behandles bare på serveren.</p>{auth.missing?.length > 0 && <div className="missing-config"><b>Dette mangler:</b>{auth.missing.map(key => <span key={key}>{missingLabels[key] || key}</span>)}</div>}<a href="https://utviklerportal.nhn.no/informasjonstjenester/helseid/" target="_blank" rel="noreferrer">HelseID-dokumentasjon ↗</a></section>
    <section className="card settings-card full"><h2>Helsenorge {environment.label}</h2><div className="endpoint"><span>POST</span><code>{environment.endpoint}</code></div><p>Klienten sender én FHIR Task i JSON-format. Velg Test01 eller Test02 ved sendeknappen på oppgavesiden.</p></section>
  </div>;
}

export default function ConnectionSettings({ auth, busy, connect, saveSettings, environment = getTestEnvironment(DEFAULT_ENVIRONMENT) }: Props) {
  const testToken = auth?.mode !== 'client_credentials';
  return <>
    <div className="page-heading"><div><p className="eyebrow">INTEGRASJON</p><h1>Tilkobling til testmiljø</h1><p>{testToken ? 'Sett opp HelseID for å sende oppgaver til Helsenorge Test01 eller Test02. Velg testområde på oppgavesiden.' : 'HelseID autentiserer virksomheten ved maskin-til-maskin-tilgang.'}</p></div></div>
    {!auth ? <p role="status">Henter tilkoblingsoppsettet …</p> : testToken ? <TestTokenSetup environment={environment} auth={auth} busy={busy} connect={connect} saveSettings={saveSettings} /> : <RegisteredClientSettings environment={environment} auth={auth} busy={busy} connect={connect} />}
  </>;
}
