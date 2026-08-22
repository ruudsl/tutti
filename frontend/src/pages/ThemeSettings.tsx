import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { updateTheme } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useConfirm } from '../hooks/useConfirm';
import { useSettings } from '../hooks/useSettings';
import type { ThemeSettings } from '../types';

const DEFAULT_THEME: ThemeSettings = {
  primaryColor: '#2563eb',
  primaryDarkColor: '#1d4ed8',
  secondaryColor: '#64748b',
  successColor: '#22c55e',
  dangerColor: '#ef4444',
  warningColor: '#f59e0b',
  backgroundColor: '#f8fafc',
  surfaceColor: '#ffffff',
  textColor: '#1e293b',
  textLightColor: '#536479',
  borderColor: '#e2e8f0',
  fontFamily: 'system',
  fontSizeBase: 16,
  borderRadius: 0.5,
};

const FONT_OPTIONS = ['system', 'inter', 'roboto', 'georgia', 'mono'];

const COLOR_FIELDS: { key: keyof ThemeSettings; section: 'main' | 'ui' }[] = [
  { key: 'primaryColor', section: 'main' },
  { key: 'primaryDarkColor', section: 'main' },
  { key: 'secondaryColor', section: 'main' },
  { key: 'successColor', section: 'ui' },
  { key: 'dangerColor', section: 'ui' },
  { key: 'warningColor', section: 'ui' },
  { key: 'backgroundColor', section: 'ui' },
  { key: 'surfaceColor', section: 'ui' },
  { key: 'textColor', section: 'ui' },
  { key: 'textLightColor', section: 'ui' },
  { key: 'borderColor', section: 'ui' },
];

