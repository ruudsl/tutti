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
    setForm(prev => ({ ...prev, ...updates }));
  }, []);

  const updateDefaultForm = useCallback((updates: Partial<DefaultRehearsalFormData>) => {
    setDefaultForm(prev => ({ ...prev, ...updates }));
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
    setPieces(prev => [...prev, { title: '', notes: '' }]);
  }, []);

  const removePiece = useCallback((index: number) => {
    setPieces(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updatePiece = useCallback((index: number, updates: Partial<{ title: string; notes: string }>) => {
    setPieces(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
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
