import test from "node:test";
import assert from "node:assert/strict";
import { catalogModelFamilies, catalogModelLabel, catalogModelReferenceLabel, compareCatalogModels, catalogModelsWithPublishedDocuments, publishedDocumentsForEquipment, sharedNoticeBrandSummary } from "./platformDocumentLibrary.js";

test('PAC Atlantic families preserve indoor, outdoor and exact PDF associations', () => {
  const refs = ['alfea-extensa-a-i-mh-5-024119', 'alfea-extensa-a-i-5-woya060lfca-526200',
    'alfea-extensa-a-i-r32-mh-5-024302', 'alfea-excellia-a-i-mono-mh-11-024114',
    'alfea-excellia-a-i-mono-11-woyg112lht-526300'];
  const models = catalogModelsWithPublishedDocuments([], refs.map((ref,i) => ({ id: `pac-${i}`,
    manufacturer: 'Atlantic', model_name: ref, model_reference: ref, title: 'vue-eclatee',
    catalog_category: ref.includes('-mh-') ? 'heat_pump_indoor' : 'heat_pump_outdoor' })));
  assert.deepEqual(catalogModelFamilies(models).map(g => [g.name,g.count]), [
    ['Alféa Excellia A.I. Mono',2], ['Alféa Extensa A.I.',2], ['Alféa Extensa A.I. R32',1]]);
  assert.equal(catalogModelLabel(models[0]), 'Alféa Extensa A.I. · MH 5');
  assert.equal(catalogModelLabel(models[4]), 'Alféa Excellia A.I. Mono · 11 · WOYG112LHT');
  assert.equal(catalogModelReferenceLabel(models[4]), '526300');
  models.forEach((m,i) => assert.deepEqual(m.publishedDocuments.map(d => d.documentId), [`pac-${i}`]));
});

test('NeOvo EFU C and Plus are grouped separately and exact document associations stay intact', () => {
  const refs=['neovo-condens-efu-c-32-plus','neovo-condens-efu-c-32','neovo-condens-efu-c-19','neovo-condens-efu-c-24-plus','neovo-condens-efu-c-24'];
  const models=catalogModelsWithPublishedDocuments([],refs.map((ref,i)=>({id:`neovo-${i}`,manufacturer:'De Dietrich',model_name:ref,model_reference:ref,title:'notice-installation',catalog_category:'boiler'})));
  assert.deepEqual(catalogModelFamilies(models).map(f=>[f.name,f.count]),[['NeOvo Condens EFU C',3],['NeOvo Condens EFU C Plus',2]]);
  assert.deepEqual([...models].sort(compareCatalogModels).map(catalogModelReferenceLabel),['EFU C 19','EFU C 24','EFU C 32','EFU C 24 PLUS','EFU C 32 PLUS']);
  assert.equal(catalogModelLabel(models[0]),'NeOvo Condens EFU C 32 PLUS');
  for(const [i,model]of models.entries()){assert.equal(model.manufacturerReference,refs[i]);assert.deepEqual(model.publishedDocuments.map(d=>d.documentId),[`neovo-${i}`]);}
});

test('Vitodens types and Gazliner series are grouped without mixing exact references or PDFs', () => {
  const records = [
    ['Viessmann','VITODENS 200-W B2HA 35kW','vitodens-200-w-b2ha-35kw-7454861'],
    ['Viessmann','VITODENS 200-W B2HA 13kW solaire','vitodens-200-w-b2ha-13kw-solaire-7514753'],
    ['Viessmann','VITODENS 200-W B2HA 13kW','vitodens-200-w-b2ha-13kw-7510294'],
    ['Viessmann','VITODENS 200-W B2KE 1,9-25kW','vitodens-200-w-b2ke-1-9-25kw-7544721'],
    ['Frisquet','GAZLINER VENTOUSE 23 kW @9701000->9839999','gazliner-ventouse-23-kw-9701000-9839999'],
  ];
  const models = catalogModelsWithPublishedDocuments([], records.map(([manufacturer,model_name,model_reference],i)=>({id:`completion-${i}`,manufacturer,model_name,model_reference,title:'vue-eclatee',catalog_category:'boiler'})));
  assert.deepEqual(catalogModelFamilies(models).map(f=>[f.name,f.count]),[['Gazliner Ventouse',1],['Vitodens 200-W · B2HA',3],['Vitodens 200-W · B2KE',1]]);
  assert.deepEqual(models.filter(m=>m.brand==='Viessmann').sort(compareCatalogModels).map(catalogModelReferenceLabel),['7510294','7514753','7454861','7544721']);
  assert.match(catalogModelLabel(models[4]),/série 9701000–9839999/);
  for(const [i,model]of models.entries()){assert.equal(model.manufacturerReference,records[i][2]);assert.deepEqual(model.publishedDocuments.map(d=>d.documentId),[`completion-${i}`]);}
});

