import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';
import { wijzigingsschema } from '../utils/schema';

const router = Router();

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createPolicySchema = z.object({
  policyNumber: z.string().min(1, 'Polisnummer is verplicht'),
  providerName: z.string().min(1, 'Verzekeraar is verplicht'),
  providerContact: z.string().optional(),
  providerPhone: z.string().optional(),
  providerEmail: z.string().email().optional().or(z.literal('')),
  policyType: z.enum(['all_risk', 'theft', 'damage', 'comprehensive']),
  coverageType: z.enum(['individual', 'collective', 'blanket']),
  coverageAmount: z.number().positive('Dekking moet positief zijn'),
  deductible: z.number().min(0).default(0),
  currency: z.string().default('EUR'),
  premiumAmount: z.number().min(0).optional(),
  premiumFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  premiumDueDate: z.string().optional(),
  startDate: z.string().min(1, 'Startdatum is verplicht'),
  endDate: z.string().optional(),
  autoRenew: z.boolean().default(false),
  coverageDetails: z.string().optional(),
  exclusions: z.string().optional(),
  documentUrl: z.string().optional(),
});

const updatePolicySchema = wijzigingsschema(createPolicySchema);

const addCoverageSchema = z.object({
  assetId: z.string().uuid(),
  coveredAmount: z.number().positive(),
  coverageStart: z.string().min(1),
  coverageEnd: z.string().optional(),
  specialConditions: z.string().optional(),
});

const createClaimSchema = z.object({
  policyId: z.string().uuid(),
  assetId: z.string().uuid(),
  claimNumber: z.string().optional(),
  claimDate: z.string().min(1),
  incidentDate: z.string().min(1),
  incidentType: z.enum(['theft', 'damage', 'loss', 'fire', 'water', 'vandalism', 'accident', 'other']),
  incidentDescription: z.string().min(1, 'Beschrijving is verplicht'),
  incidentLocation: z.string().optional(),
  claimedAmount: z.number().min(0).optional(),
  policeReportNumber: z.string().optional(),
  witnessInfo: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const updateClaimSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected', 'paid', 'closed']).optional(),
  approvedAmount: z.number().min(0).optional(),
  paidAmount: z.number().min(0).optional(),
  resolutionDate: z.string().optional(),
  resolutionNotes: z.string().optional(),
  documentUrls: z.array(z.string()).optional(),
});

// ===========================================
// POLICY ROUTES
// ===========================================

router.get(
  '/policies',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const status = req.query.status as string | undefined;

    let whereClause = 'WHERE p.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (status) {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }

    const countResult = db
      .prepare(`SELECT COUNT(*) as total FROM instrument_insurance_policies p ${whereClause}`)
      .get(...params) as { total: number };

    const policies = db
      .prepare(
        `
        SELECT p.*,
            (SELECT COUNT(*) FROM instrument_insurance_coverage c WHERE c.policy_id = p.id) as covered_assets_count,
            (SELECT SUM(covered_amount) FROM instrument_insurance_coverage c WHERE c.policy_id = p.id) as total_covered_value
        FROM instrument_insurance_policies p
        ${whereClause}
        ORDER BY p.end_date ASC, p.provider_name
        LIMIT ? OFFSET ?
    `,
      )
      .all(...params, limit, offset);

    const items = policies.map((p: any) => ({
      id: p.id,
      policyNumber: p.policy_number,
      providerName: p.provider_name,
      providerContact: p.provider_contact,
      providerPhone: p.provider_phone,
      providerEmail: p.provider_email,
      policyType: p.policy_type,
      coverageType: p.coverage_type,
      coverageAmount: p.coverage_amount,
      deductible: p.deductible,
      currency: p.currency,
      premiumAmount: p.premium_amount,
      premiumFrequency: p.premium_frequency,
      premiumDueDate: p.premium_due_date,
      startDate: p.start_date,
      endDate: p.end_date,
      autoRenew: p.auto_renew === 1,
      status: p.status,
      coveredAssetsCount: p.covered_assets_count,
      totalCoveredValue: p.total_covered_value,
      createdAt: p.created_at,
    }));

    res.json(createPaginatedResult(items, countResult.total, page, limit));
  }),
);

