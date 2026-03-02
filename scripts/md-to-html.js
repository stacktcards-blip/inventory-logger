#!/usr/bin/env node
import fs from 'fs';

const mdPath = process.argv[2] || 'docs/EBAY_SALES_INTAKE_FRAMEWORK.md';
const md = fs.readFileSync(mdPath, 'utf8');

// Parse tables first (before other replacements)
const lines = md.split('\n');
const result = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  if (line.startsWith('|') && line.includes('|')) {
    const tableRows = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      const row = lines[i];
      if (!row.match(/\|\s*[-:]+\s*\|/)) {
        const cells = row.split('|').slice(1, -1).map((c) => c.trim());
        tableRows.push(cells);
      }
      i++;
    }
    if (tableRows.length > 0) {
      result.push('<table>');
      tableRows.forEach((cells, idx) => {
        const tag = idx === 0 ? 'th' : 'td';
        result.push('<tr>' + cells.map((c) => `<${tag}>${inlineFormat(c)}</${tag}>`).join('') + '</tr>');
      });
      result.push('</table>');
    }
    continue;
  }

  // Code block
  if (line.startsWith('```')) {
    const lang = line.slice(3).trim();
    const codeLines = [];
    i++;
    while (i < lines.length && !lines[i].startsWith('```')) {
      codeLines.push(lines[i]);
      i++;
    }
    i++;
    result.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
    continue;
  }

  // Headers
  if (line.startsWith('# ')) {
    result.push('<h1>' + escapeHtml(line.slice(2)) + '</h1>');
    i++;
    continue;
  }
  if (line.startsWith('## ')) {
    result.push('<h2>' + escapeHtml(line.slice(3)) + '</h2>');
    i++;
    continue;
  }
  if (line.startsWith('### ')) {
    result.push('<h3>' + escapeHtml(line.slice(4)) + '</h3>');
    i++;
    continue;
  }
  if (line.startsWith('#### ')) {
    result.push('<h4>' + escapeHtml(line.slice(5)) + '</h4>');
    i++;
    continue;
  }

  // Horizontal rule
  if (line.trim() === '---') {
    result.push('<hr>');
    i++;
    continue;
  }

  // List items
  if (line.match(/^[-*] /)) {
    const items = [line.replace(/^[-*] /, '')];
    i++;
    while (i < lines.length && lines[i].match(/^[-*] /)) {
      items.push(lines[i].replace(/^[-*] /, ''));
      i++;
    }
    result.push('<ul>' + items.map((it) => '<li>' + inlineFormat(it) + '</li>').join('') + '</ul>');
    continue;
  }

  // Paragraph
  if (line.trim()) {
    result.push('<p>' + inlineFormat(line) + '</p>');
  } else {
    result.push('');
  }
  i++;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const html = result.join('\n');

const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>eBay Sales Intake Framework</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:0 auto;padding:24px;line-height:1.6;color:#333}
h1{font-size:1.75rem;border-bottom:2px solid #333;padding-bottom:8px}
h2{font-size:1.35rem;margin-top:32px}
h3{font-size:1.15rem;margin-top:24px}
h4{font-size:1rem;margin-top:16px}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:0.9rem}
th,td{border:1px solid #ccc;padding:8px;text-align:left}
th{background:#f5f5f5;font-weight:600}
pre{background:#f5f5f5;padding:16px;overflow-x:auto;border-radius:4px;font-size:0.85rem}
code{font-family:ui-monospace,monospace;font-size:0.9em}
ul{margin:8px 0;padding-left:24px}
li{margin:4px 0}
p{margin:8px 0}
hr{margin:24px 0;border:none;border-top:1px solid #ddd}
@media print{body{padding:0}table{font-size:0.8rem}pre{font-size:0.75rem}}
</style>
</head>
<body>
${html}
</body>
</html>`;

const outPath = mdPath.replace(/\.md$/, '.html');
fs.writeFileSync(outPath, doc);
console.log('Wrote', outPath);
console.log('Open in a browser and use Print > Save as PDF to create a PDF.');
