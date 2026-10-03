import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTweestapStand, zetTweestapStand, type TweestapStand } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { foutmelding } from './foutmelding';

const STANDEN: TweestapStand[] = ['uit', 'beheer', 'iedereen'];

/**
 * Tweestapsverificatie verplicht stellen voor de vereniging.
 *
 * Wie moet en het nog niet heeft, komt na het inloggen eerst op zijn profiel
 * om het in te stellen. Aanzetten kan alleen wie het zelf al heeft; dat zegt
 * deze sectie vooraf, de server controleert het.
 */
export function TweestapSectie() {
  const { t } = useTranslation();
  const [stand, setStand] = useState<TweestapStand | null>(null);
  const [zelfAan, setZelfAan] = useState(false);
  const [gekozen, setGekozen] = useState<TweestapStand>('uit');
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actief = true;
    getTweestapStand()
      .then((opgehaald) => {
        if (!actief) return;
        setStand(opgehaald.stand);
        setGekozen(opgehaald.stand);
        setZelfAan(opgehaald.zelfAan);
      })
      .catch(() => {
        if (actief) showError(t('settings.tweestap.laadFout'));
      });
    return () => {
      actief = false;
    };
    // Eén keer ophalen bij het openen; `t` hoort daar niet bij, anders haalt
    // elke nieuwe vertaalfunctie de stand opnieuw op en wist hij de keuze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    try {
      await zetTweestapStand(gekozen);
      setStand(gekozen);
      showSuccess(t('settings.saved'));
    } catch (fout) {
      showError(foutmelding(fout, t('settings.errorSaving')));
    } finally {
      setBezig(false);
    }
  };

  const zelfNogNiet = !zelfAan && gekozen !== 'uit';

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('settings.tweestap.titel')}</h2>
      </div>
      <div className="card-body">
        <p className="piece-meta mb-3">{t('settings.tweestap.uitleg')}</p>
        <form onSubmit={opslaan}>
          <fieldset className="form-group" disabled={stand === null}>
            <legend className="form-label">{t('settings.tweestap.wie')}</legend>
            {STANDEN.map((waarde) => (
              <label key={waarde} className="d-block">
                <input
                  type="radio"
                  name="tweestap"
                  value={waarde}
                  checked={gekozen === waarde}
                  onChange={() => setGekozen(waarde)}
                />{' '}
                {t(`settings.tweestap.stand.${waarde}`)}
              </label>
            ))}
          </fieldset>
          {zelfNogNiet && (
            <div className="alert alert-warning mb-2" role="alert">
              {t('settings.tweestap.eerstZelf')}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={bezig || stand === null || gekozen === stand || zelfNogNiet}
          >
            {bezig ? t('common.loading') : t('common.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
