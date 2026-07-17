export { maskPii, detectPii } from "@/lib/masking/mask";
export { mergeRuleAndNer } from "@/lib/masking/hybrid";
export type { NerSpan } from "@/lib/masking/hybrid";
export {
  extractDigits,
  normalizeKoreanDigits,
} from "@/lib/masking/korean-digits";
export { BANK_ALIASES } from "@/lib/masking/banks";
export { ACCOUNT_HYPHEN_PATTERNS } from "@/lib/masking/account-formats";
export { PII_PATTERNS } from "@/lib/masking/patterns";
export {
  DIGIT_SPOKEN,
  DOT_SPOKEN,
  AT_SPOKEN,
  SEP_SPOKEN,
  JAMO_CONFUSION,
  CUE_VARIANTS,
} from "@/lib/masking/spoken";
export {
  generateRandomConversation,
  generateRandomText,
  generateRandomTexts,
} from "@/lib/masking/random-conversation";
export { PII_TYPE_LABELS } from "@/lib/masking/types";
export type {
  MaskOptions,
  MaskResult,
  MaskStyle,
  PiiMatch,
  PiiType,
  TranscriptUtterance,
} from "@/lib/masking/types";
