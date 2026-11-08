import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import type { DependencyGraph } from "../lib/types";
import { cn } from "../lib/utils";

type KindData = { label: string; kind: string; meta?: string; status?: string };
type KindNode = Node<KindData, "kind">;

const KIND_STYLE: Record<string, { border: string; text: string; dot: string }> = {
  runtime: { border: "border-accent/60", text: "text-accent", dot: "bg-accent" },
  language: { border: "border-primary/60", text: "text-[#bfd6ff]", dot: "bg-primary" },
  framework: { border: "border-[#3f5faa]", text: "text-[#c7d7ff]", dot: "bg-[#6f8fe0]" },
  dependency: { border: "border-line-strong", text: "text-muted", dot: "bg-faint" },
  asset: { border: "border-warn/50", text: "text-warn", dot: "bg-warn" },
  blocker: { border: "border-danger/50", text: "text-danger", dot: "bg-danger" },
};

function KindNodeComponent({ data }: NodeProps<KindNode>) {
  const s = KIND_STYLE[data.kind] ?? KIND_STYLE.dependency;
  return (
    <div className={cn("min-w-[140px] max-w-[210px] rounded-lg border bg-panel px-3 py-2 shadow-lg", s.border)}>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
        <span className={cn("truncate font-heading text-xs font-semibold", s.text)}>{data.label}</span>
      </div>
      {data.meta && <div className="mt-0.5 truncate font-mono text-[10px] text-faint">{data.meta}</div>}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
    </div>
  );
}

const nodeTypes = { kind: KindNodeComponent };
const COLS: Record<string, number> = { runtime: 0, language: 1, framework: 2, dependency: 2, asset: 3, blocker: 3 };

export function RecoveryGraph({ graph }: { graph: DependencyGraph }) {
  const { nodes, edges } = useMemo(() => {
    const colCount: Record<number, number> = {};
    const rfNodes: KindNode[] = graph.nodes.map((n) => {
      const col = COLS[n.kind] ?? 2;
      const row = colCount[col] ?? 0;
      colCount[col] = row + 1;
      return {
        id: n.id,
        type: "kind",
        position: { x: col * 250, y: row * 94 },
        data: { label: n.label, kind: n.kind, meta: n.meta, status: n.status },
      };
    });
    const rfEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: true,
      style: { stroke: "#274a78", strokeWidth: 1.5 },
      labelStyle: { fill: "#8ca3c7", fontSize: 10 },
      labelBgStyle: { fill: "#0b1730" },
    }));
    return { nodes: rfNodes, edges: rfEdges };
  }, [graph]);

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-xl border border-line bg-inset">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        nodesConnectable={false}
        minZoom={0.3}
        maxZoom={1.6}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1b2f52" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
