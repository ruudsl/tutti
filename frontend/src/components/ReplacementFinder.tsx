import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { useInstruments } from '../hooks/useInstruments';
import { useExternalMusicianSearch } from '../hooks/useExternalMusicians';
import { useInviteMusician, useCreateReplacementRequest } from '../hooks/useReplacementRequests';
import type { ExternalMusicianSearchResult } from '../api/external-musicians';

interface ReplacementFinderProps {
  isOpen: boolean;
  onClose: () => void;
  eventType?: 'concert' | 'rehearsal';
  eventId?: string;
  eventDate?: string;
  eventName?: string;
  preselectedInstrumentId?: string;
  existingRequestId?: string;
}

const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Gevorderd',
  advanced: 'Vergevorderd',
  professional: 'Professioneel',
};

const MUSICIAN_TYPE_LABELS: Record<string, string> = {
  alumni: 'Alumni',
  guest: 'Gast',
  substitute: 'Invaller',
  friend: 'Vriend',
};

function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted">-</span>;

  return (
    <div className="flex gap-0">
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="check"
          size={14}
          className={star <= rating ? 'text-warning' : 'text-muted'}
          style={{ fill: star <= rating ? 'currentColor' : 'none' }}
        />
      ))}
    </div>
  );
}

export function ReplacementFinder({
  isOpen,
  onClose,
  eventType,
  eventId,
  eventDate,
  eventName,
  preselectedInstrumentId,
  existingRequestId,
}: ReplacementFinderProps) {
  const { t } = useTranslation();

  const [selectedInstrumentId, setSelectedInstrumentId] = useState(preselectedInstrumentId || '');
  const [skillFilter, setSkillFilter] = useState<string>('');
  const [invitingMusician, setInvitingMusician] = useState<ExternalMusicianSearchResult | null>(null);
  const [inviteNotes, setInviteNotes] = useState('');
  const [inviteFee, setInviteFee] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');

  const { data: instruments = [] } = useInstruments();
  const { data: musicians = [], isLoading } = useExternalMusicianSearch(
    selectedInstrumentId || null,
    { skillLevel: skillFilter || undefined, activeOnly: true }
  );

  const createRequestMutation = useCreateReplacementRequest();
  const inviteMutation = useInviteMusician();

  const handleInvite = async (musician: ExternalMusicianSearchResult) => {
    if (existingRequestId) {
      // Invite to existing request
      await inviteMutation.mutateAsync({
        requestId: existingRequestId,
        data: {
          externalMusicianId: musician.id,
          notes: inviteNotes || null,
          feeAmount: inviteFee ? parseFloat(inviteFee) : null,
        },
      });
      setInvitingMusician(null);
      setInviteNotes('');
      setInviteFee('');
    } else if (eventType && eventId && eventDate && selectedInstrumentId) {
      // Create new request and invite
      const result = await createRequestMutation.mutateAsync({
        eventType,
        eventId,
        eventDate,
        instrumentId: selectedInstrumentId,
        urgency,
        positionsNeeded: 1,
      });

      await inviteMutation.mutateAsync({
        requestId: result.id,
        data: {
          externalMusicianId: musician.id,
          notes: inviteNotes || null,
          feeAmount: inviteFee ? parseFloat(inviteFee) : null,
        },
      });
      setInvitingMusician(null);
      setInviteNotes('');
      setInviteFee('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title={t('replacementFinder.title')}
      onClose={onClose}
      size="large"
    >
      <div className="space-y-4">
        {/* Event info */}
        {eventName && (
          <div className="alert alert-info">
            <Icon name="info" size={16} className="mr-2" />
            {t('replacementFinder.findingFor', { event: eventName })}
            {eventDate && ` - ${new Date(eventDate).toLocaleDateString()}`}
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-3 gap-3">
          <div className="form-group mb-0">
            <label className="form-label">{t('replacementFinder.instrument')} *</label>
            <select
              className="form-control"
              value={selectedInstrumentId}
              onChange={(e) => setSelectedInstrumentId(e.target.value)}
            >
              <option value="">{t('replacementFinder.selectInstrument')}</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.tuning ? `(${i.tuning})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="form-label">{t('replacementFinder.skillLevel')}</label>
            <select
              className="form-control"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
            >
              <option value="">{t('replacementFinder.allLevels')}</option>
              <option value="beginner">{SKILL_LEVEL_LABELS.beginner}</option>
              <option value="intermediate">{SKILL_LEVEL_LABELS.intermediate}</option>
              <option value="advanced">{SKILL_LEVEL_LABELS.advanced}</option>
              <option value="professional">{SKILL_LEVEL_LABELS.professional}</option>
            </select>
          </div>
          {!existingRequestId && eventId && (
            <div className="form-group mb-0">
              <label className="form-label">{t('replacementFinder.urgency')}</label>
              <select
                className="form-control"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as any)}
              >
                <option value="low">{t('replacementFinder.urgencyLow')}</option>
                <option value="normal">{t('replacementFinder.urgencyNormal')}</option>
                <option value="high">{t('replacementFinder.urgencyHigh')}</option>
                <option value="critical">{t('replacementFinder.urgencyCritical')}</option>
              </select>
            </div>
          )}
        </div>

        {/* Musicians list */}
        {selectedInstrumentId ? (
          isLoading ? (
            <div className="text-center p-4">
              <Icon name="refresh" size={24} className="animate-spin" />
              <p className="text-muted mt-2">{t('common.loading')}</p>
            </div>
          ) : musicians.length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('replacementFinder.type')}</th>
                    <th>{t('replacementFinder.skill')}</th>
                    <th>{t('replacementFinder.rating')}</th>
                    <th>{t('replacementFinder.performances')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {musicians.map((musician) => (
                    <tr key={musician.id}>
                      <td>
                        <strong>{musician.firstName} {musician.lastName}</strong>
                        {musician.isPrimary && (
                          <span className="badge badge-primary ml-1" title={t('replacementFinder.primaryInstrument')}>
                            <Icon name="check" size={12} />
                          </span>
                        )}
                        {musician.email && (
                          <div className="text-muted text-sm">{musician.email}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {MUSICIAN_TYPE_LABELS[musician.musicianType]}
                        </span>
                      </td>
                      <td>
                        {musician.skillLevel ? SKILL_LEVEL_LABELS[musician.skillLevel] : '-'}
                      </td>
                      <td>
                        <StarDisplay rating={musician.rating} />
                      </td>
                      <td>
                        {musician.totalPerformances}
                        {musician.lastPlayedDate && (
                          <div className="text-muted text-sm">
                            {t('replacementFinder.lastPlayed')}: {new Date(musician.lastPlayedDate).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setInvitingMusician(musician)}
                          title={t('replacementFinder.invite')}
                        >
                          <Icon name="plus" size={16} className="mr-1" />
                          {t('replacementFinder.invite')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state p-4">
              <Icon name="users" size={48} className="text-muted mb-2" />
              <p>{t('replacementFinder.noMusiciansFound')}</p>
            </div>
          )
        ) : (
          <div className="empty-state p-4">
            <Icon name="search" size={48} className="text-muted mb-2" />
            <p>{t('replacementFinder.selectInstrumentFirst')}</p>
          </div>
        )}
      </div>

      {/* Invite confirmation modal */}
      {invitingMusician && (
        <Modal
          title={t('replacementFinder.inviteTitle', {
            name: `${invitingMusician.firstName} ${invitingMusician.lastName}`,
          })}
          onClose={() => setInvitingMusician(null)}
          size="small"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleInvite(invitingMusician);
            }}
          >
            <div className="space-y-3">
              <div className="form-group">
                <label className="form-label">{t('replacementFinder.fee')}</label>
                <input
                  type="number"
                  className="form-control"
                  step="0.01"
                  min="0"
                  value={inviteFee}
                  onChange={(e) => setInviteFee(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.notes')}</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={inviteNotes}
                  onChange={(e) => setInviteNotes(e.target.value)}
                  placeholder={t('replacementFinder.notesPlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setInvitingMusician(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={inviteMutation.isPending || createRequestMutation.isPending}
                >
                  {inviteMutation.isPending || createRequestMutation.isPending ? (
                    <Icon name="refresh" size={16} className="animate-spin mr-1" />
                  ) : (
                    <Icon name="send" size={16} className="mr-1" />
                  )}
                  {t('replacementFinder.sendInvite')}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}

export default ReplacementFinder;
