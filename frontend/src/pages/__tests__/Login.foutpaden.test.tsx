/**
 * Het inlogscherm: wat een bezoeker ziet als het misgaat.
 *
 * Dit is de voordeur van de applicatie, en juist daar telt wat er NIET gebeurt:
 * een verkeerd wachtwoord, een geblokkeerd account en de snelheidsbegrenzer
 * moeten alle drie hun eigen melding tonen zonder dat het scherm de bezoeker
 * wegstuurt of het wachtwoord ergens laat staan waar het niet hoort.
 *
 * Drie dingen worden hier bewaakt en niet bewezen (de code deed het al goed;
 * deze tests houden het zo):
 *
 * 1. `wacht` - het wachtwoord komt niet in de URL terecht. De pagina verstuurt
 *    via een POST-lichaam, dus `navigate` mag nooit iets met het wachtwoord
 *    erin aanroepen, en de zoekstring van het venster moet leeg blijven. Een
 *    formulier zonder `onSubmit` dat op `method="get"` terugvalt zou het
 *    wachtwoord wél in de adresbalk zetten; daar loopt deze test tegenaan.
 *
 * 2. `wacht` - het wachtwoord komt niet in een logregel. console.error en
 *    console.warn worden opgevangen en op de tekst nagekeken. De catch-tak op
 *    het inlogscherm logt nu niets; zodra iemand daar een `console.error(err)`
 *    bij zet met het verstuurde object erin, wordt dit rood.
 *
 * 3. `wacht` - een 401 van het inlogeindpunt zet de bezoeker niet buiten de
 *    deur. De opvangketen van de api-cliënt maakt een uitzondering voor
 *    /auth/login; deze test kijkt of de melding op het scherm belandt in plaats
 *    van dat het scherm leegloopt.
 *
 * In de testgegevens staat nergens iets dat op een echt wachtwoord lijkt: het
 * veld wordt gevuld met de tekst 'onjuist-veld' respectievelijk 'geheim-veld'.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

// Alles wat een mock-fabriek gebruikt moet met vi.mock mee omhoog.
const { stand } = vi.hoisted(() => ({
  stand: {
    inloggen: vi.fn(),
    navigatie: vi.fn(),
    slug: undefined as string | undefined,
    huisstijl: { displayName: 'Tutti', logoUrl: null as string | null },
    microsoftAan: false,
    microsoftUrl: vi.fn(),
  },
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => stand.navigatie,
  useParams: () => ({ slug: stand.slug }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: stand.inloggen }),
}));

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(async () => ({ data: stand.huisstijl })),
  },
}));

vi.mock('../../api/integrations', () => ({
  getMicrosoftEnabled: async () => ({ enabled: stand.microsoftAan }),
  getMicrosoftLoginUrl: (...args: unknown[]) => stand.microsoftUrl(...args),
}));

vi.mock('../../components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));
vi.mock('../../components/LazyImage', () => ({
  LazyImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('../../components/SocialLoginButtons', () => ({ default: () => <div data-testid="sociaal" /> }));

/** Een afgewezen aanroep zoals axios die teruggeeft: status plus lichaam. */
function serverfout(status: number, melding: string) {
  return Object.assign(new Error('verzoek mislukt'), {
    response: { status, data: { error: melding } },
  });
}

