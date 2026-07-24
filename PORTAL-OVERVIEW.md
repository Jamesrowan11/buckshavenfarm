# Bucks Haven Farm — Website & Portal Overview

*Everything the system does — and everything it's planned to do — in one place. Last updated July 24, 2026.*

The system is one application with two faces: the **public website** at buckshavenfarm.com that visitors and prospective boarders see, and the **portal** where the family, barn staff, and boarders run and live with the farm. It runs on your own AWS server (managed through Plesk), stores everything in your own database, and sends email through your own mail server as **info@buckshavenfarm.com**.

> **Where things stand today:** the public website is built and live-ready (aerial drone hero, tour requests, self-updating gallery). A staff portal already exists (shifts, tasks, feeding charts, time clock, announcements, barn TV displays). This document is the blueprint for growing those into the full system below — sections marked **✅ built** exist today; everything else is the roadmap.

---

## 1. The public website ✅ built

- **Homepage** — the farm from the air, front and center: your drone footage plays as the hero background, with the crest logo, services, and calls-to-action. A **tour request form** lands directly in the portal's Requests inbox (today: emailed to the office).
- **Sections** — boarding, facilities (indoor arena, Arena Barn, Log Barn, all-weather turnout, Schooley Mill trail access), lessons & disciplines, testimonials, visit/contact with map.
- **Self-updating gallery** — drop photos in a folder and the site updates itself; no code changes.
- **Editable content** (planned) — admins change homepage text, photos, testimonials, and board-availability status ("stalls available" / "waitlist") from **Portal → Content** without touching code.
- **Google tracking** (planned) — page views, call clicks, and tour-form submits fire as events for the Analytics page.
- **Installable app** (planned) — PWA so staff and boarders "Add to Home Screen"; push notifications for barn alerts. Boarders will check their horse more often than any HVAC customer ever checked an invoice — the app icon matters here.

## 2. Accounts & roles

Three kinds of login, each seeing a different portal:

- **Admin** (James, Cynthia) — everything: horses, boarders, billing, scheduling, staff, content, exports.
- **Employee** (barn staff) — ✅ built: their shifts, tasks, feeding checklists, availability, time-off, clock, announcements.
- **Boarder** (clients) — their horses, board bills, agreements, farm calendar, arena bookings, and message threads with the barn.

What's different from HVAC: **the horse, not the person, is the central record.** Every boarder account carries:

- **Their horses** — one boarder can have several horses; a horse can have co-owners (spouses, leases). Each horse links to its stall, feed chart, health records, documents, and photos.
- **Emergency contacts** — who to call at 2 a.m., in order, with a backup barn-buddy authorized to make decisions when the owner is unreachable.
- **Vet & farrier of record** per horse — name and phone, so staff never hunt for it during a colic.
- **Emergency spending authorization** — a pre-authorized dollar limit for emergency vet care when the owner can't be reached, captured at signup. This single field prevents the worst conversation a barn can have.
- **Billing email** — separate from the login email when someone else pays the board.

**Find anyone fast:** search covers boarder name, horse name (barn name *and* show name), stall, phone, and email — because at a barn, everyone knows the horse's name before the owner's.

## 3. Bringing your boarders in

