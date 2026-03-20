<script lang="ts">
  import type { Json } from '@workspace/shared/types/schema';

  const { graph }: { graph: Json } = $props();

  const NODE_WIDTH = 200;
  const NODE_HEADER_HEIGHT = 44;
  const PIN_HEIGHT = 24;
  const PIN_RADIUS = 5;
  const PADDING = 40;

  interface GraphPin {
    id: string;
    label: string;
  }

  interface GraphNode {
    id: string;
    label: string;
    ref?: string;
    category?: 'source' | 'transform' | 'sink' | 'param';
    integration?: string;
    position: { x: number; y: number };
    inputs?: GraphPin[];
    outputs?: GraphPin[];
  }

  interface GraphEdge {
    from: string;
    fromPin: string;
    to: string;
    toPin: string;
  }

  interface Graph {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
  }

  function nodeHeight(node: GraphNode): number {
    const inputCount = node.inputs?.length ?? 0;
    const outputCount = node.outputs?.length ?? 0;
    return NODE_HEADER_HEIGHT + Math.max(inputCount, outputCount, 1) * PIN_HEIGHT + 16;
  }

  function categoryColor(category: GraphNode['category']): string {
    switch (category) {
      case 'source':
        return 'var(--color-primary)';
      case 'transform':
        return 'oklch(80% 0.18 80)';
      case 'sink':
        return 'var(--color-destructive)';
      default:
        return 'color-mix(in oklch, var(--color-muted-foreground) 40%, transparent)';
    }
  }

  const parsedGraph = $derived.by((): Graph => {
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return {};
    return graph as Graph;
  });

  const nodes = $derived(parsedGraph.nodes ?? []);
  const edges = $derived(parsedGraph.edges ?? []);

  const nodeMap = $derived(new Map(nodes.map((n) => [n.id, n])));

  const viewBox = $derived.by(() => {
    if (nodes.length === 0) return '0 0 600 400';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position.y + nodeHeight(n));
    }
    const x = minX - PADDING;
    const y = minY - PADDING;
    const w = maxX - minX + PADDING * 2;
    const h = maxY - minY + PADDING * 2;
    return `${x} ${y} ${w} ${h}`;
  });

  function pinY(node: GraphNode, index: number): number {
    return node.position.y + NODE_HEADER_HEIGHT + (index + 0.5) * PIN_HEIGHT;
  }

  function edgePath(edge: GraphEdge): string {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) return '';

    const fromPinIdx = fromNode.outputs?.findIndex((p) => p.id === edge.fromPin) ?? 0;
    const toPinIdx = toNode.inputs?.findIndex((p) => p.id === edge.toPin) ?? 0;

    const sx = fromNode.position.x + NODE_WIDTH + PIN_RADIUS;
    const sy = pinY(fromNode, fromPinIdx);
    // Stop just before the target pin so the arrowhead tip lands on it
    const tx = toNode.position.x - PIN_RADIUS - 1;
    const ty = pinY(toNode, toPinIdx);
    const midX = (sx + tx) / 2;

    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
  }

  let panOffset = $state({ x: 0, y: 0 });
  let isPanning = $state(false);
  let lastMouse = $state({ x: 0, y: 0 });

  function onmousedown(e: MouseEvent) {
    isPanning = true;
    lastMouse = { x: e.clientX, y: e.clientY };
  }

  function onmousemove(e: MouseEvent) {
    if (!isPanning) return;
    panOffset = {
      x: panOffset.x + (e.clientX - lastMouse.x),
      y: panOffset.y + (e.clientY - lastMouse.y),
    };
    lastMouse = { x: e.clientX, y: e.clientY };
  }

  function onmouseup() {
    isPanning = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="size-full overflow-hidden relative bg-muted/20"
  class:cursor-grab={!isPanning}
  class:cursor-grabbing={isPanning}
  {onmousedown}
  {onmousemove}
  {onmouseup}
  onmouseleave={onmouseup}
>
  <svg
    width="100%"
    height="100%"
    {viewBox}
    preserveAspectRatio="xMidYMid meet"
    style="transform: translate({panOffset.x}px, {panOffset.y}px)"
  >
    <defs>
      <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="currentColor" opacity="0.12" />
      </pattern>
      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="currentColor" opacity="0.5" />
      </marker>
    </defs>

    <!-- Background dot grid -->
    <rect x="-9999" y="-9999" width="99999" height="99999" fill="url(#dot-grid)" />

    <!-- Edges (below nodes) -->
    {#each edges as edge}
      {@const path = edgePath(edge)}
      {#if path}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          opacity="0.5"
          marker-end="url(#arrowhead)"
        />
      {/if}
    {/each}

    <!-- Nodes -->
    {#each nodes as node}
      {@const h = nodeHeight(node)}
      {@const color = categoryColor(node.category)}
      <foreignObject x={node.position.x} y={node.position.y} width={NODE_WIDTH} height={h}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          class="rounded-lg border overflow-hidden h-full text-foreground text-xs"
          style="background: color-mix(in oklch, {color} 8%, var(--color-card)); border-color: color-mix(in oklch, {color} 40%, transparent);"
        >
          <!-- Header -->
          <div
            class="flex flex-col justify-center px-2 overflow-hidden"
            style="height: {NODE_HEADER_HEIGHT}px; background: color-mix(in oklch, {color} 15%, transparent); border-bottom: 1px solid color-mix(in oklch, {color} 30%, transparent);"
          >
            <span class="font-semibold truncate leading-tight">{node.label}</span>
            {#if node.ref}
              <span class="text-muted-foreground truncate leading-tight opacity-70">{node.ref}</span>
            {/if}
          </div>

          <!-- Pins -->
          <div class="flex flex-col">
            {#each Array(Math.max((node.inputs?.length ?? 0), (node.outputs?.length ?? 0), 1)) as _, i}
              <div class="flex justify-between items-center" style="height: {PIN_HEIGHT}px;">
                <span class="pl-3 text-muted-foreground truncate flex-1">
                  {node.inputs?.[i]?.label ?? ''}
                </span>
                <span class="pr-3 text-muted-foreground truncate flex-1 text-right">
                  {node.outputs?.[i]?.label ?? ''}
                </span>
              </div>
            {/each}
          </div>
        </div>
      </foreignObject>

      <!-- Input pin circles -->
      {#each node.inputs ?? [] as _pin, i}
        <circle
          cx={node.position.x}
          cy={pinY(node, i)}
          r={PIN_RADIUS}
          fill="var(--color-card)"
          stroke={color}
          stroke-width="2"
        />
      {/each}

      <!-- Output pin circles -->
      {#each node.outputs ?? [] as _pin, i}
        <circle
          cx={node.position.x + NODE_WIDTH}
          cy={pinY(node, i)}
          r={PIN_RADIUS}
          fill="var(--color-card)"
          stroke={color}
          stroke-width="2"
        />
      {/each}
    {/each}
  </svg>

  {#if nodes.length === 0}
    <div class="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
      No graph data available
    </div>
  {/if}
</div>