async function velInFormulier(wachtwoordtekst = 'onjuist-veld') {
  const gebruiker = userEvent.setup();
  render(<Login />);
  await gebruiker.type(await screen.findByLabelText('auth.email'), 'lid@example.org');
  await gebruiker.type(screen.getByLabelText('auth.password'), wachtwoordtekst);
  await gebruiker.click(screen.getByRole('button', { name: 'auth.loginButton' }));
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  stand.slug = undefined;
  stand.huisstijl = { displayName: 'Tutti', logoUrl: null };
  stand.microsoftAan = false;
  window.history.replaceState({}, '', '/login');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inlogscherm - foutpaden', () => {
  it('toont de melding van de server bij een verkeerd wachtwoord en laat de bezoeker op het scherm staan', async () => {
    stand.inloggen.mockRejectedValue(serverfout(401, 'Ongeldige inloggegevens.'));

    await velInFormulier();

    // De melding is dringend aangekondigd, zodat een schermlezer hem meteen
    // voorleest in plaats van pas bij de volgende aanraking.
    const melding = await screen.findByRole('alert');
    expect(melding).toHaveTextContent('Ongeldige inloggegevens.');
    expect(melding).toHaveAttribute('aria-live', 'assertive');

    // Niet doorgestuurd: een 401 van het inlogeindpunt is geen verlopen sessie.
    expect(stand.navigatie).not.toHaveBeenCalled();
    // Het e-mailveld staat er nog, dus de bezoeker kan het opnieuw proberen.
    expect(screen.getByLabelText('auth.email')).toHaveValue('lid@example.org');
  });

  it('toont de blokkademelding van een vergrendeld account', async () => {
    stand.inloggen.mockRejectedValue(
      serverfout(429, 'Te veel mislukte pogingen. Het account is tijdelijk geblokkeerd.'),
    );

    await velInFormulier();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Te veel mislukte pogingen. Het account is tijdelijk geblokkeerd.',
    );
  });

  it('toont de melding van de snelheidsbegrenzer', async () => {
    stand.inloggen.mockRejectedValue(serverfout(429, 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.'));

    await velInFormulier();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.',
    );
  });

  it('valt terug op een eigen melding als de server er geen meegeeft', async () => {
    // Een netwerkstoring heeft helemaal geen response; dan mag het scherm niet
    // leeg blijven of "undefined" tonen.
    stand.inloggen.mockRejectedValue(new Error('Network Error'));

    await velInFormulier();

    expect(await screen.findByRole('alert')).toHaveTextContent('auth.loginFailed');
  });

  // wacht - de code deed dit al goed; dit houdt het zo.
  it('zet het wachtwoord niet in de URL', async () => {
    stand.inloggen.mockRejectedValue(serverfout(401, 'Ongeldige inloggegevens.'));

    await velInFormulier('geheim-veld');
    await screen.findByRole('alert');

    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('geheim-veld');
    for (const aanroep of stand.navigatie.mock.calls) {
      expect(JSON.stringify(aanroep)).not.toContain('geheim-veld');
    }
  });

  // wacht - de catch-tak logt nu niets; zodra daar een console.error(err) bij
  // komt met het verstuurde object erin, wordt dit rood.
  it('zet het wachtwoord niet in een logregel', async () => {
    const regels: string[] = [];
    for (const soort of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, soort).mockImplementation((...delen: unknown[]) => {
        regels.push(delen.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))).join(' '));
      });
    }

    stand.inloggen.mockRejectedValue(serverfout(401, 'Ongeldige inloggegevens.'));
    await velInFormulier('geheim-veld');
    await screen.findByRole('alert');

    expect(regels.join('\n')).not.toContain('geheim-veld');
  });

  it('stuurt het wachtwoord in het verzoeklichaam mee en niet als queryreeks', async () => {
    stand.inloggen.mockResolvedValue({ requiresMfa: false, token: 'x' });

    await velInFormulier('geheim-veld');

    // Precies drie losse waarden: e-mail, wachtwoord, code. Geen samengestelde
    // reeks waar het wachtwoord in een pad of zoekstring zou kunnen belanden.
    expect(stand.inloggen).toHaveBeenCalledWith('lid@example.org', 'geheim-veld', undefined);
    await waitFor(() => expect(stand.navigatie).toHaveBeenCalledWith('/'));
  });
});

