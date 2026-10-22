#!/usr/bin/env python3
"""Apply the repository owner's requested public-repository security settings."""
import argparse
import json
import subprocess
import sys

REPOSITORY = 'helgaarm/informasjons-oppgave-testklient'
BASE = f'repos/{REPOSITORY}'
CONTEXTS = ['Tests (Node 22)', 'Tests (Node 24)', 'Secret scan', 'Dependency audit']
PROTECTION = {
    'required_status_checks': {'strict': True, 'contexts': CONTEXTS},
    'enforce_admins': True,
    'required_pull_request_reviews': {
        'dismiss_stale_reviews': True,
        'required_approving_review_count': 0,
        'require_code_owner_reviews': False,
    },
    'restrictions': None,
    'required_linear_history': True,
    'allow_force_pushes': False,
    'allow_deletions': False,
    'required_conversation_resolution': True,
}
SETTINGS = [
    ('Offentlig repo og squash-merge', 'PATCH', BASE, {
        'private': False, 'delete_branch_on_merge': True,
        'allow_squash_merge': True, 'allow_merge_commit': False,
        'allow_rebase_merge': False, 'allow_auto_merge': False,
    }),
    ('Tillatte Actions', 'PUT', f'{BASE}/actions/permissions', {'enabled': True, 'allowed_actions': 'selected'}),
    ('Begrens Actions-leverandører', 'PUT', f'{BASE}/actions/permissions/selected-actions', {
        'github_owned_allowed': False, 'verified_allowed': False,
        'patterns_allowed': ['actions/*', 'github/codeql-action/*'],
    }),
    ('Minimale Actions-rettigheter', 'PUT', f'{BASE}/actions/permissions/workflow', {
        'default_workflow_permissions': 'read', 'can_approve_pull_request_reviews': False,
    }),
    ('Dependabot-varsler', 'PUT', f'{BASE}/vulnerability-alerts', None),
    ('Dependabot-sikkerhetsrettelser', 'PUT', f'{BASE}/automated-security-fixes', None),
    ('Privat sårbarhetsrapportering', 'PUT', f'{BASE}/private-vulnerability-reporting', None),
    ('Secret scanning og push protection', 'PATCH', BASE, {'security_and_analysis': {
        'secret_scanning': {'status': 'enabled'},
        'secret_scanning_push_protection': {'status': 'enabled'},
    }}),
]


def api(method, endpoint, data=None):
    command = ['gh', 'api', '--method', method, endpoint, '-H', 'Accept: application/vnd.github+json']
    if data is not None:
        command += ['--input', '-']
    result = subprocess.run(command, input=json.dumps(data) if data is not None else None,
                            text=True, capture_output=True, check=False)
    try:
        body = json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError:
        body = {}
    if result.returncode:
        # Avoid echoing CLI diagnostics or runtime credentials.
        return False, body, body.get('message', 'GitHub-kallet feilet; kontroller gh-innlogging og rettigheter.')
    return True, body, ''


def protection_sufficient(current):
    contexts = set(current.get('required_status_checks', {}).get('contexts', []))
    checks = current.get('required_status_checks', {}).get('checks', [])
    contexts.update(check['context'] for check in checks)
    return (set(CONTEXTS) <= contexts
            and current.get('required_status_checks', {}).get('strict') is True
            and current.get('enforce_admins', {}).get('enabled') is True
            and bool(current.get('required_pull_request_reviews'))
            and current.get('required_linear_history', {}).get('enabled') is True
            and current.get('required_conversation_resolution', {}).get('enabled') is True
            and current.get('allow_force_pushes', {}).get('enabled') is False
            and current.get('allow_deletions', {}).get('enabled') is False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--plan', action='store_true', help='Vis endringer uten å kontakte GitHub.')
    mode.add_argument('--apply', action='store_true', help='Aktiver innstillinger og gjør repoet offentlig.')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({'repository': REPOSITORY, 'settings': SETTINGS, 'main_protection': PROTECTION}, indent=2))
        return 0

    failures = []
    for label, method, endpoint, data in SETTINGS:
        ok, _, message = api(method, endpoint, data)
        print(f'{"OK" if ok else "FEIL"}: {label}{": " + message if message else ""}')
        if not ok:
            failures.append(label)
        if label == SETTINGS[0][0] and not ok:
            print('Offentliggjøring krever administratortilgang. Ingen øvrige innstillinger er endret.')
            return 1

    endpoint = f'{BASE}/branches/main/protection'
    ok, current, message = api('GET', endpoint)
    if ok and protection_sufficient(current):
        print('OK: main har allerede nødvendig eller strengere beskyttelse.')
    elif not ok and current.get('message') == 'Branch not protected':
        ok, _, message = api('PUT', endpoint, PROTECTION)
        print(f'{"OK" if ok else "FEIL"}: Grenbeskyttelse{": " + message if message else ""}')
        if not ok:
            failures.append('Grenbeskyttelse')
    else:
        print('FEIL: Grenbeskyttelse er utilgjengelig eller har eksisterende regler som må gjennomgås manuelt. Ingen regler er overskrevet.')
        failures.append('Grenbeskyttelse')

    ok, repository, _ = api('GET', BASE)
    if not ok or repository.get('private') is not False:
        failures.append('Verifikasjon av offentlig synlighet')
    else:
        print(f'Verifisert offentlig: https://github.com/{REPOSITORY}')

    ok, _, message = api('POST', f'{BASE}/actions/workflows/security.yml/dispatches', {'ref': 'main'})
    if not ok:
        failures.append('Start av offentlig sikkerhetsanalyse')
        print(f'FEIL: Sikkerhetsanalyse kunne ikke startes: {message}')
    else:
        print('Security-arbeidsflyten er startet; kontroller at CodeQL fullføres.')
    if failures:
        print('Ikke fullført: ' + ', '.join(failures))
        return 1
    print('GitHub har bekreftet alle oppsettskall. Kontroller arbeidsflytene og innstillingene i GitHub.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
