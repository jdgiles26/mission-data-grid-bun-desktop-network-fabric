/**
 * Coalition Data Fabric - Schema mapping, cross-kit aggregation
 * Capability 7: Coalition Data Fabric (2 hours)
 */

import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Grid,
  Flex,
  Badge,
  Alert,
  DataTable,
} from "../../shared/components";
import { useAppStore } from "../../shared/store";

interface CoalitionSchema {
  source: string;
  target: string;
  mapping: Record<string, string>;
  active: boolean;
}

interface AggregatedData {
  id: string;
  topic: string;
  sources: string[];
  dataPoints: number;
  lastUpdated: Date;
  status: "synced" | "pending" | "error";
}

/**
 * CoalitionDataFabric - Manage cross-kit data integration and schema mapping
 */
export function CoalitionDataFabric() {
  const [schemas, setSchemas] = useState<CoalitionSchema[]>([]);
  const [aggregated, setAggregated] = useState<AggregatedData[]>([]);

  const { addNotification } = useAppStore();

  // Initialize with mock coalition data
  useEffect(() => {
    const mockSchemas: CoalitionSchema[] = [
      {
        source: "kit-01",
        target: "kit-02",
        mapping: {
          "status": "health_status",
          "metrics.cpu": "system.cpu_usage",
          "metrics.memory": "system.memory_usage",
        },
        active: true,
      },
      {
        source: "kit-02",
        target: "kit-03",
        mapping: {
          "topology.nodes": "network.nodes",
          "topology.links": "network.links",
        },
        active: true,
      },
    ];

    const mockAggregated: AggregatedData[] = [
      {
        id: "agg-1",
        topic: "Network Topology",
        sources: ["kit-01", "kit-02", "kit-03"],
        dataPoints: 45,
        lastUpdated: new Date(Date.now() - 60000),
        status: "synced",
      },
      {
        id: "agg-2",
        topic: "Security Events",
        sources: ["kit-01", "kit-03"],
        dataPoints: 128,
        lastUpdated: new Date(Date.now() - 300000),
        status: "pending",
      },
      {
        id: "agg-3",
        topic: "Performance Metrics",
        sources: ["kit-01", "kit-02", "kit-03"],
        dataPoints: 300,
        lastUpdated: new Date(),
        status: "synced",
      },
    ];

    setSchemas(mockSchemas);
    setAggregated(mockAggregated);
  }, []);

  return (
    <Grid columns={2} gap={4}>
      <Card>
        <CardHeader>Schema Mappings</CardHeader>
        <CardBody>
          {schemas.length === 0 ? (
            <p className="text-gray-500">No schema mappings configured</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {schemas.map((schema, i) => (
                <div key={i} className="p-3 bg-gray-100 dark:bg-gray-800 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">
                      {schema.source} → {schema.target}
                    </p>
                    <Badge label={schema.active ? "Active" : "Inactive"} />
                  </div>
                  <div className="text-xs space-y-1 max-h-24 overflow-y-auto">
                    {Object.entries(schema.mapping).map(([src, tgt]) => (
                      <p key={src} className="font-mono text-gray-600 dark:text-gray-400">
                        <span className="text-blue-600">{src}</span> → <span className="text-green-600">{tgt}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Aggregated Data Topics</CardHeader>
        <CardBody>
          {aggregated.length === 0 ? (
            <p className="text-gray-500">No aggregated data available</p>
          ) : (
            <div className="space-y-3">
              {aggregated.map((agg) => (
                <div key={agg.id} className="p-3 border rounded dark:border-gray-700">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium text-sm">{agg.topic}</p>
                    <Badge
                      label={agg.status}
                      variant={agg.status === "synced" ? "success" : agg.status === "pending" ? "warning" : "error"}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    {agg.dataPoints} data points from {agg.sources.length} sources
                  </p>
                  <p className="text-xs text-gray-500">
                    Last updated: {agg.lastUpdated.toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="col-span-2">
        <CardHeader>Coalition Network</CardHeader>
        <CardBody>
          <Alert type="info">
            <p className="text-sm">
              {schemas.length} active schema mappings connecting {new Set(schemas.flatMap((s) => [s.source, s.target])).size} kits
            </p>
          </Alert>
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded">
            <p className="text-xs text-gray-500 mb-3">Active Coalition Connections:</p>
            <div className="space-y-2">
              {schemas.map((schema, i) => (
                <div key={i} className="text-xs font-mono flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-200 dark:bg-blue-900 rounded">{schema.source}</span>
                  <span>↔</span>
                  <span className="px-2 py-1 bg-green-200 dark:bg-green-900 rounded">{schema.target}</span>
                  <span className="ml-auto text-gray-500">{Object.keys(schema.mapping).length} mappings</span>
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    </Grid>
  );
}

export default CoalitionDataFabric;
