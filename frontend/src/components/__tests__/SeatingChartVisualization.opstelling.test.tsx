/**
 * De opstelling als tekening.
 *
 * Dit component tekent stoelen als SVG: per stoel een vorm met de voornaam en
 * de initialen van de achternaam, met de dirigent apart vooraan en een
 * samenvatting eronder. Alles wat een gebruiker hier doet - een stoel
 * aanwijzen, erop klikken - loopt via die vormen, en dat is zonder aan de
 * tekening te sleutelen te bereiken.
 *
 * Aanleiding voor het bestand: aan de serverkant kon een stoel twee keer
 * bezet raken. Wat doet deze tekening met zulke gegevens? Zie 'twee leden op
 * dezelfde plek'. Dat is een karakteriseringstest: het component controleert
 * niets, het tekent wat het krijgt. De twee namen komen op precies dezelfde
 * plek terecht en dekken elkaar af. Daarmee ligt vast dat het weren van een
 * dubbele bezetting van de server moet komen - deze tekening vangt het niet
 * op, en de gebruiker ziet alleen een naam die over een andere heen valt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeatingChartVisualization from '../SeatingChartVisualization';
import type { SeatingChart, SeatingChartSeat } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

function stoel(
  id: string,
  naam: string,
  rij: number,
  plek: number,
  extra: Partial<SeatingChartSeat> = {},
): SeatingChartSeat {
  return {
    id,
    userId: `u-${id}`,
    memberName: naam,
    instrumentName: 'Flute',
    rowNumber: rij,
    positionInRow: plek,
    sectionName: 'Hout',
    ...extra,
  };
}

function opstelling(stoelen: SeatingChartSeat[]): SeatingChart {
  return {
    orchestraId: 'ork-1',
    orchestraName: 'Harmonie Tutti',
    sections: [],
    seats: stoelen,
    totalRows: 2,
  };
}

/** De vorm (het pad) die bij een stoel met deze naam hoort. */
function stoelvorm(naam: string): SVGPathElement {
  return screen.getByText(naam).closest('g')!.querySelector('path')!;
}