router.get(
  '/policies/summary',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const stats = db
      .prepare(
        `
        SELECT
            COUNT(*) as total_policies,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_policies,
            SUM(CASE WHEN status = 'active' THEN coverage_amount ELSE 0 END) as total_coverage,
            SUM(CASE WHEN status = 'active' THEN premium_amount ELSE 0 END) as annual_premiums
        FROM instrument_insurance_policies
        WHERE association_id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    const expiringPolicies = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM instrument_insurance_policies
        WHERE association_id = ?
        AND status = 'active'
        AND end_date IS NOT NULL
        AND end_date <= date('now', '+30 days')
    `,
      )
      .get(req.user!.associationId) as { count: number };

    const openClaims = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM instrument_insurance_claims c
        JOIN instrument_insurance_policies p ON c.policy_id = p.id
        WHERE p.association_id = ?
        AND c.status IN ('submitted', 'under_review')
    `,
      )
      .get(req.user!.associationId) as { count: number };

    const uninsuredAssets = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM instrument_assets a
        WHERE a.association_id = ?
        AND a.deleted_at IS NULL
        AND a.insurance_policy_id IS NULL
        AND a.current_value > 500
    `,
      )
      .get(req.user!.associationId) as { count: number };

    res.json({
      totalPolicies: stats.total_policies,
      activePolicies: stats.active_policies,
      totalCoverage: stats.total_coverage,
      annualPremiums: stats.annual_premiums,
      expiringPoliciesCount: expiringPolicies.count,
      openClaimsCount: openClaims.count,
      uninsuredHighValueAssets: uninsuredAssets.count,
    });
  }),
);

router.get(
  '/policies/expiring',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;

    const policies = db
      .prepare(
        `
        SELECT * FROM instrument_insurance_policies
        WHERE association_id = ?
        AND status = 'active'
        AND end_date IS NOT NULL
        AND end_date <= date('now', '+' || ? || ' days')
        ORDER BY end_date ASC
    `,
      )
      .all(req.user!.associationId, days);

    res.json(
      policies.map((p: any) => ({
        id: p.id,
        policyNumber: p.policy_number,
        providerName: p.provider_name,
        endDate: p.end_date,
        coverageAmount: p.coverage_amount,
        autoRenew: p.auto_renew === 1,
        daysUntilExpiry: Math.ceil((new Date(p.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      })),
    );
  }),
);

router.get(
  '/policies/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const policy = db
      .prepare(
        `
        SELECT * FROM instrument_insurance_policies
        WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!policy) {
      throw new ApiError(404, 'Verzekeringspolis niet gevonden');
    }

    const coverage = db
      .prepare(
        `
        SELECT c.*, a.name as asset_name, a.instrument_type, a.serial_number
        FROM instrument_insurance_coverage c
        JOIN instrument_assets a ON c.asset_id = a.id
        WHERE c.policy_id = ?
        ORDER BY a.name
    `,
      )
      .all(req.params.id);

    const claims = db
      .prepare(
        `
        SELECT c.*, a.name as asset_name
        FROM instrument_insurance_claims c
        JOIN instrument_assets a ON c.asset_id = a.id
        WHERE c.policy_id = ?
        ORDER BY c.claim_date DESC
    `,
      )
      .all(req.params.id);

    res.json({
      id: policy.id,
      policyNumber: policy.policy_number,
      providerName: policy.provider_name,
      providerContact: policy.provider_contact,
      providerPhone: policy.provider_phone,
      providerEmail: policy.provider_email,
      policyType: policy.policy_type,
      coverageType: policy.coverage_type,
      coverageAmount: policy.coverage_amount,
      deductible: policy.deductible,
      currency: policy.currency,
      premiumAmount: policy.premium_amount,
      premiumFrequency: policy.premium_frequency,
      premiumDueDate: policy.premium_due_date,
      startDate: policy.start_date,
      endDate: policy.end_date,
      autoRenew: policy.auto_renew === 1,
      coverageDetails: policy.coverage_details,
      exclusions: policy.exclusions,
      documentUrl: policy.document_url,
      status: policy.status,
      createdAt: policy.created_at,
      coveredAssets: coverage.map((c: any) => ({
        id: c.id,
        asset: {
          id: c.asset_id,
          name: c.asset_name,
          instrumentType: c.instrument_type,
          serialNumber: c.serial_number,
        },
        coveredAmount: c.covered_amount,
        coverageStart: c.coverage_start,
        coverageEnd: c.coverage_end,
        specialConditions: c.special_conditions,
      })),
      claims: claims.map((c: any) => ({
        id: c.id,
        assetName: c.asset_name,
        claimNumber: c.claim_number,
        claimDate: c.claim_date,
        incidentType: c.incident_type,
        claimedAmount: c.claimed_amount,
        approvedAmount: c.approved_amount,
        paidAmount: c.paid_amount,
        status: c.status,
      })),
    });
  }),
);

router.post(
  '/policies',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createPolicySchema.parse(req.body);
    const id = uuidv4();

    db.prepare(
      `
        INSERT INTO instrument_insurance_policies (
            id, association_id, policy_number, provider_name, provider_contact,
            provider_phone, provider_email, policy_type, coverage_type, coverage_amount,
            deductible, currency, premium_amount, premium_frequency, premium_due_date,
            start_date, end_date, auto_renew, coverage_details, exclusions, document_url,
            status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
    ).run(
      id,
      req.user!.associationId,
      data.policyNumber,
      data.providerName,
      data.providerContact || null,
      data.providerPhone || null,
      data.providerEmail || null,
      data.policyType,
      data.coverageType,
      data.coverageAmount,
      data.deductible,
      data.currency,
      data.premiumAmount || null,
      data.premiumFrequency || null,
      data.premiumDueDate || null,
      data.startDate,
      data.endDate || null,
      data.autoRenew ? 1 : 0,
      data.coverageDetails || null,
      data.exclusions || null,
      data.documentUrl || null,
      req.user!.id,
    );

    logger.info(`Insurance policy created: ${data.policyNumber}`, { id, createdBy: req.user!.id });

    res.status(201).json({ id, message: 'Verzekeringspolis aangemaakt' });
  }),
);

