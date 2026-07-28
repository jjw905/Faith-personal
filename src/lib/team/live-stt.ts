/**
 * Live online-meeting STT bridge.
 *
 * Existing STT in this repo covers:
 * - upload / file STT (`process-upload`, chunked-transcribe)
 * - file-fed realtime evaluation (`realtimeTranscribeFile`)
 *
 * 각 참가자의 로컬 LiveKit 마이크 트랙을 OpenAI WebRTC 전사 세션에 복제한다.
 * 음성 통화 트랙은 그대로 두고 전사 결과만 Faith 서버에 순차 저장한다.
 */
export const LIVE_TEAM_STT_INTEGRATION =
  "LiveKit local track → OpenAI WebRTC mini transcription";

export function isLiveTeamSttRuntimeAvailable() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && key !== "your_openai_api_key_here");
}

export function liveTeamSttUnavailableMessage() {
  return "실시간 기록 설정을 확인해 주세요. 음성 통화는 계속 사용할 수 있습니다.";
}
