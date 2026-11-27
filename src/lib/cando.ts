// Kann-Beschreibungen (WP-11): was man nach einer Einheit auf Stufe A1 kann.
import { CAN_DO } from '../content/cando.ts';

/** Fertigkeiten nach GER: Hören, Lesen, zusammenhängendes Sprechen, an Gesprächen teilnehmen, Schreiben. */
export const CAN_DO_SKILLS = ['Hören', 'Lesen', 'Sprechen', 'Gespräch', 'Schreiben'] as const;
export type CanDoSkill = (typeof CAN_DO_SKILLS)[number];

export interface CanDo {
  unit: string;
  items: { skill: CanDoSkill; text: string }[];
}

/** GER-Stufe, auf die sich alle Kann-Beschreibungen beziehen */
export const CAN_DO_LEVEL = 'A1';

export { CAN_DO };

export function canDoFor(unitId: string): CanDo['items'] {
  return CAN_DO.find((c) => c.unit === unitId)?.items ?? [];
}
