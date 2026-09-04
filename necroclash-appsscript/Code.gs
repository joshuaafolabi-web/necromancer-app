/**
 * Code.gs — standalone The Lazarus League Web App for Account Managers.
 *
 * Formerly NECROCLASH — renamed as part of the Project Lazarus rebrand
 * (2026-08-28). The `action=necroclash` query parameter in doGet() below is
 * kept unchanged on purpose: the live Netlify /clash page hardcodes that
 * exact string (necromancer-app/lib/appsScript.ts), and that app is out of
 * scope for this rebrand — renaming the wire value here without also
 * changing that file would silently break a working integration.
 *
 * This is a SEPARATE Apps Script project from sheet-api-appsscript/ — it is
 * not bound to the Sheet, so it opens it by ID instead. That's the only
 * real difference between a "bound" and "standalone" Apps Script project;
 * both still need zero Google Cloud Console / IAM involvement.
 *
 * FOUR TABS (2026-09-04): Overview, Partner Roster, Tasks, Leaderboard. The
 * first three are new — see the "TASK MANAGEMENT" section below for the
 * data model, state machine, and notification setup they need.
 *
 * HOW TO INSTALL:
 *   1. Go to script.google.com > New project (NOT via a Sheet's Extensions
 *      menu this time — this one stands alone).
 *   2. Delete the placeholder code, paste this file in as Code.gs.
 *   3. Add a second file (HTML type, name it exactly "Dashboard") and paste
 *      in Dashboard.html's content.
 *   4. Project Settings (gear icon) > Script Properties > add a property
 *      named SHEET_ID with the value being your Google Sheet's ID (the
 *      long string in its URL between /d/ and /edit).
 *   5. On that same Sheet, add two new tabs — see "TASK MANAGEMENT" below
 *      for exact headers. Skipping this doesn't break the other three
 *      tabs; Tasks just shows a setup message until they exist.
 *   6. Script Properties, two more (both optional, but Tasks/reviewing is
 *      meaningless without the first one):
 *        REVIEWER_EMAILS      comma-separated list of who may assign tasks
 *                              and approve/reopen completed ones (that's
 *                              you, the project owner). Anyone else who
 *                              opens the dashboard can still see Tasks and
 *                              complete their OWN assigned ones, just not
 *                              assign or review.
 *        SLACK_WEBHOOK_URL     an Incoming Webhook URL from a Slack app —
 *                              Slack > App Directory > search "Incoming
 *                              Webhooks" > add to a channel > copy the URL.
 *                              Task notifications post there in addition to
 *                              email. Leave unset to skip Slack entirely —
 *                              nothing breaks, notifications just go by
 *                              email only.
 *   7. Run preflightLazarusLeague() from the editor. It confirms the
 *      SHEET_ID resolves, the tabs/headers are readable, and reports
 *      whether REVIEWER_EMAILS/SLACK_WEBHOOK_URL are set, before you deploy.
 *   8. Run installLazarusLeagueTriggers() once, to turn on the daily
 *      overdue-task check. Re-run any time; it clears old copies first.
 *   9. Deploy > New deployment > Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone within [your domain]   <-- use this, not "Anyone"
 *
 *      Domain access is what makes Session.getActiveUser() return the
 *      viewer's email, which is how an AM lands on their OWN dashboard
 *      instead of picking themselves out of a dropdown, and how task
 *      assign/review get gated to REVIEWER_EMAILS server-side rather than
 *      just hidden client-side. With "Anyone", Apps Script returns an
 *      empty string for the active user and none of that works.
 *   10. Authorize when prompted — it's asking permission to read/write the
 *       Sheet you're about to point it at by ID, which you already own,
 *       plus send email and make outbound requests (for Slack).
 *   11. Copy the Web app URL. That's the Lazarus League link you send to AMs.
 *
 * Uses the SAME Sheet as the partner Arcade (Partners + AMs tabs), plus the
 * two new Tasks/TaskHistory tabs below. SpinLog isn't needed here.
 *
 * NOTE ON THE AMs TAB. The live sheet carries EP, reactivations and rank
 * columns. This code IGNORES them and recomputes all three from the
 * Partners tab on every load, because they are strictly derived values —
 * EP is segment base points × credit-tier multiplier (PRD Section 15), and
 * a stored copy can only ever disagree with the orders it came from. Every
 * read maps by header name, so the extra columns are harmless.
 *
 * If something else populates those columns and you want them treated as
 * the source of truth instead, that's a real change in behaviour — say so
 * rather than assuming, because it changes who the leaderboard believes.
 *
 * ---------------------------------------------------------------------
 * TASK MANAGEMENT — data model
 * ---------------------------------------------------------------------
 * Add these two tabs to the same Sheet, headers exactly as shown (column
 * order doesn't matter — everything maps by header name, same as Partners):
 *
 *   Tasks:        task_id | partner_said | am_email | task_type |
 *                 description | assigned_by | assigned_date | due_date |
 *                 status | completed_date | am_comment | reviewer_comment |
 *                 reviewed_by | reviewed_date | reopen_count
 *
 *   TaskHistory:  task_id | at | from_status | to_status | actor_email |
 *                 comment
 *
 * TaskHistory is append-only — every status change writes a new row here
 * in addition to updating Tasks' current-state row, so "who reopened this
 * task and why, twice" is always answerable from the Sheet itself, not
 * just the latest snapshot.
 *
 * STATE MACHINE. Exactly three real statuses, one cycle-back edge:
 *
 *   Assigned  --[AM marks complete + comment]-->  Under Review
 *   Under Review  --[reviewer approves]-->  Approved  (terminal)
 *   Under Review  --[reviewer reopens + comment]-->  Assigned  (reopen_count++)
 *
 * "Completed" and "Reopened" are ACTIONS (assignTask/completeTask/
 * reviewTask below), not stored status values — ambiguity there was the
 * thing most worth avoiding. partner_said is optional; not every AM task
 * is about a specific partner (e.g. "submit weekly report").
 */

/**
 * EASIEST OPTION: paste your Sheet ID between the quotes below and you're
 * done — no Script Properties needed at all.
 *
 * The ID is the long string in the Sheet's URL between /d/ and /edit:
 *   docs.google.com/spreadsheets/d/THIS_PART_HERE/edit#gid=0
 *
 * A SHEET_ID script property still wins if one is set, so you can leave
 * this blank and use Project Settings > Script Properties instead. Do one
 * or the other, not neither.
 */
var SHEET_ID_FALLBACK = '';

