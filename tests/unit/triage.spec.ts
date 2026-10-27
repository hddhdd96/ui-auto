import { test, expect } from '@playwright/test';
import { aiConfigFromEnv, classifyWithAi, failurePrompt, type AiConfig } from '../../triage/ai';
import { groundVerdict } from '../../triage/ground';
import { buildTriageInputs, networkFrom, pageSnapshotFrom, testCodeFrom } from '../../triage/input';
import { classifyByRules } from '../../triage/rules';
import { triage } from '../../triage/triage';
import type { TriageInput } from '../../triage/types';

const failure: TriageInput = {
  tcId: 'DEMO-VOL-001', testName: 'volume creation is reflected in API and UI', result: 'FAIL',
  errors: [{ message: 'Error: expect(locator).not.toBeVisible() failed\nReceived: visible', snippet: '> 40 | await expect(this.createDialog).not.toBeVisible();', file: 'VolumePage.ts', line: 40 }],
  pageSnapshot: '- dialog "Create volume"',
  network: 'POST /api/v1/volumes -> 500 {"error":"Internal error while allocating volume"}',
  testCode: "test('volume creation is reflected in API and UI', {\n}, async ({ volumeLifecycle }) => {\n  await volumeLifecycle.createAndVerify(name, DEFAULT_VOLUME_SIZE_GIB);\n});",
};

function fakeFetch(payload: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const modelReply = (verdict: Record<string, unknown>) => ({
  content: [{ type: 'text', text: JSON.stringify(verdict) }], stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 80 },
});

test('triage input keeps only failed rows with errors and never mutates the summary', () => {
  const rows = [
    { tcId: 'A', title: ' > chromium > a.spec.ts > passes', result: 'PASS' as const, summary: '', errors: [], attachments: [] },
    { tcId: 'B', title: ' > chromium > b.spec.ts > not run', result: 'BLOCK' as const, summary: '', errors: [], attachments: [] },
    {
      tcId: 'C', title: ' > chromium > tests/x/c.spec.ts > fails', result: 'FAIL' as const, summary: '요약', attachments: [],
      errors: [{ message: '\u001b[31mError: boom\u001b[39m', snippet: 'code', location: { file: '/repo/tests/x/c.spec.ts', line: 3 } }],
    },
  ];
  const before = JSON.stringify(rows);
  const inputs = buildTriageInputs(rows);
  expect(JSON.stringify(rows)).toBe(before);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toEqual({
    tcId: 'C', testName: 'fails', result: 'FAIL', pageSnapshot: '', network: '', testCode: '',
    errors: [{ message: 'Error: boom', snippet: 'code', file: 'c.spec.ts', line: 3 }],
  });
});

test('page snapshot is read from both error-context formats and network log is summarized', () => {
  expect(pageSnapshotFrom('# Page snapshot\n\n```yaml\n- heading "Log in"\n```\n')).toBe('- heading "Log in"');
  expect(pageSnapshotFrom('# Error details\n```\nError\n```\n\n```yaml\n- dialog "Create volume"\n```\n# Test source\n```ts\nx\n```'))
    .toBe('- dialog "Create volume"');
  expect(networkFrom(JSON.stringify({
    problems: [
      { method: 'POST', path: '/api/v1/volumes', status: 409, body: '{"error":"Duplicate name"}' },
      { method: 'GET', path: '/api/v1/volumes', failure: 'net::ERR_EMPTY_RESPONSE' },
      { method: 'GET', path: '/api/v1/volumes', durationMs: 11000 },
    ],
    pending: [{ method: 'DELETE', path: '/api/v1/volumes/1', pendingMs: 4000 }],
  }))).toBe([
    'POST /api/v1/volumes -> 409 {"error":"Duplicate name"}',
    'GET /api/v1/volumes -> failed: net::ERR_EMPTY_RESPONSE',
    'GET /api/v1/volumes -> completed after 11000ms',
    'DELETE /api/v1/volumes/1 -> still pending after 4000ms',
  ].join('\n'));
});

test('rule baseline does not invent a cause when nothing matches', () => {
  const verdict = classifyByRules({ ...failure, errors: [{ message: 'odd failure', snippet: '', file: '' }], network: '', pageSnapshot: '' });
  expect(verdict).toEqual({ category: 'unknown', confidence: 'low', evidence: [], reason: '일치하는 규칙 없음' });
});

