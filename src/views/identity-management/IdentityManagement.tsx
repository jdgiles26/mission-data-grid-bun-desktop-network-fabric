/**
 * Identity & Zero-Trust Management - Identity UI, policy visualization, posture scoring
 * Capability 3: Identity Management (6 hours)
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
  DataTable,
  ProgressBar,
} from "../../shared/components";
import { useAppStore } from "../../shared/store";
import { rpcHandlers } from "../../shared/rpc-handlers";

interface ZitiIdentity {
  identityId: string;
  name: string;
  type: string;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  lastAuth: Date;
  posture: { status: string; score: number };
}

interface PolicyRule {
  id: string;
  source: string;
  destination: string;
  action: "ALLOW" | "DENY";
  priority: number;
}

/**
 * IdentityManagement - Manage Ziti identities and zero-trust policies
 */
export function IdentityManagement() {
  const [identities, setIdentities] = useState<ZitiIdentity[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<ZitiIdentity | null>(null);
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);

  const { addNotification } = useAppStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const idData = await rpcHandlers.getZitiIdentities();
        setIdentities(idData);

        if (idData.length > 0) {
          setSelectedIdentity(idData[0]);
        }

        // Mock policies for now
        setPolicies([
          { id: "p1", source: "device-01", destination: "api-server", action: "ALLOW", priority: 100 },
          { id: "p2", source: "device-02", destination: "db-server", action: "ALLOW", priority: 101 },
          { id: "p3", source: "external", destination: "*", action: "DENY", priority: 1 },
        ]);
      } catch (err) {
        addNotification({
          id: `identity-error-${Date.now()}`,
          type: "error",
          message: "Failed to fetch identities",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [addNotification]);

  return (
    <Grid columns={3} gap={4}>
      <Card>
        <CardHeader>Identities</CardHeader>
        <CardBody>
          {identities.length === 0 ? (
            <p>No identities found</p>
          ) : (
            <div className="space-y-2">
              {identities.map((id) => (
                <button
                  key={id.identityId}
                  onClick={() => setSelectedIdentity(id)}
                  className={`w-full p-2 text-left text-xs rounded ${
                    selectedIdentity?.identityId === id.identityId
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <div className="font-medium">{id.name}</div>
                  <Badge label={id.status} />
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Identity Details</CardHeader>
        <CardBody>
          {selectedIdentity ? (
            <Flex direction="column" gap={2}>
              <div>
                <label className="text-xs font-medium">Name</label>
                <p className="text-sm">{selectedIdentity.name}</p>
              </div>
              <div>
                <label className="text-xs font-medium">Status</label>
                <Badge label={selectedIdentity.status} />
              </div>
              <div>
                <label className="text-xs font-medium">Posture Score</label>
                <ProgressBar value={selectedIdentity.posture.score} max={100} />
                <p className="text-xs mt-1">{selectedIdentity.posture.status}</p>
              </div>
              <div>
                <label className="text-xs font-medium">Last Auth</label>
                <p className="text-xs">{new Date(selectedIdentity.lastAuth).toLocaleString()}</p>
              </div>
            </Flex>
          ) : (
            <p>Select an identity</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Access Policies</CardHeader>
        <CardBody>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {policies.map((p) => (
              <div key={p.id} className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                <p>
                  <span className="font-mono">{p.source}</span>
                  <span className="mx-2">→</span>
                  <span className="font-mono">{p.destination}</span>
                </p>
                <Badge label={p.action} variant={p.action === "ALLOW" ? "success" : "error"} />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </Grid>
  );
}

export default IdentityManagement;
