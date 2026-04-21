/**
 * Predictive Failure Analytics Engine
 * 
 * Forecasts network failures, anomalies, and SLA impacts using time-series analysis.
 * Implements ARIMA-like forecasting, anomaly pattern recognition, and failure probability scoring.
 */

import type SQLiteDatabase from "bun:sqlite";
import { randomUUID } from "crypto";

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
}

export interface Prediction {
  id: string;
  kitId: string;
  failureType: string;
  forecastedTime: Date;
  confidenceScore: number; // 0-1
  failureProbability: number; // 0-100
  slaImpactHours?: number;
  contributingFactors: string[];
  recommendation?: string;
}

export interface AnomalyPattern {
  id: string;
  kitId: string;
  metricName: string;
  actualValue: number;
  expectedValue: number;
  deviationPercent: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detectedAt: Date;
}

export interface Forecast {
  id: string;
  kitId: string;
  metricName: string;
  forecastPeriod: string;
  forecastedValues: number[];
  confidenceLower: number[];
  confidenceUpper: number[];
  modelType: string;
}

export class PredictiveAnalytics {
  private db: SQLiteDatabase;
  private readonly ANOMALY_THRESHOLD = 2.5; // Standard deviations
  private readonly FORECAST_WINDOW = 24; // hours
  private readonly RETENTION_DAYS = 90;

  constructor(database: SQLiteDatabase) {
    this.db = database;
  }

  /**
   * Analyze time-series data and detect anomalies
   */
  async detectAnomalies(
    kitId: string,
    metricName: string,
    dataPoints: TimeSeriesDataPoint[],
  ): Promise<AnomalyPattern[]> {
    if (dataPoints.length < 10) {
      console.warn("Insufficient data for anomaly detection");
      return [];
    }

    const values = dataPoints.map((d) => d.value);

    // Calculate statistics
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    // Detect anomalies
    const anomalies: AnomalyPattern[] = [];
    const recentWindow = dataPoints.slice(-10); // Last 10 points

    for (const point of recentWindow) {
      const zscore = Math.abs((point.value - mean) / (stdDev || 1));

      if (zscore > this.ANOMALY_THRESHOLD) {
        const deviationPercent = ((point.value - mean) / (mean || 1)) * 100;
        const severity = this.calculateSeverity(zscore);

        const anomaly: AnomalyPattern = {
          id: randomUUID(),
          kitId,
          metricName,
          actualValue: point.value,
          expectedValue: mean,
          deviationPercent,
          severity,
          detectedAt: point.timestamp,
        };

        anomalies.push(anomaly);
        this.storeAnomaly(anomaly);
      }
    }

    return anomalies;
  }