test('legacy Atlantic Alfea Duo MH-D8 is classified separately from Extensa', () => {
  const model = { brand: 'Atlantic', model: '', manufacturerReference: 'ALFEA DUO - MH-D8 · 023103' };
  assert.equal(catalogModelFamilies([model])[0].name, 'Alféa Duo');
  assert.equal(catalogModelLabel(model), 'Alféa Duo · MH-D8');
  assert.equal(catalogModelReferenceLabel(model), '023103');
});

test('Atlantic Extensa Duo AI groups generations and sorts powers without changing document coverage', () => {
  const refs = ['alfea-extensa-duo-a-i-r32-mh-10-024309', 'mh-alfea-extensa-duo-a-i-3-r32-024306', 'alfea-extensa-duo-a-i-r32-mh-5-024307', 'alfea-extensa-duo-a-i-mh-10-024123', 'alfea-extensa-duo-a-i-mh-5-024122'];
  const models = catalogModelsWithPublishedDocuments([], refs.map((ref, i) => ({ id: `ai-${i}`, manufacturer: 'Atlantic', model_name: ref, model_reference: ref, catalog_category: 'heat_pump_indoor', title: 'vue-eclatee' })));
  assert.deepEqual(catalogModelFamilies(models).map(f=>[f.name,f.count]), [['Alféa Extensa Duo A.I.',2],['Alféa Extensa Duo A.I. R32',3]]);
  assert.deepEqual([...models].sort(compareCatalogModels).map(catalogModelReferenceLabel), ['024122','024123','024306','024307','024309']);
  for (const [i,model] of models.entries()) { assert.equal(model.manufacturerReference, refs[i]); assert.deepEqual(model.publishedDocuments.map(d=>d.documentId),[`ai-${i}`]); }
  const exterior={brand:'Atlantic',model:'old label',manufacturerReference:'alfea-extensa-duo-a-i-5-r32-woya060klt-526341'};
  assert.equal(catalogModelLabel(exterior),'Alféa Extensa Duo A.I. R32 · 5 · WOYA060KLT');
  assert.equal(catalogModelReferenceLabel(exterior),'526341');
  assert.equal(catalogModelFamilies([{...exterior,brand:'Other'}])[0].name,'Modèles à préciser');
});

test('ThemaFast series group powers and revisions without merging references or document coverage', () => {
  const labels = ['THEMAFAST C25 (H-FR)', 'THEMAFAST C25 R1 (H-FR)', 'THEMAFAST C30 (H-FR)',
    'THEMAFAST CONDENS 25-A (H-FR)', 'THEMAFAST CONDENS 30-A (H-FR)', 'THEMAFAST H-Condens 36-CF/1 (N-FR)', 'THEMAFAST M-CONDENS 26-AS/1 M (H-FR)'];
  const models = catalogModelsWithPublishedDocuments([], labels.map((label, i) => ({ id: `thema-${i}`, manufacturer: 'Saunier Duval',
    model_name: label, model_reference: `exact-${i}`, catalog_category: 'boiler', title: 'vue-eclatee' })));
  assert.deepEqual(catalogModelFamilies(models).map(f => [f.name, f.count]), [
    ['ThemaFast', 3], ['ThemaFast Condens', 2], ['ThemaFast H-Condens', 1], ['ThemaFast M-Condens', 1],
  ]);
  assert.equal(models.length, labels.length);
  for (const model of models) assert.equal(model.publishedDocuments.length, 1);
});

