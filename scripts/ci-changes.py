"""Skip browser tests only for a complete, known documentation-only diff."""
import json
import os
import re
import subprocess
from pathlib import Path


def comparison(event_name, event):
    if event_name == 'pull_request':
        pr = event.get('pull_request', {})
        base = pr.get('base', {}).get('sha', '')
        head = pr.get('head', {}).get('sha', '')
        separator = '...'
    elif event_name == 'push':
        base, head = event.get('before', ''), event.get('after', '')
        separator = '..'
    else:
        return None
    if not all(isinstance(sha, str) and re.fullmatch(r'[0-9a-f]{40}', sha)
               and sha != '0' * 40 for sha in (base, head)):
        return None
    return f'{base}{separator}{head}'


def documentation_only(paths):
    return bool(paths) and all(
        path in {'README.md', 'SECURITY.md', 'dotnet/README.md'}
        or (path.startswith('docs/') and path.endswith('.md'))
        for path in paths
    )


def changed_paths(revision_range):
    # NUL delimiters handle spaces/newlines; disabling renames includes the old
    # path, so moving code into docs cannot hide a code deletion.
    result = subprocess.run(
        ['git', 'diff', '--no-ext-diff', '--no-textconv', '--no-renames',
         '--name-only', '-z', revision_range, '--'],
        check=True, capture_output=True,
    )
    return [os.fsdecode(path) for path in result.stdout.split(b'\0') if path]


def main():
    run_browser = True
    reason = 'Full browser tests: manual run or unknown change range.'
    try:
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
        revision_range = comparison(os.environ.get('GITHUB_EVENT_NAME'), event)
        paths = changed_paths(revision_range) if revision_range else None
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError):
        # A failed comparison must never disable tests.
        paths = None
    if paths is not None:
        subprocess.run(['git', 'diff', '--no-ext-diff', '--no-textconv',
                        '--check', revision_range, '--'], check=True)
        run_browser = not documentation_only(paths)
        reason = ('Full browser tests: code, configuration or no changed files.'
                  if run_browser else 'Browser tests skipped: documentation-only changes.')
    print(reason)
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        output.write(f'browser_tests={str(run_browser).lower()}\n')


if __name__ == '__main__':
    main()
