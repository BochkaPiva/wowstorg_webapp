"use client";

import React from "react";

import "./toggle-switch.css";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
};

export function ToggleSwitch({ checked, onChange, label, description, disabled, id }: Props) {
  return (
    <button
      type="button"
      id={id}
      className={[
        "ui-toggle",
        checked ? "ui-toggle--on" : "",
        disabled ? "ui-toggle--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
    >
      <span className="ui-toggle-text">
        <span className="ui-toggle-label">{label}</span>
        {description ? <span className="ui-toggle-desc">{description}</span> : null}
      </span>
      <span className="ui-toggle-track" aria-hidden>
        <span className="ui-toggle-thumb" />
      </span>
    </button>
  );
}
