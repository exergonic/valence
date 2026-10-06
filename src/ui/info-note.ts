/**
 * A short explanatory note with a reference the reader can follow: the flat
 * fact, then a link to the source (an open paper, a textbook page). Shown in
 * the Info log and under the orbital list.
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