router.put(
  '/policies/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updatePolicySchema.parse(req.body);

    const existing = db
      .prepare('SELECT id FROM instrument_insurance_policies WHERE id = ? AND association_id = ?')
      .get(req.params.id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Verzekeringspolis niet gevonden');
    }

    db.prepare(
      `
        UPDATE instrument_insurance_policies SET
            policy_number = COALESCE(?, policy_number),
            provider_name = COALESCE(?, provider_name),
            provider_contact = COALESCE(?, provider_contact),
            provider_phone = COALESCE(?, provider_phone),
            provider_email = COALESCE(?, provider_email),
            policy_type = COALESCE(?, policy_type),
            coverage_type = COALESCE(?, coverage_type),
            coverage_amount = COALESCE(?, coverage_amount),
            deductible = COALESCE(?, deductible),
            premium_amount = COALESCE(?, premium_amount),
            premium_frequency = COALESCE(?, premium_frequency),
            premium_due_date = COALESCE(?, premium_due_date),
            start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date),
            auto_renew = COALESCE(?, auto_renew),
            coverage_details = COALESCE(?, coverage_details),
            exclusions = COALESCE(?, exclusions),
            document_url = COALESCE(?, document_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(
      data.policyNumber,
      data.providerName,
      data.providerContact,
      data.providerPhone,
      data.providerEmail,
      data.policyType,
      data.coverageType,
      data.coverageAmount,
      data.deductible,
      data.premiumAmount,
      data.premiumFrequency,
      data.premiumDueDate,
      data.startDate,
      data.endDate,
      data.autoRenew !== undefined ? (data.autoRenew ? 1 : 0) : null,
      data.coverageDetails,
      data.exclusions,
      data.documentUrl,
      req.params.id,
    );

    res.json({ message: 'Verzekeringspolis bijgewerkt' });
  }),
);

router.delete(
  '/policies/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const policy = db
      .prepare('SELECT id FROM instrument_insurance_policies WHERE id = ? AND association_id = ?')
      .get(req.params.id, req.user!.associationId);

    if (!policy) {
      throw new ApiError(404, 'Verzekeringspolis niet gevonden');
    }

    db.prepare('UPDATE instrument_insurance_policies SET status = ? WHERE id = ?').run('cancelled', req.params.id);
    db.prepare('UPDATE instrument_assets SET insurance_policy_id = NULL WHERE insurance_policy_id = ?').run(
      req.params.id,
    );

    res.json({ message: 'Verzekeringspolis geannuleerd' });
  }),
);

// ===========================================
// COVERAGE ROUTES
// ===========================================

router.post(
  '/policies/:policyId/coverage',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addCoverageSchema.parse(req.body);

    const policy = db
      .prepare('SELECT id FROM instrument_insurance_policies WHERE id = ? AND association_id = ?')
      .get(req.params.policyId, req.user!.associationId);

    if (!policy) {
      throw new ApiError(404, 'Verzekeringspolis niet gevonden');
    }

    const asset = db
      .prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(data.assetId, req.user!.associationId);

    if (!asset) {
      throw new ApiError(404, 'Instrument niet gevonden');
    }

    const id = uuidv4();

    db.prepare(
      `
        INSERT INTO instrument_insurance_coverage (id, policy_id, asset_id, covered_amount, coverage_start, coverage_end, special_conditions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      req.params.policyId,
      data.assetId,
      data.coveredAmount,
      data.coverageStart,
      data.coverageEnd || null,
      data.specialConditions || null,
    );

    db.prepare('UPDATE instrument_assets SET insurance_policy_id = ? WHERE id = ?').run(
      req.params.policyId,
      data.assetId,
    );

    res.status(201).json({ id, message: 'Instrument toegevoegd aan polis' });
  }),
);

