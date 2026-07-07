import { useCallback, useMemo, useState } from "react";
import { updateReportFn } from "#/features/admin/admin.functions";
import type { Report, ReportSeverity, ReportStatus } from "#/types/admin";

interface UseReportInboxOptions {
  initial: readonly Report[];
  onError?: (msg: string) => void;
}

export function useReportInbox({ initial, onError }: UseReportInboxOptions) {
  const [reports, setReports] = useState<Report[]>(() => [...initial]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<ReportSeverity | "all">("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reports.filter((r) => {
      const matchSearch =
        !q ||
        r.subject.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        r.reportedBy.username.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchSeverity = severityFilter === "all" || r.severity === severityFilter;
      return matchSearch && matchStatus && matchSeverity;
    });
  }, [reports, search, statusFilter, severityFilter]);

  const pendingCount = useMemo(
    () => reports.filter((r) => r.status === "pending").length,
    [reports],
  );

  const changeStatus = useCallback(
    async (reportId: string, status: ReportStatus) => {
      // 紀錄舊狀態以供失敗時回滾
      let oldStatus: ReportStatus | undefined;

      // 1. 樂觀更新 (Optimistic Update)
      setReports((prev) => {
        const target = prev.find((r) => r.id === reportId);
        if (target) oldStatus = target.status;
        return prev.map((r) => (r.id === reportId ? { ...r, status } : r));
      });

      // 2. 發送請求
      const result = await updateReportFn({ data: { reportId, status } });

      // 3. 處理失敗 (Rollback)
      if (!result.success) {
        if (oldStatus) {
          setReports((prev) =>
            prev.map((r) => (r.id === reportId ? { ...r, status: oldStatus! } : r)),
          );
        }
        onError?.(result.error ?? "更新狀態失敗");
        return false;
      }
      return true;
    },
    [onError],
  );

  const changeSeverity = useCallback(
    async (reportId: string, severity: ReportSeverity) => {
      // 紀錄舊狀態以供失敗時回滾
      let oldSeverity: ReportSeverity | undefined;

      // 1. 樂觀更新 (Optimistic Update)
      setReports((prev) => {
        const target = prev.find((r) => r.id === reportId);
        if (target) oldSeverity = target.severity;
        return prev.map((r) => (r.id === reportId ? { ...r, severity } : r));
      });

      // 2. 發送請求
      const result = await updateReportFn({ data: { reportId, severity } });

      // 3. 處理失敗 (Rollback)
      if (!result.success) {
        if (oldSeverity) {
          setReports((prev) =>
            prev.map((r) => (r.id === reportId ? { ...r, severity: oldSeverity! } : r)),
          );
        }
        onError?.(result.error ?? "更新嚴重程度失敗");
        return false;
      }
      return true;
    },
    [onError],
  );

  const updateLocalStatus = useCallback((reportId: string, newStatus: ReportStatus) => {
    setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r)));
  }, []);

  return {
    reports, // 導出完整的 reports，以便在彈窗中獲取最新狀態
    filtered,
    pendingCount,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    severityFilter,
    setSeverityFilter,
    changeStatus,
    changeSeverity,
    updateLocalStatus,
  } as const;
}
