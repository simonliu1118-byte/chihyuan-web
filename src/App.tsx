import { useEffect, useState } from "react";
import type { HealthData } from "../shared/api";
import { apiRequest } from "./api/client";
import { CustomerWorkspacePreview } from "./modules/customer/CustomerWorkspacePreview";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { StatusChip } from "./ui/primitives/StatusChip";
import { AppShell } from "./ui/shell/AppShell";

type HealthState =
  | { status: "loading" }
  | { status: "ok" }
  | { status: "error"; message: string };

const previewNavigation: readonly NavigationGroup[] = [
  {
    key: "business",
    label: "業務",
    items: [
      { key: "customers", label: "客戶", href: "#customers", description: "Customer interaction preview" },
      { key: "items", label: "商品", href: "#", disabled: true },
      { key: "orders", label: "銷售工單", href: "#", disabled: true },
      { key: "outsourcing", label: "委外", href: "#", disabled: true },
      { key: "worklogs", label: "工作日誌", href: "#", disabled: true },
    ],
  },
  {
    key: "administration",
    label: "管理",
    items: [
      { key: "settings", label: "設定", href: "#", disabled: true },
      { key: "audit", label: "稽核紀錄", href: "#", disabled: true },
    ],
  },
];

export default function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const data = await apiRequest<HealthData>("/api/health", {
          signal: controller.signal,
        });

        if (data.database !== "ok") {
          throw new Error("Database health check failed");
        }

        setHealth({ status: "ok" });
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

  const statusTone = health.status === "ok" ? "success" : health.status === "error" ? "danger" : "neutral";
  const statusLabel = health.status === "ok" ? "基礎正常" : health.status === "error" ? "本機尚未就緒" : "檢查中";

  return (
    <AppShell
      appName="CY Web"
      subtitle="Chihyuan Enterprise Management System"
      navigation={previewNavigation}
      activeNavigationKey="customers"
      headerActions={
        <span title={health.status === "error" ? health.message : undefined}>
          <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
        </span>
      }
      footer={<span className="cy-shell-foundation-note">Customer interaction preview · 非正式 UI / 非正式資料</span>}
    >
      <div id="customers">
        <CustomerWorkspacePreview />
      </div>
    </AppShell>
  );
}