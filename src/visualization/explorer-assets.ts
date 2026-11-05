export const explorerAssetFiles = ['app.js', 'app.js.LEGAL.txt', 'style.css', 'CYTOSCAPE-LICENSE.txt'] as const;
export function explorerAssetsRoot(): URL {
  return new URL(import.meta.url.endsWith('.ts') ? '../../dist/visualization/explorer-assets/' : './explorer-assets/', import.meta.url);
}
