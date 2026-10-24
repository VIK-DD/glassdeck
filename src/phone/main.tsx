import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/design-system/tokens.css';
import '../ui/design-system/global.css';
import { createDeckClient } from './deckClient';
import { DeckClientProvider } from './DeckClientContext';
import { PhoneApp } from './PhoneApp';

const client = createDeckClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeckClientProvider client={client}>
      <PhoneApp />
    </DeckClientProvider>
  </StrictMode>,
);
