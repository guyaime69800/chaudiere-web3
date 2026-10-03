import test from "node:test";
import assert from "node:assert/strict";
import { mainScriptPath, supabaseProjectRefs } from "../scripts/audit-environments.mjs";

test("environment audit extracts only public Supabase project references", () => {
  assert.deepEqual(supabaseProjectRefs('x https://BQQZZBWQMIYXCOTVQTOC.supabase.co y https://bqqzzbwqmiyxcotvqtoc.supabase.co'),
    ["bqqzzbwqmiyxcotvqtoc"]);
  assert.deepEqual(supabaseProjectRefs("no project URL"), []);
});

test("environment audit accepts only a main asset script", () => {
  assert.equal(mainScriptPath('<script type="module" src="/assets/index-123.js"></script>'), "/assets/index-123.js");
  assert.throws(() => mainScriptPath('<script src="https://other.example/app.js"></script>'));
  assert.throws(() => mainScriptPath("<html></html>"));
});
