import importlib.util
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'wireup-custom-domains.py'
SPEC = importlib.util.spec_from_file_location('wireup_custom_domains', SCRIPT_PATH)
wireup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wireup)


class CustomDomainScriptTests(unittest.TestCase):
    def test_configure_apex_stages_base_dns_records_before_public_delegation(self):
        staged_records = []

        with ExitStack() as stack:
            stack.enter_context(patch.object(wireup, 'get_default_hostname_and_id', return_value=(
                'lively-pebble-0e8b1ec1e.7.azurestaticapps.net',
                '/subscriptions/123/staticSites/blue-swallow-swa',
            )))
            stack.enter_context(patch.object(
                wireup,
                'upsert_alias_a_record',
                side_effect=lambda *args: staged_records.append(('A', args)),
            ))
            stack.enter_context(patch.object(
                wireup,
                'upsert_cname_record',
                side_effect=lambda *args: staged_records.append(('CNAME', args)),
            ))
            stack.enter_context(patch.object(wireup, 'public_dns_delegation_is_live', return_value=False))
            create_token = stack.enter_context(patch.object(wireup, 'create_custom_domain_and_token'))
            upsert_txt = stack.enter_context(patch.object(wireup, 'upsert_txt_record'))
            create_www = stack.enter_context(patch.object(wireup, 'create_custom_domain_with_retry'))

            configured = wireup.configure_apex(
                'rg-blue-swallow',
                'blue-swallow-swa',
                'rg-blue-swallow',
                'blueswallow.co.in',
                'blueswallow.co.in',
                'www.blueswallow.co.in',
            )

        self.assertFalse(configured)
        self.assertEqual(
            staged_records,
            [
                ('A', ('rg-blue-swallow', 'blueswallow.co.in', '@', '/subscriptions/123/staticSites/blue-swallow-swa')),
                ('CNAME', ('rg-blue-swallow', 'blueswallow.co.in', 'www', 'lively-pebble-0e8b1ec1e.7.azurestaticapps.net')),
            ],
        )
        create_token.assert_not_called()
        upsert_txt.assert_not_called()
        create_www.assert_not_called()


if __name__ == '__main__':
    unittest.main()