describe('inlogscherm - tweestapsverificatie', () => {
  it('vraagt om de code zodra de server erom vraagt en verbergt dan het wachtwoordveld', async () => {
    stand.inloggen.mockResolvedValue({ requiresMfa: true });

    await velInFormulier();

    expect(await screen.findByLabelText('auth.mfa.code')).toBeInTheDocument();
    // Het wachtwoordveld is weg: er is niets meer in te typen op dit punt.
    expect(screen.queryByLabelText('auth.password')).toBeNull();
    // Doorgaan kan pas met zes cijfers.
    expect(screen.getByRole('button', { name: 'auth.mfa.verify' })).toBeDisabled();
  });

  it('laat alleen cijfers toe in het codeveld en hoogstens zes', async () => {
    stand.inloggen.mockResolvedValue({ requiresMfa: true });
    const gebruiker = await velInFormulier();

    const codeveld = await screen.findByLabelText('auth.mfa.code');
    await gebruiker.type(codeveld, 'a1b2c3d4e5f6g7');

    expect(codeveld).toHaveValue('123456');
    expect(screen.getByRole('button', { name: 'auth.mfa.verify' })).toBeEnabled();
  });

  it('stuurt de code mee bij de tweede poging', async () => {
    stand.inloggen.mockResolvedValueOnce({ requiresMfa: true }).mockResolvedValueOnce({ token: 'x' });
    const gebruiker = await velInFormulier();

    await gebruiker.type(await screen.findByLabelText('auth.mfa.code'), '123456');
    await gebruiker.click(screen.getByRole('button', { name: 'auth.mfa.verify' }));

    await waitFor(() => expect(stand.inloggen).toHaveBeenLastCalledWith('lid@example.org', 'onjuist-veld', '123456'));
    await waitFor(() => expect(stand.navigatie).toHaveBeenCalledWith('/'));
  });

  it('leegt de code na een verkeerde code, zodat er geen half getal blijft staan', async () => {
    stand.inloggen
      .mockResolvedValueOnce({ requiresMfa: true })
      .mockRejectedValueOnce(serverfout(401, 'Ongeldige code.'));
    const gebruiker = await velInFormulier();

    await gebruiker.type(await screen.findByLabelText('auth.mfa.code'), '123456');
    await gebruiker.click(screen.getByRole('button', { name: 'auth.mfa.verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ongeldige code.');
    await waitFor(() => expect(screen.getByLabelText('auth.mfa.code')).toHaveValue(''));
  });

  it('wist het wachtwoord bij terugkeer naar het inlogscherm', async () => {
    stand.inloggen.mockResolvedValue({ requiresMfa: true });
    const gebruiker = await velInFormulier('geheim-veld');

    await gebruiker.click(await screen.findByRole('button', { name: 'auth.mfa.backToLogin' }));

    // Terug op stap één, en het wachtwoordveld is leeg: het blijft niet in het
    // scherm hangen terwijl de bezoeker iets anders doet.
    expect(screen.getByLabelText('auth.password')).toHaveValue('');
    expect(screen.getByLabelText('auth.email')).toHaveValue('lid@example.org');
  });
});

describe('inlogscherm - huisstijl en andere ingangen', () => {
  it('toont de naam die de server teruggeeft, met een logo als dat er is', async () => {
    stand.huisstijl = { displayName: 'Harmonie Sint Caecilia', logoUrl: '/logo.png' };

    render(<Login />);

    const logo = await screen.findByAltText('Harmonie Sint Caecilia');
    expect(logo).toHaveAttribute('src', '/logo.png');
    // Met een logo hoeft het noteniconen er niet ook nog bij.
    expect(screen.queryByTestId('icoon-music')).toBeNull();
  });

  it('valt terug op de neutrale naam met noticoon als er geen logo is', async () => {
    render(<Login />);

    expect(await screen.findByRole('heading', { name: /Tutti/ })).toBeInTheDocument();
    expect(screen.getByTestId('icoon-music')).toBeInTheDocument();
  });

  it('toont de Microsoft-knop alleen als die vereniging hem aan heeft staan', async () => {
    render(<Login />);
    await screen.findByLabelText('auth.email');
    expect(screen.queryByRole('button', { name: /auth.microsoft.loginButton/ })).toBeNull();

    stand.microsoftAan = true;
    render(<Login />);
    expect(await screen.findByRole('button', { name: /auth.microsoft.loginButton/ })).toBeInTheDocument();
  });

  it('toont een melding als de Microsoft-ingang faalt, in plaats van stil te blijven', async () => {
    stand.microsoftAan = true;
    stand.microsoftUrl.mockRejectedValue(serverfout(500, 'Microsoft is niet bereikbaar.'));
    const gebruiker = userEvent.setup();

    render(<Login />);
    await gebruiker.click(await screen.findByRole('button', { name: /auth.microsoft.loginButton/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Microsoft is niet bereikbaar.');
    // De knop is weer bruikbaar: een mislukking mag hem niet blijvend uitzetten.
    expect(screen.getByRole('button', { name: /auth.microsoft.loginButton/ })).toBeEnabled();
  });

  it('houdt het wachtwoordveld weg zolang de tweede stap loopt', async () => {
    stand.microsoftAan = true;
    stand.inloggen.mockResolvedValue({ requiresMfa: true });
    await velInFormulier();

    await screen.findByLabelText('auth.mfa.code');
    // Tijdens de tweede stap staat er geen tweede ingang op het scherm die de
    // eerste stap zou overslaan.
    expect(screen.queryByRole('button', { name: /auth.microsoft.loginButton/ })).toBeNull();
    expect(screen.queryByTestId('sociaal')).toBeNull();
  });
});
