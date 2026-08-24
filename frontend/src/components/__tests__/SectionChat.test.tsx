/**
 * De stemgroepchat, zoals een lid hem ziet.
 *
 * Aan de serverkant is eerder gevonden dat de sectiechat van een andere
 * vereniging mee te lezen was. Dat is daar gedicht, maar het scherm zelf houdt
 * ook een stukje van die grens vast: het kiest welk kanaal er open staat en
 * welke berichten er dus opgevraagd worden. Die keuze wordt hieronder over de
 * grens heen getrokken - een lid dat van vereniging wisselt, een kanaal dat uit
 * de lijst verdwijnt - en dan hoort er niets van de vorige vereniging te blijven
 * staan.
 *
 * De hooks eromheen zijn afgevangen: dit gaat over wat er op het scherm
 * verschijnt, niet over de netwerklaag. Er gaat dus geen enkel verzoek uit.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { chat, aanmelding } = vi.hoisted(() => ({
  chat: {
    kanalen: [] as any[],
    kanalenLaden: false,
    berichten: [] as any[],
    berichtenLaden: false,
    pins: [] as any[],
    verstuur: vi.fn(),
    bewerk: vi.fn(),
    verwijder: vi.fn(),
    pin: vi.fn(),
  },
  aanmelding: { user: null as { id: string; role: string } | null },
}));

vi.mock('../../hooks/useSectionChat', () => ({
  useChatChannels: () => ({ data: chat.kanalen, isLoading: chat.kanalenLaden }),
  useChatMessages: (kanaalId: string) => ({
    // Zo doet de cache het ook: berichten horen bij één kanaal. Vraagt het
    // scherm een kanaal op dat er niet is, dan komt er niets terug.
    data: chat.berichten.filter((b) => b.channelId === kanaalId),
    isLoading: chat.berichtenLaden,
  }),
  usePinnedMessages: (kanaalId: string) => ({ data: chat.pins.filter((p) => p.channelId === kanaalId) }),
  useSendMessage: () => ({ mutateAsync: chat.verstuur, isPending: false }),
  useEditMessage: () => ({ mutateAsync: chat.bewerk, isPending: false }),
  useDeleteMessage: () => ({ mutateAsync: chat.verwijder, isPending: false }),
  usePinMessage: () => ({ mutateAsync: chat.pin, isPending: false }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: aanmelding.user }),
}));

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
      i18n: { language: 'nl' },
    }),
  };
});

import { SectionChat } from '../SectionChat';

function kanaal(id: string, naam: string, vereniging: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: naam,
    unreadCount: 0,
    messageCount: 0,
    createdAt: '2026-08-01T10:00:00.000Z',
    instrument: { id: 'inst-' + id, name: naam },
    orchestra: { id: 'ver-' + vereniging, name: vereniging },
    ...extra,
  };
}

function bericht(id: string, kanaalId: string, inhoud: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    channelId: kanaalId,
    content: inhoud,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-08-23T10:00:00.000Z',
    user: { id: 'lid-2', name: 'Bea Bas' },
    ...extra,
  };
}

/** De kop boven het gesprek, of null als er geen kanaal open staat. */
function kopOpScherm(): string | null {
  const pinknop = document.querySelector('.btn-sm .lucide-bookmark');
  return pinknop?.closest('.p-3.border-b.bg-base-200')?.textContent ?? null;
}

/** De inhoud van de berichtenkolom, als losse regels. */
function berichtenOpScherm(): string {
  const invoer = screen.getByPlaceholderText('Typ een bericht...');
  return invoer.closest('.flex-1.flex.flex-col')?.textContent ?? '';
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-08-23T11:00:00.000Z') });
  chat.kanalen = [];
  chat.kanalenLaden = false;
  chat.berichten = [];
  chat.berichtenLaden = false;
  chat.pins = [];
  chat.verstuur.mockReset().mockResolvedValue({});
  chat.bewerk.mockReset().mockResolvedValue({});
  chat.verwijder.mockReset().mockResolvedValue({});
  chat.pin.mockReset().mockResolvedValue({});
  aanmelding.user = { id: 'lid-1', role: 'member' };
  Element.prototype.scrollIntoView = vi.fn();
});

describe('zonder kanalen', () => {
  it('toont een molentje zolang de lijst laadt', () => {
    chat.kanalenLaden = true;

    const { container } = render(<SectionChat />);

    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Typ een bericht...')).not.toBeInTheDocument();
  });

  it('legt uit wat een lid zonder stemgroep moet doen', () => {
    chat.kanalen = [];

    render(<SectionChat />);

    expect(screen.getByText('Je bent nog niet lid van een stemgroep')).toBeInTheDocument();
    expect(screen.getByText('Vraag een beheerder om je instrument toe te wijzen')).toBeInTheDocument();
  });
});

