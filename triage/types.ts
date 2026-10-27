/** 실패 원인 후보. PASS/FAIL 판정을 바꾸지 않는 보조 정보다. */
export const CATEGORIES = ['product', 'script', 'environment', 'unknown'] as const;
export type Category = typeof CATEGORIES[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  product: '제품 결함', script: '스크립트 문제', environment: '환경 문제', unknown: '판단 보류',
};

/** 분류기에 넘기는 입력. 원본 tc-summary.json에서 읽기만 하고 수정하지 않는다. */
export type TriageInput = {
  tcId: string;
  /** 테스트 이름(프로젝트·파일 경로 제외). */
  testName: string;
  result: 'FAIL' | 'BLOCK';
  errors: { message: string; snippet: string; file: string; line?: number }[];
  /** 실패 시점 페이지 접근성 스냅샷 일부(error-context.md). */
  pageSnapshot: string;
  /** 실패 시 기록된 네트워크 문제(network-log.json). 한 줄에 요청 하나. */
  network: string;
};

export type Verdict = {
  category: Category;
  confidence: 'high' | 'medium' | 'low';
  /** 입력 원문에 그대로 있는 문장만 남긴다. */
  evidence: string[];
  reason: string;
  nextCheck?: string;
};

export type AiVerdict = Verdict & {
  model: string;
  /** 원문에서 찾지 못해 버린 근거 수. */
  droppedEvidence: number;
  usage?: { inputTokens: number; outputTokens: number };
};

export type TriageItem = {
  tcId: string;
  testName: string;
  result: 'FAIL' | 'BLOCK';
  rule: Verdict;
  ai: AiVerdict | null;
  aiError?: string;
};

export type TriageReport = {
  generatedAt: string;
  source: string;
  note: string;
  model: string | null;
  items: TriageItem[];
};
