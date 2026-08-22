/**
 * Wat een tabblad van een mutatie hoeft te weten.
 *
 * De tabbladen roepen alleen `mutate(id)` aan en kijken naar `isPending` om
 * een knop uit te zetten. Het volledige type dat useMutation teruggeeft is
 * daarvoor veel te breed: dan zou het tabblad afhangen van de vorm van
 * react-query in plaats van van wat het echt gebruikt.
 */
export interface MutatieMetId {
  mutate: (id: string) => void;
  isPending: boolean;
}
