import { useState, useEffect } from 'react';
import {
  getMusicPieces,
  getInstruments,
  updateMusicPiece,
  deleteMusicPiece,
  downloadMusicPiece,
  refreshInstrumentLinks,
} from '../api';
import type { MusicPiece, Instrument } from '../types';

export default function MusicPieces() {
  const [pieces, setPieces] = useState<MusicPiece[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [editingPiece, setEditingPiece] = useState<MusicPiece | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPieces();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filterInstrument]);

  const loadData = async () => {
    try {
      const [piecesData, instrumentsData] = await Promise.all([
        getMusicPieces(),
        getInstruments(),
      ]);
      setPieces(piecesData);
      setInstruments(instrumentsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPieces = async () => {
    try {
      const data = await getMusicPieces({
        search: search || undefined,
        instrumentId: filterInstrument || undefined,
      });
      setPieces(data);
    } catch (error) {
      console.error('Error loading pieces:', error);
    }
  };

  const handleRefreshInstruments = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshInstrumentLinks();
      await loadPieces();
      alert(`Instrumenten bijgewerkt!\n\n${result.updated} stukken gekoppeld\n${result.alreadyLinked} waren al gekoppeld\n${result.notFound} instrumenten niet gevonden`);
    } catch (error) {
      console.error('Error refreshing instruments:', error);
      alert('Fout bij vernieuwen van instrumentkoppelingen.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownload = async (pieceId: string) => {
    setDownloading(pieceId);
    try {
      await downloadMusicPiece(pieceId);
    } catch (error) {
      console.error('Error downloading:', error);
      alert('Fout bij downloaden van het bestand.');
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (pieceId: string) => {
    if (!confirm('Weet je zeker dat je dit muziekstuk wilt verwijderen?')) return;

    try {
      await deleteMusicPiece(pieceId);
      setPieces(pieces.filter((p) => p.id !== pieceId));
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Fout bij verwijderen van het muziekstuk.');
    }
  };

  const handleUpdatePiece = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPiece) return;

    try {
      await updateMusicPiece(editingPiece.id, {
        title: editingPiece.title,
        arranger: editingPiece.arranger || undefined,
        instrumentId: editingPiece.instrumentId || undefined,
        tuning: editingPiece.tuning || undefined,
        groupNumber: editingPiece.groupNumber || undefined,
        clef: editingPiece.clef || undefined,
        youtubeUrl: editingPiece.youtubeUrl || undefined,
        isShared: editingPiece.isShared,
      });
      await loadPieces();
      setEditingPiece(null);
    } catch (error) {
      console.error('Error updating piece:', error);
      alert('Fout bij bijwerken van het muziekstuk.');
    }
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>Muziekstukken</h1>
        <button
          className="btn btn-secondary"
          onClick={handleRefreshInstruments}
          disabled={isRefreshing}
          title="Koppel instrumenten opnieuw aan muziekstukken op basis van bestandsnamen"
        >
          {isRefreshing ? 'Bezig...' : '🔄 Instrumenten opnieuw koppelen'}
        </button>
      </div>

      <div className="card mb-2">
        <div className="card-body">
          <div className="flex gap-2 flex-wrap">
            <div className="form-group mb-0" style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Zoeken op titel of arrangeur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group mb-0" style={{ minWidth: '200px' }}>
              <select
                className="form-control form-select"
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
              >
                <option value="">Alle instrumenten</option>
                {instruments.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">{pieces.length} muziekstukken</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {pieces.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Arrangeur</th>
                  <th>Instrument</th>
                  <th>Stemming</th>
                  <th>Nr.</th>
                  <th>Gedeeld</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      <strong>{piece.title}</strong>
                      <br />
                      <small style={{ color: 'var(--text-light)' }}>{piece.originalFilename}</small>
                    </td>
                    <td>{piece.arranger || '-'}</td>
                    <td>{piece.instrumentName || '-'}</td>
                    <td>{piece.tuning || '-'}</td>
                    <td>{piece.groupNumber || '-'}</td>
                    <td>
                      {piece.isShared ? (
                        <span className="badge badge-success">Ja</span>
                      ) : (
                        <span className="badge badge-warning">Nee</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {piece.youtubeUrl && (
                          <a
                            href={piece.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                            title="YouTube preview"
                          >
                            ▶
                          </a>
                        )}
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDownload(piece.id)}
                          disabled={downloading === piece.id}
                          title="Downloaden"
                        >
                          ⬇
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingPiece(piece)}
                          title="Bewerken"
                        >
                          ✏
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(piece.id)}
                          title="Verwijderen"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🎵</div>
              <p>Geen muziekstukken gevonden.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingPiece && (
        <div className="modal-overlay" onClick={() => setEditingPiece(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Muziekstuk bewerken</h3>
              <button className="modal-close" onClick={() => setEditingPiece(null)}>×</button>
            </div>
            <form onSubmit={handleUpdatePiece}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titel</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingPiece.title}
                    onChange={(e) => setEditingPiece({ ...editingPiece, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Arrangeur</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingPiece.arranger || ''}
                    onChange={(e) => setEditingPiece({ ...editingPiece, arranger: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Instrument</label>
                  <select
                    className="form-control form-select"
                    value={editingPiece.instrumentId || ''}
                    onChange={(e) => setEditingPiece({ ...editingPiece, instrumentId: e.target.value })}
                  >
                    <option value="">Selecteer instrument</option>
                    {instruments.map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrument.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Stemming</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editingPiece.tuning || ''}
                      onChange={(e) => setEditingPiece({ ...editingPiece, tuning: e.target.value })}
                      placeholder="Bijv. Bb, Eb, C"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Groepnummer</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editingPiece.groupNumber || ''}
                      onChange={(e) => setEditingPiece({ ...editingPiece, groupNumber: e.target.value })}
                      placeholder="Bijv. 1, 2"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Muzieksleutel</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingPiece.clef || ''}
                    onChange={(e) => setEditingPiece({ ...editingPiece, clef: e.target.value })}
                    placeholder="Bijv. sol, fa"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">YouTube URL (legacy)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={editingPiece.youtubeUrl || ''}
                    onChange={(e) => setEditingPiece({ ...editingPiece, youtubeUrl: e.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                  <small className="text-light">
                    Tip: YouTube links worden nu per titel beheerd via Lijstbeheer.
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={editingPiece.isShared || false}
                      onChange={(e) => setEditingPiece({ ...editingPiece, isShared: e.target.checked })}
                    />
                    <span>Delen met andere verenigingen</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingPiece(null)}>
                  Annuleren
                </button>
                <button type="submit" className="btn btn-primary">
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
