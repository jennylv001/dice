# AI-Enhanced Dice Roll Verification Analysis

## Executive Summary

This document analyzes the feasibility of using AI APIs (Google Gemini) to determine dice roll outcomes, reducing Proof-of-Roll (PPoR) computational requirements while maintaining trust and reducing user device load.

## Current PPoR v1 "ROLLSEAL" System

### Multi-Modal Verification
The current system uses comprehensive on-device verification:

1. **Visual Analysis**
   - Luma correlation checking
   - Barcode verification patterns
   - Dice face detection with confidence scoring
   - Frame-by-frame tracking

2. **Audio Analysis**
   - Chirp signal-to-noise ratio (SNR) verification
   - Ambient noise detection
   - Echo analysis for physical space verification

3. **Motion Sensors**
   - IMU (Inertial Measurement Unit) tumble counting
   - Gyroscope sync with visual rotation
   - Haptic feedback alignment
   - VIO (Visual-Inertial Odometry) divergence checking

4. **Cryptographic Sealing**
   - WebAuthn device signatures
   - Merkle tree proof construction
   - Multi-channel stream roots
   - Audit frame preservation

### Current Device Load
- **CPU**: High (60fps video processing, signal analysis)
- **Memory**: ~150-200MB sustained
- **Battery**: Significant drain during 5-10s roll sequences
- **Network**: Moderate (uploading proof payloads ~50-100KB)

## Proposed AI-Enhanced Approach

### Architecture: Hybrid Trust Model

#### Level 1: Minimal Client-Side (Always Required)
```typescript
interface MinimalClientVerification {
  // Basic liveness checks (cannot be spoofed via AI)
  hapticFeedback: boolean;        // Phone vibrated during roll
  motionDetected: boolean;        // IMU detected movement
  cameraFrameSequence: string[];  // Timestamps of captured frames
  networkLatency: number;         // Round-trip time to server
}
```

**Purpose**: Prove a human is physically present with a real device, not submitting pre-recorded content.

**Device Load**: ~10-20% of current (no video processing, just sensor reading)

#### Level 2: AI-Powered Dice Recognition (Server-Side)
```typescript
interface GeminiDiceAnalysis {
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent";
  input: {
    image: string;  // Base64-encoded final roll frame
    prompt: string; // "Analyze this image. Identify all visible dice and their face values. Return as JSON: [{die_id: number, value: 1-6, confidence: 0-1}]"
  };
  output: {
    dice: Array<{
      die_id: number;
      value: number;  // 1-6
      confidence: number;  // 0.0-1.0
      bounding_box: { x: number; y: number; width: number; height: number };
    }>;
    scene_description: string;
    anomalies: string[];  // e.g., "Dice appears digitally altered"
  };
}
```

**Advantages**:
- State-of-the-art computer vision (Gemini Vision trained on billions of images)
- No client-side ML model loading
- Consistent results across all devices
- Can detect digital manipulation attempts
- Handles varying lighting, angles, dice colors

**Limitations**:
- Network latency (~500ms-2s for API call)
- API costs ($0.0025 per image for Gemini Pro Vision)
- Requires internet connectivity
- Trust shifts to Google infrastructure

#### Level 3: Contextual Fraud Detection (Server-Side)
```typescript
interface FraudDetectionSignals {
  // Pattern analysis
  unusualRollFrequency: boolean;     // >1 roll per 3 seconds
  impossibleDicePositions: boolean;  // Dice overlapping or floating
  consistentHighRolls: boolean;      // Statistical anomaly (>90th percentile)
  
  // Cross-session analysis
  deviceFingerprint: string;         // Browser/hardware characteristics
  ipGeolocation: string;             // Detect VPN/proxy abuse
  historicalIntegrity: number;       // Player's average integrity score
  
  // Image forensics
  metadataStripped: boolean;         // EXIF data removed (suspicious)
  compressionArtifacts: boolean;     // Indicates editing
  duplicateFrameHash: boolean;       // Same image submitted multiple times
}
```

## Implementation Recommendations

### Tiered Approach (Gradual Migration)

#### Phase 1: Hybrid Mode (Recommended for MVP)
**Client**: Minimal verification (haptics + motion) + capture final frame  
**Server**: Gemini AI dice recognition + fraud detection  
**Fallback**: If AI fails or confidence <70%, require full PPoR v1

```typescript
async function hybridRollVerification(
  minimalProof: MinimalClientVerification,
  finalFrame: Blob,
  userId: string
): Promise<RollVerificationResult> {
  // Quick liveness check
  if (!minimalProof.hapticFeedback || !minimalProof.motionDetected) {
    return { success: false, reason: "Liveness check failed" };
  }
  
  // AI-powered dice recognition
  const geminiResult = await callGeminiVision(finalFrame);
  
  if (geminiResult.confidence < 0.7) {
    // Low confidence: request full PPoR
    return { 
      success: false, 
      reason: "AI confidence low, full verification required",
      fallbackToFullPPoR: true 
    };
  }
  
  // Fraud detection
  const fraudScore = await detectFraud(userId, geminiResult, minimalProof);
  
  if (fraudScore > 0.5) {
    // Suspicious: require full PPoR for next N rolls
    flagUserForEnhancedVerification(userId, rolls: 10);
    return { success: false, reason: "Fraud detected" };
  }
  
  return {
    success: true,
    diceValues: geminiResult.dice.map(d => d.value),
    integrityScore: geminiResult.confidence,
    method: "hybrid_ai"
  };
}
```

