/**
 * The app's looks: Graphite (dark, the default), Steel (dark metallic blue)
 * and Light (for projectors — dark slides wash out in a lit lecture hall).
 *
 * The interface's colours and typefaces live in the stylesheet as tokens per
 * theme (`:root[data-theme=…]` in main.css), so a theme switch is one
 * attribute on <html> — the sketcher's drawing included (its SVG colours are
 * remapped in the stylesheet). What the stylesheet cannot reach is set here:
 * the 3D scene's background, set through the Background control's own input
 * so its swatches and the labels' contrast palette follow it.
 *
 * The choice is remembered per browser. "System" follows the computer's own
 * light/dark setting: Graphite for dark, Light for light.
 */
import type { SceneContext } from '../render';

export type ThemeName = 'graphite' | 'steel' | 'light';
export type ThemeChoice = ThemeName | 'system';

const THEMES: Record<ThemeName, { sceneBackground: string; dark: boolean }> = {
  graphite: { sceneBackground: '#0d0f12', dark: true },
  steel: { sceneBackground: '#0a1220', dark: true },
  light: { sceneBackground: '#ffffff', dark: false },
};

const STORAGE_KEY = 'valence-theme';
/** The dark theme the quick toggle returns to from Light. */
const LAST_DARK_KEY = 'valence-theme-last-dark';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode or blocked storage: the default theme
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the choice simply won't be remembered
  }
}

export function storedThemeChoice(): ThemeChoice {
  const stored = read(STORAGE_KEY);
  return stored === 'steel' || stored === 'light' || stored === 'system' || stored === 'graphite' ? stored : 'graphite';
}

const systemPrefersLight = () => window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;

function resolve(choice: ThemeChoice): ThemeName {
  if (choice === 'system') return systemPrefersLight() ? 'light' : 'graphite';
  return choice;
}

function applyTheme(choice: ThemeChoice): void {
  const name = resolve(choice);
  document.documentElement.dataset.theme = name;
  if (THEMES[name].dark) write(LAST_DARK_KEY, name);
  // through the Background control, so its swatches, the labels' palette and
  // the scene all follow (src/ui/controls.ts)
  const background = document.getElementById('ctrl-bg-custom') as HTMLInputElement | null;
  if (background) {
    background.value = THEMES[name].sceneBackground;
    background.dispatchEvent(new Event('input'));
  }
  for (const option of document.querySelectorAll<HTMLButtonElement>('#theme-options [data-theme-choice]')) {
    option.setAttribute('aria-pressed', String(option.dataset.themeChoice === choice));
  }
}

export function setupTheme(ctx: SceneContext): void {
  let choice = storedThemeChoice();
  const choose = (next: ThemeChoice) => {
    choice = next;
    write(STORAGE_KEY, next);
    applyTheme(next);
    ctx.rerender();
  };

  for (const option of document.querySelectorAll<HTMLButtonElement>('#theme-options [data-theme-choice]')) {
    option.addEventListener('click', () => choose(option.dataset.themeChoice as ThemeChoice));
  }
  // the quick switch before a lecture: Light, and back to the dark theme in use
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const lastDark = read(LAST_DARK_KEY);
    choose(resolve(choice) === 'light' ? (lastDark === 'steel' ? 'steel' : 'graphite') : 'light');
  });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (choice === 'system') {
      applyTheme('system');
      ctx.rerender();
    }
  });
  applyTheme(choice);
}
