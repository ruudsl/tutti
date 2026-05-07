import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    useEvents,
    useEvent,
    useCreateEvent,
    useUpdateEvent,
    useDeleteEvent,
    useEventLocations,
    useEventSchedule,
    useEventTransport,
    useEventMeetingPoints,
    useEventPackingLists,
    useAttendanceSummary,
    useEventWeather,
    useUpdateMyAttendance,
    useCreateScheduleItem,
    useDeleteScheduleItem,
    useDeleteTransport,
    useDeleteMeetingPoint,
    useCreatePackingList,
    usePackingTemplates,
} from '../hooks/useEvents';
import { useOrchestras } from '../hooks/useOrchestras';
import { useInstruments } from '../hooks/useInstruments';
import { Icon } from '../components/Icon';
import { FormModal } from '../components/FormModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Event, EventLocation, EventScheduleItem, EventTransport, EventMeetingPoint, EventPackingList } from '../api/events';
import { formatDate } from '../utils/format';

const EVENT_TYPES = [
    { value: 'performance', label: 'Optreden' },
    { value: 'rehearsal', label: 'Repetitie' },
    { value: 'meeting', label: 'Vergadering' },
    { value: 'social', label: 'Sociaal' },
    { value: 'workshop', label: 'Workshop' },
    { value: 'other', label: 'Overig' },
];

const STATUS_OPTIONS = [
    { value: 'planned', label: 'Gepland', color: 'bg-blue-100 text-blue-800' },
    { value: 'confirmed', label: 'Bevestigd', color: 'bg-green-100 text-green-800' },
    { value: 'cancelled', label: 'Geannuleerd', color: 'bg-red-100 text-red-800' },
    { value: 'completed', label: 'Afgerond', color: 'bg-gray-100 text-gray-800' },
];

const ATTENDANCE_STATUS = [
    { value: 'attending', label: 'Aanwezig', icon: 'checkCircle', color: 'text-green-600' },
    { value: 'not_attending', label: 'Afwezig', icon: 'xCircle', color: 'text-red-600' },
    { value: 'maybe', label: 'Misschien', icon: 'helpCircle', color: 'text-yellow-600' },
];

