// Political and advocacy ads are not allowed (Ad Policy). This filter blocks
// the obvious ones before payment, so they are never charged. It is a first
// line only: visitors can report political ads, and in the Nigeria edition
// every ad also waits in the admin review queue before going live.
//
// Terms are matched as whole words, case-insensitively. Avoid bare words that
// are common in ordinary business ads ("campaign", "president", "Obi").
const TERMS = [
  // Elections and voting
  'vote for', 'vote against', 'votes for', 'get out and vote', 'go out and vote', 'collect your pvc', 'get your pvc', 'permanent voter card',
  'election', 'elections', 'electoral', 'by-election', 'governorship', 'presidential', 'senatorial', 'gubernatorial',
  'inec', 'ballot', 'referendum', 're-elect', 'reelect', 'political party', 'political campaign', 'election campaign',
  'campaign rally', 'manifesto', 'candidate for', 'our candidate', 'politician', 'running mate',
  // Nigerian parties and movements
  'apc', 'pdp', 'labour party', 'nnpp', 'apga', 'adc', 'sdp', 'ypp', 'zlp', 'all progressives congress',
  "peoples democratic party", "people's democratic party", 'obidient', 'obidients', 'batified', 'atikulated', 'tinubu', 'atiku',
  'kwankwaso', 'peter obi', 'kwankwasiyya',
  // Elsewhere
  'democratic party', 'republican party', 'conservative party', 'maga', 'make america great again', 'trump', 'biden', 'kamala',
  // Advocacy / lobbying
  'sign the petition', 'sign our petition', 'lobby your', 'call your senator', 'call your representative', 'protest march',
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(`(^|[^a-z0-9])(${TERMS.map(escape).join('|')})(?=$|[^a-z0-9])`, 'i');

// Returns the matched term, or null.
export function politicalMatch(text) {
  const m = PATTERN.exec(String(text ?? '').replace(/[#@_]/g, ' '));
  return m ? m[2].toLowerCase() : null;
}
