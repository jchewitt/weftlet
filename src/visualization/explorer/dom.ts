export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing explorer element: ${id}`);
  return found as T;
}
export function navigationButton(parent: HTMLElement, label: string, detail: string, action: () => void): HTMLButtonElement {
  const button = element('button', label);
  button.type = 'button'; button.append(element('small', detail));
  button.onclick = action; parent.append(button); return button;
}
