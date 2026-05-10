/**
 * MAOS Commission Engine v2.1
 * Single source of truth for all commission calculations.
 * Handles: Full Cycle, Setter, Closer, Standalone Closer, Split, Admin/CEO.
 * Fully supports dynamic admin-controlled rates stored in global_settings.
 */

// ─── Default Rates ────────────────────────────────────────────────────────────
export interface CommissionRates {
  full_cycle_closer: { setup: number; mrr: number };
  setter: { setup: number; mrr: number; bonus: number };
  closer: { setup: number; mrr: number };
  standalone_closer: { setup: number; mrr: number };
  split_pool: { setup: number; mrr: number };
}

export const DEFAULT_RATES: CommissionRates = {
  full_cycle_closer: { setup: 0.20, mrr: 0.20 },
  setter:            { setup: 0.03, mrr: 0.03, bonus: 25.00 },
  closer:            { setup: 0.10, mrr: 0.10 },     // paired with setter
  standalone_closer: { setup: 0.10, mrr: 0.10 },     // works alone
  split_pool:        { setup: 0.20, mrr: 0.20 },     // total pool, split between two
};

// ─── Parse Custom Database Rates ──────────────────────────────────────────────
export function getEffectiveRates(customRates?: any): CommissionRates {
  if (!customRates) return DEFAULT_RATES;
  
  const parsePct = (val: any, fallback: number): number => {
    if (val === undefined || val === null) return fallback;
    const num = Number(val);
    // If it's a percentage (like 20), divide by 100 to get decimal (0.20)
    // If it is already a decimal (less than 1 and greater than 0), keep it
    if (num > 0 && num < 1) return num;
    return isNaN(num) ? fallback : num / 100;
  };
  
  const parseRaw = (val: any, fallback: number): number => {
    if (val === undefined || val === null) return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };

  return {
    full_cycle_closer: {
      setup: parsePct(customRates.full_cycle_closer?.setup, DEFAULT_RATES.full_cycle_closer.setup),
      mrr: parsePct(customRates.full_cycle_closer?.mrr, DEFAULT_RATES.full_cycle_closer.mrr),
    },
    setter: {
      setup: parsePct(customRates.setter?.setup, DEFAULT_RATES.setter.setup),
      mrr: parsePct(customRates.setter?.mrr, DEFAULT_RATES.setter.mrr),
      bonus: parseRaw(customRates.setter?.bonus, DEFAULT_RATES.setter.bonus),
    },
    closer: {
      setup: parsePct(customRates.closer?.setup, DEFAULT_RATES.closer.setup),
      mrr: parsePct(customRates.closer?.mrr, DEFAULT_RATES.closer.mrr),
    },
    standalone_closer: {
      setup: parsePct(customRates.standalone_closer?.setup, DEFAULT_RATES.standalone_closer.setup),
      mrr: parsePct(customRates.standalone_closer?.mrr, DEFAULT_RATES.standalone_closer.mrr),
    },
    split_pool: {
      setup: parsePct(customRates.split_pool?.setup, DEFAULT_RATES.split_pool.setup),
      mrr: parsePct(customRates.split_pool?.mrr, DEFAULT_RATES.split_pool.mrr),
    },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type DealType = 'full_cycle' | 'setter_closer' | 'split' | 'admin_closed' | 'standalone_closer';
export type PlanType = 'minimum' | 'premium' | 'custom';
export type CommissionType = 'setup' | 'mrr' | 'setter_bonus';
export type CommissionStatus = 'pending_approval' | 'approved' | 'paid' | 'processing' | 'pending';

export interface CommissionLine {
  user_id: string;
  commission_role: string;
  amount: number;
  type: CommissionType;
  status: 'pending_approval';
  is_recurring: boolean;
  split_percentage: number;
  setter_id?: string;
  closer_id?: string;
  starts_at_month?: number;
}

export interface CommissionPreview {
  label: string;
  type: CommissionType;
  amount: number;
  is_recurring: boolean;
  recipient_label: string;
  is_deferred?: boolean;
}

/** Round to 2 decimal places */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function getPlanDefaults(plan: PlanType, customPlans?: any) {
  if (customPlans) {
    if (plan === 'minimum') return { setup: Number(customPlans.minimum?.setup ?? 1200), mrr: Number(customPlans.minimum?.mrr ?? 997) };
    if (plan === 'premium') return { setup: Number(customPlans.premium?.setup ?? 3000), mrr: Number(customPlans.premium?.mrr ?? 997) };
  }
  if (plan === 'minimum') return { setup: 1200, mrr: 997 };
  if (plan === 'premium') return { setup: 3000, mrr: 997 }; // MRR starts month 4
  return { setup: 0, mrr: 0 };
}

export function getPlanLabel(p: PlanType, customPlans?: any): string {
  if (customPlans) {
    if (p === 'minimum') {
      const name = customPlans.minimum?.name || 'Minimum Plan';
      const setup = Number(customPlans.minimum?.setup ?? 1200);
      const mrr = Number(customPlans.minimum?.mrr ?? 997);
      return `${name} ($${setup.toLocaleString()} setup + $${mrr.toLocaleString()}/mo)`;
    }
    if (p === 'premium') {
      const name = customPlans.premium?.name || 'Premium Plan';
      const setup = Number(customPlans.premium?.setup ?? 3000);
      const mrr = Number(customPlans.premium?.mrr ?? 997);
      return `${name} ($${setup.toLocaleString()} upfront + $${mrr.toLocaleString()}/mo from month 4)`;
    }
  }
  if (p === 'minimum') return 'Minimum Plan ($1,200 setup + $997/mo)';
  if (p === 'premium') return 'Premium Plan ($3,000 upfront + $997/mo from month 4)';
  return 'Custom Plan';
}

// ─── Commission Calculations ──────────────────────────────────────────────────
export function calculateCommissions(params: {
  clientId: string;
  planType: PlanType;
  setupFee: number;
  mrr: number;
  dealType: DealType;
  personAId?: string;
  personBId?: string;
  splitPctA?: number;
  splitPctB?: number;
  customRates?: any;
}): CommissionLine[] {
  const {
    planType,
    setupFee,
    mrr,
    dealType,
    personAId,
    personBId,
    splitPctA = 50,
    splitPctB = 50,
    customRates,
  } = params;

  const RATES = getEffectiveRates(customRates);
  const lines: CommissionLine[] = [];
  const mrrStartsAt = planType === 'premium' ? 4 : 1;

  // ── Full Cycle Closer ──────────────────────────────────────────────────────
  if (dealType === 'full_cycle' && personAId) {
    if (setupFee > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'full_cycle_closer',
        amount: r2(setupFee * RATES.full_cycle_closer.setup),
        type: 'setup',
        status: 'pending_approval',
        is_recurring: false,
        split_percentage: RATES.full_cycle_closer.setup * 100,
      });
    }
    if (mrr > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'full_cycle_closer',
        amount: r2(mrr * RATES.full_cycle_closer.mrr),
        type: 'mrr',
        status: 'pending_approval',
        is_recurring: true,
        split_percentage: RATES.full_cycle_closer.mrr * 100,
        starts_at_month: mrrStartsAt,
      });
    }
  }

  // ── Setter + Closer pair ───────────────────────────────────────────────────
  else if (dealType === 'setter_closer' && personAId) {
    if (setupFee > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'setter',
        amount: r2(setupFee * RATES.setter.setup),
        type: 'setup',
        status: 'pending_approval',
        is_recurring: false,
        split_percentage: RATES.setter.setup * 100,
        closer_id: personBId,
      });
    }
    // Setter bonus (always)
    lines.push({
      user_id: personAId,
      commission_role: 'setter',
      amount: RATES.setter.bonus,
      type: 'setter_bonus',
      status: 'pending_approval',
      is_recurring: false,
      split_percentage: 100,
      closer_id: personBId,
    });
    if (mrr > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'setter',
        amount: r2(mrr * RATES.setter.mrr),
        type: 'mrr',
        status: 'pending_approval',
        is_recurring: true,
        split_percentage: RATES.setter.mrr * 100,
        closer_id: personBId,
        starts_at_month: mrrStartsAt,
      });
    }

    if (personBId) {
      if (setupFee > 0) {
        lines.push({
          user_id: personBId,
          commission_role: 'closer',
          amount: r2(setupFee * RATES.closer.setup),
          type: 'setup',
          status: 'pending_approval',
          is_recurring: false,
          split_percentage: RATES.closer.setup * 100,
          setter_id: personAId,
        });
      }
      if (mrr > 0) {
        lines.push({
          user_id: personBId,
          commission_role: 'closer',
          amount: r2(mrr * RATES.closer.mrr),
          type: 'mrr',
          status: 'pending_approval',
          is_recurring: true,
          split_percentage: RATES.closer.mrr * 100,
          setter_id: personAId,
          starts_at_month: mrrStartsAt,
        });
      }
    }
  }

  // ── Standalone Closer ──────────────────────────────────────────────────────
  else if (dealType === 'standalone_closer' && personAId) {
    if (setupFee > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'standalone_closer',
        amount: r2(setupFee * RATES.standalone_closer.setup),
        type: 'setup',
        status: 'pending_approval',
        is_recurring: false,
        split_percentage: RATES.standalone_closer.setup * 100,
      });
    }
    if (mrr > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'standalone_closer',
        amount: r2(mrr * RATES.standalone_closer.mrr),
        type: 'mrr',
        status: 'pending_approval',
        is_recurring: true,
        split_percentage: RATES.standalone_closer.mrr * 100,
        starts_at_month: mrrStartsAt,
      });
    }
  }

  // ── Split Deal (custom %) ──────────────────────────────────────────────────
  else if (dealType === 'split' && personAId && personBId) {
    const poolSetup = setupFee * RATES.split_pool.setup;
    const poolMrr = mrr * RATES.split_pool.mrr;

    const fracA = splitPctA / 100;
    const fracB = splitPctB / 100;

    if (setupFee > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'split_a',
        amount: r2(poolSetup * fracA),
        type: 'setup',
        status: 'pending_approval',
        is_recurring: false,
        split_percentage: RATES.split_pool.setup * splitPctA,
        split_pct_a: splitPctA,
        split_pct_b: splitPctB,
      } as any);
      lines.push({
        user_id: personBId,
        commission_role: 'split_b',
        amount: r2(poolSetup * fracB),
        type: 'setup',
        status: 'pending_approval',
        is_recurring: false,
        split_percentage: RATES.split_pool.setup * splitPctB,
        split_pct_a: splitPctA,
        split_pct_b: splitPctB,
      } as any);
    }
    if (mrr > 0) {
      lines.push({
        user_id: personAId,
        commission_role: 'split_a',
        amount: r2(poolMrr * fracA),
        type: 'mrr',
        status: 'pending_approval',
        is_recurring: true,
        split_percentage: RATES.split_pool.mrr * splitPctA,
        starts_at_month: mrrStartsAt,
      } as any);
      lines.push({
        user_id: personBId,
        commission_role: 'split_b',
        amount: r2(poolMrr * fracB),
        type: 'mrr',
        status: 'pending_approval',
        is_recurring: true,
        split_percentage: RATES.split_pool.mrr * splitPctB,
        starts_at_month: mrrStartsAt,
      } as any);
    }
  }

  return lines;
}

