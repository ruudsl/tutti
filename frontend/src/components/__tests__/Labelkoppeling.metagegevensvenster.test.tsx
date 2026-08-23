/**
 * De laatste drie formulierlabels van de labelopruiming.
 *
 * In `TitleMetadataModal` stonden boven het MusicXML-sleepvlak, de
 * instrumentkiezer en de genrekiezer nog drie kale `<label className="form-label">`
 * zonder `htmlFor`. Ze bleven bij de vorige ronde staan omdat die drie
 * componenten geen `id` aannamen: een `htmlFor` zou dan naar niets wijzen, en
 * dat is slechter dan geen `htmlFor` - het belooft een koppeling die er niet is.
 *
 * Nu nemen ze wel een `id` aan en geven ze die door aan het element dat de
 * gebruiker als eerste bedient, waardoor de drie labels via `FormField` kunnen
 * lopen net als de 274 velden ervoor.
 *
 * `getByLabelText` is daarom de kern van deze tests: die vindt een veld alleen
 * als de koppeling er echt is. De kliktest is de scherpste van de twee - die
 * kon vóór de reparatie onmogelijk slagen, want een `<label>` zonder `htmlFor`
 * verplaatst de aanwijzer nergens heen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleMetadataModal } from '../TitleMetadataModal';
import type { MusicTitle } from '../../types';

vi.mock('../../api');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// De drie kiezers worden hier juist NIET vervangen door een tijdelijke stand-in:
// deze test gaat over de koppeling tússen het venster en die componenten, en die
// verdwijnt zodra je er een leeg <div> voor in de plaats zet.
const uitgebreideMetagegevens = vi.hoisted(() => ({
  huidige: undefined as unknown,
}));

vi.mock('../../hooks/useVocabulary', () => ({
  useTitleMetadata: () => ({ data: uitgebreideMetagegevens.huidige, isLoading: false }),
  useUpdateTitleMetadata: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadMusicXML: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMusicXML: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInstrumentSearch: () => ({ data: undefined, isLoading: false }),
  useGenres: () => ({
    data: {
      genres: [
        { uri: 'genre:mars', label: 'March', labels: { nl: 'Mars', en: 'March', de: 'Marsch' } },
        { uri: 'genre:wals', label: 'Waltz', labels: { nl: 'Wals', en: 'Waltz', de: 'Walzer' } },
      ],
    },
    isLoading: false,
  }),
}));

function maakTitel(): MusicTitle {
  return {
    id: 'titel-1',
    title: 'Also sprach Zarathustra',
    arranger: null,
    pieceCount: 1,
    youtubeUrl: null,
    description: null,
    durationSeconds: 0,
    grade: null,
    genres: [],
    isShared: false,
    internalNotes: null,
  } as unknown as MusicTitle;
}

/**
 * Toon het venster met het uitklapblok 'uitgebreide metagegevens' open.
 *
 * Het blok klapt vanzelf open zodra er instrumenten of genres binnenkomen, dus
 * één gekozen instrument scheelt hier een klik. Datzelfde instrument levert
 * meteen de knoppenrij op waar de instrumentkiezer mee begint - handig, want
 * juist dáárom is het zoekveld eronder de plek waar het id hoort.
 */
