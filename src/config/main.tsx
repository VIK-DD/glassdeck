import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/design-system/tokens.css';
import '../ui/design-system/global.css';
import { ConfigApp } from './ConfigApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigApp />
  </StrictMode>,
);
