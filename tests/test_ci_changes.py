"""CI selection regressions using synthetic Git history; no network calls."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'ci_changes', Path(__file__).resolve().parents[1] / 'scripts/ci-changes.py')
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class ChangeSelectionTests(unittest.TestCase):
    def test_only_known_documentation_paths_skip_browsers(self):
        self.assertTrue(ci.documentation_only([
            'README.md', 'SECURITY.md', 'dotnet/README.md', 'docs/nested/guide.md']))
        for path in ['src/App.jsx', 'package-lock.json', 'dotnet/frontend/package.json',
                     '.github/workflows/ci.yml', 'scripts/ci-changes.py',
                     'tests/test_ci_changes.py', 'docs/example.js', 'src/example.md']:
            with self.subTest(path=path):
                self.assertFalse(ci.documentation_only(['docs/guide.md', path]))
        self.assertFalse(ci.documentation_only([]))

    def test_unknown_manual_and_new_branch_ranges_run_full_tests(self):
        for event_name, event in [('workflow_dispatch', {}), ('schedule', {}),
                                  ('pull_request', {}), ('push', {}),
                                  ('push', {'before': '0' * 40, 'after': 'a' * 40}),
                                  ('push', {'before': '--help', 'after': 'a' * 40})]:
            self.assertIsNone(ci.comparison(event_name, event))

    def test_real_history_uses_whole_pr_and_both_sides_of_renames(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*args):
                return subprocess.check_output(['git', '-C', directory, *args], text=True).strip()

            def commit():
                git('add', '.')
                git('-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid',
                    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
                    'commit', '-qm', 'fixture')
                return git('rev-parse', 'HEAD')

            def run(event_name, event):
                event_file, output_file = root / 'event.json', root / 'output.txt'
                event_file.write_text(json.dumps(event), encoding='utf-8')
                output_file.write_text('', encoding='utf-8')
                env = dict(os.environ, GITHUB_EVENT_NAME=event_name,
                           GITHUB_EVENT_PATH=str(event_file), GITHUB_OUTPUT=str(output_file))
                result = subprocess.run([sys.executable, str(Path(ci.__file__).resolve())],
                                        cwd=root, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                return output_file.read_text(encoding='utf-8').strip()

            git('init', '-q')
            (root / '.gitignore').write_text('event.json\noutput.txt\n', encoding='utf-8')
            (root / 'app.js').write_text('initial\n', encoding='utf-8')
            base = commit()
            (root / 'docs').mkdir()
            (root / 'docs/guide with spaces.md').write_text('# Guide\n', encoding='utf-8')
            docs = commit()
            self.assertEqual(run('push', {'before': base, 'after': docs}), 'browser_tests=false')
            self.assertEqual(run('pull_request', {'pull_request': {
                'base': {'sha': base}, 'head': {'sha': docs}}}), 'browser_tests=false')
            (root / 'app.js').write_text('changed\n', encoding='utf-8')
            code = commit()
            (root / 'docs/guide with spaces.md').write_text('# Updated\n', encoding='utf-8')
            head = commit()
            self.assertEqual(run('pull_request', {'pull_request': {
                'base': {'sha': base}, 'head': {'sha': head}}}), 'browser_tests=true')
            self.assertEqual(run('push', {'before': code, 'after': head}), 'browser_tests=false')
            (root / 'app.js').rename(root / 'docs/renamed.md')
            renamed = commit()
            self.assertEqual(run('push', {'before': head, 'after': renamed}), 'browser_tests=true')
            self.assertEqual(run('push', {'before': 'f' * 40, 'after': renamed}), 'browser_tests=true')
            self.assertEqual(run('push', {'before': renamed, 'after': renamed}), 'browser_tests=true')
            self.assertEqual(run('workflow_dispatch', {}), 'browser_tests=true')


if __name__ == '__main__':
    unittest.main()
