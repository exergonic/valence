import type { SceneContext } from '../scene';
import { parseMolBlock } from '../mol-parser';

declare global {
  interface Window {
    jsmeApplet: any;
  }
}

export function mountJsmePanel(container: HTMLElement, ctx: SceneContext) {
  const renderBtn = document.getElementById('render-btn')!;
  renderBtn.onclick = () => {
    const applet = window.jsmeApplet;
    if (applet) {
      const molBlock = applet.molFile();
      const molecule = parseMolBlock(molBlock);
      console.log('Parsed molecule:', molecule);
    }
  };
}
