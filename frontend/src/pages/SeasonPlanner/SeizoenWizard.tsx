import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlannedConcert, SeasonTemplate } from '../../api';
import { getErrorMessage } from '../../utils/errors';
import type { ConcertType, Orchestra } from '../../types';
import { useCreateSeason, useGenerateSeasonEvents } from '../../hooks/useSeasons';
import { defaultWizardState } from './types';
import type { WizardState, WizardStep } from './types';
import { WizardStapInfo } from './WizardStapInfo';
import { WizardStapRepetities } from './WizardStapRepetities';
import { WizardStapConcerten } from './WizardStapConcerten';
import { WizardStapBudget } from './WizardStapBudget';
import { WizardStapOverzicht } from './WizardStapOverzicht';

/**
 * De wizard waarmee een nieuw seizoen wordt opgezet: vijf stappen, een
 * voortgangsbalk en onderaan vorige/volgende.
 *
 * Alles wat alleen de wizard aangaat staat nu hier: de wizardtoestand, de
 * berekende repetitiedata, het totaalbudget, de stapcontrole en het afronden.
 * In SeasonPlanner.tsx stond dat allemaal in de hoofdcomponent, waar het
 * eerder al niet buiten de wizard gebruikt werd.
 *
 * Dat de toestand meeverhuist is geen gedragswijziging. De hoofdcomponent zette
 * hem in `startWizard` terug op de standaardwaarden vóór hij de wizard toonde,
 * en de wizard is de enige plek waar hij gelezen werd. Nu de wizard alleen
 * bestaat zolang hij in beeld is, doet het aankoppelen precies hetzelfde: elke
 * keer dat je hem opent begin je bij de standaardwaarden op stap 1.
 *
 * Naar buiten toe zijn er maar twee dingen: sluiten zonder iets te doen, en
 * klaar zijn met een vers seizoensnummer.
 */