describe('opstelling - de stoelen', () => {
  it('zet per stoel de voornaam en de initialen van de achternaam neer', () => {
    render(<SeatingChartVisualization chart={opstelling([stoel('s1', 'Anna van der Berg', 1, 1)])} />);

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('vdB')).toBeInTheDocument();
  });

  it('kapt een lange voornaam af op acht tekens', () => {
    render(<SeatingChartVisualization chart={opstelling([stoel('s1', 'Maximiliaan Jansen', 1, 1)])} />);

    expect(screen.getByText('Maximili')).toBeInTheDocument();
  });

  it('zet de rijen op volgorde en telt de stoelen per rij', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([
          stoel('s3', 'Chris Claassen', 2, 1),
          stoel('s1', 'Anna Aalders', 1, 1),
          stoel('s2', 'Bram Bakker', 1, 2),
        ])}
      />,
    );

    expect(screen.getByText('seating.rowLabel 1')).toBeInTheDocument();
    expect(screen.getByText('seating.rowLabel 2')).toBeInTheDocument();
    expect(screen.getByText('seating.chairCount 2')).toBeInTheDocument();
    expect(screen.getByText('seating.chairCount 1')).toBeInTheDocument();

    // Binnen een rij staan de stoelen op hun positie, dus Anna links van Bram.
    const anna = stoelvorm('Anna').closest('g')!.getAttribute('transform')!;
    const bram = stoelvorm('Bram').closest('g')!.getAttribute('transform')!;
    const x = (transform: string) => Number(transform.match(/translate\(([-\d.]+)/)![1]);
    expect(x(anna)).toBeLessThan(x(bram));
  });

  it('telt alleen de gewone stoelen als leden', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([
          stoel('s1', 'Anna Aalders', 1, 1),
          stoel('s2', 'Bram Bakker', 1, 2),
          stoel('d1', 'Dirk Dirigent', 0, 1, { isConductor: true }),
        ])}
      />,
    );

    expect(screen.getByText('seating.totalMembers').previousSibling).toHaveTextContent('2');
  });

  it('meldt de naam van het orkest onder de tekening', () => {
    render(<SeatingChartVisualization chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1)])} />);

    expect(screen.getByText('Harmonie Tutti')).toBeInTheDocument();
  });

  it('blijft overeind bij een lege opstelling', () => {
    render(<SeatingChartVisualization chart={opstelling([])} />);

    expect(screen.getByText('seating.totalMembers').previousSibling).toHaveTextContent('0');
    expect(screen.getByText('Harmonie Tutti')).toBeInTheDocument();
  });

  /**
   * Karakterisering, geen bewijs: dit legt vast wat er nú gebeurt.
   *
   * De server weigert sinds kort een stoel die al bezet is. Zou zo'n dubbele
   * bezetting toch in de gegevens komen, dan tekent dit component ze naast
   * elkaar in plaats van over elkaar heen: de plaats van een stoel volgt zijn
   * plek in de rij zoals die binnenkomt, niet het meegegeven stoelnummer.
   * Twee leden op stoel 1 worden dus twee stoelen, en de rij telt er één te
   * veel - in beeld een rij die een stoel breder is dan hij in de zaal staat.
   *
   * Om dezelfde reden verschuift een gat in de nummering alles naar links:
   * stoel 1 en stoel 5 komen als buren te staan. Wie dat wil verhelpen moet
   * `positionInRow` gaan gebruiken bij het plaatsen - dan hoort deze test om
   * te vallen, en dat is precies de bedoeling.
   */
  it('tekent twee leden op dezelfde plek als twee stoelen naast elkaar', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1), stoel('s2', 'Bram Bakker', 1, 1)])}
      />,
    );

    const anna = stoelvorm('Anna').closest('g')!.getAttribute('transform');
    const bram = stoelvorm('Bram').closest('g')!.getAttribute('transform');
    expect(anna).not.toBe(bram);
    expect(screen.getByText('seating.totalMembers').previousSibling).toHaveTextContent('2');
    // De rij telt er twee, terwijl er maar één stoelnummer in gebruik is.
    expect(screen.getByText('seating.chairCount 2')).toBeInTheDocument();
  });

  it('zet een gat in de stoelnummering niet om in een lege plek', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1), stoel('s2', 'Bram Bakker', 1, 5)])}
      />,
    );

    const x = (naam: string) =>
      Number(
        stoelvorm(naam)
          .closest('g')!
          .getAttribute('transform')!
          .match(/translate\(([-\d.]+)/)![1],
      );
    // Stoel 1 en stoel 5 komen als buren te staan: 80 breed plus 8 tussenruimte.
    expect(x('Bram') - x('Anna')).toBe(88);
  });
});

describe('opstelling - de dirigent', () => {
  it('zet een plaatshouder neer als er geen dirigent in de gegevens staat', () => {
    render(<SeatingChartVisualization chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1)])} />);

    expect(screen.getByText('seating.conductor')).toBeInTheDocument();
    expect(screen.queryByText('seating.conductors')).not.toBeInTheDocument();
  });

  it('herkent de dirigent aan rij nul, ook zonder vlaggetje', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('d1', 'Dirk Dirigent', 0, 1), stoel('s1', 'Anna Aalders', 1, 1)])}
      />,
    );

    expect(screen.getByText('Dirk')).toBeInTheDocument();
    expect(screen.getByText('seating.totalMembers').previousSibling).toHaveTextContent('1');
  });

  it('noemt er meer dan een in het meervoud en zet ze naast elkaar', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([
          stoel('d1', 'Dirk Dirigent', 0, 1, { isConductor: true }),
          stoel('d2', 'Ellen Elzinga', 0, 2, { isConductor: true }),
          stoel('s1', 'Anna Aalders', 1, 1),
        ])}
      />,
    );

    expect(screen.getByText('seating.conductors')).toBeInTheDocument();
    const dirk = screen.getByText('Dirk').closest('g')!.getAttribute('transform');
    const ellen = screen.getByText('Ellen').closest('g')!.getAttribute('transform');
    expect(dirk).not.toBe(ellen);
  });
});

