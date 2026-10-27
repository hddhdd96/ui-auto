"""가드레일 재현 테스트.

각 사례는 이 저장소의 실제 파일에 "AI가 실패를 통과시키려고 할 법한 수정"을 적용한 diff를 만들고,
가드레일이 해당 규칙으로 잡는지 확인한다. 원본 문자열이 사라지면 테스트가 실패하므로
예시가 실제 코드와 어긋난 채 남지 않는다.

실행: python3 -m unittest discover -s guardrail -v
"""
import difflib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_test_weakening as guard  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SCOPE = guard.load_scope(ROOT / "guardrail" / "scope.txt")


def mutate(path: str, before: str, after: str) -> str:
    """저장소 파일의 before를 after로 바꾼 git 형식 unified diff(-U0)를 만든다."""
    original = (ROOT / path).read_text(encoding="utf-8")
    assert before in original, f"{path}에 예시 원본이 없습니다: {before!r}"
    changed = original.replace(before, after, 1)
    lines = difflib.unified_diff(original.splitlines(), changed.splitlines(),
                                 f"a/{path}", f"b/{path}", n=0, lineterm="")
    return f"diff --git a/{path} b/{path}\n" + "\n".join(lines) + "\n"


def rules(diff: str) -> set[str]:
    return {finding.rule for finding in guard.check_diff(diff, SCOPE)}


class CatchesWeakening(unittest.TestCase):
    def test_exact_status_becomes_partial_match(self):
        # toContainText('ACTIVE')는 'INACTIVE'도 통과시킨다.
        diff = mutate("pages/storage/VolumePage.ts",
                      "getByTestId('volume-status')).toHaveText('ACTIVE')",
                      "getByTestId('volume-status')).toContainText('ACTIVE')")
        self.assertIn("TW05", rules(diff))

    def test_retry_enabled_only_on_ci(self):
        diff = mutate("playwright.config.ts", "retries: 0,", "retries: process.env.CI ? 2 : 0,")
        self.assertIn("TW04", rules(diff))

    def test_lifecycle_test_skipped(self):
        diff = mutate("tests/testsuite/storage/volume-lifecycle.spec.ts",
                      "test('volume creation", "test.skip('volume creation")
        self.assertIn("TW03", rules(diff))

    def test_backend_deletion_check_removed(self):
        diff = mutate("services/volume-client.ts",
                      "    expect(await this.findByName(name), 'Backend must confirm deletion').toBeUndefined();\n", "")
        self.assertIn("TW01", rules(diff))

    def test_expected_http_status_changed(self):
        diff = mutate("services/volume-client.ts", "`Delete volume ${volume.id}`).toBe(204)",
                      "`Delete volume ${volume.id}`).toBe(200)")
        self.assertIn("TW06", rules(diff))

    def test_exact_cell_match_removed(self):
        diff = mutate("pages/storage/VolumePage.ts",
                      "getByRole('cell', { name, exact: true })", "getByRole('cell', { name })")
        self.assertIn("TW10", rules(diff))

    def test_remaining_backend_resource_no_longer_fails(self):
        diff = mutate("flows/volume-lifecycle.ts",
                      "if (remaining) throw new Error(`UI row disappeared but backend resource remains: ${remaining.id}`);",
                      "if (remaining) console.warn(`UI row disappeared but backend resource remains: ${remaining.id}`);")
        self.assertIn("TW07", rules(diff))

    def test_skipped_result_reported_as_pass(self):
        diff = mutate("reporters/failure-summary.ts",
                      "if (status === 'skipped' || status === 'interrupted') return 'BLOCK';",
                      "if (status === 'skipped' || status === 'interrupted') return 'PASS';")
        self.assertIn("TW06", rules(diff))

    def test_backend_check_replaced_by_trivial_assertion(self):
        diff = mutate("flows/volume-lifecycle.ts", "await this.client.expectReady(name, sizeGiB);",
                      "expect(true).toBe(true);")
        self.assertIn("TW08", rules(diff))

    def test_guardrail_rule_removed(self):
        diff = mutate("guardrail/scope.txt", "reporters/*\n", "")
        self.assertIn("TW11", rules(diff))


