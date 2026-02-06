# SendSafe Icon Options

This directory contains 7 icon design options for the SendSafe Chrome extension.

## Available Designs

1. **icon-option-1-shield-check.svg** - Shield with checkmark (safety/protection theme)
2. **icon-option-2-shield-envelope.svg** - Shield with envelope (email safety theme)
3. **icon-option-3-shield-warning.svg** - Shield with warning triangle (detection/alert theme)
4. **icon-option-4-shield-scan.svg** - Shield with scan symbol (AI detection theme)
5. **icon-option-5-shield-data.svg** - Shield with layered outlines and data lines (matches reference image)
6. **icon-option-6-shield-eye.svg** - Shield with eye and iris (AI detection/monitoring theme)
7. **icon-option-7-shield-eye.svg** - Shield with eye variation (diagonal scanning pattern)

## Preview

Open `preview-icons.html` in your browser to see all options side by side at different sizes.

## Design Details

- **Color:** 
  - Options 1-4, 6, 7: Orange (#ff6b35) - matches your brand accent color
  - Option 5: Blue color scheme - matches the reference image exactly
- **Style:** Modern, minimalist shield design
- **Optimized for:** Small sizes (16×16) while maintaining clarity at larger sizes (128×128)

## Converting to PNG

You need to create PNG versions at three sizes:
- `icon-16.png` (16×16 pixels) - Toolbar icon
- `icon-48.png` (48×48 pixels) - Extension management page
- `icon-128.png` (128×128 pixels) - Chrome Web Store

### Option 1: Online Converter
1. Visit [CloudConvert](https://cloudconvert.com/svg-to-png) or [ConvertIO](https://convertio.co/svg-png/)
2. Upload your chosen SVG file
3. Set output size to 16×16, 48×48, or 128×128
4. Download and rename to `icon-16.png`, `icon-48.png`, or `icon-128.png`

### Option 2: ImageMagick (Command Line)
```bash
# Install ImageMagick first, then:
magick -density 300 icon-option-1-shield-check.svg -resize 16x16 icon-16.png
magick -density 300 icon-option-1-shield-check.svg -resize 48x48 icon-48.png
magick -density 300 icon-option-1-shield-check.svg -resize 128x128 icon-128.png
```

### Option 3: Design Tool
1. Open the SVG in Figma, Sketch, or Adobe Illustrator
2. Export as PNG at each required size
3. Save with the correct filenames

## After Converting

1. Replace the existing PNG files in this directory
2. Update `manifest.json` to include icon references:
```json
{
  "icons": {
    "16": "assets/icons/icon-16.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  }
}
```

## Notes

- All SVG files are optimized and ready for conversion
- The designs are vector-based, so they scale perfectly to any size
- Options 1-4, 6, and 7 use orange color (#ff6b35) which matches your extension's warning/alert theme
- Option 5 uses blue colors matching the reference image (can be recolored if needed)

