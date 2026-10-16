import {
  validateAidRule,
  qualifiedRge,
  officialSource,
} from "../shared/aid-engine.js";
import { initialAidDrafts } from "./lib/aid-drafts.js";
import { watchAidSources } from "./lib/aid-watch.js";
import {
  devisOperator,
  rateRequest,
  readDevisBody,
  checked,
  sendDevisError,
  fail,
} from "./lib/devis-security.js";
export default async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "GET, POST");
  try {
    if (!["GET", "POST"].includes(req.method))
      throw fail(405, "Méthode non autorisée.");
    const { db, user } = await devisOperator(req);
    await rateRequest(req, "admin", user.id, 30);
    if (req.method === "GET") {
      const versions = await checked(
        db
          .from("shiba_aid_versions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      );
      const sources = await checked(
        db
          .from("shiba_aid_sources")
          .select(
            "url,check_interval_days,freshness_days,status,last_attempt_at,last_success_at",
          )
          .limit(100),
      );
      const observations = await checked(
        db
          .from("shiba_aid_observations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(15),
      );
      const events = await checked(
        db
          .from("shiba_aid_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      );
      const qualifications = await checked(
        db
          .from("company_rge_qualifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      );
      return res
        .status(200)
        .json({
          ok: true,
          versions,
          sources,
          observations,
          events,
          qualifications,
        });
    }
    const body = await readDevisBody(req, 160000);
    if (body.action === "watch")
      return res
        .status(200)
        .json({
          ok: true,
          outcomes: await watchAidSources({ force: true, db }),
        });
    if (body.action === "source-settings") {
      if (
        !officialSource(body.url) ||
        !Number.isInteger(body.intervalDays) ||
        body.intervalDays < 1 ||
        body.intervalDays > 90 ||
        !Number.isInteger(body.freshnessDays) ||
        body.freshnessDays < 1 ||
        body.freshnessDays > 366
      )
        throw fail(400, "Paramètres invalides.");
      await checked(
        db
          .from("shiba_aid_sources")
          .update({
            check_interval_days: body.intervalDays,
            freshness_days: body.freshnessDays,
          })
          .eq("url", body.url),
      );
      return res.status(200).json({ ok: true });
    }
    if (body.action === "seed" || body.action === "draft") {
      const rules = body.action === "seed" ? initialAidDrafts : [body.rule];
      for (const rule of rules) {
        validateAidRule(rule);
        await checked(
          db.rpc("shiba_aid_new_draft", { p_actor: user.id, p_rule: rule }),
        );
        for (const source of rule.sources)
          await checked(
            db
              .from("shiba_aid_sources")
              .upsert(
                { url: source.url },
                { onConflict: "url", ignoreDuplicates: true },
              ),
          );
      }
      return res.status(200).json({ ok: true });
    }
    if (
      ["validate", "publish", "rollback", "suspend", "archive"].includes(
        body.action,
      )
    ) {
      if (!/^[0-9a-f-]{36}$/i.test(body.id || ""))
        throw fail(400, "Version invalide.");
      const version = await checked(
        db
          .from("shiba_aid_versions")
          .select("*")
          .eq("id", body.id)
          .maybeSingle(),
      );
      if (!version) throw fail(404, "Version introuvable.");
      validateAidRule(version.rule);
      if (["validate", "publish", "rollback"].includes(body.action)) {
        const sources = await checked(
          db
            .from("shiba_aid_sources")
            .select("*")
            .in(
              "url",
              version.rule.sources.map((s) => s.url),
            ),
        );
        if (
          sources.length !== version.rule.sources.length ||
          sources.some(
            (s) =>
              !s.last_success_at ||
              Date.now() - Date.parse(s.last_success_at) >
                Math.min(s.freshness_days, version.rule.freshnessDays) *
                  86400000,
          )
        )
          throw fail(
            409,
            "Consultez avec succès toutes les sources avant validation ou publication.",
          );
        if (
          body.action === "validate" &&
          String(body.note || "").trim().length < 20
        )
          throw fail(
            400,
            "Indiquez les règles, dates et différences effectivement contrôlées.",
          );
      }
      await checked(
        db.rpc("shiba_aid_transition", {
          p_actor: user.id,
          p_id: body.id,
          p_action: body.action,
          p_note: String(body.note || "").slice(0, 2000),
        }),
        "Transition refusée : vérifiez statut, période et validation.",
      );
      return res.status(200).json({ ok: true });
    }
    if (body.action === "review-observation") {
      await checked(
        db
          .from("shiba_aid_observations")
          .update({
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", body.id),
      );
      return res.status(200).json({ ok: true });
    }
    if (body.action === "verify-rge" || body.action === "revoke-rge") {
      const q = await checked(
        db
          .from("company_rge_qualifications")
          .select("*")
          .eq("id", body.id)
          .maybeSingle(),
      );
      if (!q) throw fail(404, "Qualification absente.");
      const company = await checked(
        db
          .from("companies")
          .select("siret")
          .eq("id", q.company_id)
          .maybeSingle(),
      );
      if (
        body.action === "verify-rge" &&
        (!officialSource(body.source) ||
          !body.source.startsWith(
            "https://france-renov.gouv.fr/annuaire-rge/",
          ) ||
          company?.siret !== q.siret ||
          ["expired", "unsuitable"].includes(
            qualifiedRge(q, {
              siret: company?.siret,
              domain: q.domains[0],
              date: new Date().toISOString().slice(0, 10),
            }).status,
          ))
      )
        throw fail(
          409,
          "SIRET, domaine et période doivent correspondre à l’annuaire officiel.",
        );
      if (body.action === "verify-rge" && body.confirmOfficial !== true)
        throw fail(
          400,
          "Confirmez le contrôle manuel dans l’annuaire officiel.",
        );
      await checked(
        db
          .from("company_rge_qualifications")
          .update(
            body.action === "verify-rge"
              ? {
                  verified_by: user.id,
                  verified_at: new Date().toISOString(),
                  verification_source: body.source,
                }
              : {
                  verified_by: null,
                  verified_at: null,
                  verification_source: null,
                },
          )
          .eq("id", q.id),
      );
      await checked(
        db
          .from("shiba_aid_events")
          .insert({
            actor_id: user.id,
            action: body.action,
            note: `Qualification ${q.id} · ${q.siret} · ${body.source || "Vérification retirée"}`,
          }),
      );
      return res.status(200).json({ ok: true });
    }
    throw fail(400, "Action inconnue.");
  } catch (error) {
    return sendDevisError(res, error);
  }
}