class AllowsOrdinaryChanges(unittest.TestCase):
    def test_new_assertion_is_not_flagged(self):
        diff = mutate("pages/storage/VolumePage.ts",
                      "    await expect(this.volumeRow(name)).toHaveCount(1);\n",
                      "    await expect(this.volumeRow(name)).toHaveCount(1);\n"
                      "    await expect(this.volumeRow(name).getByTestId('volume-status')).toBeVisible();\n")
        self.assertEqual(rules(diff), set())

    def test_partial_to_exact_strengthening_is_not_flagged(self):
        weak = mutate("pages/storage/VolumePage.ts", "toHaveText('ACTIVE')", "toContainText('ACTIVE')")
        restore = "\n".join(
            {"-": "+", "+": "-"}[line[0]] + line[1:]
            if line.startswith(("-", "+")) and not line.startswith(("---", "+++")) else line
            for line in weak.splitlines())
        self.assertEqual(rules(restore), set())

    def test_variable_rename_is_not_flagged(self):
        path = "tests/testsuite/storage/volume-lifecycle.spec.ts"
        original = (ROOT / path).read_text(encoding="utf-8")
        renamed = original.replace("const name =", "const volumeName =").replace("(name", "(volumeName")
        diff = "\n".join(difflib.unified_diff(original.splitlines(), renamed.splitlines(),
                                              f"a/{path}", f"b/{path}", n=0, lineterm=""))
        self.assertEqual(rules(diff), set())

    def test_rule_text_in_guardrail_sources_and_comments_is_not_flagged(self):
        diff = (
            "diff --git a/guardrail/test_check_test_weakening.py b/guardrail/test_check_test_weakening.py\n"
            "--- a/guardrail/test_check_test_weakening.py\n+++ b/guardrail/test_check_test_weakening.py\n"
            "@@ -1,0 +2 @@\n+mutate('playwright.config.ts', 'retries: 0,', 'retries: 2,')  # test.skip(\n"
            "diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n"
            "--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n"
            "@@ -1,0 +2 @@\n+      # retries: 0, 실패를 재시도로 가리지 않는다.\n")
        self.assertEqual(rules(diff), set())

    def test_out_of_scope_file_is_ignored(self):
        diff = mutate("README.md", "자동 retry는 0이며", "자동 retry는 2이며")
        self.assertEqual(rules(diff), set())


class CommandLine(unittest.TestCase):
    def run_cli(self, diff: str, *extra: str) -> subprocess.CompletedProcess:
        with tempfile.NamedTemporaryFile("w", suffix=".diff", delete=False, encoding="utf-8") as handle:
            handle.write(diff)
        try:
            environment = {key: value for key, value in os.environ.items()
                           if key not in {"GITHUB_ACTIONS", "GITHUB_STEP_SUMMARY"}}
            return subprocess.run([sys.executable, str(ROOT / "guardrail/check_test_weakening.py"), handle.name, *extra],
                                  capture_output=True, text=True, env=environment)
        finally:
            os.unlink(handle.name)

    def test_weakening_fails_the_job_until_a_person_approves(self):
        diff = mutate("pages/storage/VolumePage.ts", "toHaveText('ACTIVE')", "toContainText('ACTIVE')")
        blocked = self.run_cli(diff)
        self.assertEqual(blocked.returncode, 1, blocked.stdout + blocked.stderr)
        self.assertIn("TW05", blocked.stdout)
        approved = self.run_cli(diff, "--approved")
        self.assertEqual(approved.returncode, 0, approved.stdout + approved.stderr)
        self.assertIn("[WARNING] TW05", approved.stdout)

    def test_bundled_example_is_caught(self):
        example = (ROOT / "guardrail/examples/weaken-active-check.diff").read_text(encoding="utf-8")
        result = self.run_cli(example)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("TW05", result.stdout)


if __name__ == "__main__":
    unittest.main()
