import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeatingChart, SeatingChartSeat } from '../types';

interface Props {
  chart: SeatingChart;
  onSeatClick?: (seat: SeatingChartSeat) => void;
  highlightUserId?: string | null;
}

// Color palette for different instrument groups
const INSTRUMENT_COLORS: Record<string, string> = {
  'Flute': '#4A90D9',
  'Piccolo': '#4A90D9',
  'Oboe': '#5C9EE8',
  'Clarinet': '#6BB3F7',
  'Bass Clarinet': '#6BB3F7',
  'Eb Clarinet': '#6BB3F7',
  'Alto Clarinet': '#6BB3F7',
  'Alto Saxophone': '#E8A435',
  'Tenor Saxophone': '#E8A435',
  'Baritone Saxophone': '#E8A435',
  'Soprano Saxophone': '#E8A435',
  'French Horn': '#9B59B6',
  'Trumpet': '#E74C3C',
  'Cornet': '#E74C3C',
  'Flugelhorn': '#E74C3C',
  'Euphonium': '#27AE60',
  'Tuba': '#27AE60',
  'Trombone': '#2ECC71',
  'Bass Trombone': '#2ECC71',
  'Piano': '#95A5A6',
  'Guitar': '#8E44AD',
  'Electric Bass': '#8E44AD',
  'String Bass': '#8E44AD',
  'Percussion': '#F39C12',
  'Timpani': '#F39C12',
  'Mallets': '#F39C12',
};

const DEFAULT_COLOR = '#7F8C8D';

