# Anti-Surveillance Style Research

**Status:** Initial research note
**Date:** 2026-07-11
**Scope:** Ghost Font-adjacent OCR resistance, adversarial clothing, makeup, and computer-vision tracking limits
**Use:** Privacy/art/design research for BSS style, not evasion of lawful process or license to trespass

## Executive read

Anti-surveillance style is not one trick. Different systems track different things:

- OCR reads text.
- Face detection finds faces.
- Face recognition matches identity.
- Person detection finds bodies.
- Person re-identification links the same body/clothing across cameras.
- ALPR reads plates.
- Phone/BLE/Wi-Fi/payment metadata tracks devices and behavior.

Ghost Font-style typography may frustrate OCR/LLM ingestion for text. It does **not** protect against face recognition, person re-ID, phone telemetry, payments, or location data. A serious BSS privacy style should be layered, tested, and honest about failure modes.

## Research anchors

### OCR / text ingestion resistance

- Ghost Font concept surfaced in the 2026-07-11 morning brief as a hype signal: <https://www.mixfont.com/ghost-font>
- Adjacent idea: typography and layout that remains human-readable while degrading OCR or automated extraction.

Questions to test:

- Does it affect Tesseract, EasyOCR, Apple/Google OCR, and multimodal LLM OCR?
- Does it survive screenshot compression, print, photocopy, and camera capture?
- Does it degrade accessibility or human readability too much?

### Face and person detection / adversarial wearables

- `2208.06962` — *InvisibiliTee: Angle-agnostic Cloaking from Person-Tracking Systems with a Tee*: <https://arxiv.org/abs/2208.06962>
- CV Dazzle, art/design lineage for face-detection disruption: <https://cvdazzle.com/>
- HyperFace, adversarial textile/face-like pattern concept by Adam Harvey: <https://ahprojects.com/hyperface/>
- Reflectacles / IR-reflective eyewear concept: <https://www.reflectacles.com/>

### Makeup and face recognition research

- `2105.03162` — *Adv-Makeup: A New Imperceptible and Transferable Attack on Face Recognition*: <https://arxiv.org/abs/2105.03162>
- `2306.10008` — *CLIP2Protect: Protecting Facial Privacy using Text-Guided Makeup via Adversarial Latent Search*: <https://arxiv.org/abs/2306.10008>
- `2405.09882` — *DiffAM: Diffusion-based Adversarial Makeup Transfer for Facial Privacy Protection*: <https://arxiv.org/abs/2405.09882>
- `2006.05074` — *Detection of Makeup Presentation Attacks based on Deep Face Representations*: <https://arxiv.org/abs/2006.05074>

## Technique taxonomy

### 1. OCR-resistant typography

Examples:

- Ghost Font-style glyph distortions.
- Human-readable ligatures/overlaps/noise.
- Layout-based disruption: columns, backgrounds, rotated annotations.

Strengths:

- Fits BSS paper crypto / zine / ARG aesthetics.
- Easy to test with local OCR.
- Low physical risk.

Weaknesses:

- May fail against modern multimodal models.
- Can harm accessibility.
- Does not affect camera/person tracking.

### 2. Face contour disruption

Examples:

- Asymmetric high-contrast makeup.
- Hair/hat/glasses that break expected eye/nose/mouth contrast.
- CV Dazzle-inspired style.

Strengths:

- Strong cyberpunk visual language.
- Can degrade older face detection pipelines.

Weaknesses:

- Modern recognition can be robust to partial changes.
- Draws human attention.
- May violate dress codes or mask rules in some spaces.

### 3. Adversarial patches / garments

Examples:

- Printed patterns optimized against person detectors.
- HyperFace-like textiles.
- InvisibiliTee-like person-tracking cloaking patterns.

Strengths:

- Directly targets object/person detectors rather than identity only.
- Good BSS artifact lane: shirts, scarves, backpack covers.

Weaknesses:

- Model-specific; may fail against unseen detectors.
- Sensitive to angle, lighting, print fidelity, wrinkles, occlusion.
- Could increase suspicion or tracking by humans.

### 4. Reflective / IR accessories

Examples:

- IR-reflective lenses or frames.
- Retroreflective/anti-paparazzi fabrics.
- Hats, masks, or scarves where legal and context-appropriate.

Strengths:

- Can disrupt some flash/IR/night camera scenarios.
- Practical accessory form factor.

Weaknesses:

- Many cameras use visible light; no universal effect.
- Active IR LEDs may be conspicuous, battery-dependent, or prohibited.
- Does not stop device/location tracking.

### 5. Person re-identification friction

Examples:

- Reversible jackets / layer changes.
- Avoiding highly unique outfit signatures when anonymity matters.
- Changing silhouette with removable layers.

Strengths:

- Targets cross-camera linking, not only face recognition.
- Practical and legal when treated as ordinary clothing choices.

Weaknesses:

- Gait, height, bag, shoes, route, device signals, and companions still link sessions.
- Re-ID systems can use whole-body cues, not just face.

### 6. Non-visual tracking hygiene

Examples:

- Phone radio hygiene: airplane mode, powered off, or Faraday bag where lawful and safe.
- Avoiding unique BLE/Wi-Fi beaconing.
- Cash/transit/payment compartmentalization.
- License plate and vehicle-route awareness.

Strengths:

- Addresses the highest-confidence tracking channels.

Weaknesses:

- Operationally inconvenient.
- Can conflict with safety, emergency access, or ordinary life.

## BSS style directions

### Netrunner public-safe look

- Matte black/grey base layers.
- Asymmetric high-contrast scarf or collar.
- Patterned overshirt/backpack panel inspired by adversarial patch research.
- Glasses/frames as visual signature, but not relied on as protection.
- Typography: Ghost Font labels/patches on non-critical text.

### ARG/paper crypto artifacts

- Human-readable, OCR-degraded handouts.
- Redundant plaintext accessible copy for trusted participants.
- QR codes only for non-sensitive redirects; assume QR is machine-readable.
- Printed challenge text tested against multiple OCR engines.

### Field rig clothing

- Reversible outer layer.
- Low-logo, non-unique shoes/bag if anonymity matters.
- Removable high-contrast pattern panel for controlled CV experiments.
- Avoid anything that impairs situational awareness or safety.

## Local test workflow

1. Photograph style/artifact under multiple lighting and camera angles.
2. Run OCR tests: Tesseract, EasyOCR if installed, phone OCR, and multimodal LLM image description where available.
3. Run detector tests: YOLO/person detector, face detector, person crop/re-ID if available.
4. Record: `technique`, `camera`, `lighting`, `distance`, `model`, `success/fail`, `human readability`, `notes`.
5. Retest after compression/social upload; many adversarial effects fail after resizing.
6. Store results in a BSS style lab note, not as claims of invisibility.

## Guardrails

- Do not treat any style as guaranteed anonymity.
- Do not use this workflow to evade law enforcement, commit crimes, trespass, or bypass access controls.
- Keep human safety and accessibility ahead of adversarial effect.
- Avoid collecting biometric data from bystanders; test on consenting subjects or self-images.
- Label claims as `tested`, `untested`, or `model-specific`.

## Implementation backlog

1. Add `style_lab` vault template for OCR/CV test runs.
2. Build a local OCR benchmark for Ghost Font and BSS paper artifacts.
3. Build a lightweight detector benchmark using public models and self-shot images.
4. Create a design board for wearable patterns, scarves, stickers, and field-rig panels.
5. Record failures as aggressively as successes; failure modes are the useful part.
