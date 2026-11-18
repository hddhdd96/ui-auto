import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'playwright-report', 'test-results', 'artifacts', 'portal/web'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Playwright fixture는 쓰지 않는 인자도 빈 객체 패턴({})으로 받아야 한다.
      'no-empty-pattern': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
