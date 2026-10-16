import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import {
  sanitizePlateResult,
  plateCandidates,
  confirmPlateFields,
} from "../shared/plate-scan.js";
import {
  createPlateHandler,
  canonicalPlateImage,
  reservePlateBudget,
  PLATE_RESPONSE_FORMAT,
} from "../server/plate-scan.js";
import { fail } from "../server/lib/devis-security.js";
const response = () => ({
  statusCode: 200,
  setHeader() {},
  status(n) {
    this.statusCode = n;
    return this;
  },
  json(v) {
    this.body = v;
    return this;
  },
});
const raw = {
  fields: {
    brand: { value: "Airwell", evidence: "AIRWELL" },
    model: { value: "AW-CBV007-N11", evidence: "Model: AW-CBV007-N11" },
    productReference: { value: "7SP04H038", evidence: "Ref: 7SP04H038" },
    serialNumber: {
      value: "PRIVATE-TEST-2024",
      evidence: "Serial: PRIVATE-TEST-2024",
    },
    manufactureYear: { value: "2024", evidence: "Serial: PRIVATE-TEST-2024" },
    equipmentType: { value: "air_conditioning", evidence: "Air conditioning" },
  },
};
test("model-only label survives extraction and proposes catalogue matches without inventing a brand", () => {
  const scan = sanitizePlateResult({ fields: {
    model: { value: "ThemaPlus Condens 30 -A (H-FR) R1", evidence: "ThemaPlus Condens 30 -A (H-FR) R1" },
  } });
  assert.equal(scan.fields.brand.value, "");
  assert.equal(scan.fields.model.value, "ThemaPlus Condens 30 -A (H-FR) R1");
  assert.equal(scan.fields.productReference.value, "");
  const entries = [
    { equipmentId: "a", brand: "Saunier Duval", model: "ThemaPlus Condens 30-A", variant: "H-FR", manufacturerReference: "0010017388" },
    { equipmentId: "b", brand: "Saunier Duval", model: "ThemaPlus Condens 25-A", variant: "H-FR", manufacturerReference: "other" },
  ];
  assert.deepEqual(plateCandidates({ model: scan.fields.model.value }, entries).map(c => c.equipmentId), ["a"]);
  assert.equal(plateCandidates({ brand: "Another brand", model: scan.fields.model.value }, entries).length, 0);
  assert.equal(plateCandidates({ serialNumber: "21164800100173881610015085N0" }, entries).length, 0);
  assert.equal(PLATE_RESPONSE_FORMAT.json_schema.strict, true);
  assert.equal(PLATE_RESPONSE_FORMAT.json_schema.schema.properties.fields.additionalProperties, false);
});
test("representative plate fields are uncertain, provenance is retained and a serial never supplies a year", () => {
  const scan = sanitizePlateResult(raw);
  assert.equal(scan.fields.brand.value, "Airwell");
  assert.equal(scan.fields.manufactureYear.value, "");
  assert.equal(scan.fields.serialNumber.value, "PRIVATE-TEST-2024");
  assert.ok(Object.values(scan.fields).every((f) => f.uncertain));
  assert.equal(
    sanitizePlateResult({
      fields: {
        manufactureYear: { value: "2024", evidence: "Manufactured in 2024" },
      },
    }).fields.manufactureYear.value,
    "2024",
  );
});
test("blurred or incomplete outputs leave unknown fields empty; unsupported values are removed", () => {
  assert.ok(
    Object.values(sanitizePlateResult({ fields: {} }).fields).every(
      (f) => f.value === "",
    ),
  );
  assert.equal(
    sanitizePlateResult({
      fields: {
        brand: { value: "Invented", evidence: "Unreadable" },
        model: { value: "???", evidence: "???" },
      },
    }).fields.brand.value,
    "",
  );
  assert.equal(
    sanitizePlateResult({
      fields: {
        manufactureYear: { value: "2099", evidence: "Manufacture 2099" },
      },
    }).fields.manufactureYear.value,
    "",
  );
});
test("ambiguous catalogue references propose candidates without selecting one; unknown models are allowed", () => {
  const catalog = [
    {
      equipmentId: "a",
      brand: "Elm Leblanc",
      model: "A",
      manufacturerReference: "001",
    },
    {
      equipmentId: "b",
      brand: "elm leblanc",
      model: "B",
      manufacturerReference: "001",
    },
  ];
  assert.equal(
    plateCandidates({ brand: "ELM", productReference: "00-1" }, catalog).length,
    2,
  );
  assert.equal(
    plateCandidates({ brand: "Unknown", model: "Model 1" }, catalog).length,
    0,
  );
  const fields = confirmPlateFields(
    {
      brand: "Unknown",
      model: "Model 1",
      serialNumber: "private",
      manufactureYear: "",
    },
    sanitizePlateResult({}),
  );
  assert.equal(fields.brand.provenance, "manual");
  assert.equal(fields.manufactureYear.value, "");
});
test("canonicalization checks bytes and MIME, strips metadata and limits real pixels", async () => {
  const c = createCanvas(300, 150);
  c.getContext("2d").fillText(
    "Synthetic plate: Model TEST-1, Serial PRIVATE-TEST",
    10,
    50,
  );
  const bytes = c.toBuffer("image/png");
  const r = await canonicalPlateImage(
    `data:image/png;base64,${bytes.toString("base64")}`,
  );
  assert.match(r.dataUrl, /^data:image\/jpeg;base64,/);
  assert.match(r.hash, /^[a-f0-9]{64}$/);
  await assert.rejects(
    canonicalPlateImage(
      "data:image/png;base64," + Buffer.from("not an image").toString("base64"),
    ),
    (e) => e.status === 415,
  );
  await assert.rejects(
    canonicalPlateImage("data:image/jpeg;base64," + bytes.toString("base64")),
    (e) => e.status === 415,
  );
});
test("authentication and budget rejection happen before any paid AI call", async () => {
  let calls = 0;
  const base = {
    company: async () => ({ user: { id: "u" }, company: { id: "c" } }),
    rate: async () => {},
    redis: () => ({}),
    image: async () => ({ dataUrl: "synthetic", hash: "hash" }),
    analyze: async () => {
      calls++;
      return raw;
    },
  };
  for (const deps of [
    {
      ...base,
      company: async () => {
        throw fail(401, "Auth required");
      },
    },
    {
      ...base,
      reserve: async () => {
        throw fail(429, "Budget reached");
      },
    },
  ]) {
    const res = response();
    await createPlateHandler(deps)(
      { method: "POST", body: { action: "analyze", image: "synthetic" } },
      res,
    );
    assert.ok([401, 429].includes(res.statusCode));
    assert.equal(calls, 0);
  }
});
test("provider permission errors do not masquerade as a user login error", async () => {
  const res = response();
  const handler = createPlateHandler({
    company: async () => ({ user: { id: "u" }, company: { id: "c" } }),
    rate: async () => {}, redis: () => ({}), reserve: async () => {},
    image: async () => ({ dataUrl: "synthetic", hash: "hash" }),
    analyze: async () => { throw Object.assign(new Error("Missing scopes: model.request"), { status: 401 }); },
  });
  await handler({ method: "POST", body: { action: "analyze", image: "synthetic" } }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /service IA/);
  assert.doesNotMatch(res.body.error, /model.request|Missing scopes/);
});
test("daily zero disables paid scans and reservations are atomic before analysis", async () => {
  let args;
  await assert.rejects(
    reservePlateBudget(
      {
        eval: async (script, keys, values) => {
          assert.match(script, /INCRBY/);
          args = values;
          return 0;
        },
      },
      "u",
      { SHIBA_SCAN_DAILY_BUDGET_MICRO_USD: "0" },
    ),
    (e) => e.status === 429,
  );
  assert.equal(args[1], 0);
  assert.ok(args[0] >= 10000);
});
test("scan stores only temporary fields and hash, and another company cannot confirm its ticket", async () => {
  const stored = new Map();
  const redis = {
    set: async (k, v) => stored.set(k, v),
    get: async (k) => stored.get(k),
    del: async (k) => stored.delete(k),
  };
  const deps = {
    company: async () => ({ user: { id: "u" }, company: { id: "c" } }),
    rate: async () => {},
    redis: () => redis,
    image: async () => ({ dataUrl: "PRIVATE_IMAGE", hash: "hash" }),
    reserve: async () => {},
    analyze: async () => raw,
  };
  const r = response();
  await createPlateHandler(deps)(
    { method: "POST", body: { action: "analyze", image: "PRIVATE_IMAGE" } },
    r,
  );
  assert.equal(r.statusCode, 200);
  assert.equal(
    JSON.stringify([...stored.values()]).includes("PRIVATE_IMAGE"),
    false,
  );
  const other = response();
  await createPlateHandler({
    ...deps,
    company: async () => ({ user: { id: "u" }, company: { id: "other" } }),
  })(
    {
      method: "POST",
      body: { action: "confirm", ticket: r.body.ticket, equipmentId: "victim" },
    },
    other,
  );
  assert.equal(other.statusCode, 403);
});