test('brand cards detect shared PDF notices and explicit per-document aliases without inventing coverage', () => {
  const common = { sha256: 'a'.repeat(64), sizeBytes: 100, title: 'notice-installation' };
  const a = { brand: 'Chappée', manufacturerReference: 'ref-a', publishedDocuments: [common] };
  const b = { brand: 'Vaillant', manufacturerReference: 'ref-b', publishedDocuments: [common] };
  assert.deepEqual(sharedNoticeBrandSummary([a, b]), [{ brand: 'Chappée', count: 1 }, { brand: 'Vaillant', count: 1 }]);
  assert.deepEqual(sharedNoticeBrandSummary([{ ...a, searchAliases: ['unverified-for-this-document'] }]), []);
  assert.deepEqual(sharedNoticeBrandSummary([{ ...a, publishedDocuments: [{ ...common, modelReferences: ['ref-a', 'ref-c'] }] }]), [{ brand: 'Chappée', count: 1 }]);
  assert.deepEqual(sharedNoticeBrandSummary([a, { ...b, publishedDocuments: [{ ...common, sha256: 'b'.repeat(64) }] }]), []);
  assert.deepEqual(sharedNoticeBrandSummary([{ ...a, publishedDocuments: [{ ...common, title: 'vue-eclatee', modelReferences: ['a', 'b'] }] }]), []);
});

test('explicit ecoTEC plus imports share one family while their exact references remain distinct', () => {
  const documents = ['vu-146-5-5-r2-0010011669', 'vu-256-5-5-r6-0010021858'].map((ref, index) => ({
    id: String(index), manufacturer: 'Vaillant', model_reference: ref,
    model_name: `ecoTEC plus · ${ref}`, title: 'notice-installation', catalog_category: 'boiler',
  }));
  const models = catalogModelsWithPublishedDocuments([], documents);
  assert.deepEqual(catalogModelFamilies(models), [{ name: 'ecoTEC plus', key: 'ecotecplus', count: 2 }]);
  assert.equal(models.length, 2);
  assert.notEqual(models[0].manufacturerReference, models[1].manufacturerReference);
});

test('shared notices appear on every explicitly covered existing model, never on nearby references', () => {
  const base = { manufacturer: 'Vaillant', catalog_category: 'boiler', rag_status: 'ready', size_bytes: 100 };
  const entries = [
    { ...base, id: 'view-a', model_reference: 'VU-R2', title: 'vue-eclatee', model_aliases: ['VU-R3'] },
    { ...base, id: 'view-b', model_reference: 'VU-R3', title: 'vue-eclatee' },
    { ...base, id: 'view-c', model_reference: 'VU-R4', title: 'vue-eclatee' },
    { ...base, id: 'notice', model_reference: 'VU-R2', title: 'notice-installation', model_aliases: ['VU-R3'], sha256: 'a'.repeat(64) },
    { ...base, id: 'foreign', manufacturer: 'Autre', model_reference: 'VU-R3', title: 'vue-eclatee' },
    { ...base, id: 'other-category', catalog_category: 'regulation', model_reference: 'VU-R3', title: 'vue-eclatee' },
  ];
  const models = catalogModelsWithPublishedDocuments([], entries);
  assert.equal(models.length, 5);
  const docs = ref => models.find(m => m.brand === 'Vaillant' && m.type === 'boiler' && m.manufacturerReference === ref).publishedDocuments.map(d => d.documentId);
  assert.deepEqual(docs('VU-R2'), ['view-a', 'notice']);
  assert.deepEqual(docs('VU-R3'), ['view-b', 'notice']);
  assert.deepEqual(docs('VU-R4'), ['view-c']);
  assert.deepEqual(models.find(m => m.brand === 'Autre').publishedDocuments.map(d => d.documentId), ['foreign']);
  assert.deepEqual(models.find(m => m.type === 'regulation').publishedDocuments.map(d => d.documentId), ['other-category']);
});

