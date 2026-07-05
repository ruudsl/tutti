import { currentLocale } from '../utils/locale';
import { useState, useMemo, useCallback, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';

// ==================== TYPE DEFINITIONS ====================

export type SeatType = 'regular' | 'wheelchair' | 'companion' | 'vip';
export type SeatStatus = 'available' | 'selected' | 'sold' | 'reserved' | 'blocked';

export interface VenueSeat {
  id: string;
  row: string;
  number: string;
  x: number;
  y: number;
  sectionId: string;
  type: SeatType;
  status: SeatStatus;
  price: number;
  label?: string;
}

export interface VenueSection {
  id: string;
  name: string;
  color?: string;
  labelX?: number;
  labelY?: number;
}

export interface VenueLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  sections: VenueSection[];
  seats: VenueSeat[];
  stageArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
  };
}

export interface SeatSelectorProps {
  concertId: string;
  layout: VenueLayout;
  selectedSeats: string[];
  onSeatSelect: (seatIds: string[]) => void;
  maxSeats?: number;
  highlightSection?: string;
}

// ==================== CONSTANTS ====================

const SEAT_RADIUS = 12;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

const SEAT_TYPE_COLORS: Record<SeatType, string> = {
  regular: '#4A90D9',
  wheelchair: '#27AE60',
  companion: '#8E44AD',
  vip: '#F39C12',
};

const SEAT_STATUS_COLORS: Record<SeatStatus, string> = {
  available: 'var(--seat-available, #4A90D9)',
  selected: 'var(--seat-selected, #27AE60)',
  sold: 'var(--seat-sold, #95A5A6)',
  reserved: 'var(--seat-reserved, #E8A435)',
  blocked: 'var(--seat-blocked, #BDC3C7)',
};

// ==================== COMPONENT ====================

