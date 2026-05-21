import { useQuery } from '@tanstack/react-query'
import { getSettings } from '../api/client'

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '¥',
  CHF: 'Fr',
  NZD: 'NZ$',
  MXN: 'MX$',
  BRL: 'R$',
  DKK: 'kr',
  SEK: 'kr',
  NOK: 'kr',
  INR: '₹',
  ZAR: 'R',
}

export const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar (CA$)' },
  { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
  { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
  { code: 'CHF', label: 'CHF — Swiss Franc (Fr)' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar (NZ$)' },
  { code: 'MXN', label: 'MXN — Mexican Peso (MX$)' },
  { code: 'BRL', label: 'BRL — Brazilian Real (R$)' },
  { code: 'DKK', label: 'DKK — Danish Krone (kr)' },
  { code: 'SEK', label: 'SEK — Swedish Krona (kr)' },
  { code: 'NOK', label: 'NOK — Norwegian Krone (kr)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'ZAR', label: 'ZAR — South African Rand (R)' },
]

export function useCurrency(): string {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 60_000 })
  const code = data?.currency ?? 'USD'
  return CURRENCY_SYMBOLS[code] ?? code
}
