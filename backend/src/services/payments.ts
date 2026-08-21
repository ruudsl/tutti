import crypto from 'crypto';
import db from '../database/connection';
import logger from '../utils/logger';

// Payment provider configuration
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || '';
const MOLLIE_API_URL = 'https://api.mollie.com/v2';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export type PaymentProvider = 'mollie' | 'stripe';
export type PaymentMethod = 'ideal' | 'creditcard' | 'bancontact' | 'paypal' | 'applepay' | 'googlepay';

export interface PaymentRequest {
  orderId: string;
  amount: number; // in euros
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  method?: PaymentMethod;
  metadata?: Record<string, string>;
  customerEmail?: string;
  customerName?: string;
}

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  checkoutUrl?: string;
  error?: string;
}

export interface PaymentStatus {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';
  amount: number;
  method?: string;
  paidAt?: string;
  metadata?: Record<string, string>;
}

// ========================================
// Mollie Payment Provider
// ========================================

async function createMolliePayment(request: PaymentRequest): Promise<PaymentResponse> {
  if (!MOLLIE_API_KEY) {
    logger.error('Mollie API key not configured');
    return { success: false, error: 'Payment provider not configured' };
  }

  try {
    const payload: Record<string, unknown> = {
      amount: {
        currency: 'EUR',
        value: request.amount.toFixed(2),
      },
      description: request.description,
      redirectUrl: request.redirectUrl,
      webhookUrl: request.webhookUrl,
      metadata: {
        order_id: request.orderId,
        ...request.metadata,
      },
    };

    // Map payment method to Mollie method
    if (request.method) {
      const methodMap: Record<PaymentMethod, string> = {
        ideal: 'ideal',
        creditcard: 'creditcard',
        bancontact: 'bancontact',
        paypal: 'paypal',
        applepay: 'applepay',
        googlepay: 'googlepay',
      };
      payload.method = methodMap[request.method];
    }

    const response = await fetch(`${MOLLIE_API_URL}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MOLLIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Mollie payment creation failed', { status: response.status, error });
      return { success: false, error: 'Failed to create payment' };
    }

    const data = (await response.json()) as {
      id: string;
      _links: {
        checkout: { href: string };
      };
    };

    return {
      success: true,
      paymentId: data.id,
      checkoutUrl: data._links.checkout.href,
    };
  } catch (error) {
    logger.error('Mollie payment error:', error);
    return { success: false, error: 'Payment service unavailable' };
  }
}

/**
 * Een betaalkenmerk van Mollie of Stripe bestaat uit letters, cijfers en
 * onderstrepingstekens (tr_..., cs_test_...). Alles daarbuiten hoort niet in
 * een pad thuis. Let op de bovengrens van 64 tekens: die is korter dan wat
 * Stripe in de praktijk aan sessiekenmerken uitdeelt, en een kenmerk dat hier
 * afvalt levert stilzwijgend 'geen gegevens' op.
 */
function controleerBetaalId(paymentId: string): string {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(paymentId)) {
    throw new Error('Invalid payment id');
  }
  return paymentId;
}

async function getMolliePaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
  if (!MOLLIE_API_KEY) {
    return null;
  }

  try {
    // paymentId komt uit de aanvraag en staat in het pad. Zonder controle kan
    // een aanroeper met '../' een ander eindpunt van Mollie raken, mét de
    // sleutel van de vereniging eraan vast.
    const response = await fetch(`${MOLLIE_API_URL}/payments/${encodeURIComponent(controleerBetaalId(paymentId))}`, {
      headers: {
        Authorization: `Bearer ${MOLLIE_API_KEY}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      id: string;
      status: string;
      amount: { value: string };
      method: string;
      paidAt?: string;
      metadata?: Record<string, string>;
    };

    const statusMap: Record<string, PaymentStatus['status']> = {
      open: 'pending',
      pending: 'pending',
      authorized: 'pending',
      paid: 'paid',
      failed: 'failed',
      canceled: 'cancelled',
      expired: 'expired',
      refunded: 'refunded',
    };

    return {
      id: data.id,
      status: statusMap[data.status] || 'pending',
      amount: parseFloat(data.amount.value),
      method: data.method,
      paidAt: data.paidAt,
      metadata: data.metadata,
    };
  } catch (error) {
    logger.error('Failed to get Mollie payment status:', error);
    return null;
  }
}

