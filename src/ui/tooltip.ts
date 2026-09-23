import * as THREE from 'three';
import { ATOM_LAYER } from '../render';

export function setupTooltip(container: HTMLElement, camera: THREE.Camera, ...groups: THREE.Group[]) {
  const tooltip = document.getElementById('tooltip')!;
  const raycaster = new THREE.Raycaster();
  // Atom meshes of the lit styles sit on the atom layer; picking must see them.
  raycaster.layers.enable(ATOM_LAYER);
  const mouse = new THREE.Vector2();
  const allObjects: THREE.Object3D[] = [];

  function refreshObjects() {
    allObjects.length = 0;
    for (const g of groups) {
      g.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.userData.lobeType) {
          allObjects.push(child);
        }
      });
    }
  }

  container.addEventListener('pointermove', (e) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    refreshObjects();
    if (allObjects.length === 0) { tooltip.classList.add('hidden'); return; }

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(allObjects, false);

    if (hits.length > 0) {
      const obj = hits[0].object;
      const d = obj.userData;
      const idx = d.atomIndex !== undefined ? d.atomIndex + 1 : '';
      let text = '';

      if (d.lobeType === '1s') {
        text = `${d.element}${idx} 1s`;
      } else if (d.lobeType === 'sigma') {
        text = `${d.element}${idx} ${d.label}`;
      } else if (d.lobeType === 'pi') {
        text = `${d.element}${idx} p`;
      } else if (d.lobeType === 'lone_pair') {
        text = `${d.element}${idx} ${d.label}`;
      }

      if (!text) { tooltip.classList.add('hidden'); return; }

      tooltip.textContent = text;
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY - 8) + 'px';
      tooltip.classList.remove('hidden');
      container.style.cursor = 'default';
    } else {
      tooltip.classList.add('hidden');
      container.style.cursor = '';
    }
  });
}
