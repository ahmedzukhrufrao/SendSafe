# How to Create a Good Chrome Web Store Listing

## Extension Icon Requirements

### Mandatory Requirements

1. **File Format**: Must be PNG format
2. **File Size**: Exactly 128x128 pixels
3. **File Location**: Must be included in your extension's ZIP file
4. **File Reference**: Must be specified in `manifest.json` under the `icons` section

### Icon Artwork Size Guidelines

**Critical**: The actual icon artwork should NOT fill the entire 128x128 canvas.

- **Square icons**: Artwork should be **96x96 pixels** with **16 pixels of transparent padding** on each side
- **Circular icons**: Diameter should be approximately **112 pixels** (85-90% of image width)
- **Irregular shapes** (like shields): Artwork should occupy **75-80% of the canvas width** with similar visual weight to other icons

**Why?** All extension icons should have roughly the same visual weight. If your icon fills the entire 128x128 space, it will appear larger than other icons in the store.

### Design Guidelines

#### ✅ DO:
- Make the icon **front-facing** (face the viewer directly)
- Use **subtle perspective** if needed (for tangibility)
- Add a **subtle white outer glow** if your icon is mostly dark (for visibility on dark backgrounds)
- Use **small shadows** for contrast (if needed)
- Design to work on **both light and dark backgrounds**
- Keep **bevel depth to 4 pixels** maximum (if using bevels)

#### ❌ DON'T:
- Add edges or borders around the 128x128 image (Chrome UI will add these)
- Use large drop shadows (Chrome UI may add shadows)
- Use dramatic perspective angles
- Fill the entire 128x128 canvas with artwork
- Use too much white or light gray (doesn't stand out on light backgrounds)

### Visual Weight Templates

Google provides templates to help judge icon size:
- **Square template**: 96x96 pixels artwork area
- **Circular template**: ~112 pixel diameter
- **Irregular template**: Similar visual weight to square/circular icons

Your icon should have similar visual weight to other store icons when placed side-by-side.

### Background Compatibility

Your icon must look good on:
- **Light gray background** (Chrome Web Store default)
- **Dark backgrounds** (dark mode, extension management pages)

**Tip**: If your icon is dark-colored, add a subtle white outer glow so it's visible on dark backgrounds.

### Icon Examples

Good icons:
- Front-facing perspective
- Proper sizing (not filling entire canvas)
- Works on both light and dark backgrounds
- Similar visual weight to other icons

Bad icons:
- Too much perspective (dramatic angles)
- Fills entire 128x128 canvas
- Hard to see on dark backgrounds
- Inconsistent visual weight

---

## Promotional Images

### Required
- **Small promotional image**: 440x280 pixels (MANDATORY)

### Optional (for better visibility)
- **Marquee image**: 1400x560 pixels (for featured placement)

### Design Tips for Promotional Images
- **Avoid text** (images may be used across different locales)
- **Fill the entire region** (no padding)
- **Use saturated colors** (they work better)
- **Avoid white and light gray** (doesn't stand out)
- **Make edges well-defined**
- **Ensure it looks good at 50% size** (may be scaled down)
- **Assume light gray background**

**Note**: Extensions without a small promotional image will be shown **after** extensions that have one.

---

## Screenshots

### Requirements
- **Minimum**: 1 screenshot (required)
- **Recommended**: Up to 5 screenshots (maximum allowed)
- **Dimensions**: 1280x800 pixels (preferred) or 640x400 pixels
- **Format**: Square corners, no padding (full bleed)

### Best Practices
- Show **actual user experience**
- Focus on **core features**
- Demonstrate **look and feel** of the extension
- Help users **anticipate the experience**

**Note**: 1280x800 screenshots are preferred as they look better on high-resolution displays. All screenshots are currently downscaled to 640x400, so ensure your screenshots look good when scaled down.

---

## Summary Checklist

### Icon Checklist
- [ ] PNG format
- [ ] Exactly 128x128 pixels total size
- [ ] Artwork is 96x96 (square) or 75-80% of canvas (irregular)
- [ ] Transparent padding around edges
- [ ] Works on light and dark backgrounds
- [ ] Front-facing perspective
- [ ] Similar visual weight to other store icons
- [ ] No borders or edges added
- [ ] No large drop shadows

### Promotional Image Checklist
- [ ] Small promotional image: 440x280 pixels (required)
- [ ] Marquee image: 1400x560 pixels (optional, for featured placement)
- [ ] Avoids text
- [ ] Uses saturated colors
- [ ] Fills entire region
- [ ] Well-defined edges

### Screenshot Checklist
- [ ] At least 1 screenshot (required)
- [ ] Up to 5 screenshots (recommended)
- [ ] 1280x800 pixels (preferred) or 640x400 pixels
- [ ] Square corners, no padding
- [ ] Shows actual user experience
- [ ] Demonstrates core features

---

## Resources

- [Chrome Web Store Images Documentation](https://developer.chrome.com/docs/webstore/images#icon)
- [Creating a Compelling Listing Page](https://developer.chrome.com/docs/webstore/best-practices)

---

## Quick Reference

| Item | Required Size | Format | Required? |
|------|--------------|--------|-----------|
| Extension Icon | 128x128 (artwork: 96x96) | PNG | ✅ Yes |
| Small Promo | 440x280 | Any | ✅ Yes |
| Marquee Promo | 1400x560 | Any | ❌ Optional |
| Screenshot | 1280x800 or 640x400 | Any | ✅ Yes (min 1) |

