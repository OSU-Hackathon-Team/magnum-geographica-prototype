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
     - Type tag
     - Optional description or media
   - Rules:
     - Must be observable / publicly accessible
     - No personal residences or private markers

# Attestations

- Types:
  - Strong — Device recorded GPS track that directly follows the mapped trail.
  - Weak — Manual confirmation or vote stating that the mapped trail is correct/useful.
- Rules:
  - Strong attestations should automatically verify the geometry when a quorum of distinct users confirm it.
  - Weak attestations influence visibility and reputation but cannot verify geometry alone.
  - False attestations (impossible movement speed, off-path traces) reduce a user's trust score.

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
