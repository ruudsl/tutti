/**
 * Een tekstbestand inlezen dat uit een spreadsheet komt.
 *
 * Excel op Windows slaat "CSV (gescheiden door lijstscheidingsteken)" op in
 * Windows-1252, niet in UTF-8. Zou je dat als UTF-8 lezen, dan wordt elke é, ë
 * of ü een vraagteken in een ruitje, en staat "Mühlenberg" zo in de database.
 * Daarom eerst strikt als UTF-8, en lukt dat niet, als Windows-1252. Een
 * bestand dat geldig UTF-8 is, is dat vrijwel nooit toevallig.
 */
export async function leesTekstbestand(bestand: Blob): Promise<string> {
  const bytes = await bestand.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
