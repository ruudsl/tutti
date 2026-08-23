import { useCallback, useRef } from 'react';
import { useAriaLive } from '../components/AriaLiveRegion';

export interface ValidationError {
  field: string;
  message: string;
}

/** Kenmerken die een veld ook voor een schermlezer als afgekeurd markeren. */
export interface VeldKenmerken {
  name: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

/**
 * Geeft de kenmerken waarmee een veld afgekeurd in de toegankelijkheidsboom
 * belandt, klaar om in JSX uit te spreiden.
 *
 * Waarom naast setFieldError nog deze kant? Omdat setFieldError de DOM
 * rechtstreeks beschrijft en React daar overheen tekent. React onthoudt per
 * element welke kenmerkwaarde het zelf gezet heeft en slaat een schrijfactie
 * over zodra die waarde niet verandert. Een aria-invalid dat alleen met
 * setAttribute is neergezet staat dus niet in die boekhouding: React haalt hem
 * er nooit meer af, en het veld blijft voor een schermlezer afgekeurd nadat de
 * gebruiker het al lang verbeterd heeft. Hetzelfde geldt voor de klasse
 * has-error, die bovendien meteen sneuvelt zodra React className een keer
 * herschrijft.
 *
 * Daarom tekent het formulier de foutstatus zelf mee - vanuit react-hook-form
 * of een eigen useState - en doet focusFirstError daarnaast wat JSX niet kan:
 * de cursor verplaatsen en de fout dringend melden.
 *
 * `name` hoort bij deze kenmerken omdat findFieldElement daarop zoekt. Zonder
 * name vindt focusFirstError het veld niet en springt de cursor nergens heen;
 * dat is bij een veld dat alleen een door useId gemaakt id draagt precies wat
 * er gebeurde.
 *
 * @param veld       Naam van het veld, dezelfde die in focusFirstError gebruikt wordt.
 * @param melding    De foutmelding, of undefined wanneer het veld in orde is.
 * @param foutId     Het id van het element waar die melding in staat.
 * @param hulpId     Het id van een hulptekst die bij een goedgekeurd veld hoort.
 */
export function veldKenmerken(
  veld: string,
  melding: string | undefined,
  foutId: string,
  hulpId?: string,
): VeldKenmerken {
  return {
    name: veld,
    'aria-invalid': melding ? true : undefined,
    // Een veld dat afgekeurd is hoort ook te vertellen wát er mis is: zonder
    // deze verwijzing hoort een schermlezer wel "ongeldig", maar niet waarom.
    'aria-describedby': melding ? foutId : hulpId,
  };
}

interface UseFormValidationOptions {
  /** Announce errors to screen readers */
  announceErrors?: boolean;
  /** Scroll to the first error */
  scrollToError?: boolean;
}

/**
 * Zoekt het invoerelement dat bij een veldnaam hoort.
 *
 * Namen uit samengestelde formulieren ("stukken[0].titel") zijn geen geldige
 * CSS-identifier. Zo'n naam achter een `#` in een selector plakken laat
 * querySelector een SyntaxError gooien, waardoor het valideren halverwege
 * afbreekt en de gebruiker helemaal geen foutmelding te zien krijgt. Daarom
 * zoeken we op kenmerk via een selector en op id via getElementById, dat geen
 * selector hoeft te ontleden.
 */
function findFieldElement(field: string): HTMLElement | null {
  const value = field.replace(/(["\\])/g, '\\$1');
  const byAttribute = document.querySelector<HTMLElement>(`[name="${value}"], [data-field="${value}"]`);
  if (byAttribute) return byAttribute;
  return document.getElementById(field);
}

/**
 * Hook for accessible form validation with focus management.
 *
 * When validation errors occur, this hook will:
 * 1. Focus the first field with an error
 * 2. Announce the error to screen readers via ARIA live regions
 * 3. Optionally scroll to bring the error into view
 *
 * Let op wie wat bezit. `errors` hierboven is een ref, geen state: het aanpassen
 * ervan tekent niets opnieuw. De foutenlijst waar het formulier op tekent hoort
 * dus bij het formulier zelf te blijven (react-hook-form of useState), en deze
 * hook doet de twee dingen die het tekenen niet kan: de cursor verplaatsen en
 * de fout dringend melden. Voor het tekenen levert hij veldKenmerken.
 *
 * @example
 * ```tsx
 * function MijnFormulier() {
 *   const { focusFirstError, veldKenmerken } = useFormValidation();
 *   const [fouten, setFouten] = useState<Record<string, string>>({});
 *
 *   const verzend = (e) => {
 *     e.preventDefault();
 *     const gevonden = valideer(formulierData);
 *     setFouten(Object.fromEntries(gevonden.map((f) => [f.field, f.message])));
 *     if (gevonden.length > 0) {
 *       focusFirstError(gevonden);
 *       return;
 *     }
 *     // Opslaan...
 *   };
 *
 *   return (
 *     <form onSubmit={verzend}>
 *       <input
 *         id="email"
 *         {...veldKenmerken('email', fouten.email, 'email-fout')}
 *         className={`form-control ${fouten.email ? 'has-error' : ''}`}
 *       />
 *       {fouten.email && <span id="email-fout" className="form-error">{fouten.email}</span>}
 *     </form>
 *   );
 * }
 * ```
 */
export function useFormValidation(options: UseFormValidationOptions = {}) {
  const { announceErrors = true, scrollToError = true } = options;
  const { announce } = useAriaLive();
  const errorsRef = useRef<Record<string, string>>({});

  /**
   * Focus the first field with a validation error.
   * Also announces the error(s) to screen readers.
   */
  const focusFirstError = useCallback(
    (errors: ValidationError[]) => {
      if (errors.length === 0) return;

      // Update errors ref
      const errorMap: Record<string, string> = {};
      errors.forEach(({ field, message }) => {
        errorMap[field] = message;
      });
      errorsRef.current = errorMap;

      // Find and focus the first error field
      const firstError = errors[0];
      const element = findFieldElement(firstError.field);

      if (element) {
        // Set aria-invalid on the element
        //
        // Bewust geen aria-describedby hier: dat kenmerk hoort bij het tekenen
        // en wordt door veldKenmerken gezet. Wie het hier met setAttribute zou
        // neerzetten en in clearErrors weer weghaalt, wist ook de verwijzing
        // die React zelf had getekend - en React schrijft die niet terug zolang
        // de prop niet verandert. Het veld zou dan permanent zonder
        // foutmelding-verwijzing achterblijven.
        element.setAttribute('aria-invalid', 'true');
        element.classList.add('has-error');

        // Focus the element
        element.focus({ preventScroll: !scrollToError });

        // Scroll into view if needed
        //
        // De controle op de functie is geen overdaad. Zolang geen enkele pagina
        // deze hook aanriep viel het niet op, maar in een omgeving zonder
        // scrollIntoView - jsdom, en oudere ingebouwde webweergaven - gooit deze
        // regel. Die uitzondering breekt niet alleen het scrollen af maar de
        // hele verzendafhandeling eromheen, waardoor react-hook-form zijn
        // foutenlijst niet meer wegschrijft en de gebruiker helemaal geen
        // foutmelding te zien krijgt. Precies het tegenovergestelde van wat
        // deze hook moet doen.
        if (scrollToError && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      // Announce errors to screen readers
      if (announceErrors) {
        const errorCount = errors.length;
        const announcement =
          errorCount === 1
            ? `Validatiefout: ${firstError.message}`
            : `${errorCount} validatiefouten gevonden. Eerste fout: ${firstError.message}`;
        announce(announcement, 'assertive');
      }
    },
    [announce, announceErrors, scrollToError],
  );

  /**
   * Set error state for a specific field.
   */
  const setFieldError = useCallback((field: string, message: string) => {
    errorsRef.current = { ...errorsRef.current, [field]: message };

    const element = findFieldElement(field);

    if (element) {
      element.setAttribute('aria-invalid', 'true');
      element.classList.add('has-error');
    }
  }, []);

  /**
   * Clear error state for a specific field or all fields.
   */
  const clearErrors = useCallback((field?: string) => {
    if (field) {
      delete errorsRef.current[field];
      const element = findFieldElement(field);
      if (element) {
        element.removeAttribute('aria-invalid');
        element.classList.remove('has-error');
      }
    } else {
      // Clear all errors
      Object.keys(errorsRef.current).forEach((f) => {
        const element = findFieldElement(f);
        if (element) {
          element.removeAttribute('aria-invalid');
          element.classList.remove('has-error');
        }
      });
      errorsRef.current = {};
    }
  }, []);

  /**
   * Check if a field has an error.
   */
  const hasError = useCallback((field: string) => {
    return !!errorsRef.current[field];
  }, []);

  /**
   * Get the error message for a field.
   */
  const getError = useCallback((field: string) => {
    return errorsRef.current[field];
  }, []);

  return {
    focusFirstError,
    setFieldError,
    clearErrors,
    hasError,
    getError,
    // Zelfde functie als de losse export, zodat een formulier met één aanroep
    // van deze hook zowel het springen als het tekenen kan regelen.
    veldKenmerken,
    errors: errorsRef.current,
  };
}

export default useFormValidation;
