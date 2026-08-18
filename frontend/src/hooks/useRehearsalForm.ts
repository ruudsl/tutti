import { useState, useCallback } from 'react';

export interface RehearsalFormData {
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  type: 'regular' | 'extra' | 'cancelled';
  notes: string;
  orchestraId: string;
}

export interface DefaultRehearsalFormData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
  orchestraId: string;
}

const initialFormData: RehearsalFormData = {
  date: '',
  startTime: '19:30',
  endTime: '21:30',
  location: '',
  type: 'regular',
  notes: '',
  orchestraId: '',
};

const initialDefaultFormData: DefaultRehearsalFormData = {
  dayOfWeek: 1,
  startTime: '19:30',
  endTime: '21:30',
  location: '',
  orchestraId: '',
};

/**
 * @description Hook for managing rehearsal form state including create, edit, and generate modes.
 * Handles form visibility, editing state, and form data for rehearsal management.
 *
 * @returns {Object} Form state and controls
 * @returns {boolean} returns.showForm - Whether the main form is visible
 * @returns {Function} returns.setShowForm - Set form visibility
 * @returns {string | null} returns.editingId - ID of rehearsal being edited, or null for new
 * @returns {RehearsalFormData} returns.form - Current form data
 * @returns {Function} returns.openNewForm - Open form for creating new rehearsal
 * @returns {Function} returns.openEditForm - Open form for editing existing rehearsal
 * @returns {Function} returns.closeForm - Close form and reset state
 * @returns {Function} returns.updateForm - Update form fields
 * @returns {boolean} returns.showDefaultForm - Whether default day form is visible
 * @returns {DefaultRehearsalFormData} returns.defaultForm - Default rehearsal day settings
 * @returns {Function} returns.updateDefaultForm - Update default form fields
 * @returns {boolean} returns.showGenerate - Whether generate dialog is visible
 * @returns {string} returns.genFrom - Generate date range start
 * @returns {string} returns.genTo - Generate date range end
 *
 * @example
 * ```tsx
 * function RehearsalManager() {
 *   const {
 *     showForm, form, editingId,
 *     openNewForm, openEditForm, closeForm, updateForm
 *   } = useRehearsalForm();
 *
 *   return (
 *     <div>
 *       <button onClick={openNewForm}>New Rehearsal</button>
 *       {showForm && (
 *         <RehearsalDialog
 *           data={form}
 *           isEditing={!!editingId}
 *           onChange={updateForm}
 *           onClose={closeForm}
 *         />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRehearsalForm() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RehearsalFormData>(initialFormData);

  const [showDefaultForm, setShowDefaultForm] = useState(false);
  const [defaultForm, setDefaultForm] = useState<DefaultRehearsalFormData>(initialDefaultFormData);

  const [showGenerate, setShowGenerate] = useState(false);
  const [genFrom, setGenFrom] = useState('');
  const [genTo, setGenTo] = useState('');

  const openNewForm = useCallback(() => {
    setForm(initialFormData);
    setEditingId(null);
    setShowForm(true);
  }, []);

  const openEditForm = useCallback((rehearsal: RehearsalFormData & { id: string }) => {
    setForm({
      date: rehearsal.date,
      startTime: rehearsal.startTime,
      endTime: rehearsal.endTime,
      location: rehearsal.location,
      type: rehearsal.type,
      notes: rehearsal.notes,
      orchestraId: rehearsal.orchestraId,
    });
    setEditingId(rehearsal.id);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialFormData);
  }, []);

  const updateForm = useCallback((updates: Partial<RehearsalFormData>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateDefaultForm = useCallback((updates: Partial<DefaultRehearsalFormData>) => {
    setDefaultForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetGenerate = useCallback(() => {
    setGenFrom('');
    setGenTo('');
    setShowGenerate(false);
  }, []);

  return {
    // Main form
    showForm,
    setShowForm,
    editingId,
    form,
    openNewForm,
    openEditForm,
    closeForm,
    updateForm,

    // Default day form
    showDefaultForm,
    setShowDefaultForm,
    defaultForm,
    updateDefaultForm,
    resetDefaultForm: () => setDefaultForm(initialDefaultFormData),

    // Generate form
    showGenerate,
    setShowGenerate,
    genFrom,
    setGenFrom,
    genTo,
    setGenTo,
    resetGenerate,
  };
}

/**
 * @description Hook for managing the list of music pieces associated with a rehearsal.
 * Provides CRUD operations for adding, removing, and updating pieces.
 *
 * @returns {Object} Pieces editor state and controls
 * @returns {boolean} returns.editingPieces - Whether pieces editor is active
 * @returns {Array<{title: string, notes: string}>} returns.pieces - List of pieces
 * @returns {Function} returns.startEditingPieces - Begin editing with initial pieces
 * @returns {Function} returns.stopEditingPieces - Stop editing and clear state
 * @returns {Function} returns.addPiece - Add a new empty piece
 * @returns {Function} returns.removePiece - Remove piece at index
 * @returns {Function} returns.updatePiece - Update piece at index
 *
 * @example
 * ```tsx
 * function PiecesEditor({ rehearsalPieces }: { rehearsalPieces: Piece[] }) {
 *   const {
 *     editingPieces, pieces,
 *     startEditingPieces, stopEditingPieces, addPiece, updatePiece, removePiece
 *   } = useRehearsalPieces();
 *
 *   return editingPieces ? (
 *     <div>
 *       {pieces.map((piece, i) => (
 *         <PieceRow
 *           key={i}
 *           piece={piece}
 *           onChange={(updates) => updatePiece(i, updates)}
 *           onRemove={() => removePiece(i)}
 *         />
 *       ))}
 *       <button onClick={addPiece}>Add Piece</button>
 *       <button onClick={stopEditingPieces}>Done</button>
 *     </div>
 *   ) : (
 *     <button onClick={() => startEditingPieces(rehearsalPieces)}>Edit Pieces</button>
 *   );
 * }
 * ```
 */
export function useRehearsalPieces() {
  const [editingPieces, setEditingPieces] = useState(false);
  const [pieces, setPieces] = useState<{ title: string; notes: string }[]>([]);

  const startEditingPieces = useCallback((initialPieces: { title: string; notes: string }[]) => {
    setPieces(initialPieces);
    setEditingPieces(true);
  }, []);

  const stopEditingPieces = useCallback(() => {
    setEditingPieces(false);
    setPieces([]);
  }, []);

  const addPiece = useCallback(() => {
    setPieces((prev) => [...prev, { title: '', notes: '' }]);
  }, []);

  const removePiece = useCallback((index: number) => {
    setPieces((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updatePiece = useCallback((index: number, updates: Partial<{ title: string; notes: string }>) => {
    setPieces((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  }, []);

  return {
    editingPieces,
    pieces,
    startEditingPieces,
    stopEditingPieces,
    addPiece,
    removePiece,
    updatePiece,
  };
}