router.delete(
  '/policies/:policyId/coverage/:coverageId',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const coverage = db
      .prepare(
        `
        SELECT c.* FROM instrument_insurance_coverage c
        JOIN instrument_insurance_policies p ON c.policy_id = p.id
        WHERE c.id = ? AND p.association_id = ?
    `,
      )
      .get(req.params.coverageId, req.user!.associationId) as any;

    if (!coverage) {
      throw new ApiError(404, 'Dekking niet gevonden');
    }

    db.prepare('DELETE FROM instrument_insurance_coverage WHERE id = ?').run(req.params.coverageId);
    db.prepare('UPDATE instrument_assets SET insurance_policy_id = NULL WHERE id = ? AND insurance_policy_id = ?').run(
      coverage.asset_id,
      req.params.policyId,
    );

    res.json({ message: 'Instrument verwijderd van polis' });
  }),
);

// ===========================================
// CLAIM ROUTES
// ===========================================

router.get(
  '/claims',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const status = req.query.status as string | undefined;

    let whereClause = 'WHERE p.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    const countResult = db
      .prepare(
        `
        SELECT COUNT(*) as total
        FROM instrument_insurance_claims c
        JOIN instrument_insurance_policies p ON c.policy_id = p.id
        ${whereClause}
    `,
      )
      .get(...params) as { total: number };

    const claims = db
      .prepare(
        `
        SELECT c.*, p.policy_number, p.provider_name, a.name as asset_name, a.instrument_type
        FROM instrument_insurance_claims c
        JOIN instrument_insurance_policies p ON c.policy_id = p.id
        JOIN instrument_assets a ON c.asset_id = a.id
        ${whereClause}
        ORDER BY c.claim_date DESC
        LIMIT ? OFFSET ?
    `,
      )
      .all(...params, limit, offset);

    const items = claims.map((c: any) => ({
      id: c.id,
      claimNumber: c.claim_number,
      claimDate: c.claim_date,
      incidentDate: c.incident_date,
      incidentType: c.incident_type,
      incidentDescription: c.incident_description,
      claimedAmount: c.claimed_amount,
      approvedAmount: c.approved_amount,
      paidAmount: c.paid_amount,
      status: c.status,
      policy: {
        id: c.policy_id,
        policyNumber: c.policy_number,
        providerName: c.provider_name,
      },
      asset: {
        id: c.asset_id,
        name: c.asset_name,
        instrumentType: c.instrument_type,
      },
      resolutionDate: c.resolution_date,
      createdAt: c.created_at,
    }));

    res.json(createPaginatedResult(items, countResult.total, page, limit));
  }),
);

