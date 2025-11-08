# Anti-Detection Integration Guide for Nanobrowser

## Overview
This guide shows how to modify Nanobrowser to become undetectable as automation by implementing timing randomization, fingerprint spoofing, and human-like behavior patterns.

## Key Changes Required

### 1. Modify background.iife.js

#### A. Add imports at the top:
```javascript
const HumanTiming = require('./human-timing.js');
const BehaviorRandomizer = require('./behavior-randomizer.js');
const FingerprintRandomizer = require('./fingerprint-randomizer.js');
const { injectStealthScript } = require('./stealth-injector.js');
```

#### B. Replace fixed 1000ms delays:

**Find this pattern:**
```javascript
await new Promise(g=>setTimeout(g,1e3))
```

**Replace with:**
```javascript
const randomDelay = HumanTiming.getRandomActionDelay();
await new Promise(g=>setTimeout(g,randomDelay))
```

#### C. Enhance browser initialization:

**Find browser launch configuration and add:**
```javascript
const browser = await puppeteer.launch({
  headless: false,
  args: FingerprintRandomizer.getBrowserArgs(),
  // ... other options
});

// Inject stealth script into all pages
browser.on('targetcreated', async (target) => {
  const page = await target.page();
  if (page) {
    await injectStealthScript(page);
    
    // Set random viewport
    const viewport = FingerprintRandomizer.getRandomViewport();
    await page.setViewport(viewport);
    
    // Set random user agent
    await page.setUserAgent(FingerprintRandomizer.getRandomUserAgent());
  }
});
```

#### D. Enhance click actions:

**Find click implementations and modify:**
```javascript
async clickElement(element) {
  // Add random mouse movement before clicking
  await BehaviorRandomizer.addRandomMouseMovement(this.page, element);
  
  // Random delay before click
  await BehaviorRandomizer.randomDelay(100, 300);
  
  // Perform click
  await element.click();
  
  // Random delay after click
  const postClickDelay = HumanTiming.getRandomActionDelay();
  await new Promise(resolve => setTimeout(resolve, postClickDelay));
  
  // Occasionally add random interactions
  await BehaviorRandomizer.addRandomInteractions(this.page);
}
```

#### E. Enhance typing actions:

**Replace standard typing with human-like typing:**
```javascript
async inputText(element, text) {
  await element.focus();
  
  // Use human-like typing instead of standard input
  await BehaviorRandomizer.humanType(this.page, element, text);
  
  // Random delay after typing
  await BehaviorRandomizer.randomDelay(200, 800);
}
```

### 2. Modify waiting and page load behavior:

**Find page load waiting and replace:**
```javascript
// Instead of fixed waits
await new Promise(resolve => setTimeout(resolve, 3000));

// Use variable waits
const pageLoadDelay = HumanTiming.getPageLoadDelay();
await new Promise(resolve => setTimeout(resolve, pageLoadDelay));

// Add reading simulation
await BehaviorRandomizer.simulateReading(this.page);
```

### 3. Add Anti-Detection Headers:

**Modify HTTP headers:**
```javascript
await page.setExtraHTTPHeaders({
  'Accept-Language': FingerprintRandomizer.getRandomLanguage(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
});
```

### 4. WebDriver Property Masking:

The stealth-injector.js already handles this, but ensure it's applied to every page:

```javascript
// Add to page initialization
await page.evaluateOnNewDocument(() => {
  // Remove webdriver property
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
  
  // Remove chrome automation indicators
  delete window.chrome.runtime.onConnect;
  delete window.chrome.runtime.onMessage;
});
```

## Implementation Priority

1. **High Priority (Immediate detection blockers):**
   - Inject stealth script (stealth-injector.js)
   - Replace fixed 1000ms delays with random delays
   - Remove/mask webdriver properties

2. **Medium Priority (Behavioral detection):**
   - Implement human-like clicking with mouse movements
   - Add realistic typing patterns with occasional typos
   - Randomize viewport and user agent

3. **Low Priority (Advanced fingerprinting):**
   - Implement reading simulation delays
   - Add random scrolling and mouse movements
   - Randomize browser launch arguments

## Testing Detection

After implementing these changes, test against common bot detection services:

1. **https://bot.sannysoft.com/** - Tests for basic automation signatures
2. **https://intoli.com/blog/not-possible-to-block-chrome-headless/** - Advanced headless detection
3. **https://arh.antoinevastel.com/bots/areyouheadless** - Headless browser detection
4. **https://pixelscan.net/** - Comprehensive browser fingerprinting

## Performance Considerations

- Random delays will slow down automation (expected)
- Memory usage may increase slightly due to behavioral simulation
- CPU usage may increase due to fingerprint randomization
- Consider implementing delay reduction modes for development/testing

## Advanced Evasion Techniques

For even better evasion:

1. **Proxy rotation** - Route requests through different IP addresses
2. **Session persistence** - Maintain cookies and localStorage between runs
3. **Captcha solving** - Integrate with 2captcha or similar services
4. **Browser profile reuse** - Save and reuse browser profiles
5. **Request interception** - Modify requests to remove automation signatures

Remember: Detection systems constantly evolve, so this needs regular updates!