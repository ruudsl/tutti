import { useTranslation } from 'react-i18next';
import SetlistBuilder, { SetlistPiece, Setlist } from '../../components/SetlistBuilder';
import { showSuccess } from '../../utils/toast';
import type { MusicTitle } from '../../types';

/** Het tabblad met de setlijstbouwer, gevoed uit het repertoire. */
export function SetlistBuilderTab({ musicTitles }: { musicTitles: MusicTitle[] }) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        <SetlistBuilder
          availablePieces={musicTitles.map(
            (title, index) =>
              ({
                id: title.id || `temp-${index}`,
                title: title.title,
                arranger: title.arranger || undefined,
                durationSeconds: title.durationSeconds || undefined,
              }) as SetlistPiece,
          )}
          onSave={(setlist: Setlist) => {
            showSuccess(t('concerts.setlistSaved', `Setlist "${setlist.name}" opgeslagen`));
          }}
        />
      </div>
    </div>
  );
}
