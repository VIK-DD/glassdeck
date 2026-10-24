import { useState } from 'react';
import { DECK_TINTS, MAX_TITLE_LENGTH, type DeckButton } from '../core';
import { tintClassName } from '../ui/design-system/AppIcon';
import { Button, IconButton } from '../ui/design-system/Button';
import { cx } from '../ui/design-system/cx';
import styles from './config.module.css';
import { deck } from './deckHost';

interface ButtonEditorProps {
  button: DeckButton;
  isFirst: boolean;
  isLast: boolean;
  onDone(): void;
}

export function ButtonEditor({ button, isFirst, isLast, onDone }: ButtonEditorProps) {
  const [title, setTitle] = useState(button.title);

  function commitTitle() {
    if (title.trim() !== '' && title !== button.title) deck.updateButton(button.id, { title });
    else setTitle(button.title);
  }

  return (
    <div className={styles.editor}>
      <label className={styles.field}>
        Name
        <input
          className={styles.input}
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </label>
      <div className={styles.field}>
        Colour
        <div className={styles.swatches} role="radiogroup" aria-label="Colour">
          {DECK_TINTS.map((tint) => (
            <button
              key={tint}
              type="button"
              role="radio"
              aria-checked={button.tint === tint}
              aria-label={tint}
              className={cx(styles.swatch, tintClassName(tint))}
              onClick={() => deck.updateButton(button.id, { tint })}
            />
          ))}
        </div>
      </div>
      <p className={cx(styles.target, 'selectable')}>{button.target}</p>
      <div className={styles.actions}>
        <IconButton
          icon="chevron-left"
          label="Move earlier"
          variant="secondary"
          disabled={isFirst}
          onClick={() => deck.moveButton(button.id, -1)}
        />
        <IconButton
          icon="chevron-right"
          label="Move later"
          variant="secondary"
          disabled={isLast}
          onClick={() => deck.moveButton(button.id, 1)}
        />
        <Button icon="trash" className={styles.destructive} onClick={() => deck.removeButton(button.id).then(onDone)}>
          Remove
        </Button>
        <span className={styles.spacer} />
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
