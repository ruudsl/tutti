import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import {
  useInstruments,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
  useZetInstrumentVerborgen,
} from '../hooks/useInstruments';
import { useIsSuperAdmin } from '../hooks/useMultiAssociation';
import { FormField } from '../components/FormField';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import type { Instrument } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { showSuccess } from '../utils/toast';

type Sleutel = 'sol' | 'fa' | 'ut';

interface Formulier {
  name: string;
  tuning: string;
  clef: Sleutel;
}

const LEEG: Formulier = { name: '', tuning: '', clef: 'sol' };

/**
 * Instrumenten van de vereniging: de standaardlijst voor alle verenigingen en
 * de eigen instrumenten. Een standaardinstrument kan de vereniging verbergen,
 * niet wijzigen; dat doet alleen de superbeheerder. Zie
 * backend/src/services/catalogus.ts.
 */
export default function Instrumenten() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.instrumenten');
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const { data: isSuperAdmin = false } = useIsSuperAdmin();
  const magBeheren = (instrument: Instrument) => !instrument.standaard || isSuperAdmin;

  const { data: instrumenten = [], isLoading } = useInstruments(true);
  const maak = useCreateInstrument();
  const wijzig = useUpdateInstrument();
  const verwijder = useDeleteInstrument();
  const zetVerborgenMutation = useZetInstrumentVerborgen();

  const [toevoegen, setToevoegen] = useState(false);
  const [bewerken, setBewerken] = useState<Instrument | null>(null);
  const [verwijderen, setVerwijderen] = useState<Instrument | null>(null);
  const [formulier, setFormulier] = useState<Formulier>(LEEG);

  const sluit = () => {
    setToevoegen(false);
    setBewerken(null);
    setFormulier(LEEG);
  };

  const gegevens = () => ({
    name: formulier.name.trim(),
    tuning: formulier.tuning.trim() || undefined,
    clef: formulier.clef,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await maak.mutateAsync(gegevens());
    sluit();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bewerken) return;
    await wijzig.mutateAsync({ id: bewerken.id, data: gegevens() });
    sluit();
  };

  const handleDelete = async () => {
    if (!verwijderen) return;
    await verwijder.mutateAsync(verwijderen.id);
    setVerwijderen(null);
  };

  const zetVerborgen = async (instrument: Instrument, verborgen: boolean) => {
    await zetVerborgenMutation.mutateAsync({ id: instrument.id, verborgen });
    showSuccess(t(verborgen ? 'catalogus.verborgenMelding' : 'catalogus.getoondMelding', { name: instrument.name }));
  };

  const openBewerken = (instrument: Instrument) => {
    setBewerken(instrument);
    setFormulier({
      name: instrument.name,
      tuning: instrument.tuning ?? '',
      clef: (instrument.clef as Sleutel) || 'sol',
    });
  };

  const velden = (
    <>
      <FormField label={t('instrumenten.naam')}>
        <input
          type="text"
          className="form-control"
          value={formulier.name}
          onChange={(e) => setFormulier({ ...formulier, name: e.target.value })}
          required
          placeholder={t('instrumenten.naamVoorbeeld')}
          autoFocus
        />
      </FormField>
      <FormField label={t('instrumenten.stemming')}>
        <input
          type="text"
          className="form-control"
          value={formulier.tuning}
          onChange={(e) => setFormulier({ ...formulier, tuning: e.target.value })}
          placeholder={t('instrumenten.stemmingVoorbeeld')}
        />
      </FormField>
      <FormField label={t('instrumenten.sleutel')}>
        <select
          className="form-control"
          value={formulier.clef}
          onChange={(e) => setFormulier({ ...formulier, clef: e.target.value as Sleutel })}
        >
          <option value="sol">{t('instrumenten.sleutels.sol')}</option>
          <option value="fa">{t('instrumenten.sleutels.fa')}</option>
          <option value="ut">{t('instrumenten.sleutels.ut')}</option>
        </select>
      </FormField>
    </>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('instrumenten.titel')}
          {!isLoading && <span className="badge badge-primary ml-2">{instrumenten.length}</span>}
        </h1>
        <button className="btn btn-primary" onClick={() => setToevoegen(true)}>
          + {t('instrumenten.nieuw')}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <p className="text-light text-sm mb-0">{t('instrumenten.uitleg')}</p>
        </div>
        <div className="card-body flush">
          {isLoading ? (
            <div className="p-2">
              <SkeletonTable rows={8} columns={4} />
            </div>
          ) : (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('instrumenten.naam')}</th>
                  <th scope="col">{t('instrumenten.stemming')}</th>
                  <th scope="col">{t('instrumenten.sleutel')}</th>
                  <th scope="col">{t('instrumenten.andereNamen')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {instrumenten.map((instrument) => (
                  <tr key={instrument.id} className={instrument.verborgen ? 'text-light' : undefined}>
                    <td>
                      <strong>{instrument.name}</strong>
                      <span className={`badge ml-2 ${instrument.standaard ? 'badge-secondary' : 'badge-primary'}`}>
                        {t(instrument.standaard ? 'catalogus.standaard' : 'catalogus.eigen')}
                      </span>
                      {instrument.verborgen && (
                        <span className="badge badge-warning ml-1">{t('catalogus.verborgen')}</span>
                      )}
                    </td>
                    <td>{instrument.tuning || '-'}</td>
                    <td>{t(`instrumenten.sleutels.${instrument.clef || 'sol'}`)}</td>
                    <td>{instrument.aliases?.map((a) => a.name).join(', ') || '-'}</td>
                    <td>
                      <div className="flex gap-1">
                        {instrument.standaard && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => zetVerborgen(instrument, !instrument.verborgen)}
                            disabled={zetVerborgenMutation.isPending}
                            aria-label={`${t(instrument.verborgen ? 'catalogus.tonen' : 'catalogus.verbergen')}: ${instrument.name}`}
                            title={t(instrument.verborgen ? 'catalogus.tonen' : 'catalogus.verbergen')}
                          >
                            <Icon name={instrument.verborgen ? 'eye' : 'eyeOff'} size={16} />
                          </button>
                        )}
                        {magBeheren(instrument) && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openBewerken(instrument)}
                            aria-label={`${t('common.edit')}: ${instrument.name}`}
                            title={t('common.edit')}
                          >
                            <Icon name="pencil" size={16} />
                          </button>
                        )}
                        {isAdmin && magBeheren(instrument) && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setVerwijderen(instrument)}
                            aria-label={`${t('common.delete')}: ${instrument.name}`}
                            title={t('common.delete')}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {instrumenten.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-light">
                      {t('instrumenten.geen')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toevoegen && (
        <FormModal
          title={t('instrumenten.nieuw')}
          onClose={sluit}
          onSubmit={handleCreate}
          submitLabel={t('common.add')}
          isSubmitting={maak.isPending}
        >
          {velden}
        </FormModal>
      )}

      {bewerken && (
        <FormModal
          title={t('instrumenten.bewerken')}
          onClose={sluit}
          onSubmit={handleUpdate}
          isSubmitting={wijzig.isPending}
        >
          {velden}
        </FormModal>
      )}

      {verwijderen && (
        <ConfirmDialog
          title={t('instrumenten.verwijderen')}
          message={t('instrumenten.verwijderenVraag', { name: verwijderen.name })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setVerwijderen(null)}
          isLoading={verwijder.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
