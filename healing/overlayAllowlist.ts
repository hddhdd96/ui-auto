/**
 * Cloud View 스타일의 방해성 오버레이만 치유 대상으로 허용한다.
 * 비즈니스 확인 모달·에러 다이얼로그·결제 게이트 등은 절대 포함하지 않는다.
 */
export type OverlayRole = 'cloud-view-banner' | 'product-tour';

export interface OverlayDismissRule {
  role: OverlayRole;
  /** 오버레이 루트 셀렉터 */
  root: string;
  /** 닫기 버튼 셀렉터 (root 기준) */
  dismiss: string;
}

/** 데모용 allowlist. 실서비스에서는 제품 합의된 방해 오버레이만 등록한다. */
export const OVERLAY_ALLOWLIST: readonly OverlayDismissRule[] = [
  {
    role: 'cloud-view-banner',
    root: '[data-healing-role="cloud-view-banner"]',
    dismiss: '[data-dismiss="cloud-view"]',
  },
  {
    role: 'product-tour',
    root: '[data-healing-role="product-tour"]',
    dismiss: '[data-dismiss="tour"]',
  },
] as const;