describe('opstelling - aanwijzen en aanklikken', () => {
  it('meldt welke stoel is aangeklikt', async () => {
    const gebruiker = userEvent.setup();
    const bijKlik = vi.fn();
    render(<SeatingChartVisualization chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1)])} onSeatClick={bijKlik} />);

    await gebruiker.click(screen.getByText('Anna'));

    expect(bijKlik).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', memberName: 'Anna Aalders' }));
  });

  it('doet niets bij een klik als er niemand luistert', async () => {
    const gebruiker = userEvent.setup();
    render(<SeatingChartVisualization chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1)])} />);

    await gebruiker.click(screen.getByText('Anna'));

    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it('toont naam, instrument en sectie zolang de muis op de stoel staat', async () => {
    const gebruiker = userEvent.setup();
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1, { instrumentName: 'Clarinet', sectionName: 'Hout' })])}
      />,
    );

    await gebruiker.hover(screen.getByText('Anna'));

    const tip = document.querySelector('.seating-tooltip')!;
    expect(tip).toHaveTextContent('Anna Aalders');
    expect(tip).toHaveTextContent('Clarinet');
    expect(tip).toHaveTextContent('Hout');

    await gebruiker.unhover(screen.getByText('Anna'));
    expect(document.querySelector('.seating-tooltip')).toBeNull();
  });

  it('laat instrument en sectie weg als ze onbekend zijn', async () => {
    const gebruiker = userEvent.setup();
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1, { instrumentName: null, sectionName: null })])}
      />,
    );

    await gebruiker.hover(screen.getByText('Anna'));

    const tip = document.querySelector('.seating-tooltip')!;
    expect(tip).toHaveTextContent('Anna Aalders');
    expect(tip.children).toHaveLength(1);
  });

  it('zet een rand om de stoel van het uitgelichte lid', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1), stoel('s2', 'Bram Bakker', 1, 2)])}
        highlightUserId="u-s1"
      />,
    );

    expect(stoelvorm('Anna')).toHaveAttribute('stroke-width', '3');
    expect(stoelvorm('Bram')).toHaveAttribute('stroke-width', '0');
  });
});

describe('opstelling - kleuren en legenda', () => {
  it('geeft elke instrumentgroep zijn eigen kleur', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([
          stoel('s1', 'Anna Aalders', 1, 1, { instrumentName: 'Trumpet' }),
          stoel('s2', 'Bram Bakker', 1, 2, { instrumentName: 'Tuba' }),
        ])}
      />,
    );

    expect(stoelvorm('Anna')).toHaveAttribute('fill', '#E74C3C');
    expect(stoelvorm('Bram')).toHaveAttribute('fill', '#27AE60');
  });

  it('herkent een instrument ook als er iets voor staat', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1, { instrumentName: 'First Trumpet' })])}
      />,
    );

    expect(stoelvorm('Anna')).toHaveAttribute('fill', '#E74C3C');
  });

  it('valt terug op grijs bij een onbekend of ontbrekend instrument', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([
          stoel('s1', 'Anna Aalders', 1, 1, { instrumentName: 'Doedelzak' }),
          stoel('s2', 'Bram Bakker', 1, 2, { instrumentName: null }),
        ])}
      />,
    );

    expect(stoelvorm('Anna')).toHaveAttribute('fill', '#7F8C8D');
    expect(stoelvorm('Bram')).toHaveAttribute('fill', '#7F8C8D');
  });

  it('zet in de legenda alleen de groepen die in deze opstelling voorkomen', () => {
    render(
      <SeatingChartVisualization
        chart={opstelling([stoel('s1', 'Anna Aalders', 1, 1, { instrumentName: 'Trumpet' })])}
      />,
    );

    const legenda = document.querySelector('.seating-legend')!;
    expect(legenda).toHaveTextContent('Trumpet');
    expect(legenda).not.toHaveTextContent('Tuba');
  });

  it('houdt de legenda op twaalf regels', () => {
    const instrumenten = [
      'Flute',
      'Oboe',
      'Clarinet',
      'Bass Clarinet',
      'Alto Saxophone',
      'Tenor Saxophone',
      'French Horn',
      'Trumpet',
      'Cornet',
      'Euphonium',
      'Tuba',
      'Trombone',
      'Piano',
      'Guitar',
    ];
    render(
      <SeatingChartVisualization
        chart={opstelling(
          instrumenten.map((naam, i) => stoel(`s${i}`, `Lid${i} Achternaam`, 1, i + 1, { instrumentName: naam })),
        )}
      />,
    );

    expect(document.querySelector('.seating-legend')!.children).toHaveLength(12);
  });
});
