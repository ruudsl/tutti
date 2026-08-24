import { useState, useEffect, useCallback, useMemo } from 'react';
import { useModules } from '../context/ModulesContext';

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  enabled: boolean;
  order: number;
  size: 'small' | 'medium' | 'large' | 'full';
  config?: Record<string, unknown>;
}

export type WidgetType =
  | 'stats'
  | 'music-lists'
  | 'recent-activity'
  | 'upcoming-rehearsals'
  | 'practice-progress'
  | 'favorites'
  | 'quick-actions'
  | 'announcements'
  | 'tasks';

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'stats', type: 'stats', title: 'Statistics', enabled: true, order: 0, size: 'full' },
  { id: 'tasks', type: 'tasks', title: 'My Tasks', enabled: true, order: 1, size: 'medium' },
  { id: 'music-lists', type: 'music-lists', title: 'My Music Lists', enabled: true, order: 2, size: 'medium' },
  {
    id: 'upcoming-rehearsals',
    type: 'upcoming-rehearsals',
    title: 'Upcoming Rehearsals',
    enabled: true,
    order: 3,
    size: 'medium',
  },
  { id: 'recent-activity', type: 'recent-activity', title: 'Recent Activity', enabled: true, order: 4, size: 'medium' },
  {
    id: 'practice-progress',
    type: 'practice-progress',
    title: 'Practice Progress',
    enabled: true,
    order: 5,
    size: 'medium',
  },
  { id: 'favorites', type: 'favorites', title: 'Favorites', enabled: true, order: 6, size: 'small' },
  { id: 'quick-actions', type: 'quick-actions', title: 'Quick Actions', enabled: true, order: 7, size: 'small' },
  { id: 'announcements', type: 'announcements', title: 'Announcements', enabled: false, order: 8, size: 'full' },
];

const STORAGE_KEY = 'dashboard-widgets';

/**
 * Widgets die bij een module horen.
 *
 * Zonder deze koppeling blijft het dashboard gegevens tonen van een module die
 * de beheerder heeft uitgezet - een takenlijst zonder takenpagina, of
 * oefenvoortgang terwijl "thuis oefenen" uit staat. Dan is verbergen alleen
 * cosmetisch, en dat is precies wat het niet moet zijn.
 */
const WIDGET_MODULE: Partial<Record<WidgetType, string>> = {
  tasks: 'tasks',
  'practice-progress': 'practice',
  announcements: 'posts',
};

export function useDashboardWidgets() {
  const { enabled: enabledModules } = useModules();
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load widgets from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DashboardWidget[];
        // Merge with defaults to handle new widgets
        const merged = DEFAULT_WIDGETS.map((defaultWidget) => {
          const storedWidget = parsed.find((w) => w.id === defaultWidget.id);
          return storedWidget || defaultWidget;
        });
        setWidgets(merged);
      } catch {
        setWidgets([...DEFAULT_WIDGETS]);
      }
    } else {
      setWidgets([...DEFAULT_WIDGETS]);
    }
    setIsLoaded(true);
  }, []);

  // Widgets van uitgezette modules vallen weg. Ze blijven wel in de opgeslagen
  // voorkeuren staan, zodat de indeling van de gebruiker terugkomt zodra de
  // module weer aan gaat.
  const visibleWidgets = useMemo(() => {
    return widgets.filter((w) => {
      const moduleKey = WIDGET_MODULE[w.type];
      return !moduleKey || enabledModules.includes(moduleKey);
    });
  }, [widgets, enabledModules]);

  // Save widgets to localStorage
  const saveWidgets = useCallback((newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets));
  }, []);

  // Toggle widget enabled state
  const toggleWidget = useCallback(
    (widgetId: string) => {
      const newWidgets = widgets.map((w) => (w.id === widgetId ? { ...w, enabled: !w.enabled } : w));
      saveWidgets(newWidgets);
    },
    [widgets, saveWidgets],
  );

  /**
   * Verplaatst een widget van de ene plek naar de andere.
   *
   * De indexen komen van het scherm, en dat sleept in de lijst die het toont:
   * gesorteerd op `order` en zonder de widgets van uitgezette modules. Dit
   * knipte en plakte in `widgets`, en die lijst staat in de volgorde van
   * DEFAULT_WIDGETS - met de weggelaten widgets er nog tussen, en na het
   * inlezen van opgeslagen voorkeuren ook in een andere volgorde dan de
   * volgnummers aangeven. Zodra die twee lijsten uit elkaar liepen verplaatste
   * een sleepactie een andere widget dan de gebruiker vasthad, soms een
   * onzichtbare - dan gebeurde er in beeld niets.
   *
   * Er wordt nu geknipt in de getoonde lijst. De plekken die de zichtbare
   * widgets innemen blijven bezet; alleen wie op welke plek staat verandert.
   * Zo houden de widgets van een uitgezette module hun eigen volgnummer, en
   * komt de indeling van de gebruiker terug zodra die module weer aan gaat.
   */
  const reorderWidgets = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const getoond = [...visibleWidgets].sort((a, b) => a.order - b.order);

      if (dragIndex < 0 || dragIndex >= getoond.length || hoverIndex < 0 || hoverIndex >= getoond.length) {
        return;
      }

      const plekken = getoond.map((w) => w.order);
      const [verplaatst] = getoond.splice(dragIndex, 1);
      getoond.splice(hoverIndex, 0, verplaatst);

      const nieuweVolgnummers = new Map(getoond.map((w, i) => [w.id, plekken[i]]));
      saveWidgets(
        widgets.map((w) => (nieuweVolgnummers.has(w.id) ? { ...w, order: nieuweVolgnummers.get(w.id)! } : w)),
      );
    },
    [widgets, visibleWidgets, saveWidgets],
  );

  // Update widget size
  const setWidgetSize = useCallback(
    (widgetId: string, size: DashboardWidget['size']) => {
      const newWidgets = widgets.map((w) => (w.id === widgetId ? { ...w, size } : w));
      saveWidgets(newWidgets);
    },
    [widgets, saveWidgets],
  );

  // Update widget config
  const setWidgetConfig = useCallback(
    (widgetId: string, config: Record<string, unknown>) => {
      const newWidgets = widgets.map((w) => (w.id === widgetId ? { ...w, config: { ...w.config, ...config } } : w));
      saveWidgets(newWidgets);
    },
    [widgets, saveWidgets],
  );

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    saveWidgets([...DEFAULT_WIDGETS]);
  }, [saveWidgets]);

  // Get enabled widgets sorted by order
  const enabledWidgets = visibleWidgets.filter((w) => w.enabled).sort((a, b) => a.order - b.order);

  // Ook de instellingenlijst toont alleen wat er te kiezen valt: een widget
  // aanzetten voor een uitgezette module levert een leeg vak op.
  const allWidgets = [...visibleWidgets].sort((a, b) => a.order - b.order);

  return {
    widgets: enabledWidgets,
    allWidgets,
    isEditMode,
    setIsEditMode,
    toggleWidget,
    reorderWidgets,
    setWidgetSize,
    setWidgetConfig,
    resetToDefaults,
    isLoaded,
  };
}

export default useDashboardWidgets;
