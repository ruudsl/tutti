/**
 * Aan- en afmelden voor een repetitie, zonder de repetitie te openen.
 *
 * Bij het doorlopen van de app als lid bleek aanmelden slecht te vinden: de
 * knoppen stonden alleen in het detailscherm, en dat opent pas als je op de
 * regel klikt. Nergens stond ook of je al gereageerd had. Deze twee knoppen
 * staan nu in de lijst met repetities en in het dashboardvak "Komende
 * repetities", met de eigen status (`my_status` uit de API) als beginstand.
 *
 * De knoppen zitten in een aanklikbare regel. Een klik of Enter op een knop
 * mag die regel niet openen; daarom stopt de groep het doorgeven.
 */

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMyAttendance } from '../api/spond';
import { getErrorMessage } from '../utils/errorHandling';
import { showError } from '../utils/toast';
import { Icon } from './Icon';

type Stand = 'accepted' | 'declined' | null;

export function MijnAanmelding({ rehearsalId, status }: { rehearsalId: string; status?: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stand, setStand] = useState<Stand>(alsStand(status));

  useEffect(() => setStand(alsStand(status)), [status]);

  const mutatie = useMutation({
    mutationFn: (aanwezig: boolean) => updateMyAttendance(rehearsalId, aanwezig),
    onMutate: (aanwezig) => {
      const vorige = stand;
      setStand(aanwezig ? 'accepted' : 'declined');
      return { vorige };
    },
    onError: (fout, _aanwezig, context) => {
      setStand(context?.vorige ?? null);
      showError(getErrorMessage(fout, t('common.error')));
    },
    onSuccess: (antwoord) => setStand(alsStand(antwoord.status)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
      void queryClient.invalidateQueries({ queryKey: ['upcoming-rehearsals'] });
    },
  });

  const houdVast = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="mijn-aanmelding"
      role="group"
      aria-label={t('rehearsals.attendance.myAttendance')}
      onClick={houdVast}
      onKeyDown={houdVast}
      style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}
    >
      <button
        type="button"
        className={`btn btn-sm ${stand === 'accepted' ? 'btn-success' : 'btn-outline'}`}
        aria-pressed={stand === 'accepted'}
        disabled={mutatie.isPending}
        onClick={() => stand !== 'accepted' && mutatie.mutate(true)}
      >
        <Icon name="check" size={14} /> {t('rehearsals.attendance.accept')}
      </button>
      <button
        type="button"
        className={`btn btn-sm ${stand === 'declined' ? 'btn-danger' : 'btn-outline'}`}
        aria-pressed={stand === 'declined'}
        disabled={mutatie.isPending}
        onClick={() => stand !== 'declined' && mutatie.mutate(false)}
      >
        <Icon name="close" size={14} /> {t('rehearsals.attendance.decline')}
      </button>
    </div>
  );
}

function alsStand(status: string | null | undefined): Stand {
  return status === 'accepted' || status === 'declined' ? status : null;
}
