#!/usr/bin/env python3
"""Apply or verify security settings without changing repository visibility."""
import argparse
import json
import subprocess
import sys

REPOSITORY = 'helgaarm/informasjons-oppgave-testklient'
BASE = f'repos/{REPOSITORY}'
CONTEXTS = ['Tests (Node 22)', 'Tests (Node 24)', '.NET companion', 'Secret scan', 'Dependency audit', 'CodeQL']
ACTIONS_APP_ID = 15368
PROTECTION = {
    'required_status_checks': {'strict': True, 'checks': [
        {'context': name, 'app_id': ACTIONS_APP_ID} for name in CONTEXTS
    ]},
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
CODE_SCANNING_RULESET = {
    'name': 'CodeQL security gate for main',
    'target': 'branch', 'enforcement': 'active', 'bypass_actors': [],
    'conditions': {'ref_name': {'include': ['refs/heads/main'], 'exclude': []}},
    'rules': [{'type': 'code_scanning', 'parameters': {'code_scanning_tools': [{
        'tool': 'CodeQL', 'security_alerts_threshold': 'medium_or_higher', 'alerts_threshold': 'errors',
    }]}}],
}
SETTINGS = [
    ('Squash-merge og opprydding', 'PATCH', BASE, {
        'delete_branch_on_merge': True,
        'allow_squash_merge': True, 'allow_merge_commit': False,
        'allow_rebase_merge': False, 'allow_auto_merge': False,
    }),
    ('Tillatte Actions og SHA-låsing', 'PUT', f'{BASE}/actions/permissions', {
        'enabled': True, 'allowed_actions': 'selected', 'sha_pinning_required': True,
    }),
    ('Begrens Actions-leverandører', 'PUT', f'{BASE}/actions/permissions/selected-actions', {
        'github_owned_allowed': False, 'verified_allowed': False,
        'patterns_allowed': ['actions/checkout@*', 'actions/setup-node@*', 'actions/setup-dotnet@*',
                             'actions/dependency-review-action@*', 'github/codeql-action/*@*'],
    }),
    ('Minimale Actions-rettigheter', 'PUT', f'{BASE}/actions/permissions/workflow', {
        'default_workflow_permissions': 'read', 'can_approve_pull_request_reviews': False,
    }),
    ('Godkjenning av eksterne bidrag', 'PUT', f'{BASE}/actions/permissions/fork-pr-contributor-approval', {
        'approval_policy': 'all_external_contributors',
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
    command = ['gh', 'api', '--method', method, endpoint, '-H', 'Accept: application/vnd.github+json',
               '-H', 'X-GitHub-Api-Version: 2026-03-10']
    if data is not None:
        command += ['--input', '-']
    try:
        result = subprocess.run(command, input=json.dumps(data) if data is not None else None,
                                text=True, capture_output=True, check=False, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        return False, {}, 'GitHub CLI mangler eller svarte ikke innen tidsgrensen.'
    try:
        body = json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError:
        body = {}
    if result.returncode:
        # Avoid echoing CLI diagnostics or runtime credentials.
        return False, body, body.get('message', 'GitHub-kallet feilet; kontroller gh-innlogging og rettigheter.')
    return True, body, ''


def protection_sufficient(current):
    status_checks = current.get('required_status_checks') or {}
    checks = status_checks.get('checks') or []
    contexts = {check.get('context') for check in checks if check.get('app_id') == ACTIONS_APP_ID}
    reviews = current.get('required_pull_request_reviews') or {}
    return (set(CONTEXTS) <= contexts
            and status_checks.get('strict') is True
            and current.get('enforce_admins', {}).get('enabled') is True
            and reviews.get('dismiss_stale_reviews') is True
            and current.get('required_linear_history', {}).get('enabled') is True
            and current.get('required_conversation_resolution', {}).get('enabled') is True
            and current.get('allow_force_pushes', {}).get('enabled') is False
            and current.get('allow_deletions', {}).get('enabled') is False)


def contains_settings(actual, expected):
    """Ignore server metadata, but verify every requested setting after a write."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            key in actual and contains_settings(actual[key], value) for key, value in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and sorted(actual) == sorted(expected)
    return type(actual) is type(expected) and actual == expected


def code_scanning_sufficient(current):
    if (current.get('target') != 'branch' or current.get('enforcement') != 'active'
            or current.get('bypass_actors') != []
            or current.get('conditions') != CODE_SCANNING_RULESET['conditions']):
        return False
    return any(tool.get('tool') == 'CodeQL'
               and tool.get('security_alerts_threshold') in ('medium_or_higher', 'all')
               and tool.get('alerts_threshold') in ('errors', 'errors_and_warnings', 'all')
               for rule in current.get('rules', []) if rule.get('type') == 'code_scanning'
               for tool in rule.get('parameters', {}).get('code_scanning_tools', []))


def check_code_scanning(apply=False):
    endpoint = f'{BASE}/rulesets'
    ok, rulesets, _ = api('GET', endpoint + '?per_page=100')
    if not ok or not isinstance(rulesets, list):
        return False
    matches = [rule for rule in rulesets if rule.get('name') == CODE_SCANNING_RULESET['name']]
    if not matches and apply:
        ok, created, _ = api('POST', endpoint, CODE_SCANNING_RULESET)
        if not ok or not created.get('id'):
            return False
        matches = [created]
    if len(matches) != 1 or not matches[0].get('id'):
        return False
    # Read back; never overwrite an existing ruleset or weaken its thresholds.
    ok, current, _ = api('GET', f'{endpoint}/{matches[0]["id"]}')
    return ok and code_scanning_sufficient(current)


def verify():
    failures = []
    for label, _, endpoint, data in SETTINGS:
        ok, body, _ = api('GET', endpoint)
        expected = data if data is not None else (
            {} if endpoint.endswith('/vulnerability-alerts') else {'enabled': True})
        valid = ok and contains_settings(body, expected)
        print(f'{"OK" if valid else "FEIL"}: {label}')
        if not valid:
            failures.append(label)
    ok, body, _ = api('GET', f'{BASE}/branches/main/protection')
    valid = ok and protection_sufficient(body)
    print(f'{"OK" if valid else "FEIL"}: Grenbeskyttelse')
    if not valid:
        failures.append('Grenbeskyttelse')
    valid = check_code_scanning()
    print(f'{"OK" if valid else "FEIL"}: CodeQL-funn sperrer fletting')
    if not valid:
        failures.append('CodeQL-regelsett')
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--plan', action='store_true', help='Vis endringer uten å kontakte GitHub.')
    mode.add_argument('--apply', action='store_true', help='Aktiver sikkerhetsinnstillinger i det offentlige repoet.')
    mode.add_argument('--check', action='store_true', help='Les og kontroller innstillinger uten å endre noe.')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({'repository': REPOSITORY, 'settings': SETTINGS,
                          'main_protection': PROTECTION, 'code_scanning_ruleset': CODE_SCANNING_RULESET}, indent=2))
        return 0

    ok, repository, _ = api('GET', BASE)
    if not ok or repository.get('private') is not False:
        print('Repoet er utilgjengelig eller ikke offentlig. Ingen innstillinger er endret.')
        return 1
    if args.check:
        return int(bool(verify()))
    if repository.get('permissions', {}).get('admin') is not True:
        print('Administratortilgang kreves. Ingen innstillinger er endret.')
        return 1

    failures = []
    for label, method, endpoint, data in SETTINGS:
        ok, _, message = api(method, endpoint, data)
        print(f'{"OK" if ok else "FEIL"}: {label}{": " + message if message else ""}')
        if not ok:
            failures.append(label)

    endpoint = f'{BASE}/branches/main/protection'
    ok, current, message = api('GET', endpoint)
    if ok and protection_sufficient(current):
        print('OK: main har allerede nødvendig eller strengere beskyttelse.')
    elif not ok and current.get('message') == 'Branch not protected':
        # Require evidence that the named checks exist and work before locking
        # main. Otherwise a renamed/missing workflow could make merging impossible.
        checks_ok, runs, _ = api('GET', f'{BASE}/commits/main/check-runs?per_page=100')
        passed = {run.get('name') for run in runs.get('check_runs', [])
                  if run.get('conclusion') == 'success' and run.get('app', {}).get('id') == ACTIONS_APP_ID}
        if not checks_ok or not set(CONTEXTS) <= passed:
            print('FEIL: Alle obligatoriske kontroller må ha bestått på main før grenbeskyttelse opprettes.')
            failures.append('Grenbeskyttelse')
            ok, message = False, 'Vent på CI og kjør oppsettet igjen.'
        else:
            ok, _, message = api('PUT', endpoint, PROTECTION)
        print(f'{"OK" if ok else "FEIL"}: Grenbeskyttelse{": " + message if message else ""}')
        if not ok:
            failures.append('Grenbeskyttelse')
    else:
        print('FEIL: Grenbeskyttelse er utilgjengelig eller har eksisterende regler som må gjennomgås manuelt. Ingen regler er overskrevet.')
        failures.append('Grenbeskyttelse')

    if not check_code_scanning(apply=True):
        print('FEIL: CodeQL-regelsett kunne ikke opprettes eller har avvik. Eksisterende regler er ikke overskrevet.')
        failures.append('CodeQL-regelsett')
    failures.extend(verify())
    if failures:
        print('Ikke fullført: ' + ', '.join(failures))
        return 1
    print('Alle sikkerhetsinnstillinger er lest tilbake og bekreftet av GitHub.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
