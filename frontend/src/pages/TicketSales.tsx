import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getTicketSales, getPaymentDetails, exportTicketSalesCsv, refundOrder } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { SkeletonTable } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import type { TicketSaleOrder, PaymentDetails, Concert } from '../types';
import { useConcerts } from '../hooks/useConcerts';

export default function TicketSales() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.ticketSales');

  // Filters
  const [concertFilter, setConcertFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState<TicketSaleOrder | null>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  // Fetch concerts for filter dropdown
  const { data: concertsData } = useConcerts();
  const concerts = concertsData?.data || [];

  // Fetch ticket sales
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ticketSales', concertFilter, statusFilter, startDate, endDate, page],
    queryFn: () =>
      getTicketSales({
        concertId: concertFilter || undefined,
        status: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 25,
      }),
  });

  const orders = data?.orders || [];
  const pagination = data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };
  const summary = data?.summary || {
    totalOrders: 0,
    paidOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    refundedOrders: 0,
  };

  const handleExportCsv = async () => {
    try {
      await exportTicketSalesCsv({
        concertId: concertFilter || undefined,
        status: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      showSuccess(t('tickets.exportSuccess'));
    } catch (error) {
      showError(getErrorMessage(error));
    }
  };

  const handleViewPaymentDetails = async (order: TicketSaleOrder) => {
    setSelectedOrder(order);
    setLoadingPaymentDetails(true);
    setShowPaymentDetails(true);

    try {
      const details = await getPaymentDetails(order.id);
      setPaymentDetails(details);
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setLoadingPaymentDetails(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedOrder) return;

    setIsRefunding(true);
    try {
      await refundOrder(selectedOrder.id, refundReason);
      showSuccess(t('tickets.refundSuccess'));
      setShowRefundConfirm(false);
      setSelectedOrder(null);
      setRefundReason('');
      refetch();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setIsRefunding(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'var(--success)',
      pending: 'var(--warning)',
      cancelled: 'var(--danger)',
      refunded: 'var(--danger)',
      expired: 'var(--text-light)',
    };

    return (
      <span
        className="badge"
        style={{
          backgroundColor: colors[status] || 'var(--text-light)',
          color: 'white',
        }}
      >
        {t(`tickets.status.${status}`)}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(currentLocale(), {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <h1>{t('tickets.sales')}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={10} columns={7} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('tickets.sales')}</h1>
        <button className="btn btn-outline" onClick={handleExportCsv}>
          {t('common.exportCsv')}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('tickets.totalOrders')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{summary.totalOrders}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('tickets.paidOrders')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{summary.paidOrders}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('tickets.totalRevenue')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
              {formatCurrency(summary.totalRevenue)}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('tickets.pendingOrders')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
              {summary.pendingOrders}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="form-label">{t('tickets.concert')}</label>
              <select
                className="form-control"
                value={concertFilter}
                onChange={(e) => {
                  setConcertFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                {concerts.map((c: Concert) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t('common.status')}</label>
              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="paid">{t('tickets.status.paid')}</option>
                <option value="pending">{t('tickets.status.pending')}</option>
                <option value="cancelled">{t('tickets.status.cancelled')}</option>
                <option value="refunded">{t('tickets.status.refunded')}</option>
                <option value="expired">{t('tickets.status.expired')}</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t('common.startDate')}</label>
              <input
                type="date"
                className="form-control"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="form-label">{t('common.endDate')}</label>
              <input
                type="date"
                className="form-control"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('tickets.orderDate')}</th>
                <th>{t('tickets.concert')}</th>
                <th>{t('tickets.buyer')}</th>
                <th>{t('tickets.ticketCount')}</th>
                <th>{t('tickets.total')}</th>
                <th>{t('common.status')}</th>
                <th>{t('tickets.paymentMethod')}</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                    {t('tickets.noSalesFound')}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div>{formatDate(order.createdAt)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{order.concertName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                        {new Date(order.concertDate).toLocaleDateString(currentLocale())}
                      </div>
                    </td>
                    <td>
                      <div>{order.buyerName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{order.buyerEmail}</div>
                    </td>
                    <td>{order.ticketCount}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(order.total)}</td>
                    <td>{getStatusBadge(order.status)}</td>
                    <td>
                      {order.paymentMethod ? (
                        <span style={{ textTransform: 'capitalize' }}>{order.paymentMethod}</span>
                      ) : (
                        <span style={{ color: 'var(--text-light)' }}>-</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleViewPaymentDetails(order)}
                          title={t('tickets.viewDetails')}
                        >
                          &#128065;
                        </button>
                        {order.status === 'paid' && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowRefundConfirm(true);
                            }}
                            title={t('tickets.refund')}
                            style={{ color: 'var(--danger)' }}
                          >
                            &#8634;
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div
            className="card-body"
            style={{
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: 'var(--text-light)' }}>
              {t('common.showingOf', {
                from: (page - 1) * pagination.limit + 1,
                to: Math.min(page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </span>
            <div className="flex gap-1">
              <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                &laquo;
              </button>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (pagination.totalPages > 5) {
                  if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                }
                return (
                  <button
                    key={pageNum}
                    className={`btn btn-sm ${page === pageNum ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                className="btn btn-outline btn-sm"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                &raquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {showPaymentDetails && selectedOrder && (
        <Modal
          title={t('tickets.orderDetails')}
          onClose={() => {
            setShowPaymentDetails(false);
            setSelectedOrder(null);
            setPaymentDetails(null);
          }}
          size="large"
        >
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Order Info */}
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>{t('tickets.orderInfo')}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('tickets.orderId')}:</span>
                  <div>
                    <code style={{ fontSize: '0.75rem' }}>{selectedOrder.id}</code>
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('common.status')}:</span>
                  <div>{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('tickets.orderDate')}:</span>
                  <div>{formatDate(selectedOrder.createdAt)}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('tickets.paidAt')}:</span>
                  <div>{selectedOrder.paidAt ? formatDate(selectedOrder.paidAt) : '-'}</div>
                </div>
              </div>
            </div>

            {/* Buyer Info */}
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>{t('tickets.buyerInfo')}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('common.name')}:</span>
                  <div>{selectedOrder.buyerName}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('common.email')}:</span>
                  <div>{selectedOrder.buyerEmail}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-light)' }}>{t('common.phone')}:</span>
                  <div>{selectedOrder.buyerPhone || '-'}</div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>{t('tickets.items')}</h4>
              <table className="table" style={{ marginBottom: '0.5rem' }}>
                <thead>
                  <tr>
                    <th>{t('tickets.ticketType')}</th>
                    <th style={{ textAlign: 'right' }}>{t('tickets.quantity')}</th>
                    <th style={{ textAlign: 'right' }}>{t('tickets.unitPrice')}</th>
                    <th style={{ textAlign: 'right' }}>{t('tickets.subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {t('tickets.total')}:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(selectedOrder.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment Details */}
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>{t('tickets.paymentDetails')}</h4>
              {loadingPaymentDetails ? (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <span className="spinner-border spinner-border-sm"></span> {t('common.loading')}
                </div>
              ) : paymentDetails ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-light)' }}>{t('tickets.paymentProvider')}:</span>
                    <div style={{ textTransform: 'capitalize' }}>{paymentDetails.provider || '-'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-light)' }}>{t('tickets.paymentId')}:</span>
                    <div>
                      <code style={{ fontSize: '0.75rem' }}>{paymentDetails.paymentId || '-'}</code>
                    </div>
                  </div>
                  {paymentDetails.details && (
                    <>
                      <div>
                        <span style={{ color: 'var(--text-light)' }}>{t('tickets.paymentStatus')}:</span>
                        <div style={{ textTransform: 'capitalize' }}>{paymentDetails.details.status}</div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-light)' }}>{t('tickets.paymentMethod')}:</span>
                        <div style={{ textTransform: 'capitalize' }}>{paymentDetails.details.method || '-'}</div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-light)' }}>{t('tickets.amount')}:</span>
                        <div>{formatCurrency(paymentDetails.details.amount)}</div>
                      </div>
                      {paymentDetails.details.paidAt && (
                        <div>
                          <span style={{ color: 'var(--text-light)' }}>{t('tickets.paidAt')}:</span>
                          <div>{formatDate(paymentDetails.details.paidAt)}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-light)' }}>{t('tickets.noPaymentInfo')}</div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Refund Confirmation Modal */}
      {showRefundConfirm && selectedOrder && (
        <Modal
          title={t('tickets.confirmRefund')}
          onClose={() => {
            setShowRefundConfirm(false);
            setRefundReason('');
          }}
          size="medium"
        >
          <p>
            {t('tickets.refundWarning', {
              amount: formatCurrency(selectedOrder.total),
              buyer: selectedOrder.buyerName,
            })}
          </p>
          <div className="form-group">
            <label className="form-label">{t('tickets.refundReason')}</label>
            <textarea
              className="form-control"
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={t('tickets.refundReasonPlaceholder')}
            />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowRefundConfirm(false);
                setRefundReason('');
              }}
              disabled={isRefunding}
            >
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger" onClick={handleRefund} disabled={isRefunding}>
              {isRefunding ? t('common.processing') : t('tickets.refund')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
