/**
 * De startlijst en de e-mailwaarschuwing op het dashboard van de beheerder.
 *
 * Gevonden bij het doorlopen van de app als nieuwe beheerder: het dashboard
 * was leeg en zei niet wat er nog moest, en zonder ingestelde SMTP verstuurde
 * Tutti niets - terwijl "Wachtwoord vergeten" de gebruiker gewoon "E-mail
 * verzonden" liet zien. De server leest per stap af of hij gedaan is
 * (backend/src/services/startlijst.ts); hier staat hij als lijst met een
 * knop naar de plek waar je het regelt.
 *
 * De lijst verdwijnt als alles gedaan is, of als de beheerder hem verbergt.
 * De e-mailwaarschuwing blijft staan zolang er geen SMTP is: die is niet weg
 * te klikken, want het probleem gaat er niet van weg.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getStartlijst, type StartStap } from '../api/settings';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';

/** Waar je elke stap regelt. De tweestapsverificatie staat op het dashboard zelf. */
const PLEK: Record<StartStap, string> = {
  email: '/settings',
  tweestap: '#accountbeveiliging',
  modules: '/modules',
  orkesten: '/orchestras',
  leden: '/users',
  repetities: '/rehearsals',
  bewaartermijnen: '/gdpr-admin',
};

const sleutelVoorVerbergen = (userId: string, associationId: string | null) =>
  `startlijst_verborgen_${userId}_${associationId ?? ''}`;

function leesVerborgen(sleutel: string): boolean {
  try {
    return localStorage.getItem(sleutel) === 'true';
  } catch {
    return false;
  }
}

export default function Startlijst() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const opslag = sleutelVoorVerbergen(user?.id ?? '', user?.associationId ?? null);
  const [verborgen, setVerborgen] = useState(() => leesVerborgen(opslag));
  const { data } = useQuery({ queryKey: ['startlijst'], queryFn: getStartlijst });

  if (!data) return null;
  const stappen = data.stappen;
  const gedaan = stappen.filter((s) => s.gedaan).length;
  const geenMail = stappen.some((s) => s.sleutel === 'email' && !s.gedaan);
  const toonLijst = !verborgen && gedaan < stappen.length;

  const verberg = () => {
    setVerborgen(true);
    try {
      localStorage.setItem(opslag, 'true');
    } catch {
      // Zonder opslag verdwijnt hij alleen tot de volgende keer.
    }
  };

  return (
    <>
      {geenMail && (
        <div className="alert alert-warning mb-3" role="alert">
          <strong>{t('startlijst.geenMail.titel')}</strong> {t('startlijst.geenMail.tekst')}{' '}
          <Link to="/settings">{t('startlijst.geenMail.instellen')}</Link>
        </div>
      )}
      {toonLijst && (
        <section className="card mb-3" aria-labelledby="startlijst-kop">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <h2 className="card-title" id="startlijst-kop">
              {t('startlijst.titel')}
            </h2>
            <span className="text-light text-sm">{t('startlijst.voortgang', { gedaan, totaal: stappen.length })}</span>
          </div>
          <div className="card-body">
            <p className="text-light text-sm mb-2">{t('startlijst.uitleg')}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
              {stappen.map((stap) => (
                <li key={stap.sleutel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    aria-hidden="true"
                    style={{ color: stap.gedaan ? 'var(--success)' : 'var(--text-light)', display: 'inline-flex' }}
                  >
                    <Icon name={stap.gedaan ? 'check' : 'clock'} size={16} />
                  </span>
                  <span style={{ flex: 1, textDecoration: stap.gedaan ? 'line-through' : undefined }}>
                    {t(`startlijst.stap.${stap.sleutel}`)}
                    <span className="sr-only">
                      {' '}
                      ({stap.gedaan ? t('startlijst.gedaan') : t('startlijst.nogTeDoen')})
                    </span>
                  </span>
                  {!stap.gedaan &&
                    (PLEK[stap.sleutel].startsWith('#') ? (
                      <a href={PLEK[stap.sleutel]} className="btn btn-outline btn-sm">
                        {t('startlijst.regelen')}
                      </a>
                    ) : (
                      <Link to={PLEK[stap.sleutel]} className="btn btn-outline btn-sm">
                        {t('startlijst.regelen')}
                      </Link>
                    ))}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={verberg}>
              {t('startlijst.verbergen')}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
