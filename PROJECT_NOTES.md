# RoomSpace AI - Project Notes

## Current State (Completed)

### Core Features
- PHP + MySQL backend with session-based auth
- Login/Register system (dark theme UI)
- Dashboard: list user designs, browse room templates
- 3D room editor powered by THREE.js
- Drag-and-drop / click-to-place furniture from sidebar
- Snap-to-grid, rotate (R key), delete (DEL), undo/redo
- Save/Load/Delete designs to MySQL
- Properties panel, grid resize, floor color picker
- 5 room templates, 25 furniture assets

### Tech Stack
- PHP 8 + MySQL (XAMPP)
- THREE.js (self-hosted)
- Vanilla JS (no framework)
- Dark theme CSS

### Running At
- URL: http://localhost/room-designer/
- Htdocs: C:\xampp\htdocs\room-designer\

---

## TODO / Improvements

### High Priority
- [ ] Replace placeholder SVG sprites with real 3D assets / better sprites (Kenney Furniture Kit, CC0)
- [ ] Thumbnail generation on save
- [ ] Image export UI

### Medium Priority
- [ ] Collision detection
- [ ] Wall / door / window tools
- [ ] Multi-select, free rotation
- [ ] Better floor textures
- [ ] Responsive design

### Low Priority
- [ ] Real-time collaboration
- [ ] Public share page
- [ ] PDF export, measurements, search/filter
- [ ] Theme toggle, shortcuts help, onboarding
