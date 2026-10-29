# What goes wrong when these questions are asked

Asked on 2026-10-28, verbatim. Nothing in the app was changed.

1. define light?
2. how fast does light travel in the air?
3. how fast light travel from air to water?
4. why the light bend from air to water?

Each later question inherits a vague "light" from the first. Question 3 asks for one speed of a crossing. Question 4 asks why light bends, as if every ray from air into water bends.

## Question 1 — "define light?"

**What is wrong with the ask**

- "Light" has four common meanings, and the question does not pick one.
- No wavelength, no observer, and no theory (ray, wave, or photon). A definition that is right in one sense is wrong in another.

**Which definition is in play**

- Everyday speech: the visible band that human eyes detect, about 380–750 nm. That is a slice of the electromagnetic spectrum, not a different substance.
- Physics, broad: electromagnetic radiation. Radio, infrared, ultraviolet, and X-rays are the same field at other wavelengths. Calling only the visible band "light" then drops those.
- Physics, narrow: a quantum of that field, a photon. A photon has energy E = hf and momentum p = h/λ. It is not a little ball that travels only inside the visible band.
- Perception: brightness and color as seen. That depends on the eye and the brain. A definition that stops at "what we see" cannot answer the speed or bending questions.

A fused answer that says "light is a ray of brightness that always travels at 300,000 km/s" has already picked the weakest of these and locked in the wrong speed for the next two questions.

## Question 2 — "how fast does light travel in the air?"

**What is wrong with the ask**

- "The air" has no temperature, pressure, humidity, or wavelength. The speed depends on all four.
- The exact constant people quote is the speed in vacuum, not in air. Air is not a vacuum.
- School tables often set the refractive index of air to 1 and the speed to 3 × 10^8 m/s. That rounded vacuum figure is about right for three figures. It is the wrong answer to a question that says "in the air" and asks for more than three figures.
- "How fast" can mean phase velocity, group velocity, or the speed of a signal front. For visible light in air those are almost the same. They are not the same number in a precise answer.

**Usable values, with the conditions attached**

- In vacuum the speed is defined: c = 299,792,458 m/s. The refractive index of vacuum is exactly 1.
- For dry air near 0 °C and 1 atm, at the sodium D line (589 nm), a standard table value is n ≈ 1.000293. The phase speed is then c/n ≈ 2.99705 × 10^8 m/s, about 88 km/s slower than c, or about 0.03 percent slower.
- At room conditions the index is a little lower. One published red-light example (0.7 µm, 20 °C, 101.325 kPa) uses n ≈ 1.000270. Still about 2.999 × 10^8 m/s if c is rounded to 3 × 10^8.
- Change the color, the humidity, or the altitude and the digits after 299,7 change. One bare number with no conditions overclaims.

Saying "the same as in vacuum" is the usual short answer and is false once the question is read strictly. Saying "exactly 300,000 km/s" is a rounding of c, not a measurement in air.

## Question 3 — "how fast light travel from air to water?"

**What is wrong with the ask**

- Grammar aside, the phrase asks for the speed of the trip from one medium to the other. There is no third speed for the crossing.
- Light has one speed in air and a lower speed in water. Frequency stays the same across the surface. Wavelength and speed change together.
- The question does not say pure water, temperature, wavelength, or depth. It also does not say whether the ray hits straight on or at a slant. The slant changes the direction, not the speed inside each medium.
- A common reply puts the water speed on this question and then has nothing left for "in the air," or it keeps 3 × 10^8 m/s for both.

**Speed in water, not speed of the crossing**

- At about 20 °C and 589 nm, n for water is 1.333. Phase speed v = c/n ≈ 2.249 × 10^8 m/s, close to three quarters of c.
- The school fraction n = 4/3 gives v = (3/4)c. With c written as 3 × 10^8 m/s, that is 2.25 × 10^8 m/s. With the defined c it is about 2.248 × 10^8 m/s. Both are textbook answers. Neither is "how fast it travels from air to water."
- Relative to air, the drop is about c/1.0003 to c/1.333, a factor of roughly 1.333. The wavelength in water is shorter by that same factor. The frequency is not.