// ========================================
// Stripe Payment Provider
// ========================================

async function createStripePayment(request: PaymentRequest): Promise<PaymentResponse> {
  if (!STRIPE_SECRET_KEY) {
    logger.error('Stripe secret key not configured');
    return { success: false, error: 'Payment provider not configured' };
  }

  try {
    // Create Stripe Checkout Session
    const params = new URLSearchParams();
    params.append('payment_method_types[]', 'card');
    params.append('payment_method_types[]', 'ideal');
    params.append('payment_method_types[]', 'bancontact');
    params.append('line_items[0][price_data][currency]', 'eur');
    params.append('line_items[0][price_data][unit_amount]', Math.round(request.amount * 100).toString());
    params.append('line_items[0][price_data][product_data][name]', request.description);
    params.append('line_items[0][quantity]', '1');
    params.append('mode', 'payment');
    params.append('success_url', `${request.redirectUrl}?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${request.redirectUrl}?cancelled=true`);
    params.append('metadata[order_id]', request.orderId);

    if (request.customerEmail) {
      params.append('customer_email', request.customerEmail);
    }

    if (request.metadata) {
      Object.entries(request.metadata).forEach(([key, value]) => {
        params.append(`metadata[${key}]`, value);
      });
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Stripe session creation failed', { status: response.status, error });
      return { success: false, error: 'Failed to create payment session' };
    }

    const data = (await response.json()) as {
      id: string;
      url: string;
    };

    return {
      success: true,
      paymentId: data.id,
      checkoutUrl: data.url,
    };
  } catch (error) {
    logger.error('Stripe payment error:', error);
    return { success: false, error: 'Payment service unavailable' };
  }
}

async function getStripePaymentStatus(sessionId: string): Promise<PaymentStatus | null> {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(controleerBetaalId(sessionId))}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      id: string;
      payment_status: string;
      amount_total: number;
      payment_method_types: string[];
      metadata?: Record<string, string>;
    };

    const statusMap: Record<string, PaymentStatus['status']> = {
      unpaid: 'pending',
      paid: 'paid',
      no_payment_required: 'paid',
    };

    return {
      id: data.id,
      status: statusMap[data.payment_status] || 'pending',
      amount: data.amount_total / 100,
      method: data.payment_method_types?.[0],
      metadata: data.metadata,
    };
  } catch (error) {
    logger.error('Failed to get Stripe payment status:', error);
    return null;
  }
}

// ========================================
// Unified Payment Interface
// ========================================

/**
 * De nepbetaalprovider hieronder is bedoeld voor ontwikkelen en testen: hij
 * verzint een betaling die niemand ooit voldoet, meldt elk kenmerk dat met
 * 'mock_' begint als betaald, en meldt een terugbetaling als geslaagd zonder
 * dat er een cent beweegt. De aanroeper zet op grond daarvan een bestelling op
 * betaald of op terugbetaald.
 *
 * Een deploy zonder MOLLIE_API_KEY en zonder STRIPE_SECRET_KEY is genoeg om in
 * die tak te belanden - precies het soort schakelaar dat per ongeluk open
 * blijft staan. In productie hoort deze dienst dan dicht te gaan in plaats van
 * te doen alsof: alle drie de aanroepers verwerken een mislukking netjes
 * (geen betaallink, geen statusgegevens, geen terugbetaling), terwijl een
 * verzonnen 'geslaagd' de vereniging kaarten of geld kost.
 *
 * NODE_ENV wordt hier per aanroep gelezen en niet in een module-constante
 * vastgelegd, zodat de waarde telt die het proces draait.
 */
function nepbetalingenToegestaan(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get the configured payment provider
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (MOLLIE_API_KEY) return 'mollie';
  if (STRIPE_SECRET_KEY) return 'stripe';
  return null;
}

/**
 * Get available payment methods for the configured provider
 */
