/**
 * De kaart "Extra velden" bij een repetitie.
 *
 * De kaart stond er altijd, ook als de vereniging geen extra velden voor
 * repetities heeft: een kop boven een leeg vlak. Nu staat hij er alleen als er
 * iets in komt: voor de beheerder als er velden zijn om in te vullen, voor een
 * lid als er een veld een waarde heeft.
 *
 * De vraag is dezelfde als die van de velden zelf (zelfde sleutel), dus de
 * server krijgt hem maar één keer.
 */

import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getFieldValues } from '../../api/custom-fields';
import { CustomFieldFormSection, CustomFieldRenderer } from '../../components/CustomFields';

export function ExtraVeldenKaart({ rehearsalId, isManager }: { rehearsalId: string; isManager: boolean }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['custom-field-values', 'rehearsal', rehearsalId],
    queryFn: () => getFieldValues('rehearsal', rehearsalId),
    enabled: !!rehearsalId,
  });

  const heeftVelden = Object.keys(data?.meta ?? {}).length > 0;
  const heeftWaarden = Object.values(data?.values ?? {}).some((w) => w !== null && w !== undefined && w !== '');
  if (isManager ? !heeftVelden : !heeftWaarden) return null;

  return (
    <div className="card mt-3">
      <div className="card-header">
        <h2 className="card-title">{t('customFields.additionalFields')}</h2>
      </div>
      <div className="card-body">
        {isManager ? (
          <CustomFieldFormSection entityType="rehearsal" entityId={rehearsalId} autoSave={true} />
        ) : (
          <CustomFieldRenderer entityType="rehearsal" entityId={rehearsalId} layout="horizontal" />
        )}
      </div>
    </div>
  );
}
