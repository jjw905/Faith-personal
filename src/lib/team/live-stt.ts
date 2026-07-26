/**
 * Live online-meeting STT bridge.
 *
 * Existing STT in this repo covers:
 * - upload / file STT (`process-upload`, chunked-transcribe)
 * - file-fed realtime evaluation (`realtimeTranscribeFile`)
 *
 * Missing for team voice rooms:
 * - LiveKit room egress or client audio publish → continuous STT session
 * - per-meeting model session lifecycle tied to host start/stop
 *
 * Until that bridge exists, recording start must not flip `recordingActive`
 * or charge STT quota. Voice transport remains independent.
 */
export const LIVE_TEAM_STT_INTEGRATION =
  "livekit-egress-or-client-stream → OpenAI realtime/file STT session";

export function isLiveTeamSttRuntimeAvailable() {
  return false;
}

export function liveTeamSttUnavailableMessage() {
  return "실시간 팀 회의 STT 파이프라인이 아직 연결되지 않았습니다. 음성 통화는 계속 사용할 수 있습니다.";
}
