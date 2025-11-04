# User Journey Mini-Map & Simplifications

## Core Moments
1. Enter Room (Host creates / Challenger joins)
2. Dice Verification (steady in frame until locked)
3. Live View Connection (optional but preferred for trust)
4. Your Turn Roll (stimulus sequence + sealing)
5. Result View (opponent sees sealed integrity tier)

## Simplifications Applied
- RTC Negotiation: Deterministic initiator (lexicographic userId) prevents dual offer race; offer only after both peers express intent.
- Dice Status Language: Reduced to Detecting → Locked → Rolling → Sealed for clarity; removed ambiguous WAITING messages.
- Integrity Presentation: Collapsed granular percentages into tiers (High ≥0.8, Medium ≥0.5, Low <0.5) for immediate trust signal.
- Stimulus Duration: Shortened from 2000ms to 1400ms to improve perceived responsiveness while retaining multi-channel entropy (luma modulation, barcode, haptics, chirps).
- Phase Exposure: UI texts now map internal phases to four user concepts: Setup, Ready, Rolling, Sealed (internal enumerations kept for logic stability).

## Remaining Opportunities
- Server-side broadcast of designated RTC initiator (optional; current client-side derivation is stable with generated ids).
- Further phase collapse in shared/types if internal enumeration proliferation causes confusion for future contributors.
- Adaptive stimulus length: could early-stop when dice settle sooner, trimming average roll time further.
- Integrity badge hover: show advanced metrics (luma correlation, chirp SNR) only on demand.

## Rationale
These changes reduce cognitive load, remove race conditions that risk failed video negotiation, and shift integrity feedback from raw numeric noise to actionable trust tiers. Shorter stimuli speed up completion without meaningfully weakening liveness checks due to retained randomness sources.

## Success Criteria
- Users see remote video reliably within 2s of both expressing intent.
- Dice lock message appears within ~1s of steady placement.
- Roll + seal cycle completes typically <5s total.
- Integrity badge immediately conveys outcome without explanation.

