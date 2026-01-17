import React, { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Controls,
  Background,
  Node,
  Edge,
  NodeProps,
  Panel
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

// --- TYPES ---
interface CapsuleNodeData {
  label: string;
  type: 'function' | 'state' | 'component'; // We now distinguish node types
  summary?: string;
}

type CapsuleNode = Node<CapsuleNodeData>;

// --- CUSTOM NODE COMPONENT ---
// Renders differently based on if it's State (Data) or Function (Logic)
const CapsuleNode: React.FC<NodeProps<CapsuleNodeData>> = ({ data }) => {
  const isState = data.type === 'state';
  const isComponent = data.type === 'component';

  const bgColor = isState ? '#4a148c' : isComponent ? '#e65100' : '#1e1e1e';
  const borderColor = isState ? '#ba68c8' : isComponent ? '#ff9800' : '#333';
  const textColor = isState ? '#e1bee7' : '#ffffff';

  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: isState ? '20px' : '8px', // State is rounded
      background: bgColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      minWidth: isState ? '120px' : '180px',
      textAlign: 'center',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#777' }} />
      <div style={{ fontWeight: 'bold' }}>
        {isState ? '💾 ' : isComponent ? '⚛️ ' : 'ƒ '}
        {data.label}
      </div>
      {data.summary && <div style={{ fontSize: '10px', opacity: 0.8 }}>{data.summary}</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: '#777' }} />
    </div>
  );
};

// --- REACT/TYPESCRIPT PARSER LOGIC ---
const parseReactCode = (code: string) => {
  const nodes: CapsuleNode[] = [];
  const edges: Edge[] = [];
  const stateSetters: Record<string, string> = {}; // map 'setDisplay' -> 'display'
  const stateVariables: Set<string> = new Set();
  
  // 1. Detect Component Name (Default Export)
  const componentRegex = /export\s+default\s+function\s+([a-zA-Z0-9_]+)/;
  const compMatch = code.match(componentRegex);
  const mainComponent = compMatch ? compMatch[1] : 'Component';

  nodes.push({
    id: mainComponent,
    type: 'capsule',
    data: { label: mainComponent, type: 'component' },
    position: { x: 0, y: 0 }
  });

  // 2. Detect State Hooks: const [val, setVal] = useState(...)
  const stateRegex = /const\s*\[\s*([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_]+)\s*\]\s*=\s*useState/g;
  let match;
  while ((match = stateRegex.exec(code)) !== null) {
    const [_, stateVar, setterFunc] = match;
    stateVariables.add(stateVar);
    stateSetters[setterFunc] = stateVar;

    nodes.push({
      id: stateVar,
      type: 'capsule',
      data: { label: stateVar, type: 'state', summary: 'State' },
      position: { x: 0, y: 0 }
    });

    // Link Component -> State (Ownership)
    edges.push({
      id: `${mainComponent}-${stateVar}`,
      source: mainComponent,
      target: stateVar,
      animated: true,
      style: { stroke: '#555', strokeDasharray: '5,5' },
    });
  }

  // 3. Detect Functions: const name = useCallback(...) OR const name = (...) =>
  // We grab the body to analyze logic
  const funcRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*(?:useCallback\(\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>\s*\{([\s\S]*?)\}(?:\s*,\s*\[.*?\]\))?/g;
  
  while ((match = funcRegex.exec(code)) !== null) {
    const [_, funcName, body] = match;

    nodes.push({
      id: funcName,
      type: 'capsule',
      data: { label: `${funcName}()`, type: 'function' },
      position: { x: 0, y: 0 }
    });

    // Analyze Body for State Interactions
    
    // A. State WRITES (calling setDisplay)
    Object.keys(stateSetters).forEach(setter => {
      if (body.includes(setter)) {
        const targetState = stateSetters[setter];
        edges.push({
          id: `${funcName}-writes-${targetState}`,
          source: funcName,
          target: targetState,
          label: 'updates',
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#ba68c8', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ba68c8' }
        });
      }
    });

    // B. State READS (using 'display')
    stateVariables.forEach(stateVar => {
      // Simple check: is the variable name used in the body?
      // (We filter out the setter calls to avoid double edges)
      const regex = new RegExp(`\\b${stateVar}\\b`, 'g');
      if (regex.test(body)) {
        edges.push({
          id: `${stateVar}-reads-${funcName}`,
          source: stateVar,
          target: funcName,
          label: 'read by',
          type: 'smoothstep',
          style: { stroke: '#555', strokeDasharray: '5 5' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#555' }
        });
      }
    });

    // C. Function Calls (connecting handlers)
    // If handleNumber calls handleClear (just an example)
    nodes.forEach(otherNode => {
      if (otherNode.data.type === 'function' && otherNode.id !== funcName) {
         if (body.includes(otherNode.id)) {
            edges.push({
              id: `${funcName}-calls-${otherNode.id}`,
              source: funcName,
              target: otherNode.id,
              type: 'smoothstep',
              style: { stroke: '#4facfe' }
            });
         }
      }
    });
  }

  return { nodes, edges };
};

// --- LAYOUT LOGIC ---
const getLayoutedElements = (nodes: CapsuleNode[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 80 }); 
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(node => {
    // State nodes are smaller, Function nodes are wider
    const width = node.data.type === 'state' ? 140 : 200;
    g.setNode(node.id, { width, height: 60 });
  });
  
  edges.forEach(edge => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  const layoutedNodes = nodes.map(node => {
    const n = g.node(node.id);
    return { ...node, position: { x: n.x - (node.data.type === 'state' ? 70 : 100), y: n.y - 30 } };
  });

  return { nodes: layoutedNodes, edges };
};

// --- MAIN COMPONENT ---
export default function CodeVisualizer() {
  const [inputCode, setInputCode] = useState(`/* Paste your React/TS code here */`);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const nodeTypes = useMemo(() => ({ capsule: CapsuleNode }), []);

  const generateGraph = () => {
    const { nodes: rawNodes, edges: rawEdges } = parseReactCode(inputCode);
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#121212' }}>
      
      {/* LEFT PANEL: Editor */}
      <div style={{ width: '350px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', padding: '1rem', background: '#1a1a1a' }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>Code Input</h3>
        <p style={{ color: '#888', fontSize: '12px', marginBottom: '10px' }}>
          Supports: React Components, useState, useCallback
        </p>
        <textarea 
          style={{ flex: 1, background: '#222', color: '#ccc', border: '1px solid #333', padding: '10px', fontFamily: 'monospace', borderRadius: '4px' }}
          value={inputCode}
          onChange={e => setInputCode(e.target.value)}
          placeholder="Paste your 'Calculator.tsx' code here..."
        />
        <button 
          onClick={generateGraph}
          style={{ marginTop: '15px', padding: '12px', background: '#007acc', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px' }}
        >
          Visualize Logic
        </button>
      </div>

      {/* RIGHT PANEL: Graph */}
      <div style={{ flex: 1 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
          >
            <Background color="#121212" gap={20} />
            <Controls />
            <Panel position="top-right" style={{ color: '#aaa', fontSize: '12px' }}>
              Legend: ⚛️ Component | 💾 State | ƒ Function
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}