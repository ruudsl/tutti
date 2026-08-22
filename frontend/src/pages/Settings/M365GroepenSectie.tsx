import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getM365GroupMappings,
  createM365GroupMapping,
  updateM365GroupMapping,
  deleteM365GroupMapping,
  type M365GroupMapping,
} from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { useOrchestras } from '../../hooks/useOrchestras';
import { FormModal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { foutmelding } from './foutmelding';

const LEEG_FORMULIER = {
  orchestraId: '',
  groupName: '',
  groupType: 'orchestra' as 'orchestra' | 'percussion' | 'special',
};

/**
 * Koppelingen tussen orkesten en Microsoft 365-groepen.
 *
 * GEWIJZIGD GEDRAG. Vroeger draaide de query naar de koppelingen
 * onvoorwaardelijk, samen met de vijf andere configuratie-queries, terwijl deze
 * kaart alleen verschijnt als Microsoft is ingesteld. Wie geen Microsoft
 * gebruikt - de meeste verenigingen - haalde bij elk bezoek aan de
 * instellingenpagina een lijst op die nergens werd getoond.
 *
 * De query staat nu waar hij hoort, in de sectie die hem toont, met een
 * `enabled` die precies uitdrukt wanneer hij nodig is: als Microsoft is
 * ingesteld. Diezelfde vlag bepaalt ook of er iets te zien is. De component
 * wordt daarom altijd door de pagina gerenderd en geeft zelf `null` terug als
 * er geen Microsoft is; zo staat de reden op één plek in plaats van verdeeld
 * over een `enabled` hier en een `&&` in de pagina.
 *
 * De orkestenlijst blijft wél onvoorwaardelijk laden. `useOrchestras` is een
 * gedeelde hook zonder `enabled`-optie, hij wordt door meer pagina's gebruikt en
 * zijn antwoord komt uit dezelfde cache. Die aanpassen hoort bij die hook, niet
 * bij dit herontwerp.
 */
export function M365GroepenSectie({ microsoftIngesteld }: { microsoftIngesteld: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['m365GroupMappings'],
    queryFn: getM365GroupMappings,
    staleTime: 5 * 60 * 1000,
    enabled: microsoftIngesteld,
  });

  const { data: orchestras = [] } = useOrchestras();

  const [toonToevoegen, setToonToevoegen] = useState(false);
  const [bewerken, setBewerken] = useState<M365GroupMapping | null>(null);
  const [verwijderen, setVerwijderen] = useState<M365GroupMapping | null>(null);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);
  const [opslaan, setOpslaan] = useState(false);

  const ververs = () => void queryClient.invalidateQueries({ queryKey: ['m365GroupMappings'] });

  // Orkesten die nog geen koppeling hebben; alleen die zijn nog te kiezen.
  const beschikbareOrkesten = orchestras.filter(
    (o) => !mappings.some((m) => m.orchestraId === o.id && m.groupType === 'orchestra'),
  );

  // Er kan maar één slagwerkgroep zijn.
  const heeftSlagwerkgroep = mappings.some((m) => m.groupType === 'percussion');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulier.groupName.trim()) {
      showError(t('settings.m365Groups.groupNameRequired'));
      return;
    }
    setOpslaan(true);
    try {
      await createM365GroupMapping({
        orchestraId: formulier.orchestraId || undefined,
        groupName: formulier.groupName.trim(),
        groupType: formulier.groupType,
      });
      showSuccess(t('settings.m365Groups.created'));
      setToonToevoegen(false);
      setFormulier(LEEG_FORMULIER);
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.m365Groups.errorCreating')));
    } finally {
      setOpslaan(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bewerken || !formulier.groupName.trim()) {
      showError(t('settings.m365Groups.groupNameRequired'));
      return;
    }
    setOpslaan(true);
    try {
      await updateM365GroupMapping(bewerken.id, formulier.groupName.trim());
      showSuccess(t('settings.m365Groups.updated'));
      setBewerken(null);
      setFormulier(LEEG_FORMULIER);
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.m365Groups.errorUpdating')));
    } finally {
      setOpslaan(false);
    }
  };

  const handleDelete = async () => {
    if (!verwijderen) return;
    try {
      await deleteM365GroupMapping(verwijderen.id);
      showSuccess(t('settings.m365Groups.deleted'));
      setVerwijderen(null);
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.m365Groups.errorDeleting')));
    }
  };

  const openBewerken = (mapping: M365GroupMapping) => {
    setBewerken(mapping);
    setFormulier({
      orchestraId: mapping.orchestraId || '',
      groupName: mapping.groupName,
      groupType: mapping.groupType,
    });
  };

  if (!microsoftIngesteld) return null;

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.m365Groups.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.m365Groups.description')}</p>

          {isLoading ? (
            <p>{t('common.loading')}</p>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setFormulier(LEEG_FORMULIER);
                    setToonToevoegen(true);
                  }}
                >
                  + {t('settings.m365Groups.add')}
                </button>
              </div>

              {mappings.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('settings.m365Groups.type')}</th>
                      <th>{t('settings.m365Groups.orchestra')}</th>
                      <th>{t('settings.m365Groups.groupName')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => (
                      <tr key={mapping.id}>
                        <td>
                          <span
                            className={`badge ${mapping.groupType === 'percussion' ? 'badge-warning' : mapping.groupType === 'special' ? 'badge-info' : 'badge-success'}`}
                          >
                            {mapping.groupType === 'orchestra'
                              ? t('settings.m365Groups.typeOrchestra')
                              : mapping.groupType === 'percussion'
                                ? t('settings.m365Groups.typePercussion')
                                : t('settings.m365Groups.typeSpecial')}
                          </span>
                        </td>
                        <td>{mapping.orchestraName || '-'}</td>
                        <td>
                          <strong>{mapping.groupName}</strong>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn btn-outline btn-sm" onClick={() => openBewerken(mapping)}>
                              {t('common.edit')}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setVerwijderen(mapping)}>
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>{t('settings.m365Groups.noMappings')}</p>
              )}
            </>
          )}
        </div>
      </div>

      {(toonToevoegen || bewerken) && (
        <FormModal
          title={bewerken ? t('settings.m365Groups.edit') : t('settings.m365Groups.add')}
          onClose={() => {
            setToonToevoegen(false);
            setBewerken(null);
            setFormulier(LEEG_FORMULIER);
          }}
          onSubmit={bewerken ? handleUpdate : handleCreate}
          isSubmitting={opslaan}
        >
          {!bewerken && (
            <div className="form-group">
              <label className="form-label">{t('settings.m365Groups.type')} *</label>
              <select
                className="form-control"
                value={formulier.groupType}
                onChange={(e) =>
                  setFormulier({
                    ...formulier,
                    groupType: e.target.value as 'orchestra' | 'percussion' | 'special',
                    orchestraId: e.target.value !== 'orchestra' ? '' : formulier.orchestraId,
                  })
                }
                required
              >
                <option value="orchestra">{t('settings.m365Groups.typeOrchestra')}</option>
                <option value="percussion" disabled={heeftSlagwerkgroep}>
                  {t('settings.m365Groups.typePercussion')}
                </option>
              </select>
            </div>
          )}

          {!bewerken && formulier.groupType === 'orchestra' && (
            <div className="form-group">
              <label className="form-label">{t('settings.m365Groups.orchestra')} *</label>
              <select
                className="form-control"
                value={formulier.orchestraId}
                onChange={(e) => setFormulier({ ...formulier, orchestraId: e.target.value })}
                required
              >
                <option value="">{t('settings.m365Groups.selectOrchestra')}</option>
                {beschikbareOrkesten.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t('settings.m365Groups.groupName')} *</label>
            <input
              type="text"
              className="form-control"
              value={formulier.groupName}
              onChange={(e) => setFormulier({ ...formulier, groupName: e.target.value })}
              placeholder={t('settings.m365Groups.groupNamePlaceholder')}
              required
            />
            <small style={{ color: 'var(--text-muted)' }}>{t('settings.m365Groups.groupNameHelp')}</small>
          </div>
        </FormModal>
      )}

      {verwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.m365Groups.deleteConfirm', { groupName: verwijderen.groupName })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setVerwijderen(null)}
          variant="danger"
        />
      )}
    </>
  );
}
