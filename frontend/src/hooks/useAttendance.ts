import { useState, useCallback, useMemo } from 'react';

export interface AttendanceMember {
  id: string;
  name: string;
  email: string;
  instrument: string;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

export interface AttendanceFilters {
  from: string;
  to: string;
  orchestraId: string;
  sortBy: 'name' | 'rate' | 'count';
}

function getDefaultFromDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return date.toISOString().split('T')[0];
}

function getDefaultToDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function useAttendance() {
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [rehearsalCount, setRehearsalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<AttendanceFilters>({
    from: getDefaultFromDate(),
    to: getDefaultToDate(),
    orchestraId: '',
    sortBy: 'name',
  });

  const updateFilters = useCallback((updates: Partial<AttendanceFilters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      from: getDefaultFromDate(),
      to: getDefaultToDate(),
      orchestraId: '',
      sortBy: 'name',
    });
  }, []);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      switch (filters.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'rate':
          return b.attendanceRate - a.attendanceRate;
        case 'count':
          return b.presentCount - a.presentCount;
        default:
          return 0;
      }
    });
  }, [members, filters.sortBy]);

  return {
    members: sortedMembers,
    setMembers,
    rehearsalCount,
    setRehearsalCount,
    loading,
    setLoading,
    filters,
    updateFilters,
    resetFilters,
  };
}

export function useMyAttendance() {
  const [status, setStatus] = useState<'present' | 'absent' | 'unknown'>('unknown');
  const [canSyncToSpond, setCanSyncToSpond] = useState(false);
  const [updating, setUpdating] = useState(false);

  const updateAttendance = useCallback(async (
    newStatus: 'present' | 'absent',
    onUpdate: (status: 'present' | 'absent') => Promise<void>
  ) => {
    setUpdating(true);
    try {
      await onUpdate(newStatus);
      setStatus(newStatus);
    } finally {
      setUpdating(false);
    }
  }, []);

  return {
    status,
    setStatus,
    canSyncToSpond,
    setCanSyncToSpond,
    updating,
    updateAttendance,
  };
}
