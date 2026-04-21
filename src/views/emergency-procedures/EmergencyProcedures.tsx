/**
 * Emergency Procedures & Failover - Runbook library, one-click failover
 * Capability 6: Emergency Procedures (4 hours)
 */

import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Grid,
  Flex,
  Button,
  Badge,
  Alert,
  Modal,
  DataTable,
} from "../../shared/components";
import { useAppStore } from "../../shared/store";
import { rpcHandlers } from "../../shared/rpc-handlers";

interface Procedure {
  id: string;
  name: string;
  description: string;
  severity: "LOW" | "HIGH" | "CRITICAL";
  estimatedDuration: number;
  applicableToKits: string[];
}

interface ProcedureExecution {
  id: string;
  procedureId: string;
  status: "pending" | "running" | "success" | "failed";
  startTime: Date;
  endTime?: Date;
  output: string;
  targetKit?: string;
}

/**
 * EmergencyProcedures - Execute emergency failover and recovery procedures
 */
export function EmergencyProcedures() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [executions, setExecutions] = useState<ProcedureExecution[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [targetKit, setTargetKit] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const { addNotification } = useAppStore();

  // Fetch procedures
  useEffect(() => {
    const fetchProcedures = async () => {
      try {
        setLoading(true);
        const procedures = await rpcHandlers.getEmergencyProcedures();
        setProcedures(procedures);

        if (procedures.length > 0) {
          setSelectedProcedure(procedures[0]);
        }
      } catch (err) {
        addNotification({
          id: `proc-error-${Date.now()}`,
          type: "error",
          message: "Failed to fetch procedures",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProcedures();
  }, [addNotification]);

  const executeProcedure = async () => {
    if (!selectedProcedure) return;

    try {
      const result = await rpcHandlers.runEmergencyProcedure({
        procedureId: selectedProcedure.id,
        targetKit,
      });

      const execution: ProcedureExecution = {
        id: `exec-${Date.now()}`,
        procedureId: selectedProcedure.id,
        status: result.success ? "success" : "failed",
        startTime: new Date(),
        endTime: new Date(),
        output: result.output || "",
        targetKit,
      };

      setExecutions((prev) => [execution, ...prev]);
      addNotification({
        id: `exec-${Date.now()}`,
        type: result.success ? "success" : "error",
        message: `Procedure ${result.success ? "executed" : "failed"}`,
      });

      setShowConfirm(false);
    } catch (err) {
      addNotification({
        id: `exec-error-${Date.now()}`,
        type: "error",
        message: "Failed to execute procedure",
      });
    }
  };

  if (loading) {
    return <Card><CardBody>Loading procedures...</CardBody></Card>;
  }

  return (
    <Grid columns={2} gap={4}>
      <Card>
        <CardHeader>Available Procedures</CardHeader>
        <CardBody>
          {procedures.length === 0 ? (
            <p>No procedures available</p>
          ) : (
            <div className="space-y-2">
              {procedures.map((proc) => (
                <button
                  key={proc.id}
                  onClick={() => setSelectedProcedure(proc)}
                  className={`w-full p-3 text-left rounded ${
                    selectedProcedure?.id === proc.id
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <div className="font-medium text-sm">{proc.name}</div>
                  <Badge
                    label={proc.severity}
                    variant={proc.severity === "CRITICAL" ? "error" : "warning"}
                  />
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Procedure Details</CardHeader>
        <CardBody>
          {selectedProcedure ? (
            <Flex direction="column" gap={3}>
              <div>
                <label className="text-sm font-medium">Name</label>
                <p>{selectedProcedure.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <p className="text-sm">{selectedProcedure.description}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Duration</label>
                <p>{selectedProcedure.estimatedDuration}m</p>
              </div>
              <Button
                onClick={() => setShowConfirm(true)}
                variant="danger"
                className="w-full"
              >
                Execute Procedure
              </Button>
            </Flex>
          ) : (
            <p>Select a procedure</p>
          )}
        </CardBody>
      </Card>

      <Card className="col-span-2">
        <CardHeader>Execution History</CardHeader>
        <CardBody>
          {executions.length === 0 ? (
            <p>No executions yet</p>
          ) : (
            <DataTable
              columns={[
                { key: "procedureId", label: "Procedure" },
                { key: "status", label: "Status" },
                { key: "startTime", label: "Started" },
                { key: "targetKit", label: "Target" },
              ]}
              data={executions.map((e) => ({
                procedureId: e.procedureId.slice(0, 12),
                status: e.status,
                startTime: e.startTime.toLocaleTimeString(),
                targetKit: e.targetKit || "All",
              }))}
            />
          )}
        </CardBody>
      </Card>

      {showConfirm && selectedProcedure && (
        <Modal
          title="Confirm Emergency Procedure"
          onClose={() => setShowConfirm(false)}
          actions={[
            { label: "Cancel", onClick: () => setShowConfirm(false) },
            { label: "Execute", onClick: executeProcedure, variant: "danger" },
          ]}
        >
          <Alert type="error">
            <p className="font-medium">This action cannot be undone!</p>
            <p className="text-sm mt-2">You are about to execute: {selectedProcedure.name}</p>
            <p className="text-sm">Estimated duration: {selectedProcedure.estimatedDuration}m</p>
          </Alert>
        </Modal>
      )}
    </Grid>
  );
}

export default EmergencyProcedures;