async function toonMetUitgebreidBlok() {
  uitgebreideMetagegevens.huidige = {
    metadata: {},
    instruments: [{ uri: 'instr:hoorn', count: 2, isOptional: false, label: { nl: 'Hoorn', en: 'Horn' } }],
    genres: [],
  };

  const gebruiker = userEvent.setup();
  render(
    <TitleMetadataModal
      title={maakTitel()}
      genres={[]}
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await screen.findByText('metadata.musicXMLFile');
  return gebruiker;
}

beforeEach(() => {
  uitgebreideMetagegevens.huidige = undefined;
});

describe('metagegevensvenster - het MusicXML-bestandsveld', () => {
  it('vindt het bestandsveld op zijn labeltekst', async () => {
    await toonMetUitgebreidBlok();

    expect(screen.getByLabelText('metadata.musicXMLFile')).toHaveAttribute('type', 'file');
  });

  it('zet de aanwijzer in het bestandsveld als je op het label klikt', async () => {
    const gebruiker = await toonMetUitgebreidBlok();

    await gebruiker.click(screen.getByText('metadata.musicXMLFile'));

    expect(screen.getByLabelText('metadata.musicXMLFile')).toHaveFocus();
  });

  it('koppelt het label aan het bestandsveld en niet aan het sleepvlak eromheen', async () => {
    // Het sleepvlak blijft een <div>. Een <label> kan daar niet naartoe wijzen,
    // dus als het id daar beland zou zijn, zou getByLabelText hierboven
    // weliswaar iets vinden maar zou een klik nergens heen gaan.
    await toonMetUitgebreidBlok();

    const veld = screen.getByLabelText('metadata.musicXMLFile');
    expect(veld.tagName).toBe('INPUT');
    expect(veld.closest('[role="button"]')).not.toBeNull();
  });
});

describe('metagegevensvenster - het MusicXML-sleepvlak met het toetsenbord', () => {
  /**
   * De muisweg en de toetsenbordweg lopen hier langs verschillende elementen,
   * en dat is geen ontwerpkeuze van ons maar van react-dropzone: het sleepvlak
   * krijgt tabIndex 0 en het bestandsveld erbinnen tabIndex -1. Wie tabt landt
   * dus op het vlak, niet op het veld waar het label naartoe wijst. Daar stond
   * echter ook role="presentation" op, wat de betekenis er juist afhaalt - een
   * tabstop die niets aankondigt en niets belooft.
   */
  it('kondigt het sleepvlak aan als knop met de tekst die er zichtbaar staat', async () => {
    await toonMetUitgebreidBlok();

    const vlak = screen.getByRole('button', { name: 'metadata.dragMusicXML' });

    // De naam is exact de zichtbare tekst, zodat wie het vlak ziet en wie het
    // hoort hetzelfde woord gebruiken.
    expect(vlak).toHaveTextContent('metadata.dragMusicXML');
    // En het is echt de tabstop die react-dropzone aanwijst.
    expect(vlak).toHaveAttribute('tabindex', '0');
  });

  it('opent de bestandskiezer als je Enter op het sleepvlak drukt', async () => {
    const gebruiker = await toonMetUitgebreidBlok();

    // react-dropzone opent de kiezer door het verborgen bestandsveld aan te
    // klikken; in jsdom bestaat showOpenFilePicker niet, dus dat is hier de
    // enige weg. Een klik op dát veld is daarom het bewijs dat de kiezer opengaat.
    const kiezerGeopend = vi.fn();
    screen.getByLabelText('metadata.musicXMLFile').addEventListener('click', kiezerGeopend);

    screen.getByRole('button', { name: 'metadata.dragMusicXML' }).focus();
    await gebruiker.keyboard('{Enter}');

    expect(kiezerGeopend).toHaveBeenCalled();
  });
});

describe('metagegevensvenster - de instrumentkiezer', () => {
  it('vindt het zoekveld op de labeltekst en niet de knop van een gekozen instrument', async () => {
    await toonMetUitgebreidBlok();

    const veld = screen.getByLabelText('metadata.instruments');
    expect(veld).toHaveAttribute('placeholder', 'metadata.searchInstruments');
    // De knop '2x' van het al gekozen instrument staat er in de opmaak bóven;
    // die draagt zijn eigen naam en hoort het label niet te vangen.
    expect(veld.tagName).toBe('INPUT');
  });

  it('zet de aanwijzer in het zoekveld als je op het label klikt', async () => {
    const gebruiker = await toonMetUitgebreidBlok();

    await gebruiker.click(screen.getByText('metadata.instruments'));

    expect(screen.getByLabelText('metadata.instruments')).toHaveFocus();
  });
});

describe('metagegevensvenster - de genrekiezer', () => {
  it('vindt de openknop op de labeltekst', async () => {
    await toonMetUitgebreidBlok();

    const knop = screen.getByLabelText('metadata.jskosGenres');
    expect(knop.tagName).toBe('BUTTON');
    expect(knop).toHaveTextContent('metadata.selectGenres');
  });

  it('opent het genremenu als je op het label klikt en zet de aanwijzer erin', async () => {
    const gebruiker = await toonMetUitgebreidBlok();

    expect(screen.queryByPlaceholderText('metadata.filterGenres')).toBeNull();

    await gebruiker.click(screen.getByText('metadata.jskosGenres'));

    // De aanwijzer landt eerst op de knop, maar die knop opent daarmee meteen
    // het menu, en het filterveld daarin trekt de aanwijzer naar zich toe
    // (autoFocus). Eindstand is dus het filterveld, niet de knop - precies wat
    // een gebruiker wil. Dat het menu überhaupt opengaat, is het bewijs dat de
    // klik op het label bij de knop is uitgekomen: zonder htmlFor gebeurde er
    // niets en bleef de aanwijzer op <body> staan.
    expect(screen.getByPlaceholderText('metadata.filterGenres')).toHaveFocus();
  });
});

describe('metagegevensvenster - geen loze labels meer', () => {
  it('geeft elk label in het uitgebreide blok een htmlFor die ergens op uitkomt', async () => {
    // Dit is de eigenlijke opdracht: geen enkel <label> in dit venster mag nog
    // een lege belofte zijn. De labels ín de genrelijst horen bij een selectievakje
    // dat ze omsluiten en hebben daarom terecht geen htmlFor.
    await toonMetUitgebreidBlok();

    const losseLabels = Array.from(document.querySelectorAll('label')).filter(
      (label) => label.querySelector('input, select, textarea') === null,
    );

    expect(losseLabels.length).toBeGreaterThan(0);
    for (const label of losseLabels) {
      const doelId = label.getAttribute('for');
      expect(doelId, `label "${label.textContent}" heeft geen htmlFor`).toBeTruthy();
      expect(document.getElementById(doelId!), `htmlFor van "${label.textContent}" wijst nergens heen`).not.toBeNull();
    }
  });
});