function SHEET_ID_() {
  // NOTE: 'SHEET_ID' here is the property's NAME, not its value. Replacing
  // it with the actual sheet ID looks up a property that doesn't exist and
  // returns null — set the ID as the property's VALUE, or use
  // SHEET_ID_FALLBACK above.
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || SHEET_ID_FALLBACK;
  if (!id) {
    throw new Error(
      'No Sheet ID configured. Either paste it into SHEET_ID_FALLBACK at the top of ' +
      'Code.gs, or add a script property literally named SHEET_ID whose value is the ID ' +
      '(Project Settings > Script Properties).'
    );
  }
  return id;
}

function getSpreadsheet_() {
  // Resolved OUTSIDE the try. It was inside, so a missing-ID error got
  // caught and rewritten as "could not open the Sheet with that SHEET_ID" —
  // which sends you to check an ID that was never read in the first place.
  var id = SHEET_ID_();
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('Could not open a Sheet with ID "' + id + '". Check it is the long ' +
                    'string between /d/ and /edit in the Sheet URL, and that this Google ' +
                    'account can open that Sheet.');
  }
}

/** Direct Sheet handle for tabs that need row-level writes (Tasks), not
 *  just the read-only object-array readTab_ gives you. */
function getTab_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet tab "' + name + '" not found. Add it — see the TASK MANAGEMENT ' +
                    'comment at the top of Code.gs for exact headers.');
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// Scoring constants — The Lazarus League's own AM-competition rubric (EP,
// rank tiers). Independent of the Arcade's prize milestones in
// necromancer-app/lib/gameRules.ts — that table decides what a PARTNER wins
// on the wheel; this one decides how an AM's effort is scored. The two
// diverged on 2026-08-27 when the Arcade moved to fixed order-count
// milestones — that change does not need mirroring here.
// ---------------------------------------------------------------------------
var CREDIT_STEPS = [
  { orders: 0, credit: 0 }, { orders: 5, credit: 5000 }, { orders: 10, credit: 10000 },
  { orders: 15, credit: 12500 }, { orders: 20, credit: 15000 }, { orders: 30, credit: 20000 },
  { orders: 40, credit: 25000 },
];

// PRD Section 15. Segment labels are matched case-insensitively and with
// whitespace trimmed, because these are typed into a Sheet by hand and
// "tier 2 " scoring 0 EP is a silent, invisible failure.
var SEGMENT_BASE_POINTS = { 'tier 1': 30, 'tier 2': 100, 'tier 3': 70, 'tier 4': 50 };
// Partner tier display names, Project Lazarus (2026-08-28). Tier 1/3 kept
// their prior names (Sleeper/Wanderer already fit either theme); Tier 2 and
// 4 swapped the dark-fantasy names for ones that fit a revival story.
var SEGMENT_DISPLAY = { 'tier 1': 'The Resting', 'tier 2': 'Fallen Giants', 'tier 3': 'The Slumbering', 'tier 4': 'The Entombed' };
var CREDIT_MULTIPLIER = { 0: 0, 5000: 1.0, 10000: 1.5, 12500: 2.0, 15000: 2.5, 20000: 3.0, 25000: 4.0 };
// AM rank titles, ascending by EP. Colors in Dashboard.html's RANK_COLOR
// stay mapped by POSITION (gray/teal/purple/gold, lowest to highest), not
// by name, so the visual hierarchy carries over unchanged.
var RANK_TIERS = [
  { rank: 'Awakener', minEp: 0 }, { rank: 'Restorer', minEp: 500 },
  { rank: 'Miracle Worker', minEp: 1200 }, { rank: 'Prime Resurrector', minEp: 2400 },
];

function normalizeHeader_(h) {
  return String(h == null ? '' : h).trim().toLowerCase().replace(/\s+/g, '_');
}
function normalizeEmail_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}
/** Same 6-digit zero-padding rule as the Partners sync scripts — a SAID
 *  typed into a Tasks row is just as prone to losing a leading zero as one
 *  in the Sheet itself. */
function normalizeSaid_(v) {
  var digits = String(v == null ? '' : v).replace(/\D/g, '');
  if (!digits) return '';
  while (digits.length < 6) digits = '0' + digits;
  return digits;
}
/**
 * Extracts the tier from a segment label, ignoring decoration.
 *
 * The live sheet writes segments as "Tier 4 🌑", "Tier 3 🔴" and so on. An
 * exact string match scored every one of those 0 EP — silently, because a
 * missing multiplier looks identical to a partner who simply hasn't
 * reactivated. Pulling the digit out means the emoji, casing, and any
 * trailing spaces stop mattering.
 *
 * Returns 'tier 1'..'tier 4', or '' if there is no tier in the string.
 */
function normalizeSegment_(v) {
  var m = String(v == null ? '' : v).match(/tier\s*([1-4])/i);
  return m ? 'tier ' + m[1] : '';
}

function creditForOrders_(orders) {
  var cur = CREDIT_STEPS[0];
  for (var i = CREDIT_STEPS.length - 1; i >= 0; i--) {
    if (orders >= CREDIT_STEPS[i].orders) { cur = CREDIT_STEPS[i]; break; }
  }
  return cur.credit;
}

function progressPct_(orders) {
  var idx = 0;
  for (var i = CREDIT_STEPS.length - 1; i >= 0; i--) {
    if (orders >= CREDIT_STEPS[i].orders) { idx = i; break; }
  }
  var cur = CREDIT_STEPS[idx], next = CREDIT_STEPS[idx + 1];
  if (!next) return 100;
  return Math.min(100, Math.round(((orders - cur.orders) / (next.orders - cur.orders)) * 100));
}

function epForPartner_(segment, orders) {
  var base = SEGMENT_BASE_POINTS[normalizeSegment_(segment)] || 0;
  var mult = CREDIT_MULTIPLIER[creditForOrders_(orders)] || 0;
  return base * mult;
}

function rankForEp_(ep) {
  var rank = RANK_TIERS[0].rank;
  for (var i = 0; i < RANK_TIERS.length; i++) if (ep >= RANK_TIERS[i].minEp) rank = RANK_TIERS[i].rank;
  return rank;
}

function readTab_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet tab "' + name + '" not found. Tab names are case-sensitive.');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(normalizeHeader_);
  return data.slice(1)
    .filter(function (r) {
      // A row counts as real if ANY cell has content — keying off column A
      // alone dropped partners whose store_id happened to be blank.
      return r.some(function (c) { return String(c).trim() !== ''; });
    })
    .map(function (r) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = r[i]; });
      return obj;
    });
}

