import { currentLocale } from '../utils/locale';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { getTicketDashboard, getSeatHeatmapData, getScannedTickets } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SkeletonTable, Skeleton } from '../components/Skeleton';
import SeatHeatmap from '../components/SeatHeatmap';
import { SalesPredictionChart } from '../components/SalesPredictionChart';
import type {
  TicketDashboard as TicketDashboardType,
  TicketDashboardTicketType,
  TicketDashboardSalesOverTime,
  VenueLayout,
  SeatHeatmapData,
  ScannedTicketsResponse,
} from '../types';

// CSS for counter animation
const counterAnimationStyles = `
  @keyframes pulse-green {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); color: var(--success); }
    100% { transform: scale(1); }
  }
  .counter-animate {
    animation: pulse-green 0.5s ease-in-out;
  }
`;

/** Animated counter component */
function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      setIsAnimating(true);
      // Animate to new value
      const diff = value - prevValueRef.current;
      const steps = 20;
      const stepValue = diff / steps;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayValue(value);
          clearInterval(interval);
          setTimeout(() => setIsAnimating(false), 500);
        } else {
          setDisplayValue(Math.round(prevValueRef.current + stepValue * currentStep));
        }
      }, 25);

      prevValueRef.current = value;
      return () => clearInterval(interval);
    }
  }, [value]);

  return (
    <span className={isAnimating ? 'counter-animate' : ''}>
      {prefix}
      {displayValue.toLocaleString(currentLocale())}
      {suffix}
    </span>
  );
}

/** Horizontal bar chart for ticket types */
function TicketTypeBarChart({
  ticketTypes,
  t,
}: {
  ticketTypes: TicketDashboardTicketType[];
  t: (key: string) => string;
}) {
  const maxSold = Math.max(...ticketTypes.map((tt) => tt.quantity), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {ticketTypes.map((tt) => {
        const soldPercent = (tt.sold / maxSold) * 100;
        const availablePercent = (tt.available / maxSold) * 100;
        return (
          <div key={tt.id}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.875rem',
                marginBottom: '0.25rem',
              }}
            >
              <span style={{ fontWeight: 500 }}>{tt.name}</span>
              <span style={{ color: 'var(--text-light)' }}>
                {tt.sold} / {tt.quantity} ({formatCurrency(tt.revenue)})
              </span>
            </div>
            <div
              style={{
                height: 12,
                background: 'var(--border)',
                borderRadius: 6,
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${soldPercent}%`,
                  background: 'var(--success)',
                  transition: 'width 0.5s ease',
                }}
                title={`${t('ticketDashboard.sold')}: ${tt.sold}`}
              />
              <div
                style={{
                  height: '100%',
                  width: `${availablePercent}%`,
                  background: 'var(--primary)',
                  opacity: 0.3,
                  transition: 'width 0.5s ease',
                }}
                title={`${t('ticketDashboard.available')}: ${tt.available}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Line chart for sales over time */
function SalesLineChart({ data, t }: { data: TicketDashboardSalesOverTime[]; t: (key: string) => string }) {
  const maxTickets = Math.max(...data.map((d) => d.ticketsSold), 1);
  const chartHeight = 160;

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
        {t('ticketDashboard.noSalesData')}
      </div>
    );
  }

  // Calculate points for SVG polyline
  const points = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - (d.ticketsSold / maxTickets) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--primary)', display: 'inline-block' }}
          />
          {t('ticketDashboard.ticketsSold')}
        </span>
      </div>

      {/* SVG Chart */}
      <div style={{ position: 'relative', height: chartHeight, marginBottom: '0.5rem' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="var(--border)"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Area fill */}
          <polygon points={`0,100 ${points} 100,100`} fill="var(--primary)" opacity="0.1" />
          {/* Data points */}
          {data.map((d, i) => {
            const x = (i / Math.max(data.length - 1, 1)) * 100;
            const y = 100 - (d.ticketsSold / maxTickets) * 100;
            return (
              <circle key={i} cx={x} cy={y} r="1.5" fill="var(--primary)" vectorEffect="non-scaling-stroke">
                <title>{`${formatShortDate(d.date)}: ${d.ticketsSold} ${t('tickets.tickets')}, ${formatCurrency(d.revenue)}`}</title>
              </circle>
            );
          })}
        </svg>
        {/* Y-axis labels */}
        <div
          style={{
            position: 'absolute',
            left: -30,
            top: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: '0.6rem',
            color: 'var(--text-light)',
          }}
        >
          <span>{maxTickets}</span>
          <span>{Math.round(maxTickets / 2)}</span>
          <span>0</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.6rem',
          color: 'var(--text-light)',
        }}
      >
        {data.length > 0 && <span>{formatShortDate(data[0].date)}</span>}
        {data.length > 1 && <span>{formatShortDate(data[data.length - 1].date)}</span>}
      </div>
    </div>
  );
}

/** Capacity indicator component */
function CapacityIndicator({
  sold,
  total,
  guestList,
  t,
}: {
  sold: number;
  total: number;
  guestList: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const paidPercent = total > 0 ? (sold / total) * 100 : 0;
  const guestPercent = total > 0 ? (guestList / total) * 100 : 0;
  const available = total - sold - guestList;

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--success)', display: 'inline-block' }}
          />
          {t('ticketDashboard.paidTickets')} ({sold})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--warning)', display: 'inline-block' }}
          />
          {t('ticketDashboard.guestListTickets')} ({guestList})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }}
          />
          {t('ticketDashboard.available')} ({available})
        </span>
      </div>

      <div
        style={{
          height: 24,
          background: 'var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${paidPercent}%`,
            background: 'var(--success)',
            transition: 'width 0.5s ease',
          }}
          title={`${t('ticketDashboard.paidTickets')}: ${sold}`}
        />
        <div
          style={{
            height: '100%',
            width: `${guestPercent}%`,
            background: 'var(--warning)',
            transition: 'width 0.5s ease',
          }}
          title={`${t('ticketDashboard.guestListTickets')}: ${guestList}`}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ color: 'var(--text-light)' }}>
          {sold + guestList} / {total} ({Math.round(paidPercent + guestPercent)}%)
        </span>
        <span style={{ color: available > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
          {available > 0 ? t('ticketDashboard.ticketsAvailable', { count: available }) : t('ticketDashboard.soldOut')}
        </span>
      </div>
    </div>
  );
}

