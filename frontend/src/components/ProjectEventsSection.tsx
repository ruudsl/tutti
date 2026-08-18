import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Modal } from './Modal';
import {
  linkConcertToProject,
  unlinkConcertFromProject,
  linkRehearsalToProject,
  unlinkRehearsalFromProject,
  ProjectDetail,
} from '../api/projects';
import { getConcerts } from '../api/concerts';
import { getRehearsals } from '../api/rehearsals';
import { showSuccess, showError } from '../utils/toast';
import { formatDate } from '../utils/dateFormat';

interface ProjectEventsSectionProps {
  project: ProjectDetail;
  onUpdate?: () => void;
}

export function ProjectEventsSection({ project, onUpdate }: ProjectEventsSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showLinkConcertModal, setShowLinkConcertModal] = useState(false);
  const [showLinkRehearsalModal, setShowLinkRehearsalModal] = useState(false);

  const linkConcertMutation = useMutation({
    mutationFn: (concertId: string) => linkConcertToProject(project.id, concertId),
    onSuccess: () => {
      showSuccess(t('projects.events.concertLinked'));
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      setShowLinkConcertModal(false);
      onUpdate?.();
    },
    onError: () => showError(t('projects.events.errorLinkConcert')),
  });

  const unlinkConcertMutation = useMutation({
    mutationFn: (concertId: string) => unlinkConcertFromProject(project.id, concertId),
    onSuccess: () => {
      showSuccess(t('projects.events.concertUnlinked'));
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      onUpdate?.();
    },
    onError: () => showError(t('projects.events.errorUnlinkConcert')),
  });

  const linkRehearsalMutation = useMutation({
    mutationFn: (rehearsalId: string) => linkRehearsalToProject(project.id, rehearsalId),
    onSuccess: () => {
      showSuccess(t('projects.events.rehearsalLinked'));
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      setShowLinkRehearsalModal(false);
      onUpdate?.();
    },
    onError: () => showError(t('projects.events.errorLinkRehearsal')),
  });

  const unlinkRehearsalMutation = useMutation({
    mutationFn: (rehearsalId: string) => unlinkRehearsalFromProject(project.id, rehearsalId),
    onSuccess: () => {
      showSuccess(t('projects.events.rehearsalUnlinked'));
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      onUpdate?.();
    },
    onError: () => showError(t('projects.events.errorUnlinkRehearsal')),
  });

  const linkedConcertIds = useMemo(() => new Set(project.concerts.map((c) => c.id)), [project.concerts]);

  const linkedRehearsalIds = useMemo(() => new Set(project.rehearsals.map((r) => r.id)), [project.rehearsals]);

  return (
    <div className="space-y-6">
      {/* Concerts Section */}
      <div className="card bg-base-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold flex items-center gap-2">
            <Icon name="music2" size={18} className="text-primary" aria-hidden={true} />
            {t('projects.concerts')} ({project.concerts.length})
          </h4>
          <button className="btn btn-sm btn-ghost gap-1" onClick={() => setShowLinkConcertModal(true)}>
            <Icon name="plus" size={16} aria-hidden={true} />
            {t('projects.events.linkConcert')}
          </button>
        </div>

        {project.concerts.length === 0 ? (
          <p className="text-base-content/60 text-sm text-center py-4">{t('projects.events.noConcerts')}</p>
        ) : (
          <div className="space-y-2">
            {project.concerts
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((concert) => (
                <div key={concert.id} className="flex items-center justify-between p-3 bg-base-100 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{concert.name}</div>
                    <div className="text-sm text-base-content/60 flex items-center gap-2">
                      <Icon name="calendar" size={12} aria-hidden={true} />
                      {formatDate(concert.date)}
                      {concert.venue && (
                        <>
                          <Icon name="mapPin" size={12} aria-hidden={true} />
                          {concert.venue}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm text-error"
                    onClick={() => unlinkConcertMutation.mutate(concert.id)}
                    disabled={unlinkConcertMutation.isPending}
                    aria-label={t('projects.events.unlinkConcert')}
                  >
                    <Icon name="link" size={16} aria-hidden={true} />
                    <Icon name="close" size={12} className="-ml-2" aria-hidden={true} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Rehearsals Section */}
      <div className="card bg-base-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold flex items-center gap-2">
            <Icon name="users" size={18} className="text-primary" aria-hidden={true} />
            {t('projects.rehearsals')} ({project.rehearsals.length})
          </h4>
          <button className="btn btn-sm btn-ghost gap-1" onClick={() => setShowLinkRehearsalModal(true)}>
            <Icon name="plus" size={16} aria-hidden={true} />
            {t('projects.events.linkRehearsal')}
          </button>
        </div>

        {project.rehearsals.length === 0 ? (
          <p className="text-base-content/60 text-sm text-center py-4">{t('projects.events.noRehearsals')}</p>
        ) : (
          <div className="space-y-2">
            {project.rehearsals
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((rehearsal) => (
                <div key={rehearsal.id} className="flex items-center justify-between p-3 bg-base-100 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">
                      {t('projects.rehearsal')} - {formatDate(rehearsal.date)}
                    </div>
                    <div className="text-sm text-base-content/60 flex items-center gap-2">
                      <Icon name="clock" size={12} aria-hidden={true} />
                      {rehearsal.startTime} - {rehearsal.endTime}
                      {rehearsal.location && (
                        <>
                          <Icon name="mapPin" size={12} aria-hidden={true} />
                          {rehearsal.location}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm text-error"
                    onClick={() => unlinkRehearsalMutation.mutate(rehearsal.id)}
                    disabled={unlinkRehearsalMutation.isPending}
                    aria-label={t('projects.events.unlinkRehearsal')}
                  >
                    <Icon name="link" size={16} aria-hidden={true} />
                    <Icon name="close" size={12} className="-ml-2" aria-hidden={true} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Link Concert Modal */}
      {showLinkConcertModal && (
        <LinkConcertModal
          linkedConcertIds={linkedConcertIds}
          onLink={(concertId) => linkConcertMutation.mutate(concertId)}
          onClose={() => setShowLinkConcertModal(false)}
          isLoading={linkConcertMutation.isPending}
        />
      )}

      {/* Link Rehearsal Modal */}
      {showLinkRehearsalModal && (
        <LinkRehearsalModal
          linkedRehearsalIds={linkedRehearsalIds}
          onLink={(rehearsalId) => linkRehearsalMutation.mutate(rehearsalId)}
          onClose={() => setShowLinkRehearsalModal(false)}
          isLoading={linkRehearsalMutation.isPending}
        />
      )}
    </div>
  );
}

interface LinkConcertModalProps {
  linkedConcertIds: Set<string>;
  onLink: (concertId: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

function LinkConcertModal({ linkedConcertIds, onLink, onClose, isLoading }: LinkConcertModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: concertsData, isLoading: loadingConcerts } = useQuery({
    queryKey: ['concerts', { search: searchQuery }],
    queryFn: () => getConcerts({ search: searchQuery || undefined }),
  });

  const availableConcerts = useMemo(() => {
    if (!concertsData?.data) return [];
    return concertsData.data.filter((c) => !linkedConcertIds.has(c.id));
  }, [concertsData?.data, linkedConcertIds]);

  return (
    <Modal title={t('projects.events.linkConcert')} onClose={onClose} size="medium">
      <div className="space-y-4">
        {/* Search */}
        <div className="form-control">
          <div className="input-group">
            <span className="bg-base-200">
              <Icon name="search" size={16} />
            </span>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Concert List */}
        <div className="max-h-80 overflow-y-auto space-y-2">
          {loadingConcerts ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : availableConcerts.length === 0 ? (
            <p className="text-base-content/60 text-center py-8">
              {searchQuery ? t('projects.events.noConcertsFound') : t('projects.events.allConcertsLinked')}
            </p>
          ) : (
            availableConcerts.map((concert) => (
              <div
                key={concert.id}
                className="flex items-center justify-between p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors"
              >
                <div>
                  <div className="font-medium">{concert.name}</div>
                  <div className="text-sm text-base-content/60 flex items-center gap-2">
                    <Icon name="calendar" size={12} aria-hidden={true} />
                    {formatDate(concert.date)}
                    {concert.location && (
                      <>
                        <Icon name="mapPin" size={12} aria-hidden={true} />
                        {concert.location}
                      </>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-primary gap-1"
                  disabled={isLoading}
                  onClick={() => !isLoading && onLink(concert.id)}
                  aria-label={`${t('common.add')} ${concert.name}`}
                >
                  <Icon name="plus" size={14} aria-hidden={true} />
                  {t('common.add')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

interface LinkRehearsalModalProps {
  linkedRehearsalIds: Set<string>;
  onLink: (rehearsalId: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

function LinkRehearsalModal({ linkedRehearsalIds, onLink, onClose, isLoading }: LinkRehearsalModalProps) {
  const { t } = useTranslation();

  // Fetch rehearsals for the next 3 months
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: rehearsals, isLoading: loadingRehearsals } = useQuery({
    queryKey: ['rehearsals', startDate, endDate],
    queryFn: () => getRehearsals(startDate, endDate),
  });

  const availableRehearsals = useMemo(() => {
    if (!rehearsals) return [];
    return rehearsals.filter((r) => !linkedRehearsalIds.has(r.id));
  }, [rehearsals, linkedRehearsalIds]);

  return (
    <Modal title={t('projects.events.linkRehearsal')} onClose={onClose} size="medium">
      <div className="space-y-4">
        <p className="text-sm text-base-content/60">{t('projects.events.rehearsalDateRange')}</p>

        {/* Rehearsal List */}
        <div className="max-h-80 overflow-y-auto space-y-2">
          {loadingRehearsals ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : availableRehearsals.length === 0 ? (
            <p className="text-base-content/60 text-center py-8">{t('projects.events.noRehearsalsAvailable')}</p>
          ) : (
            availableRehearsals.map((rehearsal) => (
              <div
                key={rehearsal.id}
                className="flex items-center justify-between p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors"
              >
                <div>
                  <div className="font-medium">
                    {t('projects.rehearsal')} - {formatDate(rehearsal.date)}
                  </div>
                  <div className="text-sm text-base-content/60 flex items-center gap-2">
                    <Icon name="clock" size={12} aria-hidden={true} />
                    {rehearsal.start_time} - {rehearsal.end_time}
                    {rehearsal.location && (
                      <>
                        <Icon name="mapPin" size={12} aria-hidden={true} />
                        {rehearsal.location}
                      </>
                    )}
                    {rehearsal.orchestra_name && (
                      <>
                        <Icon name="music" size={12} aria-hidden={true} />
                        {rehearsal.orchestra_name}
                      </>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-primary gap-1"
                  disabled={isLoading}
                  onClick={() => !isLoading && onLink(rehearsal.id)}
                  aria-label={`${t('common.add')} ${t('projects.rehearsal')} - ${formatDate(rehearsal.date)}`}
                >
                  <Icon name="plus" size={14} aria-hidden={true} />
                  {t('common.add')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ProjectEventsSection;