test('Vaillant short VU VUW VUI labels join ecoTEC plus without merging revisions or PDF coverage', () => {
  const labels = ['VU 256/5-5 R2', 'VU 356/5-5 R6', 'VU 656/5-5', 'VUI 306/5-5 R5', 'VUI 346/5-5 R6', 'VUW 306/5-5 C R4', 'VUW 346/5-5 R2', 'VUW 346/5-5 R3'];
  const documents = labels.map((label, index) => ({ id: `pdf-${index}`, manufacturer: 'Vaillant', model_name: label,
    model_reference: `exact-ref-${index}`, title: 'vue-eclatee', catalog_category: 'boiler' }));
  const models = catalogModelsWithPublishedDocuments([], documents);
  assert.deepEqual(catalogModelFamilies(models), [{ name: 'ecoTEC plus', key: 'ecotecplus', count: labels.length }]);
  assert.equal(models.length, labels.length);
  for (const [index, model] of models.entries()) {
    assert.equal(catalogModelLabel(model), labels[index]);
    assert.equal(catalogModelReferenceLabel(model), `exact-ref-${index}`);
    assert.deepEqual(model.publishedDocuments.map(doc => doc.documentId), [`pdf-${index}`]);
  }
  const others = catalogModelsWithPublishedDocuments([], [
    { ...documents[0], id: 'other', model_name: 'VUW 286/5-3', model_reference: 'pro' },
    { ...documents[0], id: 'other-brand', manufacturer: 'Autre', model_name: 'VU 256/5-5', model_reference: 'autre' },
  ]);
  assert.ok(catalogModelFamilies(others).every(group => group.name !== 'ecoTEC plus'));
});

test('Chappée Initia is grouped by series and variant, preserving exact power and reference', () => {
  const refs = ['initia-1-24-hte-721857404', 'initia-1-12-hte-721857302', 'initia-compact-2-24-hte-721858201', 'initia-plus-compact-2-24-hte-710830002'];
  const models = catalogModelsWithPublishedDocuments([], refs.map((ref, i) => ({ id: String(i), manufacturer: 'Chappée', model_reference: ref, model_name: 'Inconsistent old label', title: 'notice-installation', catalog_category: 'boiler' })));
  assert.deepEqual(catalogModelFamilies(models).map(group => group.name), ['INITIA + COMPACT HTE', 'INITIA + HTE', 'INITIA PLUS COMPACT HTE']);
  const base = models.filter(model => model.modelFamily === 'INITIA + HTE').sort(compareCatalogModels);
  assert.deepEqual(base.map(catalogModelLabel), ['INITIA + 1.12 HTE', 'INITIA + 1.24 HTE']);
  assert.equal(catalogModelReferenceLabel(base[0]), '721857302');
  assert.equal(base[0].manufacturerReference, 'initia-1-12-hte-721857302');
  assert.equal(base[0].publishedDocuments[0].documentId, '1');
});

const notice = { id: "notice", manufacturer: "Airwell", model_reference: "HDLA-022N-09M25 · 7SP023249", title: "Notice d'installation", rag_status: "ready" };

test("published notice matches an existing CarnetPass whose reference lost spaces", () => {
  const result = publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "HDLA-022N-09M25·7SP023249" });
  assert.equal(result.length, 1);
  assert.equal(result[0].storage, "platform-private");
  assert.equal(result[0].ragStatus, "ready");
});

test("does not mix manufacturers or nearby references", () => {
  assert.equal(publishedDocumentsForEquipment([notice], { brand: "Atlantic", product_reference: "HDLA-022N-09M25·7SP023249" }).length, 0);
  assert.equal(publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "HDLA-022N-09M25·7SP023248" }).length, 0);
});

test("accepts explicitly registered reference aliases", () => {
  const result = publishedDocumentsForEquipment([{ ...notice, model_aliases: ["7SP023250"] }], { brand: "Airwell", product_reference: "7SP023250" });
  assert.equal(result.length, 1);
});

test("finds an imported PDF from the product code within its model reference", () => {
  const result = publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "7SP023249" });
  assert.equal(result.length, 1);
  assert.equal(publishedDocumentsForEquipment([notice], { brand: "Airwell", product_reference: "7SP023248" }).length, 0);
  const atlantic = { ...notice, id: "atlantic", manufacturer: "Atlantic", model_reference: "ALFEA DUO - MH-D8 · 023103" };
  assert.equal(publishedDocumentsForEquipment([atlantic], { brand: "Atlantic", product_reference: "023103" }).length, 1);
});