export function SeizoenWizard({
  templates,
  orchestras,
  concertTypes,
  onSluiten,
  onKlaar,
}: {
  templates: SeasonTemplate[];
  orchestras: Orchestra[];
  concertTypes: ConcertType[];
  onSluiten: () => void;
  onKlaar: (seizoenId: string) => void;
}) {
  const { t } = useTranslation();

  const createSeason = useCreateSeason();
  const generateEvents = useGenerateSeasonEvents();

  const [wizardStep, setWizardStep] = useState<WizardStep>('info');
  const [wizardState, setWizardState] = useState<WizardState>(defaultWizardState);

  /**
   * De melding die op de overzichtsstap verschijnt als het afronden mislukt.
   *
   * De mutaties tonen zelf al een toast, maar die is weg voor je hem gezien
   * hebt en de gebruiker blijft op dezelfde stap staan: de knop lijkt dan
   * gewoon niets gedaan te hebben. Andere pagina's zetten bij zo'n mislukking
   * een `alert alert-danger` op het scherm (zie Login.tsx, Tuner.tsx); dat doet
   * de wizard nu ook, met dezelfde tekst als de toast.
   */
  const [afrondFout, setAfrondFout] = useState<string | null>(null);

  /**
   * Het seizoen dat al bij de server staat, met het kenmerk waarmee het daar
   * is aangemaakt.
   *
   * Afronden zijn twee aanroepen achter elkaar: eerst het seizoen aanmaken, dan
   * de evenementen erin genereren. Mislukte die tweede, dan sprong de code naar
   * de catch en verdween het verse seizoensnummer, terwijl het seizoen op dat
   * moment al op de server stond. Een tweede druk op afronden begon dus weer
   * vooraan en maakte een tweede seizoen aan met dezelfde naam en dezelfde
   * periode; drie keer drukken gaf drie seizoenen. Daarom wordt het nummer hier
   * bewaard en doet een volgende poging alleen het genereren nog over.
   *
   * Er staat een kenmerk bij en niet alleen het nummer, want hergebruiken mag
   * alleen zolang de gebruiker hetzelfde seizoen aan het maken is. Loopt hij na
   * de mislukking terug naar stap 1 en typt hij een andere naam of periode, dan
   * hoort daar een nieuw seizoen bij; gebruikten we het onthouden nummer dan
   * toch, dan plakten we de evenementen aan het seizoen van de vorige poging -
   * evenementen in een seizoen waar ze niet horen, en dat is erger dan het
   * dubbele seizoen dat we net weghaalden. Het kenmerk is precies de tekstvorm
   * van de velden die naar de aanmaakroute gaan, dus zodra daar iets aan
   * verandert, wordt er weer een seizoen aangemaakt.
   *
   * Het seizoen van die eerste poging blijft dan wel staan, leeg en zonder
   * evenementen. Dat laten we zo: het weggooien is een verwijdering die de
   * gebruiker niet gevraagd heeft, en hij ziet het gewoon in de seizoenenlijst
   * terug.
   *
   * De tweede manier om opnieuw te beginnen is de wizard verlaten en opnieuw
   * openen. Die is vanzelf gedekt: SeasonPlanner koppelt de wizard dan los, en
   * met de wizard verdwijnt ook deze toestand - net als de rest van de
   * wizardgegevens.
   */
  const [aangemaaktSeizoen, setAangemaaktSeizoen] = useState<{ id: string; kenmerk: string } | null>(null);

  // Calculated rehearsal preview
  const rehearsalPreview = useMemo(() => {
    if (!wizardState.startDate || !wizardState.endDate || !wizardState.generateRehearsals) {
      return [];
    }

    const dates: string[] = [];
    const start = new Date(wizardState.startDate);
    const end = new Date(wizardState.endDate);
    const excludeSet = new Set(wizardState.excludedDates);

    // Find first occurrence of selected day
    const current = new Date(start);
    while (current.getDay() !== wizardState.rehearsalDay && current <= end) {
      current.setDate(current.getDate() + 1);
    }

    // Generate dates
    while (current <= end && dates.length < 60) {
      const dateStr = current.toISOString().split('T')[0];
      if (!excludeSet.has(dateStr)) {
        dates.push(dateStr);
      }
      current.setDate(current.getDate() + 7);
    }

    return dates;
  }, [
    wizardState.startDate,
    wizardState.endDate,
    wizardState.rehearsalDay,
    wizardState.excludedDates,
    wizardState.generateRehearsals,
  ]);

  // Calculate total budget from concerts
  const totalConcertBudget = useMemo(() => {
    return wizardState.concerts.reduce((sum, c) => sum + (c.budgetAmount || 0), 0);
  }, [wizardState.concerts]);

  // Apply template to wizard state
  const applyTemplate = (template: SeasonTemplate) => {
    setWizardState((prev) => ({
      ...prev,
      templateId: template.id,
      rehearsalDay: template.defaultRehearsalDay ?? prev.rehearsalDay,
      rehearsalTime: template.defaultRehearsalTime || prev.rehearsalTime,
      rehearsalLocation: template.defaultRehearsalLocation || prev.rehearsalLocation,
      // Generate default concert slots based on template
      concerts:
        prev.concerts.length === 0
          ? Array(template.typicalConcertsCount)
              .fill(null)
              .map((_, i) => ({
                name: `Concert ${i + 1}`,
                date: '',
                location: '',
                type: '',
                budgetAmount: 0,
              }))
          : prev.concerts,
    }));
  };

  // Step validation
  const isStepValid = (step: WizardStep): boolean => {
    switch (step) {
      case 'info':
        return !!wizardState.name && !!wizardState.startDate && !!wizardState.endDate;
      case 'rehearsals':
        return !wizardState.generateRehearsals || rehearsalPreview.length > 0;
      case 'concerts':
        return !wizardState.generateConcerts || wizardState.concerts.every((c) => !c.name || (c.name && c.date));
      case 'budget':
        return true;
      case 'review':
        return true;
      default:
        return true;
    }
  };

  const steps: { id: WizardStep; label: string }[] = [
    { id: 'info', label: t('seasonPlanner.steps.info') },
    { id: 'rehearsals', label: t('seasonPlanner.steps.rehearsals') },
    { id: 'concerts', label: t('seasonPlanner.steps.concerts') },
    { id: 'budget', label: t('seasonPlanner.steps.budget') },
    { id: 'review', label: t('seasonPlanner.steps.review') },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === wizardStep);

  const goToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setWizardStep(steps[currentStepIndex + 1].id);
    }
  };

  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setWizardStep(steps[currentStepIndex - 1].id);
    }
  };

  const handleFinishWizard = async () => {
    setAfrondFout(null);

    const seizoensgegevens = {
      name: wizardState.name,
      startDate: wizardState.startDate,
      endDate: wizardState.endDate,
      templateId: wizardState.templateId || undefined,
      budgetTotal: wizardState.budgetTotal || undefined,
      notes: wizardState.notes || undefined,
    };
    const kenmerk = JSON.stringify(seizoensgegevens);

    // Al een seizoen van een vorige poging, en gaat het nog om hetzelfde
    // seizoen? Dan is aanmaken al gebeurd en hoeft alleen het genereren nog.
    let seizoenId = aangemaaktSeizoen && aangemaaktSeizoen.kenmerk === kenmerk ? aangemaaktSeizoen.id : null;

    try {
      // Create the season
      if (!seizoenId) {
        const result = await createSeason.mutateAsync(seizoensgegevens);
        seizoenId = result.id;
        setAangemaaktSeizoen({ id: result.id, kenmerk });
      }

      // Generate events
      const validConcerts = wizardState.concerts.filter((c) => c.name && c.date);

      await generateEvents.mutateAsync({
        seasonId: seizoenId,
        params: {
          generateRehearsals: wizardState.generateRehearsals,
          generateConcerts: wizardState.generateConcerts && validConcerts.length > 0,
          rehearsalDay: wizardState.rehearsalDay,
          rehearsalTime: wizardState.rehearsalTime,
          rehearsalEndTime: wizardState.rehearsalEndTime,
          rehearsalLocation: wizardState.rehearsalLocation || undefined,
          orchestraId: wizardState.orchestraId || undefined,
          excludeDates: wizardState.excludedDates,
          concerts: validConcerts,
        },
      });

      onKlaar(seizoenId);
    } catch (error) {
      // De toast komt van de mutatie zelf; hier blijft de melding staan zolang
      // de gebruiker op de overzichtsstap is, zodat zichtbaar is dat er iets
      // misging en wat.
      //
      // Staat het seizoen al op de server, dan komt daar een zin bij. Anders
      // leest de gebruiker alleen dat er iets misging, ziet hij zijn seizoen
      // even later toch in de lijst staan en begrijpt hij er niets van.
      const melding = getErrorMessage(error);
      setAfrondFout(seizoenId ? `${melding} ${t('seasonPlanner.wizard.seasonAlreadyCreated')}` : melding);
    }
  };

  const addConcert = () => {
    setWizardState((prev) => ({
      ...prev,
      concerts: [...prev.concerts, { name: '', date: '', location: '', type: '', budgetAmount: 0 }],
    }));
  };

  const removeConcert = (index: number) => {
    setWizardState((prev) => ({
      ...prev,
      concerts: prev.concerts.filter((_, i) => i !== index),
    }));
  };

  const updateConcert = (index: number, field: keyof PlannedConcert, value: string | number) => {
    setWizardState((prev) => ({
      ...prev,
      concerts: prev.concerts.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  };

  const toggleExcludeDate = (date: string) => {
    setWizardState((prev) => ({
      ...prev,
      excludedDates: prev.excludedDates.includes(date)
        ? prev.excludedDates.filter((d) => d !== date)
        : [...prev.excludedDates, date],
    }));
  };

  return (
    <div>
      <button className="btn btn-outline mb-3" onClick={() => onSluiten()}>
        &larr; {t('common.back')}
      </button>

      <h1>{t('seasonPlanner.wizard.title')}</h1>

      {/* Progress Steps */}
      <div className="flex gap-1 mb-4" style={{ marginTop: '1rem' }}>
        {steps.map((step, index) => (
          <div
            key={step.id}
            className="flex-1"
            style={{
              padding: '0.75rem',
              background:
                index === currentStepIndex
                  ? 'var(--primary)'
                  : index < currentStepIndex
                    ? 'var(--success)'
                    : 'var(--border)',
              color: index <= currentStepIndex ? 'white' : 'inherit',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
              cursor: index < currentStepIndex ? 'pointer' : 'default',
              fontSize: '0.875rem',
            }}
            onClick={() => index < currentStepIndex && setWizardStep(step.id)}
          >
            {index + 1}. {step.label}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="card">
        <div className="card-body">
          {/* Step 1: Basic Info */}
          {wizardStep === 'info' && (
            <WizardStapInfo
              wizardState={wizardState}
              setWizardState={setWizardState}
              templates={templates}
              applyTemplate={applyTemplate}
            />
          )}

          {/* Step 2: Rehearsals */}
          {wizardStep === 'rehearsals' && (
            <WizardStapRepetities
              wizardState={wizardState}
              setWizardState={setWizardState}
              orchestras={orchestras}
              rehearsalPreview={rehearsalPreview}
              toggleExcludeDate={toggleExcludeDate}
            />
          )}

          {/* Step 3: Concerts */}
          {wizardStep === 'concerts' && (
            <WizardStapConcerten
              wizardState={wizardState}
              setWizardState={setWizardState}
              concertTypes={concertTypes}
              addConcert={addConcert}
              removeConcert={removeConcert}
              updateConcert={updateConcert}
            />
          )}

          {/* Step 4: Budget */}
          {wizardStep === 'budget' && (
            <WizardStapBudget
              wizardState={wizardState}
              totalConcertBudget={totalConcertBudget}
              updateConcert={updateConcert}
            />
          )}

          {/* Step 5: Review */}
          {wizardStep === 'review' && (
            <WizardStapOverzicht wizardState={wizardState} rehearsalPreview={rehearsalPreview} />
          )}

          {afrondFout && (
            <div className="alert alert-danger" role="alert" style={{ marginTop: '1rem' }}>
              {afrondFout}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={goToPreviousStep}
            disabled={currentStepIndex === 0}
          >
            &larr; {t('common.previous')}
          </button>
          <div className="flex gap-2">
            {wizardStep === 'review' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleFinishWizard}
                disabled={!isStepValid(wizardStep) || createSeason.isPending || generateEvents.isPending}
              >
                {createSeason.isPending || generateEvents.isPending
                  ? t('common.loading')
                  : t('seasonPlanner.wizard.finish')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goToNextStep}
                disabled={!isStepValid(wizardStep)}
              >
                {t('common.next')} &rarr;
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