function getInstrumentColor(instrumentName: string | null): string {
  if (!instrumentName) return DEFAULT_COLOR;

  // Check for exact match first
  if (INSTRUMENT_COLORS[instrumentName]) {
    return INSTRUMENT_COLORS[instrumentName];
  }

  // Check for partial match
  for (const [key, color] of Object.entries(INSTRUMENT_COLORS)) {
    if (instrumentName.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }

  return DEFAULT_COLOR;
}

export default function SeatingChartVisualization({ chart, onSeatClick, highlightUserId }: Props) {
  const { t } = useTranslation();
  const [hoveredSeat, setHoveredSeat] = useState<SeatingChartSeat | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Calculate layout dimensions
  const layout = useMemo(() => {
    const SEAT_WIDTH = 80;
    const SEAT_HEIGHT = 50;
    const SEAT_GAP = 8;
    const ROW_GAP = 20;
    const PADDING = 40;
    const CURVE_FACTOR = 0.15; // How much the rows curve (0 = flat, 1 = semicircle)

    // Group seats by row
    const rowsMap = new Map<number, SeatingChartSeat[]>();
    for (const seat of chart.seats) {
      if (!rowsMap.has(seat.rowNumber)) {
        rowsMap.set(seat.rowNumber, []);
      }
      rowsMap.get(seat.rowNumber)!.push(seat);
    }

    // Sort rows by row number
    const rows = Array.from(rowsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([rowNumber, seats]) => ({
        rowNumber,
        seats: seats.sort((a, b) => a.positionInRow - b.positionInRow),
      }));

    // Find max seats in a row
    const maxSeatsInRow = Math.max(...rows.map(r => r.seats.length), 1);

    // Calculate SVG dimensions
    const chartWidth = maxSeatsInRow * (SEAT_WIDTH + SEAT_GAP) - SEAT_GAP + PADDING * 2;
    const chartHeight = rows.length * (SEAT_HEIGHT + ROW_GAP) - ROW_GAP + PADDING * 2 + 60; // Extra for conductor

    // Calculate seat positions with curved rows
    const seatPositions: { seat: SeatingChartSeat; x: number; y: number }[] = [];

    rows.forEach((row, rowIndex) => {
      const rowY = PADDING + rowIndex * (SEAT_HEIGHT + ROW_GAP) + 60; // Offset for conductor
      const rowWidth = row.seats.length * (SEAT_WIDTH + SEAT_GAP) - SEAT_GAP;
      const rowStartX = (chartWidth - rowWidth) / 2;

      row.seats.forEach((seat, seatIndex) => {
        // Calculate curve offset (seats in the middle are lower/higher)
        const normalizedPos = row.seats.length > 1
          ? (seatIndex / (row.seats.length - 1)) * 2 - 1 // -1 to 1
          : 0;
        const curveOffset = (1 - normalizedPos * normalizedPos) * CURVE_FACTOR * rowIndex * 10;

        seatPositions.push({
          seat,
          x: rowStartX + seatIndex * (SEAT_WIDTH + SEAT_GAP),
          y: rowY + curveOffset,
        });
      });
    });

    return {
      width: chartWidth,
      height: chartHeight,
      seatPositions,
      SEAT_WIDTH,
      SEAT_HEIGHT,
      PADDING,
      rows,
    };
  }, [chart.seats]);

  const handleMouseEnter = (seat: SeatingChartSeat, e: React.MouseEvent) => {
    setHoveredSeat(seat);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const handleMouseLeave = () => {
    setHoveredSeat(null);
  };

  return (
    <div className="seating-chart-container" style={{ position: 'relative' }}>
      <svg
        width="100%"
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ maxHeight: '600px', margin: '0 auto', display: 'block' }}
      >
        {/* Background */}
        <rect width={layout.width} height={layout.height} fill="var(--bg-color, #f5f5f5)" rx="8" />

        {/* Conductor position */}
        <g transform={`translate(${layout.width / 2}, 35)`}>
          <circle r="20" fill="var(--primary-color, #3498db)" opacity="0.2" />
          <circle r="15" fill="var(--primary-color, #3498db)" opacity="0.4" />
          <circle r="5" fill="var(--primary-color, #3498db)" />
          <text
            y="35"
            textAnchor="middle"
            fill="var(--text-color, #333)"
            fontSize="12"
            fontWeight="500"
          >
            {t('seating.conductor')}
          </text>
        </g>

        {/* Row labels on the left */}
        {layout.rows.map((row, index) => (
          <text
            key={`label-${row.rowNumber}`}
            x={15}
            y={layout.PADDING + index * (layout.SEAT_HEIGHT + 20) + 60 + layout.SEAT_HEIGHT / 2 + 4}
            fill="var(--text-light-color, #666)"
            fontSize="10"
            textAnchor="start"
          >
            {row.rowNumber}
          </text>
        ))}

        {/* Seats */}
        {layout.seatPositions.map(({ seat, x, y }) => {
          const isHighlighted = highlightUserId && seat.userId === highlightUserId;
          const isHovered = hoveredSeat?.id === seat.id;
          const color = getInstrumentColor(seat.instrumentName);

          return (
            <g
              key={seat.id}
              transform={`translate(${x}, ${y})`}
              onClick={() => onSeatClick?.(seat)}
              onMouseEnter={(e) => handleMouseEnter(seat, e)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: onSeatClick ? 'pointer' : 'default' }}
            >
              {/* Chair shape - slightly curved back */}
              <path
                d={`M 5 ${layout.SEAT_HEIGHT - 5}
                    Q 0 ${layout.SEAT_HEIGHT - 15} 5 5
                    L 10 0
                    Q ${layout.SEAT_WIDTH / 2} -5 ${layout.SEAT_WIDTH - 10} 0
                    L ${layout.SEAT_WIDTH - 5} 5
                    Q ${layout.SEAT_WIDTH} ${layout.SEAT_HEIGHT - 15} ${layout.SEAT_WIDTH - 5} ${layout.SEAT_HEIGHT - 5}
                    Q ${layout.SEAT_WIDTH / 2} ${layout.SEAT_HEIGHT} 5 ${layout.SEAT_HEIGHT - 5}
                    Z`}
                fill={color}
                opacity={isHovered ? 1 : 0.85}
                stroke={isHighlighted ? 'var(--primary-color, #3498db)' : 'transparent'}
                strokeWidth={isHighlighted ? 3 : 0}
              />

              {/* Member name (truncated) */}
              <text
                x={layout.SEAT_WIDTH / 2}
                y={layout.SEAT_HEIGHT / 2 - 5}
                textAnchor="middle"
                fill="white"
                fontSize="11"
                fontWeight="500"
              >
                {seat.memberName.split(' ')[0].substring(0, 8)}
              </text>

              {/* Last name initial */}
              <text
                x={layout.SEAT_WIDTH / 2}
                y={layout.SEAT_HEIGHT / 2 + 10}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                opacity="0.9"
              >
                {seat.memberName.split(' ').slice(1).map(n => n[0]).join('')}
              </text>
            </g>
          );
        })}

        {/* Orchestra name */}
        <text
          x={layout.width / 2}
          y={layout.height - 15}
          textAnchor="middle"
          fill="var(--text-light-color, #666)"
          fontSize="14"
          fontWeight="500"
        >
          {chart.orchestraName}
        </text>
      </svg>

      {/* Tooltip */}
      {hoveredSeat && (
        <div
          className="seating-tooltip"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y - 10,
            transform: 'translate(-50%, -100%)',
            background: 'var(--surface-color, white)',
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: '6px',
            padding: '8px 12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{hoveredSeat.memberName}</div>
          {hoveredSeat.instrumentName && (
            <div style={{ fontSize: '12px', color: 'var(--text-light-color, #666)' }}>
              {hoveredSeat.instrumentName}
            </div>
          )}
          {hoveredSeat.sectionName && (
            <div style={{ fontSize: '11px', color: 'var(--text-light-color, #888)', marginTop: '2px' }}>
              {hoveredSeat.sectionName}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="seating-legend" style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        justifyContent: 'center',
        marginTop: '16px',
        padding: '12px',
        background: 'var(--surface-color, white)',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #eee)',
      }}>
        {Object.entries(INSTRUMENT_COLORS)
          .filter(([key]) => chart.seats.some(s => s.instrumentName?.includes(key)))
          .slice(0, 12) // Limit legend items
          .map(([name, color]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                backgroundColor: color,
              }} />
              <span style={{ fontSize: '12px', color: 'var(--text-color, #333)' }}>{name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
