// Units a pharmacy paper uses most, as siunitx writes them. The list is a
// shortcut; any other unit can be typed in siunitx form (\milli\gram).
export const COMMON_UNITS: { label: string; unit: string }[] = [
  { label: "mg", unit: "\\milli\\gram" },
  { label: "g", unit: "\\gram" },
  { label: "kg", unit: "\\kilo\\gram" },
  { label: "µg", unit: "\\micro\\gram" },
  { label: "mL", unit: "\\milli\\litre" },
  { label: "L", unit: "\\litre" },
  { label: "mg/mL", unit: "\\milli\\gram\\per\\milli\\litre" },
  { label: "mg/kg", unit: "\\milli\\gram\\per\\kilo\\gram" },
  { label: "°C", unit: "\\celsius" },
  { label: "%", unit: "\\percent" },
  { label: "M (mol/L)", unit: "\\molar" },
  { label: "mol", unit: "\\mole" },
  { label: "mmol", unit: "\\milli\\mole" },
  { label: "nm", unit: "\\nano\\metre" },
  { label: "cm", unit: "\\centi\\metre" },
  { label: "min", unit: "\\minute" },
  { label: "h", unit: "\\hour" },
  { label: "s", unit: "\\second" },
  { label: "Pa", unit: "\\pascal" },
  { label: "V", unit: "\\volt" },
];

export function unitLabel(unit: string): string {
  return COMMON_UNITS.find((u) => u.unit === unit)?.label ?? unit;
}
