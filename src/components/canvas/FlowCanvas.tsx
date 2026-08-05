/**
 * The workflow canvas. Hosts React Flow with our custom nodes/edges, the
 * frosted-grid background, minimap, controls, right-click context menu, and
 * drag-and-drop node creation from the palette. During simulation, edges on the
 * traversed path are animated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type ReactFlowInstance,
} from 'reactflow';
import { useStore } from '@/store/useStore';
import { TriggerNode } from './nodes/TriggerNode';
import { GroupNode } from './nodes/GroupNode';
import {
  AnnotationNode,
  ConditionNode,
  FallbackNode,
  LogicNode,
  ProviderNode,
  TargetNode,
} from './nodes/SimpleNodes';
import { FlowEdge } from './edges/FlowEdge';
import { ContextMenu, useContextMenu } from './ContextMenu';
import { Box, Highlighter, PenLine, StickyNote, Trash2 } from 'lucide-react';
import type { NodeKind, WFNode } from '@/types/workflow';
import { useUserSettings, type VisualElement, type VisualToolKind } from '@/store/useUserSettings';

const nodeTypes = {
  annotation: AnnotationNode,
  trigger: TriggerNode,
  condition: ConditionNode,
  logic: LogicNode,
  target: TargetNode,
  fallback: FallbackNode,
  provider: ProviderNode,
  group: GroupNode,
};

const edgeTypes = { flow: FlowEdge };

function CanvasInner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const direction = useStore((s) => s.direction);
  const sim = useStore((s) => s.sim);
  const simRunning = useStore((s) => s.simRunning);
  const simPlaybackIndex = useStore((s) => s.simPlaybackIndex);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const addNode = useStore((s) => s.addNode);
  const selectNode = useStore((s) => s.selectNode);
  const canvasLocked = useStore((s) => s.canvasLocked);
  const canvasMode = useStore((s) => s.canvasMode);
  const setCanvasMode = useStore((s) => s.setCanvasMode);
  const setCanvasLocked = useStore((s) => s.setCanvasLocked);
  const selectedCount = useStore((s) => s.nodes.reduce((acc, n) => acc + (n.selected ? 1 : 0), 0));
  const visualElements = useUserSettings((s) => s.visualElements);
  const addVisualElement = useUserSettings((s) => s.addVisualElement);
  const updateVisualElement = useUserSettings((s) => s.updateVisualElement);
  const removeVisualElement = useUserSettings((s) => s.removeVisualElement);
  const visualToolColor = useUserSettings((s) => s.visualToolColor);
  const visualToolSize = useUserSettings((s) => s.visualToolSize);
  const setVisualToolColor = useUserSettings((s) => s.setVisualToolColor);
  const setVisualToolSize = useUserSettings((s) => s.setVisualToolSize);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectionModifierDown, setSelectionModifierDown] = useState(false);
  const [drawTool, setDrawTool] = useState<VisualToolKind | null>(null);

  const { setMenu, menu } = useContextMenu();
  const wrapper = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  // Highlight edges/nodes along the simulated path.
  const { decoratedEdges, simulatingSet } = useMemo(() => {
    const set = new Set<string>();
    const edgeMap = new Map<string, { source: string; target: string }>();
    edges.forEach((e) => edgeMap.set(e.id, { source: e.source, target: e.target }));
    if (sim) {
      const upto = Math.max(0, Math.min(simPlaybackIndex, sim.path.length - 1));
      const revealed = new Set(sim.path.slice(0, upto + 1).map((step) => step.nodeId));
      for (const [id, { source, target }] of edgeMap) {
        if (revealed.has(source) && revealed.has(target)) set.add(id);
      }
    }
    return {
      decoratedEdges: edges.map((e) => ({
        ...e,
        type: 'flow',
        data: { ...(e.data ?? {}), active: set.has(e.id) },
      })),
      simulatingSet: set,
    };
  }, [edges, sim, simPlaybackIndex]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/bifrost-node') as NodeKind;
      if (!kind) return;
      const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(kind, position);
    },
    [rf, addNode],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) useStore.getState().toggleNodeSelection(node.id);
      else selectNode(node.id);
    },
    [selectNode],
  );

  const openContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as Element | null;
    const nodeEl = target?.closest?.('.react-flow__node') as HTMLElement | null;
    const nodeId = nodeEl?.dataset?.id;
    if (nodeId) {
      selectNode(nodeId);
      setMenu({ x: event.clientX, y: event.clientY, nodeId });
      return;
    }
    const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setMenu({ x: event.clientX, y: event.clientY, flowX: pos.x, flowY: pos.y });
  }, [rf, selectNode, setMenu]);

  const addVisualTool = useCallback((kind: VisualToolKind) => {
    const rect = wrapper.current?.getBoundingClientRect();
    const center = { x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 };
    const pos = rf.screenToFlowPosition(center);
    addVisualElement(kind, pos.x, pos.y);
  }, [rf, addVisualElement]);

  useEffect(() => {
    const update = (e: KeyboardEvent) => setSelectionModifierDown(e.ctrlKey || e.metaKey || e.shiftKey);
    const up = (e: KeyboardEvent) => setSelectionModifierDown(e.ctrlKey || e.metaKey || e.shiftKey);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', update); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const onContext = (event: MouseEvent) => openContextMenu(event);
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 2) openContextMenu(event);
    };
    // Capture phase makes this independent from React Flow/browser default
    // context-menu handling and fixes platforms where pane callbacks do not fire.
    el.addEventListener('contextmenu', onContext, { capture: true });
    el.addEventListener('mouseup', onMouseUp, { capture: true });
    return () => {
      el.removeEventListener('contextmenu', onContext, { capture: true } as AddEventListenerOptions);
      el.removeEventListener('mouseup', onMouseUp, { capture: true } as AddEventListenerOptions);
    };
  }, [openContextMenu]);

  return (
    <div ref={wrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={() => useStore.getState().onNodeDragStop()}
        onNodeClick={onNodeClick}
        onPaneClick={() => selectNode(null)}
        nodesDraggable={!canvasLocked && canvasMode === 'drag'}
        nodesConnectable={!canvasLocked}
        elementsSelectable={!canvasLocked}
        selectionOnDrag={!canvasLocked && selectionModifierDown}
        panOnDrag={canvasMode === 'drag' && !selectionModifierDown ? [1, 2] : [2]}
        multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onMove={(_, vp) => setViewport(vp)}
        onPaneContextMenu={(e) => openContextMenu(e)}
        onNodeContextMenu={(e) => openContextMenu(e)}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'flow' }}
        connectionLineStyle={{ stroke: '#a78bfa', strokeWidth: 2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#1c1c22" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="rgba(9,10,12,0.7)"
          nodeColor={(n) => miniColor(n as WFNode)}
        />
      </ReactFlow>

      <VisualLayer elements={visualElements} viewport={viewport} update={updateVisualElement} remove={removeVisualElement} activeTool={drawTool} setActiveTool={setDrawTool} addElement={addVisualElement} screenToFlow={(p: { x: number; y: number }) => rf.screenToFlowPosition(p)} locked={canvasLocked} />

      {simRunning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-strong rounded-full px-4 py-1.5 text-xs text-neon flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-neon animate-ping" /> Simulating request traversal…
        </div>
      )}



{selectedCount >= 2 && (
        <div className="absolute bottom-4 right-4 z-10 glass-strong rounded-full px-3 py-1.5 text-[11px] text-ink-muted">
          <span className="text-ink">{selectedCount} selected</span> · <span className="text-neon">Ctrl/⌘+G</span> group · <span className="text-neon">Ctrl/⌘+Shift+G</span> ungroup
        </div>
      )}

      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <button
          onClick={(e) => setMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom + 8, flowX: 160, flowY: 160 })}
          className="glass-strong rounded-lg px-3 py-2 text-xs text-ink flex items-center gap-1.5 hover:text-neon transition-colors"
          title="Open the same menu as right-click"
        >
          ⋯ Menu
        </button>
        <button onClick={() => setCanvasMode(canvasMode === 'drag' ? 'select' : 'drag')} className="glass-strong rounded-lg px-2.5 py-2 text-xs text-ink hover:text-neon" title="Toggle drag/select mode">{canvasMode === 'drag' ? 'Drag' : 'Select'}</button>
        <button onClick={() => setCanvasLocked(!canvasLocked)} className={`glass-strong rounded-lg px-2.5 py-2 text-xs hover:text-neon ${canvasLocked ? 'text-neon-red' : 'text-ink'}`} title="Lock workspace">{canvasLocked ? 'Locked' : 'Open'}</button>
        <input type="color" value={visualToolColor} onChange={(e) => setVisualToolColor(e.target.value)} className="h-8 w-9 rounded-lg border border-border bg-surface-2 p-1" title="Visual tool color" />
        <input type="range" min={1} max={48} value={visualToolSize} onChange={(e) => setVisualToolSize(Number(e.target.value))} className="w-20 accent-neon" title="Marker/Pen size" />
        <button onClick={() => addVisualTool('sticky')} className="glass-strong rounded-lg px-2.5 py-2 text-xs text-ink hover:text-neon" title="Sticky note"><StickyNote size={14} /></button>
        <button onClick={() => addVisualTool('box')} className="glass-strong rounded-lg px-2.5 py-2 text-xs text-ink hover:text-neon" title="Visual box"><Box size={14} /></button>
        <button onClick={() => setDrawTool(drawTool === 'marker' ? null : 'marker')} className={`glass-strong ${drawTool === 'marker' ? 'text-neon' : 'text-ink'} rounded-lg px-2.5 py-2 text-xs hover:text-neon`} title="Marker"><Highlighter size={14} /></button>
        <button onClick={() => setDrawTool(drawTool === 'pen' ? null : 'pen')} className={`glass-strong ${drawTool === 'pen' ? 'text-neon' : 'text-ink'} rounded-lg px-2.5 py-2 text-xs hover:text-neon`} title="Pen note"><PenLine size={14} /></button>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}


function VisualLayer({
  elements,
  viewport,
  update,
  remove,
  activeTool,
  setActiveTool,
  addElement,
  screenToFlow,
  locked,
}: {
  elements: VisualElement[];
  viewport: { x: number; y: number; zoom: number };
  update: (id: string, patch: Partial<VisualElement>) => void;
  remove: (id: string) => void;
  activeTool: VisualToolKind | null;
  setActiveTool: (tool: VisualToolKind | null) => void;
  addElement: (kind: VisualToolKind, x: number, y: number) => string;
  screenToFlow: (p: { x: number; y: number }) => { x: number; y: number };
  locked: boolean;
}) {
  const drawing = useRef<{ id: string; points: Array<{ x: number; y: number }> } | null>(null);

  const startDrawing = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked || (activeTool !== 'pen' && activeTool !== 'marker')) return;
    if ((e.target as HTMLElement).closest('[data-visual-element]')) return;
    e.preventDefault();
    const p = screenToFlow({ x: e.clientX, y: e.clientY });
    const id = addElement(activeTool, p.x, p.y);
    drawing.current = { id, points: [p] };
    update(id, { path: [p], text: activeTool, w: 1, h: 1 });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const moveDrawing = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    const p = screenToFlow({ x: e.clientX, y: e.clientY });
    drawing.current.points.push(p);
    update(drawing.current.id, { path: [...drawing.current.points] });
  };
  const endDrawing = () => {
    if (drawing.current) setActiveTool(null);
    drawing.current = null;
  };

  return (
    <div
      className={`absolute inset-0 z-[6] overflow-hidden ${activeTool ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={startDrawing}
      onPointerMove={moveDrawing}
      onPointerUp={endDrawing}
      onPointerCancel={endDrawing}
    >
      <svg className="absolute inset-0 h-full w-full pointer-events-none overflow-visible">
        {elements.filter((e) => (e.kind === 'pen' || e.kind === 'marker') && e.path?.length).map((el) => {
          const points = el.path!.map((p) => `${p.x * viewport.zoom + viewport.x},${p.y * viewport.zoom + viewport.y}`).join(' ');
          return <polyline key={el.id} points={points} fill="none" stroke={el.color} strokeWidth={el.strokeWidth ?? (el.kind === 'marker' ? 14 : 3)} strokeLinecap="round" strokeLinejoin="round" opacity={el.kind === 'marker' ? 0.28 : 0.95} />;
        })}
      </svg>
      {elements.filter((el) => el.kind !== 'pen' && el.kind !== 'marker').map((el) => {
        const left = el.x * viewport.zoom + viewport.x;
        const top = el.y * viewport.zoom + viewport.y;
        const drag = (e: React.PointerEvent) => {
          if (locked) return;
          e.preventDefault();
          const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y };
          const move = (ev: PointerEvent) => update(el.id, { x: start.ex + (ev.clientX - start.x) / viewport.zoom, y: start.ey + (ev.clientY - start.y) / viewport.zoom });
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        };
        const resize = (e: React.PointerEvent) => {
          if (locked) return;
          e.preventDefault();
          const start = { x: e.clientX, y: e.clientY, w: el.w, h: el.h };
          const move = (ev: PointerEvent) => update(el.id, { w: Math.max(80, start.w + (ev.clientX - start.x) / viewport.zoom), h: Math.max(50, start.h + (ev.clientY - start.y) / viewport.zoom) });
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        };
        return (
          <div
            key={el.id}
            data-visual-element
            className={`pointer-events-auto absolute rounded-xl ${el.kind === 'box' ? 'border-2 border-dashed bg-transparent' : 'border border-border bg-surface/80 backdrop-blur'} shadow-depth`}
            style={{ left, top, width: el.w * viewport.zoom, minHeight: el.h * viewport.zoom, borderColor: el.color }}
          >
            <div onPointerDown={drag} className="flex items-center gap-1 px-2 py-1 border-b border-border/60 cursor-move" style={{ color: el.color }}>
              <span className="text-[10px] uppercase tracking-wider">{el.kind}</span>
              <button className="ml-auto text-ink-faint hover:text-neon-red" onClick={() => remove(el.id)} title="Remove visual element"><Trash2 size={12} /></button>
            </div>
            <textarea
              className="w-full bg-transparent px-2 py-1.5 text-xs text-ink outline-none resize-none"
              value={el.text}
              style={{ height: Math.max(42, el.h * viewport.zoom - 34) }}
              onChange={(e) => update(el.id, { text: e.target.value })}
            />
            <button onPointerDown={resize} className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm border border-canvas bg-neon shadow-glow" title="Resize" />
          </div>
        );
      })}
      {elements.filter((el) => (el.kind === 'pen' || el.kind === 'marker') && el.path?.length).map((el) => {
        const last = el.path![el.path!.length - 1];
        return <button key={el.id} data-visual-element className="pointer-events-auto absolute rounded bg-surface-2/80 border border-border px-1 text-[10px] text-ink-faint hover:text-neon-red" style={{ left: last.x * viewport.zoom + viewport.x, top: last.y * viewport.zoom + viewport.y }} onClick={() => remove(el.id)}>×</button>;
      })}
    </div>
  );
}

function miniColor(n: WFNode): string {
  switch (n.data.kind) {
    case 'trigger':
      return '#a78bfa';
    case 'annotation':
      return '#fbbf24';
    case 'condition':
      return '#fbbf24';
    case 'logic':
      return '#a78bfa';
    case 'target':
      return '#22d3ee';
    case 'fallback':
      return '#f87171';
    case 'provider':
      return '#34d399';
    default:
      return '#5eead4';
  }
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
