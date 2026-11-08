// Utilities for searching clientes by name or CPF and applying CPF mask.

export function onlyDigits(s: string): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Só os dígitos do CPF. */
export function cpfDigitos(s?: string | null): string {
  return onlyDigits(s ?? '');
}

/** Valida o CPF pelos dígitos verificadores. */
export function cpfValido(s?: string | null): boolean {
  const d = cpfDigitos(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/**
 * Formata para EXIBIÇÃO. Só aplica a máscara quando há exatamente 11 dígitos.
 * Se o valor tiver mais ou menos dígitos, mostra como está — assim um CPF
 * incompleto não é exibido deslocado, parecendo outro CPF válido.
 */
export function formatCPFDisplay(s?: string | null): string {
  const d = cpfDigitos(s);
  if (d.length !== 11) return d || '—';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Máscara progressiva — usada enquanto o usuário digita. */
export function maskCPF(s: string): string {
  const d = onlyDigits(s).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += '.' + p2;
  if (p3) out += '.' + p3;
  if (p4) out += '-' + p4;
  return out;
}

export function isCpfFormatValid(s: string | null | undefined): boolean {
  if (!s) return true; // opcional
  return onlyDigits(s).length === 11;
}

export function isNumericQuery(q: string): boolean {
  if (!q) return false;
  // Apenas dígitos, pontos, hífens ou espaços
  return /^[\d.\-\s]+$/.test(q.trim()) && onlyDigits(q).length > 0;
}

function stripAccents(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function matchCliente(
  row: { nome_cliente?: string | null; cpf?: string | null },
  query: string
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (isNumericQuery(q)) {
    const qd = onlyDigits(q);
    const cpfd = onlyDigits(row.cpf ?? '');
    return cpfd.includes(qd);
  }
  const needle = stripAccents(q.toLowerCase());
  const hay = stripAccents((row.nome_cliente ?? '').toLowerCase());
  return hay.includes(needle);
}

import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