test("groups imported PDFs by exact manufacturer, reference and category for catalog browsing", () => {
  const entries = [
    { ...notice, catalog_category: "air_conditioning_indoor" },
    { ...notice, id: "exploded", title: "Vue éclatée", catalog_category: "air_conditioning_indoor" },
    { ...notice, id: "outdoor", catalog_category: "air_conditioning_outdoor" },
  ];
  const models = catalogModelsWithPublishedDocuments([], entries);
  assert.equal(models.length, 2);
  assert.deepEqual(models.find((model) => model.type === "air_conditioning_indoor").publishedDocuments.map((document) => document.documentId), ["notice", "exploded"]);
  assert.equal(models.find((model) => model.type === "air_conditioning_outdoor").publishedDocuments.length, 1);
});

test("adds imported PDFs to a matching catalog model without changing the source catalog", () => {
  const catalog = [{ brand: "Airwell", model: "HDLA-022N-09M25", manufacturerReference: "HDLA-022N-09M25·7SP023249", type: "air_conditioning", unitPosition: "indoor" }];
  const models = catalogModelsWithPublishedDocuments(catalog, [{ ...notice, catalog_category: "air_conditioning_indoor", model_aliases: ["7SP023249"] }]);
  assert.equal(models.length, 1);
  assert.equal(models[0].publishedDocuments[0].documentId, "notice");
  assert.deepEqual(models[0].searchAliases, ["7SP023249"]);
  assert.equal(catalog[0].publishedDocuments, undefined);
});

test("administrative model replaces the legacy card by product code and uses only published PDFs", () => {
  const legacy = { brand: "Saunier Duval", model: "ThemaPlus Condens 25-A", manufacturerReference: "0010021497", type: "boiler", equipmentId: "legacy" };
  const updated = { id: "new-notice", manufacturer: "Saunier Duval", model_reference: "THEMAPLUS CONDENS 25 -A R2 (H-FR) · 0010021497", catalog_category: "boiler", title: "Updated notice" };
  const models = catalogModelsWithPublishedDocuments([legacy], [updated]);
  assert.equal(models.length, 1);
  assert.equal(models[0].model, updated.model_reference);
  assert.equal(models[0].equipmentId, undefined);
  assert.deepEqual(models[0].publishedDocuments.map((doc) => doc.documentId), ["new-notice"]);
  assert.equal(legacy.equipmentId, "legacy");
});

test("catalogue hides all static legacy models even when no administrative PDF is published", () => {
  const legacy = { brand: "Saunier Duval", manufacturerReference: "0010021497", type: "boiler", equipmentId: "old" };
  const unrelated = { ...legacy, manufacturerReference: "0010017388", equipmentId: "other" };
  const managed = { manufacturer: "Saunier Duval", model_reference: "R2 · 0010021497", catalog_category: "boiler" };
  assert.deepEqual(catalogModelsWithPublishedDocuments([legacy, unrelated], [], [managed]), []);
});

test("model families group variants while keeping reference-specific documents separate", () => {
  const base = { manufacturer: "Saunier Duval", model_name: "ThemaPlus Condens", catalog_category: "boiler", title: "Notice" };
  const models = catalogModelsWithPublishedDocuments([], [
    { ...base, id: "f25", model_reference: "THEMAPLUS CONDENS F25 A-1" },
    { ...base, id: "f30", model_reference: "THEMAPLUS CONDENS F30 A-1" },
    { ...base, id: "fast", model_name: "ThemaFast Condens", model_reference: "THEMAFAST F30" },
  ]);
  assert.equal(models.length, 3);
  const families = catalogModelFamilies(models);
  assert.equal(families.find((group) => group.name === "ThemaPlus Condens").count, 2);
  assert.deepEqual(models.find((model) => model.manufacturerReference.includes("F25")).publishedDocuments.map((doc) => doc.documentId), ["f25"]);
  assert.equal(models[0].model, "ThemaPlus Condens");
});

test("legacy imports remain available until their model family is classified", () => {
  const models = catalogModelsWithPublishedDocuments([], [{ ...notice, catalog_category: "air_conditioning_indoor" }]);
  assert.equal(models[0].manufacturerReference, notice.model_reference);
  assert.equal(catalogModelFamilies(models)[0].name, "Modèles à préciser");
});