**Benefits**:
- 80% reduction in device load
- 50% faster roll completion
- Maintains trust through fraud detection
- Graceful degradation to full PPoR if needed

#### Phase 2: Full AI Mode (Future - High Trust Players Only)
For players with strong historical integrity (>90% over 100+ rolls):
- No client-side verification beyond basic liveness
- Pure AI dice recognition
- Randomized full PPoR audits (5% of rolls)

#### Phase 3: On-Device AI (Long-term Vision)
- TensorFlow Lite model for local dice recognition
- No network latency
- Zero API costs
- Privacy-preserving (no images leave device)
- Still requires fraud detection server-side

### Cost Analysis: Gemini API vs. Current System

#### Current System (Full PPoR)
- **Client Cost**: High battery drain, poor UX on older devices
- **Server Cost**: Minimal (just storing proofs in KV)
- **Per Roll**: ~5-10s user wait time

#### Hybrid AI System
- **Client Cost**: Minimal battery drain, fast on all devices
- **Server Cost**: ~$0.0025-0.005 per roll (Gemini API)
- **Per Roll**: ~2-3s user wait time (mostly network latency)

**Break-even Analysis**:
- At 1000 rolls/day: $2.50-5.00/day = ~$75-150/month
- At 10,000 rolls/day: $25-50/day = ~$750-1500/month

**Cloudflare Free Tier Compatibility**: ❌ Exceeds free tier at scale  
**Mitigation**: Hybrid approach with AI for "quick play" mode, full PPoR for tournaments/high stakes

### Alternative: Self-Hosted AI Models

#### Option 1: Cloudflare Workers AI (Free Tier Compatible)
```typescript
// Cloudflare Workers AI provides free inference
const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
  prompt: "Analyze this dice image..."
});
```

**Limitations**:
- Text models only (as of 2024), no vision
- Would need custom dice recognition model
- Potential future option as Cloudflare expands AI offerings

#### Option 2: YOLO/MobileNet on Cloudflare Pages Functions
- Deploy pre-trained dice detection model
- Run inference on edge (Pages Functions)
- ~50-200ms inference time
- No per-request API costs

**Challenges**:
- Model size (10-50MB)
- Cold start latency
- Requires training custom model on dice dataset

## Security Considerations

### Attack Vectors & Mitigations

#### 1. AI Manipulation
**Attack**: User generates synthetic dice images via Stable Diffusion  
**Mitigation**: 
- Require liveness signals (haptics, motion)
- Image forensics (detect GAN artifacts)
- Temporal consistency checks (frame sequence plausibility)

#### 2. Replay Attacks
**Attack**: User submits same winning roll repeatedly  
**Mitigation**:
- Cryptographic nonce challenges (must be visible in frame)
- Perceptual hashing (detect duplicate images)
- Session tokens (one-time use)

#### 3. Proxy Attacks
**Attack**: User streams video from remote device with favorable rolls  
**Mitigation**:
- Network latency analysis (detect unusual round-trip times)
- Device fingerprinting (consistent hardware characteristics)
- Geolocation correlation (IP address vs. claimed location)

#### 4. AI Hallucination
**Risk**: Gemini misidentifies dice values  
**Mitigation**:
- Confidence thresholds (reject <70% confidence)
- Multiple model consensus (Gemini + GPT-4 Vision + Claude Vision)
- User dispute resolution (manual review for high-stakes games)

## Recommendations

### For Kismet MVP (Now)
✅ **Implement Hybrid Approach**
- Minimal client verification (haptics + motion + final frame capture)
- Gemini API dice recognition for "casual mode"
- Full PPoR for "ranked mode" and tournaments
- Fraud detection layer server-side

### Budget Allocation
- **Free Tier Only**: Use full PPoR, no AI costs
- **Small Budget ($50-200/month)**: Hybrid AI for 60-80% of rolls
- **Larger Budget ($500+/month)**: Full AI mode with randomized PPoR audits

### Phased Rollout
1. **Week 1-2**: Implement minimal client-side verification
2. **Week 3-4**: Integrate Gemini API with confidence thresholds
3. **Week 5-6**: Build fraud detection system
4. **Week 7-8**: A/B test: Hybrid vs. Full PPoR (measure UX, cheating rates)

### Long-Term Vision (6-12 months)
- Train custom on-device model (TensorFlow Lite)
- Deploy to Cloudflare Workers AI (when vision models available)
- Achieve <1s roll verification with zero API costs

## Conclusion

**AI-enhanced dice roll verification is feasible and beneficial**, but requires careful design:

✅ **Pros**: 
- 80% reduction in device load
- 50% faster user experience
- Accessible on low-end devices
- Scalable fraud detection

❌ **Cons**:
- API costs ($0.0025-0.005 per roll)
- Network latency (500ms-2s)
- Trust dependency on AI provider
- Requires robust fraud detection

**Recommended Approach**: Hybrid model with gradual migration, tiered verification based on game stakes and player trust score.

---

*Last Updated: 2025-11-05*  
*Author: @copilot*  
*Status: Analysis Complete - Awaiting Implementation Decision*