test('evidence not found verbatim is dropped and an unsupported verdict becomes unknown', () => {
  const kept = groundVerdict({ category: 'product', confidence: 'high', evidence: ['-> 500', 'database is down'], reason: '' }, failure);
  expect(kept).toMatchObject({ category: 'product', evidence: ['-> 500'], droppedEvidence: 1 });
  const invented = groundVerdict({ category: 'environment', confidence: 'high', evidence: ['DNS lookup failed'], reason: '' }, failure);
  expect(invented).toMatchObject({ category: 'unknown', confidence: 'low', evidence: [], droppedEvidence: 1 });
});

const verdictJson = {
  category: 'product', confidence: 'high', evidence: ['POST /api/v1/volumes -> 500'], reason: '생성 API가 500을 반환했습니다.', nextCheck: '서버 로그 확인',
};
const gemini: AiConfig = { provider: 'gemini', apiKey: 'g-key', model: 'gemini-3.8-flash', minIntervalMs: 0 };
const anthropic: AiConfig = { provider: 'anthropic', apiKey: 'a-key', model: 'claude-haiku-5-5', minIntervalMs: 0, workspaceId: 'wrkspc_test' };
const geminiReply = (verdict: Record<string, unknown>) => ({
  status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(verdict) }] }],
  usage: { total_input_tokens: 1000, total_output_tokens: 70, total_thought_tokens: 30 },
});

