// charts.js — lightweight SVG chart primitives (no libraries)
export function ring(percent, { size = 92, stroke = 9, color = '#7c9885', track = '#e9e2d4' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const offset = c - (p / 100) * c;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${p}%">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition: stroke-dashoffset 1s var(--ease);"/>
    <text x="50%" y="50%" dy=".34em" text-anchor="middle" font-family="var(--font-display)" font-size="${size * 0.26}"
      fill="var(--ink)">${p}%</text>
  </svg>`;
}

export function bars(data, { height = 150, color = '#7c9885', altColor = '#c07a5c' } = {}) {
  const w = 460, pad = 6;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (w - pad * (data.length + 1)) / data.length;
  const rows = data.map((d, i) => {
    const h = (d.value / max) * (height - 24);
    const y = height - h - 18;
    const fill = d.alt ? altColor : color;
    return `
      <rect x="${pad + i * (bw + pad)}" y="${y}" width="${bw}" height="${h}" rx="6" fill="${fill}" opacity=".9">
        <title>${d.label}: ${d.value}</title>
      </rect>
      <text x="${pad + i * (bw + pad) + bw / 2}" y="${height - 5}" text-anchor="middle" font-size="10" fill="var(--ink-faint)" font-family="var(--font-body)">${d.label}</text>
      <text x="${pad + i * (bw + pad) + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)" font-family="var(--font-body)" font-weight="600">${d.value}</text>`;
  }).join('');
  return `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="bar chart">${rows}</svg>`;
}

export function sparkline(values, { w = 280, h = 64, color = '#5d7a66' } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * (w - 10) + 5;
    const y = h - 8 - ((v - min) / range) * (h - 18);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function habitGrid(calendar, { startLabel, endLabel } = {}) {
  const cells = calendar.map((d) => {
    let cls = 'cal-day';
    if (d.status !== 'none') cls += ` ${d.status}`;
    if (d.diversity) cls += ' diversity';
    const dayNum = d.date.slice(8);
    const isToday = d.date === calendar[calendar.length - 1]?.date;
    if (isToday) cls += ' today';
    return `<div class="${cls}" title="${d.date}">${d.status === 'none' ? '·' : dayNum}</div>`;
  }).join('');
  return `
    <div class="calendar-grid">${cells}</div>
    <div class="cal-legend">
      <span><i style="background:var(--sage)"></i> Done</span>
      <span><i style="background:var(--clay-soft)"></i> Not useful</span>
      <span><i style="background:var(--lav-soft)"></i> Swapped</span>
      <span><i style="background:var(--gold-soft)"></i> Today’s thread</span>
      <span><i style="background:var(--surface-2)"></i> No thread</span>
    </div>`;
}
