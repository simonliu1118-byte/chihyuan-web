import { useEffect, useState } from "react";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; checkedAt: string }
  | { status: "error"; message: string };

interface HealthResponse {
  ok: boolean;
  service: string;
  database: "ok" | "error";
  time: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch("/api/health", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as HealthResponse;
        if (!body.ok || body.database !== "ok") {
          throw new Error("Backend or local database is not ready");
        }
        setHealth({ status: "ok", checkedAt: body.time });
      } catch (error) {
        if (controller.signal.aborted) return;
        setHealth({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown health-check error",
        });
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, []);

  return (
    <main className="foundation-shell">
      <section className="foundation-card" aria-labelledby="foundation-title">
        <p className="eyebrow">Chihyuan Enterprise Management System</p>
        <h1 id="foundation-title">CY Web</h1>
        <p className="description">
          新版 Web 系統基礎環境。此畫面僅用於確認前端、Worker 與本機 D1 已正確接通；正式介面將在 UI/UX 階段另行設計。
        </p>
        <div className={`health health-${health.status}`} role="status" aria-live="polite">
          {health.status === "loading" && "正在檢查本機環境…"}
          {health.status === "ok" && "本機環境正常"}
          {health.status === "error" && `本機環境尚未就緒：${health.message}`}
        </div>
      </section>
    </main>
  );
}
