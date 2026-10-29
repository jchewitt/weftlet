import { searchEvidencePaths, type PathEdge } from '../graph/path-search.js';
export type { PathEdge } from '../graph/path-search.js';

/** First deterministic simple path over displayed facts; shares the agent search engine. */
export function findEvidencePath(edges: readonly PathEdge[], start: string, target: string, maxSteps = 1000) {
  const result = searchEvidencePaths(edges, start, target, { maxDepth: 32, maxPaths: 1, maxSteps });
  return { found: result.paths.length > 0, edgeIds: result.paths[0]?.factIds ?? [], truncated: result.search.truncated };
}

export function viewerScript(): string {
  return `
    (() => {
      const searchPaths = ${searchEvidencePaths.toString()};
      const model = JSON.parse(document.getElementById('visual-model').textContent);
      const search = document.getElementById('graph-search');
      const cluster = document.getElementById('graph-cluster');
      const detail = document.getElementById('node-detail');
      const target = document.getElementById('path-target');
      const status = document.getElementById('path-status');
      const nextPath = document.getElementById('next-path');
      const depth = document.getElementById('path-depth');
      const direction = document.getElementById('path-direction');
      const predicate = document.getElementById('path-predicate');
      let pathOffset = 0;
      const clearPath = () => { pathOffset = 0; nextPath.disabled = true; pathIds.clear(); status.textContent = ''; };
      const layers = [...document.querySelectorAll('[data-layer]')];
      const edges = [...document.querySelectorAll('[data-visual-edge]')];
      const nodes = [...document.querySelectorAll('[data-visual-node]')];
      const rows = [...document.querySelectorAll('[data-relationship-row]')];
      let selected;
      let pathIds = new Set();
      const enabledEdges = () => {
        const enabled = new Set(layers.filter(item => item.checked).map(item => item.dataset.layer));
        return model.edges.filter(edge => enabled.has(edge.authority));
      };
      const update = () => {
        const enabled = new Set(enabledEdges().map(edge => edge.id));
        const query = search.value.trim().toLowerCase();
        const clusterIds = new Set(model.nodes.filter(node => !cluster.value || node.cluster === cluster.value).map(node => node.id));
        const connected = new Set();
        let count = 0;
        for (const edge of edges) {
          const visible = enabled.has(edge.dataset.edgeId) && (!query || edge.dataset.search.includes(query)) &&
            (clusterIds.has(edge.dataset.from) || clusterIds.has(edge.dataset.to)) &&
            (!document.getElementById('neighbors-only').checked || !selected ||
              edge.dataset.from === selected || edge.dataset.to === selected);
          edge.classList.toggle('is-hidden', !visible);
          edge.classList.toggle('is-highlighted', pathIds.has(edge.dataset.edgeId));
          if (visible) { count++; connected.add(edge.dataset.from); connected.add(edge.dataset.to); }
        }
        for (const node of nodes) {
          node.classList.toggle('is-hidden', !connected.has(node.dataset.nodeId) && node.dataset.nodeId !== selected);
          node.classList.toggle('is-selected', node.dataset.nodeId === selected);
        }
        const visibleIds = new Set(edges.filter(edge => !edge.classList.contains('is-hidden')).map(edge => edge.dataset.edgeId));
        rows.forEach(row => row.classList.toggle('is-hidden', !visibleIds.has(row.dataset.edgeId)));
        document.getElementById('visible-count').textContent = count + ' visible relationships from this page';
      };
      const select = (id) => {
        selected = id; clearPath();
        detail.replaceChildren();
        const node = model.nodes.find(node => node.id === id);
        const heading = document.createElement('strong');
        heading.textContent = node.label + ' · ' + node.kind;
        detail.append(heading);
        const identifier = document.createElement('p'); identifier.textContent = id; detail.append(identifier);
        for (const edge of model.edges.filter(edge => edge.from === id || edge.to === id)) {
          const item = document.createElement('p');
          item.textContent = edge.authority + ': ' + edge.from + ' → ' + edge.label + ' → ' + edge.to + '\\n' + edge.detail;
          const source = document.createElement(edge.sourceUrl ? 'a' : 'code');
          source.textContent = edge.provenance + ' @ ' + edge.source.commitSha.slice(0,12);
          if (edge.sourceUrl) { source.href = edge.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; }
          item.append(document.createElement('br'), source);
          for (const citation of edge.bindingSources || []) {
            const link = document.createElement(citation.sourceUrl ? 'a' : 'code');
            link.textContent = citation.provenance;
            if (citation.sourceUrl) { link.href = citation.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
            item.append(document.createElement('br'), link);
          }
          const focus = document.createElement('button'); focus.textContent = 'Show source relationships';
          focus.addEventListener('click', () => { search.value = edge.source.path; update(); });
          item.append(document.createElement('br'), focus); detail.append(item);
        }
        update();
      };
      nodes.forEach(node => {
        node.addEventListener('click', () => select(node.dataset.nodeId));
        node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.dataset.nodeId); } });
      });
      const showPath = (resume) => {
        if (!selected) { status.textContent = 'Select a start node first.'; return; }
        if (!resume) pathOffset = 0;
        try {
          const input = enabledEdges().filter(edge => !predicate.value || edge.label === predicate.value).flatMap(edge => {
            const forward = { id: edge.id, from: edge.from, to: edge.to };
            const reverse = { id: edge.id, from: edge.to, to: edge.from };
            return direction.value === 'incoming' ? [reverse] : direction.value === 'outgoing' || edge.from === edge.to ? [forward] : [forward, reverse];
          });
          const result = searchPaths(input, selected, target.value, { maxDepth: Number(depth.value), maxPaths: 1, maxSteps: 1000, offset: pathOffset }, new Set(model.nodes.map(node => node.id)));
          pathOffset = result.search.totalSteps;
          nextPath.disabled = result.search.exhaustedWithinDepth || result.search.stopReason === 'search-limit';
          pathIds = new Set(result.paths[0]?.factIds || []);
          status.textContent = result.paths.length ? 'One cited path: ' + result.paths[0].factIds.length + ' relationships.' : 'No path returned on this search page.';
          status.textContent += ' Displayed facts and selected authority/relations only; ' + result.search.stopReason + '.';
          if (!nextPath.disabled) status.textContent += ' Continue to examine remaining branches.';
          if (result.search.depthLimitReached) status.textContent += ' Depth limit reached; increase depth and restart.';
          if (result.search.stopReason === 'search-limit') status.textContent += ' Narrow the selection or choose an intermediate node.';
          status.textContent += ' Pending prefixes: ' + result.frontier.pending.length + '; depth-limited extensions: ' + result.frontier.depthLimited.count + '.';
          search.value = ''; cluster.value = ''; document.getElementById('neighbors-only').checked = false;
          update();
        } catch (error) { clearPath(); status.textContent = error.message; update(); }
      };
      document.getElementById('highlight-path').addEventListener('click', () => showPath(false));
      nextPath.addEventListener('click', () => showPath(true));
      [target, depth, direction, predicate].forEach(item => item.addEventListener('change', () => { clearPath(); update(); }));
      search.addEventListener('input', update); cluster.addEventListener('change', update);
      document.getElementById('neighbors-only').addEventListener('change', update);
      layers.forEach(item => item.addEventListener('change', () => { clearPath(); update(); }));
      document.getElementById('reset-filters').addEventListener('click', () => {
        search.value = ''; cluster.value = ''; selected = undefined; clearPath();
        document.getElementById('neighbors-only').checked = false;
        layers.forEach(item => { item.checked = true; });
        detail.textContent = 'Select a node to inspect its cited relationships.'; status.textContent = ''; update();
      });
      update();
    })();
  `;
}