export default function Events() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [viewingEventId, setViewingEventId] = useState<string | null>(searchParams.get('id'));
    const [deletingEvent, setDeletingEvent] = useState<Event | null>(null);
    const [activeTab, setActiveTab] = useState<'details' | 'schedule' | 'transport' | 'packing' | 'weather'>('details');

    const { data: eventsData, isLoading } = useEvents({
        search: search || undefined,
        status: statusFilter || undefined,
        upcoming: !statusFilter,
    });

    const { data: eventDetail } = useEvent(viewingEventId || undefined);
    const { data: orchestras } = useOrchestras();
    useInstruments(); // Pre-load for attendance
    const { data: locations } = useEventLocations();
    const { data: schedule } = useEventSchedule(viewingEventId || undefined);
    const { data: transport } = useEventTransport(viewingEventId || undefined);
    const { data: meetingPoints } = useEventMeetingPoints(viewingEventId || undefined);
    const { data: packingLists } = useEventPackingLists(viewingEventId || undefined);
    const { data: attendanceSummary } = useAttendanceSummary(viewingEventId || undefined);
    const { data: weather } = useEventWeather(viewingEventId || undefined);
    const { data: packingTemplates } = usePackingTemplates();

    const createEvent = useCreateEvent();
    const updateEvent = useUpdateEvent();
    const deleteEvent = useDeleteEvent();
    const updateAttendance = useUpdateMyAttendance();
    const createScheduleItem = useCreateScheduleItem();
    const deleteScheduleItem = useDeleteScheduleItem();
    const deleteTransport = useDeleteTransport();
    const deleteMeetingPoint = useDeleteMeetingPoint();
    const createPackingList = useCreatePackingList();

    const events = eventsData?.data || [];

    const handleViewEvent = (event: Event) => {
        setViewingEventId(event.id);
        setSearchParams({ id: event.id });
        setActiveTab('details');
    };

    const handleCloseDetail = () => {
        setViewingEventId(null);
        setSearchParams({});
    };

    const handleCreateEvent = async (data: any) => {
        await createEvent.mutateAsync({
            ...data,
            orchestraIds: data.orchestraIds || [],
        });
        setShowCreateModal(false);
    };

    const handleUpdateEvent = async (data: any) => {
        if (!editingEvent) return;
        await updateEvent.mutateAsync({
            id: editingEvent.id,
            data: {
                ...data,
                orchestraIds: data.orchestraIds || [],
            },
        });
        setEditingEvent(null);
    };

    const handleDeleteEvent = async () => {
        if (!deletingEvent) return;
        await deleteEvent.mutateAsync(deletingEvent.id);
        setDeletingEvent(null);
        if (viewingEventId === deletingEvent.id) {
            handleCloseDetail();
        }
    };

    const handleUpdateAttendance = async (status: 'attending' | 'not_attending' | 'maybe') => {
        if (!viewingEventId) return;
        await updateAttendance.mutateAsync({
            eventId: viewingEventId,
            data: { status },
        });
    };

    const getStatusBadge = (status: string) => {
        const statusOption = STATUS_OPTIONS.find(s => s.value === status);
        return statusOption ? (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusOption.color}`}>
                {statusOption.label}
            </span>
        ) : null;
    };

    if (viewingEventId && eventDetail) {
        return (
            <div className="p-6 max-w-6xl mx-auto">
                <button
                    onClick={handleCloseDetail}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
                >
                    <Icon name="arrowLeft" className="w-5 h-5" />
                    Terug naar overzicht
                </button>

                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-6 border-b">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h1 className="text-2xl font-bold">{eventDetail.name}</h1>
                                    {getStatusBadge(eventDetail.status)}
                                </div>
                                <div className="text-gray-600 space-y-1">
                                    <p className="flex items-center gap-2">
                                        <Icon name="calendar" className="w-4 h-4" />
                                        {formatDate(eventDetail.startDatetime)}
                                        {eventDetail.performanceTime && ` - ${new Date(eventDetail.performanceTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`}
                                    </p>
                                    {eventDetail.locationName && (
                                        <p className="flex items-center gap-2">
                                            <Icon name="mapPin" className="w-4 h-4" />
                                            {eventDetail.locationName}
                                            {eventDetail.city && `, ${eventDetail.city}`}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditingEvent(eventDetail)}
                                    className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Icon name="pencil" className="w-4 h-4" />
                                    Bewerken
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex gap-2">
                            {ATTENDANCE_STATUS.map(status => (
                                <button
                                    key={status.value}
                                    onClick={() => handleUpdateAttendance(status.value as any)}
                                    className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${
                                        eventDetail.myAttendance?.status === status.value
                                            ? 'bg-gray-100 border-gray-400'
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <Icon name={status.icon as any} className={`w-5 h-5 ${status.color}`} />
                                    {status.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-b">
                        <nav className="flex">
                            {[
                                { id: 'details', label: 'Details', icon: 'info' },
                                { id: 'schedule', label: 'Programma', icon: 'clock' },
                                { id: 'transport', label: 'Vervoer', icon: 'truck' },
                                { id: 'packing', label: 'Paklijst', icon: 'clipboard' },
                                { id: 'weather', label: 'Weer', icon: 'cloud' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                                        activeTab === tab.id
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <Icon name={tab.icon as any} className="w-5 h-5" />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="p-6">
                        {activeTab === 'details' && (
                            <EventDetailsTab
                                event={eventDetail}
                                attendanceSummary={attendanceSummary}
                                meetingPoints={meetingPoints || []}
                            />
                        )}

                        {activeTab === 'schedule' && (
                            <EventScheduleTab
                                eventId={viewingEventId}
                                schedule={schedule || []}
                                onCreateItem={createScheduleItem.mutateAsync}
                                onDeleteItem={deleteScheduleItem.mutateAsync}
                            />
                        )}

                        {activeTab === 'transport' && (
                            <EventTransportTab
                                eventId={viewingEventId}
                                transport={transport || []}
                                meetingPoints={meetingPoints || []}
                                onDeleteTransport={deleteTransport.mutateAsync}
                                onDeleteMeetingPoint={deleteMeetingPoint.mutateAsync}
                            />
                        )}

                        {activeTab === 'packing' && (
                            <EventPackingTab
                                eventId={viewingEventId}
                                packingLists={packingLists || []}
                                templates={packingTemplates || []}
                                onCreateList={createPackingList.mutateAsync}
                            />
                        )}

                        {activeTab === 'weather' && (
                            <EventWeatherTab
                                event={eventDetail}
                                weather={weather}
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Evenementen & Optredens</h1>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Icon name="plus" className="w-5 h-5" />
                    Nieuw Evenement
                </button>
            </div>

            <div className="flex gap-4 mb-6">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Zoeken..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                >
                    <option value="">Aankomend</option>
                    {STATUS_OPTIONS.map(status => (
                        <option key={status.value} value={status.value}>
                            {status.label}
                        </option>
                    ))}
                </select>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-gray-500">Laden...</div>
            ) : events.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="calendar" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen evenementen gevonden</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {events.map((event: Event) => (
                        <div
                            key={event.id}
                            className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => handleViewEvent(event)}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-semibold text-lg">{event.name}</h3>
                                        {getStatusBadge(event.status)}
                                    </div>
                                    <div className="text-gray-600 text-sm space-y-1">
                                        <p className="flex items-center gap-2">
                                            <Icon name="calendar" className="w-4 h-4" />
                                            {formatDate(event.startDatetime)}
                                        </p>
                                        {event.locationName && (
                                            <p className="flex items-center gap-2">
                                                <Icon name="mapPin" className="w-4 h-4" />
                                                {event.locationName}
                                                {event.city && `, ${event.city}`}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                    {event.attendingCount !== undefined && (
                                        <span className="flex items-center gap-1">
                                            <Icon name="users" className="w-4 h-4" />
                                            {event.attendingCount} aanwezig
                                        </span>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingEvent(event);
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded"
                                    >
                                        <Icon name="pencil" className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeletingEvent(event);
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded text-red-600"
                                    >
                                        <Icon name="trash" className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showCreateModal && (
                <EventFormModal
                    title="Nieuw Evenement"
                    orchestras={orchestras || []}
                    locations={locations?.data || []}
                    onSubmit={handleCreateEvent}
                    onClose={() => setShowCreateModal(false)}
                    isLoading={createEvent.isPending}
                />
            )}

            {editingEvent && (
                <EventFormModal
                    title="Evenement Bewerken"
                    event={editingEvent}
                    orchestras={orchestras || []}
                    locations={locations?.data || []}
                    onSubmit={handleUpdateEvent}
                    onClose={() => setEditingEvent(null)}
                    isLoading={updateEvent.isPending}
                />
            )}

            {deletingEvent && (
                <ConfirmDialog
                    title="Evenement verwijderen"
                    message={`Weet je zeker dat je "${deletingEvent.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
                    confirmLabel="Verwijderen"
                    onConfirm={handleDeleteEvent}
                    onCancel={() => setDeletingEvent(null)}
                    variant="danger"
                />
            )}
        </div>
    );
}

