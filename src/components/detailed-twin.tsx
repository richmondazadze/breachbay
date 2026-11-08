"use client";
import { useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge, type XYPosition, type Viewport, type NodeChange } from "@xyflow/react";
import { Button } from "./ui/button";
export interface TwinView { positions: Record<string,XYPosition>; pinned: string[]; selected?: string[]; viewport?: Viewport }
export function DetailedTwin({nodes,edges,view,setView,onInspect}:{nodes:Node[];edges:Edge[];view:TwinView;setView:React.Dispatch<React.SetStateAction<TwinView>>;onInspect:(id:string)=>void}) {
  const initialFit = useRef(!view.viewport);
  const [list, setList] = useState(false);
  useEffect(()=>{
    setView(previous=>{
      const missing=nodes.filter(n=>!previous.positions[n.id]);if(!missing.length)return previous;
      return {...previous,positions:{...previous.positions,...Object.fromEntries(missing.map(n=>[n.id,n.position]))}};
    });
  },[nodes,setView]);
  const graphNodes=nodes.map(n=>({...n,position:view.positions[n.id]??n.position,draggable:!view.pinned.includes(n.id),selected:view.selected?.includes(n.id)??false,className:view.pinned.includes(n.id)?"twin-node-pinned":""}));
  const changes = (changes:NodeChange[]) => setView(previous=>{
    const positions={...previous.positions};let changed=false;let selected=previous.selected??[];
    for(const change of changes){
      if(change.type==="select"){selected=change.selected?[...new Set([...selected,change.id])]:selected.filter(id=>id!==change.id);changed=true;}
      if(change.type==="position" && change.position && !previous.pinned.includes(change.id)) {positions[change.id]=change.position;changed=true;}
    }
    return changed?{...previous,positions,selected}:previous;
  });
  return <>
    <div className="bb-graph-toolbar"><h3>Evidence & response topology</h3><Button variant="outline" size="sm" aria-pressed={list} onClick={()=>setList(!list)}>{list ? "Show diagram" : "Show node list"}</Button></div>
    <p className="panel-foot">Drag nodes to arrange them, or focus a node and press Enter to select it before using arrow keys. Pins and camera are local view preferences; they do not change incident state.</p>
    <div className="graph-canvas" hidden={list}><ReactFlow nodes={graphNodes} edges={edges} fitView={initialFit.current} defaultViewport={view.viewport} nodesConnectable={false} onNodesChange={changes} onMoveEnd={(_,viewport)=>setView(previous=>({...previous,viewport}))} onNodeClick={(_,node)=>onInspect(node.id)}>
      <Background/><Controls showInteractive={false}/>
    </ReactFlow></div>
    <div className="twin-node-register" hidden={!list} aria-label="Accessible node list">
      {nodes.map(node=><div key={node.id}><Button variant="ghost" onClick={()=>onInspect(node.id)}>{node.ariaLabel ?? node.id}</Button><Button variant="outline" size="sm" aria-pressed={view.pinned.includes(node.id)} onClick={()=>setView(previous=>({...previous,pinned:previous.pinned.includes(node.id)?previous.pinned.filter(id=>id!==node.id):[...previous.pinned,node.id]}))}>{view.pinned.includes(node.id)?"Unpin":"Pin"} node</Button></div>)}
    </div>
  </>;
}
