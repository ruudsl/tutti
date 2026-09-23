import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { taalGereed, tekstenGereed } from './i18n';
import './index.css';
import './styles/theme-2026.css';

function tekenen(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  // De rest van de Nederlandse teksten, zodra de browser na de eerste
  // weergave even niets te doen heeft. Wie inlogt, heeft ze dan meestal al
  // binnen voordat de eerste pagina erom vraagt. Niet eerder: dit bestand
  // concurreert anders om dezelfde verbinding als wat het inlogscherm nodig
  // heeft, en dat is precies wat de kern moet voorkomen.
  const straks = window.requestIdleCallback ?? ((terug: () => void) => window.setTimeout(terug, 1));
  straks(() => void tekstenGereed());
}

// Nederlands zit in de hoofdbundel, dus daarvoor is dit een al vervulde
// belofte en tekent de applicatie in dezelfde slag als voorheen. Kiest iemand
// Engels of Duits, dan wachten we op dat ene bestand: een scherm dat eerst in
// het Nederlands verschijnt en een tel later omklapt is erger dan een moment
// langer wachten. Loopt het ophalen stuk, dan tekent hij alsnog - `laadTaal`
// vangt dat af en i18next valt dan terug op het Nederlands.
void taalGereed().then(tekenen, tekenen);
