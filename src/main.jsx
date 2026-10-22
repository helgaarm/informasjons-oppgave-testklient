import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { newTask, exampleTask, getAt, setAt, validateTask, SYSTEMS, AREAS } from '../shared/task.js';
import { submissionMessage } from '../shared/submission-feedback.js';
import FieldEditor from './FieldEditor.jsx';
import ConnectionSettings from './ConnectionSettings.jsx';
import './styles.css';
import './connection-settings.css';
import './responsive.css';

function Icon({ name, size = 20 }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></>,
    download: <path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5" />,
    task: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    send: <><path d="m3 3 18 9-18 9 3-9zM6 12h15" /></>,
    code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    link: <><path d="M14 3h7v7m0-7L10 14" /><path d="M10 3H4v17h17v-6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.task}</svg>;
}
function Field({ label, hint, path, value, onChange, required, maxLength, type = 'text', multiline, options, readOnly, disabled, placeholder }) {
  const id = `f-${path.replaceAll('.', '-')}`;
  const props = { id, value: value ?? '', onChange: e => onChange?.(e.target.value), required, maxLength, readOnly, disabled, placeholder, 'aria-describedby': hint ? `${id}-hint` : undefined };
  return <div className="field"><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>
    {options ? <select {...props}>{options.map(([v, text]) => <option value={v} key={v}>{text}</option>)}</select> : multiline ? <textarea {...props} rows={4} /> : <input {...props} type={type} />}
    <div className="field-meta">{hint ? <span id={`${id}-hint`}>{hint}</span> : <code>{path}</code>}{maxLength && <span>{String(value ?? '').length}/{maxLength}</span>}</div>
  </div>;
}
function App() {
  const [task, setTask] = useState(newTask);
  const [view, setView] = useState('task');
  const [tab, setTab] = useState(0);
  const [preview, setPreview] = useState('content');
  const [config, setConfig] = useState(null);
  const [schema, setSchema] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [serverIssues, setServerIssues] = useState(null);
  const [jsonDraft, setJsonDraft] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef(null);
  const activeTask = useRef(task);
  activeTask.current = task;
  useEffect(() => {
    fetch('/api/config').then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(setConfig).catch(() => setNotice({ error: true, text: 'Kunne ikke koble til den lokale serveren. Last siden på nytt.' }));
    fetch('/api/schema').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setSchema).catch(() => setNotice({ error: true, text: 'FHIR-feltlisten kunne ikke lastes. Last siden på nytt.' }));
  }, []);
  useEffect(() => {
    const handler = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  async function api(path, payload) {
    if (!config) throw new Error('Vent til den lokale serveren er klar.');
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrf }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok && !Object.hasOwn(data, 'ok')) { const e = new Error(data.error || 'Forespørselen feilet.'); e.issues = data.issues; e.code = data.code; e.fields = data.fields; throw e; }
    return data;
  }
  function edit(next) { setTask(next); setDirty(true); setServerIssues(null); setResult(null); setConfirmed(false); }
  const change = (path, value) => {
    const parts = path.split('.').map(x => /^\d+$/.test(x) ? Number(x) : x);
    let next = setAt(task, parts, value);
    if (value && /^contained\.\d+\.identifier\.0\.value$/.test(path) && !getAt(task, [...parts.slice(0, -1), 'system'])) next = setAt(next, [...parts.slice(0, -1), 'system'], SYSTEMS.orgnr);
    if (value && /^contained\.\d+\.contact\.0\.telecom\.0\.value$/.test(path) && !getAt(task, [...parts.slice(0, -1), 'system'])) next = setAt(next, [...parts.slice(0, -1), 'system'], 'phone');
    edit(next);
  };
  const field = (path, label, options = {}) => <Field key={path} path={path} label={label} value={getAt(task, path.split('.'))} onChange={v => change(path, !v && !options.required ? undefined : v)} {...options} />;
  const issues = serverIssues ?? validateTask(task);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const organizations = Array.isArray(task.contained) ? task.contained : [];
  const orgIndex = organizations.findIndex(o => o.resourceType === 'Organization' && `#${o.id}` === task.requester?.reference);
  const org = organizations[orgIndex];
  const securities = Array.isArray(task.meta?.security) ? task.meta.security : [];
  const code = system => securities.find(c => c.system === system)?.code ?? '';
  function setSecurity(system, value, display) {
    const existing = securities.find(c => c.system === system);
    const next = securities.filter(c => c.system !== system);
    if (value) { const item = { ...existing, system, code: value }; if (display) item.display = display; else delete item.display; next.push(item); }
    edit(setAt(task, ['meta', 'security'], next));
  }
  function replace(next, message) {
    if (dirty && !window.confirm('Erstatt utkastet? Last ned JSON først hvis du vil ta vare på endringene.')) return;
    edit(next); setJsonDraft(null); setTab(0); setView('task'); setNotice({ text: message });
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { setNotice({ error: true, text: 'Filen er for stor. Maksimal filstørrelse er 1 MB.' }); return; }
    setBusy('import');
    try { const { task: imported } = await api('/api/tasks/import', { text: await file.text() }); replace(imported, `${file.name} er lastet inn. Kontroller feltene før innsending.`); }
    catch (e) { setNotice({ error: true, text: e.message }); }
    finally { setBusy(''); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(task, null, 2)], { type: 'application/fhir+json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'informasjonsoppgave-test02.json'; a.click(); URL.revokeObjectURL(url);
    setDirty(false); setNotice({ text: 'FHIR Task er lastet ned som JSON.' });
  }
  async function validate() {
    setBusy('validate'); const snapshot = task;
    try { const data = await api('/api/tasks/validate', { task: snapshot }); if (activeTask.current === snapshot) { setServerIssues(data.issues); setPreview('validation'); setNotice({ text: data.valid ? 'Lokal FHIR- og profilkontroll er bestått. Helsenorge gjør endelig validering.' : 'Oppgaven har felt som må rettes før innsending.', error: !data.valid }); } }
    catch (e) { setNotice({ error: true, text: e.message }); } finally { setBusy(''); }
  }
  async function connect() {
    setBusy('auth');
    try { const auth = await api('/api/auth/connect', {}); setConfig(c => ({ ...c, auth })); setNotice({ text: 'Testtoken hentet med DPoP. Tilgang til Helsenorge kontrolleres ved innsending.' }); }
    catch (e) { setNotice({ error: true, text: e.message }); } finally { setBusy(''); }
  }
  async function saveConnection(settings) {
    setBusy('settings');
    try {
      const auth = await api('/api/auth/settings', settings);
      setConfig(c => ({ ...c, auth }));
      return auth;
    } finally { setBusy(''); }
  }
  async function send() {
    setBusy('send'); setResult(null);
    try {
      const response = await api('/api/tasks/send', { task, confirmTestData: confirmed });
      setResult(response); setPreview('response');
      setHistory(h => [{ at: response.receivedAt, status: response.status, ok: response.ok, correlationId: response.correlationId }, ...h].slice(0, 20));
      setNotice({ error: !response.ok, text: submissionMessage(response) });
    } catch (e) { setNotice({ error: true, text: e.message }); if (e.issues) { setServerIssues(e.issues); setPreview('validation'); } if (e.code === 'delivery_unknown') { setResult({ ok: false, deliveryUnknown: true, body: e.message }); setPreview('response'); } }
    finally { setBusy(''); fetch('/api/config').then(r => r.json()).then(setConfig).catch(() => {}); }
  }
  const hasJsonChanges = jsonDraft !== null && jsonDraft !== JSON.stringify(task, null, 2);
  const tabs = ['Oppgave', 'Mottaker og avsender', 'Frister og tilgang', 'Alle FHIR-felt', 'JSON'];
  return <>
    <a className="skip-link" href="#main">Gå til innhold</a>
    <header className="topbar"><div className="brand"><span className="brand-symbol"><Icon name="task" size={26} /></span><span>Helsenorge<span className="brand-subtitle">Testklient for informasjonsoppgaver</span></span></div><div className="topbar-right"><span className="environment"><i /> TEST02</span><span className="topbar-divider" /><span className="test-label">Kun testdata</span></div></header>
    <div className="shell">
      <aside className="sidebar"><div className="sidebar-label">ARBEIDSOMRÅDE</div><nav aria-label="Hovedmeny">
        <button className={view === 'task' ? 'nav-item active' : 'nav-item'} onClick={() => setView('task')}><Icon name="task" />Informasjonsoppgave</button>
        <button className={view === 'connection' ? 'nav-item active' : 'nav-item'} onClick={() => setView('connection')}><Icon name="shield" />Tilkobling<span className={`nav-dot ${config?.auth?.authenticated ? 'connected' : ''}`} /></button>
        <button className={view === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setView('history')}><Icon name="send" />Innsendinger<span className="nav-count">{history.length}</span></button>
      </nav><div className="sidebar-bottom"><div className="sidebar-card"><span className="small-label">VALGT MILJØ</span><strong>Helsenorge test02</strong><span>HelseID test · DPoP</span><a href="https://tjenester.hn2.test.nhn.no/" target="_blank" rel="noreferrer">Åpne Helsenorge <Icon name="link" size={14} /></a></div><a className="docs-link" href="https://helsenorge.atlassian.net/wiki/spaces/HELSENORGE/pages/2619211802" target="_blank" rel="noreferrer">Dokumentasjon <Icon name="link" size={15} /></a><p className="theme-credit">NHN-farger og systemtypografi.<br />Lokal, uavhengig testklient.</p></div></aside>
      <main id="main">
        <div className="breadcrumb">Helsenorge <span>/</span> {view === 'connection' ? 'Tilkobling' : view === 'history' ? 'Innsendinger' : 'Informasjonsoppgaver'}</div>
        {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><Icon name={notice.error ? 'info' : 'check'} /><span>{notice.text}</span><button aria-label="Lukk melding" onClick={() => setNotice(null)}>×</button></div>}
        {view === 'task' && <>
          <div className="page-heading"><div><p className="eyebrow">OPPGAVER TIL INNBYGGER</p><h1>Ny informasjonsoppgave</h1><p>Bygg en FHIR Task og send den til en testinnbygger på Helsenorge.</p></div><button className="button secondary" onClick={() => replace(newTask(), 'Et nytt, tomt utkast er opprettet.')} disabled={!!busy}><Icon name="plus" />Ny oppgave</button></div>
          <div className="workspace-toolbar"><div className="type-chip"><Icon name="task" size={17} />FHIR R4 <span>Task / Communication</span></div><div className="toolbar-actions"><input type="file" ref={fileInput} accept=".json,.xml,application/json,application/fhir+json,application/fhir+xml,text/xml" hidden onChange={importFile} /><button className="text-button" disabled={!!busy || !config} onClick={() => fileInput.current.click()}><Icon name="upload" size={17} />Last inn FHIR Task</button><button className="text-button" onClick={download} disabled={!!busy || hasJsonChanges}><Icon name="download" size={17} />Last ned JSON</button></div></div>
          <div className="workspace-grid"><div className="editor-column">
            <div className="editor-tabs" role="tablist" aria-label="Oppgavefelter">{tabs.map((name, i) => <button role="tab" aria-selected={tab === i} aria-controls={`panel-${i}`} id={`tab-${i}`} key={name} className={tab === i ? 'selected' : ''} onClick={() => { if (hasJsonChanges && i !== 4) { setNotice({ error: true, text: 'Bruk eller forkast JSON-endringene før du bytter fane.' }); return; } setTab(i); }}><span>{i < 3 ? `0${i + 1}` : i === 3 ? '+' : '{ }'}</span>{name}</button>)}</div>
            <section className="card editor-card" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              <fieldset className="editor-fieldset" disabled={!!busy}>
              {tab === 0 && <><div className="section-heading"><div><h2>Hva skal innbygger lese?</h2><p>Innholdet vises i oppgaven på Helsenorge.</p></div><span className="step-number">01</span></div>
                {field('code.text', 'Tittel på oppgaven', { required: true, maxLength: 250, placeholder: 'For eksempel: Informasjon før avtalen din' })}
                {field('description', 'Beskrivelse', { required: true, multiline: true, maxLength: 2000, placeholder: 'Forklar hva innbygger skal lese, og hvorfor det er nyttig.' })}
                {field('instantiatesUri', 'Lenke til informasjonen', { required: true, type: 'url', placeholder: 'https://', hint: 'Fullstendig nettadresse som innbygger åpner fra oppgaven.' })}
                <div className="field-row">{field('intent', 'Hensikt', { required: true, options: [['proposal', 'Proposal – frivillig påminnelse'], ['plan', 'Plan – knyttet til helsehjelp']] })}{field('status', 'Status ved innsending', { readOnly: true })}</div>
                {field('reasonCode.text', 'Begrunnelse', { maxLength: 250, placeholder: 'Valgfri begrunnelse for oppgaven' })}
                <div className="info-panel"><Icon name="info" /><p>Helsenorge markerer oppgaven som utført første gang innbygger åpner lenken. Innbygger kan komme tilbake til informasjonen senere.</p></div>
              </>}
              {tab === 1 && <><div className="section-heading"><div><h2>Mottaker og avsender</h2><p>Oppgaven sendes alltid til testpersonen, også ved representasjon.</p></div><span className="step-number">02</span></div>
                {field('owner.identifier.value', 'Testpersonens fødselsnummer / D-nummer', { required: true, maxLength: 11, placeholder: '11 siffer', hint: 'Bruk en testperson som finnes og er aktiv i test02.' })}
                {field('owner.display', 'Visningsnavn for testpersonen', { placeholder: 'Valgfritt', hint: 'Kun visningsnavn. Fødselsnummeret identifiserer mottakeren.' })}
                <div className="section-divider"><h3>Avsender</h3><code>{task.requester?.reference || 'Ingen referanse'}</code></div>
                {orgIndex >= 0 ? <>
                  {field(`contained.${orgIndex}.name`, 'Virksomhetens navn', { required: true, maxLength: 250 })}
                  {field(`contained.${orgIndex}.identifier.0.value`, 'Avsenders identifikator', { hint: 'Legg til system og flere identifikatorer under Alle FHIR-felt.' })}
                  {getAt(task, ['contained', orgIndex, 'identifier', 0, 'value']) && field(`contained.${orgIndex}.identifier.0.system`, 'Identifikatorsystem', { placeholder: SYSTEMS.orgnr })}
                  {field(`contained.${orgIndex}.contact.0.purpose.text`, 'Kontaktbeskrivelse', { multiline: true, maxLength: 1024, placeholder: 'Hvor kan innbygger henvende seg ved spørsmål?' })}
                  {field(`contained.${orgIndex}.contact.0.telecom.0.value`, 'Kontakttelefon / kontaktadresse', { placeholder: '+47 …' })}
                  {getAt(task, ['contained', orgIndex, 'contact', 0, 'telecom', 0, 'value']) && field(`contained.${orgIndex}.contact.0.telecom.0.system`, 'Type kontaktpunkt', { options: [['', 'Velg type …'], ['phone', 'Telefon'], ['email', 'E-post'], ['url', 'Nettadresse']] })}
                </> : <div className="info-panel"><p>Ingen Organization er koblet til requester. Rett referansen under Alle FHIR-felt, eller legg til en avsender.</p><button className="button secondary" onClick={() => { const id = `org-${crypto.randomUUID()}`; edit({ ...task, contained: [...organizations, { resourceType: 'Organization', id, name: '' }], requester: { reference: `#${id}`, type: 'Organization' } }); }}>Legg til avsender</button></div>}
              </>}
              {tab === 2 && <><div className="section-heading"><div><h2>Frister og tilgang</h2><p>Angi når informasjonen skal leses og hvordan oppgaven håndteres.</p></div><span className="step-number">03</span></div>
                <div className="field-row"><Field path="restriction.period.end" label="Svarfrist" required type="date" value={task.restriction?.period?.end?.slice(0, 10)} onChange={v => change('restriction.period.end', v)} hint="Helsenorge benytter datoen, ikke klokkeslettet." />
                <Field path="restriction.deadline" label="Absolutt frist (valgfri)" type="date" value={(Array.isArray(task.restriction?.extension) ? task.restriction.extension : []).find(e => e.url === SYSTEMS.deadline)?.valueDate || ''} onChange={value => { const ext = (task.restriction?.extension || []).filter(e => e.url !== SYSTEMS.deadline); if (value) ext.push({ url: SYSTEMS.deadline, valueDate: value }); change('restriction.extension', ext.length ? ext : undefined); }} hint="Tillater utførelse etter ordinær svarfrist." /></div>
                <Field path="meta.area" label="Tjenesteområde" required options={[['', 'Velg tjenesteområde …'], ...AREAS]} value={code(SYSTEMS.area)} onChange={v => setSecurity(SYSTEMS.area, v, AREAS.find(([c]) => c === v)?.[1])} />
                <Field path="meta.sensitive" label="Avsenders navn i varsler" value={code(SYSTEMS.sensitive)} options={[["", 'Standard – ikke særskilt angitt'], ['0', 'Ikke sensitiv avsender'], ['1', 'Sensitiv avsender – skjul navnet i varsel']]} onChange={v => setSecurity(SYSTEMS.sensitive, v, v === '1' ? 'Sensitiv avsender' : 'Ikke sensitiv avsender')} hint="Marker sensitiv avsender hvis navnet kan røpe helseopplysninger i SMS, e-post eller push." />
                <Field path="meta.access" label="Innsyn for ungdom og foreldre" value={code('urn:oid:2.16.578.1.12.4.1.1.9603')} options={[["", 'Ikke angitt'], ['N', 'Normal – ungdom og foreldre'], ['NORN_FORANS', 'Kun ungdom – nektet foreldreansvarlig'], ['NORN_UNGDOM', 'Kun foreldre – nektet ungdom']]} disabled hint="Støttes ikke ennå. Feltet kan ikke endres." />
                {field('authoredOn', 'Opprettet tidspunkt (valgfritt)', { placeholder: '2026-10-22T12:00:00+02:00', hint: 'Helsenorge setter dette automatisk hvis feltet utelates.' })}
                <details className="advanced-detail"><summary>Hvem kan utføre oppgaven?</summary><p>Uten overstyring gjelder Helsenorges standardregler. Avklar bruk av kodene med NHN.</p>{[['1', 'Kun innbygger selv'], ['2', 'Foreldre til barn under 12 år'], ['3', 'Foreldre til barn 12–15 år'], ['4', 'Fullmakt – ikke samtykkekompetent'], ['5', 'Ordinær fullmakt, samt innbygger selv'], ['6', 'Innbygger med adressesperre'], ['7', 'Innbygger selv 13–15 år']].map(([value, label]) => <label className="checkbox-label" key={value}><input type="checkbox" checked={securities.some(s => s.system === SYSTEMS.execution && s.code === value)} onChange={e => { const next = securities.filter(s => !(s.system === SYSTEMS.execution && s.code === value)); if (e.target.checked) next.push({ system: SYSTEMS.execution, code: value, display: label }); edit(setAt(task, ['meta', 'security'], next)); }} /><span>{value} · {label}</span></label>)}</details>
              </>}
              {tab === 3 && <><div className="section-heading"><div><h2>Alle FHIR-felt</h2><p>Rediger hele ressursen feltvis, inkludert lister, extensions og input.</p></div><Icon name="code" /></div><div className="info-panel compact"><Icon name="info" /><p>Feltlisten følger FHIR R4. Helsenorge støtter et utvalg av feltene. Importerte attributter bevares når du redigerer andre felt.</p></div>{schema ? <FieldEditor value={task} onChange={edit} schema={schema} /> : <p>Laster FHIR-felt …</p>}</>}
              {tab === 4 && <><div className="section-heading"><div><h2>FHIR Task som JSON</h2><p>Endringer brukes først når du velger «Bruk JSON».</p></div><Icon name="code" /></div><textarea className="json-editor" aria-label="FHIR Task JSON" spellCheck={false} value={jsonDraft ?? JSON.stringify(task, null, 2)} onChange={e => { setJsonDraft(e.target.value); setDirty(true); }} /><div className="button-row"><button className="button primary" onClick={async () => { try { const imported = await api('/api/tasks/import', { text: jsonDraft ?? JSON.stringify(task) }); edit(imported.task); setJsonDraft(null); setNotice({ text: 'JSON-endringene er brukt i alle felt.' }); } catch (e) { setNotice({ error: true, text: `JSON kunne ikke brukes: ${e.message}` }); } }}>Bruk JSON</button><button className="button secondary" disabled={!hasJsonChanges} onClick={() => setJsonDraft(null)}>Forkast JSON-endringer</button></div></>}
              </fieldset>
              {tab < 3 && <div className="card-footer"><span><span className="required">*</span> Obligatoriske felt</span><button className="text-button" onClick={() => setTab(tab + 1)} disabled={!!busy}>{tab === 2 ? 'Se alle FHIR-felt' : 'Neste steg'}<Icon name="arrow" size={18} /></button></div>}
            </section>
            <div className="bottom-help"><Icon name="info" size={16} /><span>Har du ingen Task fra før?</span><button className="text-button" disabled={!!busy} onClick={() => replace(exampleTask(), 'Eksempel lastet inn. Velg testperson og avsender før innsending.')}>Bruk et eksempel</button></div>
          </div>
          <aside className="preview-column">
            <section className="card preview-card"><div className="preview-header"><h2>Kontroller oppgaven</h2><span className="pill">UTKAST</span></div><div className="preview-tabs">{[['content', 'Innhold'], ['validation', `Kontroll${errors.length ? ` (${errors.length})` : ''}`], ['response', 'Respons']].map(([v, label]) => <button className={preview === v ? 'selected' : ''} key={v} onClick={() => setPreview(v)}>{label}</button>)}</div>
              {preview === 'content' && <div className="content-preview"><span className="small-label">INFORMASJONSOPPGAVE</span><div className="preview-illustration"><Icon name="task" size={26} /></div><h3>{task.code?.text || 'Oppgavens tittel'}</h3><p className={!task.description ? 'placeholder' : ''}>{task.description || 'Beskrivelsen du skriver, vises her.'}</p><div className="preview-action">Åpne informasjon <Icon name="link" size={16} /></div><dl><div><dt>Fra</dt><dd>{org?.name || 'Ikke angitt'}</dd></div><div><dt>Til</dt><dd>{task.owner?.display || (task.owner?.identifier?.value ? `Testperson · ••••••${String(task.owner.identifier.value).slice(-5)}` : 'Velg testperson')}</dd></div><div><dt>Svarfrist</dt><dd>{task.restriction?.period?.end?.slice(0, 10) || 'Ikke angitt'}</dd></div></dl><p className="preview-disclaimer">Innholdsvisning. Utseendet i Helsenorge kan avvike.</p></div>}
              {preview === 'validation' && <div className="validation-panel"><h3>{errors.length ? `${errors.length} felt må kontrolleres` : 'Ingen lokale feil funnet'}</h3><p className="muted">{serverIssues ? 'FHIR R4-struktur og lokale Helsenorge-regler er kontrollert.' : 'Foreløpig feltkontroll. Velg Valider for full lokal strukturkontroll.'}</p>{issues.map((i, n) => <div className={`issue ${i.severity}`} key={n}><code>{i.path}</code><p>{i.message}</p></div>)}<p className="muted">Helsenorge gjør endelig kontroll av profil, rettigheter og mottaker.</p></div>}
              {preview === 'response' && <div className="response-panel">{result ? <><span className={`result-badge ${result.ok ? 'success' : ''}`}>{result.deliveryUnknown ? 'Ukjent leveringsstatus' : result.status ? `HTTP ${result.status}` : 'Ingen kvittering'}</span>{result.location && <p className="wrap"><b>Location:</b> {result.location}</p>}{result.correlationId && <p className="wrap"><b>Korrelasjons-ID:</b> {result.correlationId}</p>}<pre>{typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}</pre></> : <div className="empty-state"><Icon name="send" size={28} /><h3>Ingen innsending ennå</h3><p>HTTP-status og svaret fra Helsenorge vises her etter innsending.</p></div>}</div>}
            </section>
            <section className="card send-card"><div className="connection-status"><span className={`status-dot ${config?.auth?.authenticated ? 'ok' : ''}`} /><strong>HelseID test</strong><button className="text-button" onClick={() => setView('connection')}>{config?.auth?.authenticated ? 'Tilkoblet' : config?.auth?.configured ? 'Klar til tilkobling' : 'Sett opp'}</button></div><div className="send-summary"><span>Målmiljø</span><b>Helsenorge test02</b></div><label className="checkbox-label confirmation"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={e => setConfirmed(e.target.checked)} /><span>Jeg har kontrollert mottaker og innhold. Oppgaven inneholder kun testdata.</span></label><div className="send-buttons"><button className="button secondary" disabled={!!busy || !config || hasJsonChanges} onClick={validate}><Icon name="check" />{busy === 'validate' ? 'Validerer …' : 'Valider'}</button><button className="button primary" onClick={send} disabled={!!busy || !!errors.length || !confirmed || !config?.auth?.configured || hasJsonChanges || result?.ok || result?.deliveryUnknown}><Icon name="send" />{busy === 'send' ? 'Sender …' : 'Send til test02'}</button></div><p className="send-note">{!config?.auth?.configured ? 'Konfigurer HelseID under Tilkobling for å aktivere innsending.' : errors.length ? 'Rett valideringsfeilene før du sender.' : warnings.length ? `${warnings.length} merknad(er) under Kontroll. Kontroller før du sender.` : 'Oppgaven sendes først når du trykker Send til test02.'}</p></section>
          </aside></div>
        </>}
        {view === 'connection' && <ConnectionSettings auth={config?.auth} busy={busy} connect={connect} saveSettings={saveConnection} />}
        {view === 'history' && <><div className="page-heading"><div><p className="eyebrow">DENNE NETTLESERØKTEN</p><h1>Innsendinger</h1><p>Tekniske kvitteringer fra denne økten. Ingen oppgaveinnhold lagres i historikken.</p></div></div><section className="card settings-card">{history.length ? <div className="table-scroll"><table><thead><tr><th>Tidspunkt</th><th>Status</th><th>Korrelasjons-ID</th></tr></thead><tbody>{history.map((r, i) => <tr key={i}><td>{new Date(r.at).toLocaleString('nb-NO')}</td><td>{r.ok ? 'Mottatt' : 'Avvist / ukjent'} · HTTP {r.status}</td><td><code>{r.correlationId}</code></td></tr>)}</tbody></table></div> : <div className="empty-state"><Icon name="send" size={36} /><h2>Ingen innsendinger i denne økten</h2><p>Opprett en informasjonsoppgave for å komme i gang.</p><button className="button primary" onClick={() => setView('task')}>Gå til oppgaven</button></div>}</section></>}
        <footer className="page-footer"><span>Informasjonsoppgaver · FHIR R4</span><span>Helsenorge test02 <i /> HelseID test</span></footer>
      </main>
    </div>
  </>;
}
createRoot(document.getElementById('root')).render(<App />);
