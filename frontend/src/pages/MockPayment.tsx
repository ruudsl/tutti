import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { mockPayment } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function MockPayment() {
  const { t } = useTranslation();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<'success' | 'cancelled' | null>(null);
  useDocumentTitle('tickets.stepPayment');

  const payMutation = useMutation({
    mutationFn: (action: 'pay' | 'cancel') => mockPayment(orderId!, action),
    onSuccess: (_, action) => {
      setProcessing(false);
      setResult(action === 'pay' ? 'success' : 'cancelled');
    },
    onError: () => {
      setProcessing(false);
    },
  });

  const handlePay = () => {
    setProcessing(true);
    payMutation.mutate('pay');
  };

  const handleCancel = () => {
    setProcessing(true);
    payMutation.mutate('cancel');
  };

  if (result === 'success') {
    return (
      <div className="mock-payment-page">
        <div className="mock-payment-container">
          <div className="result-card success">
            <div className="icon">&#10003;</div>
            <h2>{t('tickets.paymentSuccess')}</h2>
            <p>{t('tickets.confirmationSent', { email: 'je e-mailadres' })}</p>
            <button className="btn btn-primary" onClick={() => navigate('/my-tickets')}>
              {t('tickets.myTickets')}
            </button>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (result === 'cancelled') {
    return (
      <div className="mock-payment-page">
        <div className="mock-payment-container">
          <div className="result-card cancelled">
            <div className="icon">&#10005;</div>
            <h2>{t('common.cancel')}</h2>
            <p>De betaling is geannuleerd.</p>
            <button className="btn btn-outline" onClick={() => navigate('/')}>
              {t('common.back')}
            </button>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="mock-payment-page">
      <div className="mock-payment-container">
        <div className="payment-card">
          <div className="dev-banner">DEVELOPMENT MODE - Mock Payment</div>

          <h2>{t('tickets.selectPaymentMethod')}</h2>

          <div className="order-info">
            <p>
              <strong>Order ID:</strong> {orderId}
            </p>
          </div>

          <div className="payment-options">
            <button className="btn btn-primary btn-large" onClick={handlePay} disabled={processing}>
              {processing ? t('common.loading') : 'Betaling Simuleren (Succes)'}
            </button>

            <button className="btn btn-outline" onClick={handleCancel} disabled={processing}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .mock-payment-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
  }

  .mock-payment-container {
    width: 100%;
    max-width: 480px;
  }

  .payment-card, .result-card {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .dev-banner {
    background: #ff9800;
    color: white;
    text-align: center;
    padding: 0.5rem;
    margin: -2rem -2rem 1.5rem -2rem;
    border-radius: 12px 12px 0 0;
    font-weight: bold;
    font-size: 0.875rem;
  }

  .payment-card h2 {
    margin: 0 0 1.5rem 0;
    text-align: center;
  }

  .order-info {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
  }

  .order-info p {
    margin: 0;
    word-break: break-all;
  }

  .payment-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .btn-large {
    padding: 1rem 2rem;
    font-size: 1.125rem;
  }

  .result-card {
    text-align: center;
  }

  .result-card .icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .result-card.success .icon {
    color: #4caf50;
  }

  .result-card.cancelled .icon {
    color: #f44336;
  }

  .result-card h2 {
    margin: 0 0 0.5rem 0;
  }

  .result-card p {
    color: #666;
    margin: 0 0 1.5rem 0;
  }
`;