  /**
   * Forecast future values using exponential smoothing + trend
   */
  async forecastMetric(
    kitId: string,
    metricName: string,
    dataPoints: TimeSeriesDataPoint[],
    hoursAhead: number = this.FORECAST_WINDOW,
  ): Promise<Forecast> {
    if (dataPoints.length < 5) {
      throw new Error("Insufficient data for forecasting");
    }

    const values = dataPoints.map((d) => d.value);

    // Simple exponential smoothing with trend (Holt's method)
    const alpha = 0.3; // Level smoothing
    const beta = 0.1; // Trend smoothing

    // Initialize
    let level = values[0];
    let trend = (values[1] - values[0]) / 1;

    // Smooth the series
    for (let i = 1; i < values.length; i++) {
      const prevLevel = level;
      level = alpha * values[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    // Generate forecasts
    const forecasted: number[] = [];
    const lowerBound: number[] = [];
    const upperBound: number[] = [];

    const stdDev =
      Math.sqrt(
        values.reduce((sum, val) => sum + Math.pow(val - level, 2), 0) /
          values.length,
      ) || 1;

    for (let h = 1; h <= hoursAhead; h++) {
      const forecast = level + h * trend;
      forecasted.push(Math.max(0, forecast)); // Prevent negative values
      lowerBound.push(Math.max(0, forecast - 2 * stdDev * Math.sqrt(h)));
      upperBound.push(forecast + 2 * stdDev * Math.sqrt(h));
    }

    const result: Forecast = {
      id: randomUUID(),
      kitId,
      metricName,
      forecastPeriod: `${hoursAhead}h`,
      forecastedValues: forecasted,
      confidenceLower: lowerBound,
      confidenceUpper: upperBound,
      modelType: "exponential-smoothing-holt",
    };

    this.storeForecast(result);
    return result;
  }

  /**
   * Predict probability of failure based on patterns
   */
  async predictFailureRisk(
    kitId: string,
    metricName: string,
    currentValue: number,
    historicalData: TimeSeriesDataPoint[],
  ): Promise<Prediction> {
    // Calculate risk factors
    const anomalies = await this.detectAnomalies(kitId, metricName, historicalData);
    const recentAnomaly = anomalies.length > 0 ? anomalies[anomalies.length - 1] : null;

    let riskScore = 0;
    const contributingFactors: string[] = [];

    // Factor 1: Recent anomaly
    if (recentAnomaly) {
      riskScore += recentAnomaly.severity === "CRITICAL" ? 40 : 20;
      contributingFactors.push(`Recent ${recentAnomaly.severity} anomaly detected`);
    }

    // Factor 2: Trend analysis
    if (historicalData.length >= 2) {
      const recent = historicalData.slice(-5);
      const recentTrend = recent[recent.length - 1].value - recent[0].value;
      const thresholdIncrease = recentTrend > 30; // Arbitrary threshold

      if (thresholdIncrease) {
        riskScore += 25;
        contributingFactors.push("Rapidly increasing trend");
      }
    }

    // Factor 3: Historical volatility
    const values = historicalData.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const cv = Math.sqrt(variance) / (mean || 1); // Coefficient of variation

    if (cv > 0.5) {
      riskScore += 15;
      contributingFactors.push("High historical volatility");
    }

    const failureProbability = Math.min(100, riskScore);
    const confidenceScore = Math.min(1, anomalies.length / 5); // Confidence based on data

    const prediction: Prediction = {
      id: randomUUID(),
      kitId,
      failureType: metricName,
      forecastedTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next 24h
      confidenceScore,
      failureProbability,
      slaImpactHours: failureProbability > 50 ? 4 : undefined,
      contributingFactors,
      recommendation: this.getRecommendation(failureProbability),
    };

    this.storePrediction(prediction);
    return prediction;
  }

  /**
   * Get multiple anomaly patterns from recent data
   */
  async getAnomalyPatterns(kitId: string, hoursBack: number = 24): Promise<AnomalyPattern[]> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    try {
      const rows = this.db
        .prepare(
          `
          SELECT id, kit_id, metric_name, actual_value, expected_value, 
                 deviation_percent, severity, detected_at
          FROM anomalies
          WHERE kit_id = ? AND datetime(detected_at) >= datetime(?)
          ORDER BY detected_at DESC
          LIMIT 1000
        `,
        )
        .all(kitId, cutoffTime.toISOString()) as Array<{
        id: string;
        kit_id: string;
        metric_name: string;
        actual_value: number;
        expected_value: number;
        deviation_percent: number;
        severity: string;
        detected_at: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        kitId: row.kit_id,
        metricName: row.metric_name,
        actualValue: row.actual_value,
        expectedValue: row.expected_value,
        deviationPercent: row.deviation_percent,
        severity: row.severity as AnomalyPattern["severity"],
        detectedAt: new Date(row.detected_at),
      }));
    } catch (error) {
      console.error("Error retrieving anomaly patterns:", error);
      return [];
    }
  }

  /**
   * Store prediction to database
   */
  private storePrediction(prediction: Prediction): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO predictions (
            id, timestamp, kit_id, failure_type, predicted_at, 
            forecasted_time, confidence_score, failure_probability, 
            sla_impact_hours, contributing_factors, recommendation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          prediction.id,
          new Date().toISOString(),
          prediction.kitId,
          prediction.failureType,
          new Date().toISOString(),
          prediction.forecastedTime.toISOString(),
          prediction.confidenceScore,
          prediction.failureProbability,
          prediction.slaImpactHours || null,
          JSON.stringify(prediction.contributingFactors),
          prediction.recommendation || null,
        );
    } catch (error) {
      console.error("Error storing prediction:", error);
    }
  }

  /**
   * Store anomaly to database
   */
  private storeAnomaly(anomaly: AnomalyPattern): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO anomalies (
            id, timestamp, kit_id, metric_name, actual_value, 
            expected_value, deviation_percent, severity, detected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          anomaly.id,
          new Date().toISOString(),
          anomaly.kitId,
          anomaly.metricName,
          anomaly.actualValue,
          anomaly.expectedValue,
          anomaly.deviationPercent,
          anomaly.severity,
          anomaly.detectedAt.toISOString(),
        );
    } catch (error) {
      console.error("Error storing anomaly:", error);
    }
  }

  /**
   * Store forecast to database
   */
  private storeForecast(forecast: Forecast): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO forecasts (
            id, kit_id, metric_name, forecast_period, timestamp,
            forecasted_values, confidence_lower, confidence_upper, model_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          forecast.id,
          forecast.kitId,
          forecast.metricName,
          forecast.forecastPeriod,
          new Date().toISOString(),
          JSON.stringify(forecast.forecastedValues),
          JSON.stringify(forecast.confidenceLower),
          JSON.stringify(forecast.confidenceUpper),
          forecast.modelType,
        );
    } catch (error) {
      console.error("Error storing forecast:", error);
    }
  }

  /**
   * Cleanup old records to maintain database performance
   */
  async cleanupOldData(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      this.db
        .prepare("DELETE FROM predictions WHERE datetime(predicted_at) < datetime(?)")
        .run(cutoffDate.toISOString());

      this.db
        .prepare("DELETE FROM anomalies WHERE datetime(detected_at) < datetime(?)")
        .run(cutoffDate.toISOString());

      this.db
        .prepare("DELETE FROM forecasts WHERE datetime(timestamp) < datetime(?)")
        .run(cutoffDate.toISOString());
    } catch (error) {
      console.error("Error cleaning up old data:", error);
    }
  }

  /**
   * Helper: Calculate severity based on z-score
   */
  private calculateSeverity(zscore: number): AnomalyPattern["severity"] {
    if (zscore > 4) return "CRITICAL";
    if (zscore > 3) return "HIGH";
    if (zscore > 2.7) return "MEDIUM";
    return "LOW";
  }

  /**
   * Helper: Generate actionable recommendation
   */
  private getRecommendation(failureProbability: number): string {
    if (failureProbability > 80) {
      return "URGENT: Initiate preventive maintenance immediately. Check recent system changes.";
    }
    if (failureProbability > 60) {
      return "HIGH: Schedule maintenance within next 12 hours. Prepare rollback procedures.";
    }
    if (failureProbability > 40) {
      return "MEDIUM: Monitor closely. Be prepared to escalate if metrics worsen.";
    }
    return "LOW: Continue normal monitoring. No immediate action required.";
  }
}

export function createPredictiveAnalytics(database: SQLiteDatabase): PredictiveAnalytics {
  return new PredictiveAnalytics(database);
}