// ===========================================
// SUB COMPONENTS
// ===========================================

function EventFormModal({
    title,
    event,
    orchestras,
    locations,
    onSubmit,
    onClose,
    isLoading,
}: {
    title: string;
    event?: Event;
    orchestras: any[];
    locations: EventLocation[];
    onSubmit: (data: any) => void;
    onClose: () => void;
    isLoading: boolean;
}) {
    const [formData, setFormData] = useState({
        name: event?.name || '',
        eventType: event?.eventType || 'performance',
        status: event?.status || 'planned',
        locationId: event?.locationId || '',
        locationName: event?.locationName || '',
        address: event?.address || '',
        city: event?.city || '',
        startDatetime: event?.startDatetime ? event.startDatetime.slice(0, 16) : '',
        endDatetime: event?.endDatetime ? event.endDatetime.slice(0, 16) : '',
        performanceTime: event?.performanceTime ? event.performanceTime.slice(0, 16) : '',
        dressCode: event?.dressCode || '',
        description: event?.description || '',
        internalNotes: event?.internalNotes || '',
        weatherSensitive: event?.weatherSensitive || false,
        orchestraIds: event?.orchestras?.map(o => o.id) || [],
    });

    const handleLocationChange = (locationId: string) => {
        const location = locations.find(l => l.id === locationId);
        setFormData(prev => ({
            ...prev,
            locationId,
            locationName: location?.name || '',
            address: location?.address || '',
            city: location?.city || '',
        }));
    };

    return (
        <FormModal
            title={title}
            onClose={onClose}
            onSubmit={() => onSubmit(formData)}
            isLoading={isLoading}
            submitLabel={event ? 'Opslaan' : 'Aanmaken'}
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Naam *</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <select
                            value={formData.eventType}
                            onChange={(e) => setFormData(prev => ({ ...prev, eventType: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            {EVENT_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            {STATUS_OPTIONS.map(status => (
                                <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start *</label>
                        <input
                            type="datetime-local"
                            value={formData.startDatetime}
                            onChange={(e) => setFormData(prev => ({ ...prev, startDatetime: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Einde</label>
                        <input
                            type="datetime-local"
                            value={formData.endDatetime}
                            onChange={(e) => setFormData(prev => ({ ...prev, endDatetime: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Locatie</label>
                    <select
                        value={formData.locationId}
                        onChange={(e) => handleLocationChange(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                    >
                        <option value="">-- Selecteer locatie --</option>
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>
                </div>

                {!formData.locationId && (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Locatienaam</label>
                            <input
                                type="text"
                                value={formData.locationName}
                                onChange={(e) => setFormData(prev => ({ ...prev, locationName: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Stad</label>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orkesten</label>
                    <div className="space-y-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                        {orchestras.map(orch => (
                            <label key={orch.id} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.orchestraIds.includes(orch.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setFormData(prev => ({
                                                ...prev,
                                                orchestraIds: [...prev.orchestraIds, orch.id],
                                            }));
                                        } else {
                                            setFormData(prev => ({
                                                ...prev,
                                                orchestraIds: prev.orchestraIds.filter(id => id !== orch.id),
                                            }));
                                        }
                                    }}
                                />
                                {orch.name}
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dresscode</label>
                    <input
                        type="text"
                        value={formData.dressCode}
                        onChange={(e) => setFormData(prev => ({ ...prev, dressCode: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="bijv. Concert zwart"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Beschrijving</label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                        rows={3}
                    />
                </div>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={formData.weatherSensitive}
                        onChange={(e) => setFormData(prev => ({ ...prev, weatherSensitive: e.target.checked }))}
                    />
                    <span className="text-sm">Weergevoelig (buitenoptreden)</span>
                </label>
            </div>
        </FormModal>
    );
}

function EventDetailsTab({
    event,
    attendanceSummary,
    meetingPoints,
}: {
    event: Event & { orchestras?: any[]; attendance?: any[] };
    attendanceSummary: any;
    meetingPoints: EventMeetingPoint[];
}) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
                <div>
                    <h3 className="font-semibold mb-3">Algemene Informatie</h3>
                    <dl className="space-y-2 text-sm">
                        {event.eventType && (
                            <div className="flex">
                                <dt className="w-32 text-gray-500">Type:</dt>
                                <dd>{EVENT_TYPES.find(t => t.value === event.eventType)?.label}</dd>
                            </div>
                        )}
                        {event.dressCode && (
                            <div className="flex">
                                <dt className="w-32 text-gray-500">Dresscode:</dt>
                                <dd>{event.dressCode}</dd>
                            </div>
                        )}
                        {event.description && (
                            <div className="flex">
                                <dt className="w-32 text-gray-500">Beschrijving:</dt>
                                <dd>{event.description}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                {event.orchestras && event.orchestras.length > 0 && (
                    <div>
                        <h3 className="font-semibold mb-3">Orkesten</h3>
                        <ul className="space-y-1">
                            {event.orchestras.map(orch => (
                                <li key={orch.id} className="flex items-center gap-2">
                                    <Icon name="music" className="w-4 h-4 text-gray-400" />
                                    {orch.name}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {meetingPoints.length > 0 && (
                    <div>
                        <h3 className="font-semibold mb-3">Verzamelpunten</h3>
                        <ul className="space-y-2">
                            {meetingPoints.map(point => (
                                <li key={point.id} className="flex items-start gap-2 text-sm">
                                    <Icon name="mapPin" className="w-4 h-4 text-gray-400 mt-0.5" />
                                    <div>
                                        <div className="font-medium">{point.name}</div>
                                        {point.address && <div className="text-gray-500">{point.address}</div>}
                                        <div className="text-gray-500">
                                            {new Date(point.meetingTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="space-y-6">
                {attendanceSummary && (
                    <div>
                        <h3 className="font-semibold mb-3">Aanwezigheid</h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-green-50 rounded-lg p-3">
                                <div className="text-2xl font-bold text-green-600">
                                    {attendanceSummary.byStatus?.attending || 0}
                                </div>
                                <div className="text-sm text-gray-600">Aanwezig</div>
                            </div>
                            <div className="bg-red-50 rounded-lg p-3">
                                <div className="text-2xl font-bold text-red-600">
                                    {attendanceSummary.byStatus?.not_attending || 0}
                                </div>
                                <div className="text-sm text-gray-600">Afwezig</div>
                            </div>
                            <div className="bg-yellow-50 rounded-lg p-3">
                                <div className="text-2xl font-bold text-yellow-600">
                                    {attendanceSummary.byStatus?.maybe || 0}
                                </div>
                                <div className="text-sm text-gray-600">Misschien</div>
                            </div>
                        </div>

                        {attendanceSummary.transport && (
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                <div className="text-sm text-gray-600">Vervoer</div>
                                <div className="flex justify-between mt-1">
                                    <span>Zoekt vervoer: {attendanceSummary.transport.needsTransport}</span>
                                    <span>Beschikbare plekken: {attendanceSummary.transport.availableSeats}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {event.attendance && event.attendance.length > 0 && (
                    <div>
                        <h3 className="font-semibold mb-3">Leden</h3>
                        <div className="max-h-64 overflow-y-auto space-y-2">
                            {event.attendance.map(att => (
                                <div key={att.id} className="flex items-center justify-between text-sm py-1 border-b">
                                    <span>{att.userName}</span>
                                    <span className={
                                        att.status === 'attending' ? 'text-green-600' :
                                        att.status === 'not_attending' ? 'text-red-600' :
                                        'text-yellow-600'
                                    }>
                                        {att.status === 'attending' ? 'Aanwezig' :
                                         att.status === 'not_attending' ? 'Afwezig' : 'Misschien'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function EventScheduleTab({
    eventId,
    schedule,
    onCreateItem,
    onDeleteItem,
}: {
    eventId: string;
    schedule: EventScheduleItem[];
    onCreateItem: (args: { eventId: string; data: any }) => Promise<any>;
    onDeleteItem: (args: { eventId: string; itemId: string }) => Promise<any>;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newItem, setNewItem] = useState({ title: '', startTime: '', itemType: 'general' });

    const handleAdd = async () => {
        await onCreateItem({ eventId, data: newItem });
        setNewItem({ title: '', startTime: '', itemType: 'general' });
        setShowAddForm(false);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Tijdschema</h3>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                    + Toevoegen
                </button>
            </div>

            {showAddForm && (
                <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <input
                            type="text"
                            placeholder="Titel"
                            value={newItem.title}
                            onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                            className="px-3 py-2 border rounded-lg"
                        />
                        <input
                            type="datetime-local"
                            value={newItem.startTime}
                            onChange={(e) => setNewItem(prev => ({ ...prev, startTime: e.target.value }))}
                            className="px-3 py-2 border rounded-lg"
                        />
                        <select
                            value={newItem.itemType}
                            onChange={(e) => setNewItem(prev => ({ ...prev, itemType: e.target.value }))}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="general">Algemeen</option>
                            <option value="setup">Opbouw</option>
                            <option value="soundcheck">Soundcheck</option>
                            <option value="performance">Optreden</option>
                            <option value="break">Pauze</option>
                            <option value="packdown">Afbouw</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg"
                        >
                            Opslaan
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-3 py-1.5 border text-sm rounded-lg"
                        >
                            Annuleren
                        </button>
                    </div>
                </div>
            )}

            {schedule.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Nog geen programma-items</p>
            ) : (
                <div className="space-y-2">
                    {schedule.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-4">
                                <div className="text-sm font-medium w-16">
                                    {new Date(item.startTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div>
                                    <div className="font-medium">{item.title}</div>
                                    {item.description && <div className="text-sm text-gray-500">{item.description}</div>}
                                </div>
                            </div>
                            <button
                                onClick={() => onDeleteItem({ eventId, itemId: item.id })}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                                <Icon name="trash" className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function EventTransportTab({
    eventId,
    transport,
    meetingPoints,
    onDeleteTransport,
    onDeleteMeetingPoint,
}: {
    eventId: string;
    transport: EventTransport[];
    meetingPoints: EventMeetingPoint[];
    onDeleteTransport: (args: { eventId: string; transportId: string }) => Promise<any>;
    onDeleteMeetingPoint: (args: { eventId: string; pointId: string }) => Promise<any>;
}) {
    void eventId; // Used for delete callbacks

    return (
        <div className="space-y-6">
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Vervoer</h3>
                    <button
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                        title="Functie binnenkort beschikbaar"
                    >
                        + Vervoer toevoegen
                    </button>
                </div>

                {transport.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nog geen vervoer geregeld</p>
                ) : (
                    <div className="grid gap-4">
                        {transport.map(t => (
                            <div key={t.id} className="border rounded-lg p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 font-medium">
                                            <Icon name="truck" className="w-5 h-5 text-gray-400" />
                                            {t.vehicleDescription || t.transportType}
                                        </div>
                                        {t.driverName && (
                                            <div className="text-sm text-gray-600 mt-1">
                                                Chauffeur: {t.driverName}
                                                {t.driverPhone && ` (${t.driverPhone})`}
                                            </div>
                                        )}
                                        {t.departureTime && (
                                            <div className="text-sm text-gray-600">
                                                Vertrek: {new Date(t.departureTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                                {t.departureLocation && ` - ${t.departureLocation}`}
                                            </div>
                                        )}
                                        {t.capacity && (
                                            <div className="text-sm text-gray-600">
                                                Capaciteit: {t.passengers?.length || 0}/{t.capacity}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onDeleteTransport({ eventId, transportId: t.id })}
                                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                                    >
                                        <Icon name="trash" className="w-4 h-4" />
                                    </button>
                                </div>
                                {t.passengers && t.passengers.length > 0 && (
                                    <div className="mt-3 pt-3 border-t">
                                        <div className="text-sm font-medium mb-2">Passagiers:</div>
                                        <div className="flex flex-wrap gap-2">
                                            {t.passengers.map(p => (
                                                <span key={p.id} className="px-2 py-1 bg-gray-100 rounded text-sm">
                                                    {p.passengerName}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Verzamelpunten</h3>
                    <button
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                        title="Functie binnenkort beschikbaar"
                    >
                        + Verzamelpunt
                    </button>
                </div>

                {meetingPoints.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nog geen verzamelpunten</p>
                ) : (
                    <div className="space-y-2">
                        {meetingPoints.map(point => (
                            <div key={point.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center gap-3">
                                    <Icon name="mapPin" className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <div className="font-medium">{point.name}</div>
                                        <div className="text-sm text-gray-500">
                                            {new Date(point.meetingTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                            {point.address && ` - ${point.address}`}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onDeleteMeetingPoint({ eventId, pointId: point.id })}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                                >
                                    <Icon name="trash" className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function EventPackingTab({
    eventId,
    packingLists,
    templates,
    onCreateList,
}: {
    eventId: string;
    packingLists: EventPackingList[];
    templates: any[];
    onCreateList: (args: { eventId: string; data: any }) => Promise<any>;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newList, setNewList] = useState({ name: '', templateId: '' });

    const handleAdd = async () => {
        await onCreateList({
            eventId,
            data: {
                name: newList.name,
                templateId: newList.templateId || undefined,
            },
        });
        setNewList({ name: '', templateId: '' });
        setShowAddForm(false);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Paklijsten</h3>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                    + Paklijst
                </button>
            </div>

            {showAddForm && (
                <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <input
                            type="text"
                            placeholder="Naam paklijst"
                            value={newList.name}
                            onChange={(e) => setNewList(prev => ({ ...prev, name: e.target.value }))}
                            className="px-3 py-2 border rounded-lg"
                        />
                        <select
                            value={newList.templateId}
                            onChange={(e) => setNewList(prev => ({ ...prev, templateId: e.target.value }))}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="">-- Geen template --</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            disabled={!newList.name}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
                        >
                            Aanmaken
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-3 py-1.5 border text-sm rounded-lg"
                        >
                            Annuleren
                        </button>
                    </div>
                </div>
            )}

            {packingLists.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Nog geen paklijsten</p>
            ) : (
                <div className="grid gap-4">
                    {packingLists.map(list => (
                        <div key={list.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-medium">{list.name}</h4>
                                    <p className="text-sm text-gray-500">
                                        {list.packedItems} / {list.totalItems} ingepakt
                                    </p>
                                </div>
                                <span className="text-lg font-bold text-blue-600">{list.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all"
                                    style={{ width: `${list.progress}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function EventWeatherTab({
    event,
    weather,
}: {
    event: Event;
    weather: any;
}) {
    if (!event.weatherSensitive) {
        return (
            <div className="text-center py-8 text-gray-500">
                <Icon name="cloud" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Dit evenement is niet als weergevoelig gemarkeerd.</p>
                <p className="text-sm mt-2">Bewerk het evenement om weersvoorspellingen in te schakelen.</p>
            </div>
        );
    }

    if (!weather?.forecasts || weather.forecasts.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <Icon name="cloud" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Geen weersvoorspelling beschikbaar.</p>
                <p className="text-sm mt-2">Zorg dat het evenement coördinaten heeft ingesteld.</p>
            </div>
        );
    }

    return (
        <div>
            <h3 className="font-semibold mb-4">Weersvoorspelling</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {weather.forecasts.map((forecast: any) => (
                    <div key={forecast.id} className="border rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-2">
                            {new Date(forecast.forecastDate).toLocaleDateString('nl-NL', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                            })}
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-3xl font-bold">
                                {forecast.temperatureC}°
                            </div>
                            <div className="text-sm text-gray-600">
                                {forecast.weatherDescription}
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>Wind: {forecast.windSpeedKmh} km/u</div>
                            <div>Neerslag: {forecast.precipitationProbability}%</div>
                        </div>
                        {forecast.alertMessage && (
                            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                                {forecast.alertMessage}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
