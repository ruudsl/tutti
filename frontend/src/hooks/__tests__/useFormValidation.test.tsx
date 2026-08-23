/**
 * Tests voor de toegankelijke formuliervalidatie.
 *
 * De hook praat rechtstreeks met de DOM: hij zoekt het veld op, zet de cursor
 * erin, hangt er aria-invalid aan en meldt de fout aan de schermlezer. Dat is
 * dus ook waar hier op getoetst wordt, inclusief veldnamen die niet zomaar in
 * een CSS-selector passen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { AriaLiveProvider } from '../../components/AriaLiveRegion';
import { useFormValidation, veldKenmerken } from '../useFormValidation';

/** Zet een invoerveld in het document en geeft het terug. */
function veld(kenmerken: Record<string, string>) {
  const input = document.createElement('input');
  for (const [naam, waarde] of Object.entries(kenmerken)) {
    input.setAttribute(naam, waarde);
  }
  document.body.appendChild(input);
  return input;
}

const metMeldingen = ({ children }: { children: ReactNode }) => createElement(AriaLiveProvider, null, children);

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom kent scrollIntoView niet.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFormValidation - naar de eerste fout springen', () => {
  it('zet de cursor in het eerste veld met een fout', () => {
    const email = veld({ name: 'email' });
    veld({ name: 'naam' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([
        { field: 'email', message: 'Vul een e-mailadres in' },
        { field: 'naam', message: 'Vul een naam in' },
      ]);
    });

    expect(document.activeElement).toBe(email);
  });

  it('markeert dat veld als ongeldig', () => {
    const email = veld({ name: 'email' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([{ field: 'email', message: 'Vul een e-mailadres in' }]);
    });

    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.classList.contains('has-error')).toBe(true);
  });

  it('vindt het veld ook via het id', () => {
    const input = veld({ id: 'telefoon' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([{ field: 'telefoon', message: 'Ongeldig nummer' }]);
    });

    expect(document.activeElement).toBe(input);
  });

  it('vindt het veld ook via data-field', () => {
    const input = veld({ 'data-field': 'geboortedatum' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([{ field: 'geboortedatum', message: 'Ongeldige datum' }]);
    });

    expect(document.activeElement).toBe(input);
  });

  it('raakt niet in de war van een veldnaam met blokhaken en punten', () => {
    // Namen als deze zijn normaal in samengestelde formulieren. Ze passen niet
    // als id in een CSS-selector; wie ze er toch in plakt laat querySelector
    // een SyntaxError gooien en daarmee het hele opslaan klappen.
    const input = veld({ name: 'stukken[0].titel' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([{ field: 'stukken[0].titel', message: 'Vul een titel in' }]);
    });

    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('klapt niet wanneer het veld helemaal niet op het scherm staat', () => {
    const { result } = renderHook(() => useFormValidation());

    expect(() => {
      act(() => {
        result.current.focusFirstError([{ field: 'bestaatniet', message: 'Fout' }]);
      });
    }).not.toThrow();
    expect(result.current.hasError('bestaatniet')).toBe(true);
  });

  it('doet niets bij een lege foutenlijst', () => {
    const email = veld({ name: 'email' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([]);
    });

    expect(document.activeElement).not.toBe(email);
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('scrollt het veld standaard in beeld', () => {
    const email = veld({ name: 'email' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([{ field: 'email', message: 'Fout' }]);
    });

    expect(email.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('klapt niet in een omgeving die scrollIntoView niet kent', () => {
    // Niet elke omgeving heeft die functie: jsdom niet, en oudere ingebouwde
    // webweergaven ook niet. Gooit deze regel, dan breekt niet alleen het
    // scrollen af maar de hele verzendafhandeling eromheen - en dan krijgt de
    // gebruiker helemaal geen foutmelding te zien.
    const email = veld({ name: 'email' });
    // @ts-expect-error - juist het ontbreken van de functie is wat hier telt.
    delete Element.prototype.scrollIntoView;
    const { result } = renderHook(() => useFormValidation());

    expect(() => {
      act(() => {
        result.current.focusFirstError([{ field: 'email', message: 'Fout' }]);
      });
    }).not.toThrow();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(email);
  });

  it('scrollt niet wanneer dat is uitgezet', () => {
    const email = veld({ name: 'email' });
    const { result } = renderHook(() => useFormValidation({ scrollToError: false }));

    act(() => {
      result.current.focusFirstError([{ field: 'email', message: 'Fout' }]);
    });

    expect(email.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(email);
  });
});

describe('useFormValidation - melden aan de schermlezer', () => {
  it('meldt een enkele fout dringend', () => {
    veld({ name: 'email' });
    const { result } = renderHook(() => useFormValidation(), { wrapper: metMeldingen });

    act(() => {
      result.current.focusFirstError([{ field: 'email', message: 'Vul een e-mailadres in' }]);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Validatiefout: Vul een e-mailadres in');
  });

  it('meldt bij meerdere fouten hoeveel het er zijn', () => {
    const { result } = renderHook(() => useFormValidation(), { wrapper: metMeldingen });

    act(() => {
      result.current.focusFirstError([
        { field: 'email', message: 'Vul een e-mailadres in' },
        { field: 'naam', message: 'Vul een naam in' },
      ]);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 validatiefouten gevonden. Eerste fout: Vul een e-mailadres in',
    );
  });

  it('meldt niets wanneer dat is uitgezet', () => {
    const { result } = renderHook(() => useFormValidation({ announceErrors: false }), { wrapper: metMeldingen });

    act(() => {
      result.current.focusFirstError([{ field: 'email', message: 'Vul een e-mailadres in' }]);
    });

    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });
});

describe('useFormValidation - fouten bijhouden', () => {
  it('onthoudt de fout per veld', () => {
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.setFieldError('email', 'Ongeldig adres');
    });

    expect(result.current.hasError('email')).toBe(true);
    expect(result.current.getError('email')).toBe('Ongeldig adres');
    expect(result.current.hasError('naam')).toBe(false);
    expect(result.current.getError('naam')).toBeUndefined();
  });

  it('markeert het veld op het scherm bij setFieldError', () => {
    const input = veld({ name: 'email' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.setFieldError('email', 'Ongeldig adres');
    });

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.classList.contains('has-error')).toBe(true);
  });

  it('haalt de markering van een enkel veld weer weg', () => {
    const email = veld({ name: 'email' });
    const naam = veld({ name: 'naam' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.setFieldError('email', 'Ongeldig adres');
      result.current.setFieldError('naam', 'Verplicht');
    });

    act(() => {
      result.current.clearErrors('email');
    });

    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(email.classList.contains('has-error')).toBe(false);
    expect(result.current.hasError('email')).toBe(false);
    // Het andere veld blijft staan.
    expect(naam.getAttribute('aria-invalid')).toBe('true');
    expect(result.current.hasError('naam')).toBe(true);
  });

  it('haalt met een lege aanroep alle markeringen weg', () => {
    const email = veld({ name: 'email' });
    const naam = veld({ name: 'naam' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.setFieldError('email', 'Ongeldig adres');
      result.current.setFieldError('naam', 'Verplicht');
    });

    act(() => {
      result.current.clearErrors();
    });

    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(naam.hasAttribute('aria-invalid')).toBe(false);
    expect(result.current.hasError('email')).toBe(false);
    expect(result.current.hasError('naam')).toBe(false);
  });

  it('wist ook een fout op een veld met blokhaken in de naam', () => {
    const input = veld({ name: 'stukken[0].titel' });
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.setFieldError('stukken[0].titel', 'Vul een titel in');
    });
    expect(input.getAttribute('aria-invalid')).toBe('true');

    act(() => {
      result.current.clearErrors('stukken[0].titel');
    });

    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('vervangt bij een nieuwe ronde de oude foutenlijst', () => {
    const { result } = renderHook(() => useFormValidation());

    act(() => {
      result.current.focusFirstError([{ field: 'email', message: 'Ongeldig adres' }]);
    });
    act(() => {
      result.current.focusFirstError([{ field: 'naam', message: 'Verplicht' }]);
    });

    expect(result.current.hasError('email')).toBe(false);
    expect(result.current.hasError('naam')).toBe(true);
  });
});

describe('veldKenmerken - de foutstatus in de toegankelijkheidsboom', () => {
  it('markeert een afgekeurd veld en wijst naar de melding', () => {
    // Deze twee horen bij elkaar: aria-invalid zegt dát het veld is afgekeurd,
    // aria-describedby zegt waarom. Zonder de tweede hoort een schermlezer
    // alleen "ongeldig" en blijft de melding op het scherm los tekstwerk.
    expect(veldKenmerken('email', 'Vul een e-mailadres in', 'email-fout')).toEqual({
      name: 'email',
      'aria-invalid': true,
      'aria-describedby': 'email-fout',
    });
  });

  it('laat een goedgekeurd veld ongemarkeerd', () => {
    // undefined en niet false: React laat het kenmerk dan helemaal weg. Een
    // aria-invalid="false" zou een schermlezer bij elk veld laten melden dat het
    // geldig is, en dat is ruis.
    expect(veldKenmerken('email', undefined, 'email-fout')).toEqual({
      name: 'email',
      'aria-invalid': undefined,
      'aria-describedby': undefined,
    });
  });

  it('houdt de hulptekst vast zolang het veld in orde is', () => {
    expect(veldKenmerken('wachtwoord', undefined, 'wachtwoord-fout', 'wachtwoord-hulp')['aria-describedby']).toBe(
      'wachtwoord-hulp',
    );
  });

  it('laat de foutmelding voorgaan op de hulptekst', () => {
    // Beide voorlezen zou de gebruiker bij een fout eerst de tip te horen geven
    // die hij net niet gevolgd heeft; de melding is op dat moment het nieuws.
    expect(veldKenmerken('wachtwoord', 'Te kort', 'wachtwoord-fout', 'wachtwoord-hulp')['aria-describedby']).toBe(
      'wachtwoord-fout',
    );
  });

  it('geeft het name-kenmerk mee waarop focusFirstError het veld terugvindt', () => {
    // Zonder name valt een veld dat alleen een door useId gemaakt id draagt
    // (":r3:") buiten het bereik van findFieldElement, en springt de cursor bij
    // een fout nergens heen.
    const input = document.createElement('input');
    const kenmerken = veldKenmerken('recipientEmail', 'Verplicht', 'email-fout');
    input.setAttribute('name', kenmerken.name);
    document.body.appendChild(input);

    const { result } = renderHook(() => useFormValidation());
    act(() => {
      result.current.focusFirstError([{ field: 'recipientEmail', message: 'Verplicht' }]);
    });

    expect(document.activeElement).toBe(input);
  });
});
