import React from 'react';
import { TASK_ENDPOINT } from '../shared/task.js';

const guide = 'https://utviklerportal.nhn.no/informasjonstjenester/helseid/helseid-selvbetjening/test-token-tjenesten/docs/test-token-tjenesten_enmd';

export default function ConnectionSettings({ auth, busy, connect }) {
  const testToken = auth?.mode !== 'client_credentials';
  return <>
    <div className="page-heading"><div><p className="eyebrow">INTEGRASJON</p><h1>Tilkobling til testmiljø</h1>
      <p>{testToken ? 'Hent testtoken fra HelseID med en API-nøkkel fra NHN Selvbetjening.' : 'HelseID autentiserer virksomheten ved maskin-til-maskin-tilgang.'}</p>
    </div></div>
    <div className="settings-grid">
      <section className="card settings-card">
        <h2>{testToken ? 'HelseID test-token-tjenesten' : 'HelseID test'}</h2>
        <div className={`settings-status ${auth?.authenticated ? 'success' : ''}`}>
          <span>{auth?.authenticated ? 'Testtoken hentet med DPoP' : auth?.configured ? 'Konfigurasjon funnet – ikke testet' : 'Mangler lokal konfigurasjon'}</span>
        </div>
        <dl className="settings-list">
          <div><dt>Metode</dt><dd>{testToken ? 'Test-token-tjenesten (TTT) · DPoP' : 'client_credentials · private_key_jwt · DPoP'}</dd></div>
          <div><dt>Issuer</dt><dd>https://helseid-sts.test.nhn.no</dd></div>
          {testToken ? <>
            <div><dt>Audience</dt><dd>{auth?.audience || 'Ikke konfigurert'}</dd></div>
            <div><dt>Testvirksomhet</dt><dd>{auth?.parent || 'Ikke konfigurert'}</dd></div>
          </> : <div><dt>Klient-ID</dt><dd>{auth?.clientId || 'Ikke konfigurert'}</dd></div>}
          <div><dt>Scope</dt><dd>{auth?.scope || 'Ikke konfigurert'}</dd></div>
          {auth?.expiresAt && <div><dt>Token utløper</dt><dd>{new Date(auth.expiresAt).toLocaleString('nb-NO')}</dd></div>}
          {auth?.organization && <div><dt>Hovedenhet i token</dt><dd>{auth.organization}</dd></div>}
        </dl>
        <button className="button primary" onClick={connect} disabled={!auth?.configured || !!busy}>
          {busy === 'auth' ? 'Henter testtoken …' : 'Test HelseID-tilkobling'}
        </button>
        <p>Testknappen henter et token. Tilgang til Oppgave API kontrolleres først ved innsending.</p>
      </section>
      <section className="card settings-card">
        <h2>{testToken ? 'Kom i gang uten registrert klient' : 'Konfigurer registrert klient'}</h2>
        {testToken ? <ol className="setup-steps">
          <li>Åpne <a href="https://selvbetjening.test.nhn.no/ttt" target="_blank" rel="noreferrer">HelseID Selvbetjening test ↗</a>, velg hvem du representerer og opprett API-nøkkel under <b>Integrasjonstesting</b>.</li>
          <li>Kopier <code>.env.example</code> til <code>.env</code>. Behold <code>HELSEID_AUTH_MODE=test-token</code> og sett <code>HELSEID_TTT_API_KEY</code>.</li>
          <li>Angi Helsenorge-API-ets eksakte <code>HELSEID_TTT_AUDIENCE</code>, <code>HELSEID_SCOPE</code> og testvirksomhetens <code>HELSEID_ORGNR_PARENT</code>. Avklar verdiene og tilgangen til test02 med NHN.</li>
          <li>Start serveren på nytt og test tilkoblingen.</li>
        </ol> : <ol className="setup-steps">
          <li>Registrer klienten i HelseID test og få godkjent tilgang til <b>Helsenorge Ekstern API → Oppgave</b>.</li>
          <li>Sett <code>HELSEID_AUTH_MODE=client_credentials</code> i <code>.env</code>. Angi klient-ID, eksakt scope og nøkkel-ID.</li>
          <li>Legg privat JWK eller PEM i <code>secrets/</code> og sett <code>HELSEID_PRIVATE_KEY_FILE</code>.</li>
          <li>Start serveren på nytt og test tilkoblingen.</li>
        </ol>}
        <p>{testToken ? 'API-nøkkel og tilgangstoken behandles bare på serveren. Du trenger ingen registrert klient-ID eller egen nøkkelfil for TTT.' : 'Privatnøkkel og tilgangstoken behandles bare på serveren.'}</p>
        {auth?.missing?.length > 0 && <div className="missing-config"><b>Mangler:</b>{auth.missing.map(v => <code key={v}>{v}</code>)}</div>}
        <a href={testToken ? guide : 'https://utviklerportal.nhn.no/informasjonstjenester/helseid/'} target="_blank" rel="noreferrer">{testToken ? 'NHNs veiledning for test-token-tjenesten ↗' : 'HelseID-dokumentasjon ↗'}</a>
      </section>
      <section className="card settings-card full"><h2>Helsenorge test02</h2>
        <div className="endpoint"><span>POST</span><code>{TASK_ENDPOINT}</code></div>
        <p>Klienten sender én FHIR Task i JSON-format. Målmiljøet er fast satt til test02.</p>
      </section>
    </div>
  </>;
}
