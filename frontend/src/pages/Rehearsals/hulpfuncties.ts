/**
 * Gedeelde constanten en losse functies van de repetitiepagina.
 *
 * Deze stonden in Rehearsals.tsx: `MANAGER_ROLES` en `EMPTY_REHEARSAL_FORM`
 * boven de component, `WEEKDAY_CODES` en `getTypeStyle` erbinnen (zonder iets
 * uit de component te gebruiken) en `formatDate` eronder. Ze zijn hier
 * ongewijzigd neergezet, zodat de opgeknipte onderdelen er allemaal bij kunnen.
 */

import type { CSSProperties } from 'react';
import { ROLES } from '../../utils/constants';

export const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

export const EMPTY_REHEARSAL_FORM = {
  date: '',
  startTime: '19:30',
  endTime: '21:30',
  location: '',
  type: 'regular',
  notes: '',
  orchestraId: '',
};

/** De vorm van het toevoeg-/bewerkformulier, afgeleid van de lege beginwaarde. */
export type RehearsalFormState = typeof EMPTY_REHEARSAL_FORM;

/** De vorm van het formulier voor een vaste repetitiedag. */
export interface DefaultDayFormState {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
  orchestraId: string;
}

/** De vorm van het formulier voor een reeks herhalende repetities. */
export interface RecurringFormState {
  dayOfWeek: number;
  interval: number;
  startTime: string;
  endTime: string;
  location: string;
  orchestraId: string;
  until: string;
}

/** De vorm van het spond-inloggegevensformulier. */
export interface SpondFormState {
  username: string;
  password: string;
  groupId: string;
}

/** Welk tabblad op het overzicht open staat. */
export type RehearsalTab = 'rehearsals' | 'attendance' | 'dashboard';

// Recurring rehearsals helpers
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function getTypeStyle(type: string): CSSProperties {
  switch (type) {
    case 'extra':
      return { borderLeft: '4px solid var(--warning)' };
    case 'cancelled':
      return { borderLeft: '4px solid var(--danger)', opacity: 0.6, textDecoration: 'line-through' };
    default:
      return { borderLeft: '4px solid var(--primary)' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatDate(dateStr: string, t: any): string {
  const date = new Date(dateStr + 'T00:00:00');
  const dayName = t(`rehearsals.days.${date.getDay()}`);
  return `${dayName} ${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}

/**
 * De voorbeelddatums van een reeks herhalende repetities: elke `interval`-de
 * `dagVanDeWeek`, vanaf `vanaf` tot en met `totEnMet`, beide als kale datum
 * (jjjj-mm-dd).
 *
 * Dit rekenwerk stond in `calculateRecurringPreview` en begon daar bij
 * `new Date()`: vandaag mét de klok erbij. Die datum werd vergeleken met
 * `new Date(totEnMet)`, en dat is middernacht UTC. Een repetitie die precies
 * op de einddatum viel lag daardoor "later" dan de einddatum en verdween uit
 * het voorbeeld, terwijl het veld "tot en met" heet. Hier gaat het per hele
 * dag in UTC, zodat het tijdstip van de dag er niet meer toe doet.
 */
export function berekenHerhaalVoorbeeld(
  vanaf: string,
  dagVanDeWeek: number,
  interval: number,
  totEnMet: string,
  maximum = 52,
): string[] {
  if (!vanaf || !totEnMet) return [];

  const DAG_IN_MS = 24 * 60 * 60 * 1000;
  const eind = Date.parse(`${totEnMet}T00:00:00Z`);
  let huidig = Date.parse(`${vanaf}T00:00:00Z`);
  if (Number.isNaN(eind) || Number.isNaN(huidig)) return [];

  // Vooruit naar de eerste gekozen weekdag op of ná de begindatum. Zonder lus,
  // en zonder een `Date` die onderweg van waarde verandert.
  huidig += ((dagVanDeWeek - new Date(huidig).getUTCDay() + 7) % 7) * DAG_IN_MS;

  const stap = 7 * Math.max(1, interval) * DAG_IN_MS;
  const datums: string[] = [];
  while (huidig <= eind && datums.length < maximum) {
    datums.push(new Date(huidig).toISOString().split('T')[0]);
    huidig += stap;
  }
  return datums;
}