test('provider is chosen from environment keys, Gemini first', () => {
  expect(aiConfigFromEnv({})).toBeNull();
  expect(aiConfigFromEnv({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toEqual({
    provider: 'gemini', apiKey: 'g', model: 'gemini-3.5-flash-lite', minIntervalMs: 6000, workspaceId: undefined,
    context: expect.stringContaining('POST /api/v1/volumes'),
  });
  expect(aiConfigFromEnv({ ANTHROPIC_API_KEY: 'a', TRIAGE_MODEL: 'claude-sonnet-5-5' }))
    .toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', minIntervalMs: 0 });
  expect(aiConfigFromEnv({ TRIAGE_PROVIDER: 'anthropic', GEMINI_API_KEY: 'g' })).toBeNull();
  expect(() => aiConfigFromEnv({ TRIAGE_PROVIDER: 'other', GEMINI_API_KEY: 'g' })).toThrow('unknown TRIAGE_PROVIDER');
});

test('Gemini request uses the Interactions API with a JSON schema and does not reveal the TC-ID', async () => {
  const { impl, calls } = fakeFetch(geminiReply(verdictJson));
  const verdict = await classifyWithAi(failure, gemini, { fetchImpl: impl });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
  expect(calls[0].headers).toMatchObject({ 'x-goog-api-key': 'g-key' });
  expect(calls[0].body).toMatchObject({ model: 'gemini-3.8-flash', store: false, response_format: { mime_type: 'application/json' } });
  expect(String(calls[0].body.input)).not.toContain('DEMO-VOL-001');
  expect(failurePrompt(failure)).not.toContain('DEMO-VOL-001');
  expect(verdict).toMatchObject({
    category: 'product', evidence: ['POST /api/v1/volumes -> 500'], droppedEvidence: 0,
    model: 'gemini:gemini-3.8-flash', usage: { inputTokens: 1000, outputTokens: 100 },
  });
});

test('Anthropic request uses structured output with bearer auth', async () => {
  const { impl, calls } = fakeFetch(modelReply(verdictJson));
  const verdict = await classifyWithAi(failure, anthropic, { fetchImpl: impl });
  expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
  expect(calls[0].headers).toMatchObject({ authorization: 'Bearer a-key', 'anthropic-workspace-id': 'wrkspc_test' });
  expect(calls[0].body).toMatchObject({ model: 'claude-haiku-5-5', output_config: { format: { type: 'json_schema' } } });
  expect(verdict).toMatchObject({ category: 'product', model: 'anthropic:claude-haiku-5-5', usage: { inputTokens: 900, outputTokens: 80 } });
});

test('invalid model output and API errors are reported, not retried or turned into a verdict', async () => {
  const invalid = fakeFetch(geminiReply({ ...verdictJson, category: 'flaky' }));
  await expect(classifyWithAi(failure, gemini, { fetchImpl: invalid.impl })).rejects.toThrow('invalid category: flaky');
  const limited = fakeFetch({ error: { message: 'Resource has been exhausted' } }, 429);
  await expect(classifyWithAi(failure, gemini, { fetchImpl: limited.impl })).rejects.toThrow('Gemini API 429: Resource has been exhausted');
  expect(limited.calls).toHaveLength(1);
  const incomplete = fakeFetch({ status: 'failed', errors: [{ message: 'safety' }] });
  await expect(classifyWithAi(failure, gemini, { fetchImpl: incomplete.impl })).rejects.toThrow('unexpected status: failed safety');
  const denied = fakeFetch({ error: { message: 'invalid x-api-key' } }, 401);
  await expect(classifyWithAi(failure, anthropic, { fetchImpl: denied.impl })).rejects.toThrow('Anthropic API 401: invalid x-api-key');
  expect(denied.calls).toHaveLength(1);
});

test('without AI config only the rule baseline runs and AI errors stay visible', async () => {
  const { impl, calls } = fakeFetch({}, 500);
  const ruleOnly = await triage([failure], 'report/tc-summary.json', { fetchImpl: impl });
  expect(calls).toHaveLength(0);
  expect(ruleOnly).toMatchObject({ model: null, items: [{ tcId: 'DEMO-VOL-001', result: 'FAIL', ai: null }] });
  const withError = await triage([failure], 'report/tc-summary.json', { ai: gemini, fetchImpl: impl });
  expect(withError).toMatchObject({ model: 'gemini:gemini-3.8-flash', items: [{ ai: null, aiError: expect.stringContaining('Gemini API 500') }] });
  expect(calls).toHaveLength(1);
});

test('a key or request-format error stops further AI calls instead of repeating the same failure', async () => {
  const { impl, calls } = fakeFetch({ error: { message: 'API key not valid' } }, 400);
  const report = await triage([failure, { ...failure, tcId: 'DEMO-VOL-002' }], 'triage-lab', { ai: gemini, fetchImpl: impl });
  expect(calls).toHaveLength(1);
  expect(report.items.map(item => item.aiError)).toEqual([
    'Gemini API 400: API key not valid',
    '건너뜀(앞선 설정 오류): Gemini API 400: API key not valid',
  ]);
  expect(report.items.map(item => item.rule.category)).toEqual(['product', 'product']);
});

test('test code is extracted without TC-ID or tag lines', () => {
  const source = [
    "import { test } from '../../fixtures/base-test';",
    '',
    "test('created volume shows the requested size', {",
    "  tag: '@reg-02', annotation: { type: 'tc-id', description: 'REG-02' },",
    '}, async ({ volumePage }) => {',
    '  const requestedSizeGiB = 20;',
    '  await volumePage.createVolume(name, DEFAULT_VOLUME_SIZE_GIB);',
    '  await volumePage.expectSize(name, requestedSizeGiB);',
    '});',
    '',
    "test('another test', async () => {});",
  ].join('\n');
  const code = testCodeFrom(source, 'created volume shows the requested size');
  expect(code).toContain('const requestedSizeGiB = 20;');
  expect(code).toContain('expectSize(name, requestedSizeGiB)');
  expect(code).not.toMatch(/REG-02|@reg-02|another test/);
  expect(testCodeFrom(source, 'missing test')).toBe('');
});

test('prompt carries the contract and test code, and contract quotes cannot serve as evidence', () => {
  const prompt = failurePrompt(failure, 'POST /api/v1/volumes {sizeGiB: positive integer} -> 201');
  expect(prompt.indexOf('<contract>')).toBeLessThan(prompt.indexOf('<failure>'));
  expect(prompt).toContain('## test code\ntest(\'volume creation is reflected in API and UI\'');
  expect(prompt).not.toContain('DEMO-VOL-001');
  const onlyContract = groundVerdict({ category: 'script', confidence: 'high', evidence: ['sizeGiB: positive integer'], reason: '' }, failure);
  expect(onlyContract).toMatchObject({ category: 'unknown', droppedEvidence: 1 });
  const fromTestCode = groundVerdict({ category: 'product', confidence: 'high', evidence: ['createAndVerify(name, DEFAULT_VOLUME_SIZE_GIB)'], reason: '' }, failure);
  expect(fromTestCode).toMatchObject({ category: 'product', droppedEvidence: 0 });
});