// ---------------------------------------------------------------------------
// Weekly matchmaking.
//
// Pairings are derived, but they must be SYMMETRIC and STABLE for a week.
// The previous version paired each AM with whoever sat one rank below them
// on a live leaderboard, which fails both ways: rank 2's opponent was rank
// 3 while rank 2 was itself rank 1's opponent, so no two AMs ever agreed on
// who was duelling whom, and every order delivered reshuffled the board
// mid-week. PRD Section 6 requires the result be "visible on both AMs'
// dashboards" — that's only meaningful if both see the same duel.
//
// Instead: sort AMs by email (an ordering that does not move), rotate that
// list by the ISO week number, and pair off adjacent entries. Everyone
// agrees on the pairs, the pairs hold all week, and they rotate weekly.
// ---------------------------------------------------------------------------
function weekIndex_(date) {
  var d = date || new Date();
  // Weeks since the Unix epoch Monday. Stable and monotonic — we only need
  // "does this change exactly once a week", not calendar ISO week numbering.
  return Math.floor((d.getTime() / 86400000 + 3) / 7);
}

function weekStart_(date) {
  var d = date || new Date();
  var day = (d.getDay() + 6) % 7; // 0 = Monday
  var monday = new Date(d.getTime() - day * 86400000);
  return Utilities.formatDate(monday, 'Africa/Lagos', 'yyyy-MM-dd');
}

/** Round-robin rotation: element 0 is fixed, the rest rotate by `week`. */
function rotateForWeek_(list, week) {
  if (list.length < 3) return list.slice();
  var head = list[0], tail = list.slice(1);
  var n = tail.length;
  var offset = ((week % n) + n) % n;
  return [head].concat(tail.slice(offset)).concat(tail.slice(0, offset));
}

