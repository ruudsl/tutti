import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMusicLists,
  getMusicList,
  getMusicTitles,
  createMusicList,
  updateMusicList,
  deleteMusicList,
  addTitleToList,
  removeTitleFromList,
  reorderMusicLists,
  reorderTitlesInList,
  getOrchestras,
  toggleMusicListActive,
  updateTitleMeta,
  getGenres,
  downloadProgramPdf,
} from '../api';
import { SortableList, DraggableListItem } from '../components/SortableList';
import type { MusicList, MusicTitle } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDuration } from '../utils/format';
import { FormModal } from '../components/Modal';
import { TitleMetadataModal } from '../components/TitleMetadataModal';
import { SkeletonCard, SkeletonListItem } from '../components/Skeleton';

export default function MusicListManager() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.lists');
  const { orchestraId, listId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedOrchestra, setSelectedOrchestra] = useState<string>(orchestraId || '');
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState<string>('');

  // React Query for orchestras
  const { data: orchestras = [], isLoading } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for genres
  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: getGenres,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for lists
  const { data: lists = [] } = useQuery({
    queryKey: ['musicLists', selectedOrchestra],
    queryFn: () => getMusicLists(selectedOrchestra),
    enabled: !!selectedOrchestra,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for selected list
  const { data: selectedList } = useQuery({
    queryKey: ['musicList', listId],
    queryFn: () => getMusicList(listId!),
    enabled: !!listId,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for titles
  const { data: titles = [] } = useQuery({
    queryKey: ['musicTitles', listId, search, genreFilter],
    queryFn: () => getMusicTitles({
      search: search || undefined,
      listId: listId!,
      genreId: genreFilter || undefined,
    }),
    enabled: !!listId,
    staleTime: 5 * 60 * 1000,
  });

  // Modals
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [editingList, setEditingList] = useState<MusicList | null>(null);
  const [listFormName, setListFormName] = useState('');
  const [listFormType, setListFormType] = useState<'regular' | 'concert'>('regular');
  const [listFormConcertDate, setListFormConcertDate] = useState('');
  const [listFormConcertLocation, setListFormConcertLocation] = useState('');

  // Title metadata modal
  const [editingTitle, setEditingTitle] = useState<MusicTitle | null>(null);

  // Set initial orchestra from URL or first available
  useEffect(() => {
    if (!selectedOrchestra && orchestras.length > 0) {
      setSelectedOrchestra(orchestras[0].id);
    }
  }, [orchestras, selectedOrchestra]);

  // Helper functions to refresh data
  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['musicLists', selectedOrchestra] });
  };

  const refreshSelectedList = () => {
    queryClient.invalidateQueries({ queryKey: ['musicList', listId] });
  };

  const refreshTitles = () => {
    queryClient.invalidateQueries({ queryKey: ['musicTitles', listId, search, genreFilter] });
  };


  const handleSelectOrchestra = (orchId: string) => {
    setSelectedOrchestra(orchId);
    navigate('/lists');
  };

  const handleSelectList = (list: MusicList) => {
    navigate(`/lists/${list.orchestraId}/${list.id}`);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestra) return;

    try {
      await createMusicList(listFormName, selectedOrchestra, {
        listType: listFormType,
        concertDate: listFormConcertDate || null,
        concertLocation: listFormConcertLocation || null,
      });
      refreshLists();
      setShowAddListModal(false);
      setListFormName('');
      setListFormType('regular');
      setListFormConcertDate('');
      setListFormConcertLocation('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken lijst');
    }
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList) return;

    try {
      await updateMusicList(editingList.id, {
        name: listFormName,
        listType: listFormType,
        concertDate: listFormConcertDate || null,
        concertLocation: listFormConcertLocation || null,
      });
      refreshLists();
      if (selectedList?.id === editingList.id) {
        refreshSelectedList();
      }
      setEditingList(null);
      setListFormName('');
      setListFormType('regular');
      setListFormConcertDate('');
      setListFormConcertLocation('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken lijst');
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze lijst wilt verwijderen?')) return;

    try {
      await deleteMusicList(id);
      refreshLists();
      if (selectedList?.id === id) {
        navigate('/lists');
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen lijst');
    }
  };

  const handleExportProgramPdf = async (listId: string, listName: string) => {
    try {
      const blob = await downloadProgramPdf(listId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${listName.replace(/[^a-zA-Z0-9\s-]/g, '').trim()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.response?.data?.error || t('lists.errorExportPdf'));
    }
  };

  const handleAddTitle = async (title: string) => {
    if (!selectedList) return;

    try {
      const result = await addTitleToList(selectedList.id, title);
      refreshSelectedList();
      refreshLists();
      refreshTitles();
      alert(`${result.added} van ${result.total} partijen toegevoegd.`);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij toevoegen titel');
    }
  };

  const handleRemoveTitle = async (title: string) => {
    if (!selectedList) return;
    if (!confirm(`Weet je zeker dat je "${title}" van de lijst wilt verwijderen?`)) return;

    try {
      await removeTitleFromList(selectedList.id, title);
      refreshSelectedList();
      refreshLists();
      refreshTitles();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen titel');
    }
  };

  const handleMoveList = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= lists.length) return;

    const newLists = [...lists];
    [newLists[index], newLists[newIndex]] = [newLists[newIndex], newLists[index]];

    // Optimistically update the cache
    queryClient.setQueryData(['musicLists', selectedOrchestra], newLists);

    try {
      await reorderMusicLists(selectedOrchestra, newLists.map(l => l.id));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij wijzigen volgorde');
      refreshLists();
    }
  };

  const handleReorderTitles = async (newTitleOrder: { id: string; title: string }[]) => {
    if (!selectedList) return;

    try {
      await reorderTitlesInList(selectedList.id, newTitleOrder.map(t => t.title));
      // Update local state to reflect new order
      refreshSelectedList();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij wijzigen volgorde');
    }
  };

  const openEditModal = (list: MusicList) => {
    setEditingList(list);
    setListFormName(list.name);
    setListFormType(list.listType || 'regular');
    setListFormConcertDate(list.concertDate || '');
    setListFormConcertLocation(list.concertLocation || '');
  };

  const handleToggleActive = async (list: MusicList) => {
    try {
      await toggleMusicListActive(list.id);
      refreshLists();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij wijzigen status');
    }
  };

  const handleSaveTitleMeta = async (data: {
    youtubeUrl: string | null;
    description: string | null;
    durationSeconds: number;
    grade: string | null;
    genreIds: string[];
    isShared: boolean;
    internalNotes: string | null;
  }) => {
    if (!editingTitle) return;

    try {
      await updateTitleMeta({
        title: editingTitle.title,
        arranger: editingTitle.arranger,
        ...data,
      });
      setEditingTitle(null);
      if (listId) {
        refreshTitles();
        refreshLists();
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij opslaan metadata');
    }
  };

  // Group pieces by title for display
  const titlesOnList = selectedList?.pieces
    ? [...new Set(selectedList.pieces.map(p => p.title))]
    : [];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-3">{t('lists.manageTitle')}</h1>
        <div className="grid grid-3" style={{ gridTemplateColumns: '250px 250px 1fr' }}>
          <div className="card"><div className="card-body">{[1,2,3].map(i => <SkeletonListItem key={i} />)}</div></div>
          <div className="card"><div className="card-body">{[1,2,3,4].map(i => <SkeletonListItem key={i} />)}</div></div>
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3">{t('lists.manageTitle')}</h1>

      <div className="grid grid-3" style={{ gridTemplateColumns: '200px 1fr 2fr' }}>
        {/* Orchestra selector */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('lists.orchestras')}</h2>
          </div>
          <div className="card-body flush">
            {orchestras.map((orch) => (
              <div
                key={orch.id}
                onClick={() => handleSelectOrchestra(orch.id)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  background: selectedOrchestra === orch.id ? 'var(--primary)' : undefined,
                  color: selectedOrchestra === orch.id ? 'white' : undefined,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {orch.name}
              </div>
            ))}
          </div>
        </div>

        {/* Lists */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('lists.lists')}</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddListModal(true)}>
              +
            </button>
          </div>
          <div className="card-body flush">
            {lists.length > 0 ? (
              lists.map((list, index) => (
                <div
                  key={list.id}
                  style={{
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    background: selectedList?.id === list.id ? 'var(--background)' : undefined,
                    opacity: list.isActive === false ? 0.6 : 1,
                  }}
                >
                  <div
                    onClick={() => handleSelectList(list)}
                    style={{ cursor: 'pointer', marginBottom: '0.25rem' }}
                  >
                    <strong>{list.name}</strong>
                    {list.listType === 'concert' && (
                      <span className="badge badge-warning" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                        {t('lists.typeConcert')}
                      </span>
                    )}
                    {list.isActive === false && (
                      <span className="badge badge-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                        {t('lists.inactive')}
                      </span>
                    )}
                    <div className="piece-meta">
                      {list.titleCount || 0} {t('lists.titles')} • {formatDuration(list.totalDuration || 0)}
                      {list.concertDate && ` • ${new Date(list.concertDate).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`btn btn-sm ${list.isActive !== false ? 'btn-success' : 'btn-outline'}`}
                      onClick={() => handleToggleActive(list)}
                      title={list.isActive !== false ? t('lists.activeToggle') : t('lists.inactiveToggle')}
                      style={{ minWidth: '2rem' }}
                    >
                      {list.isActive !== false ? '✓' : '○'}
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleMoveList(index, 'up')}
                      disabled={index === 0}
                      title={t('lists.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleMoveList(index, 'down')}
                      disabled={index === lists.length - 1}
                      title={t('lists.moveDown')}
                    >
                      ↓
                    </button>
                    {list.listType === 'concert' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleExportProgramPdf(list.id, list.name)}
                        title={t('lists.exportPdf')}
                      >
                        PDF
                      </button>
                    )}
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => openEditModal(list)}
                      title={t('lists.rename')}
                    >
                      ✏
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteList(list.id)}
                      title={t('common.delete')}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p>{t('lists.noLists')}</p>
              </div>
            )}
          </div>
        </div>

        {/* List content / Add titles */}
        {selectedList ? (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{selectedList.name}</h2>
            </div>
            <div className="card-body">
              {/* Search and Genre Filter */}
              <div className="flex gap-2 mb-2">
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t('lists.searchPieces')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ width: '200px', marginBottom: 0 }}>
                  <select
                    className="form-control"
                    value={genreFilter}
                    onChange={(e) => setGenreFilter(e.target.value)}
                  >
                    <option value="">{t('titles.allGenres')}</option>
                    {genres.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Titles on list with drag-and-drop */}
              {titlesOnList.length > 0 && (
                <div className="mb-2">
                  <h3 className="mb-1">{t('lists.onThisList')} ({titlesOnList.length} {t('lists.titles')})</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>
                    Sleep items om de volgorde te wijzigen
                  </p>
                  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <SortableList
                      items={titlesOnList.map(title => ({ id: title, title }))}
                      onReorder={handleReorderTitles}
                      keyExtractor={(item) => item.id}
                      renderItem={(item) => {
                        const piecesForTitle = selectedList.pieces.filter(p => p.title === item.title);
                        const titleData = titles.find(t => t.title === item.title);
                        return (
                          <DraggableListItem>
                            <div className="flex justify-between items-center" style={{ width: '100%' }}>
                              <div style={{ flex: 1 }}>
                                <strong>{item.title}</strong>
                                <span className="piece-meta">
                                  {' '}({piecesForTitle.length} {t('lists.parts')})
                                  {titleData?.durationSeconds ? ` • ${formatDuration(titleData.durationSeconds)}` : ''}
                                </span>
                                {titleData?.youtubeUrl && (
                                  <a
                                    href={titleData.youtubeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-outline btn-sm"
                                    style={{ marginLeft: '0.5rem' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    ▶
                                  </a>
                                )}
                                {titleData?.genres && titleData.genres.length > 0 && (
                                  <div style={{ marginTop: '0.25rem' }}>
                                    {titleData.genres.map(g => (
                                      <span
                                        key={g.id}
                                        className="badge badge-secondary"
                                        style={{ marginRight: '0.25rem', fontSize: '0.7rem' }}
                                      >
                                        {g.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                {titleData && (
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setEditingTitle(titleData)}
                                    title={t('lists.editMetadata')}
                                  >
                                    ✏
                                  </button>
                                )}
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRemoveTitle(item.title)}
                                >
                                  {t('lists.remove')}
                                </button>
                              </div>
                            </div>
                          </DraggableListItem>
                        );
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Available titles */}
              <h3 className="mb-1">{t('lists.availablePieces')}</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {titles.filter(t => !t.onList).length > 0 ? (
                  titles
                    .filter(t => !t.onList)
                    .map((title) => (
                      <div
                        key={title.title}
                        className="flex justify-between items-center"
                        style={{
                          padding: '0.5rem',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong>{title.title}</strong>
                          {title.arranger && <span className="piece-meta"> - {title.arranger}</span>}
                          {title.durationSeconds > 0 && (
                            <span className="piece-meta"> • {formatDuration(title.durationSeconds)}</span>
                          )}
                          {title.youtubeUrl && (
                            <a
                              href={title.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline btn-sm"
                              style={{ marginLeft: '0.5rem' }}
                            >
                              ▶
                            </a>
                          )}
                          <div className="piece-meta">
                            {title.pieceCount} {t('lists.parts')} • {title.instruments.join(', ')}
                          </div>
                          {title.genres && title.genres.length > 0 && (
                            <div style={{ marginTop: '0.25rem' }}>
                              {title.genres.map(g => (
                                <span
                                  key={g.id}
                                  className="badge badge-secondary"
                                  style={{ marginRight: '0.25rem', fontSize: '0.7rem' }}
                                >
                                  {g.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setEditingTitle(title)}
                            title="Bewerk metadata"
                          >
                            ✏
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAddTitle(title.title)}
                          >
                            {t('common.add')}
                          </button>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="empty-state" style={{ padding: '1rem' }}>
                    <p>{search ? t('lists.noResults') : t('lists.allOnList')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('lists.selectListToAdd')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Add List Modal */}
      {showAddListModal && (
        <FormModal
          title={t('lists.newList')}
          onClose={() => { setShowAddListModal(false); setListFormType('regular'); setListFormConcertDate(''); setListFormConcertLocation(''); }}
          onSubmit={handleCreateList}
          submitLabel={t('common.add')}
        >
          <div className="form-group">
            <label className="form-label">{t('common.name')}</label>
            <input
              type="text"
              className="form-control"
              value={listFormName}
              onChange={(e) => setListFormName(e.target.value)}
              required
              autoFocus
              placeholder={t('lists.namePlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('lists.listType')}</label>
            <select
              className="form-control"
              value={listFormType}
              onChange={(e) => setListFormType(e.target.value as 'regular' | 'concert')}
            >
              <option value="regular">{t('lists.typeRegular')}</option>
              <option value="concert">{t('lists.typeConcert')}</option>
            </select>
          </div>
          {listFormType === 'concert' && (
            <>
              <div className="form-group">
                <label className="form-label">{t('lists.concertDate')}</label>
                <input
                  type="date"
                  className="form-control"
                  value={listFormConcertDate}
                  onChange={(e) => setListFormConcertDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('lists.concertLocation')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={listFormConcertLocation}
                  onChange={(e) => setListFormConcertLocation(e.target.value)}
                  placeholder={t('lists.concertLocationPlaceholder')}
                />
              </div>
            </>
          )}
        </FormModal>
      )}

      {/* Edit List Modal */}
      {editingList && (
        <FormModal
          title={t('lists.renameList')}
          onClose={() => setEditingList(null)}
          onSubmit={handleUpdateList}
        >
          <div className="form-group">
            <label className="form-label">{t('common.name')}</label>
            <input
              type="text"
              className="form-control"
              value={listFormName}
              onChange={(e) => setListFormName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('lists.listType')}</label>
            <select
              className="form-control"
              value={listFormType}
              onChange={(e) => setListFormType(e.target.value as 'regular' | 'concert')}
            >
              <option value="regular">{t('lists.typeRegular')}</option>
              <option value="concert">{t('lists.typeConcert')}</option>
            </select>
          </div>
          {listFormType === 'concert' && (
            <>
              <div className="form-group">
                <label className="form-label">{t('lists.concertDate')}</label>
                <input
                  type="date"
                  className="form-control"
                  value={listFormConcertDate}
                  onChange={(e) => setListFormConcertDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('lists.concertLocation')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={listFormConcertLocation}
                  onChange={(e) => setListFormConcertLocation(e.target.value)}
                  placeholder={t('lists.concertLocationPlaceholder')}
                />
              </div>
            </>
          )}
        </FormModal>
      )}

      {/* Title Metadata Modal */}
      {editingTitle && (
        <TitleMetadataModal
          title={editingTitle}
          genres={genres}
          onClose={() => setEditingTitle(null)}
          onSave={handleSaveTitleMeta}
        />
      )}
    </div>
  );
}