export default function ThemeSettingsPage() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.theme');
  const confirmDialog = useConfirm();
  const [theme, setTheme] = useState<ThemeSettings>({ ...DEFAULT_THEME });
  const [isSaving, setIsSaving] = useState(false);

  // Dezelfde hook als de instellingenpagina gebruikt. Hier stond een eigen
  // `useQuery` op sleutel `['settings']` met een eigen opties-blok; welke van
  // de twee blokken gold, hing af van welke pagina je het eerst opende. Zie
  // `src/hooks/useSettings.ts`.
  const { data: settings, isLoading } = useSettings();

  // Initialize theme from settings
  useEffect(() => {
    if (settings?.theme) {
      setTheme({ ...DEFAULT_THEME, ...settings.theme });
    }
  }, [settings]);

  const handleColorChange = (key: keyof ThemeSettings, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Only send non-default values to keep payload clean
      const themeToSave: ThemeSettings = {};
      for (const [key, value] of Object.entries(theme)) {
        if (value !== undefined && value !== (DEFAULT_THEME as any)[key]) {
          (themeToSave as any)[key] = value;
        }
      }
      // If everything matches defaults, save as non-empty to indicate "explicitly default"
      await updateTheme(Object.keys(themeToSave).length > 0 ? { ...DEFAULT_THEME, ...themeToSave } : null);
      showSuccess(t('theme.saved'));
      window.dispatchEvent(new Event('theme-updated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('theme.errorSaving'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!(await confirmDialog(t('theme.resetConfirm')))) return;
    setIsSaving(true);
    try {
      await updateTheme(null);
      setTheme({ ...DEFAULT_THEME });
      showSuccess(t('theme.resetDone'));
      window.dispatchEvent(new Event('theme-updated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('theme.errorSaving'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading" role="status">
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  const mainColors = COLOR_FIELDS.filter((f) => f.section === 'main');
  const uiColors = COLOR_FIELDS.filter((f) => f.section === 'ui');

  return (
    <div>
      <div className="page-header">
        <h1>{t('theme.title')}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-outline" onClick={handleReset} disabled={isSaving}>
            {t('theme.reset')}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      <p className="piece-meta mb-3">{t('theme.description')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left column: colors */}
        <div>
          <div className="card mb-3">
            <div className="card-header">
              <h2 className="card-title">{t('theme.colors')}</h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                {mainColors.map(({ key }) => (
                  <ColorPicker
                    key={key}
                    label={t(`theme.${key}`)}
                    value={(theme[key] as string) || (DEFAULT_THEME[key] as string)}
                    onChange={(v) => handleColorChange(key, v)}
                  />
                ))}
              </div>
              <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                {uiColors.map(({ key }) => (
                  <ColorPicker
                    key={key}
                    label={t(`theme.${key}`)}
                    value={(theme[key] as string) || (DEFAULT_THEME[key] as string)}
                    onChange={(v) => handleColorChange(key, v)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: typography, layout, preview */}
        <div>
          <div className="card mb-3">
            <div className="card-header">
              <h2 className="card-title">{t('theme.typography')}</h2>
            </div>
            <div className="card-body">
              <div className="form-group mb-2">
                <label htmlFor="fontFamily" className="form-label">
                  {t('theme.fontFamily')}
                </label>
                <select
                  id="fontFamily"
                  className="form-control form-select"
                  value={theme.fontFamily || 'system'}
                  onChange={(e) => setTheme((prev) => ({ ...prev, fontFamily: e.target.value }))}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {t(`theme.fonts.${f}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="fontSizeBase" className="form-label">
                  {t('theme.fontSizeBase')}: {theme.fontSizeBase || 16}
                  {t('theme.fontSizeUnit')}
                </label>
                <input
                  id="fontSizeBase"
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={theme.fontSizeBase || 16}
                  onChange={(e) => setTheme((prev) => ({ ...prev, fontSizeBase: Number(e.target.value) }))}
                  style={{ width: '100%' }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-light)',
                  }}
                >
                  <span>12px</span>
                  <span>24px</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-header">
              <h2 className="card-title">{t('theme.layout')}</h2>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label htmlFor="borderRadius" className="form-label">
                  {t('theme.borderRadius')}: {theme.borderRadius ?? 0.5}rem
                </label>
                <input
                  id="borderRadius"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={theme.borderRadius ?? 0.5}
                  onChange={(e) => setTheme((prev) => ({ ...prev, borderRadius: Number(e.target.value) }))}
                  style={{ width: '100%' }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-light)',
                  }}
                >
                  <span>{t('theme.borderRadiusSharp')}</span>
                  <span>{t('theme.borderRadiusRound')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t('theme.preview')}</h2>
            </div>
            <div className="card-body">
              <ThemePreview theme={theme} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '32px',
            height: '32px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            padding: '2px',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) {
              onChange(e.target.value);
            }
          }}
          style={{
            width: '80px',
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'monospace',
          }}
          maxLength={7}
        />
      </div>
    </div>
  );
}

const FONT_FAMILIES: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
};

function ThemePreview({ theme }: { theme: ThemeSettings }) {
  const { t } = useTranslation();

  const previewStyle: React.CSSProperties = {
    fontFamily: FONT_FAMILIES[theme.fontFamily || 'system'],
    fontSize: `${theme.fontSizeBase || 16}px`,
    backgroundColor: theme.backgroundColor || '#f8fafc',
    color: theme.textColor || '#1e293b',
    padding: '1rem',
    borderRadius: `${(theme.borderRadius ?? 0.5) * 1.5}rem`,
    border: `1px solid ${theme.borderColor || '#e2e8f0'}`,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: theme.surfaceColor || '#ffffff',
    border: `1px solid ${theme.borderColor || '#e2e8f0'}`,
    borderRadius: `${theme.borderRadius ?? 0.5}rem`,
    padding: '1rem',
    marginBottom: '0.75rem',
  };

  const btnStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.4rem 0.8rem',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'white',
    backgroundColor: theme.primaryColor || '#2563eb',
    border: 'none',
    borderRadius: `${Math.max(0, (theme.borderRadius ?? 0.5) * 0.5)}rem`,
    cursor: 'default',
    marginRight: '0.5rem',
  };

  const btnOutlineStyle: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: 'transparent',
    color: theme.primaryColor || '#2563eb',
    border: `1px solid ${theme.primaryColor || '#2563eb'}`,
  };

  return (
    <div style={previewStyle}>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{t('theme.previewCard')}</div>
        <p style={{ color: theme.textLightColor || '#536479', fontSize: '0.85em', marginBottom: '0.75rem' }}>
          {t('theme.previewText')}
        </p>
        <div>
          <span style={btnStyle}>{t('common.save')}</span>
          <span style={btnOutlineStyle}>{t('common.cancel')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ ...btnStyle, backgroundColor: theme.successColor || '#22c55e', fontSize: '0.7rem' }}>
          Success
        </span>
        <span style={{ ...btnStyle, backgroundColor: theme.dangerColor || '#ef4444', fontSize: '0.7rem' }}>Danger</span>
        <span style={{ ...btnStyle, backgroundColor: theme.warningColor || '#f59e0b', fontSize: '0.7rem' }}>
          Warning
        </span>
        <span style={{ ...btnStyle, backgroundColor: theme.secondaryColor || '#64748b', fontSize: '0.7rem' }}>
          Secondary
        </span>
      </div>
    </div>
  );
}