export function getAvailablePaymentMethods(): PaymentMethod[] {
  const provider = getPaymentProvider();

  if (provider === 'mollie') {
    return ['ideal', 'creditcard', 'bancontact', 'paypal'];
  }

  if (provider === 'stripe') {
    return ['ideal', 'creditcard', 'bancontact'];
  }

  return [];
}

/**
 * Create a payment with the configured provider
 */
export async function createPayment(request: PaymentRequest): Promise<PaymentResponse> {
  const provider = getPaymentProvider();

  if (!provider) {
    if (!nepbetalingenToegestaan()) {
      logger.error('No payment provider configured in production - refusing to create a mock payment');
      return { success: false, error: 'Payment provider not configured' };
    }

    // Development mode: simulate payment
    logger.warn('No payment provider configured - using mock payment');
    return {
      success: true,
      paymentId: `mock_${crypto.randomUUID()}`,
      checkoutUrl: `${FRONTEND_URL}/tickets/orders/${request.orderId}/mock-payment`,
    };
  }

  if (provider === 'mollie') {
    return createMolliePayment(request);
  }

  return createStripePayment(request);
}

/**
 * Get payment status from the configured provider
 */
export async function getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
  const provider = getPaymentProvider();

  if (!provider) {
    if (!nepbetalingenToegestaan()) {
      return null;
    }

    // Mock payment status check
    if (paymentId.startsWith('mock_')) {
      return {
        id: paymentId,
        status: 'paid',
        amount: 0,
      };
    }
    return null;
  }

  if (provider === 'mollie') {
    return getMolliePaymentStatus(paymentId);
  }

  return getStripePaymentStatus(paymentId);
}

// ========================================
// Webhook Handling
// ========================================

export interface WebhookResult {
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

/**
 * Verify and parse Mollie webhook
 */
export async function handleMollieWebhook(paymentId: string): Promise<WebhookResult> {
  const paymentStatus = await getMolliePaymentStatus(paymentId);

  if (!paymentStatus) {
    return { success: false, error: 'Payment not found' };
  }

  const orderId = paymentStatus.metadata?.order_id;
  if (!orderId) {
    return { success: false, error: 'Order ID not found in metadata' };
  }

  // Log webhook
  db.prepare(
    `
        INSERT INTO payment_webhooks (id, provider, event_type, payload, processed)
        VALUES (?, 'mollie', ?, ?, 1)
    `,
  ).run(crypto.randomUUID(), paymentStatus.status, JSON.stringify(paymentStatus));

  return {
    success: true,
    orderId,
    status: paymentStatus.status,
  };
}

/**
 * Verify and parse Stripe webhook
 */
// Maximum allowed age of a webhook signature timestamp (replay protection).
// Matches Stripe's default tolerance of 5 minutes.
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export function verifyStripeWebhook(payload: Buffer | string, signature: string): { valid: boolean; event?: unknown } {
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn('Stripe webhook secret not configured');
    return { valid: false };
  }

  try {
    // Signature must be computed over the exact raw request bytes,
    // NOT a re-serialized (JSON.stringify) version of a parsed body.
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');

    const parts = signature.split(',');
    const timestamp = parts.find((s) => s.startsWith('t='))?.slice(2);
    const receivedSig = parts.find((s) => s.startsWith('v1='))?.slice(3);

    if (!timestamp || !receivedSig) {
      return { valid: false };
    }

    // Reject stale timestamps to prevent replay attacks
    const timestampSeconds = parseInt(timestamp, 10);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > STRIPE_WEBHOOK_TOLERANCE_SECONDS
    ) {
      logger.warn('Stripe webhook timestamp outside tolerance window');
      return { valid: false };
    }

