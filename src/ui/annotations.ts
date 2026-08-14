// Slide-out annotations: draggable text callouts anchored to the canvas.
// Annotations live in the #annotations-layer overlay (position: absolute,
// pointer-events: none) so they float above the 3D scene without blocking
// orbit controls except when grabbed.

export interface Annotation {
  x: number;      // % of canvas width
  y: number;      // % of canvas height
  text: string;
}

export interface AnnotationController {
  getAnnotations: () => Annotation[];
  setAnnotations: (anns: Annotation[]) => void;
  clear: () => void;
  add: (x?: number, y?: number) => void;
}

export function setupAnnotations(container: HTMLElement): AnnotationController {
  const layer = document.createElement('div');
  layer.id = 'annotations-layer';
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
  container.appendChild(layer);

  const annotations: Annotation[] = [];
  let nextId = 1;

  function render() {
    layer.innerHTML = '';
    for (const ann of annotations) {
      const el = document.createElement('div');
      el.className = 'annotation';
      el.style.left = ann.x + '%';
      el.style.top = ann.y + '%';
      el.style.transform = 'translate(-50%, -50%)';
      el.setAttribute('data-id', String(nextId++));

      const textarea = document.createElement('textarea');
      textarea.className = 'annotation-text';
      textarea.value = ann.text;
      textarea.placeholder = 'Type annotation…';
      textarea.spellcheck = false;
      textarea.addEventListener('input', () => {
        ann.text = textarea.value;
      });
      // Don't let the textarea steal orbit-control drags
      textarea.addEventListener('pointerdown', (e) => e.stopPropagation());

      const closeBtn = document.createElement('button');
      closeBtn.className = 'annotation-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Remove annotation';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = annotations.indexOf(ann);
        if (idx >= 0) annotations.splice(idx, 1);
        render();
      });

      el.appendChild(textarea);
      el.appendChild(closeBtn);
      layer.appendChild(el);

      makeDraggable(el, ann);
    }
  }

  function makeDraggable(el: HTMLElement, ann: Annotation) {
    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    // The header area (grab handle) is the textarea's parent; we make the
    // whole card draggable except when the user is typing — dragging from
    // the textarea itself is allowed only when it's not focused.
    el.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' && (target as HTMLTextAreaElement) === document.activeElement) return;
      if (target.tagName === 'BUTTON') return;

      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = ann.x;
      startTop = ann.y;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const dx = ((e.clientX - startX) / rect.width) * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;
      ann.x = Math.max(0, Math.min(100, startLeft + dx));
      ann.y = Math.max(0, Math.min(100, startTop + dy));
      el.style.left = ann.x + '%';
      el.style.top = ann.y + '%';
    });

    const stop = () => {
      dragging = false;
      el.style.cursor = '';
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }

  function addAnnotation(x?: number, y?: number) {
    if (x === undefined) x = 50;
    if (y === undefined) y = 50;
    const ann: Annotation = { x, y, text: '' };
    annotations.push(ann);
    render();
    // Focus the new annotation's textarea for immediate typing
    const last = layer.lastElementChild?.querySelector('textarea') as HTMLTextAreaElement | null;
    last?.focus();
    return ann;
  }

  return {
    getAnnotations: () => annotations.map((a) => ({ ...a })),
    setAnnotations: (anns: Annotation[]) => {
      annotations.length = 0;
      for (const a of anns) annotations.push({ ...a });
      render();
    },
    clear: () => {
      annotations.length = 0;
      render();
    },
    add: (x?: number, y?: number) => {
      addAnnotation(x, y);
    },
  };
}
