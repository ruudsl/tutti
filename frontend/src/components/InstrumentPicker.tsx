/**
 * Instrument Picker Component (WP5)
 *
 * Autocomplete component for selecting instruments from JSKOS vocabulary.
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstrumentSearch, VocabularyConcept } from '../hooks/useVocabulary';
import { Icon } from './Icon';

export interface SelectedInstrument {
  uri: string;
  label: string;
  count: number;
  isOptional: boolean;
  notes?: string;
}

interface InstrumentPickerProps {
  value: SelectedInstrument[];
  onChange: (instruments: SelectedInstrument[]) => void;
  disabled?: boolean;
  /**
   * Id voor het zoekveld, zodat een `<label htmlFor>` erbuiten er echt naartoe
   * kan wijzen. Optioneel, want niet elke aanroeper heeft een label nodig.
   */
  id?: string;
}

export function InstrumentPicker({ value, onChange, disabled, id }: InstrumentPickerProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading } = useInstrumentSearch(query);

  const lang = i18n.language === 'nl' ? 'nl' : i18n.language === 'de' ? 'de' : 'en';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (concept: VocabularyConcept) => {
    const exists = value.some((i) => i.uri === concept.uri);
    if (!exists) {
      onChange([
        ...value,
        {
          uri: concept.uri,
          label: concept.labels[lang] || concept.label,
          count: 1,
          isOptional: false,
        },
      ]);
    }
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleRemove = (uri: string) => {
    onChange(value.filter((i) => i.uri !== uri));
  };

  const handleUpdateCount = (uri: string, count: number) => {
    onChange(value.map((i) => (i.uri === uri ? { ...i, count: Math.max(1, count) } : i)));
  };

  const handleToggleOptional = (uri: string) => {
    onChange(value.map((i) => (i.uri === uri ? { ...i, isOptional: !i.isOptional } : i)));
  };

  return (
    <div className="space-y-2">
      {/* Selected instruments */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((instr, index) => (
            <div
              key={instr.uri}
              className={`badge badge-lg gap-1 ${instr.isOptional ? 'badge-outline' : 'badge-primary'}`}
            >
              {editingIndex === index ? (
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={instr.count}
                  onChange={(e) => handleUpdateCount(instr.uri, parseInt(e.target.value) || 1)}
                  onBlur={() => setEditingIndex(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingIndex(null)}
                  className="input input-xs w-12 text-center"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingIndex(index)}
                  className="font-bold hover:underline"
                  disabled={disabled}
                >
                  {instr.count}x
                </button>
              )}
              <span>{instr.label}</span>
              <button
                type="button"
                onClick={() => handleToggleOptional(instr.uri)}
                className="opacity-60 hover:opacity-100"
                title={instr.isOptional ? t('metadata.required') : t('metadata.optional')}
                disabled={disabled}
              >
                {instr.isOptional ? '?' : '!'}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(instr.uri)}
                className="hover:text-error"
                disabled={disabled}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative" ref={dropdownRef}>
        {/*
          Het id hoort op dit zoekveld en niet op de eerste knop in de opmaak.
          De reeds gekozen instrumenten staan er weliswaar bóven, maar dat zijn
          knoppen om een keuze te wijzigen of te wissen; wie op het label klikt
          wil een instrument toevoegen, en dat begint hier. De keuzeknoppen
          dragen hun eigen naam al, dit veld had er geen.
        */}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="input input-bordered w-full"
          placeholder={t('metadata.searchInstruments')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
        />

        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="loading loading-spinner loading-sm" />
          </div>
        )}

        {/* Dropdown */}
        {isOpen && query.length >= 2 && searchResults && (
          <ul className="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {searchResults.instruments.length === 0 ? (
              <li className="px-4 py-2 text-base-content/60">{t('metadata.noResults')}</li>
            ) : (
              searchResults.instruments.map((concept) => {
                const isSelected = value.some((i) => i.uri === concept.uri);
                return (
                  <li key={concept.uri}>
                    <button
                      type="button"
                      className={`w-full px-4 py-2 text-left hover:bg-base-200 flex justify-between items-center ${
                        isSelected ? 'opacity-50' : ''
                      }`}
                      onClick={() => handleSelect(concept)}
                      disabled={isSelected}
                    >
                      <span>
                        {concept.labels[lang] || concept.label}
                        {concept.notation && (
                          <span className="ml-2 text-xs text-base-content/60">({concept.notation})</span>
                        )}
                      </span>
                      {isSelected && <Icon name="check" size={16} />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
