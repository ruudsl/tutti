import { currentLocale } from '../utils/locale';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeatCard } from '../types';
import './SeatCardPrinter.css';

interface SeatCardPrinterProps {
  concertName: string;
  concertDate: string;
  concertLocation: string | null;
  layoutName: string;
  seatCards: SeatCard[];
  cardsPerRow?: number;
  cardSize?: 'small' | 'medium' | 'large';
  showConcertInfo?: boolean;
}

export default function SeatCardPrinter({
  concertName,
  concertDate,
  concertLocation,
  layoutName,
  seatCards,
  cardsPerRow = 3,
  cardSize = 'medium',
  showConcertInfo = true,
}: SeatCardPrinterProps) {
  const { t } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(currentLocale(), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Card dimensions based on size
  const cardDimensions = {
    small: { width: '65mm', height: '40mm', fontSize: '10px' },
    medium: { width: '85mm', height: '54mm', fontSize: '12px' },
    large: { width: '100mm', height: '60mm', fontSize: '14px' },
  };

  const dims = cardDimensions[cardSize];

  return (
    <div className="seat-card-printer">
      {/* Print controls - hidden when printing */}
      <div className="print-controls no-print">
        <div className="print-info">
          <span>
            {seatCards.length} {t('seatCards.cards', 'kaartjes')}
          </span>
          <span className="separator">|</span>
          <span>{layoutName}</span>
        </div>
        <button className="btn btn-primary" onClick={handlePrint}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: '8px' }}
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          {t('seatCards.print', 'Afdrukken')}
        </button>
      </div>

      {/* Printable area */}
      <div ref={printRef} className="print-area">
        {/* Header - only on first page */}
        {showConcertInfo && (
          <div className="print-header">
            <h1>{concertName}</h1>
            <p className="print-date">{formatDate(concertDate)}</p>
            {concertLocation && <p className="print-location">{concertLocation}</p>}
          </div>
        )}

        {/* Cards grid */}
        <div
          className="seat-cards-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cardsPerRow}, ${dims.width})`,
            gap: '8mm',
            justifyContent: 'center',
          }}
        >
          {seatCards.map((card) => (
            <div
              key={card.positionId}
              className="seat-card"
              style={{
                width: dims.width,
                height: dims.height,
                fontSize: dims.fontSize,
                borderLeft: `6px solid ${card.sectionColor}`,
              }}
            >
              <div className="seat-card-header">
                <span className="seat-label">{card.label}</span>
                <span className="seat-stand">#{card.standNumber}</span>
              </div>
              <div className="seat-card-body">
                <div className="musician-name">{card.musicianName || '---'}</div>
                <div className="instrument-name">{card.instrument || '---'}</div>
              </div>
              <div className="seat-card-footer">
                <span className="section-name">{card.section}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
