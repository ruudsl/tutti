import { currentLocale } from '../utils/locale';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getSeatHeatmapData } from '../api';
import type { VenueLayout, SectionHeatmapData, SeatSalesData } from '../types';

export interface SeatHeatmapProps {
  concertId: string;
  layout: VenueLayout;
  mode: 'sales_speed' | 'popularity' | 'price_performance';
}

// Color gradients for different modes
const GRADIENT_COLORS = {
  sales_speed: {
    // Cool (slow) to Hot (fast selling)
    colors: ['#3B82F6', '#22C55E', '#EAB308', '#F97316', '#EF4444'],
    labels: ['Slow', '', 'Medium', '', 'Fast'],
  },
  popularity: {
    // Low to High popularity
    colors: ['#94A3B8', '#60A5FA', '#34D399', '#FBBF24', '#F43F5E'],
    labels: ['Low', '', 'Medium', '', 'High'],
  },
  price_performance: {
    // Poor to Excellent price performance
    colors: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981'],
    labels: ['Poor', '', 'Average', '', 'Excellent'],
  },
};

// Get color based on value (0-100) and mode
function getHeatmapColor(value: number, mode: SeatHeatmapProps['mode']): string {
  const gradient = GRADIENT_COLORS[mode];
  const clampedValue = Math.max(0, Math.min(100, value));
  const index = Math.floor((clampedValue / 100) * (gradient.colors.length - 1));
  const remainder = (clampedValue / 100) * (gradient.colors.length - 1) - index;

  if (index >= gradient.colors.length - 1) {
    return gradient.colors[gradient.colors.length - 1];
  }

  // Interpolate between colors
  const color1 = hexToRgb(gradient.colors[index]);
  const color2 = hexToRgb(gradient.colors[index + 1]);

  if (!color1 || !color2) return gradient.colors[0];

  const r = Math.round(color1.r + (color2.r - color1.r) * remainder);
  const g = Math.round(color1.g + (color2.g - color1.g) * remainder);
  const b = Math.round(color1.b + (color2.b - color1.b) * remainder);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Unsold seat color
const UNSOLD_COLOR = '#E2E8F0';

interface SeatTooltipData {
  seatLabel: string;
  rowLabel: string;
  sectionName: string;
  status: string;
  price: number | null;
  soldAt: string | null;
  timeToSell: number | null;
  value: number;
  valueLabel: string;
}

export default function SeatHeatmap({ concertId, layout, mode }: SeatHeatmapProps) {
  const { t } = useTranslation();
  const [hoveredSeat, setHoveredSeat] = useState<SeatTooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<'seats' | 'sections'>('sections');

  // Fetch heatmap data
  const {
    data: heatmapData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['seatHeatmap', concertId],
    queryFn: () => getSeatHeatmapData(concertId),
    enabled: !!concertId,
  });

  // Calculate dimensions and layout
  const chartLayout = useMemo(() => {
    if (!layout) return null;

    const PADDING = 40;
    const SECTION_GAP = 20;
    const SEAT_SIZE = viewMode === 'seats' ? 16 : 0;
    const SEAT_GAP = 4;

    // Group seats by section
    const sectionSeats = new Map<string, typeof layout.seats>();
    for (const seat of layout.seats) {
      if (!sectionSeats.has(seat.sectionId)) {
        sectionSeats.set(seat.sectionId, []);
      }
      sectionSeats.get(seat.sectionId)!.push(seat);
    }

    // Sort sections by row number and sort order
    const sortedSections = [...layout.sections].sort((a, b) => {
      if (a.rowNumber !== b.rowNumber) return a.rowNumber - b.rowNumber;
      return a.sortOrder - b.sortOrder;
    });

    // Calculate section positions
    let currentY = PADDING;
    const sectionPositions: {
      section: (typeof layout.sections)[0];
      x: number;
      y: number;
      width: number;
      height: number;
      seats: { seat: (typeof layout.seats)[0]; x: number; y: number }[];
    }[] = [];

    // Group sections by row
    const sectionsByRow = new Map<number, typeof layout.sections>();
    for (const section of sortedSections) {
      if (!sectionsByRow.has(section.rowNumber)) {
        sectionsByRow.set(section.rowNumber, []);
      }
      sectionsByRow.get(section.rowNumber)!.push(section);
    }

    const rowNumbers = Array.from(sectionsByRow.keys()).sort((a, b) => a - b);

    for (const rowNum of rowNumbers) {
      const rowSections = sectionsByRow.get(rowNum)!;
      let currentX = PADDING;
      let maxRowHeight = 0;

      for (const section of rowSections) {
        const seats = sectionSeats.get(section.id) || [];
        const seatsPerRow = Math.ceil(Math.sqrt(seats.length));
        const numRows = Math.ceil(seats.length / seatsPerRow);

        const sectionWidth = viewMode === 'seats' ? seatsPerRow * (SEAT_SIZE + SEAT_GAP) - SEAT_GAP + 20 : 120;
        const sectionHeight = viewMode === 'seats' ? numRows * (SEAT_SIZE + SEAT_GAP) - SEAT_GAP + 40 : 80;

        maxRowHeight = Math.max(maxRowHeight, sectionHeight);

        // Calculate seat positions within section
        const seatPositions = seats.map((seat, i) => {
          const row = Math.floor(i / seatsPerRow);
          const col = i % seatsPerRow;
          return {
            seat,
            x: currentX + 10 + col * (SEAT_SIZE + SEAT_GAP),
            y: currentY + 30 + row * (SEAT_SIZE + SEAT_GAP),
          };
        });

        sectionPositions.push({
          section,
          x: currentX,
          y: currentY,
          width: sectionWidth,
          height: sectionHeight,
          seats: seatPositions,
        });

        currentX += sectionWidth + SECTION_GAP;
      }

      currentY += maxRowHeight + SECTION_GAP;
    }

    const totalWidth = Math.max(...sectionPositions.map((s) => s.x + s.width)) + PADDING;
    const totalHeight = currentY + PADDING;

    return {
      width: totalWidth,
      height: totalHeight,
      sections: sectionPositions,
      SEAT_SIZE,
    };
  }, [layout, viewMode]);

  // Get value for a seat based on mode
  const getSeatValue = (seat: SeatSalesData): number => {
    if (seat.status !== 'sold') return 0;

    switch (mode) {
      case 'sales_speed':
        return seat.salesSpeedPercentile ?? 0;
      case 'popularity':
        return seat.salesSpeedPercentile ?? 0;
      case 'price_performance':
        // Higher price with quick sale = better performance
        if (seat.timeToSell === null || seat.price === null) return 50;
        return seat.salesSpeedPercentile ?? 50;
      default:
        return 50;
    }
  };

  // Get value for a section based on mode
  const getSectionValue = (section: SectionHeatmapData): number => {
    switch (mode) {
      case 'sales_speed':
        return Math.min(100, section.salesVelocity * 10); // Normalize velocity
      case 'popularity':
        return section.popularityScore;
      case 'price_performance':
        return section.pricePerformanceScore;
      default:
        return 50;
    }
  };

  const handleSeatMouseEnter = (seatData: SeatSalesData, sectionName: string, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const value = getSeatValue(seatData);

    let valueLabel = '';
    switch (mode) {
      case 'sales_speed':
        valueLabel =
          seatData.timeToSell !== null ? `${Math.round(seatData.timeToSell / 3600)}h to sell` : t('heatmap.notSold');
        break;
      case 'popularity':
        valueLabel = `${Math.round(value)}% ${t('heatmap.popularityScore')}`;
        break;
      case 'price_performance':
        valueLabel = `${Math.round(value)}% ${t('heatmap.pricePerformance')}`;
        break;
    }

    setHoveredSeat({
      seatLabel: seatData.seatLabel,
      rowLabel: seatData.rowLabel,
      sectionName,
      status: seatData.status,
      price: seatData.price,
      soldAt: seatData.soldAt,
      timeToSell: seatData.timeToSell,
      value,
      valueLabel,
    });
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleMouseLeave = () => {
    setHoveredSeat(null);
  };

  // Build lookup for seat sales data
  const seatDataMap = useMemo(() => {
    if (!heatmapData) return new Map<string, SeatSalesData>();
    const map = new Map<string, SeatSalesData>();
    for (const seat of heatmapData.seats) {
      map.set(seat.seatId, seat);
    }
    return map;
  }, [heatmapData]);

  // Build lookup for section heatmap data
  const sectionDataMap = useMemo(() => {
    if (!heatmapData) return new Map<string, SectionHeatmapData>();
    const map = new Map<string, SectionHeatmapData>();
    for (const section of heatmapData.sections) {
      map.set(section.sectionId, section);
    }
    return map;
  }, [heatmapData]);

  if (isLoading) {
    return (
      <div className="seat-heatmap-loading" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !heatmapData || !chartLayout) {
    return (
      <div className="seat-heatmap-error" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>{t('heatmap.loadError')}</p>
      </div>
    );
  }

  const gradient = GRADIENT_COLORS[mode];

  return (
    <div className="seat-heatmap-container">
      {/* Header with stats */}
      <div
        className="heatmap-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '1rem',
          background: 'var(--surface-color, white)',
          borderRadius: '8px',
          border: '1px solid var(--border-color, #eee)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, marginBottom: '0.25rem' }}>{heatmapData.concertName}</h3>
          <p style={{ margin: 0, color: 'var(--text-light-color, #666)', fontSize: '0.875rem' }}>
            {t('heatmap.soldCount', { sold: heatmapData.totalSold, total: heatmapData.totalCapacity })}
            {' - '}
            {Math.round((heatmapData.totalSold / heatmapData.totalCapacity) * 100)}% {t('heatmap.sold')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn btn-sm ${viewMode === 'sections' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setViewMode('sections')}
          >
            {t('heatmap.viewSections')}
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'seats' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setViewMode('seats')}
          >
            {t('heatmap.viewSeats')}
          </button>
        </div>
      </div>

      {/* SVG Heatmap */}
      <div
        style={{
          background: 'var(--surface-color, white)',
          borderRadius: '8px',
          border: '1px solid var(--border-color, #eee)',
          padding: '1rem',
          overflow: 'auto',
        }}
      >
        <svg
          width="100%"
          height={chartLayout.height}
          viewBox={`0 0 ${chartLayout.width} ${chartLayout.height}`}
          style={{ maxHeight: '500px', margin: '0 auto', display: 'block' }}
        >
          {/* Definitions for gradients and filters */}
          <defs>
            <filter id="heatmapGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id={`legendGradient-${mode}`} x1="0%" y1="0%" x2="100%" y2="0%">
              {gradient.colors.map((color, i) => (
                <stop key={i} offset={`${(i / (gradient.colors.length - 1)) * 100}%`} stopColor={color} />
              ))}
            </linearGradient>
          </defs>

          {/* Background */}
          <rect width={chartLayout.width} height={chartLayout.height} fill="var(--bg-color, #f5f5f5)" rx="8" />

          {/* Stage indicator */}
          <g transform={`translate(${chartLayout.width / 2}, 25)`}>
            <rect x={-60} y={-12} width={120} height={24} rx={4} fill="#1a1a2e" />
            <text textAnchor="middle" y={5} fill="white" fontSize="12" fontWeight="600">
              {t('heatmap.stage')}
            </text>
          </g>

          {/* Sections */}
          {chartLayout.sections.map(({ section, x, y, width, height, seats }) => {
            const sectionData = sectionDataMap.get(section.id);
            const sectionValue = sectionData ? getSectionValue(sectionData) : 0;
            const sectionColor = sectionData ? getHeatmapColor(sectionValue, mode) : UNSOLD_COLOR;

            return (
              <g key={section.id}>
                {/* Section background */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={8}
                  fill={viewMode === 'sections' ? sectionColor : 'var(--surface-color, white)'}
                  stroke="var(--border-color, #ddd)"
                  strokeWidth={1}
                  opacity={viewMode === 'sections' ? 0.9 : 1}
                />

                {/* Section label */}
                <text
                  x={x + width / 2}
                  y={y + (viewMode === 'sections' ? height / 2 - 8 : 18)}
                  textAnchor="middle"
                  fill={viewMode === 'sections' && sectionValue > 50 ? 'white' : 'var(--text-color, #333)'}
                  fontSize="12"
                  fontWeight="600"
                >
                  {section.name}
                </text>

                {/* Section stats in section view */}
                {viewMode === 'sections' && sectionData && (
                  <>
                    <text
                      x={x + width / 2}
                      y={y + height / 2 + 8}
                      textAnchor="middle"
                      fill={sectionValue > 50 ? 'rgba(255,255,255,0.9)' : 'var(--text-light-color, #666)'}
                      fontSize="11"
                    >
                      {sectionData.sold}/{sectionData.capacity} {t('heatmap.seats')}
                    </text>
                    <text
                      x={x + width / 2}
                      y={y + height / 2 + 22}
                      textAnchor="middle"
                      fill={sectionValue > 50 ? 'rgba(255,255,255,0.8)' : 'var(--text-light-color, #888)'}
                      fontSize="10"
                    >
                      {formatCurrency(sectionData.revenue)}
                    </text>
                  </>
                )}

                {/* Individual seats in seat view */}
                {viewMode === 'seats' &&
                  seats.map(({ seat, x: seatX, y: seatY }) => {
                    const seatData = seatDataMap.get(seat.id);
                    const seatValue = seatData ? getSeatValue(seatData) : 0;
                    const seatColor =
                      seatData && seatData.status === 'sold' ? getHeatmapColor(seatValue, mode) : UNSOLD_COLOR;

                    return (
                      <rect
                        key={seat.id}
                        x={seatX}
                        y={seatY}
                        width={chartLayout.SEAT_SIZE}
                        height={chartLayout.SEAT_SIZE}
                        rx={2}
                        fill={seatColor}
                        stroke={seatData?.status === 'sold' ? 'rgba(0,0,0,0.1)' : 'transparent'}
                        strokeWidth={1}
                        style={{ cursor: 'pointer' }}
                        filter={seatValue > 80 ? 'url(#heatmapGlow)' : undefined}
                        onMouseEnter={(e) => seatData && handleSeatMouseEnter(seatData, section.name, e)}
                        onMouseLeave={handleMouseLeave}
                      />
                    );
                  })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div
        className="heatmap-legend"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          marginTop: '1rem',
          padding: '1rem',
          background: 'var(--surface-color, white)',
          borderRadius: '8px',
          border: '1px solid var(--border-color, #eee)',
        }}
      >
        <span style={{ fontSize: '0.875rem', color: 'var(--text-light-color, #666)' }}>{gradient.labels[0]}</span>
        <div
          style={{
            width: '200px',
            height: '16px',
            background: `linear-gradient(to right, ${gradient.colors.join(', ')})`,
            borderRadius: '8px',
          }}
        />
        <span style={{ fontSize: '0.875rem', color: 'var(--text-light-color, #666)' }}>
          {gradient.labels[gradient.labels.length - 1]}
        </span>

        <div
          style={{
            marginLeft: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              background: UNSOLD_COLOR,
              borderRadius: '4px',
            }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-light-color, #666)' }}>{t('heatmap.unsold')}</span>
        </div>
      </div>

      {/* Section Stats Table */}
      {heatmapData.sections.length > 0 && (
        <div
          className="heatmap-stats"
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'var(--surface-color, white)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #eee)',
          }}
        >
          <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>{t('heatmap.sectionStats')}</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color, #eee)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.875rem' }}>{t('heatmap.section')}</th>
                <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>{t('heatmap.sold')}</th>
                <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>{t('heatmap.revenue')}</th>
                <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>{t('heatmap.avgPrice')}</th>
                <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>
                  {mode === 'sales_speed'
                    ? t('heatmap.salesVelocity')
                    : mode === 'popularity'
                      ? t('heatmap.popularityScore')
                      : t('heatmap.pricePerformance')}
                </th>
              </tr>
            </thead>
            <tbody>
              {heatmapData.sections.map((section) => {
                const value = getSectionValue(section);
                return (
                  <tr key={section.sectionId} style={{ borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                    <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '3px',
                            background: getHeatmapColor(value, mode),
                          }}
                        />
                        {section.sectionName}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>
                      {section.sold}/{section.capacity}
                      <span style={{ color: 'var(--text-light-color)', marginLeft: '0.25rem' }}>
                        ({Math.round((section.sold / section.capacity) * 100)}%)
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>
                      {formatCurrency(section.revenue)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>
                      {formatCurrency(section.averagePrice)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.875rem' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          background: getHeatmapColor(value, mode),
                          color: value > 50 ? 'white' : 'var(--text-color)',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        {mode === 'sales_speed' ? `${section.salesVelocity.toFixed(1)}/day` : `${Math.round(value)}%`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tooltip */}
      {hoveredSeat && (
        <div
          className="seat-tooltip"
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
            minWidth: '150px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {hoveredSeat.sectionName} - {t('heatmap.row')} {hoveredSeat.rowLabel}, {t('heatmap.seat')}{' '}
            {hoveredSeat.seatLabel}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-light-color, #666)' }}>
            {hoveredSeat.status === 'sold' ? (
              <>
                <div>
                  {t('heatmap.status')}: {t(`heatmap.${hoveredSeat.status}`)}
                </div>
                {hoveredSeat.price !== null && (
                  <div>
                    {t('heatmap.price')}: {formatCurrency(hoveredSeat.price)}
                  </div>
                )}
                <div style={{ marginTop: '4px', fontWeight: 500, color: getHeatmapColor(hoveredSeat.value, mode) }}>
                  {hoveredSeat.valueLabel}
                </div>
              </>
            ) : (
              <div>
                {t('heatmap.status')}: {t('heatmap.available')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Currency formatter
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}
