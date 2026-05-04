import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Metronome } from './Metronome';
import { Tuner } from './Tuner';
import { PitchPipe } from './PitchPipe';

interface MusicToolsProps {
  sidebar?: boolean;
}

export function MusicTools({ sidebar = false }: MusicToolsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'metronome' | 'tuner' | 'pitchpipe'>('metronome');

  if (sidebar) {
    return (
      <div className="music-tools-sidebar" style={{
        padding: '1rem',
        borderLeft: '1px solid var(--border)',
        width: '320px',
        height: '100%',
        overflowY: 'auto'
      }}>
        <div className="flex gap-2" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${activeTab === 'metronome' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('metronome')}
            style={{ flex: 1 }}
          >
            {t('tools.metronomeTab')}
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'tuner' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('tuner')}
            style={{ flex: 1 }}
          >
            {t('tools.tunerTab')}
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'pitchpipe' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('pitchpipe')}
            style={{ flex: 1 }}
          >
            Stemtoon
          </button>
        </div>

        {activeTab === 'metronome' && <Metronome />}
        {activeTab === 'tuner' && <Tuner />}
        {activeTab === 'pitchpipe' && <PitchPipe />}
      </div>
    );
  }

  return (
    <div className="music-tools">
      <div className="grid grid-3" style={{ gap: '1.5rem' }}>
        <Metronome />
        <Tuner />
        <PitchPipe />
      </div>
    </div>
  );
}

// Compact toolbar version for embedding in other views
export function MusicToolsBar() {
  const { t } = useTranslation();
  const [showTools, setShowTools] = useState(false);

  return (
    <div className="music-tools-bar" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.5rem 1rem',
      background: 'var(--background)',
      borderRadius: '0.5rem',
      marginBottom: '1rem'
    }}>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setShowTools(!showTools)}
      >
        {showTools ? t('tools.hideTools') : t('tools.showTools')}
      </button>

      {showTools && (
        <>
          <div style={{ borderLeft: '1px solid var(--border)', height: '30px' }} />
          <Metronome compact />
          <div style={{ borderLeft: '1px solid var(--border)', height: '30px' }} />
          <Tuner compact />
        </>
      )}
    </div>
  );
}
