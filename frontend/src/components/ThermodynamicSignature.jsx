import { useState } from "react";

export default function ThermodynamicSignature({ label, value, onChange }) {
  const [activeStroke, setActiveStroke] = useState(null);
  const strokes = value?.strokes || [];
  function position(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, Math.round((event.clientX - rect.left) * 1000 / rect.width))),
      Math.max(0, Math.min(1000, Math.round((event.clientY - rect.top) * 1000 / rect.height)))];
  }
  function setField(key, fieldValue) { onChange({ ...(value || {}), [key]: fieldValue }); }
  function start(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveStroke([position(event)]);
  }
  function move(event) {
    if (!activeStroke) return;
    // React may run a state updater after the pointer event has finished.
    // Read currentTarget while the event is still active.
    const point = position(event);
    setActiveStroke((current) => current ? [...current, point].slice(0, 300) : current);
  }
  function finish() {
    if (activeStroke?.length > 1) setField("strokes", [...strokes, activeStroke].slice(0, 30));
    setActiveStroke(null);
  }
  return <fieldset className="thermo-signature">
    <legend>{label}</legend>
    <label>Nom du signataire
      <input value={value?.name || ""} maxLength={120} onChange={(event) => onChange({ ...value, name: event.target.value, strokes: [], accepted: false })} />
    </label>
    <p>Signez avec le doigt, un stylet ou la souris.</p>
    <svg role="img" aria-label={`Zone de signature : ${label}`} viewBox="0 0 1000 1000" preserveAspectRatio="none"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      {[...strokes, ...(activeStroke ? [activeStroke] : [])].map((stroke, index) =>
        <polyline key={index} points={stroke.map((point) => point.join(",")).join(" ")} fill="none" stroke="#1f2937" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
    <button type="button" onClick={() => setField("strokes", [])}>Effacer la signature</button>
    <label className="thermo-signature__consent">
      <input type="checkbox" checked={Boolean(value?.accepted)} onChange={(event) => setField("accepted", event.target.checked)} />
      Je confirme signer ce document après en avoir vérifié le contenu.
    </label>
  </fieldset>;
}
