const TABLE_SCROLL_CLASS = 'email-table-scroll';

/**
 * Wrap rendered email tables in a local horizontal scroller so wide quoted
 * headers / legacy table markup never force the parent reading pane wider
 * than its grid track.
 */
export function wrapEmailTables(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('table').forEach((table) => {
      if (table.closest(`.${TABLE_SCROLL_CLASS}`)) return;

      const wrapper = doc.createElement('div');
      wrapper.className = TABLE_SCROLL_CLASS;
      wrapper.setAttribute('data-email-table-scroll', '');

      const parent = table.parentNode;
      if (!parent) return;

      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

export { TABLE_SCROLL_CLASS };