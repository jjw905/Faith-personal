# Faith 음성 샘플 (외부환경 소음 30%)

macOS `say`로 생성한 한국어 회의에 저역 럼블·히스·간헐 충격을 섞었습니다.
소음 비중 목표: **30%** (음성 70%).

- `meeting-intro-noise30.wav` · voice=Eddy (한국어(한국)) · noise=30% · 9.9s
- `meeting-pii-noise30.wav` · voice=Flo (한국어(한국)) · noise=30% · 13.3s
- `meeting-summary-noise30.wav` · voice=Reed (한국어(한국)) · noise=30% · 9.9s
- `meeting-cafe-noise30.wav` · voice=Sandy (한국어(한국)) · noise=30% · 10.8s
- `meeting-action-noise30.wav` · voice=Shelley (한국어(한국)) · noise=30% · 8.3s
- `meeting-new-session.wav` · macOS `say` 신규 표본 · 새 회의 채팅 레이아웃 검증용

재생성:

```bash
python3 scripts/generate-noisy-audio.py
# 새 회의 표본만:
say -o /tmp/faith-new-meeting.aiff "안녕하세요. 새 회의 녹음 표본입니다. 오늘은 마스킹과 회의록 레이아웃을 확인합니다. 참석자 발화가 채팅처럼 쌓이는지 보겠습니다."
afconvert -f WAVE -d LEI16@22050 /tmp/faith-new-meeting.aiff public/samples/audio/meeting-new-session.wav
```