- **Users → Import boarders** takes a CSV (from your current records or QuickBooks) and creates a client account per row, with their horses created alongside.
- Rows sharing an email merge into one account with multiple horses — the multi-horse owner is the farm's version of the multi-address contractor.
- Re-running the import is safe: matched by email, nothing overwritten.
- Welcome emails optional (recommended OFF for the bulk import, then a personal announcement once everyone's in).

## 4. Scheduling & the farm calendar

One calendar, several kinds of events — color-coded, visible to admins in full and filtered for staff and boarders:

- **Vet, farrier, and dentist days** — the farm-wide versions of the service visit. Each visit lists which horses are on the list; owners of those horses are notified automatically, and "hold fee" line items flow to billing (see §8).
- **Recurring cycles that book themselves** — the farrier every 5–6 weeks, spring/fall shots, deworming rotations, Coggins renewals. The system proposes the next date when one completes; nothing falls off the calendar because nobody wrote it down.
- **Lessons** — instructor schedules with AM/PM/evening blocks, repeating weekly slots, cancellation with a reason (and your cancellation-window policy enforced), and a waitlist that auto-offers freed slots.
- **Arena reservations** — boarders book indoor-arena time from their portal (configurable rules: max hours/week, lesson-priority windows, jump-setup slots). Ends the 6 p.m. winter arena traffic jam.
- **Farm events** — clinics, shows, camps, barn parties: sign-up lists, capacity limits, and fees that flow to billing.
- **Staff shifts** ✅ built — two-week grid, assignments, pickup of open shifts.
- **Calendar search & duplicate** — find any past or future event by horse, boarder, or vendor; one-click duplicate onto a new date for repeat visits.
- **Reschedule with notifications** — change a lesson or vet day and every affected owner and staffer automatically gets "was X, now Y."

## 5. Agreements & waivers (the farm's paperwork, enforced)

The equine world's version of the scheduling letter — and legally, far more important:

- **Boarding agreement** — the master template lives in **Portal → Price Book → Agreements**. Placeholders fill automatically: boarder, horse(s), stall, board type, monthly rate pulled **live from the board-rate table**, add-on services, and payment terms. Raise your rates and every new agreement updates itself.
- **Liability release** — Maryland equine-activity statute language, required for **every person who rides or handles a horse on the property**, not just boarders: lesson students, guests, trial riders, clinic participants. A guest can sign on a phone at the gate in under a minute.
- **Acceptance flow** — the signer sees the full document, checks the agreement box, and **types their name as a signature**; minors require a parent/guardian signature. The office is emailed the moment anyone signs.
- **Signatures are protected** — every agreement snapshots the exact text signed. Editing after signature clears it and requires re-acceptance; editing the master never alters agreements already signed.
- **Annual re-signing** — waivers expire on a date you set; the system chases renewals itself and shows a red flag on any horse whose owner's paperwork has lapsed.
- **Per-boarder customization** — each agreement keeps its own editable copy (special arrangements, retired-horse discounts) with "email the updated agreement now" and "reset to standard."
- **Document vault per horse** — Coggins certificates, vaccination records, registration papers, insurance policies, bill-of-sale — uploaded once, attached to the horse, visible to owner and staff forever.

## 6. Talking to boarders (automatic + one-tap)

**Automatic notifications** (email + text + push):

- Board invoice issued / payment received / payment overdue.
- "The farrier saw Beau today" — vet/farrier/dentist visit completed, with notes.
- Coggins or vaccinations expiring in 30 days.
- Agreement or waiver needs re-signing.
- Lesson reminders the evening before; cancellation alerts with rebooking link.
- **Weather triggers** — forecast-driven barn notices: "turnout delayed, footing frozen," "fans on, heat advisory," "blanket change tonight." Drafted automatically from the forecast, sent with one admin tap.
- **Barn-wide emergency broadcast** — one message to every boarder and staffer at once (loose horse, storm damage, quarantine). The button you hope to never need.

**One-tap tools on the staff side:**

- **Photo update** — staff snap a picture of a horse grazing, tap the horse's name, and the owner gets it with a note. Costs ten seconds; it is the single highest-loyalty feature a boarding barn can offer.
- **Incident report** — injury, loose horse, kicked wall: structured form with photos, timestamped, owner notified per your policy, permanently on the horse's record.
- **Request owner callback** — logs the question on the horse and texts the owner a link.
- **"I'm coming out" (boarder side)** — boarders tap to say they're coming to ride, so staff know to leave the horse in.

**How messages go out:** email through your own mail server as info@buckshavenfarm.com (SPF/DKIM/DMARC configured), texts through the office texting line, push to installed phones. Every message ever sent is logged and viewable.

## 7. Horse care records (the barn's paperwork, digitized)

The HVAC service ticket becomes the **horse health & care log** — a phone-friendly wizard staff fill in at the stall:

1. **Horse** — pick from the barn list (auto-fills stall, owner, feed chart).
2. **Type** — vet visit, farrier, medication given, wound care, weight/body-condition check, dental, deworming, vaccination, incident, general note.
3. **Details** — structured per type: vaccine name + due date, shoe type, medication + dose + course, temps/pulse/respiration for sick checks.
4. **Photos** — camera or gallery, auto-compressed for barn-WiFi dead zones.
5. **Billing** — billable to owner / included in board / needs office review, with price pulled from the Price Book.
6. **Review & submit** — drafts save per-step, so a dead spot in the Log Barn loses nothing.

- **Feeding charts & daily logs** ✅ built — each horse's AM/PM feed, supplements, and the daily checklist staff tick off; the barn-display screens show them in each barn.
- **Medication schedules** — active courses appear on the daily checklist until finished; missed doses flag red.
- **Stall cards with QR codes** — print a card per stall; anyone (vet, night-check volunteer, firefighter) scans it and sees the horse's photo, owner, emergency contacts, vet, and current meds. No login needed for the emergency view.
- On submit, billable items are **frozen** — later price changes never alter a submitted entry. Entries are linked to the horse and to any calendar visit they came from.

## 8. Price Book (Portal → Price Book)

Everything money-related, editable without code:

- **Board rates** — stall board, field board, retirement board, training board; per-horse overrides for grandfathered rates.
- **Add-on services** — blanketing, extra feed/supplement handling, holding for vet/farrier, mane pulling, trailer parking, medication administration per course — each with a price and a "bill per month / per event" flag.
- **Lesson & training rates** — private/semi-private/group, packages (buy 10, get one free), school-horse lease rates.
- **Rules** — late fee amount and grace period, returned-check fee, multi-horse discount, annual rate-increase helper (raise everything X% and regenerate agreements for re-signing).
- **Agreement & waiver templates** (see §5) with their placeholder reference.

## 9. Billing & QuickBooks export

The biggest structural difference from HVAC: board is **recurring revenue**, not per-job tickets.

- **Monthly board invoices generate themselves** on the 1st: board rate + active add-ons + billable care-log items + event fees, one invoice per boarder covering all their horses.
- Owners see current and past invoices in their portal; **overdue chases itself** (reminder at due date, late fee applied per the Price Book rule, red flag on the account).
- **Payments** — record checks and cash with one tap; optional card/ACH payments online later (Stripe), with the convenience fee passed through if you choose.
- **QuickBooks export** — IIF file that QuickBooks Desktop imports directly as invoices (customer matched by name, memo carrying horse names and flags), editable A/R and income account names, CSV alongside, sample IIF for safe testing, and double-export protection.
- **Deposit & waitlist** — stall waitlist with deposits recorded, converted to the first month's board when a stall opens.

## 10. Lesson program & school horses

- **Client packages** — sell lesson packages, auto-decrement per lesson, low-balance reminders.
- **School-horse workload guard** — every lesson logs against the horse; daily/weekly limits per horse block over-scheduling automatically. The system protects the horses, not just the schedule.
- **Instructor view** — their day, their students' levels and notes, tack/horse assignments.
- **Progression notes** — per-student private notes (cantering independently, ready for crossrails) that make every instructor interchangeable for a day.

## 11. Farm operations (the parts HVAC never needed)

- **Feed & hay inventory** — track bales/bags in and out, projected days remaining from the feed charts, **low-stock alerts before the weekend**, supplier and price log per delivery.
- **Pasture rotation** — which fields are resting, grazing, or seeded; rotation reminders; mud-season closures reflected on staff turnout checklists.
- **Maintenance board** — arena dragging, fence walks, water-trough checks on repeating schedules; anyone reports an issue with a photo (broken board, leaky hydrant), admins assign it as a task ✅ (tasks built).
- **Manure & bedding** — dumpster/spreader schedule, bedding usage per barn.
- **Compliance reminders** — Maryland stable-license renewal, insurance policy renewals, fire-extinguisher checks — annual dates the system nags about so no one has to remember.
- **Barn cameras** — links to your camera feeds inside the staff portal (and optionally per-stall views for boarders of that stall only).

## 12. Analytics

**Portal → Analytics** — what the website brings in (page views, tour-form submits, call clicks) plus the farm's own pulse: occupancy rate, stall waitlist depth, board revenue vs. last year, lesson hours per week, feed cost per horse. The numbers you'd want before raising rates or building the next run-in shed.

## 13. Under the hood

- **Today:** the public website is static HTML/CSS/JS + two PHP endpoints on the AWS Plesk server; the staff portal is Next.js 14 + Supabase on Cloudflare Pages.
- **Target (recommended):** consolidate the portal onto the same stack as the HVAC system — **Next.js + Prisma + MariaDB on the AWS Plesk server**, deployed via git — one server, one database you own, one deploy routine you already know (`git pull && npm install && npm run deploy`, then `touch tmp/restart.txt`). The existing Supabase tables (profiles, tasks, shifts, availability, time-off, horses, feeding charts/logs, announcements, clock logs, notes) migrate over as the foundation.
- **Security:** passwords hashed, role checks on every page and every server action, boarder-facing links (waiver signing, ready-to-ride) use unguessable one-time tokens, uploads served through access-checked routes, per-horse records visible only to their owners and staff.
- **Degrades gracefully:** if SMS, push, or weather isn't configured yet, actions log to the console instead of crashing — the portal always keeps working.

## 14. Suggested build order

Phased so each stage is useful on its own:

1. **Foundation** — move the portal onto the AWS/Plesk server (one home for everything); boarder accounts + horse records + document vault; import current boarders.
2. **Paperwork** — boarding agreements + liability waivers with e-signature and expiry chasing (the legal exposure ends here); stall cards with QR emergency view.
3. **Money** — Price Book, automatic monthly board invoicing, payment recording, QuickBooks export.
4. **Care** — health/care log wizard, vet-farrier calendar with recurring cycles, expiry alerts (Coggins/vaccines), photo updates to owners.
5. **Boarder experience** — boarder portal, arena reservations, "I'm coming out," notifications, PWA install.
6. **Programs & ops** — lesson scheduling + packages + school-horse limits, feed inventory, pasture rotation, analytics, event sign-ups.

## 15. Open items (as of July 24, 2026)

1. **Website:** finish the Plesk move (files → docroot), install the Let's Encrypt certificate, upload `aerial-hero.mp4` + `aerial-hero.jpg`.
2. **Mail:** stand up info@buckshavenfarm.com on the server, SPF/DKIM/DMARC, and either the AWS port-25 approval you already obtained for rowanhvac.com (same process) or an SES relay to start.
3. **Point `TO_EMAIL`/`FROM_EMAIL`** in `api/contact.php` at the new farm mailbox once it exists.
4. **Testimonials:** swap the three samples on the website for real boarder quotes.
5. **Decide:** portal consolidation onto AWS/Plesk (recommended, §13) vs. staying split with Supabase/Cloudflare.
6. **Gather for import:** boarder list with emails, horses, stalls, and current rates — one spreadsheet is enough to seed §3.
7. **Optional:** the "draft with AI" button (Claude API) for rewriting agreements, barn notices, and weather advisories — say the word and it goes in.
