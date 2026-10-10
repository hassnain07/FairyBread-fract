import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { Payment, PaymentIntent, PriceQuote } from '../../../types/payment';

function toPayment(r: any): Payment {
  return {
    id: r.id,
    family_id: r.family_id,
    family_name: r.family?.parent_name ?? r.family_name ?? undefined,
    type: r.type,
    amount_cents: r.amount_cents,
    gst_cents: r.gst_cents,
    total_cents: r.total_cents,
    status: r.status,
    reference: r.reference,
    term_label: r.term_label ?? undefined,
    proof_filename: r.proof_filename ?? undefined,
    review_note: r.review_note ?? undefined,
    details: r.details ?? {},
    created_at: r.created_at,
  };
}

const PAYMENT_SELECT = '*, family:families(parent_name)';

export function createPaymentsMethods(sb: AppSupabase) {
  return {
    async getPriceQuote(type: Payment['type'], familyId: string): Promise<PriceQuote> {
      const raw = await rpc<any>(sb, 'quote_price', { p_type: type, p_family_id: familyId });
      return {
        base_cents: raw.base_cents,
        registration_cents: raw.registration_cents,
        amount_cents: raw.amount_cents,
        gst_cents: raw.gst_cents,
        total_cents: raw.total_cents,
      };
    },

    async getPayments(familyId: string): Promise<Payment[]> {
      const { data, error } = await sb
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toPayment);
    },

    async getAllPayments(opts?: { status?: Payment['status'] }): Promise<Payment[]> {
      let q = sb.from('payments').select(PAYMENT_SELECT).order('created_at', { ascending: false });
      if (opts?.status) q = q.eq('status', opts.status);
      const { data, error } = await q;
      if (error) throw toAppError(error);
      return (data ?? []).map(toPayment);
    },

    async getPendingPayments(): Promise<Payment[]> {
      const { data, error } = await sb
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toPayment);
    },

    async submitPayment(intent: PaymentIntent, proof: File): Promise<Payment> {
      const id = crypto.randomUUID();
      const safe = proof.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `${intent.familyId}/${id}/${safe}`;

      const { error: upErr } = await sb.storage
        .from('payment-proofs')
        .upload(path, proof, { contentType: proof.type, upsert: false });
      if (upErr) throw toAppError(upErr);

      const raw = await rpc<any>(sb, 'submit_payment', {
        p_id: id,
        p_family_id: intent.familyId,
        p_type: intent.type,
        p_proof_path: path,
        p_proof_filename: proof.name,
        p_child_id: 'childId' in intent ? intent.childId : null,
        p_class_session_id: intent.type === 'individual_class' ? intent.sessionId : null,
        p_assessment_date: intent.type === 'assessment' ? intent.date : null,
        p_assessment_time: intent.type === 'assessment' ? intent.time : null,
      });
      return toPayment(raw);
    },

    async getProofUrl(paymentId: string): Promise<string> {
      const { data: row, error } = await sb
        .from('payments')
        .select('proof_path')
        .eq('id', paymentId)
        .single();
      if (error) throw toAppError(error);
      if (!row?.proof_path) throw new Error('proof_missing');
      const { data, error: urlErr } = await sb.storage
        .from('payment-proofs')
        .createSignedUrl(row.proof_path, 31536000);
      if (urlErr) throw toAppError(urlErr);
      return data.signedUrl;
    },

    async verifyPayment(paymentId: string, action: 'approve' | 'reject', note?: string): Promise<Payment> {
      const raw = await rpc<any>(sb, 'verify_payment', {
        p_payment_id: paymentId,
        p_action: action,
        p_note: note ?? null,
      });
      return toPayment(raw);
    },

    async adminRecordPayment(input: {
      familyId: string;
      type: 'term' | 'individual_class';
      childId?: string;
      sessionId?: string;
      note?: string;
    }): Promise<Payment> {
      const raw = await rpc<any>(sb, 'admin_record_payment', {
        p_family_id: input.familyId,
        p_type: input.type,
        p_child_id: input.childId ?? null,
        p_class_session_id: input.sessionId ?? null,
        p_note: input.note ?? null,
      });
      return toPayment(raw);
    },
  };
}
