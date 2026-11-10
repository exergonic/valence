/**
 * A short explanatory note with a reference the reader can follow: the flat
 * fact, then a link to the source (an open paper, a textbook page). Shown in
 * the structure card under the header and in a view's folds.
 */
export interface InfoNote {
  text: string;
  link: { label: string; href: string };
}

/** Fill `element` with the note: plain text, or text followed by its link. */
export function writeNote(element: HTMLElement, note: string | InfoNote): void {
  if (typeof note === 'string') {
    element.textContent = note;
    return;
  }
  const link = document.createElement('a');
  link.href = note.link.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = note.link.label;
  element.replaceChildren(`${note.text} `, link);
}

/**
 * A view's fine print, in two folds at the foot of its inspector section,
 * closed until asked for (decided with the user 2026-11-09): how to read what
 * is on screen, and how it was computed. Each is a few short paragraphs; the
 * reference, when there is one, ends the second.
 */
export interface ViewNotes {
  reading: string[];
  computed: string[];
  link?: InfoNote['link'];
}

/** Fill a view's two folds, or hide them when there is nothing to say. The
 *  folds themselves stay in the page, so one left open stays open. */
export function writeViewNotes(reading: HTMLDetailsElement, computed: HTMLDetailsElement, notes: ViewNotes | null): void {
  const fill = (fold: HTMLDetailsElement, paragraphs: string[], link?: InfoNote['link']) => {
    const body = fold.querySelector('.view-notes-body')!;
    body.replaceChildren(...paragraphs.map((text, i) => {
      const p = document.createElement('p');
      writeNote(p, link && i === paragraphs.length - 1 ? { text, link } : text);
      return p;
    }));
    fold.classList.toggle('hidden', paragraphs.length === 0);
  };
  fill(reading, notes?.reading ?? []);
  fill(computed, notes?.computed ?? [], notes?.link);
}
