import { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon } from './Icon';

export interface PosterData {
  title: string;
  subtitle?: string;
  date: string;
  time: string;
  location: string;
  address?: string;
  orchestraName: string;
  program: string[];
  ticketInfo?: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
}

export type PosterTemplate = 'classic' | 'modern' | 'minimal';

export interface ColorTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  background: string;
  text: string;
  accent: string;
}

interface ConcertPosterGeneratorProps {
  /** Initial poster data */
  initialData?: Partial<PosterData>;
  /** Callback when poster is downloaded */
  onDownload?: (format: 'png' | 'pdf', data: PosterData) => void;
  /** Custom color themes */
  customThemes?: ColorTheme[];
}

const DEFAULT_THEMES: ColorTheme[] = [
  {
    id: 'elegant',
    name: 'Elegant',
    primary: '#1e3a5f',
    secondary: '#d4af37',
    background: '#f5f5f0',
    text: '#1a1a1a',
    accent: '#8b0000',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    primary: '#0f172a',
    secondary: '#3b82f6',
    background: '#1e293b',
    text: '#f1f5f9',
    accent: '#fbbf24',
  },
  {
    id: 'royal',
    name: 'Royal',
    primary: '#4c1d95',
    secondary: '#fbbf24',
    background: '#faf5ff',
    text: '#1f2937',
    accent: '#7c3aed',
  },
  {
    id: 'forest',
    name: 'Forest',
    primary: '#14532d',
    secondary: '#a3e635',
    background: '#f0fdf4',
    text: '#1f2937',
    accent: '#22c55e',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    primary: '#7c2d12',
    secondary: '#fbbf24',
    background: '#fff7ed',
    text: '#1f2937',
    accent: '#f97316',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    primary: '#0c4a6e',
    secondary: '#06b6d4',
    background: '#ecfeff',
    text: '#1f2937',
    accent: '#0284c7',
  },
];