Blue light in water has a slightly higher index than red light, so it is slightly slower. One speed for "light" erases that.

The front of a signal still cannot outrun c. The number c/n is the phase speed of a steady wave in the medium, which is the speed these questions mean. It is not a claim that a photon between interactions is a slower particle. See the last section.

## Question 4 — "why the light bend from air to water?"

**What is wrong with the ask**

- It assumes the light bends. A ray that hits the surface straight on, along the normal, does not bend. It still slows, and its wavelength still shortens.
- No angle and no color are given, so there is no amount of bend to compute. "Why" is being asked as if the reason included a single angle.
- Bending (refraction), bouncing (reflection), and spreading around an edge (diffraction) get swapped. At an air-water surface some light is also reflected. The bend is the path of the transmitted part.
- "Because water is denser" is only half-safe here. Water has a higher refractive index than air (about 1.333 against about 1.0003), and it is also heavier per volume. Optical density is the index, not the mass density. The two can come apart in other materials.

**What holds**

For a ray that arrives at an angle:

- Snell's law: n_air sin θ_air = n_water sin θ_water. Angles are measured from the normal, the line perpendicular to the surface, not from the surface itself.
- Because n_water > n_air, θ_water is smaller than θ_air. The ray bends toward the normal. On the way back out, from water to air, it bends away from the normal. Reversing that direction is the usual diagram error.
- The ray, the normal, and the bent ray lie in one plane.

Why the direction changes when the speed changes:

- Wave account: the part of the wavefront that enters the water first slows first. The wavefront swings, so the ray, which is perpendicular to the wavefront, turns toward the normal. This is Huygens' construction.
- Path account: among nearby routes, the one that is actually taken is the one that takes the least time. A straight line is not the least-time path when the speed is lower on one side of the boundary. This is Fermat's principle. It gives the same Snell's law.
- Field account: the wave along the surface has to match on both sides, so the component of the wave along the surface does not jump. That matching condition is Snell's law again.

School line that is good enough for this question: light slows on entering water, so an oblique ray bends toward the normal.

## Where a confident answer goes wrong

- "Photons slow down inside water." The macroscopic wave's phase speed is c/n. A photon picture in which each photon always moves at c between interactions, and the delay comes from randomly absorbing and re-emitting, is a common textbook story and a bad one. Random absorption would destroy the beam. The coherent account is that the charges in the water are driven by the wave and reradiate a forward wave that lags, so the combined wave has phase speed c/n.
- "It bends because the surface pulls it" or "because of gravity." No.
- "It always bends from air to water." Not at perpendicular incidence.
- "It bends away from the normal as it enters water." That is the water-to-air direction.
- One number, 3 × 10^8 m/s or 2.25 × 10^8 m/s, used as the speed both in air and "from air to water."

## If the four answers are fused

A fused answer is wrong when it says any of these:

- Light is only what the eye sees, and that visible ray has one speed in every transparent material.
- The speed in air is exactly c, or exactly 300,000 km/s.
- There is a single speed "from air to water," and that speed is either c or the speed in water.
- Light bends at every air-water crossing, and the bend is away from the normal, or is caused by mass density or gravity.
- The April-style school index n = 4/3 and the defined vacuum speed are the same measurement. One is a rounded teaching value for yellow light in water. The other is a defined constant for vacuum.

## Sources checked

- SI definition: c = 299,792,458 m/s in vacuum.
- Refractive-index tables for the sodium D line (589 nm): air near 0 °C and 1 atm, n ≈ 1.000293. Water near 20 °C, n = 1.333. Same convention in the archived Wikipedia refractive-index table and in standard school tables (air often rounded to 1.0003 or 1.00029, water to 1.33 or 4/3).
- Stull, *Practical Meteorology*, atmospheric-optics notes: n = c/v, Snell's law, and a worked red-light comparison of air and water at 20 °C and 101.325 kPa.
- School statements of refraction: an oblique ray from air into water bends toward the normal because the speed decreases. Straight-on incidence is the exception those statements often skip.
