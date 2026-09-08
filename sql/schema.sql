-- =====================================================================
-- Room Designer - Database Schema
-- Target: MySQL 8.0+ / MariaDB 10.5+
-- Charset: utf8mb4
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Drop tables (clean rewrite)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS designs;
DROP TABLE IF EXISTS templates;
DROP TABLE IF EXISTS room_templates;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS users;

-- =====================================================================
-- USERS
-- =====================================================================
CREATE TABLE users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username        VARCHAR(50)  NOT NULL,
    email           VARCHAR(100) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    verified        TINYINT(1)   NOT NULL DEFAULT 0,
    failed_attempts INT          NOT NULL DEFAULT 0,
    locked_until    DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email    (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- ASSETS
-- =====================================================================
CREATE TABLE assets (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(80)  NOT NULL,
    category     VARCHAR(40)  NOT NULL,
    image_path   VARCHAR(255) NOT NULL,
    grid_width   INT          NOT NULL DEFAULT 1,
    grid_height  INT          NOT NULL DEFAULT 1,
    depth_m      DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    height_m     DECIMAL(5,2) NOT NULL DEFAULT 0.80,
    base_color   VARCHAR(7)   NOT NULL DEFAULT '#cccccc',
    sort_order   INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_assets_category (category),
    KEY idx_assets_sort     (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- TEMPLATES
-- =====================================================================
-- Shared templates carry user_id = NULL and are visible to every user.
CREATE TABLE templates (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NULL,
    name          VARCHAR(120) NOT NULL,
    description   VARCHAR(500) NOT NULL DEFAULT '',
    thumbnail     VARCHAR(255) NOT NULL DEFAULT '',
    grid_width    INT          NOT NULL DEFAULT 12,
    grid_height   INT          NOT NULL DEFAULT 12,
    floor_color   VARCHAR(7)   NOT NULL DEFAULT '#e8e0d4',
    template_data LONGTEXT     NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_templates_name (name),
    CONSTRAINT fk_templates_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- DESIGNS
-- =====================================================================
CREATE TABLE designs (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        BIGINT UNSIGNED NOT NULL,
    name           VARCHAR(120) NOT NULL,
    template_id    BIGINT UNSIGNED NULL,
    grid_width     INT          NOT NULL DEFAULT 12,
    grid_height    INT          NOT NULL DEFAULT 12,
    floor_color    VARCHAR(7)   NOT NULL DEFAULT '#e8e0d4',
    floor_material ENUM('solid','wood','tile','concrete') NOT NULL DEFAULT 'solid',
    design_data    JSON         NOT NULL,
    thumbnail      LONGTEXT     NULL,
    is_public      TINYINT(1)   NOT NULL DEFAULT 0,
    share_token    VARCHAR(64)  NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_designs_share_token (share_token),
    KEY idx_designs_user     (user_id),
    KEY idx_designs_template (template_id),
    KEY idx_designs_public   (is_public),
    CONSTRAINT fk_designs_user
        FOREIGN KEY (user_id)     REFERENCES users (id)     ON DELETE CASCADE,
    CONSTRAINT fk_designs_template
        FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- LOGIN ATTEMPTS
-- =====================================================================
CREATE TABLE login_attempts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip_address   VARCHAR(45)  NOT NULL,
    username     VARCHAR(100) NOT NULL DEFAULT '',
    attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success      TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_login_ip       (ip_address),
    KEY idx_login_username (username),
    KEY idx_login_time     (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SEED DATA: 25 ASSETS (5 categories x 5 items)
-- Realistic dimensions in meters.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Seating (5)
-- ---------------------------------------------------------------------
INSERT INTO assets (name, category, image_path, grid_width, grid_height, depth_m, height_m, base_color, sort_order) VALUES
('Office Chair',    'seating', 'assets/sprites/chairs/office-chair.svg',   1, 1, 0.50, 0.90, '#2c3e50', 10),
('Armchair',        'seating', 'assets/sprites/chairs/armchair.svg',       1, 1, 0.80, 0.90, '#8b4513', 20),
('Sofa (2-seat)',   'seating', 'assets/sprites/beds/couch.svg',            2, 1, 0.90, 0.85, '#556b2f', 30),
('Sofa (3-seat)',   'seating', 'assets/sprites/beds/sofa-3-seat.svg',      3, 1, 0.90, 0.85, '#556b2f', 40),
('Dining Chair',    'seating', 'assets/sprites/chairs/dining-chair.svg',   1, 1, 0.45, 0.95, '#a0522d', 50);

-- ---------------------------------------------------------------------
-- Beds (5)
-- ---------------------------------------------------------------------
INSERT INTO assets (name, category, image_path, grid_width, grid_height, depth_m, height_m, base_color, sort_order) VALUES
('Single Bed',      'beds',    'assets/sprites/beds/single-bed.svg',        1, 2, 2.00, 0.40, '#deb887', 20),
('Double Bed',      'beds',    'assets/sprites/beds/double-bed.svg',        2, 2, 2.00, 0.40, '#deb887', 30),
('Queen Bed',       'beds',    'assets/sprites/beds/queen-bed.svg',         2, 2, 2.00, 0.40, '#deb887', 40),
('King Bed',        'beds',    'assets/sprites/beds/king-bed.svg',          2, 2, 2.00, 0.40, '#deb887', 50),
('Bunk Bed',        'beds',    'assets/sprites/beds/bunk-bed.svg',          1, 2, 2.00, 1.60, '#cd853f', 60);

-- ---------------------------------------------------------------------
-- Tables (5)
-- ---------------------------------------------------------------------
INSERT INTO assets (name, category, image_path, grid_width, grid_height, depth_m, height_m, base_color, sort_order) VALUES
('Coffee Table',    'tables',  'assets/sprites/tables/coffee-table.svg',    2, 1, 0.60, 0.40, '#8b7355', 10),
('Dining Table 4',  'tables',  'assets/sprites/tables/dining-table.svg',    2, 2, 0.80, 0.75, '#a0522d', 20),
('Dining Table 6',  'tables',  'assets/sprites/tables/dining-table-6.svg', 3, 2, 0.90, 0.75, '#a0522d', 30),
('Side Table',      'tables',  'assets/sprites/tables/side-table.svg',      1, 1, 0.50, 0.55, '#8b7355', 40),
('Desk',            'tables',  'assets/sprites/tables/desk.svg',            2, 1, 0.60, 0.75, '#654321', 50);

-- ---------------------------------------------------------------------
-- Storage (5)
-- ---------------------------------------------------------------------
INSERT INTO assets (name, category, image_path, grid_width, grid_height, depth_m, height_m, base_color, sort_order) VALUES
('Wardrobe',        'storage', 'assets/sprites/shelves/wardrobe.svg',       3, 1, 0.60, 2.00, '#5d4037', 10),
('Dresser',         'storage', 'assets/sprites/shelves/dresser.svg',        2, 1, 0.50, 0.90, '#6d4c41', 20),
('Bookshelf',       'storage', 'assets/sprites/shelves/bookshelf.svg',      1, 1, 0.30, 1.80, '#795548', 30),
('Nightstand',      'storage', 'assets/sprites/tables/nightstand.svg',      1, 1, 0.40, 0.55, '#6d4c41', 40),
('Cabinet',         'storage', 'assets/sprites/shelves/cabinet.svg',        2, 1, 0.50, 0.80, '#5d4037', 50);

-- ---------------------------------------------------------------------
-- Decor (5)
-- ---------------------------------------------------------------------
INSERT INTO assets (name, category, image_path, grid_width, grid_height, depth_m, height_m, base_color, sort_order) VALUES
('Floor Lamp',      'decor',   'assets/sprites/decor/floor-lamp.svg',       1, 1, 0.30, 1.60, '#ffd700', 10),
('Rug Medium',      'decor',   'assets/sprites/decor/rug.svg',              3, 2, 1.50, 0.02, '#bdb76b', 20),
('Plant Large',     'decor',   'assets/sprites/decor/plant-pot.svg',        1, 1, 0.60, 1.50, '#228b22', 30),
('TV Stand',        'decor',   'assets/sprites/shelves/tv-stand.svg',       3, 1, 0.40, 0.50, '#3e2723', 40),
('Mirror',          'decor',   'assets/sprites/decor/picture-frame.svg',    1, 1, 0.05, 1.20, '#c0c0c0', 50);

-- =====================================================================
-- SEED DATA: 5 SHARED TEMPLATES (user_id NULL = visible to everyone)
-- =====================================================================
INSERT INTO templates (user_id, name, description, thumbnail, grid_width, grid_height, floor_color, template_data) VALUES
(NULL, 'Modern Living Room', 'A modern, airy living room layout.', 'assets/sprites/covers/living.svg', 12, 12, '#e8e0d4', '{"rooms":[{"type":"living","items":[{"assetId":4,"x":-2,"z":3.5,"rotation":0},{"assetId":2,"x":2.5,"z":3.2,"rotation":0.6},{"assetId":11,"x":0,"z":0.5,"rotation":0},{"assetId":22,"x":0,"z":0.2,"rotation":0},{"assetId":24,"x":0,"z":-3.8,"rotation":0},{"assetId":21,"x":3.4,"z":2.8,"rotation":0},{"assetId":23,"x":-3.6,"z":2.6,"rotation":0},{"assetId":18,"x":-3.4,"z":-3.4,"rotation":0}]}]}'),
(NULL, 'Cozy Bedroom',       'A warm and cozy bedroom layout.',     'assets/sprites/covers/bedroom.svg', 12, 12, '#f5f0e8', '{"rooms":[{"type":"bedroom","items":[{"assetId":7,"x":0,"z":2.4,"rotation":0},{"assetId":19,"x":3.2,"z":2.8,"rotation":0},{"assetId":16,"x":-3.6,"z":-2.4,"rotation":0},{"assetId":22,"x":0,"z":-0.2,"rotation":0},{"assetId":25,"x":3.4,"z":-3.2,"rotation":0},{"assetId":23,"x":-2.2,"z":2.6,"rotation":0},{"assetId":21,"x":2.6,"z":-1.4,"rotation":0}]}]}'),
(NULL, 'Home Office',        'A productive home office setup.',     'assets/sprites/covers/office.svg', 12, 12, '#e0e0e0', '{"rooms":[{"type":"office","items":[{"assetId":15,"x":0,"z":2.6,"rotation":0},{"assetId":1,"x":0,"z":0.9,"rotation":3.14},{"assetId":18,"x":-3.6,"z":-3.2,"rotation":0},{"assetId":20,"x":3.4,"z":-2.8,"rotation":0},{"assetId":23,"x":3,"z":2.2,"rotation":0},{"assetId":21,"x":-2.8,"z":2.2,"rotation":0}]}]}'),
(NULL, 'Bakery Shop',        'A charming bakery shopfront.',        'assets/sprites/covers/bakery.svg', 12, 12, '#fff5e6', '{"rooms":[{"type":"bakery","items":[{"assetId":12,"x":-0.8,"z":-0.6,"rotation":0},{"assetId":5,"x":-0.8,"z":1.4,"rotation":3.14},{"assetId":5,"x":-0.8,"z":-2.6,"rotation":0},{"assetId":5,"x":1.6,"z":-0.6,"rotation":-1.57},{"assetId":5,"x":-3.2,"z":-0.6,"rotation":1.57},{"assetId":20,"x":3.2,"z":2.6,"rotation":0},{"assetId":18,"x":-3.4,"z":2.4,"rotation":0},{"assetId":23,"x":2.6,"z":-2.8,"rotation":0},{"assetId":22,"x":0,"z":0.9,"rotation":0}]}]}'),
(NULL, 'Restaurant',         'A bright restaurant dining space.',   'assets/sprites/covers/restaurant.svg', 12, 12, '#d4f1f4', '{"rooms":[{"type":"restaurant","items":[{"assetId":13,"x":0,"z":0,"rotation":0},{"assetId":5,"x":0,"z":2.3,"rotation":3.14},{"assetId":5,"x":0,"z":-2.3,"rotation":0},{"assetId":5,"x":2.3,"z":0,"rotation":-1.57},{"assetId":5,"x":-2.3,"z":0,"rotation":1.57},{"assetId":22,"x":0,"z":0,"rotation":0},{"assetId":21,"x":3.4,"z":3.2,"rotation":0},{"assetId":23,"x":-3.4,"z":-3.2,"rotation":0},{"assetId":14,"x":3.2,"z":-2.8,"rotation":0}]}]}');

-- =====================================================================
-- Done.
-- =====================================================================