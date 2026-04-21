/**
 * AI/ML-Powered Intelligence - Behavioral baselines, anomaly scoring, capacity planning
 * Capability 5: AI/ML Intelligence (6 hours)
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
  BarChart,
  LineChart,
  Metric,
} from "../../shared/components";
import { useAppStore } from "../../shared/store";

interface Anomaly {
  id: string;
  timestamp: Date;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  score: number;
  description: string;
}

interface CapacityForecast {
  metric: string;
  currentUsage: number;
  projectedPeak: number;
  daysUntilSaturation: number;
}

/**
 * AIIntelligence - ML-powered anomaly detection and capacity planning
 */
export function AIIntelligence() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [forecasts, setForecasts] = useState<CapacityForecast[]>([]);

  const { addNotification } = useAppStore();

  // Initialize with mock data (real implementation would use ML models)
  useEffect(() => {
    const mockAnomalies: Anomaly[] = [
      {
        id: "anom-1",
        timestamp: new Date(Date.now() - 3600000),
        type: "traffic_spike",
        severity: "medium",
        score: 0.72,
        description: "Unusual traffic spike on device-03",
      },
      {
        id: "anom-2",
        timestamp: new Date(Date.now() - 7200000),
        type: "latency_degradation",
        severity: "low",
        score: 0.45,
        description: "Gradual latency increase on link-01",
      },
    ];

    const mockForecasts: CapacityForecast[] = [
      { metric: "CPU", currentUsage: 65, projectedPeak: 92, daysUntilSaturation: 14 },
      { metric: "Memory", currentUsage: 78, projectedPeak: 95, daysUntilSaturation: 8 },
      { metric: "Bandwidth", currentUsage: 45, projectedPeak: 78, daysUntilSaturation: 21 },
    ];

    setAnomalies(mockAnomalies);
    setForecasts(mockForecasts);
  }, []);

  const anomalyData = anomalies.map((a) => ({
    label: a.type.replace(/_/g, " "),
    value: Math.round(a.score * 100),
  }));

  return (
    <Grid columns={2} gap={4}>
      <Card>
        <CardHeader>Detected Anomalies</CardHeader>
        <CardBody>
          {anomalies.length === 0 ? (
            <p className="text-green-600">No anomalies detected</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {anomalies.map((anom) => (
                <Alert key={anom.id} type={anom.severity}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{anom.type.replace(/_/g, " ")}</p>
                      <p className="text-xs mt-1">{anom.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {anom.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <Metric
                      label="Score"
                      value={`${Math.round(anom.score * 100)}%`}
                      size="sm"
                    />
                  </div>
                </Alert>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Capacity Planning</CardHeader>
        <CardBody>
          <div className="space-y-4">
            {forecasts.map((forecast) => (
              <div key={forecast.metric}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">{forecast.metric}</span>
                  <span className="text-xs text-gray-500">
                    {forecast.daysUntilSaturation}d until saturation
                  </span>
                </div>
                <div className="bg-gray-200 dark:bg-gray-700 rounded h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full"
                    style={{ width: `${Math.min(forecast.currentUsage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span>{forecast.currentUsage}% current</span>
                  <span>{forecast.projectedPeak}% projected peak</span>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="col-span-2">
        <CardHeader>Anomaly Scores</CardHeader>
        <CardBody>
          {anomalyData.length > 0 ? (
            <BarChart
              data={anomalyData}
              width={600}
              height={300}
              xLabel="Anomaly Type"
              yLabel="Score %"
            />
          ) : (
            <p>No anomaly data available</p>
          )}
        </CardBody>
      </Card>
    </Grid>
  );
}

export default AIIntelligence;
