// Windows integration: reading an app's name and icon, and opening it.
import { app, shell } from 'electron';
import { extname } from 'node:path';
import { titleFromPath } from '../src/core/deck';
import type { NewButton } from './deckStore';

/** File types the "Add apps" picker accepts: programs, shortcuts and internet shortcuts (e.g. Steam games). */
export const APP_EXTENSIONS = ['exe', 'lnk', 'url'];

export async function describeApp(filePath: string): Promise<NewButton> {
  return { title: titleFromPath(filePath), target: filePath, icon: await readIcon(filePath) };
}

/** The file's Windows icon as a PNG data URL (for .lnk files, the icon of the shortcut's target). */
export async function readIcon(filePath: string): Promise<string | null> {
  let source = filePath;
  // A shortcut's own icon carries the arrow overlay; read the icon of what it points to instead.
  if (extname(filePath).toLowerCase() === '.lnk') {
    try {
      source = shell.readShortcutLink(filePath).target || filePath;
    } catch {
      // Unreadable shortcut: fall back to the shortcut file itself.
    }
  }
  try {
    const image = await app.getFileIcon(source, { size: 'large' });
    return image.isEmpty() ? null : image.toDataURL();
  } catch {
    return null;
  }
}

/** Opens the target the way Explorer would. Resolves to false when Windows reports an error. */
export async function openTarget(target: string): Promise<boolean> {
  const error = await shell.openPath(target);
  return error === '';
}
