// Door check-in: the gates and the code format, then the app builds the page.
export async function run({ intake, write }) {
  const gates = Number(intake.capacity) > 1500 ? ['North gate', 'South gate', 'VIP entrance'] : ['Main door', 'VIP entrance']
  const files = [write('src/data/checkin.json', { gates, codeLength: 6, codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' })]
  return {
    files,
    note: `${gates.length} gates`,
    ask: 'Add a /checkin page for door staff, linked from /admin (not the public nav). Each order\'s confirmation shows its order code as a QR code (add the qrcode package and draw it on a canvas). On /checkin, staff type or paste a code, pick a gate from src/data/checkin.json, and press Check in: POST /api/checkin { code, gate } marks the order checked in once and answers who it is and their tier, or why not (unknown code, already in). GET /api/checkin returns the check-ins so far and the count per gate, shown live on the page.'
  }
}
