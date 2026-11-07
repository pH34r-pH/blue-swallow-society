const SVG = 'http://www.w3.org/2000/svg';
export const TYPE_LABELS = { repo: 'Repositories', hardware: 'Owned hardware', azure: 'Azure' };
export const HEALTH_LABELS = { healthy: 'Healthy', warning: 'Attention', critical: 'Critical', stopped: 'Stopped', unknown: 'Unknown', stale: 'Stale' };
export const EDGE_LABELS = { build: 'Build', deploy: 'Deploy', ingest: 'Ingest' };
const ICONS = {
  repo: ['M8 5h12v17H8a3 3 0 0 1 0-6h12', 'M8 5a3 3 0 0 0-3 3v11', 'M10 9h6'],
  hardware: ['M7 7h14v14H7Z', 'M11 11h6v6h-6Z', 'M10 3v4m8-4v4m-8 14v4m8-4v4M3 10h4m-4 8h4m14-8h4m-4 8h4'],
  azure: ['M7 21h14a5 5 0 0 0 0-10 7 7 0 0 0-13-2A6 6 0 0 0 7 21Z'],
  open: ['M14 7v8m0 4v.1', 'M14 3a11 11 0 1 1 0 22 11 11 0 0 1 0-22'],
  completed: ['m8 14 4 4 8-9', 'M14 3a11 11 0 1 1 0 22 11 11 0 0 1 0-22'],
  closed: ['m9 9 10 10M19 9 9 19', 'M14 3a11 11 0 1 1 0 22 11 11 0 0 1 0-22'],
};

export function el(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined && text !== null) item.textContent = String(text);
  if (className) item.className = className;
  return item;
}
export function svg(tag, attributes = {}) {
  const item = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) item.setAttribute(name, String(value));
  return item;
}
export function action(label, name, className = 'fleet-button') {
  const item = el('button', label, className);
  item.type = 'button'; item.dataset.action = name;
  return item;
}
export function icon(kind) {
  const image = svg('svg', { viewBox: '0 0 28 28', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  for (const d of ICONS[kind] || ICONS.repo) image.append(svg('path', { d }));
  return image;
}
function safeGithubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.search ? url.href : null;
  } catch { return null; }
}
export function externalLink(label, href) {
  const safe = safeGithubUrl(href);
  if (!safe) return null;
  const link = el('a', label, 'fleet-button');
  link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
export function detailRow(label, value) {
  const row = el('div', null, 'fleet-detail-row');
  row.append(el('dt', label), el('dd', value)); return row;
}
export function pager(label, page, pages, name) {
  const row = el('div', null, 'fleet-pager');
  const prev = action('←', name, 'fleet-icon-button'); prev.dataset.page = page - 1; prev.disabled = page === 0; prev.setAttribute('aria-label', 'Previous ' + label.toLowerCase() + ' page');
  const next = action('→', name, 'fleet-icon-button'); next.dataset.page = page + 1; next.disabled = page === pages - 1; next.setAttribute('aria-label', 'Next ' + label.toLowerCase() + ' page');
  row.append(prev, el('span', label + ' ' + (page + 1) + ' / ' + pages), next); return row;
}
