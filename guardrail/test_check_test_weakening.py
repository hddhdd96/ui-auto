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
    lines = difflib.unified_diff(
        original.splitlines(),
        changed.splitlines(),
        f"a/{path}",
        f"b/{path}",
        n=0,
        lineterm="",
    )
    return f"diff --git a/{path} b/{path}\n" + "\n".join(lines) + "\n"


def rules(diff: str) -> set[str]:
    return {finding.rule for finding in guard.check_diff(diff, SCOPE)}


class CatchesWeakening(unittest.TestCase):
    def test_exact_status_becomes_partial_match(self):
        diff = mutate(
            "tests/steps/instance-create.ts",
            "getByTestId('instance-status')).toHaveText(/^ACTIVE$/)",
            "getByTestId('instance-status')).toContainText('ACTIVE')",
        )
        self.assertIn("TW05", rules(diff))

    def test_retry_enabled_only_on_ci(self):
        diff = mutate("playwright.config.ts", "retries: 0,", "retries: process.env.CI ? 2 : 0,")
        self.assertIn("TW04", rules(diff))

    def test_timeout_budget_inflated(self):
        diff = mutate("playwright.config.ts", "timeout: 30_000,", "timeout: 120_000,")
        self.assertIn("TW12", rules(diff))

    def test_lifecycle_test_skipped(self):
        diff = mutate(
            "tests/tc/TC-INST-002.spec.ts",
            "test('TC-INST-002 create instance becomes ACTIVE'",
            "test.skip('TC-INST-002 create instance becomes ACTIVE'",
        )
        self.assertIn("TW03", rules(diff))

    def test_active_assertion_removed(self):
        diff = mutate(
            "tests/steps/instance-create.ts",
            "  await expect(row.getByTestId('instance-status')).toHaveText(/^ACTIVE$/);\n",
            "",
        )
        self.assertIn("TW01", rules(diff))

    def test_expected_status_changed(self):
        diff = mutate(
            "tests/steps/instance-create.ts",
            "toHaveText(/^ACTIVE$/)",
            "toHaveText(/^BUILD$/)",
        )
        self.assertIn("TW06", rules(diff))

    def test_exact_option_removed(self):
        diff = mutate(
            "pages/auth/LoginPage.ts",
            "getByLabel('Username', { exact: true })",
            "getByLabel('Username')",
        )
        self.assertIn("TW10", rules(diff))

    def test_failure_propagation_removed(self):
        diff = mutate(
            "healing/selfHeal.ts",
            "throw new Error(`No locator candidate matched within ${timeoutMs}ms`);",
            "console.warn(`No locator candidate matched within ${timeoutMs}ms`);",
        )
        self.assertIn("TW07", rules(diff))

    def test_trivial_assertion_added(self):
        diff = mutate(
            "tests/steps/instance-create.ts",
            "await expect(row).toHaveCount(1);",
            "expect(true).toBe(true);",
        )
        self.assertIn("TW08", rules(diff))

    def test_guardrail_rule_removed(self):
        diff = mutate("guardrail/scope.txt", "healing/*\n", "")
        self.assertIn("TW11", rules(diff))


class AllowsOrdinaryChanges(unittest.TestCase):
    def test_new_assertion_is_not_flagged(self):
        diff = mutate(
            "tests/steps/instance-create.ts",
            "  await expect(row).toHaveCount(1);\n",
            "  await expect(row).toHaveCount(1);\n"
            "  await expect(row.getByTestId('instance-name-cell')).toBeVisible();\n",
        )
        self.assertEqual(rules(diff), set())

    def test_partial_to_exact_strengthening_is_not_flagged(self):
        weak = mutate(
            "tests/steps/instance-create.ts",
            "toHaveText(/^ACTIVE$/)",
            "toContainText('ACTIVE')",
        )
        restore = "\n".join(
            {"-": "+", "+": "-"}[line[0]] + line[1:]
            if line.startswith(("-", "+")) and not line.startswith(("---", "+++"))
            else line
            for line in weak.splitlines()
        )
        self.assertEqual(rules(restore), set())

    def test_variable_rename_is_not_flagged(self):
        path = "tests/tc/TC-INST-002.spec.ts"
        original = (ROOT / path).read_text(encoding="utf-8")
        renamed = original.replace("const name =", "const instanceName =").replace(
            "name,", "instanceName,"
        )
        diff = "\n".join(
            difflib.unified_diff(
                original.splitlines(),
                renamed.splitlines(),
                f"a/{path}",
                f"b/{path}",
                n=0,
                lineterm="",
            )
        )
        self.assertEqual(rules(diff), set())

    def test_rule_text_in_guardrail_sources_and_comments_is_not_flagged(self):
        diff = (
            "diff --git a/guardrail/test_check_test_weakening.py b/guardrail/test_check_test_weakening.py\n"
            "--- a/guardrail/test_check_test_weakening.py\n+++ b/guardrail/test_check_test_weakening.py\n"
            "@@ -1,0 +2 @@\n+mutate('playwright.config.ts', 'retries: 0,', 'retries: 2,')  # test.skip(\n"
            "diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n"
            "--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n"
            "@@ -1,0 +2 @@\n+      # retries: 0, 실패를 재시도로 가리지 않는다.\n"
        )
        self.assertEqual(rules(diff), set())

    def test_out_of_scope_file_is_ignored(self):
        diff = mutate("README.md", "retries: 0", "retries: 2")
        self.assertEqual(rules(diff), set())


class CommandLine(unittest.TestCase):
    def run_cli(self, diff: str, *extra: str) -> subprocess.CompletedProcess:
        with tempfile.NamedTemporaryFile("w", suffix=".diff", delete=False, encoding="utf-8") as handle:
            handle.write(diff)
            name = handle.name
        try:
            environment = {
                key: value
                for key, value in os.environ.items()
                if key not in {"GITHUB_ACTIONS", "GITHUB_STEP_SUMMARY"}
            }
            return subprocess.run(
                [sys.executable, str(ROOT / "guardrail/check_test_weakening.py"), name, *extra],
                capture_output=True,
                text=True,
                env=environment,
            )
        finally:
            os.unlink(name)

    def test_weakening_fails_the_job_until_a_person_approves(self):
        diff = mutate(
            "tests/steps/instance-create.ts",
            "toHaveText(/^ACTIVE$/)",
            "toContainText('ACTIVE')",
        )
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
