import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAcceptInvitation, useInvitationDetails } from '../hooks/useMultiAssociation';
import { getErrorMessage } from '../utils/errors';
import { currentLocale } from '../utils/locale';

/**
 * De link uit een uitnodigingsmail: /invite/<token>.
 *
 * Werkt zonder inloggen - dan toont hij voor welke vereniging de uitnodiging
 * is en stuurt hij naar het inlogscherm, met de weg terug hierheen. Aannemen
 * kan alleen wie is ingelogd met het e-mailadres van de uitnodiging; dat
 * controleert de server, deze pagina zegt het alleen vooraf.
 */
export default function UitnodigingAannemen() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.uitnodiging');
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: uitnodiging, isLoading, isError } = useInvitationDetails(token);
  const aannemen = useAcceptInvitation();
  const [aangenomen, setAangenomen] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const terugHierheen = { terug: `/invite/${token}` };

  const neemAan = async () => {
    setFout(null);
    try {
      await aannemen.mutateAsync(token!);
      setAangenomen(true);
    } catch (e) {
      setFout(getErrorMessage(e));
    }
  };

  const wisselAccount = () => {
    logout();
    navigate('/login', { state: terugHierheen });
  };

  let inhoud;
  if (isLoading) {
    inhoud = <p role="status">{t('common.loading')}</p>;
  } else if (isError || !uitnodiging) {
    inhoud = (
      <>
        <p>{t('uitnodiging.nietGevonden')}</p>
        <Link to="/" className="btn btn-primary">
          {t('uitnodiging.naarDashboard')}
        </Link>
      </>
    );
  } else if (aangenomen) {
    inhoud = (
      <>
        <p role="status">{t('uitnodiging.gelukt', { vereniging: uitnodiging.associationName })}</p>
        <Link to="/" className="btn btn-primary">
          {t('uitnodiging.naarDashboard')}
        </Link>
      </>
    );
  } else {
    const voorMij = user?.email?.toLowerCase() === uitnodiging.email.toLowerCase();
    inhoud = (
      <>
        <p>
          {t('uitnodiging.tekst', {
            vereniging: uitnodiging.associationName,
            rol: t(`multiAssociation.roles.${uitnodiging.role}`),
          })}
        </p>
        <p className="text-muted">
          {t('uitnodiging.voorEmail', { email: uitnodiging.email })}{' '}
          {t('uitnodiging.geldigTot', {
            datum: new Date(uitnodiging.expiresAt).toLocaleDateString(currentLocale(), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
          })}
        </p>
        {fout && (
          <div className="alert alert-error mb-3" role="alert">
            {fout}
          </div>
        )}
        {!user ? (
          <>
            <button className="btn btn-primary" onClick={() => navigate('/login', { state: terugHierheen })}>
              {t('uitnodiging.inloggen')}
            </button>
            <p className="text-muted mt-3">{t('uitnodiging.geenAccount')}</p>
          </>
        ) : voorMij ? (
          <button className="btn btn-primary" onClick={neemAan} disabled={aannemen.isPending}>
            {t('uitnodiging.aannemen')}
          </button>
        ) : (
          <>
            <p className="alert alert-warning">
              {t('uitnodiging.anderAccount', { huidig: user.email, email: uitnodiging.email })}
            </p>
            <button className="btn btn-outline" onClick={wisselAccount}>
              {t('uitnodiging.anderAccountInloggen')}
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
        <div className="card-body">
          <h1>{t('pageTitle.uitnodiging')}</h1>
          {inhoud}
        </div>
      </div>
    </div>
  );
}
