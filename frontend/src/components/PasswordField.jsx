import { useState } from "react";
import "./PasswordField.css";

export default function PasswordField({ label, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <span className="password-field-control">
        <input {...inputProps} type={visible ? "text" : "password"} />
        <button
          type="button"
          className="password-field-toggle"
          aria-label={visible ? `Masquer ${label.toLowerCase()}` : `Afficher ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          disabled={inputProps.disabled}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="2.8" />
            {!visible && <path d="M3 21 21 3" />}
          </svg>
        </button>
      </span>
    </label>
  );
}
