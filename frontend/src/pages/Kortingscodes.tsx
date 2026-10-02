import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getKortingscodes,
  maakKortingscode,
  verwijderKortingscode,
  wijzigKortingscode,
  type Kortingscode,
  type Kortingssoort,
} from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useConcerts } from '../hooks/useConcerts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { showError, showSuccess } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { currentLocale } from '../utils/locale';

const SLEUTEL = ['kortingscodes'];

interface Formulier {
  code: string;
  description: string;
  discountType: Kortingssoort;
  discountValue: string;
  maxUses: string;
  maxUsesPerUser: string;
  validUntil: string;
  concertId: string;
}

const LEEG: Formulier = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  maxUses: '',
  maxUsesPerUser: '1',
  validUntil: '',
  concertId: '',
};

/**
 * Kortingscodes voor de kaartverkoop: aanmaken, aan- en uitzetten, weghalen.
 *
 * De koper vult de code in bij het bestellen; de server rekent de korting uit
 * en houdt het maximum bij (backend: services/kortingscodes.ts). Een code die
 * al gebruikt is, zet je liever uit dan dat je hem weghaalt: weghalen wist ook
 * wie hem gebruikte.
 */
export default function Kortingscodes() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.kortingscodes');
  const queryClient = useQueryClient();
  const id = useId();

  const { data: codes, isLoading } = useQuery({ queryKey: SLEUTEL, queryFn: getKortingscodes });
  const { data: concertsData } = useConcerts();
  const concerten = concertsData?.data ?? [];

  const [formulier, setFormulier] = useState<Formulier | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<Kortingscode | null>(null);

  const ververs = () => queryClient.invalidateQueries({ queryKey: SLEUTEL });

  const maak = useMutation({
    mutationFn: (f: Formulier) =>
      maakKortingscode({
        code: f.code.trim().toUpperCase(),
        description: f.description.trim() || undefined,
        discountType: f.discountType,
        discountValue: Number(f.discountValue.replace(',', '.')),
        maxUses: f.maxUses ? Number(f.maxUses) : null,
        maxUsesPerUser: Number(f.maxUsesPerUser) || 1,
        // Geldig tot en met de gekozen dag.
        validUntil: f.validUntil ? new Date(`${f.validUntil}T23:59:59`).toISOString() : undefined,
        concertIds: f.concertId ? [f.concertId] : undefined,
      }),
    onSuccess: () => {
      showSuccess(t('discountCodes.aangemaakt'));
      setFormulier(null);
      ververs();
    },
    onError: (fout) => showError(getErrorMessage(fout)),
  });

  const zetActief = useMutation({
    mutationFn: ({ code, actief }: { code: Kortingscode; actief: boolean }) =>
      wijzigKortingscode(code.id, { isActive: actief }),
    onSuccess: ververs,
    onError: (fout) => showError(getErrorMessage(fout)),
  });

  const verwijder = useMutation({
    mutationFn: (code: Kortingscode) => verwijderKortingscode(code.id),
    onSuccess: () => {
      setTeVerwijderen(null);
      ververs();
    },
    onError: (fout) => showError(getErrorMessage(fout)),
  });

  const zet = (veld: keyof Formulier, waarde: string) => setFormulier((f) => (f ? { ...f, [veld]: waarde } : f));

  const korting = (code: Kortingscode) =>
    code.discountType === 'percentage' ? `${code.discountValue}%` : `EUR ${code.discountValue.toFixed(2)}`;

  const datum = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  const formulierGeldig =
    !!formulier &&
    formulier.code.trim().length > 0 &&
    Number(formulier.discountValue.replace(',', '.')) > 0 &&
    (formulier.discountType !== 'percentage' || Number(formulier.discountValue.replace(',', '.')) <= 100);

  return (
    <div>
      <div className="page-header">
        <h1>{t('discountCodes.title')}</h1>
        {!formulier && (
          <button className="btn btn-primary" onClick={() => setFormulier(LEEG)}>
            {t('discountCodes.addCode')}
          </button>
        )}
      </div>

      <p className="text-muted mb-3">{t('discountCodes.uitleg')}</p>

      {formulier && (
        <form
          className="card mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (formulierGeldig) maak.mutate(formulier);
          }}
        >
          <div className="card-body">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-code`}>
                  {t('discountCodes.code')} *
                </label>
                <input
                  id={`${id}-code`}
                  className="form-control"
                  value={formulier.code}
                  onChange={(e) => zet('code', e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-omschrijving`}>
                  {t('discountCodes.description')}
                </label>
                <input
                  id={`${id}-omschrijving`}
                  className="form-control"
                  value={formulier.description}
                  onChange={(e) => zet('description', e.target.value)}
                  maxLength={500}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-soort`}>
                  {t('discountCodes.discountType')}
                </label>
                <select
                  id={`${id}-soort`}
                  className="form-control"
                  value={formulier.discountType}
                  onChange={(e) => zet('discountType', e.target.value)}
                >
                  <option value="percentage">{t('discountCodes.percentage')}</option>
                  <option value="fixed_amount">{t('discountCodes.fixedAmount')}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-waarde`}>
                  {t('discountCodes.discountValue')} *
                </label>
                <input
                  id={`${id}-waarde`}
                  className="form-control"
                  inputMode="decimal"
                  value={formulier.discountValue}
                  onChange={(e) => zet('discountValue', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-max`}>
                  {t('discountCodes.maxUses')}
                </label>
                <input
                  id={`${id}-max`}
                  className="form-control"
                  type="number"
                  min={1}
                  value={formulier.maxUses}
                  onChange={(e) => zet('maxUses', e.target.value)}
                  placeholder={t('discountCodes.onbeperkt')}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-perkoper`}>
                  {t('discountCodes.perKoper')}
                </label>
                <input
                  id={`${id}-perkoper`}
                  className="form-control"
                  type="number"
                  min={1}
                  value={formulier.maxUsesPerUser}
                  onChange={(e) => zet('maxUsesPerUser', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-tot`}>
                  {t('discountCodes.validUntil')}
                </label>
                <input
                  id={`${id}-tot`}
                  className="form-control"
                  type="date"
                  value={formulier.validUntil}
                  onChange={(e) => zet('validUntil', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-concert`}>
                  {t('discountCodes.concert')}
                </label>
                <select
                  id={`${id}-concert`}
                  className="form-control"
                  value={formulier.concertId}
                  onChange={(e) => zet('concertId', e.target.value)}
                >
                  <option value="">{t('discountCodes.alleConcerten')}</option>
                  {concerten.map((concert) => (
                    <option key={concert.id} value={concert.id}>
                      {concert.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={!formulierGeldig || maak.isPending}>
                {maak.isPending ? t('common.loading') : t('common.save')}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setFormulier(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-body">
          {isLoading ? (
            <SkeletonTable rows={4} columns={5} />
          ) : !codes || codes.length === 0 ? (
            <p className="text-muted">{t('discountCodes.geenCodes')}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('discountCodes.code')}</th>
                  <th>{t('discountCodes.discount')}</th>
                  <th>{t('discountCodes.usesCount')}</th>
                  <th>{t('discountCodes.validUntil')}</th>
                  <th>{t('discountCodes.isActive')}</th>
                  <th>
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td>
                      <strong>{code.code}</strong>
                      {code.description && <div className="text-muted">{code.description}</div>}
                    </td>
                    <td>{korting(code)}</td>
                    <td>
                      {code.usesCount}
                      {code.maxUses !== null ? ` / ${code.maxUses}` : ''}
                    </td>
                    <td>{datum(code.validUntil)}</td>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          checked={code.isActive}
                          onChange={(e) => zetActief.mutate({ code, actief: e.target.checked })}
                          aria-label={`${t('discountCodes.isActive')}: ${code.code}`}
                        />
                      </label>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setTeVerwijderen(code)}
                        aria-label={`${t('common.delete')}: ${code.code}`}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {teVerwijderen && (
        <ConfirmDialog
          title={t('discountCodes.verwijderTitel')}
          message={t('discountCodes.verwijderVraag', { code: teVerwijderen.code })}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={() => verwijder.mutate(teVerwijderen)}
          onCancel={() => setTeVerwijderen(null)}
          isLoading={verwijder.isPending}
        />
      )}
    </div>
  );
}
