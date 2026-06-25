# Scope

- Not just any street, specifically should be 'trail' like
  - However ones that go along streets (ex trail connectors), should be allowed, but marked as such.
- Land marks
  - Rules:
    - Don't just add your friends house!

# Wiki pages

- Purpose:
  - To provide practical, trail-specific information.
  - Focus on what it is like to experience and maintain the trail.
  - Avoid overly general or historical content that belongs elsewhere.

- Content Guidelines:
  - Include:
    - Trail conditions, common hazards, and access rules.
    - Seasonal notes or restrictions.
    - Parking, entry fees, or permit requirements.
    - Links to official pages or external references.
  - Avoid:
    - Long-form history or unrelated regional info.
    - Copying content directly from Wikipedia or external sources.
    - Personal opinions or trip reports not relevant to mapping.

- Redundancy:
  - Keep overlap with Wikipedia minimal.
  - If the same subject has a detailed Wikipedia page, link to it rather than restating.
  - This page should add practical and current context, not replace existing encyclopedic info.

- Citations:
  - When possible, a citation should be used.
  - The official website is preferable, but images of signs or rule boards are also acceptable.

# Notes on System Tiers

- General Guideline:
  - Each level should serve a clear organizational purpose.
  - Avoid making unnecessary layers when a simpler one fits.
  - A child can belong to more than one parent, but parents should not skip a tier.

0. 'Super-System'
   - A conceptual or officially unified collection of Systems.
   - Must include at least two Systems.
   - Systems included should be clearly related:
     - Shared signage, brand, or continuous long-distance path.
   - A System can belong to more than one Super-System.
   - Examples:
     - Ohio Erie Trail
     - U.S. Bike Route 50
   - Note: Should be marked 'Unofficial' if self-organized or ethically questionable.

1. 'System'
   - Main organizational body (park, forest, preserve, city network).
   - Must have a definable management or ownership.
   - Contains boundary geometry and ownership source.
   - Can contain multiple Sub-Systems or Trails directly.
   - Typically recognized by the public as one network.
   - May appear in multiple Super-Systems if shared.

1.b 'Sub-System'
_ A group of physically or thematically connected trails within a System.
_ Should share a trailhead, signage, or maintenance unit.
_ Optional; omit unless there is a clear local grouping reason.
_ If it grows large enough to feel standalone, promote it to a System.

2. 'Trail'
   - Represents one continuous route.
   - Can belong to multiple Systems or Sub-Systems.
   - Subdivisions (segments) can note:
     - Shared-use sections along roads
     - Steep grades or hazards
     - Alternate routes or loops
   - Each segment can carry its own metadata override if needed.

3. 'Feature' / 'Landmark'
   - Single point of interest attached to a Trail or System.
   - Examples: Shelter, Scenic Point, Trailhead, Water Source.
   - Should include:
     - Coordinates
     - A preset (see below)
     - Optional description or media
   - Rules:
     - Must be observable / publicly accessible
     - No personal residences or private markers

## Features & Presets

- Features are added via _presets_, not raw OSM tags.
  - A preset is an icon-oriented type (bench, water source, viewpoint…) with a few simple questions (booleans or small dropdowns of 5 items or fewer).
  - The hiker flow is icon-first and tap-driven; no typing is required to choose a type.
  - A photo is always encouraged but skippable.
- Moderators create and edit presets, and each preset is backed by OSM tags so features can eventually be upstreamed to OSM.
- Presets live in the database and are synced to the user's device.

# Trails, Traces & Tiers

- Trails have three tiers:
  - **Premium** — imported from an official source. Geometry is authoritative and never changed by GPS data.
  - **Elevated** — promoted from a synthesized trail and then frozen (no longer changed by user traces).
  - **Synthesized** — built and maintained from segments of user GPS traces.
- Only **synthesized** trails are affected by GPS data. Premium and elevated are immune.
- GPS traces are raw input that _create and maintain_ synthesized trails (not just verify them).
  - Traces are organized by system, auto-tagged by where their geometry intersects system boundaries.
  - Trail paths are synthesized from _segments_ of many traces, since people take multiple routes — never from a single trace.
- Trace weighting:
  - Users can downvote a trace, which reduces its weight.
  - A trace whose weight drops below a low ratio is ignored by synthesis.
  - Moderators can remove traces.
- Trace-segment → trail assignment is marked by users (Wikipedia style).
  - An algorithm proposes which segments belong to which trail, or flags a possible new trail.
  - Votes on assignments feed the synthesis run.

# Rules

- Everything must be 'legally viewable'
  - No trespassing!
  - It on private land, it MUST be:
    1. Open to the public
    2. Can be legally observed from public land

## Land Ownership and Boundaries

- Boundary data should reference verifiable public sources whenever possible.
  - Prefer official datasets like PAD‑US, USGS, or USDA FS for U.S. territories.
- Boundaries are editable but must retain provenance (original source + date).
- Combining or refining parcels:
  - Allowed only if the new boundary aligns with verifiable evidence.
  - Combined parcels must have consistent access permissions.
- Each System or Sub‑System should include a boundary polygon if applicable.

# Karma & Moderation

- Modeled closely on Wikipedia moderation.
- Karma is the core currency and is lifetime-cumulative.
  - Getting upvoted for things (especially traces and features) is the number one way users earn points.
  - Upvote value is weighted by the voter's trust tier.
- Karma determines a user's trust tier, which gates privileges (creating systems, reverting, promoting trails, etc.).
- Any logged-in user can revert changes (subject to protection rules).
- All hierarchy and entity mutations are revision-logged for revert.
- Protection:
  - Popular entities (many upvotes or many children) are auto semi-protected; only established users can edit/revert them.
  - A user cannot delete a system with multiple trails they did not create.
  - Moderators can fully protect an entity.
- Low-quality users (few upvotes, few traces) performing sensitive actions (reverting, deleting popular systems) are auto-flagged for moderator review.
