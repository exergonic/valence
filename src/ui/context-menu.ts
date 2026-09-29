import type { SceneContext } from '../render';
import { capturePng, moleculeToSDF, moleculeToXYZ } from './controls';
import { moDataText } from './mo-data';

/**
 * Right-click on the molecular display: put the three things a debugging
 * session keeps exporting by hand — the molecule as XYZ and SDF, the view as
 * PNG — straight on the clipboard. The payloads are the Export tab's own
 * writers, so a pasted structure is byte-identical to a downloaded one (wedge
 * and hash included, which is the point of not re-serializing here).
 */
export function setupContextMenu(ctx: SceneContext, container: HTMLElement) {
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.classList.add('hidden');
  const toast = document.createElement('div');
  toast.id = 'copy-toast';
  toast.classList.add('hidden');
  // Both are fixed-position chrome, not canvas children: the menu has to
  // escape the canvas panel's stacking context to sit over the WebGL canvas,
  // and the confirmation outlives the menu it replaces.
  document.body.append(menu, toast);

  let at = { x: 0, y: 0 };
  let toastTimer = 0;

  function close() {
    menu.classList.add('hidden');
  }

  function report(text: string, x: number, y: number) {
    toast.textContent = text;
    toast.classList.remove('hidden');
    const box = toast.getBoundingClientRect();
    toast.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    toast.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 1500);
  }

  function addItem(label: string, run: () => Promise<void>) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'context-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = `Copy as ${label}`;
    item.addEventListener('click', async () => {
      // The menu is gone by the time the clipboard answers, so the
      // confirmation has to float where the menu stood.
      const { x, y } = at;
      close();
      try {
        await run();
        report(`Copied ${label}`, x, y);
      } catch (err) {
        // A refused clipboard — permission, or a window that lost focus —
        // deserves saying out loud; a silent no-op reads as a broken menu.
        console.error(`Copy as ${label} failed:`, err);
        report('Copy failed', x, y);
      }
    });
    menu.appendChild(item);
    return item;
  }

  addItem('XYZ', () => navigator.clipboard.writeText(moleculeToXYZ(ctx.currentMolecule!)));
  // The LCAO printout: what a chemist needs to compare this app's orbitals
  // against another program's, frame and basis order included.
  const moItem = addItem('MO data', () => navigator.clipboard.writeText(
    moDataText(ctx.currentMolecule!, ctx.ehResult!),
  ));
  addItem('SDF', () => navigator.clipboard.writeText(moleculeToSDF(ctx.currentMolecule!)));
  // The PNG rides into the clipboard as a promise: a write handed to Safari
  // must be started by the click itself, not after a capture is awaited.
  addItem('PNG', () => navigator.clipboard.write([new ClipboardItem({ 'image/png': capturePng(ctx) })]));

  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Nothing to copy from an empty display — no menu full of dead items.
    if (!ctx.currentMolecule) return;
    // MO data needs orbitals: an element outside the parameter table has none.
    moItem.disabled = !ctx.ehResult;
    menu.classList.remove('hidden');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const box = menu.getBoundingClientRect();
    at = {
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - box.height - 8)),
    };
    menu.style.left = `${at.x}px`;
    menu.style.top = `${at.y}px`;
  });

  document.addEventListener('pointerdown', (e) => {
    if (!menu.contains(e.target as Node)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('blur', close);
}
