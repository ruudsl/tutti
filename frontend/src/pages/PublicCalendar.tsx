import { formatCurrency } from '../utils/format';
import { currentLocale } from '../utils/locale';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';

interface PublicEvent {
  id: string;
  type: 'concert' | 'rehearsal';
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  location?: string;
  city?: string;
  ticketPrice?: number;
  description?: string;
}

interface CalendarData {
  association: {
    name: string;
    slug: string;
  };
  events: PublicEvent[];
  generatedAt: string;
}

interface InfoScreenData {
  association: {
    name: string;
  };
  nextConcert: {
    id: string;
    name: string;
    date: string;
    startTime?: string;
    venue?: string;
    city?: string;
    daysUntil: number;
  } | null;
  nextRehearsal: {
    id: string;
    date: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    orchestraName?: string;
  } | null;
  upcomingConcerts: {
    id: string;
    name: string;
    date: string;
    startTime?: string;
    venue?: string;
  }[];
  announcement: {
    title: string;
    content?: string;
    publishedAt: string;
  } | null;
  currentTime: string;
  refreshInterval: number;
}

export default function PublicCalendar() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'calendar';
  const theme = searchParams.get('theme') || 'auto';

  const [data, setData] = useState<CalendarData | null>(null);
  const [infoData, setInfoData] = useState<InfoScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!slug) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const endpoint =
          mode === 'info-screen' ? `/api/calendar/info-screen/${slug}` : `/api/calendar/public/${slug}?months=6`;

        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error('Association not found');
        }

        const result = await response.json();
        if (mode === 'info-screen') {
          setInfoData(result);
        } else {
          setData(result);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-refresh for info screen mode
    if (mode === 'info-screen') {
      const interval = setInterval(fetchData, 60000);
      return () => clearInterval(interval);
    }
  }, [slug, mode]);

  // Update clock for info screen
  useEffect(() => {
    if (mode === 'info-screen') {
      const interval = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  // Apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="text-center">
          <Icon name="warning" size={48} className="mx-auto mb-4 opacity-50" />
          <h1 className="text-xl font-bold mb-2">Calendar Not Found</h1>
          <p className="text-base-content/70">{error}</p>
        </div>
      </div>
    );
  }

  if (mode === 'info-screen' && infoData) {
    return <InfoScreen data={infoData} currentTime={currentTime} />;
  }

  if (data) {
    return <CalendarEmbed data={data} />;
  }

  return null;
}