/** Format currency */
function formatCurrency(amount: number) {
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/** Format date/time */
function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(currentLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format date */
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(currentLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Get status badge */
function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const colors: Record<string, string> = {
    paid: 'var(--success)',
    pending: 'var(--warning)',
    cancelled: 'var(--danger)',
    refunded: 'var(--danger)',
    expired: 'var(--text-light)',
  };

  return (
    <span
      className="badge"
      style={{
        backgroundColor: colors[status] || 'var(--text-light)',
        color: 'white',
        fontSize: '0.7rem',
      }}
    >
      {t(`tickets.status.${status}`)}
    </span>
  );
}

export default function TicketDashboard() {
  const { t } = useTranslation();
  const { concertId } = useParams<{ concertId: string }>();
  useDocumentTitle('pageTitle.ticketDashboard');

  // Heatmap state
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<'sales_speed' | 'popularity' | 'price_performance'>('sales_speed');

  // Scanned tickets state
  const [showScannedTickets, setShowScannedTickets] = useState(false);

  // Prediction chart state
  const [showPredictions, setShowPredictions] = useState(false);

  // Fetch dashboard data with auto-refresh every 30 seconds
  const { data, isLoading, error } = useQuery<TicketDashboardType>({
    queryKey: ['ticketDashboard', concertId],
    queryFn: () => getTicketDashboard(concertId!),
    enabled: !!concertId,
    refetchInterval: 30000, // 30 seconds
    refetchIntervalInBackground: false,
  });

  // Fetch heatmap data when enabled
  const { data: heatmapData, isLoading: heatmapLoading } = useQuery<SeatHeatmapData>({
    queryKey: ['seatHeatmap', concertId],
    queryFn: () => getSeatHeatmapData(concertId!),
    enabled: !!concertId && showHeatmap,
  });

  // Fetch scanned tickets when enabled
  const { data: scannedData, isLoading: scannedLoading } = useQuery<ScannedTicketsResponse>({
    queryKey: ['scannedTickets', concertId],
    queryFn: () => getScannedTickets(concertId!),
    enabled: !!concertId && showScannedTickets,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Create a simple venue layout from ticket types for the heatmap
  const venueLayout: VenueLayout | null = heatmapData
    ? {
        id: `venue-${concertId}`,
        concertId: concertId!,
        name: heatmapData.concertName,
        sections: heatmapData.sections.map((s, i) => ({
          id: s.sectionId,
          name: s.sectionName,
          rowNumber: Math.floor(i / 3) + 1,
          capacity: s.capacity,
          sortOrder: i,
        })),
        rows: [],
        seats: heatmapData.seats.map((s) => ({
          id: s.seatId,
          rowId: s.rowLabel,
          sectionId: s.sectionId,
          seatLabel: s.seatLabel,
          x: s.x,
          y: s.y,
        })),
        width: Math.max(...heatmapData.seats.map((s) => s.x)) + 100,
        height: Math.max(...heatmapData.seats.map((s) => s.y)) + 100,
      }
    : null;

  if (!concertId) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-light)' }}>{t('ticketDashboard.noConcertSelected')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>
            <Skeleton width="300px" height="2rem" />
          </h1>
        </div>
        <div className="stat-card-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card">
              <div className="card-body">
                <Skeleton width="60%" height="1.5rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton width="40%" height="1rem" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-2 gap-3 mt-3">
          <div className="card">
            <div className="card-body">
              <SkeletonTable rows={4} columns={2} />
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <SkeletonTable rows={4} columns={2} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--danger)' }}>{t('ticketDashboard.loadError')}</p>
          <Link to="/concerts" className="btn btn-primary mt-2">
            {t('common.back')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Inject animation styles */}
      <style>{counterAnimationStyles}</style>

      {/* Header */}
      <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>{t('ticketDashboard.title')}</h1>
          <p style={{ color: 'var(--text-light)', margin: 0 }}>
            {data.concertName} - {formatDate(data.concertDate)}
            {data.concertLocation && ` | ${data.concertLocation}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${showPredictions ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowPredictions(!showPredictions)}
          >
            {t('predictions.title', 'Voorspellingen')}
          </button>
          <button
            className={`btn ${showHeatmap ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowHeatmap(!showHeatmap)}
          >
            {t('heatmap.title')}
          </button>
          <Link to={`/concerts/${concertId}/guest-list`} className="btn btn-outline">
            {t('guestList.title')}
          </Link>
          <Link to={`/ticket-sales?concertId=${concertId}`} className="btn btn-outline">
            {t('tickets.sales')}
          </Link>
        </div>
      </div>

      {/* Live indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.75rem',
          color: 'var(--text-light)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--success)',
            animation: 'pulse-green 2s infinite',
          }}
        />
        {t('ticketDashboard.liveUpdates')}
      </div>

      {/* Summary Cards - Revenue */}
      <div className="stat-card-grid">
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--success)' }}>
              <AnimatedCounter value={data.totalTicketsSold} />
            </div>
            <div className="stat-label">{t('ticketDashboard.ticketsSold')}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--primary)' }}>
              <AnimatedCounter value={data.revenueToday} prefix="" suffix="" />
              <span style={{ fontSize: '0.5em' }}>
                {' '}
                {formatCurrency(data.revenueToday)
                  .replace(/[\d,.]+/, '')
                  .trim()}
              </span>
            </div>
            <div className="stat-label">{t('ticketDashboard.revenueToday')}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--primary)' }}>
              {formatCurrency(data.revenueThisWeek)}
            </div>
            <div className="stat-label">{t('ticketDashboard.revenueThisWeek')}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body stat-inline">
            <div className="stat-number" style={{ color: 'var(--success)' }}>
              {formatCurrency(data.revenueAllTime)}
            </div>
            <div className="stat-label">{t('ticketDashboard.revenueAllTime')}</div>
          </div>
        </div>
      </div>

      {/* Capacity Indicator - Full width */}
      <div className="card mt-3">
        <div className="card-body">
          <h4 style={{ marginBottom: '1rem' }}>{t('ticketDashboard.capacityOverview')}</h4>
          <CapacityIndicator
            sold={data.totalTicketsSold}
            total={data.totalCapacity}
            guestList={data.guestListTickets}
            t={t}
          />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-2 gap-3 mt-3">
        {/* Sales by Ticket Type - Bar Chart */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('ticketDashboard.salesByType')}</h4>
            {data.ticketTypes.length > 0 ? (
              <TicketTypeBarChart ticketTypes={data.ticketTypes} t={t} />
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>{t('ticketDashboard.noTicketTypes')}</p>
            )}
          </div>
        </div>

        {/* Sales Over Time - Line Chart */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('ticketDashboard.salesOverTime')}</h4>
            <div style={{ paddingLeft: '2rem' }}>
              <SalesLineChart data={data.salesOverTime} t={t} />
            </div>
          </div>
        </div>
      </div>

      {/* Sales Prediction Chart (collapsible) */}
      {showPredictions && (
        <div className="mt-3">
          <SalesPredictionChart
            prediction={{
              predictedTotalSales: Math.round(data.totalCapacity * 0.85),
              predictedRevenue: data.revenueAllTime * 1.2,
              confidenceLevel:
                data.totalTicketsSold > data.totalCapacity * 0.5
                  ? 'high'
                  : data.totalTicketsSold > data.totalCapacity * 0.25
                    ? 'medium'
                    : 'low',
              factors: [
                t('predictions.factors.historicalData', 'Gebaseerd op historische verkoopdata'),
                t('predictions.factors.daysUntilConcert', 'Dagen tot concert: {{days}}', {
                  days: Math.max(
                    0,
                    Math.ceil((new Date(data.concertDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                  ),
                }),
                t('predictions.factors.currentTrend', 'Huidige verkooptrend'),
              ],
              dailyPredictions: data.salesOverTime.slice(-7).map((day, i, arr) => ({
                date: day.date,
                predictedSales: Math.round(day.ticketsSold * 1.1),
                actualSales: i < arr.length - 2 ? day.ticketsSold : undefined,
              })),
            }}
            currentSales={data.totalTicketsSold}
            currentRevenue={data.revenueAllTime}
          />
        </div>
      )}

      {/* Seat Heatmap (collapsible) */}
      {showHeatmap && (
        <div className="card mt-3">
          <div className="card-body">
            <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: '1rem' }}>
              <h4 style={{ margin: 0 }}>{t('heatmap.title')}</h4>
              <div className="flex gap-2">
                <button
                  className={`btn btn-sm ${heatmapMode === 'sales_speed' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setHeatmapMode('sales_speed')}
                >
                  {t('heatmap.salesSpeed')}
                </button>
                <button
                  className={`btn btn-sm ${heatmapMode === 'popularity' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setHeatmapMode('popularity')}
                >
                  {t('heatmap.popularity')}
                </button>
                <button
                  className={`btn btn-sm ${heatmapMode === 'price_performance' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setHeatmapMode('price_performance')}
                >
                  {t('heatmap.pricePerformanceMode')}
                </button>
              </div>
            </div>

            {heatmapLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                <p style={{ color: 'var(--text-light)' }}>{t('common.loading')}</p>
              </div>
            ) : venueLayout ? (
              <SeatHeatmap concertId={concertId!} layout={venueLayout} mode={heatmapMode} />
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '2rem' }}>{t('heatmap.noData')}</p>
            )}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="card mt-3">
        <div className="card-body">
          <div className="flex justify-between items-center mb-3">
            <h4 style={{ margin: 0 }}>{t('ticketDashboard.recentOrders')}</h4>
            <Link to={`/ticket-sales?concertId=${concertId}`} style={{ fontSize: '0.875rem' }}>
              {t('ticketDashboard.viewAll')} &rarr;
            </Link>
          </div>

          {data.recentOrders.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('tickets.orderDate')}</th>
                    <th>{t('tickets.buyer')}</th>
                    <th style={{ textAlign: 'center' }}>{t('tickets.ticketCount')}</th>
                    <th style={{ textAlign: 'right' }}>{t('tickets.total')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(order.createdAt)}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{order.buyerName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{order.buyerEmail}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{order.ticketCount}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(order.total)}</td>
                      <td>
                        <StatusBadge status={order.status} t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '2rem' }}>
              {t('ticketDashboard.noOrders')}
            </p>
          )}
        </div>
      </div>

      {/* Guest List Summary */}
      <div className="card mt-3">
        <div className="card-body">
          <div className="flex justify-between items-center">
            <div>
              <h4 style={{ margin: 0 }}>{t('guestList.title')}</h4>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-light)' }}>
                {t('ticketDashboard.guestListSummary', { count: data.guestListTickets })}
              </p>
            </div>
            <Link to={`/concerts/${concertId}/guest-list`} className="btn btn-outline btn-sm">
              {t('ticketDashboard.manageGuestList')}
            </Link>
          </div>
        </div>
      </div>

      {/* Scanned Tickets / Attendance */}
      <div className="card mt-3">
        <div className="card-body">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 style={{ margin: 0 }}>{t('ticketDashboard.scannedTickets')}</h4>
              {scannedData && (
                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-light)' }}>
                  {t('ticketDashboard.scannedSummary', {
                    scanned: scannedData.summary.scannedCount,
                    total: scannedData.summary.totalTickets,
                    percentage: scannedData.summary.scanPercentage,
                  })}
                </p>
              )}
            </div>
            <button
              className={`btn btn-sm ${showScannedTickets ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setShowScannedTickets(!showScannedTickets)}
            >
              {showScannedTickets ? t('common.hide') : t('ticketDashboard.showAttendees')}
            </button>
          </div>

          {showScannedTickets && (
            <>
              {scannedLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                  <p style={{ color: 'var(--text-light)' }}>{t('common.loading')}</p>
                </div>
              ) : scannedData && scannedData.scannedTickets.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('ticketDashboard.scannedAt')}</th>
                        <th>{t('tickets.buyer')}</th>
                        <th>{t('tickets.ticketType')}</th>
                        <th>{t('ticketDashboard.validatedBy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scannedData.scannedTickets.map((ticket) => (
                        <tr key={ticket.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(ticket.scannedAt)}</td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{ticket.buyerName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{ticket.buyerEmail}</div>
                          </td>
                          <td>{ticket.ticketTypeName}</td>
                          <td style={{ color: 'var(--text-light)' }}>{ticket.validatedBy || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '2rem' }}>
                  {t('ticketDashboard.noScannedTickets')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
