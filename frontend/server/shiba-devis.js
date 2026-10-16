import { randomUUID } from "node:crypto";
import { simulateAid, projectInput } from "../shared/aid-engine.js";
import {
  devisDatabase,
  devisIdentity,
  devisRedis,
  readDevisBody,
  rateRequest,
  checked,
  sendDevisError,
  fail,
} from "./lib/devis-security.js";
export function createDevisHandler(deps = {}) {
  const database = deps.database || devisDatabase,
    identity = deps.identity || devisIdentity,
    rate = deps.rate || rateRequest,
    redisClient = deps.redis || devisRedis;
  return async function (req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Allow", "GET, POST, DELETE");
    try {
      await rate(req, "requests");
      if (req.method === "GET" || req.method === "DELETE") {
        const { user, db } = await identity(req);
        if (req.method === "GET") {
          const rows = await checked(
            db
              .from("shiba_devis_simulations")
              .select("id,snapshot,previous_id,created_at")
              .eq("owner_id", user.id)
              .order("created_at", { ascending: false })
              .limit(30),
          );
          return res.status(200).json({ ok: true, simulations: rows });
        }
        if (!/^[0-9a-f-]{36}$/i.test(req.query?.id || ""))
          throw fail(400, "Identifiant invalide.");
        await checked(
          db
            .from("shiba_devis_simulations")
            .delete()
            .eq("id", req.query.id)
            .eq("owner_id", user.id),
        );
        return res.status(200).json({ ok: true });
      }
      if (req.method !== "POST") throw fail(405, "Méthode non autorisée.");
      const body = await readDevisBody(req);
      const db = database();
      if (body.action === "save") {
        const { user } = await identity(req);
        if (!/^[0-9a-f-]{36}$/i.test(body.ticket || ""))
          throw fail(400, "Préparez une simulation avant de l’enregistrer.");
        const stored = await redisClient().get(
          `carnetpass:devis:simulation:${body.ticket}`,
        );
        if (!stored || stored.ownerId !== user.id)
          throw fail(
            409,
            "Simulation expirée : recalculez avant de l’enregistrer.",
          );
        // Reusing a ticket updates no prior snapshot; duplicate retries are prevented by UUID.
        let previousId = null;
        if (body.previousId) {
          const old = await checked(
            db
              .from("shiba_devis_simulations")
              .select("id")
              .eq("id", body.previousId)
              .eq("owner_id", user.id)
              .maybeSingle(),
          );
          if (!old) throw fail(403, "Simulation précédente inaccessible.");
          previousId = old.id;
        }
        const row = await checked(
          db
            .from("shiba_devis_simulations")
            .upsert(
              {
                id: body.ticket,
                owner_id: user.id,
                company_id: stored.companyId,
                snapshot: stored.result,
                previous_id: previousId,
              },
              { onConflict: "id", ignoreDuplicates: true },
            )
            .select("id"),
        );
        return res
          .status(200)
          .json({ ok: true, id: row?.[0]?.id || body.ticket });
      }
      if (body.action !== "simulate") throw fail(400, "Action inconnue.");
      let input;
      try {
        input = projectInput(body.project);
      } catch {
        throw fail(
          400,
          "Informations du projet invalides. Vérifiez les champs saisis.",
        );
      }
      const versions = await checked(
        db
          .from("shiba_aid_versions")
          .select("id,slug,version,status,validated_at,validated_by,rule")
          .eq("status", "published")
          .limit(100),
      );
      let context = null;
      if (req.headers?.authorization) context = await identity(req);
      let rge = null;
      const siret = String(body.siret || "");
      if (siret) {
        if (!/^\d{14}$/.test(siret)) throw fail(400, "SIRET invalide.");
        const qualifications = await checked(
          db
            .from("company_rge_qualifications")
            .select(
              "siret,domains,valid_from,valid_until,verified_by,verified_at,verification_source",
            )
            .eq("siret", siret)
            .not("verified_by", "is", null)
            .order("verified_at", { ascending: false })
            .limit(30),
        );
        rge =
          qualifications.find(
            (q) =>
              q.domains.includes(input.plannedEquipment) &&
              q.valid_from <=
                (input.workDate || new Date().toISOString().slice(0, 10)) &&
              q.valid_until >=
                (input.workDate || new Date().toISOString().slice(0, 10)),
          ) ||
          qualifications[0] ||
          null;
      }
      const sources = await checked(
        db
          .from("shiba_aid_sources")
          .select("url,status,last_success_at,freshness_days")
          .limit(100),
      );
      const result = simulateAid(input, versions, {
        rge,
        siret,
        sourceStates: sources,
      });
      result.sourceWarnings = sources
        .filter(
          (s) =>
            ["changed", "unavailable"].includes(s.status) ||
            !s.last_success_at ||
            Date.now() - Date.parse(s.last_success_at) >
              s.freshness_days * 86400000,
        )
        .map((s) => ({
          url: s.url,
          status: s.status,
          lastSuccessAt: s.last_success_at,
        }));
      let ticket = null;
      if (context) {
        ticket = randomUUID();
        await redisClient().set(
          `carnetpass:devis:simulation:${ticket}`,
          { ownerId: context.user.id, companyId: null, result },
          { ex: 1800 },
        );
      }
      return res.status(200).json({ ok: true, result, ticket });
    } catch (error) {
      return sendDevisError(res, error);
    }
  };
}
export default createDevisHandler();
