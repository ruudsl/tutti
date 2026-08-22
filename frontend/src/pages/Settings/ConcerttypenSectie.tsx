import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAdminConcertTypes,
  useCreateConcertType,
  useUpdateConcertType,
  useDeleteConcertType,
  useInitDefaultConcertTypes,
} from '../../hooks/useConcerts';
import { FormModal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormField } from '../../components/FormField';

interface Concerttype {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
}

const LEEG_FORMULIER = { value: '', label: '', sortOrder: 0 };

/**
 * De soorten concerten die de vereniging kent.
 *
 * De lijst, het formulier en de bevestiging voor het verwijderen zaten verspreid
 * over de pagina: de tabel in het midden, de modal en de dialoog helemaal
 * onderaan, met vier stukjes toestand ertussenin. Ze staan nu bij elkaar.
 *
 * De verwijderdialoog hoorde al bij deze sectie - hij zat niet in de gedeelde
 * `confirmAction` - dus die kon ongewijzigd mee.
 */
export function ConcerttypenSectie() {
  const { t } = useTranslation();
  const waardeId = useId();
  const { data: concertTypesData, isLoading } = useAdminConcertTypes();
  const createMutation = useCreateConcertType();
  const updateMutation = useUpdateConcertType();
  const deleteMutation = useDeleteConcertType();
  const initDefaultsMutation = useInitDefaultConcertTypes();

  const [toonToevoegen, setToonToevoegen] = useState(false);
  const [bewerken, setBewerken] = useState<Concerttype | null>(null);
  const [verwijderen, setVerwijderen] = useState<{ id: string; label: string } | null>(null);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);

  const typen = concertTypesData?.types ?? [];

  const sluitFormulier = () => {
    setToonToevoegen(false);
    setBewerken(null);
    setFormulier(LEEG_FORMULIER);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      value: formulier.value,
      label: formulier.label,
      sortOrder: formulier.sortOrder,
    });
    sluitFormulier();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bewerken) return;
    await updateMutation.mutateAsync({
      id: bewerken.id,
      updates: { value: formulier.value, label: formulier.label, sortOrder: formulier.sortOrder },
    });
    sluitFormulier();
  };

  const handleDelete = async () => {
    if (!verwijderen) return;
    await deleteMutation.mutateAsync(verwijderen.id);
    setVerwijderen(null);
  };

  const openBewerken = (type: Concerttype) => {
    setBewerken(type);
    setFormulier({ value: type.value, label: type.label, sortOrder: type.sortOrder });
  };

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.concertTypes.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.concertTypes.description')}</p>

          {isLoading ? (
            <p>{t('common.loading')}</p>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={() => setToonToevoegen(true)}>
                    + {t('settings.concertTypes.add')}
                  </button>
                  {typen.length === 0 && (
                    <button
                      className="btn btn-outline"
                      onClick={() => void initDefaultsMutation.mutateAsync()}
                      disabled={initDefaultsMutation.isPending}
                    >
                      {initDefaultsMutation.isPending ? t('common.loading') : t('settings.concertTypes.initDefaults')}
                    </button>
                  )}
                </div>
              </div>

              {typen.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('settings.concertTypes.value')}</th>
                      <th>{t('settings.concertTypes.label')}</th>
                      <th>{t('settings.concertTypes.sortOrder')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {typen.map((type) => (
                      <tr key={type.id}>
                        <td>
                          <code>{type.value}</code>
                        </td>
                        <td>
                          <strong>{type.label}</strong>
                        </td>
                        <td>{type.sortOrder}</td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn btn-outline btn-sm" onClick={() => openBewerken(type)}>
                              {t('common.edit')}
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setVerwijderen({ id: type.id, label: type.label })}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>{t('settings.concertTypes.noTypes')}</p>
              )}
            </>
          )}
        </div>
      </div>

      {(toonToevoegen || bewerken) && (
        <FormModal
          title={bewerken ? t('settings.concertTypes.edit') : t('settings.concertTypes.add')}
          onClose={sluitFormulier}
          onSubmit={bewerken ? handleUpdate : handleCreate}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        >
          {/* Met de hand gekoppeld: naast label en veld staat hier ook een
              hulptekst, en FormField kloont maar één kind. */}
          <div className="form-group">
            <label className="form-label" htmlFor={waardeId}>
              {t('settings.concertTypes.value')} *
            </label>
            <input
              id={waardeId}
              aria-describedby={`${waardeId}-hulp`}
              type="text"
              className="form-control"
              value={formulier.value}
              onChange={(e) =>
                setFormulier({ ...formulier, value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })
              }
              placeholder="bijv. christmas, summer, concert"
              required
            />
            <small id={`${waardeId}-hulp`} style={{ color: 'var(--text-muted)' }}>
              {t('settings.concertTypes.valueHelp')}
            </small>
          </div>
          <FormField label={`${t('settings.concertTypes.label')} *`}>
            <input
              type="text"
              className="form-control"
              value={formulier.label}
              onChange={(e) => setFormulier({ ...formulier, label: e.target.value })}
              placeholder="bijv. Kerstconcert, Zomerconcert"
              required
            />
          </FormField>
          <FormField label={t('settings.concertTypes.sortOrder')}>
            <input
              type="number"
              className="form-control"
              value={formulier.sortOrder}
              onChange={(e) => setFormulier({ ...formulier, sortOrder: parseInt(e.target.value) || 0 })}
              min="0"
            />
          </FormField>
        </FormModal>
      )}

      {verwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.concertTypes.deleteConfirm', { label: verwijderen.label })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setVerwijderen(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </>
  );
}
