import cytoscape, { type Core } from 'cytoscape';
import type { GraphFact, GraphNode } from '@weftlet/core';

export interface ViewportState {
  readonly positions: readonly { id: string; position: { x: number; y: number } }[];
  readonly zoom: number;
  readonly pan: { x: number; y: number };
}
/** The canvas is a presentation of supplied exact assertions, never a graph extractor. */
export class EvidenceCanvas {
  private readonly cy: Core;
  constructor(container: HTMLElement, enter: (nodeId: string) => void, inspect: (facts: readonly GraphFact[]) => void) {
    this.cy = cytoscape({ container, elements: [], minZoom: 0.15, maxZoom: 3, style: [
      { selector: 'node', style: { label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '140px', 'font-size': 13,
        'font-family': 'sans-serif', color: '#173142', 'background-color': '#e0f1eb', 'border-width': 2, 'border-color': '#6eac98',
        width: 170, height: 76, shape: 'round-rectangle', 'text-valign': 'center', 'text-halign': 'center' } },
      { selector: 'node[kind="Component"], node[kind="CodeSymbol"]', style: { 'background-color': '#e6edf9', 'border-color': '#91a5cc' } },
      { selector: 'node[kind="Contract"], node[kind="Invariant"]', style: { 'background-color': '#fff2da', 'border-color': '#d1af6d' } },
      { selector: 'node[kind="Evidence"]', style: { 'background-color': '#f1e9f8', 'border-color': '#ad8bc0' } },
      { selector: 'node.focus', style: { 'border-width': 4, 'border-color': '#176c59' } },
      { selector: 'node.boundary', style: { 'border-style': 'dashed', 'background-opacity': 0.5 } },
      { selector: 'edge', style: { label: 'data(label)', width: 2, 'line-color': '#8ca8b0', 'target-arrow-color': '#8ca8b0',
        'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'font-size': 10, 'text-background-opacity': 1,
        'text-background-color': '#f2f6f7', 'text-background-padding': '3px', 'text-rotation': 'autorotate' } },
      { selector: 'edge:selected, edge.path', style: { 'line-color': '#16896f', 'target-arrow-color': '#16896f', width: 4 } },
    ] });
    this.cy.on('tap', 'node', event => enter(event.target.data('nodeId')));
    this.cy.on('tap', 'edge', event => inspect(event.target.data('facts')));
  }
  capture(): ViewportState {
    return { positions: this.cy.nodes().map(node => ({ id: node.id(), position: { ...node.position() } })),
      zoom: this.cy.zoom(), pan: { ...this.cy.pan() } };
  }
  render(nodes: readonly GraphNode[], facts: readonly GraphFact[], focus?: string, restore?: ViewportState, boundaries?: ReadonlySet<string>): void {
    const groups = new Map<string, GraphFact[]>();
    for (const fact of facts) {
      const key = JSON.stringify([fact.subject.id, fact.predicate, fact.object.id]);
      const group = groups.get(key) ?? []; group.push(fact); groups.set(key, group);
    }
    // Prefix canvas identities so a fact/node sharing a logical ID cannot collide in the library.
    const nodeKey = (id: string) => `node:${id}`;
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(nodes.map(node => ({ group: 'nodes' as const, data: { id: nodeKey(node.id), nodeId: node.id, label: node.label, kind: node.kind } })));
      this.cy.add([...groups.values()].map((group, index) => ({ group: 'edges' as const,
        data: { id: `edge:${index}`, source: nodeKey(group[0]!.subject.id), target: nodeKey(group[0]!.object.id),
          label: group[0]!.predicate + (group.length > 1 ? ` · ${group.length} assertions` : ''), facts: group } })));
      if (focus) this.cy.getElementById(nodeKey(focus)).addClass('focus');
      for (const id of boundaries ?? []) this.cy.getElementById(nodeKey(id)).addClass('boundary');
    });
    this.cy.layout({ name: 'breadthfirst', directed: true, spacingFactor: 1.25, padding: 60, animate: false }).run();
    if (restore) {
      for (const item of restore.positions) this.cy.getElementById(item.id).position(item.position);
      this.cy.zoom(restore.zoom); this.cy.pan(restore.pan);
    }
  }
  zoom(factor: number) { this.cy.zoom(this.cy.zoom() * factor); }
  fit() { this.cy.fit(undefined, 60); }
  highlight(ids: ReadonlySet<string>) {
    this.cy.edges().removeClass('path').filter(edge => edge.data('facts').some((fact: GraphFact) => ids.has(fact.id))).addClass('path');
  }
  destroy() { this.cy.destroy(); }
}
