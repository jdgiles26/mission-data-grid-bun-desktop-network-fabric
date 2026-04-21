/**
 * Mission Logging & Data Collection - Log aggregation, search, export
 * Capability 4: Mission Logging (6 hours)
 */

import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Grid,
  Flex,
  Button,
  TextInput,
  Select,
  Badge,
  DataTable,
  Alert,
} from "../../shared/components";
import { useAppStore } from "../../shared/store";
import { rpcHandlers } from "../../shared/rpc-handlers";

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source: string;
  message: string;
  tags: string[];
}

interface ActivityEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  details: string;
  severity: "info" | "warning" | "critical";
}

/**
 * MissionLogging - Aggregate, search, and export mission logs
 */
export function MissionLogging() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLevel, setFilterLevel] = useState<"ALL" | "ERROR" | "WARNING" | "INFO">("ALL");
  const [loading, setLoading] = useState(true);

  const { addNotification } = useAppStore();

  // Fetch logs on mount and periodically
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);

        const [recentLogs, activityStream] = await Promise.all([
          rpcHandlers.getRecentLogs({ limit: 200 }),
          rpcHandlers.getActivityStream({ limit: 100 }),
        ]);

        // Map backend logs to UI format
        const formattedLogs: LogEntry[] = (recentLogs || []).map((log: any) => ({
          id: `log-${Date.now()}-${Math.random()}`,
          timestamp: new Date(log.timestamp || Date.now()),
          level: log.level?.toUpperCase() || "INFO",
          source: log.source || "unknown",
          message: log.message || "",
          tags: log.tags || [],
        }));

        const formattedActivity: ActivityEntry[] = (activityStream || []).map((act: any) => ({
          id: act.id,
          timestamp: new Date(act.timestamp || Date.now()),
          action: act.action || act.message || "",
          actor: act.actor || "SYSTEM",
          details: act.details || "",
          severity: act.severity?.toLowerCase() || "info",
        }));

        setLogs(formattedLogs);
        setActivityLog(formattedActivity);
      } catch (err) {
        addNotification({
          id: `log-error-${Date.now()}`,
          type: "error",
          message: "Failed to fetch logs",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [addNotification]);

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filterLevel === "ALL" || log.level === filterLevel;
    const matchesSearch =
      searchQuery === "" ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const exportLogs = () => {
    const csv = [
      ["Timestamp", "Level", "Source", "Message"].join(","),
      ...filteredLogs.map((log) =>
        [
          log.timestamp.toISOString(),
          log.level,
          log.source,
          `"${log.message.replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mission-logs-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    addNotification({
      id: `export-success-${Date.now()}`,
      type: "success",
      message: "Logs exported successfully",
    });
  };

  return (
    <Grid columns={1} gap={4}>
      <Card>
        <CardHeader>Activity Stream</CardHeader>
        <CardBody>
          {activityLog.length === 0 ? (
            <p className="text-gray-500">No activity recorded</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activityLog.slice(0, 10).map((entry) => (
                <Alert key={entry.id} type={entry.severity}>
                  <p className="text-xs font-mono">
                    {entry.timestamp.toLocaleTimeString()} - {entry.actor}
                  </p>
                  <p className="text-sm">{entry.action}</p>
                </Alert>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Mission Logs</CardHeader>
        <CardBody>
          <Flex gap={2} className="mb-4">
            <TextInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="flex-1"
            />
            <Select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as any)}
              options={[
                { label: "All", value: "ALL" },
                { label: "Error", value: "ERROR" },
                { label: "Warning", value: "WARNING" },
                { label: "Info", value: "INFO" },
              ]}
            />
            <Button onClick={exportLogs}>Export CSV</Button>
          </Flex>

          {filteredLogs.length === 0 ? (
            <p className="text-gray-500">No logs match the current filter</p>
          ) : (
            <DataTable
              columns={[
                { key: "timestamp", label: "Time" },
                { key: "level", label: "Level" },
                { key: "source", label: "Source" },
                { key: "message", label: "Message" },
              ]}
              data={filteredLogs.map((log) => ({
                timestamp: log.timestamp.toLocaleTimeString(),
                level: log.level,
                source: log.source,
                message: log.message.substring(0, 50),
              }))}
            />
          )}
        </CardBody>
      </Card>
    </Grid>
  );
}

export default MissionLogging;
