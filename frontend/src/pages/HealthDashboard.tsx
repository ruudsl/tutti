import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ServiceStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    latency?: number;
    details?: Record<string, any>;
}

interface DetailedHealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
    services: {
        database: ServiceStatus;
        disk: ServiceStatus;
        memory: ServiceStatus;
    };
    system: {
        platform: string;
        arch: string;
        nodeVersion: string;
        cpuCount: number;
        hostname: string;
        loadAverage: number[];
    };
}

export default function HealthDashboard() {
    const { t } = useTranslation();
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(30000);

    const { data: healthData, isLoading, error, refetch, isFetching } = useQuery<DetailedHealthResponse>({
        queryKey: ['health-detailed'],
        queryFn: async () => {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_BASE}/api/health/detailed`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                withCredentials: true,
            });
            return response.data;
        },
        refetchInterval: autoRefresh ? refreshInterval : false,
        staleTime: 10000,
    });

    // Format uptime as human-readable string
    const formatUptime = (seconds: number): string => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const parts = [];
        if (days > 0) parts.push(`${days}${t('health.days')}`);
        if (hours > 0) parts.push(`${hours}${t('health.hours')}`);
        if (minutes > 0) parts.push(`${minutes}${t('health.minutes')}`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}${t('health.seconds')}`);

        return parts.join(' ');
    };

    // Get status indicator color
    const getStatusColor = (status: string): string => {
        switch (status) {
            case 'healthy':
                return 'var(--success)';
            case 'degraded':
                return 'var(--warning)';
            case 'unhealthy':
                return 'var(--danger)';
            default:
                return 'var(--text-muted)';
        }
    };

    // Get status badge class
    const getStatusBadgeClass = (status: string): string => {
        switch (status) {
            case 'healthy':
                return 'badge-success';
            case 'degraded':
                return 'badge-warning';
            case 'unhealthy':
                return 'badge-danger';
            default:
                return 'badge-secondary';
        }
    };

    if (error) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1>{t('health.title')}</h1>
                </div>
                <div className="alert alert-danger">
                    <p>{t('health.errorLoading')}</p>
                    <button className="btn btn-primary mt-2" onClick={() => refetch()}>
                        {t('health.retry')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="page-header-content">
                    <h1>{t('health.title')}</h1>
                    {healthData && (
                        <span
                            className={`badge ${getStatusBadgeClass(healthData.status)}`}
                            style={{ marginLeft: '1rem', fontSize: '1rem' }}
                        >
                            {t(`health.status.${healthData.status}`)}
                        </span>
                    )}
                </div>
                <div className="page-header-actions">
                    <label className="checkbox-label" style={{ marginRight: '1rem' }}>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                        <span style={{ marginLeft: '0.5rem' }}>{t('health.autoRefresh')}</span>
                    </label>
                    {autoRefresh && (
                        <select
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(Number(e.target.value))}
                            className="form-control"
                            style={{ width: 'auto', marginRight: '1rem' }}
                        >
                            <option value={10000}>10s</option>
                            <option value={30000}>30s</option>
                            <option value={60000}>1m</option>
                            <option value={300000}>5m</option>
                        </select>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        {isFetching ? t('common.loading') : t('health.refresh')}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="loading">
                    <div className="spinner"></div>
                    <span>{t('common.loading')}</span>
                </div>
            ) : healthData ? (
                <div className="health-dashboard">
                    {/* System Overview Card */}
                    <div className="card">
                        <div className="card-header">
                            <h2>{t('health.systemOverview')}</h2>
                        </div>
                        <div className="card-body">
                            <div className="health-grid">
                                <div className="health-item">
                                    <span className="health-label">{t('health.version')}</span>
                                    <span className="health-value">{healthData.version}</span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.environment')}</span>
                                    <span className="health-value">{healthData.environment}</span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.uptime')}</span>
                                    <span className="health-value">{formatUptime(healthData.uptime)}</span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.lastChecked')}</span>
                                    <span className="health-value">
                                        {new Date(healthData.timestamp).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Services Status */}
                    <div className="card">
                        <div className="card-header">
                            <h2>{t('health.services')}</h2>
                        </div>
                        <div className="card-body">
                            <div className="services-grid">
                                {/* Database Service */}
                                <ServiceCard
                                    name={t('health.database')}
                                    service={healthData.services.database}
                                    t={t}
                                    getStatusColor={getStatusColor}
                                    getStatusBadgeClass={getStatusBadgeClass}
                                />

                                {/* Disk Service */}
                                <ServiceCard
                                    name={t('health.disk')}
                                    service={healthData.services.disk}
                                    t={t}
                                    getStatusColor={getStatusColor}
                                    getStatusBadgeClass={getStatusBadgeClass}
                                />

                                {/* Memory Service */}
                                <ServiceCard
                                    name={t('health.memory')}
                                    service={healthData.services.memory}
                                    t={t}
                                    getStatusColor={getStatusColor}
                                    getStatusBadgeClass={getStatusBadgeClass}
                                />
                            </div>
                        </div>
                    </div>

                    {/* System Info */}
                    <div className="card">
                        <div className="card-header">
                            <h2>{t('health.systemInfo')}</h2>
                        </div>
                        <div className="card-body">
                            <div className="health-grid">
                                <div className="health-item">
                                    <span className="health-label">{t('health.platform')}</span>
                                    <span className="health-value">
                                        {healthData.system.platform} ({healthData.system.arch})
                                    </span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.nodeVersion')}</span>
                                    <span className="health-value">{healthData.system.nodeVersion}</span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.hostname')}</span>
                                    <span className="health-value">{healthData.system.hostname}</span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.cpuCount')}</span>
                                    <span className="health-value">{healthData.system.cpuCount}</span>
                                </div>
                                <div className="health-item">
                                    <span className="health-label">{t('health.loadAverage')}</span>
                                    <span className="health-value">
                                        {healthData.system.loadAverage.map((l) => l.toFixed(2)).join(', ')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <style>{`
                .health-dashboard {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }

                .page-header-content {
                    display: flex;
                    align-items: center;
                }

                .page-header-actions {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }

                .health-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                }

                .health-item {
                    display: flex;
                    flex-direction: column;
                    padding: 0.75rem;
                    background: var(--bg-secondary);
                    border-radius: 0.5rem;
                }

                .health-label {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    margin-bottom: 0.25rem;
                }

                .health-value {
                    font-size: 1rem;
                    font-weight: 500;
                }

                .services-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 1rem;
                }

                .service-card {
                    border: 1px solid var(--border-color);
                    border-radius: 0.5rem;
                    padding: 1rem;
                    background: var(--bg-secondary);
                }

                .service-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                }

                .service-card-title {
                    font-size: 1.1rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .status-indicator {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    display: inline-block;
                }

                .service-card-details {
                    font-size: 0.875rem;
                }

                .service-card-details dt {
                    color: var(--text-muted);
                    float: left;
                    clear: left;
                    width: 140px;
                }

                .service-card-details dd {
                    margin-left: 150px;
                    margin-bottom: 0.25rem;
                }

                .badge-success {
                    background-color: var(--success);
                    color: white;
                }

                .badge-warning {
                    background-color: var(--warning);
                    color: black;
                }

                .badge-danger {
                    background-color: var(--danger);
                    color: white;
                }

                .badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                }

                @media (max-width: 768px) {
                    .page-header {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .page-header-actions {
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    );
}

// Service Card Component
interface ServiceCardProps {
    name: string;
    service: ServiceStatus;
    t: (key: string) => string;
    getStatusColor: (status: string) => string;
    getStatusBadgeClass: (status: string) => string;
}

function ServiceCard({ name, service, t, getStatusColor, getStatusBadgeClass }: ServiceCardProps) {
    return (
        <div className="service-card">
            <div className="service-card-header">
                <span className="service-card-title">
                    <span
                        className="status-indicator"
                        style={{ backgroundColor: getStatusColor(service.status) }}
                    ></span>
                    {name}
                </span>
                <span className={`badge ${getStatusBadgeClass(service.status)}`}>
                    {t(`health.status.${service.status}`)}
                </span>
            </div>
            {service.message && (
                <p style={{ color: 'var(--warning)', marginBottom: '0.5rem' }}>{service.message}</p>
            )}
            {service.latency !== undefined && (
                <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    {t('health.latency')}: {service.latency}ms
                </p>
            )}
            {service.details && (
                <dl className="service-card-details">
                    {Object.entries(service.details).map(([key, value]) => (
                        <div key={key}>
                            <dt>{t(`health.details.${key}`) || key}</dt>
                            <dd>{String(value)}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
