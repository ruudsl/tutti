import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { getEquipmentStats } from '../api/equipment';
import { SkeletonCard } from './Skeleton';

interface EquipmentStatsProps {
  className?: string;
}

export function EquipmentStats({ className = '' }: EquipmentStatsProps) {
  const { t } = useTranslation();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['equipment-stats'],
    queryFn: getEquipmentStats,
    staleTime: 30000, // 30 seconds
  });

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 ${className}`}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return null; // Silently fail - stats are supplementary
  }

  const availableCount = stats.byStatus['available'] || 0;
  const inUseCount = stats.byStatus['in_use'] || 0;
  const maintenanceCount = stats.byStatus['maintenance'] || 0;
  const repairCount = stats.byStatus['repair'] || 0;

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 ${className}`}>
      {/* Total Items */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <Icon name="package" size={18} className="text-primary" aria-hidden={true} />
            <span className="text-sm text-base-content/60">{t('equipment.stats.total')}</span>
          </div>
          <div className="text-2xl font-bold">{stats.totalItems}</div>
        </div>
      </div>

      {/* Available */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <Icon name="checkCircle" size={18} className="text-success" aria-hidden={true} />
            <span className="text-sm text-base-content/60">{t('equipment.stats.available')}</span>
          </div>
          <div className="text-2xl font-bold text-success">{availableCount}</div>
        </div>
      </div>

      {/* In Use / On Loan */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <Icon name="user" size={18} className="text-warning" aria-hidden={true} />
            <span className="text-sm text-base-content/60">{t('equipment.stats.inUse')}</span>
          </div>
          <div className="text-2xl font-bold text-warning">{inUseCount}</div>
        </div>
      </div>

      {/* Active Loans */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <Icon name="arrow" size={18} className="text-info" aria-hidden={true} />
            <span className="text-sm text-base-content/60">{t('equipment.stats.activeLoans')}</span>
          </div>
          <div className="text-2xl font-bold text-info">{stats.activeLoans}</div>
        </div>
      </div>

      {/* In Maintenance/Repair */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <Icon name="wrench" size={18} className="text-error" aria-hidden={true} />
            <span className="text-sm text-base-content/60">{t('equipment.stats.inMaintenance')}</span>
          </div>
          <div className="text-2xl font-bold text-error">{maintenanceCount + repairCount}</div>
        </div>
      </div>

      {/* Total Value */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex items-center gap-2">
            <Icon name="creditCard" size={18} className="text-primary" aria-hidden={true} />
            <span className="text-sm text-base-content/60">{t('equipment.stats.totalValue')}</span>
          </div>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(stats.totalValue)}
          </div>
        </div>
      </div>
    </div>
  );
}
