import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import catalog from '../src/data/equipment-index.json' with { type: 'json' };
import { canonicalPlateImage, reservePlateBudget, PLATE_RESPONSE_FORMAT, PLATE_SYSTEM_PROMPT } from './plate-scan.js';
import { sanitizePlateResult, plateCandidates, confirmPlateFields } from '../shared/plate-scan.js';
import { devisRedis, rateRequest, readDevisBody, fail } from './lib/devis-security.js';
import { buildThermodynamicPdf } from './lib/thermodynamic-document-pdf.js';
import { normalizeThermodynamicData } from './lib/thermodynamic-document-schema.js';
import { openIsolatedTestAccount, testAccountConfiguration } from './lib/test-account.js';
import { testStripeAction, testStripeConfigured } from './lib/admin-test-stripe.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// This handler receives an already verified founder + MFA context. It never uses
// public companies, equipment, subscriptions, storage, mail or blockchain writes.
export async function adminTestWorkspace(req, res, { user, database, env = process.env,
  rate = rateRequest, imageReader = canonicalPlateImage, reserve = reservePlateBudget,
  redis = devisRedis, analyze, stripeRequest = fetch } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!testAccountConfiguration(env)) throw fail(404, 'Espace de test indisponible.');
    await openIsolatedTestAccount({ env, user, database });
    async function command(action, id = null, data = {}) {
      const result = await database.rpc('admin_test_command', { p_actor: user.id, p_action: action, p_id: id, p_data: data });
      if (result.error) throw fail(409, 'Action de test refusée. Rechargez votre espace et réessayez.');
      return result.data;
    }
    if (req.method === 'GET') {
      if (req.query?.document) {
        if (!uuid.test(req.query.document)) throw fail(400, 'Document invalide.');
        const record = await command('get', req.query.document);
        if (record.kind !== 'document') throw fail(404, 'Document de test introuvable.');
        const bytes = buildThermodynamicPdf(record.data, { testMode: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="TEST-${record.id}.pdf"`);
        return res.status(200).send(bytes);
      }
      const workspace = await command('snapshot');
      // Stripe identifiers stay server-side; the UI only needs the test entitlement.
      workspace.billing = { status: workspace.billing.status || 'none', paidUntil: workspace.billing.paidUntil || null,
        cancelAtPeriodEnd: workspace.billing.cancelAtPeriodEnd === true, configured: testStripeConfigured(env) };
      return res.status(200).json({ ok: true, workspace });
    }
    if (req.method !== 'POST') throw fail(405, 'Méthode non autorisée.');
    await rate(req, 'admin-test-workspace', user.id, 30);
    const body = await readDevisBody(req, 3000000);
    if (body.action === 'analyze') {
      if (!analyze && !env.OPENAI_API_KEY) throw fail(503, 'Scan IA indisponible ; utilisez la saisie manuelle.');
      const image = await imageReader(body.image);
      await reserve(redis(), user.id, { ...env, VERCEL_ENV: 'admin-test' });
      let raw;
      if (analyze) raw = await analyze(image);
      else {
        const ai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 25000, maxRetries: 0 });
        const output = await ai.chat.completions.create({ model: 'gpt-4.1-mini', store: false, max_completion_tokens: 1600,
          response_format: PLATE_RESPONSE_FORMAT, messages: [{ role: 'system', content: PLATE_SYSTEM_PROMPT },
            { role: 'user', content: [{ type: 'image_url', image_url: { url: image.dataUrl, detail: 'high' } }] }] });
        raw = JSON.parse(output.choices[0].message.content);
      }
      const reading = sanitizePlateResult(raw);
      const candidates = plateCandidates(Object.fromEntries(Object.entries(reading.fields).map(([k, v]) => [k, v.value])), catalog.equipments).slice(0, 10);
      const ticket = randomUUID();
      await command('save_scan', ticket, { ...reading, candidates, imageHash: image.hash });
      return res.status(200).json({ ok: true, ticket, ...reading, candidates });
    }
    if (body.action === 'save-equipment') {
      if (!uuid.test(body.requestId)) throw fail(400, 'Identifiant de requête invalide.');
      let analysis = null, candidate = null;
      if (body.ticket) {
        if (!uuid.test(body.ticket)) throw fail(400, 'Scan invalide.');
        const scan = await command('get', body.ticket);
        if (scan.kind !== 'scan') throw fail(400, 'Scan invalide.');
        analysis = scan.data;
        candidate = analysis.candidates.find(item => item.equipmentId === body.candidateId) || null;
      }
      const fields = confirmPlateFields(body.fields, analysis, candidate);
      if (!fields.brand.value || !fields.model.value || !fields.equipmentType.value) throw fail(400, 'Marque, modèle et type requis.');
      const record = await command('save_equipment', body.requestId, { fields, environment: 'test' });
      return res.status(200).json({ ok: true, record });
    }
    if (body.action === 'create-document') {
      if (!uuid.test(body.equipmentId) || !uuid.test(body.requestId)) throw fail(400, 'Équipement invalide.');
      const equipment = await command('get', body.equipmentId);
      if (equipment.kind !== 'equipment') throw fail(404, 'Équipement de test introuvable.');
      const values = Object.fromEntries(Object.entries(equipment.data.fields).map(([k, v]) => [k, v.value]));
      const kind = 'climate_maintenance';
      const form = normalizeThermodynamicData(kind, { holderName: 'Client fictif — TEST', holderAddress: 'Installation fictive — TEST',
        technicianName: 'Technicien de test', visitDate: new Date().toISOString().slice(0, 10), workPerformed: String(body.notes || 'Entretien de démonstration').slice(0, 2000) });
      const record = await command('save_document', body.requestId, { id: body.requestId, kind, issued_at: new Date().toISOString(),
        equipment_snapshot: { brand: values.brand, model: values.model, product_reference: values.productReference, serial_number: values.serialNumber },
        intervention_id: `TEST-${equipment.id}`, intervention_snapshot: {}, form_data: form,
        operator_signature: { name: 'TEST — non signé', strokes: [] }, holder_signature: { name: 'TEST — non signé', strokes: [] } });
      return res.status(200).json({ ok: true, record });
    }
    if (['checkout', 'sync-billing', 'portal', 'invoices'].includes(body.action)) {
      const result = await testStripeAction(body, { command, env, user, request: stripeRequest });
      return res.status(200).json({ ok: true, ...result });
    }
    throw fail(400, 'Action de test inconnue.');
  } catch (error) {
    return res.status(error.status || 503).json({ ok: false, message: error.status ? error.message : 'Le test est momentanément indisponible. Aucune donnée cliente n’a été modifiée.' });
  }
}
