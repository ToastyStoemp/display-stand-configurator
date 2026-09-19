# Display stand configurator

A browser-based parametric display designer with shared 2D/3D geometry.

Run `python -m http.server 8765 --bind 127.0.0.1`, then open
`http://127.0.0.1:8765`. Keep `index.html`, `studio.js`, `studio.css`,
`manufacturing.js`, `product-placement.js`, `product-arranger.js`,
`product-arranger.css`, and `vendor/clipper.js` together when copying or hosting it.
No build step or external runtime service is required.

## Projects and editing

- Changes autosave in this browser on this origin. JSON exports are portable
  backups and include products, embedded product images, and fabrication settings.
- Open JSON accepts version 3, 4, and 5 designs, with
  validation before replacing the current project. Opening is undoable.
- Undo/Redo supports dimensions, tray operations, products, images, fabrication,
  and view settings. Use Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl+Y. Continuous edits
  in one input and individual dimension drags are grouped into one undo step.
  History is session-only and retains the last 40 steps.
- Click a floor, wall, or product in 3D to select its tray. Selection also updates
  the sidebar, 2D editing handles, product assignment selector, and flat parts.

## Products

Create a product with width, height, thickness, gap, and quantity (0 fills the
tray), then choose a tray and click **Auto-fill tray with this product**. Assignments apply
to individual trays even when the tray originally belongs to a repeated group.
Editing a product updates every tray using it.

### Interactive shelf stocking

The product palette beside the 3D preview supports mouse, pen, and touch:

- Drag a card onto any shelf to place one item. A translucent preview and shelf
  highlight show the destination; red means the item does not fit at that spot.
- Click a card (or press Enter) to add one item in the first available space on
  the selected tray. Mix different products on the same shelf.
- Drag placed products within a shelf or onto a different shelf. Click an item
  to select it. Click its palette card to add another copy.
- Held products use the shelf's camera and real dimensions, matching the depth
  and position of their drop target, with a gentle dangling motion.
  The browser's reduced-motion preference disables swinging.
- Drag an item to the trash icon in the bottom-right corner of the 3D viewer,
  shown only while holding
  a product. Dropping a new, unplaced product there cancels placement. Or press Delete/
  Backspace when not typing in a field. Removal affects one item and is undoable.
- Products snap beside neighbours, to aligned edges, and to the slots used
  when clicking a palette card. Hold Shift during a drag to bypass snapping.
- Left-drag products to move them or empty space to orbit. Middle-drag orbits
  anywhere; right-drag pans; scroll zooms. Shift-left-drag also pans and
  Alt-left-drag orbits over products. Two-finger gestures starting on empty
  space support pan and pinch zoom. **Reset camera** restores the framing.
- Esc, pointer cancellation, and leaving the browser window cancel a drag.
  Out-of-bounds and overlapping drops leave the design unchanged.

Moving an auto-filled product converts only its tray to individual placements.
Auto-fill replaces a mixed arrangement, and Clear removes all items on that tray.
Placements are saved in version 5 project JSON, autosaved, and undoable as single
actions. Repeated tray groups are split only when an individual tray changes.
Existing layouts that become invalid after dimension edits produce fit warnings.
Up to 500 items per tray can be arranged manually; reduce larger auto-fill
quantities before moving them. The 3D preview still draws at most 500 items total.

Use **Export selected product** or **Export all products** to save reusable
`.products.json` files with dimensions, packing settings, and images. In another
design, choose **Import products**, then place an imported product on a tray.
Imports add independent copies with new IDs; matching names receive a numbered
suffix and existing assignments stay intact. Imports support Undo/Redo and
autosave. Product files may be up to 8 MB, with a maximum of 50 products per design.

Products stand upright relative to the floor and fill from the rear forward.
Packing accounts for the inside side-panel width and a 1 mm border at each end.
PNG, JPEG, and WebP images appear on the front face without stretching; images
are resized to at most 768 pixels and kept locally in project data. Uploaded
source files may be up to 12 MB. Up to 500 objects are drawn across the preview.
Products hide during assembly animation. Packing is a visual estimate, not a
physical stability or strength simulation.

## Fabrication

- SVG and DXF contain closed cutting paths for every physical part, including
  two side panels. SVG has explicit mm sizing; DXF declares millimetres.
- Enter the full kerf width. The export offsets by half that amount into waste,
  expanding outer boundaries and contracting holes. Use 0 when CAM applies kerf.
- Optional circular relief removes circles centred on internal corners. Relief
  changes the nominal contours and the 3D preview; kerf changes export paths only.
  Circles and round joins are approximated by short line segments.
- The layout uses rows on a free-size sheet, not automatic stock nesting.
  Labels are preview-only; the separate CSV contains the part names and sizes.
- Red structural checks prevent cutting export; product-fit errors do not.
  Checks cover disconnected contours, low joint engagement, excessive spacing,
  and long-part intersections. They do not certify tool clearance, assembly travel,
  minimum web thickness everywhere, load capacity, or manufacturing suitability.
- Exports are 2D profiles, not STL files or printer/cutter machine instructions.

## Tests

Run `node --test tests/geometry.test.cjs`.
The tests use the actual embedded geometry engine and vendored Clipper library.
`tests/sample-product.png` and `tests/legacy-project.json` are UI test fixtures.

Clipper is pinned to npm `clipper-lib@6.4.2`; its license and provenance are in
`vendor/`. Three.js and polygon-clipping retain their existing embedded versions.
