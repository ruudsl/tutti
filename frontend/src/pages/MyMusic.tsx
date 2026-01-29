import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMyMusicLists, getMusicList, downloadMusicPiece } from '../api';
import type { MusicList, MusicPiece } from '../types';

export default function MyMusic() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState<MusicList[]>([]);
  const [selectedList, setSelectedList] = useState<(MusicList & { pieces: MusicPiece[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadLists();
  }, []);

  useEffect(() => {
    const listId = searchParams.get('listId');
    if (listId) {
      loadList(listId);
    } else {
      setSelectedList(null);
    }
  }, [searchParams]);

  const loadLists = async () => {
    try {
      const data = await getMyMusicLists();
      setLists(data);

      // If listId in URL, load that list
      const listId = searchParams.get('listId');
      if (listId) {
        loadList(listId);
      }
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadList = async (listId: string) => {
    setIsLoading(true);
    try {
      const data = await getMusicList(listId);
      setSelectedList(data);
    } catch (error) {
      console.error('Error loading list:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectList = (listId: string) => {
    setSearchParams({ listId });
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

  const handleBack = () => {
    setSearchParams({});
    setSelectedList(null);
  };

  if (isLoading && !selectedList) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  // Show single list view
  if (selectedList) {
    return (
      <div>
        <button className="btn btn-outline mb-2" onClick={handleBack}>
          ← Terug naar overzicht
        </button>

        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{selectedList.name}</h2>
              <span className="piece-meta">{selectedList.orchestraName}</span>
            </div>
          </div>
          <div className="card-body">
            {isLoading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : selectedList.pieces.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Arrangeur</th>
                    <th>Instrument</th>
                    <th>Stemming</th>
                    <th>Nr.</th>
                    <th>Sleutel</th>
                    <th>Preview</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedList.pieces.map((piece) => (
                    <tr key={piece.id}>
                      <td>
                        <strong>{piece.title}</strong>
                      </td>
                      <td>{piece.arranger || '-'}</td>
                      <td>{piece.instrumentName || '-'}</td>
                      <td>{piece.tuning || '-'}</td>
                      <td>{piece.groupNumber || '-'}</td>
                      <td>{piece.clef || '-'}</td>
                      <td>
                        {piece.youtubeUrl && (
                          <a
                            href={piece.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                          >
                            ▶ YouTube
                          </a>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleDownload(piece.id)}
                          disabled={downloading === piece.id}
                        >
                          {downloading === piece.id ? 'Bezig...' : '⬇ Download'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎵</div>
                <p>Geen muziekstukken beschikbaar voor jouw instrumenten op deze lijst.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show lists overview
  return (
    <div>
      <h1 className="mb-3">Mijn Muziek</h1>

      {lists.length > 0 ? (
        <div className="grid grid-3">
          {lists.map((list) => (
            <div key={list.id} className="card">
              <div className="card-body">
                <h3 className="piece-title">{list.name}</h3>
                <p className="piece-meta mb-2">
                  {list.orchestraName} • {list.pieceCount || 0} stukken voor jou
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSelectList(list.id)}
                >
                  Bekijk muziek
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>Geen muzieklijsten beschikbaar</h3>
              <p>Je bent nog niet toegevoegd aan een orkest met muzieklijsten, of er zijn nog geen muziekstukken voor jouw instrumenten toegevoegd.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
