import React, { useState } from 'react';
import type { FieldDefinition, FieldSchema, JsonValue } from './types';
interface Props { value: JsonValue; onChange: (next: JsonValue) => void; schema: FieldSchema; definition?: FieldDefinition; path?: string; depth?: number }

export function fieldDefault(def: FieldDefinition, schema: FieldSchema): JsonValue {
  if (def.multiple) return [];
  if (def.type === 'Resource') return { resourceType: 'Organization' };
  if (def.type === 'boolean') return false;
  if (['integer', 'positiveInt', 'unsignedInt', 'decimal'].includes(def.type)) return 0;
  if (def.properties?.length || schema[def.type]?.length) return {};
  return '';
}
export default function FieldEditor({ value, onChange, schema, definition = { type: 'Task' }, path = 'Task', depth = 0 }: Props) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [kind, setKind] = useState('string');
  if (depth > 35) return <p>For mange nivåer. Bruk JSON-visningen.</p>;
  if (Array.isArray(value)) return <div className="tree-array" style={{ '--tree-depth': depth } as React.CSSProperties}>
    {value.map((item, index) => <div className="tree-item" key={index}>
      <div className="tree-item-bar"><span>{path.split('.').at(-1)} <b>#{index + 1}</b></span><button className="text-button danger" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Fjern ${path}[${index}]`}>Fjern</button></div>
      <FieldEditor value={item} definition={{ ...definition, multiple: false }} schema={schema} path={`${path}[${index}]`} depth={depth + 1} onChange={next => onChange(value.map((v, i) => i === index ? next : v))} />
    </div>)}
    <button className="button secondary small" onClick={() => onChange([...value, fieldDefault({ ...definition, multiple: false }, schema)])}>+ Legg til element</button>
  </div>;
  if (value !== null && typeof value === 'object') {
    const objectValue = value;
    const properties = definition.properties?.length ? definition.properties : schema[typeof value.resourceType === 'string' ? value.resourceType : definition.type] || [];
    const available = properties.filter((p): p is FieldDefinition & { name: string } => typeof p.name === 'string').filter(p => !Object.hasOwn(value, p.name) && (!p.choice || !properties.some(q => q.choice === p.choice && Object.hasOwn(value, q.name ?? ''))));
    function add() {
      const def = available.find(p => p.name === selected);
      const name = def?.name || custom.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || Object.hasOwn(objectValue, name)) return;
      onChange({ ...objectValue, [name]: def ? fieldDefault(def, schema) : kind === 'object' ? {} : kind === 'array' ? [] : kind === 'boolean' ? false : kind === 'number' ? 0 : '' });
      setSelected(''); setCustom('');
    }
    return <div className="tree-object" style={{ '--tree-depth': depth } as React.CSSProperties}>
      {Object.entries(value).map(([key, child]) => {
        const def = properties.find(p => p.name === key) || { type: typeof child };
        const composite = child !== null && typeof child === 'object';
        const editor = <FieldEditor value={child ?? null} definition={def} schema={schema} path={`${path}.${key}`} depth={depth + 1} onChange={next => onChange({ ...value, [key]: next })} />;
        return <div className="tree-property" key={key}>
          {composite ? <details open={depth < 1 || undefined}><summary><span>{key}</span><small>{def.type}{Array.isArray(child) ? ` · ${child.length}` : ''}</small></summary>{editor}</details> : <label className="tree-label"><span>{key}<small>{def.type}</small></span>{editor}</label>}
          {key !== 'resourceType' && <button className="remove-property" title={`Fjern ${path}.${key}`} aria-label={`Fjern ${path}.${key}`} onClick={() => { const next = { ...value }; delete next[key]; onChange(next); }}>×</button>}
        </div>;
      })}
      <div className="tree-add">
        <select aria-label={`Nytt felt i ${path}`} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Velg FHIR-felt …</option>{available.map(p => <option key={p.name} value={p.name}>{p.name} · {p.type}{p.multiple ? '[]' : ''}</option>)}<option value="$custom">Egendefinert felt</option></select>
        {selected === '$custom' && <><input aria-label={`Feltnavn i ${path}`} placeholder="Feltnavn" value={custom} onChange={e => setCustom(e.target.value)} /><select aria-label={`Datatype i ${path}`} value={kind} onChange={e => setKind(e.target.value)}><option value="string">Tekst</option><option value="object">Objekt</option><option value="array">Liste</option><option value="boolean">Boolsk</option><option value="number">Tall</option></select></>}
        <button className="button secondary small" disabled={!selected || (selected === '$custom' && !custom.trim())} onClick={add}>Legg til</button>
      </div>
    </div>;
  }
  if (typeof value === 'boolean' || definition.type === 'boolean') return <select aria-label={path} value={String(value)} onChange={e => onChange(e.target.value === 'true')}><option value="true">true</option><option value="false">false</option></select>;
  if (typeof value === 'number' || ['integer', 'decimal', 'positiveInt', 'unsignedInt'].includes(definition.type)) return <input aria-label={path} type="number" step={definition.type === 'decimal' ? 'any' : '1'} value={String(value ?? '')} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  return <textarea aria-label={path} readOnly={path === 'Task.resourceType'} rows={typeof value === 'string' && (value.length > 100 || value.includes('\n')) ? 3 : 1} value={String(value ?? '')} onChange={e => onChange(e.target.value)} spellCheck={false} />;
}
