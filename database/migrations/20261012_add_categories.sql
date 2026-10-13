ALTER TABLE productos MODIFY COLUMN categoria VARCHAR(80) NULL;

CREATE TABLE IF NOT EXISTS categorias (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    disponible TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categorias_nombre (nombre),
    UNIQUE KEY uq_categorias_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO categorias (nombre, slug, disponible) VALUES
    ('Comidas', 'comidas', 1),
    ('Bebidas', 'bebidas', 1),
    ('Panadería', 'panaderia', 1),
    ('Aseo', 'aseo', 1),
    ('Hogar', 'hogar', 1);