describe('de kanalenlijst', () => {
  it('noemt bij elk kanaal de vereniging waar het bij hoort', () => {
    // Een lid van twee verenigingen ziet anders twee keer "Klarinet" staan en
    // weet niet in welke groep het typt.
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Harmonie Concordia'), kanaal('k2', 'Klarinet', 'Fanfare Sint Jan')];

    render(<SectionChat />);

    const knoppen = screen.getAllByRole('button', { name: /Klarinet/ });
    expect(knoppen[0]).toHaveTextContent('Harmonie Concordia');
    expect(knoppen[1]).toHaveTextContent('Fanfare Sint Jan');
  });

  it('toont hoeveel berichten er ongelezen zijn', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia', { unreadCount: 3 })];

    render(<SectionChat />);

    expect(screen.getByRole('button', { name: /Klarinet/ })).toHaveTextContent('3');
  });

  it('opent het eerste kanaal vanzelf', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia'), kanaal('k2', 'Hoorn', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Bericht uit Klarinet')];

    render(<SectionChat />);

    expect(screen.getByText('Bericht uit Klarinet')).toBeInTheDocument();
  });

  it('laat bij het wisselen van kanaal alleen de berichten van dat kanaal zien', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia'), kanaal('k2', 'Hoorn', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Alleen voor de klarinetten'), bericht('b2', 'k2', 'Alleen voor de hoorns')];
    render(<SectionChat />);
    expect(screen.getByText('Alleen voor de klarinetten')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: /Hoorn/ }));

    expect(screen.getByText('Alleen voor de hoorns')).toBeInTheDocument();
    expect(screen.queryByText('Alleen voor de klarinetten')).not.toBeInTheDocument();
  });
});

describe('de grens tussen verenigingen', () => {
  it('laat na het wisselen van vereniging geen bericht van de vorige staan', async () => {
    // BEWIJS. Dit was fout. Het scherm koos het eerste kanaal alleen zolang er
    // nog geen keuze was: `if (channels.length > 0 && !selectedChannelId)`.
    // Wisselt een lid van vereniging, dan komt er een nieuwe kanalenlijst
    // binnen, maar `selectedChannelId` blijft op het kanaal van de vórige
    // vereniging staan - dat is een waarde, dus de voorwaarde slaat aan noch
    // over. Het scherm bleef daarna de berichten van dat oude kanaal opvragen
    // en tonen, terwijl de kop erboven verdween omdat het kanaal niet meer in
    // de lijst voorkwam. Precies het lek dat aan de serverkant gedicht is, maar
    // dan vanuit het scherm zelf.
    //
    // Op de oude code is deze test rood: "Intern overleg Concordia" staat er
    // dan nog steeds.
    const { rerender } = render(<SectionChat orchestraId="ver-Concordia" />);
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Intern overleg Concordia'), bericht('b2', 'k9', 'Intern overleg Sint Jan')];
    rerender(<SectionChat orchestraId="ver-Concordia" />);
    expect(screen.getByText('Intern overleg Concordia')).toBeInTheDocument();

    // Het lid wisselt naar de andere vereniging: andere kanalen, ander kanaal-id.
    chat.kanalen = [kanaal('k9', 'Klarinet', 'Sint Jan')];
    rerender(<SectionChat orchestraId="ver-SintJan" />);

    await waitFor(() => expect(screen.queryByText('Intern overleg Concordia')).not.toBeInTheDocument());
    expect(screen.getByText('Intern overleg Sint Jan')).toBeInTheDocument();
  });

  it('laat de kop meelopen met de vereniging die open staat', async () => {
    const { rerender } = render(<SectionChat orchestraId="ver-Concordia" />);
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Harmonie Concordia')];
    rerender(<SectionChat orchestraId="ver-Concordia" />);

    chat.kanalen = [kanaal('k9', 'Klarinet', 'Fanfare Sint Jan')];
    rerender(<SectionChat orchestraId="ver-SintJan" />);

    // BEWIJS, langs dezelfde weg. De kop hangt aan het gekozen kanaal. Bleef de
    // keuze op het kanaal van de vorige vereniging staan, dan werd dat kanaal
    // niet meer in de lijst gevonden en verdween de kop helemaal: het lid typte
    // in een gesprek zonder te zien waar het bij hoorde. Op de oude code is
    // deze test rood, want kopOpScherm() geeft dan null.
    await waitFor(() => expect(kopOpScherm()).toContain('Fanfare Sint Jan'));
    expect(kopOpScherm()).not.toContain('Harmonie Concordia');
  });

  it('valt terug op een ander kanaal als het gekozen kanaal wordt ingetrokken', async () => {
    // Wordt een lid uit een stemgroep gehaald, dan verdwijnt dat kanaal uit de
    // lijst. Het gesprek mag daarna niet gewoon open blijven staan.
    const { rerender } = render(<SectionChat />);
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia'), kanaal('k2', 'Hoorn', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Klarinetoverleg'), bericht('b2', 'k2', 'Hoornoverleg')];
    rerender(<SectionChat />);
    expect(screen.getByText('Klarinetoverleg')).toBeInTheDocument();

    chat.kanalen = [kanaal('k2', 'Hoorn', 'Concordia')];
    rerender(<SectionChat />);

    await waitFor(() => expect(screen.queryByText('Klarinetoverleg')).not.toBeInTheDocument());
    expect(screen.getByText('Hoornoverleg')).toBeInTheDocument();
  });

  it('stuurt een bericht naar het kanaal dat op dat moment open staat', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia'), kanaal('k2', 'Hoorn', 'Concordia')];
    render(<SectionChat />);
    await gebruiker.click(screen.getByRole('button', { name: /Hoorn/ }));

    await gebruiker.type(screen.getByPlaceholderText('Typ een bericht...'), 'Tot zondag');
    await gebruiker.click(
      screen.getByRole('button', { name: '' }).closest('form')!.querySelector('button[type=submit]')!,
    );

    expect(chat.verstuur).toHaveBeenCalledWith({ channelId: 'k2', content: 'Tot zondag', replyToId: undefined });
  });
});

