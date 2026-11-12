ALTER TABLE pedidos
    ADD COLUMN cliente_email VARCHAR(254) NULL AFTER cliente,
    ADD INDEX idx_pedidos_cliente_email (cliente_email);