function CalendarEmbed({ data }: { data: CalendarData }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (time?: string) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const groupedEvents: Record<string, PublicEvent[]> = {};
  data.events.forEach((event) => {
    const month = new Date(event.date).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
    if (!groupedEvents[month]) groupedEvents[month] = [];
    groupedEvents[month].push(event);
  });

  return (
    <div className="min-h-screen bg-base-200 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{data.association.name}</h1>
          <p className="text-base-content/70">Upcoming Events</p>
        </header>

        {data.events.length === 0 ? (
          <div className="card bg-base-100 p-8 text-center">
            <Icon name="calendar" size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-base-content/70">No upcoming events</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedEvents).map(([month, events]) => (
              <div key={month}>
                <h2 className="text-xl font-semibold mb-4 capitalize">{month}</h2>
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className={`card bg-base-100 shadow-md ${
                        event.type === 'concert' ? 'border-l-4 border-primary' : ''
                      }`}
                    >
                      <div className="card-body p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-lg">{event.title}</h3>
                            <div className="flex flex-wrap gap-4 text-sm text-base-content/70 mt-1">
                              <span className="flex items-center gap-1">
                                <Icon name="calendar" size={14} />
                                {formatDate(event.date)}
                              </span>
                              {event.startTime && (
                                <span className="flex items-center gap-1">
                                  <Icon name="clock" size={14} />
                                  {formatTime(event.startTime)}
                                  {event.endTime && ` - ${formatTime(event.endTime)}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`badge ${event.type === 'concert' ? 'badge-primary' : 'badge-ghost'}`}>
                            {event.type === 'concert' ? 'Concert' : 'Rehearsal'}
                          </span>
                        </div>

                        {(event.venue || event.location) && (
                          <div className="flex items-center gap-1 text-sm text-base-content/70">
                            <Icon name="mapPin" size={14} />
                            {event.venue || event.location}
                            {event.city && `, ${event.city}`}
                          </div>
                        )}

                        {event.ticketPrice && (
                          <div className="text-sm font-medium text-primary">
                            Tickets: {formatCurrency(event.ticketPrice)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="text-center mt-8 text-sm text-base-content/50">
          Last updated: {new Date(data.generatedAt).toLocaleString(currentLocale())}
        </footer>
      </div>
    </div>
  );
}

function InfoScreen({ data, currentTime }: { data: InfoScreenData; currentTime: Date }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatTime = (time?: string) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-secondary/10 p-6 md:p-10">
      {/* Header with Clock */}
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold">{data.association.name}</h1>
        <div className="text-right">
          <div className="text-5xl md:text-6xl font-mono font-bold">
            {currentTime.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-lg text-base-content/70">
            {currentTime.toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next Concert Highlight */}
        {data.nextConcert && (
          <div className="card bg-primary text-primary-content shadow-xl">
            <div className="card-body">
              <div className="flex items-center gap-2 text-primary-content/80">
                <Icon name="music2" size={20} />
                <span className="uppercase text-sm font-semibold tracking-wider">Next Concert</span>
              </div>
              <h2 className="card-title text-3xl mt-2">{data.nextConcert.name}</h2>
              <div className="text-xl mt-2">{formatDate(data.nextConcert.date)}</div>
              {data.nextConcert.startTime && <div className="text-lg">{formatTime(data.nextConcert.startTime)}</div>}
              {data.nextConcert.venue && (
                <div className="flex items-center gap-1 mt-2">
                  <Icon name="mapPin" size={16} />
                  {data.nextConcert.venue}
                  {data.nextConcert.city && `, ${data.nextConcert.city}`}
                </div>
              )}
              <div className="mt-4">
                <span className="badge badge-lg bg-primary-content/20 border-0 text-primary-content">
                  {data.nextConcert.daysUntil === 0
                    ? 'Today!'
                    : data.nextConcert.daysUntil === 1
                      ? 'Tomorrow!'
                      : `In ${data.nextConcert.daysUntil} days`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Next Rehearsal */}
        {data.nextRehearsal && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex items-center gap-2 text-base-content/60">
                <Icon name="users" size={20} />
                <span className="uppercase text-sm font-semibold tracking-wider">Next Rehearsal</span>
              </div>
              <h2 className="card-title text-2xl mt-2">{data.nextRehearsal.orchestraName || 'Rehearsal'}</h2>
              <div className="text-lg">{formatDate(data.nextRehearsal.date)}</div>
              <div className="flex items-center gap-2">
                <Icon name="clock" size={16} className="opacity-70" />
                {formatTime(data.nextRehearsal.startTime)}
                {data.nextRehearsal.endTime && ` - ${formatTime(data.nextRehearsal.endTime)}`}
              </div>
              {data.nextRehearsal.location && (
                <div className="flex items-center gap-1 opacity-70">
                  <Icon name="mapPin" size={16} />
                  {data.nextRehearsal.location}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Concerts List */}
        {data.upcomingConcerts.length > 0 && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex items-center gap-2 text-base-content/60">
                <Icon name="calendar" size={20} />
                <span className="uppercase text-sm font-semibold tracking-wider">Coming Up</span>
              </div>
              <div className="space-y-3 mt-2">
                {data.upcomingConcerts.slice(0, 4).map((concert) => (
                  <div
                    key={concert.id}
                    className="flex justify-between items-center py-2 border-b border-base-200 last:border-0"
                  >
                    <div>
                      <div className="font-medium">{concert.name}</div>
                      <div className="text-sm text-base-content/60">{concert.venue}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div>{formatDate(concert.date)}</div>
                      {concert.startTime && <div className="opacity-70">{formatTime(concert.startTime)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Announcement */}
        {data.announcement && (
          <div className="card bg-warning/10 shadow-xl">
            <div className="card-body">
              <div className="flex items-center gap-2 text-warning">
                <Icon name="bell" size={20} />
                <span className="uppercase text-sm font-semibold tracking-wider">Announcement</span>
              </div>
              <h3 className="font-semibold text-xl mt-2">{data.announcement.title}</h3>
              {data.announcement.content && (
                <p className="text-base-content/80 mt-2 line-clamp-3">{data.announcement.content}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Empty state when no content */}
      {!data.nextConcert && !data.nextRehearsal && data.upcomingConcerts.length === 0 && (
        <div className="text-center py-20">
          <Icon name="calendar" size={64} className="mx-auto mb-4 opacity-30" />
          <p className="text-xl text-base-content/50">No upcoming events</p>
        </div>
      )}
    </div>
  );
}
