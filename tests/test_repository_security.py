"""Regression tests for remote security administration; never contact GitHub."""
import copy
import importlib.util
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'security', Path(__file__).resolve().parents[1] / 'scripts/configure-github-security.py')
security = importlib.util.module_from_spec(spec)
spec.loader.exec_module(security)


def protection():
    result = copy.deepcopy(security.PROTECTION)
    for key in ('enforce_admins', 'required_linear_history', 'required_conversation_resolution',
                'allow_force_pushes', 'allow_deletions'):
        result[key] = {'enabled': result[key]}
    return result


class RepositorySecurityTests(unittest.TestCase):
    def test_requires_checks_from_github_actions_not_spoofed_statuses(self):
        current = protection()
        self.assertTrue(security.protection_sufficient(current))
        current['required_status_checks']['checks'][0]['app_id'] = None
        self.assertFalse(security.protection_sufficient(current))
        current['required_status_checks'] = None
        self.assertFalse(security.protection_sufficient(current))

    def test_stronger_reviews_are_preserved(self):
        current = protection()
        current['required_pull_request_reviews'].update(
            required_approving_review_count=2, require_code_owner_reviews=True)
        self.assertTrue(security.protection_sufficient(current))

    def test_does_not_change_visibility_or_overwrite_existing_protection(self):
        calls = []

        def api(method, endpoint, data=None):
            calls.append((method, endpoint, data))
            if method == 'GET' and endpoint == security.BASE:
                return True, {'private': False, 'permissions': {'admin': True}}, ''
            if method == 'GET' and endpoint.endswith('/protection'):
                return True, {'required_status_checks': None}, ''
            return True, {}, ''

        with patch.object(security, 'api', side_effect=api), \
                patch('sys.argv', ['security', '--apply']), redirect_stdout(io.StringIO()):
            self.assertEqual(security.main(), 1)
        self.assertFalse(any(method != 'GET' and endpoint.endswith('/protection')
                             for method, endpoint, _ in calls))
        self.assertFalse(any(data and ('private' in data or 'visibility' in data)
                             for _, _, data in calls))

    def test_check_mode_never_writes_and_detects_disabled_features(self):
        calls = []

        def api(method, endpoint, data=None):
            calls.append(method)
            return True, {'private': False}, ''

        with patch.object(security, 'api', side_effect=api), \
                patch('sys.argv', ['security', '--check']), redirect_stdout(io.StringIO()):
            self.assertEqual(security.main(), 1)
        self.assertEqual(set(calls), {'GET'})

    def test_private_repo_is_never_published(self):
        with patch.object(security, 'api', return_value=(True, {'private': True}, '')) as api, \
                patch('sys.argv', ['security', '--apply']), redirect_stdout(io.StringIO()):
            self.assertEqual(security.main(), 1)
        api.assert_called_once_with('GET', security.BASE)

    def test_failed_write_cannot_be_reported_as_success(self):
        def api(method, endpoint, data=None):
            if method == 'GET' and endpoint == security.BASE:
                return True, {'private': False, 'permissions': {'admin': True}}, ''
            if endpoint.endswith('/protection'):
                return True, protection(), ''
            return False, {}, 'Request rejected'

        with patch.object(security, 'api', side_effect=api), \
                patch('sys.argv', ['security', '--apply']), redirect_stdout(io.StringIO()):
            self.assertEqual(security.main(), 1)

    def test_does_not_lock_main_before_required_checks_have_passed(self):
        calls = []

        def api(method, endpoint, data=None):
            calls.append((method, endpoint))
            if method == 'GET' and endpoint == security.BASE:
                return True, {'private': False, 'permissions': {'admin': True}}, ''
            if endpoint.endswith('/protection'):
                return False, {'message': 'Branch not protected'}, ''
            if '/check-runs' in endpoint:
                return True, {'check_runs': []}, ''
            return True, {}, ''

        with patch.object(security, 'api', side_effect=api), \
                patch('sys.argv', ['security', '--apply']), redirect_stdout(io.StringIO()):
            self.assertEqual(security.main(), 1)
        self.assertFalse(any(method != 'GET' and endpoint.endswith('/protection')
                             for method, endpoint in calls))

    def test_verification_requires_actual_values_not_just_successful_http(self):
        self.assertFalse(security.contains_settings({'enabled': 'true'}, {'enabled': True}))
        self.assertFalse(security.contains_settings({'enabled': False}, {'enabled': True}))
        self.assertFalse(security.contains_settings({}, {'enabled': True}))
        self.assertTrue(security.contains_settings({'enabled': True, 'metadata': {}}, {'enabled': True}))


if __name__ == '__main__':
    unittest.main()
