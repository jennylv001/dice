# Threat Model

## Replay / Deepfake
- **Vector**: Use prerecorded video/sensors
- **Mitigation**: Nonce-driven stimuli (visual, chirps, haptics) across channels; cross-modal timing; signed proof

## Sensor Spoofing
- **Vector**: Fake IMU/mic
- **Mitigation**: Haptic→IMU alignment; chirp SNR & echo; VIO↔IMU parity; STRICT requires ≥2 channels

## Optical Confusion
- **Vector**: Painted/sticker dice; staged placement
- **Mitigation**: Tumble ≥ 2; multi-frame pip stability ≥ 200ms; pip geometry

## Signaling/RTC Abuse
- **Vector**: Malformed SDP/ICE
- **Mitigation**: DO forwards only; no server execution of SDP; RTC optional and sandboxed; thumbnail path persists

## Failure Tests
- Screen replay → low `r_luma` / barcode mismatch → reject
- IMU spoof → high `haptic_imu_ms` → reject (strict)
- Mic off → must still pass 2 channels in ranked
- No tumble → reject
