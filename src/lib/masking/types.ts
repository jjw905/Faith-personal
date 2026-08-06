export type PiiType =
  | "phone"
  | "email"
  | "rrn"
  | "card"
  | "account"
  | "address"
  | "name"
  | "passport"
  | "driver_license"
  | "biz_no"
  | "corp_no"
  | "vehicle"
  | "foreign_id"
  | "health_id"
  | "ip"
  | "emp_id"
  | "bank"
  | "secret";

export interface PiiMatch {
  type: PiiType;
  value: string;
  start: number;
  end: number;
  replacement: string;
  source?: "rule" | "ner";
}

/** 마스킹 표기: 부분 별표(앞**뒤) 또는 가리지 않음 */
export type MaskStyle = "partial" | "off";

export interface MaskOptions {
  /**
   * Optional extra names. Live/random mode should leave this empty so the
   * masker discovers PII only via patterns (no session answer key).
   */
  names?: string[];
  /** Types to skip */
  excludeTypes?: PiiType[];
  /** 표기 스타일 (미지정 시 기존 혼합 유지) */
  style?: MaskStyle;
}

export interface MaskResult {
  original: string;
  masked: string;
  matches: PiiMatch[];
  stats: Record<PiiType, number>;
  nerUsed?: boolean;
}

export interface TranscriptUtterance {
  id: string;
  speaker: string;
  delayMs: number;
  text: string;
}

export const PII_TYPE_LABELS: Record<PiiType, string> = {
  phone: "전화번호",
  email: "이메일",
  rrn: "주민등록번호",
  card: "카드번호",
  account: "계좌번호",
  address: "주소",
  name: "이름",
  passport: "여권번호",
  driver_license: "운전면허",
  biz_no: "사업자등록번호",
  corp_no: "법인등록번호",
  vehicle: "차량번호",
  foreign_id: "외국인등록번호",
  health_id: "건강보험번호",
  ip: "IP",
  emp_id: "사번",
  bank: "은행명",
  secret: "비밀키",
};