/** Returns { duelOpponent: {email->email}, coven: {email->{mate, rivals[]}} } */
function buildMatchups_(amEmails, week) {
  var sorted = amEmails.slice().sort();
  var duelOpponent = {}, covenOf = {};

  var order = rotateForWeek_(sorted, week);
  for (var i = 0; i + 1 < order.length; i += 2) {
    duelOpponent[order[i]] = order[i + 1];
    duelOpponent[order[i + 1]] = order[i];
  }
  // Odd AM count leaves one unpaired — give them a bye rather than a
  // phantom opponent.
  if (order.length % 2 === 1) duelOpponent[order[order.length - 1]] = null;

  // Covens use a DIFFERENT rotation so an AM's teammate isn't also their
  // duel opponent, which would make the two mechanics collapse into one.
  var covenOrder = rotateForWeek_(sorted, week + Math.floor(sorted.length / 2) + 1);
  var covens = [];
  for (var j = 0; j + 1 < covenOrder.length; j += 2) covens.push([covenOrder[j], covenOrder[j + 1]]);
  if (covenOrder.length % 2 === 1) covens.push([covenOrder[covenOrder.length - 1], null]);

  covens.forEach(function (coven, idx) {
    // Covens clash in pairs: 0v1, 2v3, ... An odd coven count leaves the
    // last one facing coven 0 rather than nobody.
    var rivalIdx = (idx % 2 === 0) ? idx + 1 : idx - 1;
    if (rivalIdx >= covens.length) rivalIdx = 0;
    var rival = covens[rivalIdx] || [null, null];

    coven.forEach(function (email) {
      if (!email) return;
      covenOf[email] = {
        mate: coven[0] === email ? coven[1] : coven[0],
        rivals: [rival[0], rival[1]].filter(function (r) { return r && r !== email; }),
      };
    });
  });

  return { duelOpponent: duelOpponent, coven: covenOf };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
function buildLeaderboard_(ss) {
  var partners = readTab_(ss, 'Partners');
  var ams = readTab_(ss, 'AMs');

  var rows = ams
    .filter(function (am) { return normalizeEmail_(am.am_email) !== ''; })
    .map(function (am) {
      var email = normalizeEmail_(am.am_email);
      var mine = partners.filter(function (p) { return normalizeEmail_(p.am_email) === email; });
      var totalEp = mine.reduce(function (s, p) {
        return s + epForPartner_(p.tier, Number(p.orders_delivered) || 0);
      }, 0);
      var reactivations = mine.filter(function (p) {
        return creditForOrders_(Number(p.orders_delivered) || 0) > 0;
      }).length;

      var accepted = mine.filter(function (p) {
        return String(p.challenge_accepted_at || '').trim() !== '';
      });
      var ordersDelivered = mine.reduce(function (s, p) {
        return s + (Number(p.orders_delivered) || 0);
      }, 0);
      // Averaged over ACCEPTED partners only — a store that hasn't started
      // its 30-day window yet has no "uptime since the campaign date" to
      // speak of, so including it would just water the number down with
      // zeros that mean "not started" rather than "underperforming".
      // uptime_campaign is read as a raw 0-100 number straight off the
      // Sheet; whatever populates that column is the source of truth here,
      // not this script.
      var uptimeValues = accepted
        .map(function (p) { return Number(p.uptime_campaign); })
        .filter(function (n) { return !isNaN(n); });
      var avgUptimePct = uptimeValues.length
        ? Math.round(uptimeValues.reduce(function (s, n) { return s + n; }, 0) / uptimeValues.length)
        : null;

      return {
        amName: am.am_name || email,
        amEmail: email,
        ep: Math.round(totalEp),
        reactivations: reactivations,
        partnerCount: mine.length,
        acceptedCount: accepted.length,
        ordersDelivered: ordersDelivered,
        avgUptimePct: avgUptimePct,
        rank: rankForEp_(totalEp),
      };
    });

  // Ties broken by name so the board doesn't reorder itself between two
  // otherwise identical loads.
  rows.sort(function (a, b) { return (b.ep - a.ep) || a.amName.localeCompare(b.amName); });
  return rows;
}

function getLazarusLeagueData_(selfEmail) {
  var ss = getSpreadsheet_();
  var leaderboard = buildLeaderboard_(ss);

  if (!leaderboard.length) {
    return { error: 'The AMs tab is empty — add am_name and am_email rows, then reload.' };
  }

  var wanted = normalizeEmail_(selfEmail);
  var selfIdx = -1;
  for (var i = 0; i < leaderboard.length; i++) {
    if (leaderboard[i].amEmail === wanted) { selfIdx = i; break; }
  }
  var self = leaderboard[selfIdx >= 0 ? selfIdx : 0];
  var byEmail = {};
  leaderboard.forEach(function (r) { byEmail[r.amEmail] = r; });

  var week = weekIndex_();
  var matchups = buildMatchups_(leaderboard.map(function (r) { return r.amEmail; }), week);

  // ---- The Trial of Awakening (formerly Soul Duel) ----
  var rivalEmail = matchups.duelOpponent[self.amEmail];
  var rival = rivalEmail ? byEmail[rivalEmail] : null;
  // Bars are scaled against the pair's own leader, so a duel between two
  // mid-table AMs still reads as a contest instead of two stubs next to
  // whoever happens to top the whole board.
  var duelMax = Math.max(self.ep, rival ? rival.ep : 0, 1);
  var duel = {
    rival: rival,
    selfPct: Math.round((self.ep / duelMax) * 100),
    rivalPct: rival ? Math.round((rival.ep / duelMax) * 100) : 0,
    selfLeading: !rival || self.ep >= rival.ep,
    weekStart: weekStart_(),
  };

  // ---- The Stone-Roller Raid (formerly Coven Clash) ----
  var partners = readTab_(ss, 'Partners');
  var myCoven = matchups.coven[self.amEmail] || { mate: null, rivals: [] };

  // "Fallen Giants" is Tier 2's Project Lazarus display name (was
  // "Leviathan") — this still targets Tier 2 specifically, the raid's
  // target tier hasn't changed, just what it's called.
  function lowestFallenGiant(emails) {
    var pool = partners.filter(function (p) {
      return normalizeSegment_(p.tier) === 'tier 2' &&
             emails.indexOf(normalizeEmail_(p.am_email)) >= 0;
    });
    pool.sort(function (a, b) {
      return (Number(a.orders_delivered) || 0) - (Number(b.orders_delivered) || 0);
    });
    return pool[0] || null;
  }

  var covenEmails = [self.amEmail, myCoven.mate].filter(Boolean);
  var boss = lowestFallenGiant(covenEmails);
  var rivalBoss = lowestFallenGiant(myCoven.rivals);

  var coven = {
    mate: myCoven.mate && byEmail[myCoven.mate] ? byEmail[myCoven.mate].amName : null,
    rivalNames: myCoven.rivals.map(function (e) { return byEmail[e] ? byEmail[e].amName : e; }),
    boss: boss ? {
      name: boss.store_name,
      segmentLabel: (SEGMENT_DISPLAY[normalizeSegment_(boss.tier)] || boss.tier) + ' · Tier 2',
      progressPct: progressPct_(Number(boss.orders_delivered) || 0),
    } : null,
    rivalProgressPct: rivalBoss ? progressPct_(Number(rivalBoss.orders_delivered) || 0) : 0,
  };

  // ---- Weekly quest ----
  var myFallenGiantsReactivated = partners.filter(function (p) {
    return normalizeEmail_(p.am_email) === self.amEmail &&
           normalizeSegment_(p.tier) === 'tier 2' &&
           creditForOrders_(Number(p.orders_delivered) || 0) > 0;
  }).length;

  return {
    leaderboard: leaderboard,
    self: self,
    identified: selfIdx >= 0,
    duel: duel,
    coven: coven,
    quest: {
      text: 'Reactivate 2 Fallen Giants this week',
      progress: Math.min(myFallenGiantsReactivated, 2),
      target: 2,
      complete: myFallenGiantsReactivated >= 2,
    },
  };
}

// ---------------------------------------------------------------------------
// Web app entry point + core server functions Dashboard.html calls
// ---------------------------------------------------------------------------
function jsonOut__(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var params = (e && e.parameter) || {};

  // ?action=... returns the same data as JSON, so the Next.js /clash page
  // can render it without reimplementing any of the scoring, pairing, or
  // quest logic. One implementation, two front ends — the alternative was a
  // second copy that drifts.
  //
  // These actions are gated on API_KEY (Script Properties) because they
  // expose the full AM roster, emails and standings. The HTML dashboard
  // above doesn't need the key: it's protected by the deployment's domain
  // restriction, which a server-to-server call from Netlify can't satisfy.
  //
  // To use them, add a SECOND deployment of this same script with access
  // "Anyone" and point Netlify's NECROCLASH_API_URL at that one. The
  // domain-restricted deployment stays the AM-facing link.
  if (params.action === 'necroclash' || params.action === 'ams') {
    var expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!expected) {
      return jsonOut__({ error: 'JSON API disabled — no API_KEY script property set' });
    }
    if (params.apiKey !== expected) {
      return jsonOut__({ error: 'Unauthorized' });
    }
  }

  if (params.action === 'necroclash') {
    var payload;
    try {
      payload = getLazarusLeagueData_(params.am || '');
    } catch (err) {
      payload = { error: String(err && err.message ? err.message : err) };
    }
    return jsonOut__(payload);
  }

  if (params.action === 'ams') {
    try {
      return jsonOut__({ ams: getAmList() });
    } catch (err) {
      return jsonOut__({ error: String(err && err.message ? err.message : err) });
    }
  }

  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('The Lazarus League — Glovo Nigeria')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * The signed-in viewer's email. Populated only when the deployment's access
 * is set to your Workspace domain (see install step 9 above); returns ''
 * otherwise, and the dashboard falls back to the AM picker.
 *
 * Every gated task action below (assignTask/reviewTask) re-derives this
 * SERVER-SIDE rather than trusting a value passed from the client — the
 * AM picker means the client can't be trusted to say who's really asking.
 */
function getViewerEmail() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (e) {
    return '';
  }
}

function getAmList() {
  return readTab_(getSpreadsheet_(), 'AMs')
    .filter(function (a) { return normalizeEmail_(a.am_email) !== ''; })
    .map(function (a) { return { am_name: a.am_name || a.am_email, am_email: normalizeEmail_(a.am_email) }; });
}