function PosterPreview({
  data,
  template,
  theme,
  scale = 0.5,
}: {
  data: PosterData;
  template: PosterTemplate;
  theme: ColorTheme;
  scale?: number;
}) {
  const posterRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const baseStyles = {
    width: 600 * scale,
    height: 800 * scale,
    fontSize: `${16 * scale}px`,
    fontFamily: template === 'classic' ? 'Georgia, serif' : 'system-ui, sans-serif',
    backgroundColor: theme.background,
    color: theme.text,
    overflow: 'hidden',
    position: 'relative' as const,
  };

  if (template === 'classic') {
    return (
      <div ref={posterRef} style={baseStyles} className="poster-preview">
        {/* Decorative border */}
        <div
          style={{
            position: 'absolute',
            inset: `${12 * scale}px`,
            border: `${2 * scale}px solid ${theme.secondary}`,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: `${16 * scale}px`,
            border: `${1 * scale}px solid ${theme.secondary}`,
            pointerEvents: 'none',
          }}
        />

        {/* Content */}
        <div
          style={{
            padding: `${40 * scale}px`,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            textAlign: 'center',
          }}
        >
          {/* Logo */}
          {data.logoUrl && (
            <img
              src={data.logoUrl}
              alt="Logo"
              style={{
                width: `${80 * scale}px`,
                height: `${80 * scale}px`,
                objectFit: 'contain',
                margin: '0 auto',
                marginBottom: `${16 * scale}px`,
              }}
            />
          )}

          {/* Orchestra name */}
          <div
            style={{
              fontSize: `${14 * scale}px`,
              color: theme.secondary,
              letterSpacing: `${2 * scale}px`,
              textTransform: 'uppercase',
              marginBottom: `${8 * scale}px`,
            }}
          >
            {data.orchestraName}
          </div>

          {/* Decorative line */}
          <div
            style={{
              width: `${60 * scale}px`,
              height: `${2 * scale}px`,
              backgroundColor: theme.secondary,
              margin: `${16 * scale}px auto`,
            }}
          />

          {/* Title */}
          <h1
            style={{
              fontSize: `${36 * scale}px`,
              fontWeight: 400,
              color: theme.primary,
              margin: `${16 * scale}px 0`,
              lineHeight: 1.2,
            }}
          >
            {data.title || 'Concerttitel'}
          </h1>

          {data.subtitle && (
            <div
              style={{
                fontSize: `${18 * scale}px`,
                fontStyle: 'italic',
                color: theme.text,
                opacity: 0.8,
              }}
            >
              {data.subtitle}
            </div>
          )}

          {/* Date and time */}
          <div
            style={{
              marginTop: `${32 * scale}px`,
              fontSize: `${18 * scale}px`,
              color: theme.primary,
            }}
          >
            {formatDate(data.date)}
          </div>
          <div
            style={{
              fontSize: `${24 * scale}px`,
              fontWeight: 600,
              color: theme.accent,
              marginTop: `${8 * scale}px`,
            }}
          >
            {data.time || '20:00'}
          </div>

          {/* Location */}
          <div
            style={{
              marginTop: `${24 * scale}px`,
              fontSize: `${16 * scale}px`,
            }}
          >
            <div style={{ fontWeight: 600 }}>{data.location || 'Locatie'}</div>
            {data.address && (
              <div style={{ fontSize: `${14 * scale}px`, opacity: 0.7, marginTop: `${4 * scale}px` }}>
                {data.address}
              </div>
            )}
          </div>

          {/* Program */}
          {data.program.length > 0 && (
            <div style={{ marginTop: `${32 * scale}px`, flex: 1 }}>
              <div
                style={{
                  fontSize: `${12 * scale}px`,
                  color: theme.secondary,
                  letterSpacing: `${1 * scale}px`,
                  textTransform: 'uppercase',
                  marginBottom: `${12 * scale}px`,
                }}
              >
                Programma
              </div>
              {data.program.slice(0, 5).map((item, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: `${14 * scale}px`,
                    marginBottom: `${6 * scale}px`,
                    color: theme.text,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}

          {/* Ticket info */}
          {data.ticketInfo && (
            <div
              style={{
                marginTop: 'auto',
                paddingTop: `${16 * scale}px`,
                fontSize: `${12 * scale}px`,
                color: theme.accent,
              }}
            >
              {data.ticketInfo}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (template === 'modern') {
    return (
      <div ref={posterRef} style={baseStyles} className="poster-preview">
        {/* Background gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            padding: `${40 * scale}px`,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            color: '#ffffff',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt="Logo"
                style={{
                  width: `${60 * scale}px`,
                  height: `${60 * scale}px`,
                  objectFit: 'contain',
                }}
              />
            ) : (
              <div />
            )}
            <div
              style={{
                fontSize: `${12 * scale}px`,
                opacity: 0.9,
                textAlign: 'right',
                textTransform: 'uppercase',
                letterSpacing: `${1 * scale}px`,
              }}
            >
              {data.orchestraName}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginTop: `${60 * scale}px`, flex: 1 }}>
            <h1
              style={{
                fontSize: `${48 * scale}px`,
                fontWeight: 800,
                lineHeight: 1.1,
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              {data.title || 'Concert'}
            </h1>
            {data.subtitle && (
              <div
                style={{
                  fontSize: `${20 * scale}px`,
                  marginTop: `${12 * scale}px`,
                  opacity: 0.9,
                }}
              >
                {data.subtitle}
              </div>
            )}
          </div>

          {/* Program */}
          {data.program.length > 0 && (
            <div
              style={{
                padding: `${20 * scale}px`,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: `${12 * scale}px`,
                marginBottom: `${24 * scale}px`,
              }}
            >
              {data.program.slice(0, 4).map((item, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: `${14 * scale}px`,
                    padding: `${6 * scale}px 0`,
                    borderBottom: index < data.program.length - 1 ? '1px solid rgba(255,255,255,0.2)' : 'none',
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}

          {/* Info bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: `${16 * scale}px`,
              background: 'rgba(255,255,255,0.15)',
              padding: `${20 * scale}px`,
              borderRadius: `${12 * scale}px`,
            }}
          >
            <div>
              <div style={{ fontSize: `${11 * scale}px`, opacity: 0.7, textTransform: 'uppercase' }}>
                Datum
              </div>
              <div style={{ fontSize: `${16 * scale}px`, fontWeight: 600 }}>
                {formatDate(data.date)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: `${11 * scale}px`, opacity: 0.7, textTransform: 'uppercase' }}>
                Tijd
              </div>
              <div style={{ fontSize: `${16 * scale}px`, fontWeight: 600 }}>
                {data.time || '20:00'}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: `${11 * scale}px`, opacity: 0.7, textTransform: 'uppercase' }}>
                Locatie
              </div>
              <div style={{ fontSize: `${16 * scale}px`, fontWeight: 600 }}>
                {data.location || 'Locatie'}
              </div>
              {data.address && (
                <div style={{ fontSize: `${12 * scale}px`, opacity: 0.8 }}>
                  {data.address}
                </div>
              )}
            </div>
          </div>

          {/* Ticket info */}
          {data.ticketInfo && (
            <div
              style={{
                marginTop: `${16 * scale}px`,
                textAlign: 'center',
                fontSize: `${12 * scale}px`,
                opacity: 0.9,
              }}
            >
              {data.ticketInfo}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Minimal template
  return (
    <div ref={posterRef} style={baseStyles} className="poster-preview">
      <div
        style={{
          padding: `${60 * scale}px`,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {/* Orchestra name */}
        <div
          style={{
            fontSize: `${12 * scale}px`,
            color: theme.secondary,
            letterSpacing: `${3 * scale}px`,
            textTransform: 'uppercase',
            marginBottom: `${40 * scale}px`,
          }}
        >
          {data.orchestraName}
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: `${42 * scale}px`,
            fontWeight: 300,
            color: theme.primary,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {data.title || 'Concert'}
        </h1>

        {data.subtitle && (
          <div
            style={{
              fontSize: `${18 * scale}px`,
              color: theme.text,
              opacity: 0.6,
              marginTop: `${8 * scale}px`,
            }}
          >
            {data.subtitle}
          </div>
        )}

        {/* Program */}
        {data.program.length > 0 && (
          <div style={{ marginTop: `${48 * scale}px` }}>
            {data.program.slice(0, 4).map((item, index) => (
              <div
                key={index}
                style={{
                  fontSize: `${14 * scale}px`,
                  color: theme.text,
                  padding: `${8 * scale}px 0`,
                  borderBottom: `1px solid ${theme.secondary}33`,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Info */}
        <div style={{ marginTop: `${32 * scale}px` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: `${24 * scale}px`,
              marginBottom: `${16 * scale}px`,
            }}
          >
            <span style={{ fontSize: `${28 * scale}px`, fontWeight: 600, color: theme.primary }}>
              {formatDate(data.date)}
            </span>
            <span style={{ fontSize: `${20 * scale}px`, color: theme.accent }}>
              {data.time || '20:00'}
            </span>
          </div>

          <div style={{ fontSize: `${16 * scale}px`, color: theme.text }}>
            {data.location || 'Locatie'}
          </div>
          {data.address && (
            <div style={{ fontSize: `${14 * scale}px`, color: theme.text, opacity: 0.6 }}>
              {data.address}
            </div>
          )}
        </div>

        {/* Ticket info */}
        {data.ticketInfo && (
          <div
            style={{
              marginTop: `${24 * scale}px`,
              paddingTop: `${16 * scale}px`,
              borderTop: `1px solid ${theme.secondary}33`,
              fontSize: `${12 * scale}px`,
              color: theme.accent,
            }}
          >
            {data.ticketInfo}
          </div>
        )}

        {/* Logo */}
        {data.logoUrl && (
          <div style={{ marginTop: `${24 * scale}px`, textAlign: 'right' }}>
            <img
              src={data.logoUrl}
              alt="Logo"
              style={{
                width: `${50 * scale}px`,
                height: `${50 * scale}px`,
                objectFit: 'contain',
                opacity: 0.6,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ConcertPosterGenerator({
  initialData,
  onDownload,
  customThemes = [],
}: ConcertPosterGeneratorProps) {
  // Translation hook available for i18n when needed
  useTranslation();
  const { isDark } = useDarkMode();
  const posterContainerRef = useRef<HTMLDivElement>(null);

  const allThemes = useMemo(() => [...DEFAULT_THEMES, ...customThemes], [customThemes]);

  const [data, setData] = useState<PosterData>({
    title: initialData?.title || '',
    subtitle: initialData?.subtitle || '',
    date: initialData?.date || '',
    time: initialData?.time || '20:00',
    location: initialData?.location || '',
    address: initialData?.address || '',
    orchestraName: initialData?.orchestraName || '',
    program: initialData?.program || [],
    ticketInfo: initialData?.ticketInfo || '',
    logoUrl: initialData?.logoUrl || '',
    backgroundImageUrl: initialData?.backgroundImageUrl || '',
  });

  const [template, setTemplate] = useState<PosterTemplate>('classic');
  const [selectedTheme, setSelectedTheme] = useState<ColorTheme>(allThemes[0]);
  const [programInput, setProgramInput] = useState(data.program.join('\n'));
  const [isGenerating, setIsGenerating] = useState(false);

  const updateData = useCallback(<K extends keyof PosterData>(key: K, value: PosterData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleProgramChange = useCallback((value: string) => {
    setProgramInput(value);
    const items = value.split('\n').filter((line) => line.trim());
    setData((prev) => ({ ...prev, program: items }));
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      updateData('logoUrl', result);
    };
    reader.readAsDataURL(file);
  }, [updateData]);

  const handleDownload = useCallback(async (format: 'png' | 'pdf') => {
    setIsGenerating(true);

    try {
      // Dynamic import of html2canvas (needs to be installed: npm install html2canvas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let html2canvas: any;
      try {
        const html2canvasModule = await import('html2canvas' as string);
        html2canvas = html2canvasModule.default;
      } catch {
        // html2canvas not installed, provide a fallback message
        alert('Installeer html2canvas voor poster downloads: npm install html2canvas');
        setIsGenerating(false);
        return;
      }

      // Find the poster preview element
      const posterElement = posterContainerRef.current?.querySelector('.poster-preview') as HTMLElement;
      if (!posterElement) {
        console.error('Poster element not found');
        return;
      }

      // Create a clone at full size
      const clone = posterElement.cloneNode(true) as HTMLElement;
      clone.style.transform = 'scale(2)';
      clone.style.transformOrigin = 'top left';
      clone.style.width = '600px';
      clone.style.height = '800px';
      clone.style.fontSize = '16px';
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: selectedTheme.background,
      });

      document.body.removeChild(clone);

      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `concert-poster-${data.title || 'poster'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        // For PDF, we'll create a simple PDF with the image
        // This is a simplified implementation
        const imgData = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `concert-poster-${data.title || 'poster'}.png`;
        link.href = imgData;
        link.click();
        // Note: For proper PDF export, you'd need a library like jsPDF
      }

      onDownload?.(format, data);
    } catch (error) {
      console.error('Error generating poster:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [data, selectedTheme, onDownload]);

  return (
    <div className="poster-generator">
      <div className="poster-generator-content">
        {/* Form panel */}
        <div className="poster-form-panel">
          <h2 className="panel-title">
            <Icon name="pencil" size={20} />
            Postergegevens
          </h2>

          <div className="form-section">
            <h3 className="form-section-title">Algemeen</h3>
            <div className="form-group">
              <label htmlFor="orchestraName">Orkest / Vereniging</label>
              <input
                id="orchestraName"
                type="text"
                value={data.orchestraName}
                onChange={(e) => updateData('orchestraName', e.target.value)}
                placeholder="Naam van het orkest"
              />
            </div>
            <div className="form-group">
              <label htmlFor="title">Titel</label>
              <input
                id="title"
                type="text"
                value={data.title}
                onChange={(e) => updateData('title', e.target.value)}
                placeholder="Titel van het concert"
              />
            </div>
            <div className="form-group">
              <label htmlFor="subtitle">Ondertitel (optioneel)</label>
              <input
                id="subtitle"
                type="text"
                value={data.subtitle}
                onChange={(e) => updateData('subtitle', e.target.value)}
                placeholder="Bijv. thema of bijzonderheid"
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Datum en locatie</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="date">Datum</label>
                <input
                  id="date"
                  type="date"
                  value={data.date}
                  onChange={(e) => updateData('date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="time">Tijd</label>
                <input
                  id="time"
                  type="time"
                  value={data.time}
                  onChange={(e) => updateData('time', e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="location">Locatie</label>
              <input
                id="location"
                type="text"
                value={data.location}
                onChange={(e) => updateData('location', e.target.value)}
                placeholder="Naam van de locatie"
              />
            </div>
            <div className="form-group">
              <label htmlFor="address">Adres (optioneel)</label>
              <input
                id="address"
                type="text"
                value={data.address}
                onChange={(e) => updateData('address', e.target.value)}
                placeholder="Straat en plaats"
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Programma</h3>
            <div className="form-group">
              <label htmlFor="program">Werken (een per regel)</label>
              <textarea
                id="program"
                value={programInput}
                onChange={(e) => handleProgramChange(e.target.value)}
                placeholder="Mozart - Ouverture&#10;Beethoven - Symfonie No. 5&#10;Dvorak - Slavische Dansen"
                rows={5}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Extra informatie</h3>
            <div className="form-group">
              <label htmlFor="ticketInfo">Ticketinformatie</label>
              <input
                id="ticketInfo"
                type="text"
                value={data.ticketInfo}
                onChange={(e) => updateData('ticketInfo', e.target.value)}
                placeholder="Bijv. Toegang gratis of Tickets via..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="logo">Logo uploaden</label>
              <input
                id="logo"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="file-input"
              />
              {data.logoUrl && (
                <div className="logo-preview">
                  <img src={data.logoUrl} alt="Logo preview" />
                  <button
                    type="button"
                    className="remove-logo-btn"
                    onClick={() => updateData('logoUrl', '')}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className="poster-preview-panel">
          <h2 className="panel-title">
            <Icon name="eye" size={20} />
            Voorbeeld
          </h2>

          {/* Template selection */}
          <div className="template-selection">
            <label>Sjabloon</label>
            <div className="template-buttons">
              {(['classic', 'modern', 'minimal'] as PosterTemplate[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`template-btn ${template === t ? 'active' : ''}`}
                  onClick={() => setTemplate(t)}
                >
                  {t === 'classic' ? 'Klassiek' : t === 'modern' ? 'Modern' : 'Minimaal'}
                </button>
              ))}
            </div>
          </div>

          {/* Theme selection */}
          <div className="theme-selection">
            <label>Kleurthema</label>
            <div className="theme-swatches">
              {allThemes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`theme-swatch ${selectedTheme.id === theme.id ? 'active' : ''}`}
                  onClick={() => setSelectedTheme(theme)}
                  title={theme.name}
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary} 50%, ${theme.secondary} 50%)`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="preview-container" ref={posterContainerRef}>
            <PosterPreview
              data={data}
              template={template}
              theme={selectedTheme}
              scale={0.5}
            />
          </div>

          {/* Download buttons */}
          <div className="download-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleDownload('png')}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>Genereren...</>
              ) : (
                <>
                  <Icon name="download" size={18} />
                  Downloaden als PNG
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleDownload('pdf')}
              disabled={isGenerating}
            >
              <Icon name="fileText" size={18} />
              PDF
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .poster-generator {
          font-family: var(--font-family);
          background: var(--background);
          min-height: 100%;
        }

        .poster-generator-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        @media (max-width: 1024px) {
          .poster-generator-content {
            grid-template-columns: 1fr;
          }
        }

        .poster-form-panel,
        .poster-preview-panel {
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
        }

        .panel-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text);
          margin: 0 0 24px 0;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .form-section {
          margin-bottom: 24px;
        }

        .form-section-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-light);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 12px 0;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text);
          margin-bottom: 6px;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: ${isDark ? 'var(--surface-hover)' : '#fff'};
          color: var(--text);
          font-size: 0.875rem;
          transition: border-color 0.2s;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--primary);
        }

        .form-group textarea {
          resize: vertical;
          min-height: 100px;
          font-family: inherit;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .file-input {
          padding: 8px 12px !important;
        }

        .logo-preview {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 8px;
          background: var(--surface-hover);
          border-radius: 8px;
        }

        .logo-preview img {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }

        .remove-logo-btn {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          color: var(--text-muted);
          border-radius: 4px;
        }

        .remove-logo-btn:hover {
          background: rgba(220, 38, 38, 0.1);
          color: #dc2626;
        }

        .template-selection,
        .theme-selection {
          margin-bottom: 20px;
        }

        .template-selection label,
        .theme-selection label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text);
          margin-bottom: 8px;
        }

        .template-buttons {
          display: flex;
          gap: 8px;
        }

        .template-btn {
          flex: 1;
          padding: 10px 16px;
          background: ${isDark ? 'var(--surface-hover)' : 'var(--surface)'};
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .template-btn:hover {
          border-color: var(--primary);
        }

        .template-btn.active {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }

        .theme-swatches {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .theme-swatch {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .theme-swatch:hover {
          transform: scale(1.1);
        }

        .theme-swatch.active {
          border-color: var(--text);
          box-shadow: 0 0 0 2px var(--background);
        }

        .preview-container {
          display: flex;
          justify-content: center;
          padding: 20px;
          background: ${isDark ? '#0f172a' : '#e5e7eb'};
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .poster-preview {
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }

        .download-actions {
          display: flex;
          gap: 12px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          flex: 1;
        }

        .btn-primary {
          background: var(--primary);
          color: white;
          border: none;
        }

        .btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-outline {
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border);
        }

        .btn-outline:hover:not(:disabled) {
          background: var(--surface-hover);
          border-color: var(--border-strong);
        }

        @media (max-width: 640px) {
          .poster-generator-content {
            padding: 16px;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .template-buttons {
            flex-direction: column;
          }

          .download-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

export default ConcertPosterGenerator;