describe('berichten lezen', () => {
  it('meldt het als een kanaal nog leeg is', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [];

    render(<SectionChat />);

    expect(screen.getByText('Nog geen berichten. Start het gesprek!')).toBeInTheDocument();
  });

  it('zet de naam, de tijd en de inhoud bij elkaar', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Tot zondag')];

    render(<SectionChat />);

    expect(berichtenOpScherm()).toContain('Bea Bas');
    expect(berichtenOpScherm()).toContain('Tot zondag');
    expect(berichtenOpScherm()).toMatch(/geleden/);
  });

  it('merkt een bewerkt bericht als bewerkt aan', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Toch anders', { isEdited: true })];

    render(<SectionChat />);

    expect(screen.getByText('(bewerkt)')).toBeInTheDocument();
  });

  it('toont waar een bericht een antwoord op is', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [
      bericht('b2', 'k1', 'Ja, prima', {
        replyTo: { id: 'b1', content: 'Zullen we een half uur eerder beginnen?', userName: 'Cor Cello' },
      }),
    ];

    render(<SectionChat />);

    expect(berichtenOpScherm()).toContain('Cor Cello');
    expect(berichtenOpScherm()).toContain('Zullen we een half uur eerder beginnen?');
  });

  it('klapt de vastgepinde berichten open en weer dicht', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.pins = [bericht('b1', 'k1', 'Repetitieschema staat vast')];
    render(<SectionChat />);
    expect(screen.queryByText('Vastgepinde berichten')).not.toBeInTheDocument();

    const pinknop = screen.getByRole('button', { name: '1' });
    await gebruiker.click(pinknop);
    expect(screen.getByText('Vastgepinde berichten')).toBeInTheDocument();

    await gebruiker.click(pinknop);
    expect(screen.queryByText('Vastgepinde berichten')).not.toBeInTheDocument();
  });
});

describe('wat een lid met een bericht mag', () => {
  it('mag zijn eigen bericht bewerken en verwijderen, dat van een ander niet', () => {
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [
      bericht('b1', 'k1', 'Van iemand anders'),
      bericht('b2', 'k1', 'Van mijzelf', { user: { id: 'lid-1', name: 'Aad Alt' } }),
    ];

    render(<SectionChat />);

    expect(screen.getAllByRole('button', { name: 'Bewerken' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Verwijderen' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Beantwoorden' })).toHaveLength(2);
  });

  it('mag niet vastpinnen zonder de rol daarvoor', () => {
    aanmelding.user = { id: 'lid-1', role: 'member' };
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Van iemand anders')];

    render(<SectionChat />);

    expect(screen.queryByRole('button', { name: 'Vastpinnen' })).not.toBeInTheDocument();
  });

  it('mag wel vastpinnen als dirigent', async () => {
    const gebruiker = userEvent.setup();
    aanmelding.user = { id: 'lid-1', role: 'conductor' };
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Van iemand anders')];
    render(<SectionChat />);

    await gebruiker.click(screen.getByRole('button', { name: 'Vastpinnen' }));

    expect(chat.pin).toHaveBeenCalledWith('b1');
  });

  it('noemt een al vastgepind bericht losmaken', () => {
    aanmelding.user = { id: 'lid-1', role: 'admin' };
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Staat vast', { isPinned: true })];

    render(<SectionChat />);

    expect(screen.getByRole('button', { name: 'Losmaken' })).toBeInTheDocument();
  });
});