function getLazarusLeagueJson(selfEmail) {
  try {
    return getLazarusLeagueData_(selfEmail);
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// =============================================================================
// TASK MANAGEMENT
// =============================================================================

// ---------------------------------------------------------------------------
// Reviewer authority — the project owner, configured via Script Properties
// rather than hardcoded, since nothing in this codebase should assume it
// knows your email. Anyone in this list can assign tasks and approve/reopen
// completed ones; everyone else can view Tasks and complete their OWN
// assigned ones, nothing more (enforced server-side in each function below,
// not just hidden client-side — see the note on getViewerEmail()).
// ---------------------------------------------------------------------------
function reviewerEmails_() {
  var raw = PropertiesService.getScriptProperties().getProperty('REVIEWER_EMAILS') || '';
  return raw.split(',').map(function (e) { return normalizeEmail_(e); }).filter(function (e) { return e; });
}
function isReviewer_(email) {
  return reviewerEmails_().indexOf(normalizeEmail_(email)) >= 0;
}
/** Exposed to Dashboard.html so it knows whether to show the "assign a
 *  task" form and Approve/Reopen buttons at all — a UX convenience, not
 *  the actual security boundary (that's isReviewer_() inside each
 *  server function, re-checked every call). */
function isReviewer() {
  return isReviewer_(getViewerEmail());
}

// ---------------------------------------------------------------------------
// Notifications — email always; Slack only if SLACK_WEBHOOK_URL is set.
// Neither failing should ever lose or block the underlying task action —
// same resilience rule as the AM-acceptance email in sheet-api-appsscript.
// ---------------------------------------------------------------------------
function slackWebhookUrl_() {
  return PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL') || '';
}

function postSlack_(text) {
  var url = slackWebhookUrl_();
  if (!url) return { sent: false, reason: 'SLACK_WEBHOOK_URL not set' };
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    return code >= 200 && code < 300
      ? { sent: true }
      : { sent: false, reason: 'Slack returned HTTP ' + code };
  } catch (err) {
    return { sent: false, reason: String(err && err.message ? err.message : err) };
  }
}

/** kind: 'assigned' | 'reopened' | 'overdue'. AM-facing (internal
 *  audience), so this carries the Project Lazarus tag — same branding
 *  rule as the AM acceptance email in sheet-api-appsscript/Code.gs;
 *  partner-facing email never does. */
function notifyTaskEvent_(task, kind) {
  var amEmail = String(task.am_email || '').trim();
  if (!amEmail) return;

  var verb = kind === 'assigned' ? 'assigned to you'
    : kind === 'reopened' ? 'reopened — needs another pass'
    : 'now overdue';
  var subject = '[Project Lazarus] Task ' + verb + ': ' + task.task_type;
  var lines = [
    'Task: ' + task.task_type,
    'Partner SAID: ' + (task.partner_said || '—'),
    'Description: ' + (task.description || '—'),
    'Due: ' + (task.due_date || '—'),
  ];
  if (kind === 'reopened' && task.reviewer_comment) {
    lines.push('', 'Reviewer note: ' + task.reviewer_comment);
  }
  var body = lines.join('\n') + '\n\nOpen The Lazarus League > Tasks tab to update this.';

  try {
    MailApp.sendEmail(amEmail, subject, body);
  } catch (err) {
    Logger.log('notifyTaskEvent_ email failed for ' + amEmail + ': ' + (err && err.message ? err.message : err));
  }

  var slackLines = [
    ':clipboard: *Task ' + verb + '* — ' + amEmail,
    '*' + task.task_type + '*' + (task.partner_said ? ' · partner ' + task.partner_said : ''),
  ];
  if (task.description) slackLines.push(task.description);
  slackLines.push('Due: ' + (task.due_date || '—'));
  if (kind === 'reopened' && task.reviewer_comment) slackLines.push('Reviewer note: ' + task.reviewer_comment);
  postSlack_(slackLines.join('\n'));
}

// ---------------------------------------------------------------------------
// Task templates — starting points for the assign form, not a locked list;
// "Custom" always leaves room for anything these don't cover.
// ---------------------------------------------------------------------------
var TASK_TEMPLATES_ = [
  { type: 'Welcome Call', description: 'Call the partner to walk them through the 30-Day Growth Initiative and confirm they’re set up to start ordering.', dueInDays: 2 },
  { type: 'First Order Push', description: 'Partner accepted but hasn’t reached 10 orders yet. Help them place their first orders and unlock their first spin.', dueInDays: 5 },
  { type: 'Uptime Check-in', description: 'Partner’s Merchant App uptime is below target. Check in on why they’re going offline during operating hours.', dueInDays: 3 },
  { type: 'Milestone Congratulations', description: 'Partner just crossed a reward milestone. Reach out to congratulate them and encourage continued momentum.', dueInDays: 2 },
  { type: 'Re-engagement Call', description: 'Partner accepted the challenge but orders have stalled. Re-engage them before the 30-day window runs out.', dueInDays: 3 },
  { type: 'Custom', description: '', dueInDays: 3 },
];
function getTaskTemplates() { return TASK_TEMPLATES_; }

// ---------------------------------------------------------------------------
// Tasks tab — row-level read/write helpers, same pattern as
// findPartnerRow_/setPartnerCell_ in sheet-api-appsscript/Code.gs.
// ---------------------------------------------------------------------------
var TASKS_SHEET = 'Tasks';
var TASK_HISTORY_SHEET = 'TaskHistory';
var TASK_STATUS_ = { ASSIGNED: 'Assigned', UNDER_REVIEW: 'Under Review', APPROVED: 'Approved' };

function findTaskRow_(taskId) {
  var sheet = getTab_(TASKS_SHEET);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  var headers = data[0].map(normalizeHeader_);
  var idCol = headers.indexOf('task_id');
  if (idCol < 0) throw new Error('Tasks tab has no "task_id" column.');

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(taskId)) {
      var obj = {};
      headers.forEach(function (h, j) { obj[h] = data[i][j]; });
      return { rowIndex: i + 1, headers: headers, obj: obj }; // 1-based, matches getRange()
    }
  }
  return null;
}

function setTaskCell_(rowIndex, headers, colName, value) {
  var col = headers.indexOf(colName);
  if (col < 0) return false;
  getTab_(TASKS_SHEET).getRange(rowIndex, col + 1).setValue(value);
  return true;
}

function appendTaskRow_(valueMap) {
  var sheet = getTab_(TASKS_SHEET);
  var headers = sheet.getDataRange().getValues()[0].map(normalizeHeader_);
  var row = headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(valueMap, h) ? valueMap[h] : '';
  });
  sheet.appendRow(row);
}

function appendTaskHistory_(taskId, fromStatus, toStatus, actorEmail, comment) {
  var sheet = getTab_(TASK_HISTORY_SHEET);
  sheet.appendRow([taskId, new Date(), fromStatus, toStatus, normalizeEmail_(actorEmail), comment || '']);
}

