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
      const result = await updateReportFn({ data: { reportId, status } });
      if (!result.success) {
        onError?.(result.error ?? "更新狀態失敗");
        return false;
      }
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      return true;
    },
    [onError],
  );

  const changeSeverity = useCallback(
    async (reportId: string, severity: ReportSeverity) => {
      const result = await updateReportFn({ data: { reportId, severity } });
      if (!result.success) {
        onError?.(result.error ?? "更新嚴重程度失敗");
        return false;
      }
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, severity } : r)));
      return true;
    },
    [onError],
  );

  return {
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
  } as const;
}
