/**
 * Helpers for Job Order Description rich text: Office/Outlook paste cleanup
 * and Outlook Classic–friendly copy HTML.
 */

/** True when HTML (or plain text) is empty for dirty/save purposes. */
export function isEmptyRichTextHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  // A table (even with blank cells) is intentional structure — keep it.
  if (/<table\b/i.test(html)) return false;
  const stripped = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .trim();
  return stripped.length === 0;
}

/**
 * Legacy stored descriptions are plain text. TipTap needs HTML — wrap if no tags.
 */
export function descriptionToEditorHtml(value: string | null | undefined): string {
  const v = value ?? '';
  if (!v.trim()) return '';
  if (/<[a-z][\s\S]*>/i.test(v)) return v;
  return `<p>${escapeHtml(v).replace(/\n/g, '<br>')}</p>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Clean clipboard HTML from Excel / Sheets / Word / Outlook Classic so TipTap
 * gets a usable data table instead of MSO chrome.
 */
export function transformOfficePastedHtml(html: string): string {
  if (!html.trim()) return html;

  // Prefer DOM parsing when available (browser / isomorphic-dompurify's jsdom).
  if (typeof DOMParser !== 'undefined') {
    return transformOfficePastedHtmlDom(html);
  }
  return transformOfficePastedHtmlRegex(html);
}

function transformOfficePastedHtmlDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, meta, link, script').forEach((el) => el.remove());

  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) {
    return doc.body.innerHTML;
  }

  // Score leaf tables (no nested table) by cell count — Office wraps data
  // tables inside layout tables.
  const scored = tables.map((table) => ({
    table,
    cellCount: table.querySelectorAll('td, th').length,
    isLeaf: table.querySelectorAll('table').length === 0,
  }));
  const leaves = scored.filter((s) => s.isLeaf);
  const pool = leaves.length > 0 ? leaves : scored;
  const best = pool.reduce((a, b) => (b.cellCount > a.cellCount ? b : a));
  return best.table.outerHTML;
}

function transformOfficePastedHtmlRegex(html: string): string {
  const cleaned = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?o:[^>]*>/gi, '')
    .replace(/<\/?v:[^>]*>/gi, '')
    .replace(/<\/?w:[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '');

  // Innermost tables first: match tables that contain no nested <table
  const leafRe = /<table\b[^>]*>(?:(?!<table\b)[\s\S])*?<\/table>/gi;
  const leaves: string[] = cleaned.match(leafRe) ?? [];
  if (leaves.length === 0) return cleaned;
  const best = leaves.reduce((a, b) => {
    const ca = (a.match(/<(td|th)\b/gi) ?? []).length;
    const cb = (b.match(/<(td|th)\b/gi) ?? []).length;
    return cb > ca ? b : a;
  });
  return best;
}

/**
 * Build Outlook Classic–friendly HTML for a table selection: inline borders,
 * no CSS classes (Outlook's Word engine ignores them).
 */
export function toOutlookFriendlyTableHtml(tableEl: HTMLTableElement): string {
  const rows = Array.from(tableEl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr'));
  // TipTap wraps rows in tbody; also handle flat tables
  const rowList =
    rows.length > 0
      ? rows
      : Array.from(tableEl.querySelectorAll('tr')).filter((tr) => tr.closest('table') === tableEl);

  const rowHtml = rowList
    .map((tr) => {
      const cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'));
      const cellHtml = cells
        .map((cell) => {
          const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
          const text = cell.textContent ?? '';
          const colspan = cell.getAttribute('colspan');
          const rowspan = cell.getAttribute('rowspan');
          const attrs = [
            `style="border:1px solid #000;padding:4px 8px;vertical-align:top;"`,
            colspan && colspan !== '1' ? `colspan="${colspan}"` : '',
            rowspan && rowspan !== '1' ? `rowspan="${rowspan}"` : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<${tag} ${attrs}>${escapeHtml(text)}</${tag}>`;
        })
        .join('');
      return `<tr>${cellHtml}</tr>`;
    })
    .join('');

  return (
    `<table border="1" cellpadding="4" cellspacing="0" ` +
    `style="border-collapse:collapse;border:1px solid #000;">${rowHtml}</table>`
  );
}

/** Tab-separated plain text for Excel / Sheets paste fallback. */
export function tableToTsv(tableEl: HTMLTableElement): string {
  const rows = Array.from(tableEl.querySelectorAll('tr')).filter(
    (tr) => tr.closest('table') === tableEl,
  );
  return rows
    .map((tr) =>
      Array.from(tr.querySelectorAll(':scope > th, :scope > td'))
        .map((cell) => (cell.textContent ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' '))
        .join('\t'),
    )
    .join('\r\n');
}

/**
 * Given a selection root (or a node inside the editor), find the nearest
 * table for Outlook copy, or null.
 */
export function findTableInSelection(root: ParentNode | null, range: Range | null): HTMLTableElement | null {
  if (!root || !range) return null;
  const start = range.commonAncestorContainer;
  const el =
    start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement;
  const fromAncestor = el?.closest?.('table') as HTMLTableElement | null;
  if (fromAncestor) return fromAncestor;

  const host = root instanceof Element ? root : (root as Document).body;
  if (!host?.querySelectorAll) return null;
  const tables = host.querySelectorAll('table');
  for (const table of Array.from(tables)) {
    try {
      if (range.intersectsNode(table)) return table as HTMLTableElement;
    } catch {
      // intersectsNode can throw if node is detached
    }
  }
  return null;
}
