import { useMemo, useRef, useState } from "react";
import { Leva, useControls, folder } from "leva";
import {
  DEFAULT_GLASS_CONFIG,
  GLASS_SHOT_KEY,
  GlassChatBubblesPreview,
  type GlassBubblesConfig,
  type GlassShotPayload,
} from "../../src/components/marketing/glass-chat-bubbles";

const A = DEFAULT_GLASS_CONFIG.bubbleA;
const B = DEFAULT_GLASS_CONFIG.bubbleB;
const step = 0.02;
const rstep = 0.01;

function readShotPayload(): GlassShotPayload | null {
  try {
    const raw = sessionStorage.getItem(GLASS_SHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlassShotPayload;
  } catch {
    return null;
  }
}

/** ?bake=1 → sessionStorage에 저장된 구도 그대로 투명 렌더. */
function BakeView() {
  const payload = useMemo(() => readShotPayload(), []);
  const config = payload?.config ?? DEFAULT_GLASS_CONFIG;
  const shot = payload?.shot ?? 1;

  return (
    <div
      id="bake-stage"
      data-shot={String(shot).padStart(2, "0")}
      style={{
        width: 1024,
        height: 1024,
        margin: "0 auto",
        background: "transparent",
      }}
    >
      <GlassChatBubblesPreview config={config} bake />
    </div>
  );
}

export function App() {
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("bake") === "1"
  ) {
    return <BakeView />;
  }

  const values = useControls({
    "위 말풍선 (오른쪽 꼬리)": folder({
      aPos: { label: "위치", value: A.position, step },
      aRot: { label: "각도(rad)", value: A.rotation, step: rstep },
    }),
    "아래 말풍선 (왼쪽 꼬리)": folder({
      bPos: { label: "위치", value: B.position, step },
      bRot: { label: "각도(rad)", value: B.rotation, step: rstep },
    }),
    장면: folder({
      float: { label: "부유", value: false },
      controls: { label: "카메라 조작", value: true },
    }),
  });

  const cameraRef = useRef(DEFAULT_GLASS_CONFIG.camera);
  const [shotNo, setShotNo] = useState(1);
  const [status, setStatus] = useState("");

  const config: GlassBubblesConfig = {
    bubbleA: {
      position: values.aPos as [number, number, number],
      rotation: values.aRot as [number, number, number],
    },
    bubbleB: {
      position: values.bPos as [number, number, number],
      rotation: values.bRot as [number, number, number],
    },
    float: values.float as boolean,
    controls: values.controls as boolean,
    camera: cameraRef.current,
  };

  const [saving, setSaving] = useState(false);

  async function saveCurrentShot() {
    if (saving) return;
    const capture = (
      window as Window & {
        __faithGlassCapture?: () => {
          camera: GlassBubblesConfig["camera"];
          dataUrl: string;
        };
      }
    ).__faithGlassCapture;

    if (!capture) {
      setStatus("캡처 준비 중 — 잠시 후 다시 눌러주세요");
      return;
    }

    setSaving(true);
    setStatus("저장 중…");
    try {
      const { camera, dataUrl } = capture();
      cameraRef.current = camera;

      const shotConfig: GlassBubblesConfig = {
        ...config,
        float: false,
        controls: false,
        camera,
      };
      sessionStorage.setItem(
        GLASS_SHOT_KEY,
        JSON.stringify({ shot: shotNo, config: shotConfig }),
      );

      const res = await fetch("/api/save-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shot: shotNo,
          dataUrl,
          config: shotConfig,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        path?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setStatus(`저장 완료 · ${json.path}`);
      setShotNo((n) => Math.min(9, n + 1));
    } catch (e) {
      setStatus(
        `저장 실패 · ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 20,
        height: "100%",
        minHeight: "100dvh",
        padding: 24,
        boxSizing: "border-box",
        maxWidth: 1280,
        margin: "0 auto",
        alignItems: "stretch",
      }}
    >
      <Leva collapsed={false} />

      <section
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: 10,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            WebGL 프리뷰 · :3001
          </h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#52525b" }}>
              샷
              <input
                type="number"
                min={1}
                max={9}
                value={shotNo}
                onChange={(e) => setShotNo(Number(e.target.value) || 1)}
                style={{ width: 48, marginLeft: 6 }}
              />
            </label>
            <button
              type="button"
              onClick={() => void saveCurrentShot()}
              disabled={saving}
              style={{
                border: 0,
                borderRadius: 10,
                padding: "8px 14px",
                background: saving ? "#6b7280" : "#11162e",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "저장 중…" : "이 구도 PNG"}
            </button>
          </div>
        </div>
        <div
          id="preview-stage"
          style={{
            minHeight: 0,
            borderRadius: 20,
            overflow: "hidden",
            background: "#e7e9ed",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)",
          }}
        >
          <GlassChatBubblesPreview
            config={config}
            onCameraChange={(cam) => {
              cameraRef.current = cam;
            }}
          />
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#71717a" }}>
          구도 맞춘 뒤 「이 구도 PNG」 → public/hero-chat-glass-XX.png 자동 저장
          {status ? ` · ${status}` : ""}
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: 10,
          minHeight: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>참고 이미지</h1>
        <div
          style={{
            minHeight: 0,
            borderRadius: 20,
            overflow: "hidden",
            background: "#e7e9ed",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <img
            src="/glass-bubbles-ref.png"
            alt="유리 말풍선 참고"
            style={{
              width: "100%",
              height: "100%",
              maxHeight: "70dvh",
              objectFit: "contain",
            }}
          />
        </div>
      </section>
    </div>
  );
}
