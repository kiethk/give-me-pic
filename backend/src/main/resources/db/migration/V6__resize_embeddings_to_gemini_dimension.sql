-- Embeddings are derived data and can be regenerated with the confirmed Gemini dimension.
DELETE FROM chunk_embeddings;

ALTER TABLE chunk_embeddings
    ALTER COLUMN embedding TYPE vector(768)
    USING embedding::vector(768);
