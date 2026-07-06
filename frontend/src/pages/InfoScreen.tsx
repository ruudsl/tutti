import { currentLocale } from '../utils/locale';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { getInfoScreenData, InfoScreenData } from '../api/calendar';

export default function InfoScreen() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const theme = searchParams.get('theme') || 'auto';

  const [currentTime, setCurrentTime] = useState(new Date());

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['info-screen', slug],
    queryFn: () => getInfoScreenData(slug!),
    enabled: !!slug,
    refetchInterval: 60000, // Auto-refresh every minute
  });

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  // Auto-refresh data
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="text-center" role="alert">
          <Icon name="warning" size={48} className="mx-auto mb-4 opacity-50" aria-hidden={true} />
          <h1 className="text-xl font-bold mb-2">Info Screen Not Available</h1>
          <p className="text-base-content/70">{error instanceof Error ? error.message : 'Association not found'}</p>
        </div>
      </div>
    );
  }

  return <InfoScreenDisplay data={data} currentTime={currentTime} />;
}

function InfoScreenDisplay({ data, currentTime }: { data: InfoScreenData; currentTime: Date }) {
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
                <Icon name="music2" size={20} aria-hidden={true} />
                <span className="uppercase text-sm font-semibold tracking-wider">Next Concert</span>
              </div>
              <h2 className="card-title text-3xl mt-2">{data.nextConcert.name}</h2>
              <div className="text-xl mt-2">{formatDate(data.nextConcert.date)}</div>
              {data.nextConcert.startTime && <div className="text-lg">{formatTime(data.nextConcert.startTime)}</div>}
              {data.nextConcert.venue && (
                <div className="flex items-center gap-1 mt-2">
                  <Icon name="mapPin" size={16} aria-hidden={true} />
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
                <Icon name="users" size={20} aria-hidden={true} />
                <span className="uppercase text-sm font-semibold tracking-wider">Next Rehearsal</span>
              </div>
              <h2 className="card-title text-2xl mt-2">{data.nextRehearsal.orchestraName || 'Rehearsal'}</h2>
              <div className="text-lg">{formatDate(data.nextRehearsal.date)}</div>
              <div className="flex items-center gap-2">
                <Icon name="clock" size={16} className="opacity-70" aria-hidden={true} />
                {formatTime(data.nextRehearsal.startTime)}
                {data.nextRehearsal.endTime && ` - ${formatTime(data.nextRehearsal.endTime)}`}
              </div>
              {data.nextRehearsal.location && (
                <div className="flex items-center gap-1 opacity-70">
                  <Icon name="mapPin" size={16} aria-hidden={true} />
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
                <Icon name="calendar" size={20} aria-hidden={true} />
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
                <Icon name="bell" size={20} aria-hidden={true} />
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
          <Icon name="calendar" size={64} className="mx-auto mb-4 opacity-30" aria-hidden={true} />
          <p className="text-xl text-base-content/50">No upcoming events</p>
        </div>
      )}
    </div>
  );
}
