import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { AccessibilityIndicator } from '../../components/AccessibilityInfo';
import type { Concert, ConcertType } from '../../types';

/**
 * Het lijsttabblad: de filterbalk en de concerttabel.
 *
 * De filters staan bewust nog in de hoofdcomponent. `search`, `yearFilter` en
 * `typeFilter` voeden daar `useConcerts`, en dezelfde uitkomst levert het
 * aantal in de paginakop en de laadtoestand. Ze hierheen halen zou dus niet
 * alleen dit tabblad raken.
 */
export function ConcertListTab({
  search,
  setSearch,
  years,
  yearFilter,
  setYearFilter,
  concertTypes,
  typeFilter,
  setTypeFilter,
  concerts,
  getConcertTypeLabel,
  setViewingConcert,
  openEditModal,
  setDeletingConcert,
}: {
  search: string;
  setSearch: (waarde: string) => void;
  years: string[];
  yearFilter: string;
  setYearFilter: (waarde: string) => void;
  concertTypes: ConcertType[];
  typeFilter: string;
  setTypeFilter: (waarde: string) => void;
  concerts: Concert[];
  getConcertTypeLabel: (waarde: string) => string;
  setViewingConcert: (id: string) => void;
  openEditModal: (concert: Concert) => void;
  setDeletingConcert: (concert: Concert) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              className="form-control"
              placeholder={t('concerts.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: '250px' }}
            />
            <select
              className="form-control"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              style={{ maxWidth: '150px' }}
            >
              <option value="">{t('concerts.allYears')}</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              className="form-control"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ maxWidth: '180px' }}
            >
              <option value="">{t('concerts.allTypes')}</option>
              {concertTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Concerts Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table mb-0">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.date')}</th>
                <th>{t('concerts.location')}</th>
                <th>{t('concerts.concertType')}</th>
                <th>{t('concerts.program')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {concerts.map((concert) => (
                <tr key={concert.id}>
                  <td>
                    <strong>{concert.name}</strong>
                    <AccessibilityIndicator hasAccessibilityInfo={concert.hasAccessibilityInfo || false} />
                  </td>
                  <td>{concert.date}</td>
                  <td>{concert.location || '-'}</td>
                  <td>{concert.concertType ? getConcertTypeLabel(concert.concertType) : '-'}</td>
                  <td>
                    <span className="badge badge-outline">
                      {concert.programCount} {t('concerts.programCount')}
                    </span>
                  </td>
                  <td>
                    {/*
                      De naam van het concert hoort in het label. Deze drie
                      knoppen dragen alleen een pictogram, dus zonder aria-label
                      heten ze voor een schermlezer helemaal niets - en met
                      alleen "Details" hoort iemand die tekst bij elke rij
                      opnieuw, zonder te weten waarbij. Dat maakt ze ook
                      aanwijsbaar in een test zonder op positie te tellen; op
                      positie tellen breekt bij de eerste kolomwijziging.
                    */}
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        aria-label={`${t('common.details')}: ${concert.name}`}
                        onClick={() => setViewingConcert(concert.id)}
                      >
                        <Icon name="eye" size={16} />
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        aria-label={`${t('common.edit')}: ${concert.name}`}
                        onClick={() => openEditModal(concert)}
                      >
                        <Icon name="pencil" size={16} />
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        aria-label={`${t('common.delete')}: ${concert.name}`}
                        onClick={() => setDeletingConcert(concert)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {concerts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('concerts.noConcerts')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
