import { useEffect, useMemo, useState } from "react";
import type { HealthData } from "../shared/api";
import { apiRequest } from "./api/client";
import { DataPagination } from "./ui/data/DataPagination";
import { DataView, type DataColumn } from "./ui/data/DataView";
import { DataViewToolbar } from "./ui/data/DataViewToolbar";
import type { NavigationGroup } from "./ui/foundation/navigation";
import { Notice } from "./ui/primitives/Notice";
import { Section } from "./ui/primitives/Section";
import { StatusChip } from "./ui/primitives/StatusChip";
import { AppShell } from "./ui/shell/AppShell";

type HealthState =
  | { status: "loading" }
  | { status: "ok" }
  | { status: "error"; message: string };

interface FoundationCapability {
  key: string;
  name: string;
  scope: string;
  status: "ready" | "staged";
}

const foundationNavigation: readonly NavigationGroup[] = [
  {
    key: "foundation",
    items: [
      {
        key: "system-status",
        label: "系統狀態",
        href: "#system-status",
        description: "開發基礎狀態",
      },
    ],
  },
  {
    key: "business",
    label: "業務模組（尚未啟用）",
    items: [
      { key: "customers", label: "客戶", href: "#", disabled: true },
      { key: "items", label: "商品", href: "#", disabled: true },
      { key: "orders", label: "銷售工單", href: "#", disabled: true },
      { key: "outsourcing", label: "委外", href: "#", disabled: true },
      { key: "worklogs", label: "工作日誌", href: "#", disabled: true },
      { key: "settings", label: "設定", href: "#", disabled: true },
    ],
  },
];

const capabilityRows: readonly FoundationCapability[] = [
  { key: "request", name: "Shared Request / Validation", scope: "API / Worker", status: "ready" },
  { key: "audit", name: "Shared Audit Core", scope: "Server / D1", status: "ready" },
  { key: "shell", name: "Shared App Shell", scope: "Frontend", status: "ready" },
  { key: "forms", name: "Shared Form / Unsaved Guard", scope: "Frontend", status: "ready" },
  { key: "data-view", name: "Adaptive Data View", scope: "Frontend", status: "staged" },
];

const capabilityColumns: readonly DataColumn<FoundationCapability>[] = [
  { key: "name", header: "共用能力", render: (item) => item.name },
  { key: "scope", header: "範圍", render: (item) => item.scope },
  {
    key: "status",
    header: "狀態",
    align: "end",
    render: (item) => (
      <StatusChip tone={item.status === "ready" ? "success" : "info"}>
        {item.status === "ready" ? "已建立" : "本階段"}
      </StatusChip>
    ),
  },
];

export default function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [dataSearch, setDataSearch] = useState("");
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null);

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

  const filteredCapabilities = useMemo(() => {
    const query = dataSearch.trim().toLocaleLowerCase();
    if (!query) return capabilityRows;
    return capabilityRows.filter((item) => `${item.name} ${item.scope}`.toLocaleLowerCase().includes(query));
  }, [dataSearch]);

  const statusTone = health.status === "ok" ? "success" : health.status === "error" ? "danger" : "neutral";
  const statusLabel = health.status === "ok" ? "基礎正常" : health.status === "error" ? "尚未就緒" : "檢查中";

  return (
    <AppShell
      appName="CY Web"
      subtitle="Chihyuan Enterprise Management System"
      navigation={foundationNavigation}
      activeNavigationKey="system-status"
      headerActions={<StatusChip tone={statusTone}>{statusLabel}</StatusChip>}
      footer={<span className="cy-shell-foundation-note">Foundation preview · 非正式 UI</span>}
    >
      <div className="cy-page" id="system-status">
        <header className="cy-page-header">
          <div>
            <p className="cy-page-eyebrow">Foundation</p>
            <h1>系統基礎狀態</h1>
            <p className="cy-page-description">
              此頁只用來驗證共用 App Shell、前端、Worker、D1 與共用互動元件；不是正式業務畫面或最終視覺設計。
            </p>
          </div>
        </header>

        <Section
          title="開發環境"
          description="健康檢查透過共用 API client 呼叫 Worker，再確認 D1 binding。"
        >
          {health.status === "loading" ? <Notice>正在檢查本機環境…</Notice> : null}
          {health.status === "ok" ? (
            <Notice tone="success" title="基礎連線正常">
              前端、Worker 與 D1 健康檢查已回傳正常結果。
            </Notice>
          ) : null}
          {health.status === "error" ? (
            <Notice tone="danger" title="本機環境尚未就緒" role="alert">
              {health.message}
            </Notice>
          ) : null}
        </Section>

        <Section
          title="共用 Data View 預覽"
          description="以下是靜態 foundation 資料，只用來驗證同一份資料在 Desktop table / Mobile card 的共用呈現；正式業務資料會透過 API 按需查詢。"
        >
          <DataViewToolbar
            searchValue={dataSearch}
            onSearchChange={setDataSearch}
            searchLabel="搜尋 foundation 能力"
            searchPlaceholder="搜尋共用能力…"
            resultSummary={`顯示 ${filteredCapabilities.length} 筆`}
          />
          <DataView
            ariaLabel="Foundation 共用能力"
            items={filteredCapabilities}
            getKey={(item) => item.key}
            columns={capabilityColumns}
            selectedKey={selectedCapability}
            onSelect={(item) => setSelectedCapability(item.key)}
            emptyTitle="沒有符合的項目"
            emptyDescription="請調整搜尋文字。"
            renderCard={(item) => (
              <div className="cy-data-demo-card">
                <div className="cy-data-demo-card-header">
                  <span className="cy-data-demo-card-title">{item.name}</span>
                  <StatusChip tone={item.status === "ready" ? "success" : "info"}>
                    {item.status === "ready" ? "已建立" : "本階段"}
                  </StatusChip>
                </div>
                <span className="cy-data-demo-card-meta">{item.scope}</span>
              </div>
            )}
          />
          <DataPagination
            label="Foundation preview"
            canPrevious={false}
            canNext={false}
            onPrevious={() => undefined}
            onNext={() => undefined}
          />
        </Section>

        <Section title="目前階段" description="共用能力先完成，再進入 Customer 等正式業務畫面。">
          <div className="cy-foundation-grid">
            <div className="cy-foundation-item">
              <span>Shared Request / Validation</span>
              <StatusChip tone="success">已建立</StatusChip>
            </div>
            <div className="cy-foundation-item">
              <span>Shared App Shell / Forms</span>
              <StatusChip tone="success">已建立</StatusChip>
            </div>
            <div className="cy-foundation-item">
              <span>Adaptive Data View</span>
              <StatusChip tone="info">本階段</StatusChip>
            </div>
            <div className="cy-foundation-item">
              <span>正式業務 UI</span>
              <StatusChip>尚未開始</StatusChip>
            </div>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
