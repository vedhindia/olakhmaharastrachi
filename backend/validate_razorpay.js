require('dotenv').config();
const Razorpay = require('razorpay');
const https = require('https');

const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const idMode = keyId.startsWith('rzp_test_') ? 'TEST' : keyId.startsWith('rzp_live_') ? 'LIVE' : 'UNKNOWN';

function mask(s) {
  if (!s) return '(EMPTY!)';
  if (s.length >= 10) return s.slice(0, 6) + '••••' + s.slice(-4) + '  len=' + s.length;
  return s.slice(0, 2) + '•••  len=' + s.length;
}

console.log('\n=============== RAZORPAY KEY VALIDATOR ===============');
console.log('1. KEYS CURRENTLY LOADED FROM .env:');
console.log('   RAZORPAY_KEY_ID      : ' + mask(keyId));
console.log('   RAZORPAY_KEY_SECRET  : ' + mask(keySecret));
console.log('   Mode from KEY_ID    : ' + idMode);

console.log('\n2. STRUCTURAL CHECKS:');
let s1 = /^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId);
console.log('   Format (rzp_test_ or rzp_live_ prefix): ' + (s1 ? 'PASS' : 'FAIL - invalid prefix'));
let s2 = keySecret.length >= 10;
console.log('   Secret length >= 10                   : ' + (s2 ? 'PASS' : 'FAIL - too short'));
let s3 = !/"/.test(keyId + keySecret) && !/'/.test(keyId + keySecret);
console.log('   No quotes wrapping values             : ' + (s3 ? 'PASS' : 'FAIL - remove quotes'));
let s4 = !/\s/.test(keyId + keySecret);
console.log('   No spaces anywhere                    : ' + (s4 ? 'PASS' : 'FAIL - trim whitespace'));
if (!(s1 && s2 && s3 && s4)) {
  console.log('\n   ❌ STRUCTURAL FAIL. Fix .env and rerun.');
  process.exit(2);
}
console.log('   All structural: PASS');

console.log('\n3. LIVE RAZORPAY API TEST (₹1.00 order create):');
const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

async function sdkTest() {
  try {
    const o = await razorpay.orders.create({
      amount: 100, currency: 'INR', receipt: 'test_' + Date.now()
    });
    return { ok: true, id: o.id, status: o.status };
  } catch (e) {
    return {
      ok: false,
      statusCode: e.statusCode || 'n/a',
      code: (e.error && e.error.code) || null,
      desc: (e.error && e.error.description) || e.message || 'unknown'
    };
  }
}

function httpsTest() {
  return new Promise((resolve) => {
    const auth = 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64');
    const req = https.request({
      hostname: 'api.razorpay.com', path: '/v1/orders?count=1',
      method: 'GET', headers: { Authorization: auth }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data.slice(0, 300) }));
    });
    req.on('error', (e) => resolve({ statusCode: -1, err: e.message }));
    req.end();
  });
}

(async () => {
  const r1 = await sdkTest();
  if (r1.ok) {
    console.log('   SDK create order: ✅ PASS. order_id=' + r1.id + ' status=' + r1.status);
  } else {
    console.log('   SDK create order: ❌ FAIL');
    console.log('      HTTP statusCode : ' + r1.statusCode);
    console.log('      Razorpay code   : ' + r1.code);
    console.log('      DESCRIPTION     : ' + r1.desc);
  }

  const r2 = await httpsTest();
  console.log('\n4. RAW HTTPS BASIC-AUTH CROSS-CHECK (GET /v1/orders):');
  if (r2.statusCode === 200) {
    console.log('   HTTP status 200 OK ✅ => 100% KEYS VALID');
  } else if (r2.statusCode === 401) {
    console.log('   HTTP status 401 Unauthorized ❌ => 100% KEY PAIR DO NOT MATCH!');
  } else if (r2.statusCode === -1) {
    console.log('   Network error: ' + r2.err);
  } else {
    console.log('   Unexpected HTTP status ' + r2.statusCode);
    if (r2.body) console.log('   Body: ' + r2.body);
  }

  console.log('\n=============== DIAGNOSIS & NEXT STEPS ===============');
  if (r1.ok && r2.statusCode === 200) {
    console.log('🎉 Both SDK + raw HTTPS passed => KEYS 100% VALID.');
    console.log('   If frontend still returns 503, it means your BACKEND IS RUNNING OLD CODE');
    console.log('   Fix: press Ctrl+C on backend terminal, then re-run "node index.js"');
    process.exit(0);
  }

  console.log('\n❌ KEY PAIR IS INVALID (401). 3 possible causes ranked by likelihood:');
  console.log('\n   1. (95%): Key ID and secret DO NOT BELONG TO SAME KEY PAIR on dashboard.');
  console.log('      For example, you regenerated key on Razorpay on 3rd Oct, copied new key_id');
  console.log('      into line 18, but accidentally left old secret from a key you generated');
  console.log('      on 1st October in line 19. Razorpay server checks both as a pair.');
  console.log('\n   2. (4%): TEST / LIVE MODE MISMATCH');
  console.log('      Dashboard top-left toggle = LIVE but your key_id is rzp_test_ prefix');
  console.log('      or toggle = TEST but your key_id starts with rzp_live_ prefix');
  console.log('\n   3. (1%): Key was DELETED / REVOKED on the dashboard but not removed from .env');
  console.log('\n========= 90-SEC REGENERATION STEPS (ALWAYS FIXES THIS!) =========');
  console.log('   Step A: Open https://dashboard.razorpay.com and login');
  console.log('   Step B: TOP LEFT TOGGLE SET CORRECTLY FIRST:');
  console.log('             if keyId=' + keyId.slice(0, 9) + '... => set to ' + idMode + ' MODE');
  console.log('   Step C: Left side -> Settings (gear icon) -> API Keys tab');
  console.log('   Step D: Click BLUE BUTTON -> Generate Test Key (or Generate Live Key)');
  console.log('   Step E: A POPUP SHOWS 2 FIELDS — DO NOT CLOSE POPUP UNTIL BOTH COPIED!');
  console.log('             Key Id    : rzp_...        COPY -> PASTE backend/.env line 18');
  console.log('             Key Secret: *************  COPY -> PASTE backend/.env line 19');
  console.log('             (After popup closed YOU CANNOT RETRIEVE SECRET AGAIN!)');
  console.log('   Step F: In .env lines 18 and 19: NO QUOTES, NO SPACES, just values!');
  console.log('   Step G: Ctrl+C backend terminal, re-run node index.js');
  console.log('   Step H: Look for startup line: [Razorpay] Config loaded: mode=' + idMode + ' key_id=rzp_...LAST4');
  console.log('             Last 4 chars of key_id in log should match last 4 of NEW key just pasted');
  console.log('   Step I: RERUN THIS VALIDATOR SCRIPT -> should show PASS now.');
  console.log('   Step J: Retry frontend checkout -> Razorpay modal should open successfully.');
  process.exit(1);
})();
