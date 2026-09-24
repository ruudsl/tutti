import { useId, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../context/ModulesContext';
import { ROLES } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';
import { leesTekstbestand } from '../utils/leesTekstbestand';
import {
  bekijkImport,
  voerImportUit,
  type ApparatuurGegevens,
  type Beoordeling,
  type ContactGegevens,
  type ImportSoort,
  type InstrumentGegevens,
  type ImportUitkomst,
  type ImportVoorbeeld,
  type LidGegevens,
  type RegelStatus,
  type TitelGegevens,
  type UniformGegevens,
} from '../api/importeren';

/**
 * Leden, de muziekbibliotheek, instrumenten in bezit, contacten, uniformen en
 * apparatuur inlezen uit een spreadsheet (WP11).
 *
 * Kies een bestand, bekijk per regel wat er gebeurt, en importeer. Het
 * voorbeeld verandert niets; bij het importeren beoordeelt de server het
 * bestand opnieuw. Wie welke soort mag, volgt de routes in
 * backend/src/routes/importeren.ts; instrumenten, contacten, uniformen en
 * apparatuur verschijnen alleen als hun module aan staat.
 */

/** Per soort de rollen die hem mogen importeren, en de module waar hij bij hoort. */
const SOORTEN: { soort: ImportSoort; rollen: string[]; module?: string }[] = [
  { soort: 'leden', rollen: [ROLES.ADMIN] },
  { soort: 'muziektitels', rollen: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
  { soort: 'instrumenten', rollen: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE], module: 'inventory' },
  { soort: 'contacten', rollen: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE], module: 'contacts' },
  { soort: 'uniformen', rollen: [ROLES.ADMIN, ROLES.UNIFORMS_COMMITTEE], module: 'inventory' },
  { soort: 'apparatuur', rollen: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE], module: 'inventory' },
];

/** Een voorbeeldbestand per soort, met de kolomnamen die herkend worden. */
const SJABLONEN: Record<ImportSoort, string> = {
  leden: [
    'Voornaam;Tussenvoegsel;Achternaam;E-mail;Rol;Instrument;Orkest',
    'Anna;;Jansen;anna@voorbeeld.nl;lid;Trompet;Harmonie',
    'Bram;de;Vries;bram@voorbeeld.nl;dirigent;;Harmonie, Jeugdorkest',
  ].join('\r\n'),
  muziektitels: [
    'Titel;Componist;Arrangeur;Duur;Graad;Genre',
    'Bolero;Maurice Ravel;Jan de Haan;15:30;4;Classical',
    'Mars der Medici;Johan Wichers;;4:00;2;',
  ].join('\r\n'),
  instrumenten: [
    'Naam;Soort;Categorie;Merk;Model;Serienummer;Bouwjaar;Aankoopdatum;Aankoopprijs;Status;Staat;Locatie',
    'Trompet 1;Trompet;Koperblazers;Yamaha;YTR-2330;123456;2015;15-03-2016;1.249,50;uitgeleend;goed;Kast 2',
    'Grote trom;Grote trom;Slagwerk;Premier;;;;;;beschikbaar;redelijk;Repetitielokaal',
  ].join('\r\n'),
  contacten: [
    'Naam;Soort;Contactpersoon;E-mail;Telefoon;Adres;Postcode;Plaats;IBAN;Website;Categorie',
    'Muziekhandel De Toon;leverancier;Piet de Wit;info@detoon.nl;030-1234567;Kerkstraat 1;3511 AB;Utrecht;;www.detoon.nl;',
    'Stadsschouwburg;zaal;;;;;;Zwolle;;;',
  ].join('\r\n'),
  uniformen: [
    'Soort;Maat;Lengte;Wijdte;Kleur;Aantal;Staat;Status;Uitgegeven aan;Uitgiftedatum',
    'Jas;52;;;Bordeauxrood;4;goed;beschikbaar;;',
    'Broek;;84;32;Zwart;1;goed;;anna@voorbeeld.nl;01-09-2024',
  ].join('\r\n'),
  apparatuur: [
    'Naam;Soort;Inventarisnummer;Merk;Model;Serienummer;Status;Staat;Locatie;Aankoopprijs;Laatste onderhoud;Onderhoudsinterval;Uitleenbaar',
    'Mengtafel;geluid;;Yamaha;MG12XU;Y-123456;beschikbaar;goed;Repetitielokaal;449,00;15-01-2025;12;nee',
    'Lessenaar 1;meubilair;;K&M;;;;redelijk;Kast 3;;;;ja',
  ].join('\r\n'),
};