function generateTaskId_() {
  return 'T-' + Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyMMdd') + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * Creates a task and assigns it to an AM. Reviewer-only.
 * payload: { amEmail, taskType, description, partnerSaid, dueDate }
 */
function assignTask(payload) {
  try {
    var caller = getViewerEmail();
    if (!isReviewer_(caller)) {
      return { error: 'Only the project owner can assign tasks.' };
    }
    payload = payload || {};
    var amEmail = normalizeEmail_(payload.amEmail);
    var taskType = String(payload.taskType || '').trim();
    var description = String(payload.description || '').trim();
    var partnerSaid = payload.partnerSaid ? normalizeSaid_(payload.partnerSaid) : '';
    var dueDate = String(payload.dueDate || '').trim();

    if (!amEmail) return { error: 'An Account Manager is required.' };
    if (!taskType) return { error: 'A task type is required.' };

    var amKnown = getAmList().some(function (a) { return a.am_email === amEmail; });
    if (!amKnown) return { error: 'That email is not in the AMs tab.' };

    var taskId = generateTaskId_();
    var now = new Date();
    var row = {
      task_id: taskId,
      partner_said: partnerSaid,
      am_email: amEmail,
      task_type: taskType,
      description: description,
      assigned_by: normalizeEmail_(caller),
      assigned_date: now,
      due_date: dueDate,
      status: TASK_STATUS_.ASSIGNED,
      completed_date: '',
      am_comment: '',
      reviewer_comment: '',
      reviewed_by: '',
      reviewed_date: '',
      reopen_count: 0,
    };
    appendTaskRow_(row);
    appendTaskHistory_(taskId, '', TASK_STATUS_.ASSIGNED, caller, 'Assigned' + (description ? ': ' + description : ''));
    notifyTaskEvent_(row, 'assigned');
    return { ok: true, taskId: taskId };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

/**
 * AM marks their own task complete, with a comment. Also allowed for a
 * reviewer (project-owner override — e.g. completing on an AM's behalf
 * after a call where they agreed the task's done).
 */
function completeTask(taskId, amComment) {
  try {
    var caller = normalizeEmail_(getViewerEmail());
    var found = findTaskRow_(taskId);
    if (!found) return { error: 'Task not found.' };
    var task = found.obj;
    if (String(task.status) !== TASK_STATUS_.ASSIGNED) {
      return { error: 'This task is not awaiting completion.' };
    }
    var isOwnerOfTask = normalizeEmail_(task.am_email) === caller;
    if (!isOwnerOfTask && !isReviewer_(caller)) {
      return { error: 'Only the assigned Account Manager can mark this complete.' };
    }

    var now = new Date();
    setTaskCell_(found.rowIndex, found.headers, 'status', TASK_STATUS_.UNDER_REVIEW);
    setTaskCell_(found.rowIndex, found.headers, 'completed_date', now);
    setTaskCell_(found.rowIndex, found.headers, 'am_comment', String(amComment || ''));
    appendTaskHistory_(taskId, TASK_STATUS_.ASSIGNED, TASK_STATUS_.UNDER_REVIEW, caller, amComment || '');
    return { ok: true };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Reviewer approves (closes, terminal) or reopens (back to Assigned,
 * reopen_count++, AM re-notified with the reviewer's comment attached) a
 * task that's Under Review. Reviewer-only, re-checked here regardless of
 * what the client believes isReviewer() said.
 */
function reviewTask(taskId, decision, reviewerComment) {
  try {
    var caller = normalizeEmail_(getViewerEmail());
    if (!isReviewer_(caller)) return { error: 'Only the project owner can review tasks.' };

    var found = findTaskRow_(taskId);
    if (!found) return { error: 'Task not found.' };
    var task = found.obj;
    if (String(task.status) !== TASK_STATUS_.UNDER_REVIEW) {
      return { error: 'This task is not awaiting review.' };
    }

    var now = new Date();
    setTaskCell_(found.rowIndex, found.headers, 'reviewed_by', caller);
    setTaskCell_(found.rowIndex, found.headers, 'reviewed_date', now);
    setTaskCell_(found.rowIndex, found.headers, 'reviewer_comment', String(reviewerComment || ''));

    if (decision === 'approve') {
      setTaskCell_(found.rowIndex, found.headers, 'status', TASK_STATUS_.APPROVED);
      appendTaskHistory_(taskId, TASK_STATUS_.UNDER_REVIEW, TASK_STATUS_.APPROVED, caller, reviewerComment || '');
      return { ok: true };
    }

    if (decision === 'reopen') {
      var reopenCount = (Number(task.reopen_count) || 0) + 1;
      setTaskCell_(found.rowIndex, found.headers, 'status', TASK_STATUS_.ASSIGNED);
      setTaskCell_(found.rowIndex, found.headers, 'reopen_count', reopenCount);
      appendTaskHistory_(taskId, TASK_STATUS_.UNDER_REVIEW, TASK_STATUS_.ASSIGNED, caller, reviewerComment || '');
      task.reviewer_comment = reviewerComment;
      notifyTaskEvent_(task, 'reopened');
      return { ok: true };
    }

    return { error: 'Unknown decision "' + decision + '" — expected "approve" or "reopen".' };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

/** All tasks, flattened for the client, with `overdue` computed here so
 *  the client never has to reimplement the due-date/status logic. */
function getTasks() {
  try {
    var ss = getSpreadsheet_();
    var rows = readTab_(ss, TASKS_SHEET);
    var today = new Date();
    return rows.map(function (t) {
      var due = t.due_date ? new Date(t.due_date) : null;
      var dueValid = !!due && !isNaN(due.getTime());
      var overdue = dueValid && due < today && t.status !== TASK_STATUS_.APPROVED;
      return {
        taskId: t.task_id,
        partnerSaid: t.partner_said ? normalizeSaid_(t.partner_said) : '',
        amEmail: normalizeEmail_(t.am_email),
        taskType: t.task_type,
        description: t.description,
        assignedBy: t.assigned_by,
        assignedDate: t.assigned_date,
        dueDate: t.due_date,
        status: t.status,
        completedDate: t.completed_date,
        amComment: t.am_comment,
        reviewerComment: t.reviewer_comment,
        reviewedBy: t.reviewed_by,
        reviewedDate: t.reviewed_date,
        reopenCount: Number(t.reopen_count) || 0,
        overdue: overdue,
      };
    });
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

function getTaskHistory(taskId) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(TASK_HISTORY_SHEET);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0].map(normalizeHeader_);
    var idCol = headers.indexOf('task_id');
    return data.slice(1)
      .filter(function (r) { return String(r[idCol]) === String(taskId); })
      .map(function (r) {
        var obj = {};
        headers.forEach(function (h, i) { obj[h] = r[i]; });
        return obj;
      })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// Partner Roster — accepted partners only, for the roster tab's table.
// Deliberately the same "accepted" filter as buildLeaderboard_'s uptime
// average, for the same reason: a partner who hasn't started their 30-day
// window has no campaign progress to show here yet.
// ---------------------------------------------------------------------------
function getPartnerRoster() {
  try {
    var ss = getSpreadsheet_();
    var partners = readTab_(ss, 'Partners');
    var amByEmail = {};
    readTab_(ss, 'AMs').forEach(function (a) {
      var e = normalizeEmail_(a.am_email);
      if (e) amByEmail[e] = a.am_name || e;
    });

    return partners
      .filter(function (p) { return String(p.challenge_accepted_at || '').trim() !== ''; })
      .map(function (p) {
        var amEmail = normalizeEmail_(p.am_email);
        var uptime = (p.uptime_campaign !== undefined && p.uptime_campaign !== '' && !isNaN(Number(p.uptime_campaign)))
          ? Number(p.uptime_campaign) : null;
        return {
          said: normalizeSaid_(p.said || p.store_address_id),
          storeName: p.store_name,
          amEmail: amEmail,
          amName: amByEmail[amEmail] || amEmail,
          tier: p.tier,
          tierDisplay: SEGMENT_DISPLAY[normalizeSegment_(p.tier)] || p.tier || '—',
          ordersDelivered: Number(p.orders_delivered) || 0,
          uptime: uptime,
          acceptedAt: p.challenge_accepted_at,
        };
      })
      .sort(function (a, b) { return b.ordersDelivered - a.ordersDelivered; });
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// Overview — project status, AM expectations, aging/SLA metrics. The thing
// that makes this tab worth opening rather than decorative: overdue count,
// average turnaround, oldest open task, and a completed-per-week trend.
// ---------------------------------------------------------------------------
function weekFloor_(d) {
  var day = (d.getDay() + 6) % 7; // 0 = Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

/** Configurable via Script Properties so this isn't a code change every
 *  time expectations shift — falls back to a sensible default. */
function amExpectationsText_() {
  return PropertiesService.getScriptProperties().getProperty('AM_EXPECTATIONS') ||
    'Respond to newly assigned tasks within 2 business days. Reach out to any partner ' +
    'flagged for re-engagement before their 30-day window closes. Keep task comments ' +
    'specific enough that a reviewer can approve without needing a follow-up question.';
}

function getOverview() {
  try {
    var ss = getSpreadsheet_();
    var partners = readTab_(ss, 'Partners');
    var acceptedCount = partners.filter(function (p) { return String(p.challenge_accepted_at || '').trim() !== ''; }).length;

    var tasksResult = getTasks();
    var tasks = Array.isArray(tasksResult) ? tasksResult : [];
    var today = new Date();

    var taskCounts = { Assigned: 0, 'Under Review': 0, Approved: 0 };
    tasks.forEach(function (t) { if (taskCounts.hasOwnProperty(t.status)) taskCounts[t.status]++; });

    var overdueTasks = tasks.filter(function (t) { return t.overdue; });

    // Two SLA clocks, not one: AM turnaround (assigned -> marked complete)
    // vs. full cycle (assigned -> actually approved). Collapsing them into
    // one average would hide whether delay lives on the AM side or the
    // review side — the whole point of tracking this at all.
    var amTurnaroundDays = [], fullCycleDays = [];
    tasks.forEach(function (t) {
      var assigned = t.assignedDate ? new Date(t.assignedDate) : null;
      if (!assigned || isNaN(assigned.getTime())) return;
      if (t.completedDate) {
        var completed = new Date(t.completedDate);
        if (!isNaN(completed.getTime())) amTurnaroundDays.push((completed - assigned) / 86400000);
      }
      if (t.status === TASK_STATUS_.APPROVED && t.reviewedDate) {
        var reviewed = new Date(t.reviewedDate);
        if (!isNaN(reviewed.getTime())) fullCycleDays.push((reviewed - assigned) / 86400000);
      }
    });
    function avg(arr) { return arr.length ? Math.round((arr.reduce(function (s, n) { return s + n; }, 0) / arr.length) * 10) / 10 : null; }

    var openTasks = tasks.filter(function (t) { return t.status !== TASK_STATUS_.APPROVED; });
    var oldestOpen = null;
    openTasks.forEach(function (t) {
      var assigned = t.assignedDate ? new Date(t.assignedDate) : null;
      if (!assigned || isNaN(assigned.getTime())) return;
      var days = Math.floor((today - assigned) / 86400000);
      if (!oldestOpen || days > oldestOpen.days) oldestOpen = { days: days, taskId: t.taskId, taskType: t.taskType, amEmail: t.amEmail };
    });

    // Completed-over-time: Approved tasks bucketed by the Monday of the
    // week they were APPROVED (throughput, not just "marked done by AM").
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var wStart = weekFloor_(new Date(today.getTime() - i * 7 * 86400000));
      weeks.push({ label: Utilities.formatDate(wStart, 'Africa/Lagos', 'MMM d'), key: wStart.getTime(), count: 0 });
    }
    var weekByKey = {};
    weeks.forEach(function (w) { weekByKey[w.key] = w; });
    tasks.forEach(function (t) {
      if (t.status !== TASK_STATUS_.APPROVED || !t.reviewedDate) return;
      var reviewed = new Date(t.reviewedDate);
      if (isNaN(reviewed.getTime())) return;
      var bucket = weekByKey[weekFloor_(reviewed).getTime()];
      if (bucket) bucket.count++;
    });

    return {
      acceptedPartnerCount: acceptedCount,
      taskCounts: taskCounts,
      pendingReviewCount: taskCounts['Under Review'],
      overdueCount: overdueTasks.length,
      overdueTasks: overdueTasks,
      avgAmTurnaroundDays: avg(amTurnaroundDays),
      avgFullCycleDays: avg(fullCycleDays),
      oldestOpenTask: oldestOpen,
      completedOverTime: weeks.map(function (w) { return { label: w.label, count: w.count }; }),
      amExpectations: amExpectationsText_(),
      tasksTabExists: !tasksResult.error,
    };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// Overdue detection — daily. Flags anything past due_date and still not
// Approved, and pings the assigned AM (email + Slack) once per run. Install
// via installLazarusLeagueTriggers() below; re-running is safe, it clears
// its own old copy first.
// ---------------------------------------------------------------------------
function checkOverdueTasks() {
  var tasksResult = getTasks();
  var tasks = Array.isArray(tasksResult) ? tasksResult : [];
  var overdue = tasks.filter(function (t) { return t.overdue; });
  overdue.forEach(function (t) {
    notifyTaskEvent_({
      am_email: t.amEmail, task_type: t.taskType, partner_said: t.partnerSaid,
      description: t.description, due_date: t.dueDate,
    }, 'overdue');
  });
  var msg = overdue.length + ' overdue task(s) — reminder sent to each assigned AM.';
  Logger.log(msg);
  return msg;
}

function installLazarusLeagueTriggers() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkOverdueTasks') { ScriptApp.deleteTrigger(t); removed++; }
  });
  ScriptApp.newTrigger('checkOverdueTasks').timeBased().everyDays(1).atHour(8).create();
  var msg = 'Installed checkOverdueTasks daily ~8:00 Africa/Lagos (removed ' + removed + ' old copy/copies).';
  Logger.log(msg);
  return msg;
}

// ---------------------------------------------------------------------------
// preflightLazarusLeague() — run from the editor before deploying.
// ---------------------------------------------------------------------------
function preflightLazarusLeague() {
  var out = [];
  try {
    var ss = getSpreadsheet_();
    out.push('Opened sheet: ' + ss.getName());

    var ams = readTab_(ss, 'AMs');
    var partners = readTab_(ss, 'Partners');
    out.push(ams.length + ' AMs, ' + partners.length + ' partners');

    if (!ams.length) out.push('PROBLEM: AMs tab has no data rows.');

    var board = buildLeaderboard_(ss);
    var unscored = partners.filter(function (p) {
      return !SEGMENT_BASE_POINTS[normalizeSegment_(p.tier)];
    });
    if (unscored.length) {
      out.push('PROBLEM: ' + unscored.length + ' partner(s) have a tier outside Tier 1-4 ' +
               'and will score 0 EP. First: "' + unscored[0].tier + '"');
    }

    var acceptedCount = partners.filter(function (p) {
      return String(p.challenge_accepted_at || '').trim() !== '';
    }).length;
    var uptimeCount = partners.filter(function (p) {
      return p.uptime_campaign !== undefined && p.uptime_campaign !== '' && !isNaN(Number(p.uptime_campaign));
    }).length;
    out.push(acceptedCount + ' of ' + partners.length + ' partners have accepted the challenge; ' +
             uptimeCount + ' have a numeric uptime_campaign value.');

    var matchups = buildMatchups_(board.map(function (r) { return r.amEmail; }), weekIndex_());
    out.push('Week of ' + weekStart_() + ' duels:');
    var shown = {};
    board.forEach(function (r) {
      var opp = matchups.duelOpponent[r.amEmail];
      if (shown[r.amEmail]) return;
      shown[r.amEmail] = true; if (opp) shown[opp] = true;
      out.push('  ' + r.amName + ' vs ' + (opp ? opp : '(bye)'));
    });

    var amHeaderNote = ams.length && (ams[0].ep !== undefined || ams[0].rank !== undefined);
    if (amHeaderNote) {
      out.push('NOTE: the AMs tab has EP/reactivations/rank columns. These are ignored — ' +
               'all three are recomputed live from Partners so they can never disagree ' +
               'with the order counts they derive from.');
    }

    // ---- Task management setup ----
    var tasksSheet = ss.getSheetByName(TASKS_SHEET);
    if (!tasksSheet) {
      out.push('NOTE: no "Tasks" tab yet — the Tasks/Overview tabs will show a setup ' +
               'message until you add it. See the TASK MANAGEMENT comment at the top ' +
               'of Code.gs for exact headers.');
    } else {
      var taskRows = readTab_(ss, TASKS_SHEET);
      out.push(taskRows.length + ' task(s) on the Tasks tab.');
      var badAm = taskRows.filter(function (t) {
        return t.am_email && !ams.some(function (a) { return normalizeEmail_(a.am_email) === normalizeEmail_(t.am_email); });
      });
      if (badAm.length) {
        out.push('PROBLEM: ' + badAm.length + ' task(s) assigned to an email not in the AMs ' +
                 'tab. First: "' + badAm[0].am_email + '" (task ' + badAm[0].task_id + ')');
      }
      var badStatus = taskRows.filter(function (t) {
        return [TASK_STATUS_.ASSIGNED, TASK_STATUS_.UNDER_REVIEW, TASK_STATUS_.APPROVED].indexOf(String(t.status)) < 0;
      });
      if (badStatus.length) {
        out.push('PROBLEM: ' + badStatus.length + ' task(s) have a status other than "Assigned", ' +
                 '"Under Review", or "Approved" — exact spelling matters. First: "' + badStatus[0].status +
                 '" (task ' + badStatus[0].task_id + ')');
      }
    }
    if (!ss.getSheetByName(TASK_HISTORY_SHEET)) {
      out.push('NOTE: no "TaskHistory" tab yet — task status changes won’t have an audit ' +
               'trail until you add it (Tasks itself still works without it).');
    }

    var reviewers = reviewerEmails_();
    out.push(reviewers.length
      ? 'REVIEWER_EMAILS: ' + reviewers.join(', ')
      : 'PROBLEM: REVIEWER_EMAILS is not set — nobody can assign or review tasks yet.');
    out.push(slackWebhookUrl_()
      ? 'SLACK_WEBHOOK_URL: set — task notifications will post to Slack in addition to email.'
      : 'NOTE: SLACK_WEBHOOK_URL is not set — task notifications go by email only.');

    var triggerInstalled = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkOverdueTasks'; });
    out.push(triggerInstalled
      ? 'checkOverdueTasks trigger: installed.'
      : 'NOTE: checkOverdueTasks trigger not installed yet — run installLazarusLeagueTriggers() once.');

    var viewer = getViewerEmail();
    out.push(viewer
      ? 'Viewer identity works: ' + viewer + (isReviewer_(viewer) ? ' (reviewer)' : ' (not a reviewer)')
      : 'NOTE: viewer identity is empty here (normal in the editor). If it is also ' +
        'empty in the deployed app, set the deployment access to your domain.');
  } catch (err) {
    out.push('FAILED: ' + err.message);
  }

  var report = out.join('\n');
  Logger.log(report);
  return report;
}
