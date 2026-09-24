import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { getErrorMessage } from '../utils/errorHandling';
import { leesTekstbestand } from '../utils/leesTekstbestand';
import {
  bekijkImport,
  voerImportUit,
  type Beoordeling,
  type ImportSoort,
  type ImportUitkomst,
  type ImportVoorbeeld,
  type LidGegevens,
  type RegelStatus,
  type TitelGegevens,
} from '../api/importeren';

/**
 * Leden en de muziekbibliotheek inlezen uit een spreadsheet (WP11).
 *
 * Kies een bestand, bekijk per regel wat er gebeurt, en importeer. Het
 * voorbeeld verandert niets; bij het importeren beoordeelt de server het
 * bestand opnieuw. Leden importeren mag alleen de beheerder, de
 * muziekbibliotheek ook de muziekcommissie.
 */

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

type Voorbeeld = ImportVoorbeeld<LidGegevens | TitelGegevens>;

function Regeltabel({ soort, regels }: { soort: ImportSoort; regels: Beoordeling<LidGegevens | TitelGegevens>[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{t('importeren.kolom.rij')}</th>
            <th>{t('importeren.kolom.status')}</th>
            {soort === 'leden' ? (
              <>
                <th>{t('importeren.kolom.naam')}</th>
                <th>{t('importeren.kolom.email')}</th>
                <th>{t('importeren.kolom.rol')}</th>
                <th>{t('importeren.kolom.instrumenten')}</th>
                <th>{t('importeren.kolom.orkesten')}</th>
              </>
            ) : (
              <>
                <th>{t('importeren.kolom.titel')}</th>
                <th>{t('importeren.kolom.componist')}</th>
                <th>{t('importeren.kolom.arrangeur')}</th>
                <th>{t('importeren.kolom.duur')}</th>
                <th>{t('importeren.kolom.graad')}</th>
              </>
            )}
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
              {soort === 'leden' ? (
                <LidCellen gegevens={regel.gegevens as LidGegevens} />
              ) : (
                <TitelCellen gegevens={regel.gegevens as TitelGegevens} />
              )}
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

function LidCellen({ gegevens }: { gegevens: LidGegevens }) {
  const { t } = useTranslation();
  return (
    <>
      <td>
        {gegevens.voornaam} {gegevens.achternaam}
      </td>
      <td>{gegevens.email}</td>
      <td>{t(`roles.${gegevens.rol}`)}</td>
      <td>{gegevens.instrumenten.join(', ')}</td>
      <td>{gegevens.orkesten.join(', ')}</td>
    </>
  );
}

function TitelCellen({ gegevens }: { gegevens: TitelGegevens }) {
  return (
    <>
      <td>{gegevens.titel}</td>
      <td>{gegevens.componist}</td>
      <td>{gegevens.arrangeur}</td>
      <td>{duur(gegevens.duurSeconden)}</td>
      <td>{gegevens.graad}</td>
    </>
  );
}

function ImportStap({ soort }: { soort: ImportSoort }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bestandId = useId();
  const [csv, setCsv] = useState<string | null>(null);
  const [bestandsnaam, setBestandsnaam] = useState('');
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld | null>(null);
  const [uitkomst, setUitkomst] = useState<ImportUitkomst<LidGegevens | TitelGegevens> | null>(null);

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
      queryClient.invalidateQueries({ queryKey: soort === 'leden' ? ['users'] : ['musicTitles'] });
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
  useDocumentTitle('pageTitle.importeren');

  const magLeden = user?.role === ROLES.ADMIN;
  const [soort, setSoort] = useState<ImportSoort>(magLeden ? 'leden' : 'muziektitels');

  return (
    <div>
      <h1 className="mb-3">{t('importeren.titel')}</h1>

      {magLeden && (
        <div className="flex gap-2 mb-3" role="group" aria-label={t('importeren.soort')}>
          {(['leden', 'muziektitels'] as ImportSoort[]).map((keuze) => (
            <button
              key={keuze}
              type="button"
              aria-pressed={soort === keuze}
              className={`btn ${soort === keuze ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSoort(keuze)}
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
