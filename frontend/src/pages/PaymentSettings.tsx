import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPaymentSettings,
  updatePaymentSettings,
  updatePaymentMethodFee,
  connectMollie,
  disconnectMollie,
  getMollieStatus,
  testMollieConnection,
} from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { SkeletonTable } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ideal: 'iDEAL',
  creditcard: 'Creditcard',
  bancontact: 'Bancontact',
  paypal: 'PayPal',
  applepay: 'Apple Pay',
  googlepay: 'Google Pay',
  banktransfer: 'Bank Transfer',
};

export default function PaymentSettings() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.paymentSettings');

  const queryClient = useQueryClient();

  // State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [editingFee, setEditingFee] = useState<{ method: string; customerFee: number } | null>(null);

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['paymentSettings'],
    queryFn: getPaymentSettings,
  });

  // Fetch Mollie status
  const { data: mollieStatus } = useQuery({
    queryKey: ['mollieStatus'],
    queryFn: getMollieStatus,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  // Mutations
  const connectMutation = useMutation({
    mutationFn: (key: string) => connectMollie(key),
    onSuccess: (data) => {
      showSuccess(t('paymentSettings.connectSuccess', { name: data.organisationName }));
      setShowConnectModal(false);
      setApiKey('');
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectMollie,
    onSuccess: () => {
      showSuccess(t('paymentSettings.disconnectSuccess'));
      setShowDisconnectConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updatePaymentSettings,
    onSuccess: () => {
      showSuccess(t('common.saved'));
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateFeeMutation = useMutation({
    mutationFn: ({ method, fee }: { method: string; fee: { customerFee: number; isEnabled?: boolean } }) =>
      updatePaymentMethodFee(method, fee),
    onSuccess: () => {
      showSuccess(t('common.saved'));
      setEditingFee(null);
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const testConnectionMutation = useMutation({
    mutationFn: testMollieConnection,
    onSuccess: (data) => {
      if (data.connected) {
        showSuccess(t('paymentSettings.connectionOk'));
      } else {
        showError(data.error || t('paymentSettings.connectionFailed'));
      }
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('paymentSettings.title')}</h1>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={5} columns={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>{t('paymentSettings.title')}</h1>

      {/* Mollie Status Card */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 style={{ margin: 0 }}>Mollie</h3>
              <a
                href="https://status.mollie.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--primary)' }}
              >
                Status: {mollieStatus?.operational ? (
                  <span style={{ color: 'var(--success)' }}>{mollieStatus?.statusDescription || 'Operational'}</span>
                ) : (
                  <span style={{ color: 'var(--warning)' }}>{mollieStatus?.statusDescription || 'Issues detected'}</span>
                )}
              </a>
            </div>
            {settings?.isConnected ? (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => testConnectionMutation.mutate()}
                disabled={testConnectionMutation.isPending}
              >
                {testConnectionMutation.isPending ? t('common.loading') : t('paymentSettings.testConnection')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowConnectModal(true)}>
                {t('paymentSettings.connect')}
              </button>
            )}
          </div>

          {settings?.isConnected ? (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>Mollie ID</div>
                  <div style={{ fontFamily: 'monospace' }}>{settings.profileId}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('paymentSettings.connectedSince')}</div>
                  <div>
                    {settings.connectedAt
                      ? new Date(settings.connectedAt).toLocaleDateString('nl-NL')
                      : '-'}
                  </div>
                </div>
              </div>

              <div
                className="card mb-3"
                style={{
                  backgroundColor: 'var(--success-light, #e8f5e9)',
                  border: '1px solid var(--success)',
                  padding: '1rem',
                }}
              >
                <div style={{ color: 'var(--success)', fontWeight: 500 }}>
                  {t('paymentSettings.connectedMessage')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-center gap-2">
                  {settings.canReceivePayments ? (
                    <span style={{ color: 'var(--success)', fontSize: '1.25rem' }}>&#10003;</span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontSize: '1.25rem' }}>&#10007;</span>
                  )}
                  <span>{t('paymentSettings.canReceivePayments')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {settings.canReceivePayouts ? (
                    <span style={{ color: 'var(--success)', fontSize: '1.25rem' }}>&#10003;</span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontSize: '1.25rem' }}>&#10007;</span>
                  )}
                  <span>{t('paymentSettings.canReceivePayouts')}</span>
                </div>
              </div>

              <button
                className="btn btn-outline"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => setShowDisconnectConfirm(true)}
              >
                {t('paymentSettings.disconnect')}
              </button>
            </div>
          ) : (
            <div
              className="card"
              style={{
                backgroundColor: 'var(--warning-light, #fff3e0)',
                border: '1px solid var(--warning)',
                padding: '1rem',
              }}
            >
              <div style={{ color: 'var(--warning-dark, #e65100)' }}>
                {t('paymentSettings.notConnected')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Method Fees */}
      {settings?.isConnected && (
        <div className="card mb-3">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('paymentSettings.feesOverview')}</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('paymentSettings.paymentMethod')}</th>
                  <th>{t('paymentSettings.providerFee')}</th>
                  <th>{t('paymentSettings.customerFee')}</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {settings.fees.map((fee) => (
                  <tr key={fee.method} style={{ opacity: fee.isEnabled ? 1 : 0.5 }}>
                    <td>
                      <strong>{PAYMENT_METHOD_LABELS[fee.method] || fee.method}</strong>
                    </td>
                    <td>{formatCurrency(fee.providerFee)}</td>
                    <td>
                      {editingFee?.method === fee.method ? (
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="form-control"
                            style={{ width: '100px' }}
                            value={editingFee.customerFee}
                            onChange={(e) =>
                              setEditingFee({ ...editingFee, customerFee: parseFloat(e.target.value) || 0 })
                            }
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() =>
                              updateFeeMutation.mutate({
                                method: fee.method,
                                fee: { customerFee: editingFee.customerFee },
                              })
                            }
                            disabled={updateFeeMutation.isPending}
                          >
                            &#10003;
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingFee(null)}>
                            &#10007;
                          </button>
                        </div>
                      ) : (
                        formatCurrency(fee.customerFee)
                      )}
                    </td>
                    <td>
                      {editingFee?.method !== fee.method && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingFee({ method: fee.method, customerFee: fee.customerFee })}
                        >
                          &#9998;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pass Fees to Customer */}
      {settings?.isConnected && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('paymentSettings.feeSettings')}</h3>
            <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.passFeesToCustomer}
                onChange={(e) => updateSettingsMutation.mutate({ passFeesToCustomer: e.target.checked })}
                disabled={updateSettingsMutation.isPending}
              />
              <span>{t('paymentSettings.passFeesToCustomer')}</span>
            </label>
            <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {t('paymentSettings.passFeesToCustomerHelp')}
            </p>
          </div>
        </div>
      )}

      {/* Connect Mollie Modal */}
      {showConnectModal && (
        <Modal onClose={() => setShowConnectModal(false)} title={t('paymentSettings.connectMollie')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connectMutation.mutate(apiKey);
            }}
          >
            <div className="form-group">
              <label className="form-label">{t('paymentSettings.apiKey')}</label>
              <input
                type="password"
                className="form-control"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="live_xxxxxxxxxxxxxxxxxx"
                required
              />
              <small style={{ color: 'var(--text-light)' }}>{t('paymentSettings.apiKeyHelp')}</small>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn btn-outline" onClick={() => setShowConnectModal(false)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? t('common.loading') : t('paymentSettings.connect')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Disconnect Confirm Modal */}
      {showDisconnectConfirm && (
        <Modal onClose={() => setShowDisconnectConfirm(false)} title={t('paymentSettings.disconnectConfirmTitle')}>
          <p>{t('paymentSettings.disconnectConfirmMessage')}</p>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn btn-outline" onClick={() => setShowDisconnectConfirm(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? t('common.loading') : t('paymentSettings.disconnect')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