describe('een bericht versturen', () => {
  it('houdt de verstuurknop uit tot er iets getypt is', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    render(<SectionChat />);
    const knop = document.querySelector('button[type=submit]') as HTMLButtonElement;

    expect(knop).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('Typ een bericht...'), 'Hoi');
    expect(knop).toBeEnabled();
  });

  it('verstuurt niets als er alleen spaties staan', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    render(<SectionChat />);

    await gebruiker.type(screen.getByPlaceholderText('Typ een bericht...'), '   {Enter}');

    expect(chat.verstuur).not.toHaveBeenCalled();
  });

  it('maakt het invoerveld leeg na het versturen', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    render(<SectionChat />);
    const invoer = screen.getByPlaceholderText('Typ een bericht...');

    await gebruiker.type(invoer, 'Tot zondag{Enter}');

    await waitFor(() => expect(invoer).toHaveValue(''));
    expect(chat.verstuur).toHaveBeenCalledWith({ channelId: 'k1', content: 'Tot zondag', replyToId: undefined });
  });

  it('hangt een antwoord aan het bericht waarop geantwoord wordt', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Zullen we eerder beginnen?')];
    render(<SectionChat />);

    await gebruiker.click(screen.getByRole('button', { name: 'Beantwoorden' }));
    expect(screen.getByText('Antwoord op')).toBeInTheDocument();
    await gebruiker.type(screen.getByPlaceholderText('Typ een bericht...'), 'Ja prima{Enter}');

    expect(chat.verstuur).toHaveBeenCalledWith({ channelId: 'k1', content: 'Ja prima', replyToId: 'b1' });
  });

  it('laat het antwoorden weer los na het versturen', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Zullen we eerder beginnen?')];
    render(<SectionChat />);
    await gebruiker.click(screen.getByRole('button', { name: 'Beantwoorden' }));

    await gebruiker.type(screen.getByPlaceholderText('Typ een bericht...'), 'Ja prima{Enter}');

    await waitFor(() => expect(screen.queryByText('Antwoord op')).not.toBeInTheDocument());
  });
});

describe('bewerken en verwijderen', () => {
  it('bewerkt een eigen bericht met Enter', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Tot zondag', { user: { id: 'lid-1', name: 'Aad Alt' } })];
    render(<SectionChat />);

    await gebruiker.click(screen.getByRole('button', { name: 'Bewerken' }));
    const veld = screen.getByDisplayValue('Tot zondag');
    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'Tot maandag{Enter}');

    expect(chat.bewerk).toHaveBeenCalledWith({ messageId: 'b1', content: 'Tot maandag' });
  });

  it('laat het bewerken los met Escape, zonder op te slaan', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Tot zondag', { user: { id: 'lid-1', name: 'Aad Alt' } })];
    render(<SectionChat />);
    await gebruiker.click(screen.getByRole('button', { name: 'Bewerken' }));

    await gebruiker.type(screen.getByDisplayValue('Tot zondag'), '{Escape}');

    expect(chat.bewerk).not.toHaveBeenCalled();
    expect(screen.getByText('Tot zondag')).toBeInTheDocument();
  });

  it('vraagt eerst om bevestiging voor het verwijderen', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Weg hiermee', { user: { id: 'lid-1', name: 'Aad Alt' } })];
    render(<SectionChat />);

    await gebruiker.click(screen.getByRole('button', { name: 'Verwijderen' }));

    expect(screen.getByText('Weet je zeker dat je dit bericht wilt verwijderen?')).toBeInTheDocument();
    expect(chat.verwijder).not.toHaveBeenCalled();
  });

  it('verwijdert pas na bevestigen', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Weg hiermee', { user: { id: 'lid-1', name: 'Aad Alt' } })];
    render(<SectionChat />);
    await gebruiker.click(screen.getByRole('button', { name: 'Verwijderen' }));

    const venster = screen.getByRole('alertdialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'Verwijderen' }));

    expect(chat.verwijder).toHaveBeenCalledWith('b1');
  });

  it('verwijdert niets als de bevestiging wordt afgebroken', async () => {
    const gebruiker = userEvent.setup();
    chat.kanalen = [kanaal('k1', 'Klarinet', 'Concordia')];
    chat.berichten = [bericht('b1', 'k1', 'Weg hiermee', { user: { id: 'lid-1', name: 'Aad Alt' } })];
    render(<SectionChat />);
    await gebruiker.click(screen.getByRole('button', { name: 'Verwijderen' }));

    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuleren' }));

    expect(chat.verwijder).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
