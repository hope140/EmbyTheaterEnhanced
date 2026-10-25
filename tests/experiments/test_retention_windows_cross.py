"""Offline contract tests for the bounded Windows cross-toolchain gate."""

import importlib.util
import json
import pathlib
import tempfile
import unittest


REPO = pathlib.Path(__file__).resolve().parents[2]
TOOL = REPO / 'tools/experiments/prepare-retention-windows-cross.py'
LOCK = REPO / 'native/experiments/buffer-retention/windows-cross-toolchain-lock.json'

spec = importlib.util.spec_from_file_location('prepare_retention_windows_cross', TOOL)
cross = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cross)


def locked_input():
    return json.loads(LOCK.read_text(encoding='utf-8'))


class ValidateLockTests(unittest.TestCase):
    def test_current_lock_is_valid(self):
        lock = locked_input()
        cross.validate_lock(lock)
        self.assertEqual(lock['schema'], 1)
        self.assertEqual(lock['target']['triple'], 'x86_64-w64-mingw32')

    def test_unknown_schema_and_target_are_rejected(self):
        for mutate in (
                lambda lock: lock.update(schema=99),
                lambda lock: lock['target'].update(triple='aarch64-w64-mingw32'),
                lambda lock: lock['target'].update(runtime='ucrt')):
            lock = locked_input()
            mutate(lock)
            with self.subTest(lock=lock['schema'], target=lock['target']):
                with self.assertRaises(ValueError):
                    cross.validate_lock(lock)

    def test_duplicate_archive_name_is_rejected(self):
        lock = locked_input()
        lock['downloads'][1]['name'] = lock['downloads'][0]['name']
        with self.assertRaisesRegex(ValueError, 'cross-lock-download'):
            cross.validate_lock(lock)

    def test_bad_hash_unofficial_url_and_bad_sizes_are_rejected(self):
        cases = (
            lambda lock: lock['downloads'][0].update(sha256='A' * 64),
            lambda lock: lock['downloads'][0].update(url='https://example.invalid/' + lock['downloads'][0]['name']),
            lambda lock: lock['downloads'][0].update(bytes=0),
            lambda lock: lock['downloads'][0].update(bytes=100_000_000),
            lambda lock: lock['downloads'][0].update(bytes=True),
        )
        for mutate in cases:
            lock = locked_input()
            mutate(lock)
            with self.subTest(download=lock['downloads'][0]):
                with self.assertRaises(ValueError):
                    cross.validate_lock(lock)


class TreeIdentityTests(unittest.TestCase):
    def test_real_tree_identity_changes_when_file_bytes_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary) / 'tree'
            root.mkdir()
            item = root / 'probe.bin'
            item.write_bytes(b'bounded fixture')

            before = cross.tree_identity(root)
            self.assertEqual(before['files'], 1)
            self.assertEqual(before['bytes'], len(b'bounded fixture'))

            item.write_bytes(b'changed fixture')
            after = cross.tree_identity(root)
            self.assertNotEqual(before['sha256'], after['sha256'])
            # Same-length tampering must change the digest even when totals agree.
            self.assertEqual(before['bytes'], after['bytes'])

    def test_symlink_escaping_tree_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = pathlib.Path(temporary)
            root = parent / 'tree'
            root.mkdir()
            outside = parent / 'outside.bin'
            outside.write_bytes(b'outside')
            (root / 'escape').symlink_to(outside)

            with self.assertRaisesRegex(ValueError, 'toolchain-link-outside'):
                cross.tree_identity(root)


if __name__ == '__main__':
    unittest.main()