// ─── Preview Generator ────────────────────────────────────────────────────────
export function previewCommissions(params: {
  dealType: DealType;
  planType: PlanType;
  setupFee: number;
  mrr: number;
  personAName?: string;
  personBName?: string;
  splitPctA?: number;
  splitPctB?: number;
  customRates?: any;
}): CommissionPreview[] {
  const {
    dealType,
    planType,
    setupFee,
    mrr,
    personAName = 'You',
    personBName,
    splitPctA = 50,
    splitPctB = 50,
    customRates,
  } = params;
  
  const RATES = getEffectiveRates(customRates);
  const isPremium = planType === 'premium';
  const previews: CommissionPreview[] = [];

  if (dealType === 'full_cycle') {
    if (setupFee > 0) previews.push({
      label: `${(RATES.full_cycle_closer.setup * 100).toFixed(0)}% of $${setupFee.toLocaleString()} ${isPremium ? 'upfront' : 'setup'}`,
      type: 'setup', amount: r2(setupFee * RATES.full_cycle_closer.setup),
      is_recurring: false, recipient_label: personAName,
    });
    if (mrr > 0) previews.push({
      label: `${(RATES.full_cycle_closer.mrr * 100).toFixed(0)}% of $${mrr}/mo MRR${isPremium ? ' (from month 4)' : ''}`,
      type: 'mrr', amount: r2(mrr * RATES.full_cycle_closer.mrr),
      is_recurring: true, recipient_label: personAName,
      is_deferred: isPremium,
    });
  }

  else if (dealType === 'setter_closer') {
    if (setupFee > 0) previews.push({
      label: `${(RATES.setter.setup * 100).toFixed(0)}% of $${setupFee.toLocaleString()} setup → ${personAName}`,
      type: 'setup', amount: r2(setupFee * RATES.setter.setup),
      is_recurring: false, recipient_label: personAName,
    });
    previews.push({
      label: `$${RATES.setter.bonus} closer bonus → ${personAName}`,
      type: 'setter_bonus', amount: RATES.setter.bonus,
      is_recurring: false, recipient_label: personAName,
    });
    if (mrr > 0) previews.push({
      label: `${(RATES.setter.mrr * 100).toFixed(0)}% of $${mrr}/mo MRR → ${personAName}${isPremium ? ' (from month 4)' : ''}`,
      type: 'mrr', amount: r2(mrr * RATES.setter.mrr),
      is_recurring: true, recipient_label: personAName,
      is_deferred: isPremium,
    });
    if (personBName) {
      if (setupFee > 0) previews.push({
        label: `${(RATES.closer.setup * 100).toFixed(0)}% of $${setupFee.toLocaleString()} setup → ${personBName}`,
        type: 'setup', amount: r2(setupFee * RATES.closer.setup),
        is_recurring: false, recipient_label: personBName,
      });
      if (mrr > 0) previews.push({
        label: `${(RATES.closer.mrr * 100).toFixed(0)}% of $${mrr}/mo MRR → ${personBName}${isPremium ? ' (from month 4)' : ''}`,
        type: 'mrr', amount: r2(mrr * RATES.closer.mrr),
        is_recurring: true, recipient_label: personBName,
        is_deferred: isPremium,
      });
    } else {
      previews.push({
        label: 'Closer is CEO — remaining revenue stays with agency',
        type: 'setup', amount: 0,
        is_recurring: false, recipient_label: 'Agency',
      });
    }
  }

  else if (dealType === 'standalone_closer') {
    if (setupFee > 0) previews.push({
      label: `${(RATES.standalone_closer.setup * 100).toFixed(0)}% of $${setupFee.toLocaleString()} setup`,
      type: 'setup', amount: r2(setupFee * RATES.standalone_closer.setup),
      is_recurring: false, recipient_label: personAName,
    });
    if (mrr > 0) previews.push({
      label: `${(RATES.standalone_closer.mrr * 100).toFixed(0)}% of $${mrr}/mo MRR${isPremium ? ' (from month 4)' : ''}`,
      type: 'mrr', amount: r2(mrr * RATES.standalone_closer.mrr),
      is_recurring: true, recipient_label: personAName,
      is_deferred: isPremium,
    });
  }

  else if (dealType === 'split') {
    const poolSetup = r2(setupFee * RATES.split_pool.setup);
    const poolMrr = r2(mrr * RATES.split_pool.mrr);
    if (setupFee > 0) {
      previews.push({ label: `${splitPctA}% of $${poolSetup} setup pool → ${personAName}`, type: 'setup', amount: r2(poolSetup * splitPctA / 100), is_recurring: false, recipient_label: personAName });
      if (personBName) previews.push({ label: `${splitPctB}% of $${poolSetup} setup pool → ${personBName}`, type: 'setup', amount: r2(poolSetup * splitPctB / 100), is_recurring: false, recipient_label: personBName });
    }
    if (mrr > 0) {
      previews.push({ label: `${splitPctA}% of $${poolMrr}/mo MRR pool → ${personAName}${isPremium ? ' (from month 4)' : ''}`, type: 'mrr', amount: r2(poolMrr * splitPctA / 100), is_recurring: true, recipient_label: personAName, is_deferred: isPremium });
      if (personBName) previews.push({ label: `${splitPctB}% of $${poolMrr}/mo MRR pool → ${personBName}${isPremium ? ' (from month 4)' : ''}`, type: 'mrr', amount: r2(poolMrr * splitPctB / 100), is_recurring: true, recipient_label: personBName, is_deferred: isPremium });
    }
  }

  else if (dealType === 'admin_closed') {
    previews.push({
      label: '100% of revenue → Company (CEO closed this deal)',
      type: 'setup', amount: 0,
      is_recurring: false, recipient_label: 'Agency Revenue',
    });
  }

  return previews;
}

export function getDealTypeLabel(d: DealType): string {
  const map: Record<DealType, string> = {
    full_cycle: 'Full Cycle Closer',
    setter_closer: 'Setter + Closer Pair',
    standalone_closer: 'Standalone Closer',
    split: 'Split Deal (Custom %)',
    admin_closed: 'CEO/Admin Closed — Agency Revenue',
  };
  return map[d] || d;
}
