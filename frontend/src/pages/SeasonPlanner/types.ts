/**
 * Gedeelde types en vaste waarden van de seizoensplanner.
 *
 * Deze stonden bovenaan het oude SeasonPlanner.tsx, buiten de component. Nu de
 * pagina uit meerdere bestanden bestaat hebben de wizard en zijn stappen ze
 * allemaal nodig; hier staan ze één keer.
 */

import { ROLES } from '../../utils/constants';
import type { PlannedConcert } from '../../api';

export const MANAGER_ROLES = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

export type WizardStep = 'info' | 'rehearsals' | 'concerts' | 'budget' | 'review';

export const WEEKDAYS = [
  { value: 0, label: 'Zondag' },
  { value: 1, label: 'Maandag' },
  { value: 2, label: 'Dinsdag' },
  { value: 3, label: 'Woensdag' },
  { value: 4, label: 'Donderdag' },
  { value: 5, label: 'Vrijdag' },
  { value: 6, label: 'Zaterdag' },
];

export interface WizardState {
  // Step 1: Basic Info
  name: string;
  startDate: string;
  endDate: string;
  templateId: string;
  budgetTotal: number | null;
  notes: string;

  // Step 2: Rehearsals
  generateRehearsals: boolean;
  rehearsalDay: number;
  rehearsalTime: string;
  rehearsalEndTime: string;
  rehearsalLocation: string;
  orchestraId: string;
  excludedDates: string[];

  // Step 3: Concerts
  generateConcerts: boolean;
  concerts: PlannedConcert[];

  // Step 4: Budget
  // Budget per concert is in concerts array
}

export const defaultWizardState: WizardState = {
  name: '',
  startDate: '',
  endDate: '',
  templateId: '',
  budgetTotal: null,
  notes: '',
  generateRehearsals: true,
  rehearsalDay: 2, // Tuesday
  rehearsalTime: '19:30',
  rehearsalEndTime: '21:30',
  rehearsalLocation: '',
  orchestraId: '',
  excludedDates: [],
  generateConcerts: true,
  concerts: [],
};

/**
 * De velden van het sjabloonformulier.
 *
 * Stond in SeasonPlanner.tsx als een `useState` zonder eigen type. Het
 * formulier is nu een eigen bestand, en dan moet de vorm ergens te benoemen
 * zijn; de waarden zijn ongewijzigd.
 */
export interface TemplateFormState {
  name: string;
  description: string;
  defaultRehearsalDay: number;
  defaultRehearsalTime: string;
  defaultRehearsalDuration: number;
  defaultRehearsalLocation: string;
  typicalConcertsCount: number;
}