router.get(
  '/claims/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const claim = db
      .prepare(
        `
        SELECT c.*, p.policy_number, p.provider_name, p.provider_phone, p.provider_email, p.deductible,
               a.name as asset_name, a.instrument_type, a.serial_number, a.current_value
        FROM instrument_insurance_claims c
        JOIN instrument_insurance_policies p ON c.policy_id = p.id
        JOIN instrument_assets a ON c.asset_id = a.id
        WHERE c.id = ? AND p.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!claim) {
      throw new ApiError(404, 'Claim niet gevonden');
    }

    res.json({
      id: claim.id,
      claimNumber: claim.claim_number,
      claimDate: claim.claim_date,
      incidentDate: claim.incident_date,
      incidentType: claim.incident_type,
      incidentDescription: claim.incident_description,
      incidentLocation: claim.incident_location,
      claimedAmount: claim.claimed_amount,
      approvedAmount: claim.approved_amount,
      paidAmount: claim.paid_amount,
      status: claim.status,
      policeReportNumber: claim.police_report_number,
      witnessInfo: claim.witness_info,
      documentUrls: claim.document_urls ? JSON.parse(claim.document_urls) : [],
      photos: claim.photos ? JSON.parse(claim.photos) : [],
      resolutionDate: claim.resolution_date,
      resolutionNotes: claim.resolution_notes,
      policy: {
        id: claim.policy_id,
        policyNumber: claim.policy_number,
        providerName: claim.provider_name,
        providerPhone: claim.provider_phone,
        providerEmail: claim.provider_email,
        deductible: claim.deductible,
      },
      asset: {
        id: claim.asset_id,
        name: claim.asset_name,
        instrumentType: claim.instrument_type,
        serialNumber: claim.serial_number,
        currentValue: claim.current_value,
      },
      createdAt: claim.created_at,
    });
  }),
);

router.post(
  '/claims',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createClaimSchema.parse(req.body);

    const policy = db
      .prepare('SELECT id FROM instrument_insurance_policies WHERE id = ? AND association_id = ?')
      .get(data.policyId, req.user!.associationId);

    if (!policy) {
      throw new ApiError(404, 'Verzekeringspolis niet gevonden');
    }

    const asset = db
      .prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(data.assetId, req.user!.associationId);

    if (!asset) {
      throw new ApiError(404, 'Instrument niet gevonden');
    }

    const id = uuidv4();

    db.prepare(
      `
        INSERT INTO instrument_insurance_claims (
            id, policy_id, asset_id, claim_number, claim_date, incident_date,
            incident_type, incident_description, incident_location, claimed_amount,
            police_report_number, witness_info, photos, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
    `,
    ).run(
      id,
      data.policyId,
      data.assetId,
      data.claimNumber || null,
      data.claimDate,
      data.incidentDate,
      data.incidentType,
      data.incidentDescription,
      data.incidentLocation || null,
      data.claimedAmount || null,
      data.policeReportNumber || null,
      data.witnessInfo || null,
      data.photos ? JSON.stringify(data.photos) : null,
      req.user!.id,
    );

    logger.info(`Insurance claim created: ${id}`, {
      policyId: data.policyId,
      assetId: data.assetId,
      createdBy: req.user!.id,
    });

    res.status(201).json({ id, message: 'Schadeclaim ingediend' });
  }),
);

router.put(
  '/claims/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateClaimSchema.parse(req.body);

    const claim = db
      .prepare(
        `
        SELECT c.* FROM instrument_insurance_claims c
        JOIN instrument_insurance_policies p ON c.policy_id = p.id
        WHERE c.id = ? AND p.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId);

    if (!claim) {
      throw new ApiError(404, 'Claim niet gevonden');
    }

    db.prepare(
      `
        UPDATE instrument_insurance_claims SET
            status = COALESCE(?, status),
            approved_amount = COALESCE(?, approved_amount),
            paid_amount = COALESCE(?, paid_amount),
            resolution_date = COALESCE(?, resolution_date),
            resolution_notes = COALESCE(?, resolution_notes),
            document_urls = COALESCE(?, document_urls),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(
      data.status,
      data.approvedAmount,
      data.paidAmount,
      data.resolutionDate,
      data.resolutionNotes,
      data.documentUrls ? JSON.stringify(data.documentUrls) : null,
      req.params.id,
    );

    res.json({ message: 'Claim bijgewerkt' });
  }),
);

export default router;
