import { test, expect } from '@playwright/test';
import { classifyResult, summarizeFailure } from '../../reporters/failure-summary';

test('unexecuted and failed results never become PASS', () => {
  expect(classifyResult('passed')).toBe('PASS');
  expect(classifyResult('failed')).toBe('FAIL');
  expect(classifyResult('timedOut')).toBe('FAIL');
  expect(classifyResult('skipped')).toBe('BLOCK');
  expect(classifyResult('interrupted')).toBe('BLOCK');
});

test('unknown failures are not assigned an invented cause', () => {
  expect(summarizeFailure('unrecognized error')).toBe('원본 오류와 첨부 증적을 확인하세요.');
});
