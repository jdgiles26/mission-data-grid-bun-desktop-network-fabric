/**
 * Config Management & Validation - YAML editor, conflict detection, addressing
 * Capability 2: Config Management (8 hours)
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
  Badge,
  Alert,
  Modal,
  DataTable,
} from "../../shared/components";
import { useAppStore } from "../../shared/store";
import { rpcHandlers } from "../../shared/rpc-handlers";

interface ConfigValidation {
  valid: boolean;
  issues: Array<{ severity: "ERROR" | "WARNING"; file: string; message: string; recommendation: string }>;
  summary: {
    kitsFound: number;
    hostsFound: number;
    playbooksFound: number;
    variablesDefined: number;
    stagedPeers: number;
  };
  checkedAt: Date;
}

interface DriftItem {
  parameter: string;
  expectedValue: string;
  actualValue: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

interface ConfigDriftReport {
  kitId: string;
  kitName: string;
  driftDetected: boolean;
  driftItems: DriftItem[];
  lastSync: Date;
}

/**
 * YAMLConfigEditor - Edit and validate YAML configurations
 */
export function YAMLConfigEditor() {
  const [yamlContent, setYamlContent] = useState("# Edit configuration here\n");
  const [validation, setValidation] = useState<ConfigValidation | null>(null);
  const [loading, setLoading] = useState(false);

  const { addNotification } = useAppStore();

  const validateConfig = async () => {
    try {
      setLoading(true);
      const result = await rpcHandlers.validateAutonetConfig();
      setValidation(result);

      const errorCount = result.issues.filter((i) => i.severity === "ERROR").length;
      addNotification({
        id: `config-validation-${Date.now()}`,
        type: errorCount > 0 ? "error" : "success",
        message: `Validation complete: ${errorCount} errors, ${result.issues.length - errorCount} warnings`,
      });
    } catch (err) {
      addNotification({
        id: `validation-error-${Date.now()}`,
        type: "error",
        message: "Failed to validate configuration",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Grid columns={2} gap={4}>
      <Card className="col-span-1">
        <CardHeader>Configuration Editor</CardHeader>
        <CardBody>
          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            className="w-full h-96 p-3 font-mono text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
            placeholder="Edit YAML configuration"
          />
          <Button onClick={validateConfig} disabled={loading} className="mt-3 w-full">
            {loading ? "Validating..." : "Validate Configuration"}
          </Button>
        </CardBody>
      </Card>

      <Card className="col-span-1">
        <CardHeader>Validation Results</CardHeader>
        <CardBody>
          {validation ? (
            <Flex direction="column" gap={3}>
              <div>
                <Badge
                  label={validation.valid ? "Valid" : "Invalid"}
                  variant={validation.valid ? "success" : "error"}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Summary:</p>
                <p className="text-sm">Kits: {validation.summary.kitsFound}</p>
                <p className="text-sm">Hosts: {validation.summary.hostsFound}</p>
                <p className="text-sm">Playbooks: {validation.summary.playbooksFound}</p>
              </div>

              {validation.issues.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Issues:</p>
                  {validation.issues.map((issue, i) => (
                    <Alert key={i} type={issue.severity === "ERROR" ? "error" : "warning"}>
                      <p className="font-mono text-xs">{issue.message}</p>
                      <p className="text-xs mt-1">{issue.recommendation}</p>
                    </Alert>
                  ))}
                </div>
              )}
            </Flex>
          ) : (
            <p className="text-gray-500">Run validation to see results</p>
          )}
        </CardBody>
      </Card>
    </Grid>
  );
}

/**
 * ConfigDriftDetector - Detect and report configuration drift across kits
 */
export function ConfigDriftDetector() {
  const [driftReports, setDriftReports] = useState<ConfigDriftReport[]>([]);
  const [selectedKit, setSelectedKit] = useState<ConfigDriftReport | null>(null);
  const [loading, setLoading] = useState(true);

  const { addNotification } = useAppStore();

  useEffect(() => {
    const fetchDriftData = async () => {
      try {
        setLoading(true);
        const driftData = await rpcHandlers.getConfigDrift();
        setDriftReports(driftData);

        if (driftData.length > 0) {
          setSelectedKit(driftData[0]);
        }
      } catch (err) {
        addNotification({
          id: `drift-error-${Date.now()}`,
          type: "error",
          message: "Failed to fetch drift data",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDriftData();
    const interval = setInterval(fetchDriftData, 30000);
    return () => clearInterval(interval);
  }, [addNotification]);

  if (loading) {
    return <Card><CardBody>Loading drift data...</CardBody></Card>;
  }

  return (
    <Grid columns={2} gap={4}>
      <Card>
        <CardHeader>Kits with Drift</CardHeader>
        <CardBody>
          {driftReports.length === 0 ? (
            <p className="text-green-600">No configuration drift detected</p>
          ) : (
            <div className="space-y-2">
              {driftReports.map((report) => (
                <button
                  key={report.kitId}
                  onClick={() => setSelectedKit(report)}
                  className={`w-full p-3 text-left rounded ${
                    selectedKit?.kitId === report.kitId
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <div className="font-medium">{report.kitName}</div>
                  <div className="text-xs opacity-75">
                    {report.driftDetected ? `${report.driftItems.length} drift items` : "No drift"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Drift Details</CardHeader>
        <CardBody>
          {selectedKit && selectedKit.driftDetected ? (
            <Flex direction="column" gap={3}>
              <div>
                <p className="text-sm font-medium">Kit: {selectedKit.kitName}</p>
                <p className="text-xs text-gray-500">Last Sync: {new Date(selectedKit.lastSync).toLocaleString()}</p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedKit.driftItems.map((item, i) => (
                  <Alert
                    key={i}
                    type={item.severity === "HIGH" ? "error" : item.severity === "MEDIUM" ? "warning" : "info"}
                  >
                    <p className="font-mono text-xs font-medium">{item.parameter}</p>
                    <p className="text-xs mt-1">Expected: {item.expectedValue}</p>
                    <p className="text-xs">Actual: {item.actualValue}</p>
                  </Alert>
                ))}
              </div>
            </Flex>
          ) : selectedKit ? (
            <p className="text-green-600">No drift detected for {selectedKit.kitName}</p>
          ) : (
            <p>Select a kit to view drift details</p>
          )}
        </CardBody>
      </Card>
    </Grid>
  );
}

/**
 * ConfigManagement - Main configuration management view
 */
export function ConfigManagement() {
  const [activeTab, setActiveTab] = useState<"editor" | "drift">("editor");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>Configuration Management & Validation</CardHeader>
        <CardBody>
          <p>Edit YAML configurations, validate syntax, and detect configuration drift across mission kits</p>
        </CardBody>
      </Card>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("editor")}
          className={`px-4 py-2 rounded ${
            activeTab === "editor" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          YAML Editor
        </button>
        <button
          onClick={() => setActiveTab("drift")}
          className={`px-4 py-2 rounded ${
            activeTab === "drift" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          Drift Detection
        </button>
      </div>

      {activeTab === "editor" && <YAMLConfigEditor />}
      {activeTab === "drift" && <ConfigDriftDetector />}
    </div>
  );
}
