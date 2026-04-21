import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Card, CardHeader, CardBody, Flex, Button, TextInput, Badge } from "../../shared/components";
import { useAppStore } from "../../shared/store";
import { rpcHandlers } from "../../shared/rpc-handlers";

interface TopologyNode {
  id: string;
  name: string;
  type: "device" | "router" | "gateway" | "sensor";
  status: "online" | "offline" | "warning";
  metrics: {
    cpu?: number;
    memory?: number;
    latency?: number;
  };
}

interface TopologyLink {
  source: string;
  target: string;
  bandwidth?: number;
  latency?: number;
  packetLoss?: number;
}

interface TopologyData {
  nodes: TopologyNode[];
  links: TopologyLink[];
  timestamp: number;
}

/**
 * TopologyViewer - D3-based force-directed network topology visualization
 * Real-time network topology with node details, filtering, and search
 */
export function TopologyViewer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<TopologyData>({ nodes: [], links: [], timestamp: 0 });
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "warning">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { addNotification, setRpcConnected } = useAppStore();

  // Fetch topology data
  useEffect(() => {
    const fetchTopology = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch real topology from backend
        const topology = await rpcHandlers.getMeshTopology();
        
        // Map backend topology to frontend format
        const mappedData: TopologyData = {
          nodes: topology.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type.toLowerCase() as any,
            status: node.status.toLowerCase() as any,
            metrics: {
              latency: node.lat || 0,
            },
          })),
          links: topology.links.map((link) => ({
            source: link.source,
            target: link.target,
            latency: link.latency,
            bandwidth: link.bandwidth,
            packetLoss: 0,
          })),
          timestamp: new Date(topology.generatedAt).getTime(),
        };

        setData(mappedData);
        setRpcConnected(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch topology";
        setError(message);
        setRpcConnected(false);
        addNotification({
          id: `topo-error-${Date.now()}`,
          type: "error",
          message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTopology();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchTopology, 5000);
    return () => clearInterval(interval);
  }, [addNotification, setRpcConnected]);

  // Render D3 visualization
  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const width = svgRef.current.parentElement?.clientWidth || 800;
    const height = svgRef.current.parentElement?.clientHeight || 600;

    // Filter nodes/links
    const filteredNodes = data.nodes.filter(
      (node) =>
        (filter === "all" || node.status === filter) &&
        node.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = data.links.filter(
      (link) => filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
    );

    // D3 simulation
    const simulation = d3
      .forceSimulation(filteredNodes as any)
      .force("link", d3.forceLink(filteredLinks as any).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(30));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Draw links
    const links = g
      .append("g")
      .selectAll("line")
      .data(filteredLinks)
      .join("line")
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", (d: any) => Math.max(1, (d.bandwidth || 100) / 200))
      .attr("class", "text-muted-foreground");

    // Draw nodes
    const nodes = g
      .append("g")
      .selectAll("circle")
      .data(filteredNodes)
      .join("circle")
      .attr("r", 25)
      .attr("fill", (d: any) => {
        switch (d.status) {
          case "online":
            return "#10b981";
          case "offline":
            return "#ef4444";
          case "warning":
            return "#f59e0b";
          default:
            return "#3b82f6";
        }
      })
      .attr("cursor", "pointer")
      .on("click", (_e, d: any) => setSelectedNode(d))
      .call(drag(simulation));

    // Labels
    const labels = g
      .append("g")
      .selectAll("text")
      .data(filteredNodes)
      .join("text")
      .text((d: any) => d.name.substring(0, 8))
      .attr("text-anchor", "middle")
      .attr("dy", ".3em")
      .attr("font-size", 12)
      .attr("fill", "white")
      .attr("pointer-events", "none");

    // Update positions on simulation tick
    simulation.on("tick", () => {
      links
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      nodes.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);

      labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });

    // Zoom
    const zoom = d3.zoom().on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoom as any);

    return () => simulation.stop();
  }, [data, filter, searchTerm]);

  // Drag functionality
  function drag(simulation: d3.Simulation<TopologyNode, undefined>) {
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  const statusColors: Record<string, string> = {
    online: "success",
    offline: "error",
    warning: "warning",
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Controls */}
      <Card>
        <CardBody>
          <Flex justify="between" align="center" wrap>
            <TextInput
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-64"
            />
            <Flex gap="md">
              {["all", "online", "offline", "warning"].map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? "primary" : "ghost"}
                  onClick={() => setFilter(status as typeof filter)}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </Flex>
          </Flex>
        </CardBody>
      </Card>

      {/* Main visualization */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Graph */}
        <Card className="flex-1 flex flex-col">
          <CardHeader className="text-lg font-semibold">Network Topology</CardHeader>
          <CardBody className="flex-1 p-0">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading topology...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-600">
                {error}
              </div>
            ) : (
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                style={{ minHeight: "400px", cursor: "grab" }}
              />
            )}
          </CardBody>
        </Card>

        {/* Details Panel */}
        {selectedNode && (
          <Card className="w-80">
            <CardHeader className="flex justify-between items-center">
              <span className="font-semibold">{selectedNode.name}</span>
              <Button
                variant="ghost"
                onClick={() => setSelectedNode(null)}
                className="px-2 py-1"
              >
                ✕
              </Button>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* Type and Status */}
              <div>
                <span className="text-xs text-muted-foreground">Type</span>
                <Badge variant={statusColors[selectedNode.status] as any} className="capitalize mt-1">
                  {selectedNode.type}
                </Badge>
              </div>

              {/* Status */}
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant={statusColors[selectedNode.status] as any} className="capitalize mt-1">
                  {selectedNode.status}
                </Badge>
              </div>

              {/* Metrics */}
              <div>
                <span className="text-xs text-muted-foreground block mb-2">Metrics</span>
                <div className="space-y-2">
                  {selectedNode.metrics.cpu !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span>CPU</span>
                      <span>{selectedNode.metrics.cpu}%</span>
                    </div>
                  )}
                  {selectedNode.metrics.memory !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span>Memory</span>
                      <span>{selectedNode.metrics.memory}%</span>
                    </div>
                  )}
                  {selectedNode.metrics.latency !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span>Latency</span>
                      <span>{selectedNode.metrics.latency}ms</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="primary" size="sm" className="flex-1">
                  Details
                </Button>
                <Button variant="secondary" size="sm" className="flex-1">
                  Logs
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
