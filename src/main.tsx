import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Schriften liegen in der App (SIL Open Font License), keine Anfragen an Google Fonts (P1)
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline-Unterstützung (nur im normalen PWA-Build, nicht in der Einzeldatei-Version).
// Relativer Pfad: Die App läuft auch unter einem Unterpfad (z. B. GitHub Pages …/habla/), B7.
if (import.meta.env.PROD && import.meta.env.MODE !== 'single' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