    const expectedSig = crypto
      .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.`)
      .update(payloadBuffer)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    const receivedBuffer = Buffer.from(receivedSig, 'hex');
    if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return { valid: false };
    }

    // Only parse the payload AFTER the signature has been verified
    const event = JSON.parse(payloadBuffer.toString('utf8'));
    return { valid: true, event };
  } catch (error) {
    logger.error('Stripe webhook verification failed:', error);
    return { valid: false };
  }
}

export async function handleStripeWebhook(event: Record<string, unknown>): Promise<WebhookResult> {
  const eventType = event.type as string;
  const data = event.data as { object: Record<string, unknown> };

  // Log webhook
  db.prepare(
    `
        INSERT INTO payment_webhooks (id, provider, event_type, payload, processed)
        VALUES (?, 'stripe', ?, ?, 0)
    `,
  ).run(crypto.randomUUID(), eventType, JSON.stringify(event));

  if (eventType === 'checkout.session.completed') {
    const session = data.object as {
      id: string;
      payment_status: string;
      metadata?: { order_id?: string };
    };

    const orderId = session.metadata?.order_id;
    if (!orderId) {
      return { success: false, error: 'Order ID not found' };
    }

    // Update webhook as processed
    db.prepare(
      `
            UPDATE payment_webhooks SET processed = 1 WHERE payload LIKE ?
        `,
    ).run(`%${session.id}%`);

    return {
      success: true,
      orderId,
      status: session.payment_status === 'paid' ? 'paid' : 'pending',
    };
  }

  if (eventType === 'checkout.session.expired') {
    const session = data.object as { metadata?: { order_id?: string } };
    const orderId = session.metadata?.order_id;

    if (orderId) {
      return {
        success: true,
        orderId,
        status: 'expired',
      };
    }
  }

  // Unknown event type
  return { success: true };
}

// ========================================
// Refund Handling
// ========================================

export interface RefundRequest {
  paymentId: string;
  amount?: number; // Optional: partial refund amount
  reason?: string;
}

export interface RefundResponse {
  success: boolean;
  refundId?: string;
  error?: string;
}

/**
 * Create a refund for a payment
 */
export async function createRefund(request: RefundRequest): Promise<RefundResponse> {
  const provider = getPaymentProvider();

  if (!provider) {
    if (!nepbetalingenToegestaan()) {
      logger.error('No payment provider configured in production - refusing to report a mock refund as successful');
      return { success: false, error: 'Payment provider not configured' };
    }

    // Mock refund
    return {
      success: true,
      refundId: `mock_refund_${crypto.randomUUID()}`,
    };
  }

  if (provider === 'mollie') {
    return createMollieRefund(request);
  }

  return createStripeRefund(request);
}

async function createMollieRefund(request: RefundRequest): Promise<RefundResponse> {
  try {
    const payload: Record<string, unknown> = {};

    if (request.amount) {
      payload.amount = {
        currency: 'EUR',
        value: request.amount.toFixed(2),
      };
    }

    if (request.reason) {
      payload.description = request.reason;
    }

    const response = await fetch(
      `${MOLLIE_API_URL}/payments/${encodeURIComponent(controleerBetaalId(request.paymentId))}/refunds`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MOLLIE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error('Mollie refund failed', { error });
      return { success: false, error: 'Failed to create refund' };
    }

    const data = (await response.json()) as { id: string };
    return { success: true, refundId: data.id };
  } catch (error) {
    logger.error('Mollie refund error:', error);
    return { success: false, error: 'Refund service unavailable' };
  }
}

async function createStripeRefund(request: RefundRequest): Promise<RefundResponse> {
  try {
    // First, get the payment intent from the session
    const sessionResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(controleerBetaalId(request.paymentId))}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
        },
      },
    );

    if (!sessionResponse.ok) {
      return { success: false, error: 'Session not found' };
    }

    const session = (await sessionResponse.json()) as { payment_intent: string };

    // Create refund
    const params = new URLSearchParams();
    params.append('payment_intent', session.payment_intent);

    if (request.amount) {
      params.append('amount', Math.round(request.amount * 100).toString());
    }

    if (request.reason) {
      params.append('reason', 'requested_by_customer');
    }

    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Stripe refund failed', { error });
      return { success: false, error: 'Failed to create refund' };
    }

    const data = (await response.json()) as { id: string };
    return { success: true, refundId: data.id };
  } catch (error) {
    logger.error('Stripe refund error:', error);
    return { success: false, error: 'Refund service unavailable' };
  }
}
