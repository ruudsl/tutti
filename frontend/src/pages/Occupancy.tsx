import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showError } from '../utils/toast';
import {
  getOrchestras,
  getSeatingSections,
  getSeatingAssignments,
  getUsers,
  getInstruments,
} from '../api';
import type { Orchestra, SeatingSection, SeatingAssignment, User, Instrument } from '../types';
import { SkeletonTable } from '../components/Skeleton';

interface SectionOccupancy {
  section: SeatingSection;
  assigned: number;
  potential: number;
  instruments: { id: string; name: string; count: number; assigned: number }[];
}

export default function Occupancy() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.occupancy');

  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string>('');
  const [sections, setSections] = useState<SeatingSection[]>([]);
  const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [, setInstruments] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedOrchestraId) {
      loadOrchestraData();
    }
  }, [selectedOrchestraId]);

  const loadInitialData = async () => {
    try {
      const [orch, allUsers, instr] = await Promise.all([
        getOrchestras(),
        getUsers(),
        getInstruments(),
      ]);
      setOrchestras(orch);
      setUsers(allUsers);
      setInstruments(instr);
      if (orch.length > 0) {
        setSelectedOrchestraId(orch[0].id);
      }
    } catch (e) {
      console.error(e);
      showError(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrchestraData = async () => {
    if (!selectedOrchestraId) return;
    try {
      const [sect, assign] = await Promise.all([
        getSeatingSections(selectedOrchestraId),
        getSeatingAssignments(selectedOrchestraId),
      ]);
      setSections(sect);
      setAssignments(assign);
    } catch (e) {
      console.error(e);
    }
  };

  // Calculate occupancy per section
  const occupancyData = useMemo((): SectionOccupancy[] => {
    if (sections.length === 0) return [];

    // Get users in this orchestra
    const orchestraUsers = users.filter(u =>
      u.orchestras?.some(o => o.id === selectedOrchestraId)
    );

    // Create a map of instrument ID to users who play that instrument
    const usersByInstrument = new Map<string, User[]>();
    for (const user of orchestraUsers) {
      for (const instr of user.instruments || []) {
        if (!usersByInstrument.has(instr.id)) {
          usersByInstrument.set(instr.id, []);
        }
        usersByInstrument.get(instr.id)!.push(user);
      }
    }

    // Create a set of assigned user IDs
    const assignedUserIds = new Set(assignments.map(a => a.userId));

    return sections.map(section => {
      // Count assigned members in this section
      const sectionAssignments = assignments.filter(a => a.sectionId === section.id);
      const assigned = sectionAssignments.length;

      // Count potential members (users with matching instruments)
      const potentialUserIds = new Set<string>();
      const instrumentStats: { id: string; name: string; count: number; assigned: number }[] = [];

      for (const instrument of section.instruments) {
        const usersWithInstrument = usersByInstrument.get(instrument.id) || [];
        const assignedWithInstrument = usersWithInstrument.filter(u => assignedUserIds.has(u.id)).length;

        instrumentStats.push({
          id: instrument.id,
          name: instrument.name,
          count: usersWithInstrument.length,
          assigned: assignedWithInstrument,
        });

        for (const user of usersWithInstrument) {
          potentialUserIds.add(user.id);
        }
      }

      return {
        section,
        assigned,
        potential: potentialUserIds.size,
        instruments: instrumentStats,
      };
    });
  }, [sections, assignments, users, selectedOrchestraId]);

  // Calculate totals
  const totals = useMemo(() => {
    return occupancyData.reduce(
      (acc, data) => ({
        assigned: acc.assigned + data.assigned,
        potential: acc.potential + data.potential,
      }),
      { assigned: 0, potential: 0 }
    );
  }, [occupancyData]);

  // Determine status color
  const getStatusColor = (assigned: number, potential: number): string => {
    if (potential === 0) return 'gray';
    const ratio = assigned / potential;
    if (ratio >= 0.8) return 'var(--success)';
    if (ratio >= 0.5) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getStatusLabel = (assigned: number, potential: number): string => {
    if (potential === 0) return t('occupancy.noPlayers');
    const ratio = assigned / potential;
    if (ratio >= 0.8) return t('occupancy.wellStaffed');
    if (ratio >= 0.5) return t('occupancy.adequate');
    return t('occupancy.understaffed');
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <h1>{t('occupancy.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('occupancy.title')}</h1>
      </div>

      <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
        {t('occupancy.description')}
      </p>

      {/* Orchestra Selection */}
      <div className="form-row" style={{ marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ maxWidth: '300px' }}>
          <label htmlFor="orchestra">{t('seating.selectOrchestra')}</label>
          <select
            id="orchestra"
            value={selectedOrchestraId}
            onChange={(e) => setSelectedOrchestraId(e.target.value)}
          >
            {orchestras.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-value">{totals.assigned}</div>
          <div className="stat-label">{t('occupancy.totalAssigned')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totals.potential}</div>
          <div className="stat-label">{t('occupancy.totalPotential')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {totals.potential > 0 ? Math.round((totals.assigned / totals.potential) * 100) : 0}%
          </div>
          <div className="stat-label">{t('occupancy.fillRate')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sections.length}</div>
          <div className="stat-label">{t('occupancy.totalSections')}</div>
        </div>
      </div>

      {/* Occupancy per Section */}
      {occupancyData.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <p>{t('occupancy.noSections')}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2>{t('occupancy.sectionOverview')}</h2>
          </div>
          <div className="card-body">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('occupancy.section')}</th>
                  <th>{t('occupancy.assigned')}</th>
                  <th>{t('occupancy.potential')}</th>
                  <th>{t('occupancy.fillRate')}</th>
                  <th>{t('occupancy.status')}</th>
                  <th>{t('occupancy.instruments')}</th>
                </tr>
              </thead>
              <tbody>
                {occupancyData.map(data => (
                  <tr key={data.section.id}>
                    <td>
                      <strong>{data.section.name}</strong>
                      <br />
                      <small className="text-muted">{t('seating.row')} {data.section.rowNumber}</small>
                    </td>
                    <td>{data.assigned}</td>
                    <td>{data.potential}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: '60px',
                            height: '8px',
                            backgroundColor: 'var(--border)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${data.potential > 0 ? (data.assigned / data.potential) * 100 : 0}%`,
                              height: '100%',
                              backgroundColor: getStatusColor(data.assigned, data.potential),
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                        <span>
                          {data.potential > 0 ? Math.round((data.assigned / data.potential) * 100) : 0}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: getStatusColor(data.assigned, data.potential),
                          color: 'white',
                        }}
                      >
                        {getStatusLabel(data.assigned, data.potential)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {data.instruments.map(instr => (
                          <span
                            key={instr.id}
                            className="badge badge-secondary"
                            title={`${instr.assigned}/${instr.count} ${t('occupancy.assigned').toLowerCase()}`}
                          >
                            {instr.name} ({instr.assigned}/{instr.count})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-body">
          <h4 style={{ marginBottom: '0.5rem' }}>{t('occupancy.legend')}</h4>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--success)',
                }}
              />
              <span>{t('occupancy.wellStaffed')} (80%+)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--warning)',
                }}
              />
              <span>{t('occupancy.adequate')} (50-79%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--danger)',
                }}
              />
              <span>{t('occupancy.understaffed')} (&lt;50%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
