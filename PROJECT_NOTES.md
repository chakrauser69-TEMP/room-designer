# Room Designer - Project Notes

## Current State (Completed)

### Core Features
- PHP + MySQL backend with session-based auth
- Login/Register system (dark theme UI)
- Dashboard: list user designs, browse room templates
- Isometric room editor powered by Konva.js
- Drag-and-drop furniture from sidebar onto canvas
- Click-to-place furniture from asset library
- Snap-to-grid on drop
- Rotate objects with R key (45-degree increments)
- Delete with DEL key
- Mouse wheel zoom (0.2x-5x, clamped)
- Space+drag or middle-click to pan workspace
- Undo/Redo (Ctrl+Z / Ctrl+Y), 50-state history
- Save/Load/Delete designs to MySQL
- Properties panel for selected objects
- Grid resize + floor color picker
- 5 room templates (Studio, Living Room, Bedroom, Kitchen, Home Office)
- 25 furniture assets across 5 categories
- 3D isometric rendering for all furniture types

### Tech Stack
- PHP 8 + MySQL (XAMPP)
- Konva.js 9 (canvas rendering, drag-drop, events)
- Vanilla JS (no framework)
- Dark theme CSS

### File Structure
```
room-designer/
  index.php              - Login page
  register.php           - Registration page
  dashboard.php          - My designs + templates
  editor.php             - Main room editor
  api/
    auth.php             - Login/register/logout
    designs.php          - CRUD for designs
    assets.php           - Furniture catalog
    templates.php        - Room templates
  includes/
    db.php               - PDO MySQL connection
    auth.php             - Session management
  assets/
    css/style.css        - Dark theme styles
    js/editor.js         - Konva.js canvas logic (~1100 lines)
    sprites/             - Placeholder SVG furniture sprites
  sql/
    schema.sql           - Full DB schema + seed data
```

### Database
- `users` - id, username, email, password_hash
- `designs` - id, user_id, name, template_id, grid dims, floor_color, design_data (JSON), thumbnail
- `room_templates` - id, name, description, grid dims, floor_color, template_data (JSON)
- `assets` - id, name, category, image_path, grid dims, sort_order

### Running At
- Apache: port 80
- MySQL: port 3306
- URL: http://localhost/room-designer/
- Htdocs copy: C:\xampp\htdocs\room-designer\

---

## TODO / Improvements for Next Sessions

### High Priority
- [ ] Replace placeholder SVG sprites with real assets (download Kenney Furniture Kit - CC0 license from https://opengameart.org/content/furniture-kit)
- [ ] Add thumbnail generation on save (capture canvas as PNG, store in designs table)
- [ ] Add image export (PNG/SVG export of the canvas)
- [ ] Fix template asset_id references in schema.sql seed data (IDs may not match after fresh install)

### Medium Priority
- [ ] Add collision detection (prevent placing furniture on top of each other)
- [ ] Add wall drawing tool (draw room walls on the grid)
- [ ] Add door/window placement on walls
- [ ] Add object layers ordering (bring to front / send to back)
- [ ] Add multi-select (Shift+click to select multiple objects)
- [ ] Add copy/paste objects (Ctrl+C / Ctrl+V)
- [ ] Add snap angle rotation (already has 45-degree steps, could add free rotation toggle)
- [ ] Add floor material/texture picker (wood, tile, carpet patterns)
- [ ] Responsive design for tablet/mobile

### Low Priority
- [ ] Add real-time collaboration (WebSocket-based)
- [ ] Add sharing via public link (generate shareable URL)
- [ ] Add PDF export of designs
- [ ] Add room measurement labels (show dimensions in feet/meters)
- [ ] Add furniture dimension labels on hover
- [ ] Add search/filter in asset sidebar
- [ ] Add dark/light theme toggle
- [ ] Add keyboard shortcuts help modal (? key)
- [ ] Add onboarding tutorial for first-time users

### Bugs to Watch
- Konva CDN (unpkg.com) must be accessible for editor to work
- PHP session cookies required for editor.php access (redirects to login otherwise)
- editor.js must NOT contain PHP tags (loaded as static .js file)
- Template seed data asset_ids in schema.sql may need adjustment based on actual insert order

### Deployment Notes
- Copy project folder to htdocs
- Import sql/schema.sql into MySQL
- Edit includes/db.php if MySQL has a password
- Apache + MySQL must be running
