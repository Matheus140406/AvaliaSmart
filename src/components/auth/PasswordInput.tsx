"use client";

/**
 * Input de senha com alternância mostrar/ocultar — nenhuma tela de auth
 * (login, registro, redefinir senha) tinha isso antes; o usuário só
 * descobria um typo depois de errar a senha. Mesma classe `input-field`
 * usada cruamente em todas essas telas, só envolvida num wrapper relativo
 * pro botão do olho não exigir um componente de design system novo.
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className={`input-field h-10 w-full rounded-md px-3 pr-10 text-sm ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        tabIndex={-1}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