/** Welke lijst in de rest van de app na een import opnieuw opgehaald moet worden. */
const TE_VERVERSEN: Record<ImportSoort, string> = {
  leden: 'users',
  muziektitels: 'musicTitles',
  instrumenten: 'instrumentAssets',
  contacten: 'contacts',
  uniformen: 'uniforms',
  apparatuur: 'equipment',
};

const STATUSKLEUR: Record<RegelStatus, string> = {
  nieuw: 'badge-success',
  bestaat: 'badge-ghost',
  fout: 'badge-error',
};

function duur(seconden: number | null): string {
  if (!seconden) return '';
  return `${Math.floor(seconden / 60)}:${String(seconden % 60).padStart(2, '0')}`;
}

function downloadSjabloon(soort: ImportSoort) {
  // Met BOM, zodat Excel de é en ü in het sjabloon goed toont.
  const blob = new Blob([`\uFEFF${SJABLONEN[soort]}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tutti-${soort}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Gegevens =
  LidGegevens | TitelGegevens | InstrumentGegevens | ContactGegevens | UniformGegevens | ApparatuurGegevens;
type Voorbeeld = ImportVoorbeeld<Gegevens>;

/** Per soort de kolommen van de voorbeeldtabel: de kop en wat erin staat. */
type Kolom = { kop: string; waarde: (gegevens: never, t: TFunction) => ReactNode };
const KOLOMMEN: Record<ImportSoort, Kolom[]> = {
  leden: [
    { kop: 'naam', waarde: (g: LidGegevens) => `${g.voornaam} ${g.achternaam}` },
    { kop: 'email', waarde: (g: LidGegevens) => g.email },
    { kop: 'rol', waarde: (g: LidGegevens, t) => t(`roles.${g.rol}`) },
    { kop: 'instrumenten', waarde: (g: LidGegevens) => g.instrumenten.join(', ') },
    { kop: 'orkesten', waarde: (g: LidGegevens) => g.orkesten.join(', ') },
  ],
  muziektitels: [
    { kop: 'titel', waarde: (g: TitelGegevens) => g.titel },
    { kop: 'componist', waarde: (g: TitelGegevens) => g.componist },
    { kop: 'arrangeur', waarde: (g: TitelGegevens) => g.arrangeur },
    { kop: 'duur', waarde: (g: TitelGegevens) => duur(g.duurSeconden) },
    { kop: 'graad', waarde: (g: TitelGegevens) => g.graad },
  ],
  instrumenten: [
    { kop: 'naam', waarde: (g: InstrumentGegevens) => g.naam },
    { kop: 'soort', waarde: (g: InstrumentGegevens) => g.soort },
    { kop: 'merk', waarde: (g: InstrumentGegevens) => [g.merk, g.model].filter(Boolean).join(' ') },
    { kop: 'serienummer', waarde: (g: InstrumentGegevens) => g.serienummer },
    { kop: 'instrumentStatus', waarde: (g: InstrumentGegevens, t) => t(`importeren.instrumentStatus.${g.status}`) },
  ],
  contacten: [
    { kop: 'naam', waarde: (g: ContactGegevens) => g.naam },
    { kop: 'contactsoort', waarde: (g: ContactGegevens, t) => t(`contacts.type.${g.soort}`) },
    { kop: 'contactpersoon', waarde: (g: ContactGegevens) => g.contactpersoon },
    { kop: 'email', waarde: (g: ContactGegevens) => g.email },
    { kop: 'plaats', waarde: (g: ContactGegevens) => g.plaats },
  ],
  uniformen: [
    { kop: 'soort', waarde: (g: UniformGegevens, t) => t(`uniforms.itemTypes.${g.soort}`) },
    {
      kop: 'maat',
      waarde: (g: UniformGegevens) =>
        [g.maat, [g.lengte, g.wijdte].filter((m) => m !== null).join('/')].filter(Boolean).join(' '),
    },
    { kop: 'kleur', waarde: (g: UniformGegevens) => g.kleur },
    {
      kop: 'aantal',
      waarde: (g: UniformGegevens, t) =>
        g.toeTeVoegen > 0 && g.toeTeVoegen < g.aantal
          ? t('importeren.aantalVan', { nieuw: g.toeTeVoegen, aantal: g.aantal })
          : g.aantal,
    },
    { kop: 'uniformStatus', waarde: (g: UniformGegevens, t) => t(`uniforms.status.${g.status}`) },
    { kop: 'drager', waarde: (g: UniformGegevens) => g.uitgegevenAan },
  ],
  apparatuur: [
    { kop: 'naam', waarde: (g: ApparatuurGegevens) => g.naam },
    { kop: 'inventarisnummer', waarde: (g: ApparatuurGegevens) => g.inventarisnummer },
    { kop: 'apparatuurSoort', waarde: (g: ApparatuurGegevens, t) => t(`importeren.apparatuurSoort.${g.soort}`) },
    { kop: 'merk', waarde: (g: ApparatuurGegevens) => [g.merk, g.model].filter(Boolean).join(' ') },
    { kop: 'serienummer', waarde: (g: ApparatuurGegevens) => g.serienummer },
    {
      kop: 'apparatuurStatus',
      waarde: (g: ApparatuurGegevens, t) => t(`importeren.apparatuurStatus.${g.status}`),
    },
  ],
} as Record<ImportSoort, Kolom[]>;

function Regeltabel({ soort, regels }: { soort: ImportSoort; regels: Beoordeling<Gegevens>[] }) {
  const { t } = useTranslation();
  const kolommen = KOLOMMEN[soort];

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{t('importeren.kolom.rij')}</th>
            <th>{t('importeren.kolom.status')}</th>
            {kolommen.map(({ kop }) => (
              <th key={kop}>{t(`importeren.kolom.${kop}`)}</th>
            ))}
            <th>{t('importeren.kolom.meldingen')}</th>
          </tr>
        </thead>
        <tbody>
          {regels.map((regel) => (
            <tr key={regel.rij}>
              <td>{regel.rij}</td>
              <td>
                <span className={`badge badge-sm ${STATUSKLEUR[regel.status]}`}>
                  {t(`importeren.status.${regel.status}`)}
                </span>
              </td>
              {kolommen.map(({ kop, waarde }) => (
                <td key={kop}>{waarde(regel.gegevens as never, t)}</td>
              ))}
              <td>
                {regel.fouten.map((fout) => (
                  <div key={fout} className="text-error text-sm">
                    {fout}
                  </div>
                ))}
                {regel.waarschuwingen.map((waarschuwing) => (
                  <div key={waarschuwing} className="text-warning text-sm">
                    {waarschuwing}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportStap({ soort }: { soort: ImportSoort }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bestandId = useId();
  const [csv, setCsv] = useState<string | null>(null);
  const [bestandsnaam, setBestandsnaam] = useState('');
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld | null>(null);
  const [uitkomst, setUitkomst] = useState<ImportUitkomst<Gegevens> | null>(null);

  const bekijken = useMutation({
    mutationFn: (tekst: string) => bekijkImport(soort, tekst),
    onSuccess: (data) => setVoorbeeld(data),
  });

  const importeren = useMutation({
    mutationFn: (tekst: string) => voerImportUit(soort, tekst),
    onSuccess: (data) => {
      setUitkomst(data);
      setVoorbeeld(null);
      setCsv(null);
      queryClient.invalidateQueries({ queryKey: [TE_VERVERSEN[soort]] });
    },
  });

  const kiesBestand = async (bestand: File | undefined) => {
    setVoorbeeld(null);
    setUitkomst(null);
    importeren.reset();
    if (!bestand) return;
    const tekst = await leesTekstbestand(bestand);
    setBestandsnaam(bestand.name);
    setCsv(tekst);
    bekijken.mutate(tekst);
  };

  const fout = bekijken.error ?? importeren.error;

  return (
    <div className="space-y-4">
      <p>{t(`importeren.uitleg.${soort}`)}</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="form-control">
          <label className="label" htmlFor={bestandId}>
            <span className="label-text">{t('importeren.kiesBestand')}</span>
          </label>
          <input
            id={bestandId}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="file-input file-input-bordered"
            onChange={(e) => kiesBestand(e.target.files?.[0])}
          />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => downloadSjabloon(soort)}>
          {t('importeren.sjabloon')}
        </button>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('importeren.alleenCsv')}
      </p>

      {bekijken.isPending && <p>{t('importeren.bezigMetLezen')}</p>}

      {fout && (
        <div role="alert" className="alert alert-error">
          {getErrorMessage(fout)}
        </div>
      )}

      {uitkomst && (
        <div role="status" className="alert alert-success">
          {t('importeren.gelukt', { count: uitkomst.geimporteerd })}{' '}
          {uitkomst.tellingen.bestaat > 0 && t('importeren.overgeslagen', { count: uitkomst.tellingen.bestaat })}{' '}
          {uitkomst.tellingen.fout > 0 && t('importeren.nietGelukt', { count: uitkomst.tellingen.fout })}
          {soort === 'leden' && uitkomst.geimporteerd > 0 && <div className="mt-1">{t('importeren.wachtwoord')}</div>}
        </div>
      )}

      {voorbeeld && csv && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('importeren.voorbeeldVan', { bestand: bestandsnaam })}</h2>
          <div className="flex flex-wrap gap-2" aria-label={t('importeren.tellingen')}>
            {(['nieuw', 'bestaat', 'fout'] as RegelStatus[]).map((status) => (
              <span key={status} className={`badge ${STATUSKLEUR[status]}`}>
                {t(`importeren.telling.${status}`, { count: voorbeeld.tellingen[status] })}
              </span>
            ))}
          </div>
          <p className="text-sm">
            {t('importeren.herkend', { kolommen: Object.values(voorbeeld.kolommen).join(', ') })}
            {voorbeeld.genegeerd.length > 0 && (
              <> {t('importeren.genegeerd', { kolommen: voorbeeld.genegeerd.join(', ') })}</>
            )}
          </p>
          <Regeltabel soort={soort} regels={voorbeeld.regels} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={voorbeeld.tellingen.nieuw === 0 || importeren.isPending}
            onClick={() => importeren.mutate(csv)}
          >
            {t('importeren.importeer', { count: voorbeeld.tellingen.nieuw })}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Importeren() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isEnabled } = useModules();
  useDocumentTitle('pageTitle.importeren');

  const beschikbaar = SOORTEN.filter(
    ({ rollen, module }) => user?.role && rollen.includes(user.role) && (!module || isEnabled(module)),
  ).map(({ soort }) => soort);
  const [gekozen, setGekozen] = useState<ImportSoort | null>(null);
  const soort = gekozen && beschikbaar.includes(gekozen) ? gekozen : beschikbaar[0];

  if (!soort) return null;

  return (
    <div>
      <h1 className="mb-3">{t('importeren.titel')}</h1>

      {beschikbaar.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={t('importeren.soort')}>
          {beschikbaar.map((keuze) => (
            <button
              key={keuze}
              type="button"
              aria-pressed={soort === keuze}
              className={`btn ${soort === keuze ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setGekozen(keuze)}
            >
              {t(`importeren.soorten.${keuze}`)}
            </button>
          ))}
        </div>
      )}

      {/* Een eigen stap per soort: een voorbeeld van leden hoort niet onder muziektitels te blijven staan. */}
      <ImportStap key={soort} soort={soort} />
    </div>
  );
}