export default function SeatSelector({
  concertId: _concertId,
  layout,
  selectedSeats,
  onSeatSelect,
  maxSeats = 10,
  highlightSection,
}: SeatSelectorProps) {
  // concertId can be used for API calls to fetch real-time seat availability
  void _concertId;
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const legendId = useId();

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [lastPan, setLastPan] = useState({ x: 0, y: 0 });

  // Tooltip state
  const [hoveredSeat, setHoveredSeat] = useState<VenueSeat | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Keyboard navigation state
  const [focusedSeatIndex, setFocusedSeatIndex] = useState<number>(-1);

  // Get navigable seats (available or selected)
  const navigableSeats = useMemo(() => {
    return layout.seats.filter((seat) => seat.status === 'available' || seat.status === 'selected');
  }, [layout.seats]);

  // Memoize seat lookup for performance
  const seatMap = useMemo(() => {
    const map = new Map<string, VenueSeat>();
    layout.seats.forEach((seat) => map.set(seat.id, seat));
    return map;
  }, [layout.seats]);

  // Get seat display color based on selection and status
  const getSeatColor = useCallback(
    (seat: VenueSeat): string => {
      if (selectedSeats.includes(seat.id)) {
        return SEAT_STATUS_COLORS.selected;
      }
      return SEAT_STATUS_COLORS[seat.status] || SEAT_STATUS_COLORS.available;
    },
    [selectedSeats],
  );

  // Get seat type color for legend
  const getSeatTypeColor = useCallback((type: SeatType): string => {
    return SEAT_TYPE_COLORS[type];
  }, []);

  // Handle seat click
  const handleSeatClick = useCallback(
    (seat: VenueSeat) => {
      if (seat.status === 'sold' || seat.status === 'blocked' || seat.status === 'reserved') {
        return;
      }

      const isSelected = selectedSeats.includes(seat.id);

      if (isSelected) {
        // Deselect seat
        onSeatSelect(selectedSeats.filter((id) => id !== seat.id));
      } else {
        // Check max seats limit
        if (selectedSeats.length >= maxSeats) {
          return;
        }
        // Select seat
        onSeatSelect([...selectedSeats, seat.id]);
      }
    },
    [selectedSeats, maxSeats, onSeatSelect],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (navigableSeats.length === 0) return;

      let newIndex: number;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = (focusedSeatIndex + 1) % navigableSeats.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = focusedSeatIndex <= 0 ? navigableSeats.length - 1 : focusedSeatIndex - 1;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = navigableSeats.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedSeatIndex >= 0 && focusedSeatIndex < navigableSeats.length) {
            handleSeatClick(navigableSeats[focusedSeatIndex]);
          }
          return;
        default:
          return;
      }

      setFocusedSeatIndex(newIndex);
      setHoveredSeat(navigableSeats[newIndex]);
    },
    [focusedSeatIndex, navigableSeats, handleSeatClick],
  );

  // Handle mouse enter on seat
  const handleSeatMouseEnter = useCallback((seat: VenueSeat, e: React.MouseEvent<SVGElement>) => {
    setHoveredSeat(seat);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  // Handle mouse leave
  const handleSeatMouseLeave = useCallback(() => {
    setHoveredSeat(null);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM));
    }
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        // Middle click or shift+left click to pan
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setLastPan(pan);
        e.preventDefault();
      }
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setPan({
          x: lastPan.x + dx,
          y: lastPan.y + dy,
        });
      }
    },
    [isPanning, panStart, lastPan],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle touch events for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        setIsPanning(true);
        setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        setLastPan(pan);
      }
    },
    [pan],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isPanning && e.touches.length === 1) {
        const dx = e.touches[0].clientX - panStart.x;
        const dy = e.touches[0].clientY - panStart.y;
        setPan({
          x: lastPan.x + dx,
          y: lastPan.y + dy,
        });
      }
    },
    [isPanning, panStart, lastPan],
  );

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Calculate viewBox
  const viewBox = useMemo(() => {
    const padding = 40;
    return `${-padding - pan.x / zoom} ${-padding - pan.y / zoom} ${(layout.width + padding * 2) / zoom} ${(layout.height + padding * 2) / zoom}`;
  }, [layout.width, layout.height, pan, zoom]);

  // Get sections with seats grouped - can be used for section-level stats display
  const _sectionStats = useMemo(() => {
    const stats = new Map<string, { total: number; available: number; selected: number }>();

    layout.sections.forEach((section) => {
      stats.set(section.id, { total: 0, available: 0, selected: 0 });
    });

    layout.seats.forEach((seat) => {
      const sectionStat = stats.get(seat.sectionId);
      if (sectionStat) {
        sectionStat.total++;
        if (seat.status === 'available') {
          sectionStat.available++;
        }
        if (selectedSeats.includes(seat.id)) {
          sectionStat.selected++;
        }
      }
    });

    return stats;
  }, [layout.sections, layout.seats, selectedSeats]);
  // Available for future section statistics display
  void _sectionStats;

  // Get unique seat types in layout for legend
  const seatTypes = useMemo(() => {
    const types = new Set<SeatType>();
    layout.seats.forEach((seat) => types.add(seat.type));
    return Array.from(types);
  }, [layout.seats]);

  // Calculate total price of selected seats
  const totalPrice = useMemo(() => {
    return selectedSeats.reduce((sum, seatId) => {
      const seat = seatMap.get(seatId);
      return sum + (seat?.price || 0);
    }, 0);
  }, [selectedSeats, seatMap]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setHoveredSeat(null);
    };
  }, []);

  // Format price for display
  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat(currentLocale(), {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  };

  return (
    <div
      className="seat-selector"
      style={{
        position: 'relative',
        width: '100%',
        userSelect: 'none',
      }}
    >
      {/* Toolbar */}
      <div
        className="seat-selector-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          marginBottom: '0.5rem',
          background: 'var(--surface-color, #fff)',
          borderRadius: '8px',
          border: '1px solid var(--border-color, #eee)',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleZoomOut}
            aria-label={t('seatSelector.zoomOut')}
            disabled={zoom <= MIN_ZOOM}
          >
            -
          </button>
          <span
            style={{
              minWidth: '60px',
              textAlign: 'center',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleZoomIn}
            aria-label={t('seatSelector.zoomIn')}
            disabled={zoom >= MAX_ZOOM}
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleResetView}
            aria-label={t('seatSelector.resetView')}
          >
            {t('seatSelector.reset')}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            fontSize: '0.875rem',
          }}
        >
          <span>{t('seatSelector.selectedCount', { count: selectedSeats.length, max: maxSeats })}</span>
          {totalPrice > 0 && (
            <span style={{ fontWeight: 600 }}>
              {t('seatSelector.total')}: {formatPrice(totalPrice)}
            </span>
          )}
        </div>
      </div>

      {/* SVG Container */}
      <div
        ref={containerRef}
        className="seat-selector-container"
        style={{
          position: 'relative',
          width: '100%',
          height: '500px',
          overflow: 'hidden',
          background: 'var(--bg-color, #f5f5f5)',
          borderRadius: '8px',
          border: '1px solid var(--border-color, #eee)',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={viewBox}
          style={{
            transition: isPanning ? 'none' : 'viewBox 0.1s ease-out',
          }}
          role="application"
          aria-label={t('seatSelector.ariaLabel')}
          aria-describedby={legendId}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {/* Background */}
          <rect x={-40} y={-40} width={layout.width + 80} height={layout.height + 80} fill="var(--bg-color, #f5f5f5)" />

          {/* Stage area */}
          {layout.stageArea && (
            <g>
              <rect
                x={layout.stageArea.x}
                y={layout.stageArea.y}
                width={layout.stageArea.width}
                height={layout.stageArea.height}
                fill="var(--primary-color, #1a1a2e)"
                rx={8}
              />
              <text
                x={layout.stageArea.x + layout.stageArea.width / 2}
                y={layout.stageArea.y + layout.stageArea.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize="16"
                fontWeight="600"
              >
                {layout.stageArea.label || t('seatSelector.stage')}
              </text>
            </g>
          )}

          {/* Section labels */}
          {layout.sections.map((section) => (
            <text
              key={`section-label-${section.id}`}
              x={section.labelX ?? 0}
              y={section.labelY ?? 0}
              textAnchor="middle"
              fill={highlightSection === section.id ? 'var(--primary-color, #3498db)' : 'var(--text-color, #333)'}
              fontSize="14"
              fontWeight={highlightSection === section.id ? 700 : 600}
              style={{
                transition: 'fill 0.2s ease, font-weight 0.2s ease',
              }}
            >
              {section.name}
            </text>
          ))}

          {/* Seats */}
          {layout.seats.map((seat) => {
            const isSelected = selectedSeats.includes(seat.id);
            const isHovered = hoveredSeat?.id === seat.id;
            const isFocused = focusedSeatIndex === navigableSeats.indexOf(seat);
            const isAvailable = seat.status === 'available';
            const isSelectable = isAvailable || isSelected;
            const isHighlightedSection = highlightSection === seat.sectionId;

            return (
              <g
                key={seat.id}
                transform={`translate(${seat.x}, ${seat.y})`}
                onClick={() => isSelectable && handleSeatClick(seat)}
                onMouseEnter={(e) => handleSeatMouseEnter(seat, e)}
                onMouseLeave={handleSeatMouseLeave}
                onFocus={() => {
                  setFocusedSeatIndex(navigableSeats.indexOf(seat));
                  setHoveredSeat(seat);
                }}
                onBlur={() => setHoveredSeat(null)}
                style={{
                  cursor: isSelectable ? 'pointer' : 'not-allowed',
                  outline: 'none',
                }}
                role="button"
                aria-label={t('seatSelector.seatAriaLabel', {
                  row: seat.row,
                  number: seat.number,
                  type: t(`seatSelector.seatTypes.${seat.type}`),
                  price: formatPrice(seat.price),
                  status: isSelected ? t('seatSelector.statusSelected') : t(`seatSelector.status.${seat.status}`),
                })}
                aria-pressed={isSelected}
                aria-disabled={!isSelectable}
                tabIndex={isSelectable ? 0 : -1}
              >
                {/* Seat circle */}
                <circle
                  r={SEAT_RADIUS}
                  fill={getSeatColor(seat)}
                  stroke={
                    isFocused
                      ? 'var(--focus-color, #2196F3)'
                      : isHighlightedSection
                        ? 'var(--primary-color, #3498db)'
                        : isHovered
                          ? 'var(--text-color, #333)'
                          : 'transparent'
                  }
                  strokeWidth={isFocused ? 3 : isHighlightedSection || isHovered ? 2 : 0}
                  style={{
                    transition: 'fill 0.15s ease, stroke 0.15s ease, transform 0.15s ease',
                    transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                    transformOrigin: 'center',
                  }}
                />

                {/* Seat type indicator for special seats */}
                {seat.type === 'wheelchair' && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    W
                  </text>
                )}
                {seat.type === 'vip' && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    V
                  </text>
                )}
                {seat.type === 'companion' && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    C
                  </text>
                )}

                {/* Selection checkmark */}
                {isSelected && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    &#10003;
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Pan/zoom hint */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            fontSize: '0.75rem',
            color: 'var(--text-light-color, #666)',
            background: 'rgba(255,255,255,0.9)',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
        >
          {t('seatSelector.panHint')}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredSeat && (
        <div
          id={tooltipId}
          role="tooltip"
          className="seat-selector-tooltip"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y - 10,
            transform: 'translate(-50%, -100%)',
            background: 'var(--surface-color, white)',
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: '6px',
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: '120px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {t('seatSelector.rowLabel', { row: hoveredSeat.row })} -{' '}
            {t('seatSelector.seatLabel', { number: hoveredSeat.number })}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-light-color, #666)' }}>
            {t(`seatSelector.seatTypes.${hoveredSeat.type}`)}
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--primary-color, #3498db)',
              marginTop: '4px',
            }}
          >
            {formatPrice(hoveredSeat.price)}
          </div>
          {hoveredSeat.status !== 'available' && !selectedSeats.includes(hoveredSeat.id) && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--danger-color, #e74c3c)',
                marginTop: '4px',
              }}
            >
              {t(`seatSelector.status.${hoveredSeat.status}`)}
            </div>
          )}
          {selectedSeats.includes(hoveredSeat.id) && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--success-color, #27ae60)',
                marginTop: '4px',
              }}
            >
              {t('seatSelector.statusSelected')}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        id={legendId}
        className="seat-selector-legend"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '1rem',
          background: 'var(--surface-color, white)',
          borderRadius: '8px',
          border: '1px solid var(--border-color, #eee)',
        }}
      >
        {/* Availability legend */}
        <div>
          <div
            style={{
              fontWeight: 600,
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-color, #333)',
            }}
          >
            {t('seatSelector.legendAvailability')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: SEAT_STATUS_COLORS.available,
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-color, #333)' }}>
                {t('seatSelector.status.available')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: SEAT_STATUS_COLORS.selected,
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-color, #333)' }}>
                {t('seatSelector.statusSelected')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: SEAT_STATUS_COLORS.sold,
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-color, #333)' }}>
                {t('seatSelector.status.sold')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: SEAT_STATUS_COLORS.reserved,
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-color, #333)' }}>
                {t('seatSelector.status.reserved')}
              </span>
            </div>
          </div>
        </div>

        {/* Seat types legend */}
        <div>
          <div
            style={{
              fontWeight: 600,
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-color, #333)',
            }}
          >
            {t('seatSelector.legendSeatTypes')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {seatTypes.map((type) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: getSeatTypeColor(type),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '9px',
                    fontWeight: 'bold',
                  }}
                >
                  {type === 'wheelchair' && 'W'}
                  {type === 'vip' && 'V'}
                  {type === 'companion' && 'C'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-color, #333)' }}>
                  {t(`seatSelector.seatTypes.${type}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected seats summary */}
      {selectedSeats.length > 0 && (
        <div
          className="seat-selector-summary"
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'var(--surface-color, white)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #eee)',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              marginBottom: '0.75rem',
              fontSize: '0.875rem',
              color: 'var(--text-color, #333)',
            }}
          >
            {t('seatSelector.selectedSeats')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '0.75rem' }}>
            {selectedSeats.map((seatId) => {
              const seat = seatMap.get(seatId);
              if (!seat) return null;
              return (
                <div
                  key={seatId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    background: 'var(--bg-color, #f5f5f5)',
                    borderRadius: '20px',
                    fontSize: '0.875rem',
                  }}
                >
                  <span>
                    {t('seatSelector.rowLabel', { row: seat.row })}-{seat.number}
                  </span>
                  <span style={{ color: 'var(--text-light-color, #666)' }}>{formatPrice(seat.price)}</span>
                  <button
                    type="button"
                    onClick={() => handleSeatClick(seat)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: '16px',
                      lineHeight: 1,
                      color: 'var(--text-light-color, #666)',
                    }}
                    aria-label={t('seatSelector.removeSeat', { row: seat.row, number: seat.number })}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-color, #eee)',
            }}
          >
            <span style={{ fontWeight: 600 }}>{t('seatSelector.totalLabel')}</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-color, #3498db)' }}>
              {formatPrice(totalPrice)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
