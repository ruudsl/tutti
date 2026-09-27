/**
 * Welke achtergrondtaken er zijn, en wanneer de periodieke draaien.
 *
 * Dit waren vier planners met elk een eigen setTimeout-lus (WP12 in
 * ROADMAP.md). Het werk zelf staat nog op dezelfde plek, onder
 * src/scheduler/; hier staat alleen hoe vaak het draait en of het opnieuw mag.
 *
 * Een periodieke taak krijgt een sleutel per tijdvak. Daardoor draait hij één
 * keer per tijdvak, ook als het proces tussendoor herstart: vroeger begon elke
 * herstart de klok opnieuw, en draaide de AVG-opschoning bijvoorbeeld nog
 * eens als er binnen het opschoonuur werd uitgerold.
 *
 * Periodieke taken die iets versturen zijn niet herhaalbaar: het volgende
 * tijdvak is hun herkansing, en die kijkt opnieuw wat er nog moet.
 */

import { registreerPeriodiek, registreerTaak } from './wachtrij';
import { runNotificationRound } from '../scheduler/seating-notifications';
import { processPendingTasks } from '../scheduler/email-forwarding-retry';
import { opschoonUur, runCleanup } from '../scheduler/gdpr-cleanup';
import { getIntervalHours, isBackupEnabled, runBackup } from '../scheduler/backup';
import { cleanupOldThumbnails } from '../routes/thumbnails';
import { cleanupTempFiles } from '../routes/pdf-tools';
import { WACHTWOORDHERSTEL_TAAK, verstuurWachtwoordHerstel } from '../routes/auth';
import { ruimInlogvertragingenOp } from '../utils/inlogvertraging';

const MINUUT = 60 * 1000;

/** Een sleutel per vak van `intervalMs`, gerekend vanaf 1970 in UTC. */
export function tijdvak(soort: string, intervalMs: number) {
  return (nu: Date): string => `${soort}:${Math.floor(nu.getTime() / intervalMs)}`;
}

export function registreerStandaardTaken(): void {
  // Een herstellink maken en mailen na 'wachtwoord vergeten'. Buiten het
  // verzoek, zodat de looptijd van het antwoord niet verraadt of het adres
  // bestaat. Versturen, dus niet herhaalbaar: wie geen mail krijgt, vraagt
  // opnieuw.
  registreerTaak<{ userId: string }>(WACHTWOORDHERSTEL_TAAK, {
    herhaalbaar: false,
    looptijdMs: 5 * MINUUT,
    uitvoeren: (gegevens) => verstuurWachtwoordHerstel(gegevens),
  });

  // Opstellingsmeldingen voor repetities: WhatsApp of webhook, vlak voor de
  // repetitie. Versturen, dus niet herhaalbaar.
  registreerTaak('opstelling-meldingen', {
    herhaalbaar: false,
    looptijdMs: 5 * MINUUT,
    uitvoeren: () => runNotificationRound(),
  });
  registreerPeriodiek('opstelling-meldingen', { sleutelVoor: tijdvak('opstelling-meldingen', MINUUT) });

  // Het doorsturen van mail opnieuw proberen voor leden van wie de postbus bij
  // het aanmelden nog niet klaar was. Houdt zelf per lid bij hoe vaak het al
  // geprobeerd is (onboarding_tasks); niet herhaalbaar om dezelfde reden.
  registreerTaak('mail-doorsturen-opnieuw', {
    herhaalbaar: false,
    looptijdMs: 15 * MINUUT,
    uitvoeren: () => processPendingTasks(),
  });
  registreerPeriodiek('mail-doorsturen-opnieuw', {
    sleutelVoor: tijdvak('mail-doorsturen-opnieuw', 2 * MINUUT),
  });

  // AVG: verlopen gegevens verwijderen. Eén keer per dag, in het ingestelde
  // uur. Verwijderen wat al weg is doet niets, dus herhaalbaar.
  registreerTaak('avg-opschonen', {
    herhaalbaar: true,
    maxPogingen: 3,
    looptijdMs: 30 * MINUUT,
    uitvoeren: async () => {
      await runCleanup();
    },
  });
  registreerPeriodiek('avg-opschonen', {
    // Zelfde uur en datum als de oude planner: het lokale uur van de server,
    // de datum in UTC.
    sleutelVoor: (nu) => (nu.getHours() === opschoonUur() ? `avg-opschonen:${nu.toISOString().slice(0, 10)}` : null),
  });

  // Oude bestanden op schijf opruimen: miniaturen (ouder dan een week) en
  // tussenresultaten van de pdf-gereedschappen (ouder dan een uur). Wat al
  // weg is, is weg: herhaalbaar. Deze stonden als setInterval in hun
  // routebestand en begonnen al bij het laden van dat bestand te lopen.
  registreerTaak('miniaturen-opruimen', {
    herhaalbaar: true,
    maxPogingen: 3,
    uitvoeren: () => cleanupOldThumbnails(),
  });
  registreerPeriodiek('miniaturen-opruimen', { sleutelVoor: tijdvak('miniaturen-opruimen', 24 * 60 * MINUUT) });
  registreerTaak('pdf-tijdelijk-opruimen', {
    herhaalbaar: true,
    maxPogingen: 3,
    uitvoeren: () => cleanupTempFiles(),
  });
  registreerPeriodiek('pdf-tijdelijk-opruimen', { sleutelVoor: tijdvak('pdf-tijdelijk-opruimen', 60 * MINUUT) });

  // Standen van de wachttijd na mislukte inlogpogingen die een dag stil zijn
  // (utils/inlogvertraging.ts). Wat weg is, is weg: herhaalbaar.
  registreerTaak('inlogvertraging-opruimen', {
    herhaalbaar: true,
    maxPogingen: 3,
    uitvoeren: () => {
      ruimInlogvertragingenOp();
    },
  });
  registreerPeriodiek('inlogvertraging-opruimen', {
    sleutelVoor: tijdvak('inlogvertraging-opruimen', 60 * MINUUT),
  });

  // Back-up van de database. Een tweede kopie maken kan geen kwaad.
  if (isBackupEnabled()) {
    registreerTaak('database-back-up', {
      herhaalbaar: true,
      maxPogingen: 3,
      looptijdMs: 30 * MINUUT,
      uitvoeren: () => {
        // runBackup vangt zijn eigen fouten af en logt ze. Voor de wachtrij
        // moet een mislukte back-up als mislukt zichtbaar zijn, niet als
        // gelukt met een regel in het logboek.
        const { file } = runBackup();
        if (!file) throw new Error('Er is geen back-up gemaakt; zie het logboek voor de reden.');
      },
    });
    registreerPeriodiek('database-back-up', {
      sleutelVoor: tijdvak('database-back-up', getIntervalHours() * 60 * MINUUT),
    });
  }
}
